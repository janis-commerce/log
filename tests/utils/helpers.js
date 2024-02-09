'use strict';

module.exports.formatLog = (rawLog, client, functionName, apiRequestLogId) => {

	const {
		id, service, entity, entityId, type, message, dateCreated, userCreated
	} = rawLog;

	const log = {
		...rawLog.log,
		...functionName && { functionName },
		...apiRequestLogId && { apiRequestLogId }
	};

	const formattedLog = {
		id,
		service,
		entity,
		entityId,
		type,
		message,
		client,
		...Object.keys(log).length && { log: JSON.stringify(log) },
		...userCreated && { userCreated },
		dateCreated: dateCreated || new Date().toISOString()
	};

	return formattedLog;
};

module.exports.formatLogForFirehose = rawLog => {
	return { Data: Buffer.from(JSON.stringify(rawLog)) };
};
