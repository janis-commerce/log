/* eslint-disable no-restricted-syntax */

'use strict';

const envs = {
	beta: 'Beta',
	qa: 'QA',
	prod: 'Prod'
};

const arrayChunk = (array, size) => {

	const chunkedArray = [[]];

	let index = 0;

	array.forEach(item => {

		if(chunkedArray[index].length === size) {
			index++;
			chunkedArray[index] = [];
		}

		chunkedArray[index].push(item);
	});

	return chunkedArray;
};

const excludeFieldsFromLog = (log, fieldsToExclude = []) => {

	if(!Array.isArray(fieldsToExclude) || !fieldsToExclude.length)
		return log;

	if(Array.isArray(log))
		return log.map(item => excludeFieldsFromLog(item, fieldsToExclude));

	if(typeof log === 'object' && log !== null) {

		const object = {};

		Object.keys(log).forEach(key => {
			if(!fieldsToExclude.includes(key))
				object[key] = excludeFieldsFromLog(log[key], fieldsToExclude);
			else
				// Save redacted property
				object[key] = '***';
		});

		return object;
	}

	return log;
};

const getEnv = () => process.env.JANIS_ENV;

const getFormattedEnv = () => envs[getEnv()];

const getServiceName = () => process.env.JANIS_SERVICE_NAME;

const getTracePrivateFields = () => {

	if(!process.env.JANIS_TRACE_PRIVATE_FIELDS)
		return;

	return process.env.JANIS_TRACE_PRIVATE_FIELDS.split(',').map(field => field.trim());
};

module.exports = {
	arrayChunk,
	getEnv,
	getFormattedEnv,
	getServiceName,
	getTracePrivateFields,
	excludeFieldsFromLog
};
