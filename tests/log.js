'use strict';

const assert = require('assert');

const sinon = require('sinon');

const { default: axios } = require('axios');

const Events = require('@janiscommerce/events');
const Log = require('../lib/log');
const FirehoseInstance = require('../lib/firehose-instance');

const { formatLog } = require('./utils/helpers');

const { cleanListeningEndedEvent } = require('../lib/helpers/events');

describe('Log', () => {

	const now = new Date();

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
		sinon.useFakeTimers(now);
		sinon.stub(FirehoseInstance.prototype, 'putRecords').resolves();
		sinon.spy(Events, 'on');
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		sinon.restore();
		Events.off();
		cleanListeningEndedEvent();
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

			it('Should send log to Firehose with dateCrated when received as string', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service',
					dateCreated: new Date().toISOString()
				};

				await Log.add('some-client', expectedLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send log to Firehose with dateCrated when received as date', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service',
					dateCreated: new Date()
				};

				await Log.add('some-client', expectedLog);

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

				const dateCreated = new Date();
				dateCreated.setSeconds(dateCreated.getSeconds() - 10);

				const expectedLog = {
					...minimalLog,
					service: 'default-service', // from env
					dateCreated
				};

				await Log.add('some-client', {
					...minimalLog,
					dateCreated: dateCreated.toISOString()
				});

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [{
					...formatLog(expectedLog, 'some-client'),
					sendToTraceDelay: 10
				}]);
			});

			it('Should send log to Firehose when entityId not received', async () => {

				const { service, entityId, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env
				};

				await Log.add('some-client', { ...minimalLog });

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send log to Firehose when message not received', async () => {

				const { service, message, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env
				};

				await Log.add('some-client', { ...minimalLog });

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should send log to Firehose with functionName in log when JANIS_FUNCTION_NAME env var exists', async () => {

				process.env.JANIS_FUNCTION_NAME = 'UpdateProduct';

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', 'UpdateProduct')]);
			});

			it('Should send log to Firehose with functionName in log when AWS_LAMBDA_FUNCTION_NAME env var exists', async () => {

				process.env.AWS_LAMBDA_FUNCTION_NAME = 'UpdateProductQueueConsumer';

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', 'UpdateProductQueueConsumer')]);
			});

			it('Should send log to Firehose with functionName@requestId when function name and AWS_LAMBDA_REQUEST_ID env vars exist', async () => {

				process.env.JANIS_FUNCTION_NAME = 'UpdateProduct';
				process.env.AWS_LAMBDA_REQUEST_ID = 'test-request-id';

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', 'UpdateProduct@test-request-id')]);
			});

			it('Should send log to Firehose with unknown@requestId when only AWS_LAMBDA_REQUEST_ID env var exists', async () => {

				process.env.AWS_LAMBDA_REQUEST_ID = 'test-request-id';

				await Log.add('some-client', sampleLog);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(sampleLog, 'some-client', 'unknown@test-request-id')]);
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

		context('When deriving the entities field', () => {

			const getSentLog = () => {
				const [sentLogs] = FirehoseInstance.prototype.putRecords.firstCall.args;
				return sentLogs[0];
			};

			it('Should derive entities as [entity] for an individual log', async () => {

				await Log.add('some-client', sampleLog);

				assert.deepStrictEqual(getSentLog().entities, ['product']);
			});

			it('Should derive entities as [entity] for a grouped same-entity log', async () => {

				const { entityId, ...groupedLog } = sampleLog;

				await Log.add('some-client', {
					...groupedLog,
					entity: 'price',
					relatedEntities: ['price:665e1aef3029f32339214b04', 'price:665e1aef3029f32339214b05']
				});

				assert.deepStrictEqual(getSentLog().entities, ['price']);
			});

			it('Should derive multi-entity entities with the log entity first, then the new prefixes', async () => {

				const { entityId, ...groupedLog } = sampleLog;

				await Log.add('some-client', {
					...groupedLog,
					entity: 'price',
					relatedEntities: ['base-price:665e1aef3029f32339214b04', 'price:665e1aef3029f32339214b05']
				});

				assert.deepStrictEqual(getSentLog().entities, ['price', 'base-price']);
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

			afterEach(() => {

				// siempre que la extensión está activa, se carga el evento janiscommerce.ended
				sinon.assert.calledOnceWithExactly(Events.on, 'janiscommerce.ended', sinon.match.func);
			});

			it('Should send logs to extension local server', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				await Log.add('some-client', minimalLog);

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				sinon.assert.calledOnceWithExactly(axios.post, 'http://127.0.0.1:8585/logs', {
					logs: [formatLog(expectedLog, 'some-client', false, false, false, true)]
				}, {
					timeout: 300
				});

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should not send logs to extension local server if they are more than 100 and go directly to firehose', async () => {

				const { service, userCreated, ...minimalLog } = sampleLog;

				const expectedLog = {
					...minimalLog,
					service: 'default-service' // from env in bootstrap.js
				};

				await Log.add('some-client', new Array(120).fill(minimalLog));

				const formattedLog = formatLog(expectedLog, 'some-client');

				sinon.assert.notCalled(axios.post);

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, new Array(120).fill(formattedLog));
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
					logs: [formatLog(expectedLog, 'some-client', false, false, false, true)]
				}, {
					timeout: 300
				});

				sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
			});

			it('Should call /end when janiscommerce.ended was called', async () => {

				await Log.add('some-client', sampleLog);

				await Events.emit('janiscommerce.ended');

				sinon.assert.calledTwice(axios.post);

				sinon.assert.calledWithExactly(axios.post, 'http://127.0.0.1:8585/logs', {
					logs: [formatLog(sampleLog, 'some-client', false, false, false, true)]
				}, {
					timeout: 300
				});

				sinon.assert.calledWithExactly(axios.post, 'http://127.0.0.1:8585/end', undefined, { timeout: 1000 });

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should call twice to /logs and once to /end when multiple logs added separately', async () => {

				await Log.add('some-client', sampleLog);

				await Log.add('some-client', sampleLog);

				await Events.emit('janiscommerce.ended');

				sinon.assert.calledThrice(axios.post);

				for(let indexCall = 0; indexCall <= 1; indexCall++) {
					sinon.assert.calledWithExactly(axios.post.getCall(indexCall), 'http://127.0.0.1:8585/logs', {
						logs: [formatLog(sampleLog, 'some-client', false, false, false, true)]
					}, {
						timeout: 300
					});
				}

				sinon.assert.calledWithExactly(axios.post.getCall(2), 'http://127.0.0.1:8585/end', undefined, { timeout: 1000 });

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});

			it('Should not reject when /end endpoint rejects', async () => {

				axios.post.onCall(1)
					.rejects(new Error('Error while calling /end'));

				await Log.add('some-client', sampleLog);

				await Events.emit('janiscommerce.ended');

				sinon.assert.calledTwice(axios.post);

				sinon.assert.calledWithExactly(axios.post, 'http://127.0.0.1:8585/logs', {
					logs: [formatLog(sampleLog, 'some-client', false, false, false, true)]
				}, {
					timeout: 300
				});

				sinon.assert.calledWithExactly(axios.post, 'http://127.0.0.1:8585/end', undefined, { timeout: 1000 });

				sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
			});
		});
	});

	describe('CORE_CLIENT', () => {

		it('Should expose the sentinel client value used for core logs', () => {
			assert.strictEqual(Log.CORE_CLIENT, '__core__');
		});
	});

	describe('addCore', () => {

		it('Should call add() with the CORE_CLIENT sentinel value and the received logs', async () => {

			sinon.spy(Log, 'add');

			const { service, userCreated, ...minimalLog } = sampleLog;

			const expectedLog = {
				...minimalLog,
				service: 'default-service' // from env in bootstrap.js
			};

			await Log.addCore(minimalLog);

			sinon.assert.calledOnceWithExactly(Log.add, Log.CORE_CLIENT, { ...minimalLog, client: Log.CORE_CLIENT });

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, Log.CORE_CLIENT)]);
		});

		it('Should force the CORE_CLIENT sentinel even when the received log carries its own client', async () => {

			const { service, userCreated, ...minimalLog } = sampleLog;

			const expectedLog = {
				...minimalLog,
				service: 'default-service' // from env in bootstrap.js
			};

			await Log.addCore({ ...minimalLog, client: 'some-real-client' });

			// the log must reach Firehose as CORE_CLIENT, not 'some-real-client'
			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, Log.CORE_CLIENT)]);
		});

		it('Should send multiple core logs to Firehose with the CORE_CLIENT sentinel value', async () => {

			const { service, userCreated, ...minimalLog } = sampleLog;

			const expectedLog = {
				...minimalLog,
				service: 'default-service' // from env in bootstrap.js
			};

			await Log.addCore([minimalLog, minimalLog]);

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [
				formatLog(expectedLog, Log.CORE_CLIENT),
				formatLog(expectedLog, Log.CORE_CLIENT)
			]);
		});

		it('Should not send the core log to Firehose when the received log is invalid', async () => {

			await Log.addCore({ ...sampleLog, entity: undefined });

			sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
		});

		it('Should not send the core log to Firehose when the ENV is not valid', async () => {

			process.env.JANIS_ENV = 'local';

			await Log.addCore(sampleLog);

			sinon.assert.notCalled(FirehoseInstance.prototype.putRecords);
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
				service: 'default-service'
			};

			await Log.sendToTrace([{
				...minimalLog,
				dateCreated: new Date(),
				service: 'default-service',
				entities: ['product'],
				log: JSON.stringify(log),
				client: 'some-client'
			}]);

			sinon.assert.notCalled(axios.post);

			sinon.assert.calledOnceWithExactly(FirehoseInstance.prototype.putRecords, [formatLog(expectedLog, 'some-client')]);
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
