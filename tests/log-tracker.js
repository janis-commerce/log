'use strict';

const sinon = require('sinon');

const Log = require('../lib');

describe('Log tracker', () => {

	const clientCode = 'some-client';
	const customServiceCode = 'custom-service';

	afterEach(() => sinon.restore());

	it('Should save a log with an empty array if no data is added', async () => {

		sinon.stub(Log, 'add');

		const logTracker = Log.createTracker(clientCode);

		await logTracker.log({
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message'
		});

		sinon.assert.calledOnceWithExactly(Log.add, clientCode, {
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message',
			log: []
		});
	});

	it('Should add multiple trackings and save all of them as the log data without a service code', async () => {

		sinon.stub(Log, 'add');

		const logTracker = Log.createTracker(clientCode);
		logTracker.add('foo', { bar: true });
		logTracker.add('baz', 'Some debugging stuff');

		await logTracker.log({
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message'
		});

		sinon.assert.calledOnceWithExactly(Log.add, clientCode, {
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message',
			log: [
				{
					name: 'foo',
					data: { bar: true }
				},
				{
					name: 'baz',
					data: 'Some debugging stuff'
				}
			]
		});
	});

	it('Should add multiple trackings and save all of them as the log data with a custom service code', async () => {

		sinon.stub(Log, 'add');

		const logTracker = Log.createTracker(clientCode);
		logTracker.add('foo', { bar: true });
		logTracker.add('baz', 'Some debugging stuff');

		await logTracker.log({
			service: customServiceCode,
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message'
		});

		sinon.assert.calledOnceWithExactly(Log.add, clientCode, {
			service: customServiceCode,
			type: 'my-type',
			entity: 'my-entity',
			entityId: 'my-entity-id',
			message: 'My message',
			log: [
				{
					name: 'foo',
					data: { bar: true }
				},
				{
					name: 'baz',
					data: 'Some debugging stuff'
				}
			]
		});
	});

});
