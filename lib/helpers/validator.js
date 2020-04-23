'use strict';

const { struct } = require('@janiscommerce/superstruct');

const { v4: UUID } = require('uuid');

const LogError = require('../log-error');

const logStruct = {
	id: 'string',
	service: 'string',
	entity: 'string',
	entityId: 'string?|number?',
	type: 'string',
	log: 'object?|array?',
	message: 'string?',
	client: 'string',
	userCreated: 'string?'
};

class ValidatorHelper {

	static validate(rawLog, client, serviceName) {

		try {
			const Struct = struct.partial(logStruct, {
				id: UUID(),
				service: serviceName,
				client
			});

			const validLog = Struct(rawLog);

			if(validLog.log)
				validLog.log = JSON.stringify(validLog.log);

			return {
				...validLog,
				dateCreated: new Date().toISOString()
			};

		} catch(err) {
			throw new LogError(err.message, LogError.codes.INVALID_LOG);
		}
	}
}

module.exports = ValidatorHelper;
