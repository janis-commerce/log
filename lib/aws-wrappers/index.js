'use strict';

const FirehoseWrapper = require('./firehose');
const StsWrapper = require('./sts');

module.exports = {
	Firehose: FirehoseWrapper,
	STS: StsWrapper
};
