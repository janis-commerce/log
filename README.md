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

## Errors

The errors are informed with a `LogError`.  
This object has a code that can be useful for a correct error handling.  
The codes are the following:  

| Code | Description                    |
|------|--------------------------------|
| 1    | Invalid log                    |
| 2    | Invalid bucket                 |
| 3    | S3 Error                       |

## Usage
```js
const Log = require('@janiscommerce/log');

Log.add({
	type: 1,
	entity: 'api',
	entity_id: 'product',
	message: '[GET] Request from 0.0.0.0 of custom_data'
	// ...
}, 'my-bucket');
```

## Notes
In order to connect into the S3, this package uses ENV variables for getting the AWS access keys.

```sh
export AWS_ACCESS_KEY_ID='S3RVER'
export AWS_SECRET_ACCESS_KEY='S3RVER'
```