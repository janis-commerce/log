'use strict';

const { struct } = require('@janiscommerce/superstruct');

const { v4: UUID } = require('uuid');

const LogError = require('../log-error');

const logStruct = {
	id: 'string&!empty',
	service: 'string&!empty',
	entity: 'string&!empty',
	entityId: 'string?|number?',
	type: 'string&!empty',
	log: 'object?|array?',
	message: 'string?',
	client: 'string&!empty',
	userCreated: 'string?|null?'
};

module.exports = (rawLog, client, serviceName) => {

	try {
		const Struct = struct.partial(logStruct, {
			id: UUID(),
			service: serviceName,
			client
		});

		const validLog = Struct(rawLog);

		if(validLog.log)
			validLog.log = JSON.stringify(validLog.log);

		if(validLog.userCreated === null)
			delete validLog.userCreated;

		return {
			...validLog,
			dateCreated: new Date().toISOString()
		};

	} catch(err) {
		throw new LogError(err.message, LogError.codes.INVALID_LOG);
	}
};
