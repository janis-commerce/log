'use strict';

const Settings = require('@janiscommerce/settings');

module.exports = () => {

	const logRoleArn = Settings.get('logRoleArn');

	return [
		['envVars', {
			LOG_ROLE_ARN: logRoleArn
		}],
		['iamStatement', {
			action: 'Sts:AssumeRole',
			resource: logRoleArn
		}]
	];
};
