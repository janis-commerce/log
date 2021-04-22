'use strict';

const EventEmitter = require('events');
const { arrayChunk } = require('./helpers/utils');
const Validator = require('./helpers/validator');
const LogError = require('./log-error');
const serverlessConfiguration = require('./serverless-configuration');
const FirehoseInstance = require('./firehose-instance');


const MAX_ATTEMPTS = 3;
const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';
const LOGS_BATCH_LIMIT = 500;


const emitter = new EventEmitter();

class Log {

	static get serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get env() {
		return process.env.JANIS_ENV;
	}

	static get envs() {

		return {
			local: 'Local',
			beta: 'Beta',
			qa: 'QA',
			prod: 'Prod'
		};
	}

	static get deliveryStreamName() {

		if(!this._deliveryStreamName)
			this._deliveryStreamName = `${DELIVERY_STREAM_PREFIX}${this.formattedEnv}`;

		return this._deliveryStreamName;
	}

	static get formattedEnv() {

		if(this.env && this.envs[this.env])
			return this.envs[this.env];

		throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);
	}

	/**
	 * Sets a callback for the specified event name
	 * @param {String} event The event name
	 * @param {Function} callback The event callback
	 * @example
	 * on('create-error', (log, err) => {...});
	 */
	static on(event, callback) {
		emitter.on(event, callback);
	}

	/**
	 * Put logs into Firehose
	 * @param {String} client The client code who created the log
	 * @param {Object|Array.<object>} logs The log object or log objects array
	 * @example
	 * add('some-client', {
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

			validLogs = logs.map(log => this.validateLog(log, client));

		} catch(err) {
			return emitter.emit('create-error', logs, err);
		}

		const logsBatches = this.createLogsBatches(validLogs);
		return this._add(logsBatches);
	}

	static validateLog(log, client) {
		return Validator.validate(log, client, this.serviceName);
	}

	static createLogsBatches(logs) {
		return arrayChunk(logs, LOGS_BATCH_LIMIT);
	}

	static async _add(logsBatches, attempts = 0) {

		try {

			const firehose = await FirehoseInstance.getFirehoseInstance();

			await Promise.all(
				logsBatches.map(logs => firehose.putRecordBatch(
					{
						DeliveryStreamName: this.deliveryStreamName,
						Records: logs.map(log => ({
							Data: Buffer.from(JSON.stringify(log))
						}))
					}
				))
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
	 * Returns the sls helpers needed for serverles configuration.
	 *
	 * @readonly
	 * @static
	 * @memberof Log
	 */
	static get serverlessConfiguration() {
		return serverlessConfiguration();
	}
}

module.exports = Log;
