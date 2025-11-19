'use strict';

const sinon = require('sinon');

const FirehoseInstance = require('../lib/firehose-instance');
const { STS, Firehose } = require('../lib/aws-wrappers');

const { formatLogForFirehose } = require('./utils/helpers');

describe('Firehose Instance', () => {

	const deliveryStreamName = 'TraceDeliveryStreamName';
	const traceLogRoleArn = 'TraceLogRoleArn';
	const roleSessionName = 'role-session-default-service';

	const sampleLog = {
		id: '8885e503-7272-4c0f-a355-5c7151540e18',
		client: 'some-client',
		service: 'catalog',
		entity: 'product',
		entityId: '62c5875be0821f812f2737b9',
		type: 'updated',
		message: 'The product was successfully updated',
		userCreated: '608c1589c063516b506fce19',
		log: { color: 'red' }
	};

	const clearCache = () => {
		delete FirehoseInstance.credentialsExpiration;
		delete FirehoseInstance.firehose;
	};

	const assertAssumeRole = (callCount = 1) => {

		if(!callCount)
			return sinon.assert.notCalled(STS.prototype.assumeRole);

		sinon.assert.callCount(STS.prototype.assumeRole, callCount);
		sinon.assert.alwaysCalledWithExactly(STS.prototype.assumeRole, {
			RoleArn: traceLogRoleArn,
			RoleSessionName: roleSessionName,
			DurationSeconds: 1800
		});
	};

	const originalEnv = { ...process.env };

	let clock;

	/** @type {FirehoseInstance} */
	let firehoseInstance;

	beforeEach(() => {

		clock = sinon.useFakeTimers(new Date());

		sinon.stub(Firehose.prototype, 'putRecordBatch').resolves({
			FailedPutCount: 0
		});
		sinon.stub(STS.prototype, 'assumeRole')
			.resolves({
				Credentials: {
					AccessKeyId: 'some-access-key-id',
					SecretAccessKey: 'some-secret-access-key',
					SessionToken: 'some-session-token'
				},
				Expiration: new Date().toISOString()
			});

		sinon.stub(process, 'env')
			.value({
				...process.env,
				TRACE_LOG_ROLE_ARN: traceLogRoleArn,
				TRACE_FIREHOSE_DELIVERY_STREAM: deliveryStreamName
			});

		firehoseInstance = new FirehoseInstance();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		sinon.restore();
		clearCache();
	});

	describe('putRecords', async () => {

		it('Should send logs to Firehose and cache the assumed role credentials', async () => {

			await firehoseInstance.putRecords([sampleLog]);

			await firehoseInstance.putRecords([{
				...sampleLog,
				client: 'other-client'
			}]);

			sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

			['some-client', 'other-client'].forEach((client, index) => {

				const clientLog = {
					...sampleLog,
					client
				};

				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(index), {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(clientLog)]
				});
			});

			assertAssumeRole(1);
		});

		it('Should get new role credentials when the previous ones expires', async () => {

			await firehoseInstance.putRecords([sampleLog]);

			clock.tick(1900000); // more than 30 min

			await firehoseInstance.putRecords([sampleLog]);

			sinon.assert.calledTwice(Firehose.prototype.putRecordBatch);

			assertAssumeRole(2);
		});

		it('Should send log to Firehose without credentials if there are no Role ARN ENV', async () => {

			process.env.TRACE_LOG_ROLE_ARN = '';

			await firehoseInstance.putRecords([sampleLog]);

			sinon.assert.calledOnceWithExactly(Firehose.prototype.putRecordBatch, {
				DeliveryStreamName: deliveryStreamName,
				Records: [formatLogForFirehose(sampleLog)]
			});

			assertAssumeRole(0);
		});

		context('When Firehose response with errors', () => {

			it('Should retry and end process successfully when the log can be sent', async () => {

				Firehose.prototype.putRecordBatch
					.onFirstCall()
					.resolves({ FailedPutCount: 1 })
					.onSecondCall()
					.resolves();

				await firehoseInstance.putRecords([sampleLog]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 2);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog)]
				});

				assertAssumeRole();
			});

			it('Should retry only failed records and end process successfully when the log can be sent', async () => {

				Firehose.prototype.putRecordBatch
					.onFirstCall()
					.resolves({
						FailedPutCount: 1,
						RequestResponses: [
							{ RecordId: 'some-record-id' },
							{ RecordId: 'some-record-id-2', ErrorCode: 'ValidationException' }
						]
					})
					.onSecondCall()
					.resolves({ FailedPutCount: 0 });

				const sampleLog2 = {
					...sampleLog,
					id: '915a2b90-d7b7-49a8-9ace-5ed384d52f9e'
				};

				await firehoseInstance.putRecords([sampleLog, sampleLog2]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 2);

				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(0), {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog), formatLogForFirehose(sampleLog2)]
				});

				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(1), {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog2)]
				});

				assertAssumeRole();
			});

			it('Should retry but end process when max retries reached', async () => {

				Firehose.prototype.putRecordBatch.resolves({ FailedPutCount: 1 });

				await firehoseInstance.putRecords([sampleLog]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 5);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog)]
				});

				assertAssumeRole();
			});

			it('Should retry and split logs until there is one per request', async () => {

				Firehose.prototype.putRecordBatch.resolves({ FailedPutCount: 1 });

				await firehoseInstance.putRecords([sampleLog, sampleLog]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 6);

				const expectedLog = formatLogForFirehose(sampleLog);

				// Split by 500
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(0), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog, expectedLog]
				});

				// Split by 100
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(1), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog, expectedLog]
				});

				// Split by 50
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(2), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog, expectedLog]
				});

				// Split by 10
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(3), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog, expectedLog]
				});

				// Split by 1
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(4), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog]
				});
				sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(5), {
					DeliveryStreamName: deliveryStreamName,
					Records: [expectedLog]
				});

				assertAssumeRole();
			});
		});

		context('When Firehose rejects', () => {

			it('Should retry and end process successfully when the log can be sent', async () => {

				Firehose.prototype.putRecordBatch
					.onFirstCall()
					.rejects(new Error('Fail to put records'))
					.onSecondCall()
					.resolves();

				await firehoseInstance.putRecords([sampleLog]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 2);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog)]
				});

				assertAssumeRole();
			});

			it('Should retry but end process when max retries reached', async () => {

				Firehose.prototype.putRecordBatch.rejects(new Error('Fail to put records'));

				await firehoseInstance.putRecords([sampleLog]);

				sinon.assert.callCount(Firehose.prototype.putRecordBatch, 5);

				sinon.assert.alwaysCalledWithExactly(Firehose.prototype.putRecordBatch, {
					DeliveryStreamName: deliveryStreamName,
					Records: [formatLogForFirehose(sampleLog)]
				});

				assertAssumeRole();
			});
		});

		context('When STS assumeRole does not work', () => {

			beforeEach(() => {

				sinon.stub(process, 'env')
					.value({
						...process.env,
						TRACE_LOG_ROLE_ARN: traceLogRoleArn
					});
			});

			afterEach(() => {
			});

			it('Should not call Firehose putRecordBatch when STS rejects', async () => {

				STS.prototype.assumeRole.rejects(new Error('Fail to assume role'));

				await firehoseInstance.putRecords([sampleLog]);

				assertAssumeRole();
			});

			it('Should not call Firehose putRecordBatch when STS resolves an invalid result', async () => {

				STS.prototype.assumeRole.resolves(null);

				await firehoseInstance.putRecords([sampleLog]);

				assertAssumeRole();
			});
		});

	});

});
