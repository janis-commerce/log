'use strict';

const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

module.exports = class StsWrapper {

	constructor(config) {
		this._sts = new STSClient(config);
	}

	/* istanbul ignore next */
	// AWS generates the STS class on the fly, the assumeRole method do not exists before creating the instance
	assumeRole(params) {
		return this._sts.send(new AssumeRoleCommand(params));
	}
};
