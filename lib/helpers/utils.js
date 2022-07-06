'use strict';

const LogError = require('../log-error');

const envs = {
	local: 'Local',
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

const getEnv = () => {

	const env = process.env.JANIS_ENV;

	if(!env || !envs[env])
		throw new LogError('Unknown environment', LogError.codes.NO_ENVIRONMENT);

	return env;
};

const getFormattedEnv = () => envs[getEnv()];

const getServiceName = () => process.env.JANIS_SERVICE_NAME;

module.exports = {
	arrayChunk,
	getEnv,
	getFormattedEnv,
	getServiceName
};
