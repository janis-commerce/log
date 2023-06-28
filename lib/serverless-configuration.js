'use strict';

module.exports = () => [

	['envVars', {
		TRACE_LOG_ROLE_ARN: process.env.TRACE_LOG_ROLE_ARN
	}],

	['iamStatement', {
		action: 'Sts:AssumeRole',
		resource: process.env.TRACE_LOG_ROLE_ARN
	}]
];
