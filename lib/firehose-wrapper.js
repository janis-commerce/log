'use strict';

const { Firehose } = require('aws-sdk');

class FirehoseWrapper {

	constructor(config) {
		this._firehose = new Firehose(config);
	}

	/* istanbul ignore next */ // AWS generates the Firehose class on the fly, the putRecord method do not exists before creating the insance
	async putRecord(record) {
		return this._firehose.putRecord(record).promise();
	}
}

module.exports = FirehoseWrapper;
