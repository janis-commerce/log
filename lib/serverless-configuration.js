'use strict';

const Settings = require('@janiscommerce/settings');

module.exports = () => {

	const logRoleArn = Settings.get('logRoleArn');

	return [
		'iamStatement', {
			action: 'Sts:AssumeRole',
			resource: logRoleArn
		}
	];
};
