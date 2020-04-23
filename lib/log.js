'use strict';

const EventEmmiter = require('events');

const { STS, Firehose } = require('./aws-wrappers');
const { arrayChunk } = require('./helpers/utils');

const Validator = require('./helpers/validator');
const LogError = require('./log-error');

const ARN_DURATION = 1800; // 30 min
const MAX_ATTEMPTS = 3;
const MAX_TIMEOUT = 500;
const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';
const LOGS_BATCH_LIMIT = 500;

const sts = new STS();

const emitter = new EventEmmiter();

class Log {

	static get serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get env() {
		return process.env.JANIS_ENV;
	}

	static get roleArn() {
		return process.env.LOG_ROLE_ARN;
	}

	static get envs() {

		return {
			local: 'Local',
			beta: 'Beta',
			qa: 'QA',
			prod: 'Prod'
		};
	}

	static get deliveryStreamName() {

		if(!this._deliveryStreamName)
			this._deliveryStreamName = `${DELIVERY_STREAM_PREFIX}${this.getFormattedEnv}`;

		return this._deliveryStreamName;
	}

	static get getFormattedEnv() {

		if(this.env && this.envs[this.env])
			return this.envs[this.env];

		throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);
	}

	/**
	 * Sets a callback for the specified event name
	 * @param {String} event The event name
	 * @param {Function} callback The event callback
	 * @example
	 * on('create-error', (log, err) => {...});
	 */
	static on(event, callback) {
		emitter.on(event, callback);
	}

	/**
	 * Put logs into Firehose
	 * @param {String} client The client code who created the log
	 * @param {Object|Array.<object>} logs The log object or log objects array
	 * @example
	 * add('some-client', {
	 * 	type: 'some-type',
	 * 	entity: 'some-entity',
	 * 	entityId: 'some-entityId',
	 * 	message: 'some-message',
	 * 	log: {
	 * 		some: 'log'
	 * 	}
	 * });
	 */
	static async add(client, logs) {

		// For local development
		if(this.env === 'local')
			return true;

		if(!Array.isArray(logs))
			logs = [logs];

		let validLogs;

		try {

			validLogs = logs.map(log => this.validateLog(log, client));

		} catch(err) {
			return emitter.emit('create-error', logs, err);
		}

		const logsBatches = this.createLogsBatches(validLogs);
		return this._add(logsBatches);
	}

	static validateLog(log, client) {
		return Validator.validate(log, client, this.serviceName);
	}

	static createLogsBatches(logs) {
		return arrayChunk(logs, LOGS_BATCH_LIMIT);
	}

	static async _add(logsBatches, attempts = 0) {

		try {

			const firehose = await this.getFirehoseInstance();

			return Promise.all(
				logsBatches.map(logs => firehose.putRecordBatch(
					{
						DeliveryStreamName: this.deliveryStreamName,
						Records: logs.map(log => ({
							Data: Buffer.from(JSON.stringify(log))
						}))
					}
				))
			);

		} catch(err) {

			attempts++;

			if(attempts >= MAX_ATTEMPTS) {
				return emitter.emit('create-error', logsBatches,
					new LogError(`Unable to put the logs into firehose, max attempts reached: ${err.message}`, LogError.codes.FIREHOSE_ERROR));
			}

			return this._add(logsBatches, attempts);
		}
	}

	static async getFirehoseInstance() {

		const hasExpired = this._credentialsExpiration < new Date();

		if(this._firehose && !hasExpired)
			return this._firehose;

		const firehoseParams = {
			region: process.env.AWS_DEFAULT_REGION,
			httpOptions: { timeout: MAX_TIMEOUT }
		};

		if(this.roleArn) {
			firehoseParams.credentials = await this.getCredentials();
			this._credentialsExpiration = firehoseParams.credentials.expiration;
		}

		this._firehose = new Firehose(firehoseParams);
		return this._firehose;
	}

	static async getCredentials() {

		const assumedRole = await sts.assumeRole({
			RoleArn: this.roleArn,
			RoleSessionName: this.serviceName,
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
}

module.exports = Log;
