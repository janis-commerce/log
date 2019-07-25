'use strict';

const assert = require('assert');

const MockRequire = require('mock-require');

const AWSMock = require('./../mocks/aws-s3-mock');

MockRequire('aws-sdk', AWSMock);

process.env.AWS_ACCESS_KEY_ID = 'S3RVER';

process.env.AWS_SECRET_ACCESS_KEY = 'S3RVER';

const Log = require('./../index');

const LogError = require('./../lib/log-error');

const fakeLog = {
	type: 1,
	entity: 'api',
	entity_id: 'product',
	message: '[GET] Request from 0.0.0.0 a product/custom_data',
	date_created: 1559103066,
	user_created: 0,
	log: {
		uri: {
			controller: 'product',
			action: 'custom_data',
			data: []
		},
		responseHttpCode: 200,
		responseTime: '0.3236'
	},
	id: 'a1d2asd1-1a23-a23d-as1d-0asdas2130'
};

describe('Log', () => {

	beforeEach(() => {
		AWSMock.S3.restore();
	});

	it('should not reject when put a log into S3', async () => {
		assert.doesNotThrow(() => { Log.add(fakeLog, 'someBucket'); });
	});

	it('should not reject and generate the log id when put a log into S3 without id', async () => {

		const fakeLogWithoutId = { ...fakeLog };
		delete fakeLogWithoutId.id;
		assert.doesNotThrow(() => { Log.add(fakeLogWithoutId, 'someBucket'); });

	});

	it('should throw LogError when S3 throws', async () => {

		AWSMock.S3.throws = true;
		assert.throws(() => { Log.add({ id: 1 }, 'someBucket'); }, {
			name: 'LogError',
			code: LogError.codes.S3_ERROR
		});

	});

	it('should throw LogError when the Log is invalid or is empty', async () => {

		assert.throws(() => { Log.add([], 'someBucket'); }, {
			name: 'LogError',
			code: LogError.codes.INVALID_LOG
		});

	});

	it('should throw LogError when the bucket param is empty', async () => {

		assert.throws(() => { Log.add(fakeLog); }, {
			name: 'LogError',
			code: LogError.codes.EMPTY_BUCKET
		});

	});

});
