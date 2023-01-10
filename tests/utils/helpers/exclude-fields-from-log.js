'use strict';

const assert = require('assert');
const { excludeFieldsFromLog } = require('../../../lib/helpers/utils');

describe('ExcludeFieldsFromLog Test', () => {

	const log = {
		name: 'test'
	};

	it('Should skip the process and return the object to be processed if it does not receive fields to exclude', () => {
		assert.deepStrictEqual(excludeFieldsFromLog(log), log);
	});

	it('should exclude defined properties', () => {
		assert.deepStrictEqual(excludeFieldsFromLog(log, ['name']), {});
	});

	it('Should exclude the defined properties even if it finds more than one occurrence', () => {
		assert.deepStrictEqual(excludeFieldsFromLog({
			...log,
			company: {
				name: 'company name',
				refId: 'cny-01'
			}
		},
		['name']
		),
		{
			company: {
				refId: 'cny-01'
			}
		});
	});

	it('Should exclude the defined properties even if they are inside an array of objects', () => {
		assert.deepStrictEqual(excludeFieldsFromLog({
			...log,
			organizations: [
				{
					company: {
						name: 'company test-01',
						refId: 'cny-02'
					}
				},
				{
					company: {
						name: 'company test-02',
						refId: 'cny-02',
						carrier: null,
						credentials: {
							user: 'user',
							password: 'pass'
						}
					}
				}
			]
		},
		['name', 'credentials']
		),
		{
			organizations: [
				{
					company: {
						refId: 'cny-02'
					}
				},
				{
					company: {
						carrier: null,
						refId: 'cny-02'
					}
				}
			]
		});
	});
});
