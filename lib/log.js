'use strict';

const EventEmmiter = require('events');

const UUID = require('uuid/v4');

const AWS = require('aws-sdk');

const LogError = require('./log-error');

const MAX_ATTEMPTS = 3;

const MAX_TIMEOUT = 500;

const S3 = new AWS.S3({ httpOptions: { timeout: MAX_TIMEOUT } });

const emitter = new EventEmmiter();

class Log {

	static async add(bucket, log, attempts = 1) {

		try {

			await this._add(bucket, log);

		} catch(err) {

			if(err.name === 'LogError')
				return emitter.emit('create-error', log, err);

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', log,
					new LogError(`Unable to put the log into S3, max attempts reached: ${err.message}`, LogError.codes.S3_ERROR));
			}

			return this.add(bucket, log, ++attempts);
		}
	}

	static async _add(bucket, log) {

		if(!bucket || typeof bucket !== 'string')
			throw new LogError('Invalid or empty bucket', LogError.codes.INVALID_BUCKET);

		if(!log || typeof log !== 'object' || Array.isArray(log))
			throw new LogError('Invalid log', LogError.codes.INVALID_LOG);

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
			Bucket: bucket,
			Key: `logs/${year}/${month}/${day}/${log.id}.json`,
			Body: JSON.stringify(log),
			ContentType: 'application/json'
		}).promise();
	}

	static on(event, callback) {
		emitter.on(event, callback);
	}
}

module.exports = Log;
