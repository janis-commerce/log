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

const { default: axios } = require('axios');

const { ApiSession } = require('@janiscommerce/api-session');

const { struct } = require('@janiscommerce/superstruct');

const crypto = require('crypto');

const logger = require('lllog')();

const logStruct = require('./log-struct');

const LogError = require('./log-error');

const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');
const LogTracker = require('./log-tracker');

const { getEnv, getTracePrivateFields, hideFieldsFromLog } = require('./helpers/utils');

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
		return ['beta', 'qa', 'prod'].includes(getEnv());
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

		logs = logs.map(log => ({
			...log,
			client: log.client || client
		}));

		if(process.env.JANIS_TRACE_EXTENSION_ENABLED)
			return this.addLogsLocally(logs);

		return this.sendToTrace(logs);
	}

	/**
	 *	Send multiple logs directly to Firehose. If you're implementing a Janis Service, you should be using the add() method
	 *
	 * @param {LogData[]} logs The logs. They must include the `client` property, or they will be ignored
	 * @returns Promise<void>
	 */
	static async sendToTrace(logs) {

		logs = this.getValidatedLogs(logs);

		if(!logs.length)
			return;

		return this.putFirehoseRecords(logs);
	}

	static putFirehoseRecords(formattedLogs) {
		const firehoseInstance = new FirehoseInstance();
		return firehoseInstance.putRecords(formattedLogs);
	}

	static async addLogsLocally(logs) {

		const MAX_LOGS_PER_BATCH = 100;

		for(let offset = 0; offset < logs.length; offset += MAX_LOGS_PER_BATCH) {

			const formattedLogs = this.getValidatedLogs(logs.slice(offset, offset + MAX_LOGS_PER_BATCH));

			try {

				// Local server implemented in Trace Lambda Layer
				await axios.post('http://127.0.0.1:8585/logs', { logs: formattedLogs }, { timeout: 300 });

			} catch(err) {

				// If local server fails, go straight to Firehose
				logger.error(`Failed to save ${logs.length} logs locally. Fallbacking to Firehose.`, err);

				await this.putFirehoseRecords(formattedLogs);
			}

		}

	}

	static getValidatedLogs(logs) {

		return logs.map(log => {

			try {
				return this.format(this.validate(log));
			} catch(err) {
				logger.error('Validation Error while creating Trace logs', err);
				return null;
			}

		}).filter(Boolean);
	}

	static validate(log) {

		try {

			if(log.dateCreated && log.dateCreated instanceof Date)
				log.dateCreated = log.dateCreated.toISOString();

			const Struct = struct.partial(logStruct, {
				id: crypto.randomUUID(),
				service: this.serviceName
			});

			return Struct(log);

		} catch(err) {
			throw new LogError(err.message, LogError.codes.INVALID_LOG);
		}
	}

	static format({ log = {}, userCreated, dateCreated, ...restOfLog }) {

		if(typeof log === 'string')
			log = JSON.parse(log);

		if(Array.isArray(log))
			log = { data: log };

		if(getTracePrivateFields())
			log = hideFieldsFromLog(log, getTracePrivateFields());

		const functionName = process.env.JANIS_FUNCTION_NAME;
		const apiRequestLogId = process.env.JANIS_API_REQUEST_LOG_ID;

		log = {
			...functionName && { functionName },
			...apiRequestLogId && { apiRequestLogId },
			...log
		};

		return {
			...restOfLog,
			...Object.keys(log).length && { log: JSON.stringify(log) },
			...userCreated !== null && { userCreated },
			dateCreated: dateCreated || new Date().toISOString()
		};
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
