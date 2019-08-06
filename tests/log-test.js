'use strict';

const assert = require('assert');

const sandbox = require('sinon').createSandbox();

const AWS = require('aws-sdk');

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
		sandbox.reset();
	});

	after(() => {
		sandbox.restore();
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

	it('should emit \'create-error\' event when the S3 operation fails and max retries reached', async () => {

		let emitted = false;

		Log.on('create-error', (log, err) => {
			if(log === fakeLog && err.name === 'LogError' && err.code === LogError.codes.S3_ERROR)
				emitted = true;
		});

		putObjectStub.returns({
			promise: async () => { throw new Error(); }
		});

		await Log.add('someBucket', fakeLog);

		sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
		sandbox.assert.callCount(putObjectStub, 3);
		assert(emitted);
	});

	context('when the bucket or log recieved is invalid', () => {

		[true, 54, ['foo', 'bar'], null].forEach(async invalidLog => {

			it('should not call S3.putObject and emit \'create-error\' event when the log is invalid', async () => {

				let emitted = false;

				Log.on('create-error', (log, err) => {
					if(err.name === 'LogError' && err.code === LogError.codes.INVALID_LOG)
						emitted = true;
				});

				await Log.add('someBucket', invalidLog);

				sandbox.assert.notCalled(putObjectStub);
				assert(emitted);
			});
		});

		[null, ['bucket']].forEach(async bucket => {

			it('should not call S3.putObject and emit \'create-error\' event when the bucket is invalid', async () => {

				let emitted = false;

				Log.on('create-error', (log, err) => {
					if(log === fakeLog && err.name === 'LogError' && err.code === LogError.codes.INVALID_BUCKET)
						emitted = true;
				});

				await Log.add(bucket, fakeLog);

				sandbox.assert.notCalled(putObjectStub);
				assert(emitted);
			});
		});
	});
});
