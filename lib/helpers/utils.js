/* eslint-disable no-restricted-syntax */

'use strict';

const hideFieldsFromLog = (log, fields) => {

	if(Array.isArray(log))
		return log.map(item => hideFieldsFromLog(item, fields));

	if(typeof log === 'object' && log !== null) {

		const object = {};

		Object.keys(log).forEach(key => {
			object[key] = fields[key]
				? '***' // Save redacted property
				: hideFieldsFromLog(log[key], fields);
		});

		return object;
	}

	return log;
};

const getEnv = () => process.env.JANIS_ENV;

const getTracePrivateFields = () => {

	if(!process.env.JANIS_TRACE_PRIVATE_FIELDS)
		return;

	return process.env.JANIS_TRACE_PRIVATE_FIELDS.split(',').reduce((accum, field) => {
		accum[field.trim()] = true;
		return accum;
	}, {});
};

module.exports = {
	getEnv,
	getTracePrivateFields,
	hideFieldsFromLog
};
