'use strict';

/**
 * @typedef {object} LogData
 * @property {string} [id]
 * @property {string} [service]
 * @property {string} entity
 * @property {string} entityId
 * @property {string} type
 * @property {string} [message]
 * @property {string} [client]
 * @property {string} [userCreated]
 * @property {Date} [dateCreated]
 * @property {object} log
 */

/**
 * This callback is displayed as part of the Requester class.
 * @callback LogEventEmitterCallback
 * @param {Array<LogData>} failedLogs
 * @param {LogError} error
 * @returns {void}
 */

const { ApiSession } = require('@janiscommerce/api-session');
const Events = require('@janiscommerce/events');

const { default: axios } = require('axios');
const crypto = require('crypto');
const logger = require('lllog')();

const logValidator = require('./log-validator');

const LogError = require('./log-error');

const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');
const LogTracker = require('./log-tracker');

const { getTracePrivateFields, hideFieldsFromLog } = require('./helpers/utils');
const { shouldAddEndedListener, endedListenerWasAdded } = require('./helpers/events');

const MAX_LOGS_PER_LOCAL_BATCH = 100;

module.exports = class Log {

	/**
	 * Returns the sls helpers needed for serverless configuration.
	 *
	 * @static
	 * @returns {Array}
	 */
	static get serverlessConfiguration() {
		return serverlessConfiguration();
	}

	static get serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static shouldAddLogs() {
		return ['beta', 'qa', 'prod'].includes(process.env.JANIS_ENV);
	}

	/**
	 * Send logs to Local extension server or Firehose, based on JANIS_TRACE_EXTENSION_ENABLED env var
	 *
	 * @static
	 * @param {string} client The client code who created the log. If a log contains the field client, this param will be overridden, allowing to insert logs from multiple clients together.
	 * @param {LogData|Array.<LogData>} logs The log object or log objects array
	 * @returns {Promise<void>}
	 *
	 * @example
	 * Log.add('some-client', {
	 * 	type: 'some-type',
	 * 	entity: 'some-entity',
	 * 	entityId: 'some-entityId',
	 * 	message: 'some-message',
	 * 	log: {
	 * 		some: 'log'
	 * 	}
	 * });
	 */
	static async add(client, logs) {

		if(!this.shouldAddLogs())
			return;

		this.start();

		if(!Array.isArray(logs))
			logs = [logs];

		logs = this.getValidatedLogs(logs, client);

		if(!logs.length)
			return;

		return this.shouldAddLogsLocally(logs)
			? this.addLogsLocally(logs)
			: this.sendToTrace(logs);
	}

	static start() {

		// this method is called in janiscommerce packages handlers to ensure end layer extension (even when no logs loaded in function)

		if(this.traceExtensionIsEnabled() && shouldAddEndedListener()) {
			Events.on('janiscommerce.ended', this.flushLogsOnEnded);
			endedListenerWasAdded();
		}
	}

	static getValidatedLogs(logs, client) {

		const privateFields = getTracePrivateFields();

		return logs.map(log => {

			try {

				log = this.preFormatLog(log, client, privateFields);

				const result = logValidator(log);

				if(result !== true)
					throw new LogError(result[0].message, LogError.codes.INVALID_LOG);

				return log;

			} catch(err) {
				logger.error(`Validation Error while creating Trace logs - ${err.message}`);
				return null;
			}

		}).filter(Boolean);
	}

	static preFormatLog({ log, ...logObject }, client, privateFields) {

		const now = new Date();

		if(!logObject.id)
			logObject.id = crypto.randomUUID();

		if(!logObject.service)
			logObject.service = this.serviceName;

		if(!logObject.client)
			logObject.client = client;

		if(!logObject.dateCreated)
			logObject.dateCreated = now;
		else if(typeof logObject.dateCreated === 'string')
			logObject.dateCreated = new Date(logObject.dateCreated);

		let logData = log || {};

		if(typeof logData === 'string')
			logData = JSON.parse(logData);

		if(Array.isArray(logData))
			logData = { data: logData };
		else
			logData = { ...log };

		if(!logData.functionName && (process.env.JANIS_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME))
			logData.functionName = (process.env.JANIS_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME);

		if(!logData.apiRequestLogId && process.env.JANIS_API_REQUEST_LOG_ID)
			logData.apiRequestLogId = process.env.JANIS_API_REQUEST_LOG_ID;

		if(privateFields)
			logData = hideFieldsFromLog(logData, privateFields);

		if(Object.keys(logData).length)
			logObject.log = JSON.stringify(logData);

		return logObject;
	}

	static shouldAddLogsLocally(logs) {
		return this.traceExtensionIsEnabled()
			&& logs.length < MAX_LOGS_PER_LOCAL_BATCH;
	}

	static traceExtensionIsEnabled() {
		return !!process.env.JANIS_TRACE_EXTENSION_ENABLED;
	}

	static async addLogsLocally(logs) {

		try {

			// Local server implemented in Trace Lambda Layer
			await axios.post('http://127.0.0.1:8585/logs', { logs }, { timeout: 300 });

		} catch(err) {

			// If local server fails, go straight to Firehose
			logger.error(`Failed to save ${logs.length} logs locally. Fallbacking to Firehose.`, err);

			await this.sendToTrace(logs);
		}
	}

	/**
	 *	Send multiple logs directly to Firehose. If you're implementing a Janis Service, you should be using the add() method
	 *
	 * @param {LogData[]} logs The logs. They must include the `client` property, or they will be ignored
	 * @returns Promise<void>
	 */
	static async sendToTrace(logs) {

		if(!logs.length)
			return;

		const firehoseInstance = new FirehoseInstance();

		return firehoseInstance.putRecords(logs.map(this.formatBeforeTrace));
	}

	static async flushLogsOnEnded() {

		try {

			await axios.post('http://127.0.0.1:8585/end');

		} catch(err) {

			logger.error('Failed calling http://127.0.0.1:8585/end', err);
		}
	}

	static formatBeforeTrace({ dateCreated, ...log }) {

		if(!dateCreated)
			dateCreated = new Date();
		else if(typeof dateCreated === 'string')
			dateCreated = new Date(dateCreated);

		const now = new Date().getTime();
		log.sendToTraceDelay = Math.ceil((now - dateCreated.getTime()) / 1000);

		log.dateCreated = dateCreated.toISOString();

		return log;
	}

	/**
	 * @static
	 * @param {string} clientCode The client code who created the log
	 * @returns {import('./log-tracker')}
	 */
	static createTracker(clientCode) {
		const apiSession = new ApiSession({ clientCode });
		return apiSession.getSessionInstance(LogTracker, this);
	}
};
