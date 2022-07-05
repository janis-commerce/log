'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Settings = require('@janiscommerce/settings');

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
		userCreated: '608c1589c063516b506fce19',
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
		client: 'some-client',
		userCreated: fakeLog.userCreated
	};

	const fakeRole = {
		Credentials: {
			AccessKeyId: 'some-access-key-id',
			SecretAccessKey: 'some-secret-access-key',
			SessionToken: 'some-session-token'
		},
		Expiration: '2020-02-27T21:07:21.177'
	};

	const clearCaches = () => {
		delete Log._deliveryStreamName; // eslint-disable-line no-underscore-dangle
		delete Log._credentialsExpiration; // eslint-disable-line no-underscore-dangle
		delete Log._firehose; // eslint-disable-line no-underscore-dangle
	};

	let fakeTime = null;

	afterEach(() => {
		clearCaches();
		sinon.restore();
	});

	beforeEach(() => {
		fakeTime = sinon.useFakeTimers(new Date());
	});

	describe('add', () => {

		it('Should send logs to Firehose and cache the assumed role credentials', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: new Date().toISOString() });

			sinon.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', fakeLog);

			await Log.add('other-client', fakeLog);

			sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);
			sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch, {
				DeliveryStreamName: 'JanisTraceFirehoseBeta',
				Records: [
					{
						Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: new Date() }))
					}
				]
			});

			sinon.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should split the received logs into batches of 500 logs', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: new Date().toISOString() });

			sinon.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', Array(1250).fill(fakeLog));

			sinon.assert.calledThrice(Firehose.prototype.putRecordBatch);
			sinon.assert.calledOnce(STS.prototype.assumeRole);
		});

		it('Should not send the log to Firehose when the env is local', async () => {

			sinon.stub(process.env, 'JANIS_ENV').value('local');

			sinon.spy(STS.prototype, 'assumeRole');
			sinon.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sinon.assert.notCalled(STS.prototype.assumeRole);
			sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should get new role credentials when the previous ones expires', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: new Date().toISOString() });

			sinon.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', fakeLog);

			fakeTime.tick(1900000); // more than 30 min

			await Log.add('other-client',	 fakeLog);

			sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

			sinon.assert.calledTwice(STS.prototype.assumeRole);
			sinon.assert.calledWithExactly(STS.prototype.assumeRole.getCall(0), {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
			sinon.assert.calledWithExactly(STS.prototype.assumeRole.getCall(1), {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should send a log to Firehose with defaults values and not get credentials if there are no Role ARN ENV', async () => {

			sinon.stub(process.env, 'LOG_ROLE_ARN').value('');

			sinon.spy(STS.prototype, 'assumeRole');

			sinon.stub(Firehose.prototype, 'putRecordBatch')
				.resolves();

			await Log.add('some-client', {
				...fakeLog,
				id: undefined,
				service: undefined,
				userCreated: null
			});

			sinon.assert.calledOnce(Firehose.prototype.putRecordBatch);

			const [{ Records }] = Firehose.prototype.putRecordBatch.lastCall.args;

			const uploadedLog = JSON.parse(Records[0].Data.toString());

			const { userCreated, ...restOfLog } = expectedLog;

			sinon.assert.match(uploadedLog, {
				...restOfLog,
				id: sinon.match.string,
				service: 'default-service',
				dateCreated: new Date().toISOString()
			});

			sinon.assert.notCalled(STS.prototype.assumeRole);
		});

		it('Should retry when Firehose fails', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: new Date().toISOString() });

			sinon.stub(Firehose.prototype, 'putRecordBatch');

			Firehose.prototype.putRecordBatch.onFirstCall()
				.rejects();

			Firehose.prototype.putRecordBatch.onSecondCall()
				.resolves();

			console.log(typeof expectedLog.log);

			await Log.add('some-client', fakeLog);

			sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);
			sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
				DeliveryStreamName: 'JanisTraceFirehoseBeta',
				Records: [
					{
						Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: new Date() }))
					}
				]
			});

			sinon.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it.only('Should retry when Firehose fails and emit the create-error event when max retries reached', async () => {

			sinon.stub(process.env, 'JANIS_ENV')
				.value('qa');

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves({ ...fakeRole, Expiration: new Date().toISOString() });

			sinon.stub(Firehose.prototype, 'putRecordBatch')
				.rejects();

			let errorEmitted = false;

			Log.on('create-error', () => {
				errorEmitted = true;
			});

			await Log.add('some-client', { ...fakeLog, log: { a: 1 } });

			assert.deepStrictEqual(errorEmitted, true);

			console.log(JSON.stringify({ ...expectedLog, dateCreated: new Date(), log: JSON.stringify({ a: 1 }) }));

			sinon.assert.calledThrice(Firehose.prototype.putRecordBatch);
			sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
				DeliveryStreamName: 'JanisTraceFirehoseQA',
				Records: [
					{
						Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: new Date(), log: JSON.stringify({ a: 1 }) }))
					}
				]
			});

			sinon.assert.calledOnceWithExactly(STS.prototype.assumeRole, {
				RoleArn: 'some-role-arn',
				RoleSessionName: 'default-service',
				DurationSeconds: 1800
			});
		});

		it('Should not call Firehose putRecordBatch when ENV stage variable not exists', async () => {

			sinon.stub(process.env, 'JANIS_ENV').value('');

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves(fakeRole);

			sinon.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when ENV service variable not exists', async () => {

			sinon.stub(process.env, 'JANIS_SERVICE_NAME').value('');

			sinon.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', { ...fakeLog, service: undefined });

			sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when assume role rejects', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.rejects();

			sinon.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
		});

		it('Should not call Firehose putRecordBatch when assume role returns an invalid result', async () => {

			sinon.stub(STS.prototype, 'assumeRole')
				.resolves(null);

			sinon.spy(Firehose.prototype, 'putRecordBatch');

			await Log.add('some-client', fakeLog);

			sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
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

					sinon.spy(STS.prototype, 'assumeRole');
					sinon.spy(Firehose.prototype, 'putRecordBatch');

					await Log.add('some-client', log);

					sinon.assert.notCalled(STS.prototype.assumeRole);
					sinon.assert.notCalled(Firehose.prototype.putRecordBatch);
				});
			});
		});

	});

	context('Serverless configuration getter', () => {

		it('Should return the serverless hooks', () => {

			sinon.stub(Settings, 'get').returns('logArnSource');

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
});
