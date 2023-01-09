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

const excludeFieldsFromLog = (log, fieldsToExclude) => {

	const object = { ...log };

	for(const field in object) {

		if(fieldsToExclude.includes(field))
			delete object[field];

		else if(typeof object[field] === 'object') {

			if(Array.isArray(object[field]))
				object[field] = object[field].map(item => excludeFieldsFromLog(item, fieldsToExclude));

			else
				object[field] = excludeFieldsFromLog(object[field], fieldsToExclude);
		}
	}

	return object;
};

const getEnv = () => process.env.JANIS_ENV;

const getFormattedEnv = () => envs[getEnv()];

const getServiceName = () => process.env.JANIS_SERVICE_NAME;

const getTracePrivateFields = () => process.env.JANIS_TRACE_PRIVATE_FIELDS;

module.exports = {
	arrayChunk,
	getEnv,
	getFormattedEnv,
	getServiceName,
	getTracePrivateFields,
	excludeFieldsFromLog
};
