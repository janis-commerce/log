'use strict';

module.exports.formatLog = (rawLog, client, functionName, apiRequestLogId, sendToTraceDelay = true, dateAsObject = false) => {

	const {
		id, service, entity, entityId, type, message, dateCreated, userCreated, relatedEntities
	} = rawLog;

	const log = {
		...rawLog.log,
		...functionName && { functionName },
		...apiRequestLogId && { apiRequestLogId }
	};

	// entities is always derived by preFormatLog: the log's own entity first, then any extra prefixes
	// present in the relatedEntities tokens (`entity:id`).
	const entities = [...new Set([entity, ...(relatedEntities || []).map(token => token.split(':')[0])].filter(Boolean))];

	const formattedLog = {
		id,
		client,
		service,
		...entity && { entity }, // optional: a log can carry only relatedEntities
		type,
		...message && { message },
		...entityId && { entityId }, // cause is optional
		...relatedEntities && { relatedEntities },
		entities,
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
