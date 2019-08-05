/* eslint-disable no-underscore-dangle */

'use strict';

const md5 = require('md5'); // eslint-disable-line

class AWS {
	// ...
}

AWS.S3 = class {

	constructor(config) {
		if(!config.accessKeyId || !config.secretAccessKey)
			throw new Error('Invalid config');

		this.constructor.timeout = config.httpOptions ? config.httpOptions.timeout || 500 : 500;
		this.constructor.buckets = {};
	}

	static _putObject(obj, callback) {

		if(!callback || typeof callback !== 'function') {
			return {
				promise: () => new Promise((resolve, reject) => {
					this._putObject(obj, (err, res) => {
						if(err)
							return reject(err);

						return resolve(res);
					});
				})
			};
		}

		try {
			if(this.throws)
				throw new Error('Something not real was ocurred');

			if(this.fail)
				setTimeout(() => { callback(new Error('Request timeout')); }, this.timeout);
			else {
				if(!this.buckets[obj.Bucket])
					this.buckets[obj.Bucket] = {};

				this.buckets[obj.Bucket][obj.Key] = {
					AcceptRanges: 'bytes',
					LastModified: new Date(),
					Etag: md5(obj.Body),
					ContentType: obj.ContentType,
					Metadata: {},
					Body: Buffer.from(obj.Body, 'utf-8')
				};

				callback(null, { Etag: this.buckets[obj.Bucket][obj.Key].Etag });
			}

		} catch(err) {
			callback(new Error(`An imaginary S3 error: ${err.message}`));
		}
	}

	putObject(obj, callback) {
		return this.constructor._putObject(obj, callback);
	}

	static _getObject(obj, callback) {

		if(!callback || typeof callback !== 'function') {
			return {
				promise: () => new Promise((resolve, reject) => {
					this._getObject(obj, (err, res) => {
						if(err)
							return reject(err);

						return resolve(res);
					});
				})
			};
		}

		try {
			if(this.throws)
				throw new Error();

			if(this.fail)
				setTimeout(() => { callback(new Error('Request timeout')); }, this.timeout);
			else
				callback(null, this.buckets[obj.Bucket][obj.Key]);

		} catch(err) {
			callback(new Error(`An imaginary S3 error: ${err.message}`));
		}
	}

	getObject(obj, callback) {
		return this.constructor._getObject(obj, callback);
	}

	static get raw() {
		return this.buckets;
	}

	static clearBuckets() {
		this.buckets = {};
	}

	static restore() {
		this.throws = false;
		this.fail = false;
	}
};

module.exports = AWS;

/*

	MockRequire('aws-sdk', 'aws-s3-mock');

	const AWS = require('aws-sdk');

	const S3 = new AWS.S3({
		accessKeyId: 'S3RVER',
		secretAccessKey: 'S3RVER'
	});

	S3.putObject({
		Bucket: 'someBucket',
		Key: '/path/to/file.ext',
		Body: { some: 'content' },
		Content-Type:'application/json'
	})

	Also you can use callback(err, result) or await S3.putObject(params).promise()

	Same for getObject

	AWS.S3.clearBuckets() for wipe all fake data for S3 mock

	AWS.S3.raw Get the S3 buckets and files object

*/
