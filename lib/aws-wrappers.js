'use strict';

const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { FirehoseClient, PutRecordBatchCommand } = require('@aws-sdk/client-firehose');

class FirehoseWrapper {

	constructor(config) {
		this._firehose = new FirehoseClient(config);
	}

	/* istanbul ignore next */
	// AWS generates the Firehose class on the fly, the putRecordBatch method do not exists before creating the insance
	putRecordBatch(records) {
		return this._firehose.send(new PutRecordBatchCommand(records));
	}
}

class StsWrapper {

	constructor(config) {
		this._sts = new STSClient(config);
	}

	/* istanbul ignore next */
	// AWS generates the STS class on the fly, the assumeRole method do not exists before creating the insance
	assumeRole(params) {
		return this._sts.send(new AssumeRoleCommand(params));
	}
}

module.exports = {
	Firehose: FirehoseWrapper,
	STS: StsWrapper
};
