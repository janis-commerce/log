/* eslint-disable max-len */

'use strict';

const sinon = require('sinon');
const assert = require('assert');

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

	const sampleLogs = {};
	const expectedLogs = {};

	for(let i = 0; i < 10; i++) {
		sampleLogs[i] = {
			...sampleLog,
			id: `8885e503-7272-4c0f-a355-5c7151540e1${i}`
		};
		expectedLogs[i] = formatLogForFirehose(sampleLogs[i]);
	}

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

	const assertPutRecordBatch = calls => {
		sinon.assert.callCount(Firehose.prototype.putRecordBatch, calls.length);
		calls.forEach((call, index) => {
			sinon.assert.calledWithExactly(Firehose.prototype.putRecordBatch.getCall(index), {
				DeliveryStreamName: deliveryStreamName,
				Records: call
			});
		});
	};

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
				TRACE_FIREHOSE_DELIVERY_STREAM: deliveryStreamName,
				JANIS_FUNCTION_NAME: 'some-function-name',
				JANIS_API_REQUEST_LOG_ID: '16d6840f-0887-401b-8916-4681b9611069'
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

		it('Should truncate log if it exceeds the max record size', async () => {

			const logContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed in cursus nibh. Aenean mattis ex et dictum ultricies. Suspendisse potenti. Curabitur dictum, nunc at commodo feugiat, urna mi bibendum velit, ac vulputate urna est sed est. Fusce nec libero eu elit tincidunt tincidunt. Sed euismod nibh orci, ac scelerisque eros tristique ut. Sed vitae libero vitae turpis venenatis tincidunt. Mauris tristique volutpat euismod. Vivamus faucibus dui vitae placerat cursus. Etiam pellentesque, dui nec ornare faucibus, elit orci dictum justo, et pharetra odio augue ac velit. Nullam sit amet varius enim, sed dictum mi. Proin ac blandit augue, in imperdiet ex. Pellentesque ac posuere ex. Donec ullamcorper, nulla at vestibulum fringilla, odio nisl dictum leo, nec dictum odio velit vitae lorem. Vestibulum in quam id urna mattis vehicula. Pellentesque nec commodo massa.';

			const log = {
				...sampleLog,
				log: { text: logContent.repeat(1500) }
			};

			const formattedLog = formatLogForFirehose({
				...sampleLog,
				log: {
					truncated: true,
					functionName: 'some-function-name',
					apiRequestLogId: '16d6840f-0887-401b-8916-4681b9611069'
				}
			});

			await firehoseInstance.putRecords([log]);

			assertPutRecordBatch([[formattedLog]]);
			assertAssumeRole();
		});

		it('Should create batches with up to 500 records', async () => {

			const logs = [];

			for(let i = 0; i < 700; i++) {
				logs.push({
					...sampleLog,
					id: `8885e503-7272-4c0f-a355-5c7151540e1${i}`
				});
			}

			const result = await firehoseInstance.putRecords(logs);

			assert.deepStrictEqual(result, {
				successCount: 700,
				failedCount: 0
			});

			sinon.assert.callCount(Firehose.prototype.putRecordBatch, 2);
		});

		context('When Firehose response with errors', () => {

			it('Should retry and end process successfully when the log can be sent', async () => {

				Firehose.prototype.putRecordBatch
					.onCall(0)
					.resolves({ FailedPutCount: 1 })
					.onCall(1)
					.resolves();

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 1,
					failedCount: 0
				});

				assertPutRecordBatch([
					[formatLogForFirehose(sampleLog)],
					[formatLogForFirehose(sampleLog)]
				]);

				assertAssumeRole();
			});

			it('Should retry and end process with error when max retries for individual Log reached', async () => {

				Firehose.prototype.putRecordBatch
					.onCall(0)
					.resolves({ FailedPutCount: 1 })
					.onCall(1)
					.resolves({ FailedPutCount: 1 })
					.onCall(2)
					.resolves(); // will not be called

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 1
				});

				assertPutRecordBatch([
					[formatLogForFirehose(sampleLog)],
					[formatLogForFirehose(sampleLog)]
				]);

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

				const result = await firehoseInstance.putRecords([sampleLog, sampleLog2]);

				assert.deepStrictEqual(result, {
					successCount: 2,
					failedCount: 0
				});

				assertPutRecordBatch([
					[formatLogForFirehose(sampleLog), formatLogForFirehose(sampleLog2)],
					[formatLogForFirehose(sampleLog2)]
				]);

				assertAssumeRole();
			});

			it('Should retry and split logs until there is one per request (4 logs)', async () => {

				Firehose.prototype.putRecordBatch.resolves({ FailedPutCount: 1 });

				const result = await firehoseInstance.putRecords([
					// 4 logs
					sampleLogs[0],
					sampleLogs[1],
					sampleLogs[2],
					sampleLogs[3]
				]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 4
				});

				assertPutRecordBatch([
					// (Attempt 1) Split by 500 -> 4 logs per request
					// (Attempt 2) Split in half -> 2 logs per request
					// (Attempt 3) Split in half each 2 batch -> 1
					// (Attempt 4) Retry individual log -> 1 log per request
					[expectedLogs[0], expectedLogs[1], expectedLogs[2], expectedLogs[3]],
					[expectedLogs[0], expectedLogs[1]],
					[expectedLogs[0]],
					[expectedLogs[0]],
					[expectedLogs[1]],
					[expectedLogs[1]],

					[expectedLogs[2], expectedLogs[3]],
					[expectedLogs[2]],
					[expectedLogs[2]],
					[expectedLogs[3]],
					[expectedLogs[3]]
				]);

				assertAssumeRole();
			});

			it('Should retry and split logs until there is one per request (10 logs)', async () => {

				Firehose.prototype.putRecordBatch.resolves({ FailedPutCount: 1 });

				const result = await firehoseInstance.putRecords([
					// 10 logs
					sampleLogs[0],
					sampleLogs[1],
					sampleLogs[2],
					sampleLogs[3],
					sampleLogs[4],
					sampleLogs[5],
					sampleLogs[6],
					sampleLogs[7],
					sampleLogs[8],
					sampleLogs[9]
				]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 10
				});

				assertPutRecordBatch([
					[expectedLogs[0], expectedLogs[1], expectedLogs[2], expectedLogs[3], expectedLogs[4], expectedLogs[5], expectedLogs[6], expectedLogs[7], expectedLogs[8], expectedLogs[9]],
					[expectedLogs[0], expectedLogs[1], expectedLogs[2], expectedLogs[3], expectedLogs[4]],
					[expectedLogs[0], expectedLogs[1], expectedLogs[2]],
					[expectedLogs[0], expectedLogs[1]],
					[expectedLogs[0]],
					[expectedLogs[1]],
					[expectedLogs[2]], // este re-intento equivale al de 0+1, pero va solo porque antes habian sido 3
					[expectedLogs[2]], // re-intento individual por ultimo retry (5), equivalente a los de 0 y 1 (individuales)
					[expectedLogs[3], expectedLogs[4]],
					[expectedLogs[3]],
					[expectedLogs[3]],
					[expectedLogs[4]],
					[expectedLogs[4]],

					[expectedLogs[5], expectedLogs[6], expectedLogs[7], expectedLogs[8], expectedLogs[9]],
					[expectedLogs[5], expectedLogs[6], expectedLogs[7]],
					[expectedLogs[5], expectedLogs[6]],
					[expectedLogs[5]],
					[expectedLogs[6]],
					[expectedLogs[7]], // este re-intento equivale al de 5+6, pero va solo porque antes habian sido 3
					[expectedLogs[7]], // re-intento individual por ultimo retry (5), equivalente a los de 5 y 6 (individuales)
					[expectedLogs[8], expectedLogs[9]],
					[expectedLogs[8]],
					[expectedLogs[8]],
					[expectedLogs[9]],
					[expectedLogs[9]]
				]);

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

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 1,
					failedCount: 0
				});

				assertPutRecordBatch([
					[formatLogForFirehose(sampleLog)],
					[formatLogForFirehose(sampleLog)]
				]);

				assertAssumeRole();
			});

			it('Should retry but end process when max retries reached', async () => {

				Firehose.prototype.putRecordBatch.rejects(new Error('Fail to put records'));

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 1
				});

				assertPutRecordBatch([
					[formatLogForFirehose(sampleLog)],
					[formatLogForFirehose(sampleLog)]
				]);

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

			it('Should not call Firehose putRecordBatch when STS rejects', async () => {

				STS.prototype.assumeRole.rejects(new Error('Fail to assume role'));

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 1
				});

				assertAssumeRole();
			});

			it('Should not call Firehose putRecordBatch when STS resolves an invalid result', async () => {

				STS.prototype.assumeRole.resolves(null);

				const result = await firehoseInstance.putRecords([sampleLog]);

				assert.deepStrictEqual(result, {
					successCount: 0,
					failedCount: 1
				});

				assertAssumeRole();
			});
		});
	});
});
