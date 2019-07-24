'use strict';

const fs = require('fs');
const util = require('util');

const AWS = require('aws-sdk');

const LogError = require('./log-error');

const S3 = new AWS.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

fs.readFile = util.promisify(fs.readFile);
fs.writeFile = util.promisify(fs.readFile);

class Log {

	/*

		log example

		{
			"type": 26,
			"entity": "api",
			"entity_id": "product",
			"message": "[GET] Request desde 54.173.93.81 a product/custom_data",
			"date_created": 1559103066,
			"user_created": 0,
			"log": {
				"verb": "GET",
				"headers": {
					"x-forwarded-for":"54.173.93.81",
					"x-forwarded-proto":"https",
					"x-forwarded-port":"443",
					"host":"janisqa.in",
					"x-amzn-trace-id":"Root=1-5cee065a-***",
					"janis-client":"jumboargentinaqa",
					"authorization":"Bearer ***"
				},
				"remote_ip":"54.173.93.81",
				"payload": {
					"ref_id":["21350357%20004"]
				},
				"uri": {
					"controller":"product",
					"action":"custom_data",
					"data":[]
				},
				"responseHttpCode":200,"responseTime":"0.3236"
			},
			"id": "041ef643-b49d-4db2-b70f-0b4eabe94b40"
		}

	*/

	/* async add(log) {

		const logDate = new Date(log.date_created * 1000);
		const logYear = logDate.getFullYear();
		const logMonth = (logDate.getMonth + 1).toString().padStart(2, 0);
		const logDay = logDate.getDate().toString()
			.padStart(2, 0);

		try {
			await S3.putObject({
				Bucket: 'bucketName',
				Key: `logs/${logYear}/${logMonth}/${logDay}/${log.id}`,
				Body: JSON.stringify(log),
				ContentType: 'application/json'
			});
		} catch(err) {
			throw new Error(err.message);
		}
	} */

	async add(log) {

		if(!(typeof log === 'object' && Array.isArray(log)) && !(log.date_created && log.id))
			throw new LogError('Invalid log', LogError.codes.INVALID_LOG);

		const logDate = {
			date: new Date(log.date_created * 1000),
			get year() {
				return this.date.getFullYear();
			},
			get month() {
				return (this.date.getMonth + 1).toString().padStart(2, 0);
			},
			get day() {
				return this.date.getDate().toString()
					.padStart(2, 0);
			}
		};

		try {

			await S3.putObject({
				Bucket: 'bucketName',
				Key: `logs/${logDate.date}/${logDate.month}/${logDate.day}/${log.id}`,
				Body: JSON.stringify(log),
				ContentType: 'application/json'
			}).promise();

		} catch(err) {
			throw new LogError(err.message, LogError.codes.S3_ERROR);
		}

	}

}

module.exports = Log;
