/* eslint-disable no-restricted-syntax */

'use strict';

const isPlainObject = value => {

	if(typeof value !== 'object' || value === null)
		return false;

	// Instances such as Date or ObjectId keep their content outside own enumerable keys,
	// so rebuilding them key by key would empty them
	const prototype = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
};

const hideFieldsFromLog = (log, fields) => {

	if(Array.isArray(log))
		return log.map(item => hideFieldsFromLog(item, fields));

	if(isPlainObject(log)) {

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

const getTracePrivateFields = () => {

	if(!process.env.JANIS_TRACE_PRIVATE_FIELDS)
		return;

	return process.env.JANIS_TRACE_PRIVATE_FIELDS.split(',').reduce((accum, field) => {
		accum[field.trim()] = true;
		return accum;
	}, {});
};

module.exports = {
	getTracePrivateFields,
	hideFieldsFromLog
};
