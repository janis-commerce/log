'use strict';

module.exports = class LogError extends Error {

	static get codes() {

		return {
			INVALID_LOG: 1,
			FIREHOSE_ERROR: 2,
			NO_ENVIRONMENT: 3,
			ASSUME_ROLE_ERROR: 4
		};

	}

	constructor(err, code) {
		super(err);
		this.message = err.message || err;
		this.code = code;
		this.name = 'LogError';
	}
};
