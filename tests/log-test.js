'use strict';

const assert = require('assert');
const sandbox = require('sinon').createSandbox();

const Firehose = require('../lib/firehose-wrapper');

const Log = require('../lib/log');

describe('Log', () => {

	const fakeLog = {
		id: 'some-log-id',
		type: 'some-type',
		entity: 'some-entity',
		entityId: 'some-entity_id',
		message: 'some-message',
		log: {
			some: 'log'
		}
	};

	const expectedLog = {
		id: fakeLog.id,
		service: 'some-service',
		entity: fakeLog.entity,
		entityId: fakeLog.entityId,
		type: fakeLog.type,
		log: fakeLog.log,
		message: fakeLog.message,
		client: 'some-client'
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
		delete Log._deliveryStreamName; // eslint-disable-line no-underscore-dangle
	};

	afterEach(() => {
		clearServiceEnvVars();
		clearStageEnvVars();
		sandbox.restore();
	});

	beforeEach(() => {
		setServiceEnvVars();
		setStageEnvVars();
	});

	describe('add', () => {

		it('Should send a log to Firehose', async () => {

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(Firehose.prototype, 'putRecord')
				.returns();

			await Log.add('some-client', fakeLog);

			sandbox.assert.calledOnce(Firehose.prototype.putRecord);
			sandbox.assert.calledWithExactly(Firehose.prototype.putRecord, {
				DeliveryStreamName: 'janis-trace-firehose-local',
				Record: {
					Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: fakeTime.Date() }))
				}
			});
		});

		it('Should retry when Firehose fails', async () => {

			const fakeTime = sandbox.useFakeTimers(new Date().getTime());

			sandbox.stub(Firehose.prototype, 'putRecord')
				.throws();

			await Log.add('some-client', fakeLog);

			sandbox.assert.calledThrice(Firehose.prototype.putRecord);

			[0, 1, 2].forEach(call => {

				sandbox.assert.calledWithExactly(Firehose.prototype.putRecord.getCall(call), {
					DeliveryStreamName: 'janis-trace-firehose-local',
					Record: {
						Data: Buffer.from(JSON.stringify({ ...expectedLog, dateCreated: fakeTime.Date() }))
					}
				});
			});
		});

		it('Should not call Firehose putRecord when ENV stage variable not exists', async () => {

			clearStageEnvVars();
			clearCaches();

			sandbox.spy(Firehose.prototype, 'putRecord');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(Firehose.prototype.putRecord);
		});

		it('Should not call Firehose putRecord when ENV service variable not exists', async () => {

			clearServiceEnvVars();
			clearCaches();

			sandbox.spy(Firehose.prototype, 'putRecord');

			await Log.add('some-client', fakeLog);

			sandbox.assert.notCalled(Firehose.prototype.putRecord);
		});

		it('Should emit an error when something goes wrong', async () => {

			let errorEmitted = false;

			Log.on('create-error', () => {
				errorEmitted = true;
			});

			await Log.add('some-client', { invalid: 'log' });

			assert.deepEqual(errorEmitted, true);
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

				it('Should not call Firehose putRecord', async () => {

					sandbox.spy(Firehose.prototype, 'putRecord');

					await Log.add('some-client', log);

					sandbox.assert.notCalled(Firehose.prototype.putRecord);
				});
			});
		});
	});
});
