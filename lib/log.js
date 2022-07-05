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

const EventEmitter = require('events');

const { arrayChunk } = require('./helpers/utils');

const logStruct = require('./log-struct');

const LogError = require('./log-error');

const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');
const LogTracker = require('./log-tracker');

const MAX_ATTEMPTS = 3;
const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';
const LOGS_BATCH_LIMIT = 500;

const emitter = new EventEmitter();

module.exports = class Log {

	/**
	 * @static
	 * @returns {string} The service name as defined in the env var JANIS_SERVICE_NAME
	 */
	static get serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	/**
	 * @static
	 * @returns {string} The environment name as defined in the env var JANIS_ENV
	 */
	static get env() {
		return process.env.JANIS_ENV;
	}

	/**
	 * @static
	 * @returns{object<string, string>} A key-value object of environments and their friendly name
	 */
	static get envs() {

		return {
			local: 'Local',
			beta: 'Beta',
			qa: 'QA',
			prod: 'Prod'
		};
	}

	/**
	 * @static
	 * @returns {string} The AWS CloudWatch Logs stream name based on current env
	 */
	static get deliveryStreamName() {

		if(!this._deliveryStreamName) {

			if(!this.env || !this.envs[this.env])
				throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);

			this._deliveryStreamName = `${DELIVERY_STREAM_PREFIX}${this.envs[this.env]}`;
		}

		return this._deliveryStreamName;
	}

	/**
	 * Sets a callback for the specified event name
	 *
	 * @static
	 * @param {string} event The event name
	 * @param {LogEventEmitterCallback} callback The event callback
	 * @example
	 * Log.on('create-error', (logs, err) => {...});
	 */
	static on(event, callback) {
		emitter.on(event, callback);
	}

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

		// For local development
		if(this.env === 'local')
			return true;

		if(!Array.isArray(logs))
			logs = [logs];

		let validLogs;

		try {

			validLogs = logs.map(log => this.format(this.validate(log, client)));

		} catch(err) {
			return emitter.emit('create-error', logs, err);
		}

		const logsBatches = this.createLogsBatches(validLogs);
		return this._add(logsBatches);
	}

	static validate(log, client) {

		try {

			const Struct = struct.partial(logStruct, {
				id: UUID(),
				service: this.serviceName,
				client
			});

			return Struct(log);

		} catch(err) {
			throw new LogError(err.message, LogError.codes.INVALID_LOG);
		}
	}

	static format({ log, userCreated, ...restOfLog }) {

		if(log)
			log = JSON.stringify(log);

		return {
			...restOfLog,
			log,
			...userCreated !== null && { userCreated },
			dateCreated: new Date().toISOString()
		};
	}

	/**
	 * @private
	 * @static
	 * @param {Array<LogData>} logs
	 * @returns {Array<Array<LogData>>}
	 */
	static createLogsBatches(logs) {
		return arrayChunk(logs, LOGS_BATCH_LIMIT);
	}

	/**
	 * @private
	 * @static
	 * @param {Array<Array<LogData>>} logsBatches
	 * @param {number} [attempts = 0]
	 * @returns
	 */
	static async _add(logsBatches, attempts = 0) {

		try {

			const firehose = await FirehoseInstance.getFirehoseInstance();

			await Promise.all(
				logsBatches.map(logs => firehose.putRecordBatch({
					DeliveryStreamName: this.deliveryStreamName,
					Records: logs.map(log => ({ Data: Buffer.from(JSON.stringify(log)) }))
				}))
			);

		} catch(err) {

			attempts++;

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', logsBatches,
					new LogError(`Unable to put the logs into firehose, max attempts reached: ${err.message}`, LogError.codes.FIREHOSE_ERROR));
			}

			return this._add(logsBatches, attempts);
		}
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
};
