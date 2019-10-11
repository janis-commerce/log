'use strict';

class LogError extends Error {

	static get codes() {

		return {
			INVALID_LOG: 1,
			INVALID_CLIENT: 2,
			S3_ERROR: 3,
			NO_SERVICE_NAME: 4,
			NO_STAGE_NAME: 5
		};

	}

	constructor(err, code) {
		super(err);
		this.message = err.message || err;
		this.code = code;
		this.name = 'LogError';
	}
}

module.exports = LogError;
