# log

[![Build Status](https://travis-ci.org/janis-commerce/log.svg?branch=master)](https://travis-ci.org/janis-commerce/log)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/log/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/log?branch=master)

A package for creating logs in Firehose

## Installation
```sh
npm install @janiscommerce/log
```

## Configuration
### ENV variables
**`JANIS_SERVICE_NAME`** (required): The name of the service that will create the log.  
**`JANIS_ENV`** (required): The stage name that will used as prefix for trace firehose delivery stream.
**`LOG_ROLE_ARN`** (required): The ARN to assume the trace role in order to put records in Firehose.

## API
### **`add(clientCode, logs)`**  
Parameters: `clientCode [String]`, `logs [Object] or [Object array]`  
Puts the recieved log or logs into the janis-trace-firehose

### Log structure
The `log [Object]` parameter have the following structure:
- **`id [String]`** (optional): The ID of the log in UUID V4 format. Default will be auto-generated.
- **`service [String]`** (optional): The service name, if this field not exists, will be obtained from the ENV (**`JANIS_SERVICE_NAME`**)
- **`type [String]`** (required): The log type
- **`entity [String]`** (required): The name of the entity that is creating the log
- **`entityId [String]`** (optional): The ID of the entity that is creating the log
- **`message [String]`** (optional): A general message about the log
- **`log [Object|Array]`** (optional): This property is a JSON that includes all the technical data about your log.

### Log example
```js
{
  id: '0acefd5e-cb90-4531-b27a-e4d236f07539',
  type: 'new',
  entity: 'api',
  entity_id: 'log',
  service: 'trace',
  message: '[GET] Request from 12.345.67.89 to /log',
  date_created: 1559103066,
  log: {
    verb: 'GET',
    headers: {
      'x-forwarded-for': '12.345.67.89',
      'x-forwarded-proto': 'https',
      'x-forwarded-port': '443'
    },
    responseHttpCode: 200
  }
}
```

### **`on(event, callback)`**  
Parameters: `event [String]`, `callback [Function]`
Calls a callback when the specified event is emitted.

## Errors

The errors are informed with a `LogError`.  
This object has a code that can be useful for a correct error handling.  
The codes are the following:  

| Code | Description                    |
|------|--------------------------------|
| 1    | Invalid log                    |
| 2    | Firehose Error                 |
| 3    | Unknown stage name             |

- In case of error while creating your log into S3, this package will emit an event called `create-error`, you can handle it using the `on()` method.
- In case of an invalid log was received this package will emit an event called `validate-error`, you can handle it using the `on()` method.

## Usage
```js
const Log = require('@janiscommerce/log');

Log.add('some-client', {
	type: 1,
	entity: 'api',
	entityId: 'product',
	message: '[GET] Request from 0.0.0.0 of custom_data'
	// ...
});

Log.on('create-error', (log, err) => {
	console.error(`An error occurred while creating the log ${err.message}`);
});

Log.on('validate-error', (log, err) => {
	console.error(`An invalid log was received ${err.message}`);
});
```