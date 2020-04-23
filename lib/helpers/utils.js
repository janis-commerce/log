'use strict';

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

module.exports = {
	arrayChunk
};
