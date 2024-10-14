'use strict';

module.exports.formatLog = (rawLog, client, functionName, apiRequestLogId, sendToTraceDelay = true, dateAsObject = false) => {

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
		client,
		service,
		entity,
		type,
		...message && { message },
		...entityId && { entityId }, // cause is optional
		...Object.keys(log).length && { log: JSON.stringify(log) },
		...userCreated && { userCreated },
		dateCreated: dateCreated || new Date(),
		...sendToTraceDelay && { sendToTraceDelay: 0 }
	};

	if(typeof formattedLog.dateCreated !== 'string' && !dateAsObject)
		formattedLog.dateCreated = formattedLog.dateCreated.toISOString();

	return formattedLog;
};

module.exports.formatLogForFirehose = rawLog => {
	return { Data: Buffer.from(JSON.stringify(rawLog)) };
};
