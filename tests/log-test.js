'use strict';

const assert = require('assert');

const sandbox = require('sinon').createSandbox();

const AWS = require('aws-sdk');

const putObjectStub = sandbox.stub();

sandbox.stub(AWS, 'S3').returns({
	putObject: putObjectStub
});

const Log = require('./../lib/log');
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
	Bucket: 'janis-trace-service-local',
	Key: 'some-client/2019/05/29/a1d2asd1-1a23-a23d-as1d-0asdas2130.json',
	Body: JSON.stringify({ ...fakeLog, service: 'some-service' }),
	ContentType: 'application/json'
};

const setServiceEnvVars = () => {
	process.env.JANIS_SERVICE_NAME = 'some-service';
};

const clearServiceEnvVars = () => {
	delete process.env.JANIS_SERVICE_NAME;
};

const setStageEnvVars = () => {
	process.env.JANIS_ENV = 'local';
};

const clearStageEnvVars = () => {
	delete process.env.JANIS_ENV;
};

const clearCaches = () => {
	delete Log._bucket; // eslint-disable-line
};

describe('Log', () => {

	beforeEach(() => {
		setServiceEnvVars();
		setStageEnvVars();
		putObjectStub.returns({
			promise: () => {}
		});
	});

	afterEach(() => {
		clearServiceEnvVars();
		clearStageEnvVars();
		sandbox.reset();
	});

	after(() => {
		sandbox.restore();
	});

	describe('_validateLog', () => {

		it('should not throw when the received log it\'s correct', async () => {
			assert.doesNotThrow(() => Log._validateLog(fakeLog));
		});

		['log', ['array']].forEach(log => {

			it('should throw when the log is not an object or is an array', () => {

				assert.throws(() => Log._validateLog(log), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});
		});

		context('when the received log doesn\'t have the required fields', () => {

			it('should throw if log.entity not exists', async () => {
				assert.throws(() => Log._validateLog({ type: 1 }), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});

			it('should throw if log.type not exists', async () => {
				assert.throws(() => Log._validateLog({ entity: 'some-entity' }), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});
		});

		context('when the received log fields have incorrect types', () => {

			it('should throw if log.entity is not a string', async () => {
				assert.throws(() => Log._validateLog({ entity: 1, type: 2 }), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});

			it('should throw if log.type is not a string or a number', async () => {
				assert.throws(() => Log._validateLog({ entity: 'some-entity', type: {} }), {
					name: 'LogError',
					code: LogError.codes.INVALID_LOG
				});
			});
		});
	});

	describe('add()', () => {

		it('should call S3.putObject when try to put a log into S3', async () => {

			await Log.add('some-client', fakeLog);

			sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
			sandbox.assert.calledOnce(putObjectStub);
		});

		it('should generate the log id and date_created when recieves a log without them', async () => {

			const newFakeLog = { ...fakeLog };
			delete newFakeLog.id;
			delete newFakeLog.date_created;

			await Log.add('some-client', newFakeLog);

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

			await Log.add('some-client', fakeLog);

			sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
			sandbox.assert.calledTwice(putObjectStub);
		});

		it('should emit \'create-error\' event when the S3 operation fails and max retries reached', async () => {

			let emitted;

			Log.on('create-error', (log, err) => {
				if(log === fakeLog && err.name === 'LogError' && err.code === LogError.codes.S3_ERROR)
					emitted = true;
			});

			putObjectStub.returns({
				promise: async () => { throw new Error(); }
			});

			await Log.add('some-client', fakeLog);

			sandbox.assert.calledWithExactly(putObjectStub, expectedParams);
			sandbox.assert.callCount(putObjectStub, 3);
			assert(emitted);
		});

		it('should emit \'create-error\' event without calling S3.putObject when a LogError occurrs', async () => {

			let emitted;

			Log.on('create-error', (log, err) => {
				if(err.name === 'LogError' && err.code === LogError.codes.INVALID_LOG)
					emitted = true;
			});

			await Log.add('some-client', { some: 'data' });

			sandbox.assert.notCalled(putObjectStub);
			assert(emitted);
		});
	});

	describe('_add()', () => {

		[null, ['client']].forEach(client => {

			it('should reject when the client is invalid', async () => {

				await assert.rejects(Log._add(client, fakeLog), {
					name: 'LogError',
					code: LogError.codes.INVALID_CLIENT
				});
			});

			it('should reject when the service name env not exists', async () => {
				clearServiceEnvVars();
				await assert.rejects(Log._add('some-client', fakeLog), {
					name: 'LogError',
					code: LogError.codes.NO_SERVICE_NAME
				});
			});

			it('should reject when the stage name env for bucket not exists', async () => {
				clearStageEnvVars();
				clearCaches();
				await assert.rejects(Log._add('some-client', fakeLog), {
					name: 'LogError',
					code: LogError.codes.NO_STAGE_NAME
				});
			});
		});
	});
});
