'use strict';

const assert = require('assert');

const sandbox = require('sinon').createSandbox();

const AWS = require('aws-sdk');

const MockRequire = require('mock-require');

MockRequire('aws-sdk', AWS);

const putObjectStub = sandbox.stub();

sandbox.stub(AWS, 'S3').returns({
	putObject: putObjectStub
});

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

const expectedParams = {
	Bucket: 'someBucket',
	Key: 'logs/2019/05/29/a1d2asd1-1a23-a23d-as1d-0asdas2130.json',
	Body: JSON.stringify(fakeLog),
	ContentType: 'application/json'
};

describe('Log', () => {

	beforeEach(() => {
		putObjectStub.returns({
			promise: () => {}
		});
	});

	afterEach(() => {
		putObjectStub.reset();
	});

	it('should call S3.putObject when try to put a log into S3', async () => {

		await Log.add('someBucket', fakeLog);

		sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
		sandbox.assert.calledOnce(putObjectStub);
	});

	it('should generate the log id and date_created when recieves a log without them', async () => {

		const newFakeLog = { ...fakeLog };
		delete newFakeLog.id;
		delete newFakeLog.date_created;

		await Log.add('someBucket', newFakeLog);

		const createdLog = JSON.parse(putObjectStub.lastCall.args[0].Body);

		assert(createdLog.id && createdLog.date_created);

		sandbox.assert.calledOnce(putObjectStub);
	});

	it('should retry when the S3 operation fail', async () => {

		putObjectStub.returns({
			promise: async () => { throw new Error(); }
		});
		putObjectStub.onCall(1).returns({
			promise: () => {}
		});

		await Log.add('someBucket', fakeLog);

		sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
		sandbox.assert.calledTwice(putObjectStub);
	});

	it('should throw then the S3 operation fails and max retries reached', async () => {

		putObjectStub.returns({
			promise: async () => { throw new Error(); }
		});

		await assert.rejects(Log.add('someBucket', fakeLog), {
			name: 'LogError',
			code: LogError.codes.S3_ERROR
		});

		sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
		sandbox.assert.callCount(putObjectStub, 4);
	});

	context('when the bucket or log recieved is invalid', () => {

		[true, 54, ['foo', 'bar'], null].forEach(async log => {

			it('should throw LogError when the log given is invalid', async () => {
				await assert.rejects(Log.add('someBucket', log), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});
		});

		[null, ['bucket']].forEach(async bucket => {
			it('should throw LogError when the bucket given is invalid', async () => {

				await assert.rejects(Log.add(bucket, fakeLog), {
					name: 'LogError',
					code: LogError.codes.INVALID_BUCKET
				});
			});
		});

	});
});
