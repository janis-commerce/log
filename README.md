# log

[![Build Status](https://travis-ci.org/janis-commerce/log.svg?branch=master)](https://travis-ci.org/janis-commerce/log)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/log/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/log?branch=master)

A package for creating logs in S3

## Installation
```sh
npm install @janiscommerce/log
```

## API
- `add(log, bucketName)`  
Parameters: `log [Object]`, `bucketName [String]`  
Puts the recieved log into the specified S3 bucket.

- `on(event, callback)`  
Parameters: `event [String]`, `callback [Function]`
Calls a callback when the specified event is emitted.

## Errors

The errors are informed with a `LogError`.  
This object has a code that can be useful for a correct error handling.  
The codes are the following:  

| Code | Description                    |
|------|--------------------------------|
| 1    | Invalid log                    |
| 2    | Invalid bucket                 |
| 3    | S3 Error                       |

In case of error while creating your log into S3, this package will emit an event called `create-error`, you can handle it using the `on()` method.

## Usage
```js
const Log = require('@janiscommerce/log');

Log.add('my-bucket', {
	type: 1,
	entity: 'api',
	entity_id: 'product',
	message: '[GET] Request from 0.0.0.0 of custom_data'
	// ...
});

Log.on('create-error', (log, err) => {
	console.error(`An error occurred while creating the log ${err.message}`);
});
```

## Notes
In order to connect into S3, this package requires the aws volume in the `docker-compose.yml`.

```yml
volumes:
  ~/.aws:/root/.aws
```