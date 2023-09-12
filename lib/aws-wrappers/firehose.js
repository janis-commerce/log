'use strict';

const { FirehoseClient, PutRecordBatchCommand } = require('@aws-sdk/client-firehose');

module.exports = class FirehoseWrapper {

	constructor(config) {
		this._firehose = new FirehoseClient(config);
	}

	/* istanbul ignore next */
	// AWS generates the Firehose class on the fly, the putRecordBatch method do not exists before creating the instance
	putRecordBatch(records) {
		return this._firehose.send(new PutRecordBatchCommand(records));
	}
};
