'use strict';

/**
 * @typedef {object} LogData
 * @property {string} type
 * @property {string} entity
 * @property {string} entityId
 * @property {string} [message]
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
	 * Put logs into Firehose
	 *
	 * @static
	 * @param {string} client The client code who created the log
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
			return true;

		if(!Array.isArray(logs))
			logs = [logs];

		try {

			logs = logs.map(log => this.format(this.validate(log, client)));

		} catch(err) {
			return logger.error('Validation Error while creating Trace logs', err);
		}

		return FirehoseInstance.putRecords(logs);
	}

	static shouldAddLogs() {
		// No logs are added for local development
		return getEnv() !== 'local';
	}

	static validate(log, client) {

		try {

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

	static format({ log = {}, userCreated, ...restOfLog }) {

		if(Array.isArray(log))
			log = { data: log };

		const functionName = process.env.JANIS_FUNCTION_NAME;
		const apiRequestLogId = process.env.JANIS_API_REQUEST_LOG_ID;

		return {
			...restOfLog,
			log: JSON.stringify({
				...functionName && { functionName },
				...apiRequestLogId && { apiRequestLogId },
				...log
			}),
			...userCreated !== null && { userCreated },
			dateCreated: new Date().toISOString()
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
