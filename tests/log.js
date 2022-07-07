'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Settings = require('@janiscommerce/settings');

const { STS, Firehose } = require('../lib/aws-wrappers');

const Log = require('../lib/log');
const LogError = require('../lib/log-error');
const FirehoseInstance = require('../lib/firehose-instance');

describe('Log', () => {

	const sampleLog = {
		id: '8885e503-7272-4c0f-a355-5c7151540e18',
		service: 'catalog',
		entity: 'product',
		entityId: '62c5875be0821f812f2737b9',
		type: 'updated',
		message: 'The product was successfully updated',
		userCreated: '608c1589c063516b506fce19',
		log: { color: 'red' }
	};

	const role = {
		Credentials: {
			AccessKeyId: 'some-access-key-id',
			SecretAccessKey: 'some-secret-access-key',
			SessionToken: 'some-session-token'
		},
		Expiration: '2020-02-27T21:07:21.177'
	};

	const clearCaches = () => {
		delete FirehoseInstance.credentialsExpiration;
		delete FirehoseInstance.firehose;
	};

	let fakeTime = null;

	const originalEnv = { ...process.env };

	beforeEach(() => {
		fakeTime = sinon.useFakeTimers(new Date());
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		clearCaches();
		sinon.restore();
	});

	const formatLog = (rawLog, client, functionName, apiRequestLogId) => {

		const {
			id, service, entity, entityId, type, message, userCreated
		} = rawLog;

		const log = {
			...functionName && { functionName },
			...apiRequestLogId && { apiRequestLogId },
			...rawLog.log
		};

		const formattedLog = {
			id,
			service,
			entity,
			entityId,
			type,
			message,
			client,
			...Object.keys(log).length && { log: JSON.stringify(log) },
			...userCreated !== null && { userCreated },
			dateCreated: new Date().toISOString()
		};

		return { Data: Buffer.from(JSON.stringify(formattedLog)) };
	};

	const stubAssumeRole = () => {
		sinon.stub(STS.prototype, 'assumeRole')
			.resolves({ ...role, Expiration: new Date().toISOString() });
	};

	const assertAssumeRole = () => {
		sinon.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
			RoleArn: 'some-role-arn',
			RoleSessionName: 'default-service',
			DurationSeconds: 1800
		});
	};

	describe('add', () => {

		context('When env is not valid to add logs', () => {

			beforeEach(() => {
				sinon.spy(STS.prototype, 'assumeRole');
				sinon.spy(Firehose.prototype, 'putRecordBatch');
			});

			afterEach(() => {
				sinon.assert.notCalled(STS.prototype.assumeRole);
				sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
			});

			it('Should not send the log to Firehose when the env is local', async () => {

				process.env.JANIS_ENV = 'local';

				await Log.add('some-client', sampleLog);
			});

			it('Should reject and not call Firehose putRecordBatch when ENV stage variable is invalid', async () => {

				process.env.JANIS_ENV = 'invalid-env';

				await assert.rejects(Log.add('some-client', sampleLog), {
					name: 'LogError',
					code: LogError.codes.NO_ENVIRONMENT
				});
			});
		});

		context('When the received log is invalid', () => {

			beforeEach(() => {
				sinon.spy(STS.prototype, 'assumeRole');
				sinon.spy(Firehose.prototype, 'putRecordBatch');
			});

			afterEach(() => {
				sinon.assert.notCalled(STS.prototype.assumeRole);
				sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
			});

			const invalidLogs = [
				{ log: { ...sampleLog, entity: undefined }, errorMessage: 'entity is not a string' },
				{ log: { ...sampleLog, entity: { not: 'a string' } }, errorMessage: 'entity is not a string' },
				{ log: { ...sampleLog, entityId: ['not a number/string'] }, errorMessage: 'entityId is an array' },
				{ log: { ...sampleLog, type: 1 }, errorMessage: 'type received as a number' },
				{ log: { ...sampleLog, log: 'not an object' }, errorMessage: 'log received as string' },
				{ log: { ...sampleLog, message: { not: 'a string' } }, errorMessage: 'message received as an object' },
				{ log: { ...sampleLog, client: ['not a string'] }, errorMessage: 'client received as an array' },
				{ log: { ...sampleLog, userCreated: 1 }, errorMessage: 'userCreated received as number' }
			];

			invalidLogs.forEach(({ log, errorMessage }) => {
				it(`Should throw and not try to send the log to Firehose when ${errorMessage}`, async () => {
					await Log.add('some-client', log);
				});
			});

			it('Should not call Firehose putRecordBatch when ENV service variable not exists', async () => {

				process.env.JANIS_SERVICE_NAME = '';

				await Log.add('some-client', { ...sampleLog, service: undefined });
			});
		});

		context('When valid logs received', () => {

			it('Should split the received logs into batches of 500 logs', async () => {

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', Array(1250).fill(sampleLog));

				sinon.assert.calledThrice(Firehose.prototype.putRecordBatch);

				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch, { // 2 times
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: Array(500).fill(formatLog(sampleLog, 'some-client'))
				});

				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch, { // last batch
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: Array(250).fill(formatLog(sampleLog, 'some-client'))
				});

				assertAssumeRole();
			});

			it('Should send logs to Firehose and cache the assumed role credentials', async () => {

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', sampleLog);

				await Log.add('other-client', sampleLog);

				sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

				['some-client', 'other-client'].forEach(client => {
					sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch, {
						DeliveryStreamName: 'JanisTraceFirehoseBeta',
						Records: [formatLog(sampleLog, client)]
					});
				});

				assertAssumeRole();
			});

			it('Should get new role credentials when the previous ones expires', async () => {

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', sampleLog);

				fakeTime.tick(1900000); // more than 30 min

				await Log.add('other-client',	 sampleLog);

				sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

				sinon.assert.calledTwice(STS.prototype.assumeRole);
				sinon.assert.alwaysCalledWithExactly(STS.prototype.assumeRole, {
					RoleArn: 'some-role-arn',
					RoleSessionName: 'default-service',
					DurationSeconds: 1800
				});
			});

			it('Should send log to Firehose without credentials if there are no Role ARN ENV', async () => {

				process.env.LOG_ROLE_ARN = '';

				sinon.spy(STS.prototype, 'assumeRole');

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [formatLog(sampleLog, 'some-client')]
				});

				sinon.assert.notCalled(STS.prototype.assumeRole);
			});

			it('Should send log to Firehose with defaults values', async () => {

				sinon.stub(STS.prototype, 'assumeRole')
					.resolves({ ...role, Expiration: new Date().toISOString() });

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env
				};

				await Log.add('some-client', minimalLog);

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [formatLog(expectedLog, 'some-client')]
				});

				assertAssumeRole();
			});

			it('Should send log to Firehouse with functionName in log when JANIS_FUNCTION_NAME env var exists', async () => {

				process.env.JANIS_FUNCTION_NAME = 'UpdateProduct';

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [formatLog(sampleLog, 'some-client', 'UpdateProduct')]
				});

				assertAssumeRole();
			});

			it('Should send log to Firehouse with apiRequestLogId in log when JANIS_API_REQUEST_LOG_ID env var exists', async () => {

				const apiRequestLogId = '1dc1149c-8ebc-4405-adbf-30463448af1f';
				process.env.JANIS_API_REQUEST_LOG_ID = apiRequestLogId;

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [formatLog(sampleLog, 'some-client', null, apiRequestLogId)]
				});

				assertAssumeRole();
			});

			it('Should send log to Firehouse with empty log', async () => {

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				const { log, ...logWithoutLog } = sampleLog;

				await Log.add('some-client', logWithoutLog);

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [
						formatLog(logWithoutLog, 'some-client')
					]
				});

				assertAssumeRole();
			});

			it('Should send log to Firehouse with formatted log field as object when an array was received', async () => {

				stubAssumeRole();

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.resolves();

				await Log.add('some-client', {
					...sampleLog,
					log: [sampleLog.log]
				});

				sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [
						formatLog({ ...sampleLog, log: { data: [sampleLog.log] } }, 'some-client')
					]
				});

				assertAssumeRole();
			});
		});

		context('When Firehouse fails', () => {

			beforeEach(() => {
				sinon.stub(STS.prototype, 'assumeRole')
					.resolves({ ...role, Expiration: new Date().toISOString() });
			});

			afterEach(() => {
				assertAssumeRole();
			});

			it('Should retry and end process successfully when the log can be sent', async () => {

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.onFirstCall()
					.rejects()
					.onSecondCall()
					.resolves();

				await Log.add('some-client', sampleLog);

				sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseBeta',
					Records: [formatLog(sampleLog, 'some-client')]
				});
			});

			it('Should retry when and end process when max retries reached', async () => {

				process.env.JANIS_ENV = 'qa';

				sinon.stub(Firehose.prototype, 'putRecordBatch')
					.rejects();

				await Log.add('some-client', sampleLog);

				sinon.assert.calledThrice(Firehose.prototype.putRecordBatch);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: 'JanisTraceFirehoseQA',
					Records: [formatLog(sampleLog, 'some-client')]
				});
			});

		});

		context('When STS assumeRole does not work', () => {

			beforeEach(() => {
				sinon.spy(Firehose.prototype, 'putRecordBatch');
			});

			afterEach(() => {
				sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
			});

			it('Should not call Firehose putRecordBatch when STS rejects', async () => {

				sinon.stub(STS.prototype, 'assumeRole')
					.rejects();

				await Log.add('some-client', sampleLog);
			});

			it('Should not call Firehose putRecordBatch when STS resolves an invalid result', async () => {

				sinon.stub(STS.prototype, 'assumeRole')
					.resolves(null);

				await Log.add('some-client', sampleLog);
			});
		});
	});

	describe('Serverless configuration', () => {

		it('Should return the serverless hooks', () => {

			sinon.stub(Settings, 'get')
				.returns('logArnSource');

			assert.deepStrictEqual(Log.serverlessConfiguration, [
				['envVars', {
					LOG_ROLE_ARN: 'logArnSource'
				}], ['iamStatement', {
					action: 'Sts:AssumeRole',
					resource: 'logArnSource'
				}]
			]);

			sinon.assert.calledOnceWithExactly(Settings.get, 'logRoleArn');
		});
	});

	describe('Deprecated method on()', () => {

		it('Should call the method without making anything', () => {
			Log.on();
		});
	});
});
