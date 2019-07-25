'use strict';

class AWS {
	// ...
}

AWS.S3 = class {

	constructor(config) {
		if(!config.accessKeyId || !config.accessKeyId)
			throw new Error('Invalid config');
	}

	_putObject(obj) {
		try {
			if(this.constructor.throws)
				throw new Error();

			return {
				Bucket: obj.Bucket,
				Key: obj.Key,
				Body: obj.Body,
				ContentType: obj.ContentType
			};
		} catch(err) {
			throw new Error('An imaginary S3 error');
		}
	}

	putObject(obj) {
		return {
			...this._putObject(obj),
			promise: () => this._putObject(obj)
		};
	}

	static restore() {
		this.throws = false;
	}
};

module.exports = AWS;
