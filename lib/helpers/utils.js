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

const getEnv = () => process.env.JANIS_ENV;

const getFormattedEnv = () => envs[getEnv()];

const getServiceName = () => process.env.JANIS_SERVICE_NAME;

module.exports = {
	arrayChunk,
	getEnv,
	getFormattedEnv,
	getServiceName
};
