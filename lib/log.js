'use strict';

const UUID = require('uuid/v4');

const AWS = require('aws-sdk');

const LogError = require('./log-error');

const S3 = new AWS.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

class Log {

	static add(log, bucket) {

		if(!bucket)
			throw new LogError('Bucket name is required', LogError.codes.EMPTY_BUCKET);

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

		try {

			S3.putObject({
				Bucket: bucket,
				Key: `logs/${logDate.year}/${logDate.month}/${logDate.day}/${log.id}.json`,
				Body: JSON.stringify(log),
				ContentType: 'application/json'
			});

		} catch(err) {
			throw new LogError(err.message, LogError.codes.S3_ERROR);
		}

	}

}

module.exports = Log;
