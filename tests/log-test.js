'use strict';

const assert = require('assert');
const sandbox = require('sinon').createSandbox();

const { STS, Firehose } = require('../lib/aws-wrappers');

const Log = require('../lib/log');

describe('Log', () => {

	const fakeLog = {
		id: 'some-id',
		service: 'some-service',
		type: 'some-type',
		entity: 'some-entity',
		entityId: 'some-entity_id',
		message: 'some-message',
		log: {
			some: 'log'
		}
	};

	const expectedLog = {
		id: 'some-id',
		service: 'some-service',
		entity: fakeLog.entity,
		entityId: fakeLog.entityId,
		type: fakeLog.type,
		log: JSON.stringify(fakeLog.log),
		message: fakeLog.message,
		client: 'some-client'
	};

	const fakeRole = {
		Credentials: {
			AccessKeyId: 'some-access-key-id',
			SecretAccessKey: 'some-secret-access-key',
			SessionToken: 'some-session-token'
		},
		Expiration: '2020-02-27T21:07:21.177'
	};

	const setRoleEnvVars = () => {
		process.env.LOG_ROLE_ARN = 'some-role-arn';
	};

	const clearRoleEnvVars = () => {
		delete process.env.LOG_ROLE_ARN;
	};

	const setServiceEnvVars = () => {
		process.env.JANIS_SERVICE_NAME = 'default-service';
	};

	const clearServiceEnvVars = () => {
		delete process.env.JANIS_SERVICE_NAME;
	};

	const setStageEnvVars = env => {
		process.env.JANIS_ENV = env;
	};

	const clearStageEnvVars = () => {
		delete process.env.JANIS_ENV;
	};

	const clearCaches = () => {
		delete Log._deliveryStreamName; // eslint-disable-line no-underscore-dangle
		delete Log._credentialsExpiration; // eslint-disable-line no-underscore-dangle
		delete Log._firehose; // eslint-disable-line no-underscore-dangle
	};

	afterEach(() => {
		clearRoleEnvVars();
		clearServiceEnvVars();
		clearStageEnvVars();
		clearCaches();
		sandbox.restore();
	});

	beforeEach(() => {
		setRoleEnvVars();
		setServiceEnvVars();
		setStageEnvVars('beta');
	});

	describe('add', () => {

		it('Should send logs to Firehose and cache the assumed role credentials', async () => {

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: fakeTime.Date() });

			sandbox.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', fakeLog);

			await Log.add('other-client', fakeLog);

			sandbox.assert.calledTwice(Firehose.prototype.putRecordBatch);
			sandbox.assert.calledWithExactly(Firehose.prototype.putRecordBatch, {
				DeliveryStreamName: 'JanisTraceFirehoseBeta',
				Records: [
					{
						Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: fakeTime.Date() }))
					}
				]
			});

			sandbox.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should split the received logs into batches of 500 logs', async () => {

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: fakeTime.Date() });

			sandbox.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', Array(1250).fill(fakeLog));

			sandbox.assert.calledThrice(Firehose.prototype.putRecordBatch);
			sandbox.assert.calledOnce(STS.prototype.assumeRole);
		});

		it('Should not send the log to Firehose when the env is local', async () => {

			clearStageEnvVars();
			setStageEnvVars('local');

			sandbox.spy(STS.prototype, 'assumeRole');
			sandbox.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(STS.prototype.assumeRole);
			sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should get new role credentials when the previous ones expires', async () => {

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: fakeTime.Date() });

			sandbox.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', fakeLog);

			fakeTime.tick(1900000); // more than 30 min

			await Log.add('other-client', fakeLog);

			sandbox.assert.calledTwice(Firehose.prototype.putRecordBatch);

			sandbox.assert.calledTwice(STS.prototype.assumeRole);
			sandbox.assert.calledWithExactly(STS.prototype.assumeRole.getCall(0), {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
			sandbox.assert.calledWithExactly(STS.prototype.assumeRole.getCall(1), {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should send a log to Firehose with defaults values and not get credentials if there are no Role ARN ENV', async () => {

			clearRoleEnvVars();

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.spy(STS.prototype, 'assumeRole');

			sandbox.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', {
				...fakeLog,
				id: undefined,
				service: undefined
			});

			sandbox.assert.calledOnce(Firehose.prototype.putRecordBatch);

			const [{ Records }] = Firehose.prototype.putRecordBatch.lastCall.args;

			const uploadedLog = JSON.parse(Records[0].Data.toString());

			sandbox.assert.match(uploadedLog, {
				...expectedLog,
				id: sandbox.match.string,
				service: 'default-service',
				dateCreated: fakeTime.Date().toISOString()
			});

			sandbox.assert.notCalled(STS.prototype.assumeRole);
		});

		it('Should retry when Firehose fails and emit the create-error event when max retries reached', async () => {

			clearStageEnvVars();
			setStageEnvVars('qa');

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: fakeTime.Date() });

			sandbox.stub(Firehose.prototype, 'putRecordBatch')
				.throws();

			let errorEmitted = false;

			Log.on('create-error', () => {
				errorEmitted = true;
			});

			await Log.add('some-client', { ...fakeLog, log: undefined });

			sandbox.assert.calledThrice(Firehose.prototype.putRecordBatch);

			assert.deepEqual(errorEmitted, true);

			[0, 1, 2].forEach(call => {

				sandbox.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(call), {
					DeliveryStreamName: 'JanisTraceFirehoseQA',
					Records: [
						{
							Data: Buffer.from(JSON.stringify({ ...expectedLog, log: undefined, dateCreated: fakeTime.Date() }))
						}
					]
				});
			});

			sandbox.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should not call Firehose putRecordBatch when ENV stage variable not exists', async () => {

			clearStageEnvVars();

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves(fakeRole);

			sandbox.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when ENV service variable not exists', async () => {

			clearServiceEnvVars();

			sandbox.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', { ...fakeLog, service: undefined });

			sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when assume role rejects', async () => {

			sandbox.stub(STS.prototype, 'assumeRole')
				.rejects();

			sandbox.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when assume role returns an invalid result', async () => {

			sandbox.stub(STS.prototype, 'assumeRole')
				.resolves(null);

			sandbox.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		context('When the received log is invalid', () => {

			[

				{ ...fakeLog, entity: undefined },
				{ ...fakeLog, entity: { not: 'a string' } },
				{ ...fakeLog, entityId: ['not a number/string'] },
				{ ...fakeLog, type: 1 },
				{ ...fakeLog, log: 'not an object/array' },
				{ ...fakeLog, message: { not: 'a string' } },
				{ ...fakeLog, client: ['not a string'] },
				{ ...fakeLog, userCreated: 1 }

			].forEach(log => {

				it('Should throw and not try to send the log to Firehose', async () => {

					sandbox.spy(STS.prototype, 'assumeRole');
					sandbox.spy(Firehose.prototype, 'putRecordBatch');

					await Log.add('some-client', log);

					sandbox.assert.notCalled(STS.prototype.assumeRole);
					sandbox.assert.notCalled(Firehose.prototype.putRecordBatch);
				});
			});
		});
	});
});
