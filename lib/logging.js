/* eslint-disable no-console */

'use strict';

const prefix = '[LOG PACKAGE]';

module.exports.internalLog = (...data) => {
	if(process.env.LOG_PACKAGE_DEBUG)
		console.log(prefix, ...data);
};

module.exports.internalLogError = (...data) => console.error(prefix, ...data);
