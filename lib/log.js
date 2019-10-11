'use strict';

const EventEmmiter = require('events');

const UUID = require('uuid/v4');

const AWS = require('aws-sdk');

const LogError = require('./log-error');

const MAX_ATTEMPTS = 3;

const MAX_TIMEOUT = 500;

const BUCKET_PREFIX = 'janis-trace-service';

const S3 = new AWS.S3({ httpOptions: { timeout: MAX_TIMEOUT } });

const emitter = new EventEmmiter();

class Log {

	static get _serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get _stage() {
		return process.env.JANIS_ENV;
	}

	static get bucket() {

		if(!this._bucket)
			this.setBucket();

		return this._bucket;
	}

	static set bucket(bucket) {
		this._bucket = bucket;
	}

	static setBucket() {

		if(typeof this._stage === 'undefined')
			throw new LogError('Unknown stage name', LogError.codes.NO_STAGE_NAME);

		this.bucket = `${BUCKET_PREFIX}-${this._stage}`;
	}

	static async add(client, log, attempts = 1) {

		try {

			await this._add(client, log);

		} catch(err) {

			if(err.name === 'LogError')
				return emitter.emit('create-error', log, err);

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', log,
					new LogError(`Unable to put the log into S3, max attempts reached: ${err.message}`, LogError.codes.S3_ERROR));
			}

			return this.add(client, log, ++attempts);
		}
	}

	static async _add(client, log) {

		if(typeof this._serviceName === 'undefined')
			throw new LogError('Unknown service name', LogError.codes.NO_SERVICE_NAME);

		if(typeof client !== 'string')
			throw new LogError('Invalid or empty client', LogError.codes.INVALID_CLIENT);

		this._validateLog(log);

		const date = log.date_created ? new Date(log.date_created * 1000) : new Date();
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, 0);
		const day = date.getDate().toString()
			.padStart(2, 0);

		if(!log.date_created)
			log.date_created = Math.floor(date / 1000);

		if(!log.id)
			log.id = UUID();

		return S3.putObject({
			Bucket: this.bucket,
			Key: `${client}/${year}/${month}/${day}/${log.id}.json`,
			Body: JSON.stringify({ ...log, service: this._serviceName }),
			ContentType: 'application/json'
		}).promise();
	}

	static _validateLog(log) {

		// Log should be an object (not array)
		if(typeof log !== 'object' || Array.isArray(log))
			throw new LogError('Invalid log: should be an object', LogError.codes.INVALID_LOG);

		// Should have entity property with type string
		if(typeof log.entity !== 'string')
			throw new LogError('Invalid log: should have a valid entity property and must be a string', LogError.codes.INVALID_LOG);

		// Should have type property with type number or string
		if(typeof log.type !== 'string' && typeof log.type !== 'number')
			throw new LogError('Invalid log: should have a valid type property and must be a string or number', LogError.codes.INVALID_LOG);
	}

	static on(event, callback) {
		emitter.on(event, callback);
	}
}

module.exports = Log;
