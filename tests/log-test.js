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

const S3 = new AWSMock.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

describe('Log', () => {

	beforeEach(() => {
		AWSMock.S3.restore();
		AWSMock.S3.clearBuckets();
	});

	it('should store a log into S3', async () => {

		assert.doesNotThrow(() => Log.add('someBucket', fakeLog));

		const log = await S3.getObject({
			Bucket: 'someBucket',
			Key: 'logs/2019/05/29/a1d2asd1-1a23-a23d-as1d-0asdas2130.json'
		}).promise();

		const savedLog = JSON.parse(log.Body.toString('utf-8'));

		assert.deepStrictEqual(savedLog, fakeLog);
	});

	it('should not reject and generate the log id and date_created when put a log into S3 without id and date_created', async () => {

		let newFakeLog = { ...fakeLog };
		delete newFakeLog.id;
		delete newFakeLog.date_created;

		assert.doesNotThrow(() => Log.add('someBucket', newFakeLog));

		const newFakeLogKey = Object.keys(AWSMock.S3.raw.someBucket)[0];
		newFakeLog = JSON.parse(AWSMock.S3.raw.someBucket[newFakeLogKey].Body);

		const log = await S3.getObject({
			Bucket: 'someBucket',
			Key: newFakeLogKey
		}).promise();

		const savedLog = JSON.parse(log.Body.toString('utf-8'));

		assert.deepStrictEqual(savedLog, newFakeLog);
	});

	it('should throw LogError when S3 throws', () => {

		AWSMock.S3.throws = true;

		assert.throws(() => Log.add('someBucket', fakeLog), {
			name: 'LogError',
			code: LogError.codes.S3_ERROR
		});
	});

	[true, 54, ['foo', 'bar'], null].forEach(log => {

		it('should throw LogError when the log given is invalid', () => {
			assert.throws(() => Log.add('someBucket', log), {
				name: 'LogError',
				code: LogError.codes.INVALID_LOG
			});
		});
	});

	[null, ['bucket']].forEach(bucket => {
		it('should throw LogError when the bucket given is invalid', () => {

			assert.throws(() => Log.add(bucket, fakeLog), {
				name: 'LogError',
				code: LogError.codes.INVALID_BUCKET
			});
		});
	});
});
