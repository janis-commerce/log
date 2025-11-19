/* eslint-disable max-len */

'use strict';

const { STS, Firehose } = require('./aws-wrappers');
const LogError = require('./log-error');

const { internalLog, internalLogError } = require('./logging');

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
			internalLogError(`Error ensuring Firehose instance - ${err.message}`);
		}

		internalLog(`Putting ${logs.length} logs`);

		const initialBatchSize = this.batchSize[1];

		const promises = [];

		for(let offset = 0; offset < logs.length; offset += initialBatchSize)
			promises.push(this.putBatch(logs.slice(offset, offset + initialBatchSize)));

		await Promise.allSettled(promises);
	}

	async putBatch(batch, attemptNumber = 1) {

		const response = await this.putRecordBatch(batch);

		if(response?.FailedPutCount) {

			const nextBatchSize = this.batchSize[attemptNumber + 1];

			if(!nextBatchSize)
				return internalLogError('Failed to put batch - no next batch size');

			const promises = [];

			for(let offset = 0; offset < batch.length; offset += nextBatchSize)
				promises.push(this.putBatch(batch.slice(offset, offset + nextBatchSize), attemptNumber + 1));

			await Promise.allSettled(promises);
		}
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

			internalLog(`Put record batch response - ${JSON.stringify(response)}`);

			return response;

		} catch(err) {

			internalLogError(`Error putting record batch - ${err.message}`);

			return {
				FailedPutCount: records.length,
				Message: err.message
			};
		}
	}
};
