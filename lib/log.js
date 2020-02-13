'use strict';

const { struct } = require('superstruct');

const EventEmmiter = require('events');
const UUID = require('uuid/v4');

const LogError = require('./log-error');

const Firehose = require('./firehose-wrapper');

const MAX_ATTEMPTS = 3;
const MAX_TIMEOUT = 500;
const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';

const firehose = new Firehose({
	region: process.env.AWS_DEFAULT_REGION,
	httpOptions: { timeout: MAX_TIMEOUT }
});
const emitter = new EventEmmiter();

class Log {

	static get _serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get _env() {
		return process.env.JANIS_ENV;
	}

	static get _envs() {

		return {
			local: 'Local',
			beta: 'Beta',
			qa: 'QA',
			prod: 'Prod'
		};
	}

	static get deliveryStreamName() {

		if(!this._deliveryStreamName)
			this._deliveryStreamName = `${DELIVERY_STREAM_PREFIX}${this._getFormattedEnv()}`;

		return this._deliveryStreamName;
	}

	/**
	 * Put a log into Firehose
	 * @param {String} client The client code who created the log
	 * @param {Object} log The log object
	 * @example
	 * add('some-client', {
	 * 	type: 'some-type',
	 * 	entity: 'some-entity',
	 * 	entityId: 'some-entity_id',
	 * 	message: 'some-message',
	 * 	log: {
	 * 		some: 'log'
	 * 	}
	 * });
	 */
	static async add(client, log) {

		try {

			log = this._validateLog(log, client);

		} catch(err) {
			return emitter.emit('create-error', log, err);
		}

		return this._add(log);
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

	static _validateLog(rawLog, client) {

		const logStruct = struct.partial({
			id: 'string',
			service: 'string',
			entity: 'string',
			entityId: 'string?|number?',
			type: 'string',
			log: 'object?|array?',
			message: 'string?',
			client: 'string',
			userCreated: 'string?'
		}, {
			id: UUID(),
			service: this._serviceName,
			client
		});

		try {

			const validLog = logStruct(rawLog);

			if(validLog.log)
				validLog.log = JSON.stringify(validLog.log);

			return {
				...validLog,
				dateCreated: new Date().toISOString()
			};

		} catch(err) {
			throw new LogError(err.message, LogError.codes.INVALID_LOG);
		}
	}

	static _getFormattedEnv() {

		if(this._env && this._envs[this._env])
			return this._envs[this._env];

		throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);
	}

	static async _add(log, attempts = 0) {

		try {

			await firehose.putRecord({
				DeliveryStreamName: this.deliveryStreamName,
				Record: {
					Data: Buffer.from(JSON.stringify(log))
				}
			});

		} catch(err) {

			attempts++;

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', log,
					new LogError(`Unable to put the log into firehose, max attempts reached: ${err.message}`, LogError.codes.FIREHOSE_ERROR));
			}

			return this._add(log, attempts);
		}
	}
}

module.exports = Log;
