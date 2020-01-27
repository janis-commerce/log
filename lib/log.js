'use strict';

const { struct } = require('superstruct');

const EventEmmiter = require('events');
const UUID = require('uuid/v4');

const LogError = require('./log-error');

const Firehose = require('./firehose-wrapper');

const MAX_ATTEMPTS = 3;
const MAX_TIMEOUT = 500;
const DELIVERY_STREAM_PREFIX = 'janis-trace-firehose';

const firehose = new Firehose({ httpOptions: { timeout: MAX_TIMEOUT } });
const emitter = new EventEmmiter();

class Log {

	static get deliveryStreamName() {

		if(!this._deliveryStreamName)
			this.setDeliveryStreamName();

		return this._deliveryStreamName;
	}

	static set deliveryStreamName(deliveryStreamName) {
		this._deliveryStreamName = deliveryStreamName;
	}

	static get _serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get _env() {
		return process.env.JANIS_ENV;
	}

	static setDeliveryStreamName() {

		if(!this._env)
			throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);

		this.deliveryStreamName = `${DELIVERY_STREAM_PREFIX}-${this._env}`;
	}

	static on(event, callback) {
		emitter.on(event, callback);
	}

	static async add(client, log) {

		try {

			log = this._buildLog(log, client);

		} catch(err) {
			return emitter.emit('create-error', log, err);
		}

		return this._add(log);
	}

	static async _add(log, attempts = 1) {

		try {

			await firehose.putRecord({
				DeliveryStreamName: this.deliveryStreamName,
				Record: {
					Data: Buffer.from(JSON.stringify(log))
				}
			});

		} catch(err) {

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', log,
					new LogError(`Unable to put the log into firehose, max attempts reached: ${err.message}`, LogError.codes.FIREHOSE_ERROR));
			}

			return this._add(log, ++attempts);
		}
	}

	static _buildLog(log, client) {

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

			log = logStruct(log);

		} catch(err) {
			throw new LogError(err.message, LogError.codes.INVALID_LOG);
		}

		log.dateCreated = new Date().toISOString();

		return log;
	}
}

module.exports = Log;
