'use strict';

class LogError extends Error {

	static get codes() {

		return {
			INVALID_LOG: 1,
			EMPTY_BUCKET: 2,
			S3_ERROR: 3
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