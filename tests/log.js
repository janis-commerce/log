'use strict';

const sinon = require('sinon');

const { default: axios } = require('axios');

const Log = require('../lib/log');
const FirehoseInstance = require('../lib/firehose-instance');

const { formatLog } = require('./utils/helpers');

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

	const originalEnv = { ...process.env };

	beforeEach(() => {
		sinon.useFakeTimers(new Date());
		sinon.stub(FirehoseInstance.prototype, 'putRecords').resolves();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		sinon.restore();
	});

	describe('add', () => {

		context('When config is not correct', () => {

			afterEach(() => {
				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should not send the log to Firehose when the ENV is not valid', async () => {

				process.env.JANIS_ENV = 'local';

				await Log.add('some-client', sampleLog);
			});

			it('Should not send the log to Firehose when ENV service variable not exists', async () => {

				process.env.JANIS_ENV = 'beta';
				process.env.JANIS_SERVICE_NAME = '';

				await Log.add('some-client', { ...sampleLog, service: undefined });
			});
		});

		context('When the received log is invalid', () => {

			afterEach(() => {
				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
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
				it(`Should not send the log to Firehose when ${errorMessage}`, async () => {
					await Log.add('some-client', log);
				});
			});
		});

		context('When valid logs received', () => {

			it('Should send log to Firehose with defaults values', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', minimalLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send only the valid logs to Firehose if there are some invalid ones', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', [
					minimalLog,
					{ invalidLog: true }
				]);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send log to Firehose with predefined dateCreated if it is received', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service', // from env
					dateCreated: '2022-11-10T14:00:00.000Z'
				};

				await Log.add('some-client', {
					...minimalLog,
					dateCreated: new Date('2022-11-10T14:00:00.000Z')
				});

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send log to Firehose with functionName in log when JANIS_FUNCTION_NAME env var exists', async () => {

				process.env.JANIS_FUNCTION_NAME = 'UpdateProduct';

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', 'UpdateProduct')]);
			});

			it('Should send log to Firehose with apiRequestLogId in log when JANIS_API_REQUEST_LOG_ID env var exists', async () => {

				const apiRequestLogId = '1dc1149c-8ebc-4405-adbf-30463448af1f';
				process.env.JANIS_API_REQUEST_LOG_ID = apiRequestLogId;

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', null, apiRequestLogId)]);
			});

			it('Should send log to Firehose with empty log', async () => {

				const { log, ...logWithoutLog } = sampleLog;

				await Log.add('some-client', logWithoutLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(logWithoutLog, 'some-client')]);
			});

			it('Should send log to Firehose with formatted log field as object when an array was received', async () => {

				await Log.add('some-client', {
					...sampleLog,
					log: [sampleLog.log]
				});

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog({
					...sampleLog,
					log: {
						data: [sampleLog.log]
					}
				}, 'some-client')]);
			});
		});

		context('When local log batch is enabled', () => {

			beforeEach(() => {
				sinon.stub(process, 'env')
					.value({
						...process.env,
						JANIS_TRACE_EXTENSION_ENABLED: 'true'
					});

				sinon.stub(axios, 'post').resolves({ status: 200 });
			});

			it('Should send logs to extension local server', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', minimalLog);

				sinon.assert.calledOnceWithExactly(axios.post, 'http://127.0.0.1:8585/logs', {
					logs: [formatLog(expectedLog, 'some-client')]
				}, {
					timeout: 300
				});

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should send logs in batches of at most 100 logs to extension local server', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', new Array(120).fill(minimalLog));

				const formattedLog = formatLog(expectedLog, 'some-client');

				sinon.assert.calledTwice(axios.post);
				sinon.assert.calledWithExactly(axios.post.firstCall, 'http://127.0.0.1:8585/logs', {
					logs: new Array(100).fill(formattedLog)
				}, {
					timeout: 300
				});
				sinon.assert.calledWithExactly(axios.post.secondCall, 'http://127.0.0.1:8585/logs', {
					logs: new Array(20).fill(formattedLog)
				}, {
					timeout: 300
				});

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should send logs to Firehose if extension local server fails', async () => {

				axios.post.rejects(new Error('Failed to save logs'));

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', minimalLog);

				sinon.assert.calledOnceWithExactly(axios.post, 'http://127.0.0.1:8585/logs', {
					logs: [formatLog(expectedLog, 'some-client')]
				}, {
					timeout: 300
				});

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});
		});
	});

	describe('sendToTrace', () => {

		beforeEach(() => {

			sinon.stub(process, 'env')
				.value({
					...process.env,
					JANIS_TRACE_EXTENSION_ENABLED: 'true'
				});

			sinon.stub(axios, 'post').resolves({ status: 200 });
		});

		it('Should send logs to Firehose, even if trace extension env var is set', async () => {

			const { service, userCreated, log, ...minimalLog } = sampleLog;

			const expectedLog = {
				...minimalLog,
				log,
				client: 'some-client',
				service: 'default-service', // from env
				dateCreated: '2022-11-10T17:05:17.539Z'
			};

			await Log.sendToTrace([{
				...minimalLog,
				log: JSON.stringify(log),
				client: 'some-client',
				dateCreated: '2022-11-10T17:05:17.539Z'
			}]);

			sinon.assert.notCalled(axios.post);

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
		});

		it('Should send only the valid logs to Firehose, ignoring the invalid ones', async () => {

			const { service, userCreated, log, ...minimalLog } = sampleLog;

			const expectedLog = {
				...minimalLog,
				log,
				client: 'some-client',
				service: 'default-service', // from env
				dateCreated: '2022-11-10T17:05:17.539Z'
			};

			await Log.sendToTrace([{
				...minimalLog,
				log: JSON.stringify(log),
				client: 'some-client',
				dateCreated: '2022-11-10T17:05:17.539Z'
			}, {
				invalidLog: true
			}]);

			sinon.assert.notCalled(axios.post);

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
		});

		it('Should not call Firehose if all logs are invalid', async () => {

			const { service, userCreated, ...minimalLog } = sampleLog;

			await Log.sendToTrace([{
				...minimalLog,
				client: ['invalid']
			}], {
				invalidLog: true
			});

			sinon.assert.notCalled(axios.post);

			sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
		});
	});

	describe('Hide fields from Log', () => {

		it('Should not hide fields when no fields in env var', async () => {

			sinon.stub(process, 'env')
				.value({
					...process.env,
					JANIS_TRACE_PRIVATE_FIELDS: ''
				});

			const logWithFieldsToExclude = {
				configuration: {
					tokens: ['abacabb'],
					organizations: [{
						name: 'janis company',
						credentials: {
							user: 'test',
							password: 'pass'
						}
					},
					null,
					undefined]
				}
			};

			await Log.add('some-client', {
				...sampleLog,
				log: logWithFieldsToExclude
			});

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [
				formatLog({
					...sampleLog,
					log: logWithFieldsToExclude
				}, 'some-client')
			]);
		});

		it('Should hide the defined properties in case they exist in the data to be logged', async () => {

			sinon.stub(process, 'env')
				.value({
					...process.env,
					JANIS_TRACE_PRIVATE_FIELDS: 'credentials, tokens, nickname'
				});

			const logWithFieldsToExclude = {
				configuration: {
					tokens: ['abacabb'],
					organizations: [{
						name: 'janis company',
						credentials: {
							user: 'test',
							password: 'pass'
						}
					},
					null,
					undefined]
				}
			};

			await Log.add('some-client', {
				...sampleLog,
				log: [logWithFieldsToExclude]
			});

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [
				formatLog({
					...sampleLog,
					log: {
						data: [{
							configuration: {
								tokens: '***',
								organizations: [{
									name: 'janis company',
									credentials: '***'
								},
								null,
								undefined]
							}
						}]
					}
				}, 'some-client')
			]);
		});
	});
});
