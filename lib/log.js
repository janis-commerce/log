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

const { v4: UUID } = require('uuid');

const logger = require('lllog')();

const logStruct = require('./log-struct');

const LogError = require('./log-error');

const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');
const LogTracker = require('./log-tracker');

const { getEnv, getServiceName } = require('./helpers/utils');

module.exports = class Log {

	/**
	 * Send logs to Local extension server or Firehose, based on JANIS_TRACE_EXTENSION_ENABLED env var
	 *
	 * @static
	 * @param {string} client The client code who created the log. If a log contains the field client, this param will be overriden, allowing to insert logs from multiple clients together.
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

		logs = logs.map(log => {

			try {
				return this.format(this.validate(log, client));
			} catch(err) {
				logger.error('Validation Error while creating Trace logs', err);
				return null;
			}

		}).filter(Boolean);

		if(!logs.length)
			return;

		if(process.env.JANIS_TRACE_EXTENSION_ENABLED)
			return this.addLogsLocally(logs);

		return FirehoseInstance.putRecords(logs);
	}

	/**
	 *	Send multiple logs directly to Firehose. If you're implementing a Janis Service, you should be using the add() method
	 *
	 * @param {LogData[]} logs The logs. They must include the `client` property, or they will be ignored
	 * @returns Promise<void>
	 */
	static async sendToTrace(logs) {

		logs = logs.map(log => {

			try {
				return this.format(this.validate(log));
			} catch(err) {
				logger.error('Validation Error while creating Trace logs', err);
				return null;
			}

		}).filter(Boolean);

		if(!logs.length)
			return;

		return FirehoseInstance.putRecords(logs);
	}

	static async addLogsLocally(logs) {

		try {
			// Local server implemented in Trace Lambda Layer
			await axios.post('http://127.0.0.1:8585/logs', { logs }, {
				timeout: 300
			});
		} catch(err) {
			// If local server fails, go straight to Firehose
			logger.error('Failed to save logs locally. Fallbacking to Firehose.', err);
			return FirehoseInstance.putRecords(logs);
		}
	}

	static shouldAddLogs() {
		return ['beta', 'qa', 'prod'].includes(getEnv());
	}

	static validate(log, client) {

		try {

			if(log.dateCreated && log.dateCreated instanceof Date)
				log.dateCreated = log.dateCreated.toISOString();

			const Struct = struct.partial(logStruct, {
				id: UUID(),
				service: getServiceName(),
				client
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
	 * Returns the sls helpers needed for serverless configuration.
	 *
	 * @static
	 * @returns {Array}
	 */
	static get serverlessConfiguration() {
		return serverlessConfiguration();
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

	/**
	 * Sets a callback for the specified event name
	 *
	 * @static
	 * @deprecated
	 */
	static on() {
		logger.warn('The method on() is deprecated, loggers will be shown when error creating logs');
	}
};
