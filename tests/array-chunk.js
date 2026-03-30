'use strict';

const assert = require('assert');

const arrayChunk = require('../lib/helpers/array-chunk');

describe('arrayChunk() helper', () => {

	it('Should chunk the array when the size is bigger than the limit given', () => {

		const originalArray = ['a', 'b', 'c', 'd', 'e'];

		const chunk = arrayChunk(originalArray, 3);

		assert.deepStrictEqual(chunk, [
			['a', 'b', 'c'],
			['d', 'e']
		]);

	});

	it('Should chunk the array when the size is smaller than the limit given', () => {

		const originalArray = ['a', 'b', 'c', 'd', 'e'];

		const chunk = arrayChunk(originalArray, 10);

		assert.deepStrictEqual(chunk, [
			['a', 'b', 'c', 'd', 'e']
		]);
	});

});
