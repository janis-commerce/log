/* eslint-disable max-len */

'use strict';

const { STS, Firehose } = require('./aws-wrappers');
const arrayChunk = require('./helpers/array-chunk');
const LogError = require('./log-error');

const { internalLog, internalLogError } = require('./logging');

const sts = new STS();

const ARN_DURATION = 1800; // 30 min
const MAX_TIMEOUT = 1000; // 1 second timeout for each putRecordBatch call

const MAX_RECORDS = 500;
const MAX_BATCH_SIZE = (4 * 1024 * 1024) - (100 * 1024); // 4MB - 100KB
const MAX_RECORD_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 5;

let firehoseInstance;
let credentialsExpiration;

module.exports = class FirehoseInstance {

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
			internalLogError(`Failed preparing Firehose instance (Log batch lost) - ${err.message}`);
			return {
				successCount: 0,
				failedCount: logs.length
			};
		}

		this.successCount = 0;
		this.failedCount = 0;

		internalLog(`Received ${logs.length} logs`);

		const batches = this.prepareBatches(logs);

		internalLog(`Assigned logs to ${batches.length} batches`);

		const chunks = arrayChunk(batches, MAX_CONCURRENCY);

		for(const chunk of chunks)
			await Promise.allSettled(chunk.map(batch => this.putBatch(batch)));

		return {
			successCount: this.successCount,
			failedCount: this.failedCount
		};
	}

	prepareBatches(logs) {

		const batches = [];
		let currentBatch = [];
		let currentSize = 0;

		for(const logObject of logs) {

			let data = Buffer.from(JSON.stringify(logObject));
			let size = data.length;

			if(size > MAX_RECORD_SIZE) {

				internalLogError(`Log size exceeds ${MAX_RECORD_SIZE} bytes, log will be truncated`);

				data = Buffer.from(JSON.stringify({
					...logObject,
					log: {
						truncated: true,
						...(process.env.JANIS_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME) && { functionName: process.env.JANIS_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME },
						...process.env.JANIS_API_REQUEST_LOG_ID && { apiRequestLogId: process.env.JANIS_API_REQUEST_LOG_ID }
					}
				}));

				size = data.length;
			}

			const exceedsCount = currentBatch.length >= MAX_RECORDS;
			const exceedsSize = currentSize + size > MAX_BATCH_SIZE;

			if(exceedsCount || exceedsSize) {
				batches.push(currentBatch);
				currentBatch = [];
				currentSize = 0;
			}

			currentBatch.push({ Data: data });
			currentSize += size;
		}

		if(currentBatch.length)
			batches.push(currentBatch);

		return batches;
	}

	async putBatch(batch, attemptNumber = 1) {

		const response = await this.putRecordBatch(batch);

		if(!response?.FailedPutCount) {
			this.successCount += batch.length;
			internalLog(`Successfully put ${batch.length} log(s)`);
			return;
		}

		const failedRecords = response.RequestResponses ?
			batch.filter((_, index) => response.RequestResponses[index]?.ErrorCode) :
			batch;

		this.successCount += batch.length - failedRecords.length;

		if(attemptNumber >= MAX_RETRIES) {
			this.failedCount += failedRecords.length;
			internalLogError(`Failed to put ${failedRecords.length} log(s) after all retries`);
			return;
		}

		if(batch.length === 1)
			return this.putBatch(failedRecords, MAX_RETRIES); // When theres only 1 record in Batch, 1 retry is allowed

		if(failedRecords.length === 1)
			return this.putBatch(failedRecords, attemptNumber + 1);

		const mid = Math.ceil(failedRecords.length / 2);

		await this.putBatch(failedRecords.slice(0, mid), attemptNumber + 1);
		await this.putBatch(failedRecords.slice(mid), attemptNumber + 1);
	}

	/**
	 * @param {LogData[]} records
	 * @private
	 */
	async putRecordBatch(records) {

		const start = Date.now();

		try {

			const response = await firehoseInstance.putRecordBatch({
				DeliveryStreamName: this.deliveryStreamName,
				Records: records
			});

			internalLog(`putRecordBatch() successfully sent ${records.length} logs in ${Date.now() - start}ms`);

			return response;

		} catch(err) {

			internalLogError(`Error putRecordBatch() for ${records.length} logs in ${Date.now() - start}ms - ${err.message}`);

			return {
				FailedPutCount: records.length,
				Message: err.message
			};
		}
	}
};
