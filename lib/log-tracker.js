'use strict';

/**
 * @typedef {object} LogTrackItem
 * @property {string} name
 * @property {*} data
 */

module.exports = class LogTracker {

	/**
	 * @param {import('./log')} LogHandler
	 */
	constructor(LogHandler) {
		this.logHandler = LogHandler;
		/** @type {Array<LogTrackItem>} */
		this.data = [];
	}

	/**
	 * @param {string} name
	 * @param {*} data
	 */
	add(name, data) {
		this.data.push({ name, data });
	}

	/**
	 * @returns {Array<LogTrackItem>}
	 */
	dump() {
		return this.data;
	}

	/**
	 * @param {import('./log').LogData} log
	 * @returns {Promise<void>}
	 */
	async log(log) {
		await this.logHandler.add(this.session.clientCode, {
			...log,
			log: this.dump()
		});

		this.data = [];
	}

};
