'use strict';

const { STS, Firehose } = require('./aws-wrappers');
const LogError = require('./log-error');

const sts = new STS();
const ARN_DURATION = 1800; // 30 min
const MAX_TIMEOUT = 500;

class FirehoseInstance {


	static get serviceName() {
		return process.env.JANIS_SERVICE_NAME;
	}

	static get env() {
		return process.env.JANIS_ENV;
	}

	static get roleArn() {
		return process.env.LOG_ROLE_ARN;
	}

	/**
     * Returns a FirehoseInstance
     *
     * @static
     * @returns
     * @memberof FirehoseInstance
     */
	static async getFirehoseInstance() {

		if(!this.validCredentials()) {


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

		return this.firehose;
	}

	static validCredentials() {
		return this.firehose
			&& this.credentialsExpiration
			&& this.credentialsExpiration >= new Date();
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

module.exports = FirehoseInstance;
