/* eslint-disable max-len */

'use strict';

const logger = require('lllog')();

const { STS, Firehose } = require('./aws-wrappers');
const LogError = require('./log-error');

const sts = new STS();

const ARN_DURATION = 1800; // 30 min
const MAX_TIMEOUT = 500;

let firehoseInstance;
let credentialsExpiration;

module.exports = class FirehoseInstance {

	/**
	 * @private
	 */
	get batchSize() {
		return {
			1: 500,
			2: 100,
			3: 50,
			4: 10,
			5: 1
		};
	}

	/**
	 * @private
	 */
	get logRoleArn() {
		return process.env.TRACE_LOG_ROLE_ARN;
	}

	/**
	 * @private
	 */
	get deliveryStreamName() {
		return process.env.TRACE_FIREHOSE_DELIVERY_STREAM;
	}

	/**
	 * @private
	 */
	get roleSessionName() {
		return `role-session-${process.env.JANIS_SERVICE_NAME}`;
	}

	/**
	 * Set Instance of Firehose Wrapper when is not set
	 * @private
	 */
	async ensureFirehoseInstance() {

		if(this.validCredentials())
			return;

		const firehoseParams = {
			region: process.env.AWS_DEFAULT_REGION,
			httpOptions: { timeout: MAX_TIMEOUT }
		};

		if(this.logRoleArn) {
			firehoseParams.credentials = await this.getCredentials();
			credentialsExpiration = new Date(firehoseParams.credentials.expiration);
		}

		firehoseInstance = new Firehose(firehoseParams);
	}

	/**
	 * @private
	 */
	validCredentials() {
		return firehoseInstance
			&& credentialsExpiration
			&& credentialsExpiration >= new Date();
	}

	/**
	 * @private
	 */
	async getCredentials() {

		const assumedRole = await sts.assumeRole({
			RoleArn: this.logRoleArn,
			RoleSessionName: this.roleSessionName,
			DurationSeconds: ARN_DURATION
		});

		if(!assumedRole)
			throw new LogError('Failed to assume role, invalid response.', LogError.codes.ASSUME_ROLE_ERROR);

		const { Credentials, Expiration } = assumedRole;

		return {
			accessKeyId: Credentials.AccessKeyId,
			secretAccessKey: Credentials.SecretAccessKey,
			sessionToken: Credentials.SessionToken,
			expiration: Expiration
		};
	}

	/**
	 * @param {LogData[]} logs
	 * @returns
	 */
	async putRecords(logs) {

		try {

			await this.ensureFirehoseInstance();

		} catch(err) {

			return logger.error(`Error creating Trace logs - ${err.message}}`);
		}

		/**
		 * @type {LogData[]}
		 * @private
		 */
		this.recordsToPut = logs;

		return this.put();
	}

	/**
	 * @private
	 */
	async put(retry = 1) {

		const recordsLength = this.recordsToPut.length;

		if(!recordsLength)
			return; // no hay más records para enviar (se enviaron ok o fallaron el máximo de veces posible)

		const batchRecords = this.recordsToPut.slice(0, this.batchSize[retry]);

		const response = await this.putRecordBatch(batchRecords);

		if(response?.FailedPutCount) {

			if(this.batchSize[retry + 1])
				return this.put(retry + 1);

			logger.error(`Error creating #${batchRecords.length} Trace logs - retry #${retry}/5 - ${response.Message || 'retry limit reached'}}`);
		}

		this.recordsToPut = this.recordsToPut.slice(this.batchSize[retry]); // elimina el batch, funcionó o falló el máximo de veces, para intentear enviar lo que queda en this.recordsToPut

		return this.put(); // no se envía retry porque funciono o no, pero ese bloque ya no se envía más
	}

	/**
	 * @param {LogData[]} records
	 * @private
	 */
	async putRecordBatch(records) {

		try {

			const response = await firehoseInstance.putRecordBatch({
				DeliveryStreamName: this.deliveryStreamName,
				Records: records.map(record => ({ Data: Buffer.from(JSON.stringify(record)) }))
			});

			return response;

		} catch(err) {

			return {
				FailedPutCount: records.length,
				Message: err.message
			};
		}
	}
};
