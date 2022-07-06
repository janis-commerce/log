'use strict';

const logger = require('lllog')();

const { STS, Firehose } = require('./aws-wrappers');
const LogError = require('./log-error');

const { arrayChunk, getFormattedEnv, getServiceName } = require('./helpers/utils');

const sts = new STS();

const ARN_DURATION = 1800; // 30 min
const MAX_TIMEOUT = 500;

const MAX_ATTEMPTS = 3;

const LOGS_BATCH_LIMIT = 500;

const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';

module.exports = class FirehoseInstance {

	static get roleArn() {
		return process.env.LOG_ROLE_ARN;
	}

	/**
	 * @static
	 * @returns {string} The Delivery Stream Name for Firehouse based on current env
	 */
	static get deliveryStreamName() {
		return `${DELIVERY_STREAM_PREFIX}${getFormattedEnv()}`;
	}

	/**
     * Set Instance of Firehose Wrapper when is not set
     *
     */
	static async ensureFirehoseInstance() {

		if(this.validCredentials())
			return;

		const firehoseParams = {
			region: process.env.AWS_DEFAULT_REGION,
			httpOptions: { timeout: MAX_TIMEOUT }
		};

		if(this.roleArn) {
			firehoseParams.credentials = await this.getCredentials();
			this.credentialsExpiration = new Date(firehoseParams.credentials.expiration);
		}

		this.firehose = new Firehose(firehoseParams);
	}

	static validCredentials() {
		return this.firehose
			&& this.credentialsExpiration
			&& this.credentialsExpiration >= new Date();
	}

	static async getCredentials() {

		const assumedRole = await sts.assumeRole({
			RoleArn: this.roleArn,
			RoleSessionName: getServiceName(),
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
	 * @private
	 * @static
	 * @param {Array<Array<LogData>>} logs
	 * @param {number} [attempts = 0]
	 * @returns
	 */
	static async putRecords(logs, attempts = 0) {

		const logsBatches = arrayChunk(logs, LOGS_BATCH_LIMIT);

		try {

			await this.ensureFirehoseInstance();

			await Promise.all(
				logsBatches.map(logBatch => this.firehose.putRecordBatch({
					DeliveryStreamName: this.deliveryStreamName,
					Records: logBatch.map(log => ({ Data: Buffer.from(JSON.stringify(log)) }))
				}))
			);

		} catch(err) {

			attempts++;

			if(attempts >= MAX_ATTEMPTS)
				return logger.error('Error creating Trace logs', err);

			return this.putRecords(logs, attempts);
		}
	}
};
