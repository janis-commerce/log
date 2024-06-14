'use strict';

module.exports = () => [

	['envVars', {
		LOG_ROLE_ARN: process.env.TRACE_LOG_ROLE_ARN,
		TRACE_LOG_ROLE_ARN: process.env.TRACE_LOG_ROLE_ARN,
		TRACE_FIREHOSE_DELIVERY_STREAM: process.env.TRACE_FIREHOSE_DELIVERY_STREAM,
		JANIS_TRACE_EXTENSION_USE_INVOKE_EVENT: 1
	}],

	['iamStatement', {
		action: 'Sts:AssumeRole',
		resource: process.env.TRACE_LOG_ROLE_ARN
	}]
];
