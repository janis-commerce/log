'use strict';

module.exports = () => [

	['envVars', {
		TRACE_LOG_ROLE_ARN: process.env.TRACE_LOG_ROLE_ARN,
		TRACE_FIREHOSE_DELIVERY_STREAM: process.env.TRACE_FIREHOSE_DELIVERY_STREAM
	}],

	['iamStatement', {
		action: 'Sts:AssumeRole',
		resource: process.env.TRACE_LOG_ROLE_ARN
	}]
];
