'use strict';

const UUID = require('uuid/v4');

const AWS = require('aws-sdk');

const LogError = require('./log-error');

const MAX_ATTEMPTS = 3;

const MAX_TIMEOUT = 500;

const S3 = new AWS.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	httpOptions: { timeout: MAX_TIMEOUT }
});

class Log {

	static add(bucket, log) {

		let attempts = 0;

		const retry = () => {

			const retryInterval = setInterval(() => {

				this._add(bucket, log, err => {

					if(err) {
						if(attempts >= MAX_ATTEMPTS)
							throw new LogError(`Unable to put the log into S3, max attempts reached: ${err.message}`, LogError.codes.S3_ERROR);
						attempts++;
						return;
					}

					clearInterval(retryInterval);

				});

			}, MAX_TIMEOUT);

		};

		this._add(bucket, log, err => {

			if(err) {
				attempts++;
				retry();
			}

		});
	}

	static _add(bucket, log, callback) {

		if(!bucket || typeof bucket !== 'string')
			throw new LogError('Invalid or empty bucket', LogError.codes.INVALID_BUCKET);

		if(!log || typeof log !== 'object' || Array.isArray(log))
			throw new LogError('Invalid log', LogError.codes.INVALID_LOG);

		const logDate = {
			date: log.date_created ? new Date(log.date_created * 1000) : new Date(),
			get year() {
				return this.date.getFullYear();
			},
			get month() {
				return (this.date.getMonth() + 1).toString().padStart(2, 0);
			},
			get day() {
				return this.date.getDate().toString()
					.padStart(2, 0);
			}
		};

		if(!log.date_created)
			log.date_created = Math.floor(logDate.date / 1000);

		if(!log.id)
			log.id = UUID();

		S3.putObject({
			Bucket: bucket,
			Key: `logs/${logDate.year}/${logDate.month}/${logDate.day}/${log.id}.json`,
			Body: JSON.stringify(log),
			ContentType: 'application/json'
		}, err => {

			if(err)
				return callback(new LogError(err.message, LogError.codes.S3_ERROR));

			return callback(null);

		});
	}
}

module.exports = Log;
