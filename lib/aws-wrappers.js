'use strict';

const STS = require('aws-sdk/clients/sts');
const Firehose = require('aws-sdk/clients/firehose');

class FirehoseWrapper {

	constructor(config) {
		this._firehose = new Firehose(config);
	}

	/* istanbul ignore next */
	// AWS generates the Firehose class on the fly, the putRecordBatch method do not exists before creating the insance
	putRecordBatch(records) {
		return this._firehose.putRecordBatch(records).promise();
	}
}

class StsWrapper {

	constructor(config) {
		this._sts = new STS(config);
	}

	/* istanbul ignore next */
	// AWS generates the STS class on the fly, the assumeRole method do not exists before creating the insance
	assumeRole(params) {
		return this._sts.assumeRole(params).promise();
	}
}

module.exports = {
	Firehose: FirehoseWrapper,
	STS: StsWrapper
};
