'use strict';

class LogError extends Error {

	static get codes() {

		return {
			INVALID_LOG: 1,
			S3_ERROR: 2
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
