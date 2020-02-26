'use strict';

const { STS, Firehose } = require('aws-sdk');

class FirehoseWrapper {

	constructor(config) {
		this._firehose = new Firehose(config);
	}

	/* istanbul ignore next */
	// AWS generates the Firehose class on the fly, the putRecord method do not exists before creating the insance
	async putRecord(record) {
		return this._firehose.putRecord(record).promise();
	}
}

class StsWrapper {

	constructor(config) {
		this._sts = new STS(config);
	}

	/* istanbul ignore next */
	// AWS generates the STS class on the fly, the assumeRole method do not exists before creating the insance
	async assumeRole(params) {
		return this._sts.assumeRole(params).promise();
	}
}

module.exports = {
	Firehose: FirehoseWrapper,
	STS: StsWrapper
};
