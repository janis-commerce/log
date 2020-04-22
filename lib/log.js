'use strict';

const { struct } = require('@janiscommerce/superstruct');

const EventEmmiter = require('events');
const { v4: UUID } = require('uuid');

const LogError = require('./log-error');

const { STS, Firehose } = require('./aws-wrappers');

const ARN_DURATION = 1800; // 30 min
const MAX_ATTEMPTS = 3;
const MAX_TIMEOUT = 500;
const DELIVERY_STREAM_PREFIX = 'JanisTraceFirehose';
const LOGS_BATCH_LIMIT = 500;

const sts = new STS();

const emitter = new EventEmmiter();

class Log {

	static get _serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get _env() {
		return process.env.JANIS_ENV;
	}

	static get _roleArn() {
		return process.env.LOG_ROLE_ARN;
	}

	static get _envs() {

		return {
			local: 'Local',
			beta: 'Beta',
			qa: 'QA',
			prod: 'Prod'
		};
	}

	static get deliveryStreamName() {

		if(!this._deliveryStreamName)
			this._deliveryStreamName = `${DELIVERY_STREAM_PREFIX}${this._getFormattedEnv()}`;

		return this._deliveryStreamName;
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

		if(!Array.isArray(logs))
			logs = [logs];

		const validLogs = logs.map(log => this._validateLog(log, client)).filter(Boolean);

		const logsBatches = this._createLogsBatches(validLogs);

		return this._add(logsBatches);
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

	static _createLogsBatches(logs) {

		const parsedLogs = [[]];

		let index = 0;

		logs.forEach(log => {

			if(parsedLogs[index].length === LOGS_BATCH_LIMIT) {
				index++;
				parsedLogs[index] = [];
			}

			parsedLogs[index].push(log);
		});

		return parsedLogs;
	}

	static _validateLog(rawLog, client) {

		const logStruct = struct.partial({
			id: 'string',
			service: 'string',
			entity: 'string',
			entityId: 'string?|number?',
			type: 'string',
			log: 'object?|array?',
			message: 'string?',
			client: 'string',
			userCreated: 'string?'
		}, {
			id: UUID(),
			service: this._serviceName,
			client
		});

		try {

			const validLog = logStruct(rawLog);

			if(validLog.log)
				validLog.log = JSON.stringify(validLog.log);

			return {
				...validLog,
				dateCreated: new Date().toISOString()
			};

		} catch(err) {
			emitter.emit('validate-error', rawLog, err);
		}
	}

	static async _getFirehoseInstance() {

		const hasExpired = this._credentialsExpiration < new Date();

		if(this._firehose && !hasExpired)
			return this._firehose;

		const firehoseParams = {
			region: process.env.AWS_DEFAULT_REGION,
			httpOptions: { timeout: MAX_TIMEOUT }
		};

		if(this._roleArn) {

			firehoseParams.credentials = await this._getCredentials();

			this._credentialsExpiration = firehoseParams.credentials.expiration;
		}

		this._firehose = new Firehose(firehoseParams);

		return this._firehose;
	}

	static async _getCredentials() {

		const assumedRole = await sts.assumeRole({
			RoleArn: this._roleArn,
			RoleSessionName: this._serviceName,
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

	static _getFormattedEnv() {

		if(this._env && this._envs[this._env])
			return this._envs[this._env];

		throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);
	}

	static async _add(logsBatches, attempts = 0) {

		try {

			const firehose = await this._getFirehoseInstance();

			return Promise.all(
				logsBatches.map(logs => firehose.putRecordBatch({
					DeliveryStreamName: this.deliveryStreamName,
					Records: logs.map(log => ({
						Data: Buffer.from(JSON.stringify(log))
					}))
				}))
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
}

module.exports = Log;
