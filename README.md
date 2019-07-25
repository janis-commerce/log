# log

[![Build Status](https://travis-ci.org/janis-commerce/log.svg?branch=JCN-112-log)](https://travis-ci.org/janis-commerce/log)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/log/badge.svg?branch=JCN-112-log)](https://coveralls.io/github/janis-commerce/log?branch=JCN-112-log)

A package for creating logs in S3

## Installation
```sh
npm install @janiscommerce/log
```

## API
- `add(log, bucketName)`  
Parameters: `log [Object]`, `bucketName [String]`  
Puts the recieved log into the specified S3 bucket.

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