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
const { default: axios } = require('axios');
const crypto = require('crypto');
const logger = require('lllog')();

const logValidator = require('./log-validator');

const LogError = require('./log-error');

const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');
const LogTracker = require('./log-tracker');

const { getTracePrivateFields, hideFieldsFromLog } = require('./helpers/utils');

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

		if(!Array.isArray(logs))
			logs = [logs];

		this.addMissingDateCreated(logs);

		return this.shouldAddLogsLocally(logs)
			? this.addLogsLocally(logs, client)
			: this.sendToTrace(logs, client);
	}

	static addMissingDateCreated(logs) {

		const now = new Date();

		return logs.map(log => {

			if(!log.dateCreated)
				log.dateCreated = now;

			return log;
		});
	}

	static shouldAddLogsLocally(logs) {
		return process.env.JANIS_TRACE_EXTENSION_ENABLED
			&& logs.length < MAX_LOGS_PER_LOCAL_BATCH;
	}

	/**
	 *	Send multiple logs directly to Firehose. If you're implementing a Janis Service, you should be using the add() method
	 *
	 * @param {LogData[]} logs The logs. They must include the `client` property, or they will be ignored
	 * @returns Promise<void>
	 */
	static async sendToTrace(logs, client) {

		logs = this.getValidatedLogs(logs, client);

		if(logs.length) {
			const firehoseInstance = new FirehoseInstance();
			return firehoseInstance.putRecords(logs);
		}
	}

	static async addLogsLocally(logs, client) {

		try {

			// Local server implemented in Trace Lambda Layer
			await axios.post('http://127.0.0.1:8585/logs', { logs }, { timeout: 300 });

		} catch(err) {

			// If local server fails, go straight to Firehose
			logger.error(`Failed to save ${logs.length} logs locally. Fallbacking to Firehose.`, err);

			await this.sendToTrace(logs, client);
		}
	}

	static getValidatedLogs(logs, client) {

		const privateFields = getTracePrivateFields();

		return logs.map(log => {

			try {
				return this.format(this.validate(log, client), privateFields);
			} catch(err) {
				logger.error('Validation Error while creating Trace logs', err);
				return null;
			}

		}).filter(Boolean);
	}

	static validate(log, client) {

		if(log.dateCreated && typeof log.dateCreated === 'string')
			log.dateCreated = new Date(log.dateCreated);

		if(!log.id)
			log.id = crypto.randomUUID();

		if(!log.service)
			log.service = this.serviceName;

		if(!log.client)
			log.client = client;

		const result = logValidator(log);

		if(result !== true)
			throw new LogError(result[0].message, LogError.codes.INVALID_LOG);

		return log;
	}

	static format({ log = {}, userCreated, dateCreated, ...restOfLog }, privateFields) {

		if(typeof log === 'string')
			log = JSON.parse(log);

		if(Array.isArray(log))
			log = { data: log };

		if(privateFields)
			log = hideFieldsFromLog(log, privateFields);

		if(!log.functionName && process.env.JANIS_FUNCTION_NAME)
			log.functionName = process.env.JANIS_FUNCTION_NAME;

		if(!log.apiRequestLogId && process.env.JANIS_API_REQUEST_LOG_ID)
			log.apiRequestLogId = process.env.JANIS_API_REQUEST_LOG_ID;

		if(Object.keys(log).length)
			restOfLog.log = JSON.stringify(log);

		if(userCreated)
			restOfLog.userCreated = userCreated;

		const now = new Date().getTime();
		restOfLog.sendToTraceDelay = Math.ceil((now - dateCreated.getTime()) / 1000);

		restOfLog.dateCreated = dateCreated.toISOString();

		return restOfLog;
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
