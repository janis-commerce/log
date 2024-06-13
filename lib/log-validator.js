'use strict';

const Validator = require('fastest-validator');

const v = new Validator({ haltOnFirstError: true });

const schema = {
	id: { type: 'uuid', version: 4 },
	service: { type: 'string', min: 1 },
	entity: { type: 'string', min: 1 },
	entityId: [
		{ type: 'string', min: 1, optional: true },
		{ type: 'number', positive: true, integer: true, optional: true }
	],
	type: { type: 'string', min: 1 },
	message: { type: 'string', optional: true },
	client: { type: 'string', min: 1 },
	userCreated: { type: 'string', optional: true },
	dateCreated: { type: 'date', optional: true },
	sendToTraceDelay: { type: 'number', positive: true, integer: true, optional: true }
};

module.exports = v.compile(schema);
