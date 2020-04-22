'use strict';

const { STS, Firehose } = require('aws-sdk');

class FirehoseWrapper {

	constructor(config) {
		this._firehose = new Firehose(config);
	}

	/* istanbul ignore next */
	// AWS generates the Firehose class on the fly, the putRecordBatch method do not exists before creating the insance
	putRecordBatch(record) {
		return this._firehose.putRecordBatch(record).promise();
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
