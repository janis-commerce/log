# log

![Build Status](https://github.com/janis-commerce/log/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/log/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/log?branch=master)
[![npm version](https://badge.fury.io/js/%40janiscommerce%2Flog.svg)](https://www.npmjs.com/package/@janiscommerce/log)

A package for creating logs in Firehose

## 📦 Installation
```sh
npm install @janiscommerce/log
```

## 🔧 Configuration
### ENV variables
**`JANIS_SERVICE_NAME`** (required): The name of the service that will create the log.
**`JANIS_ENV`** (required): The stage name that will used as prefix for trace firehose delivery stream.
**`LOG_ROLE_ARN`** (required): The ARN to assume the trace role in order to put records in Firehose.

## API
### **`add(clientCode, logs)`**
Parameters: `clientCode [String]`, `logs [Object] or [Object array]`
Puts the received log or logs into the janis-trace-firehose

### Log structure
The `log [Object]` parameter have the following structure:
- **`id [String]`** (optional): The ID of the log in UUID V4 format. Default will be auto-generated.
- **`service [String]`** (optional): The service name, if this field not exists, will be obtained from the ENV (**`JANIS_SERVICE_NAME`**)
- **`entity [String]`** (required): The name of the entity that is creating the log.
- **`entityId [String]`** (optional): The ID of the entity that is creating the log.
- **`type [String]`** (required): The log type.
- **`message [String]`** (optional): A general message about the log.
- **`userCreated [String]`** (optional): The user that creates the log.
- **`log [Object|Array]`** (optional): This property is a JSON that includes all the technical data about your log. If `Array` was received, will be transformed as an `Object`.
  - **`log.functionName [String]`**: This field will be completed with ENV variable **`JANIS_FUNCTION_NAME`**. The variable is created in package [@janiscommerce/lambda](https://www.npmjs.com/package/@janiscommerce/lambda)
  - **`log.apiRequestLogId [String]`**: This field will be completed with ENV variable **`JANIS_API_REQUEST_LOG_ID`**. The variable is created in package [@janiscommerce/api](https://www.npmjs.com/package/@janiscommerce/api)

### **`createTracker(clientCode)`**
Parameters: `clientCode [String]`
Create a new tracker to build an incremental log. It returns a [LogTracker](#log-tracker) instance.

## Log Tracker

A log tracker is an object used to build an incremental log to track multiple states of a process. For example, if when you publish a product you can track the initial state of the product, then request that will be made and the response received. Finally you save everything in a log to keep track for debugging purposes.

To use a log tracker, you have to call the `Log.createTracker()` method, which will return an instance of a tracker.
Then you can make as much calls to `logTracker.add()` as you want.
When you're ready to save the log, simply call the `logTracker.log()` method.

Each time you call the `log()` method, the internal state is reset so you can re-use the instance in case you want to.

See the Log Tracker API below:

### **`add(name, data)`**
Parameters: `name [String]`, `data [Object]`
Saves the `data` object associated with a `name` that explains what it is.

### **`log(logData)`**
Parameters: `logData [LogData]`.
Saves the log with the properties passed as LogData. These are the same that are passed to `Log.add()`, except for the `log` property that will be overridden.

## Errors

The errors are informed with a `LogError`.
This object has a code that can be useful for a correct error handling.
The codes are the following:

| Code | Description                    |
|------|--------------------------------|
| 1    | Invalid log                    |
| 2    | Firehose Error                 |
| 3    | Unknown stage name             |

## Usage

<details>
  <summary>Adding basic log</summary>

```js
const Log = require('@janiscommerce/log');

// Single log send
await Log.add('some-client', {
  service: 'oms',
  entity: 'api',
  entityId: 'order',
  type: 'api-request',
  dateCreated: '2020-04-21T17:16:01.324Z',
  log: {
    api: {
      endpoint: 'order/5ea1c7f48efca3c21654d4a3/pick-items',
      httpMethod: 'post'
    },
    request: {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Host: 'oms.host.com',
        'janis-client': 'some-client',
        'X-Amzn-Trace-Id': 'Root=1-fca3c2-5ea1c7f48efca3c21654d4a3',
        'X-Forwarded-For': '12.354.67.890',
        'X-Forwarded-Port': '123',
        'X-Forwarded-Proto': 'https'
      },
      data: {
        0: {
          pickedQuantity: 1,
          pickingSessionId: '5ea1c88463d91e9758f2c1b8',
          pickerId: '5ea1c8895ebb38d472ccd8c3',
          id: '5EA1C88D6E94BC19F7FC1612',
          pickedEans: [
            '1234567890'
          ]
        }
      }
    },
    response: {
      code: 200,
      headers: {},
      body: {}
    },
    executionTime: 868.251946
  }
});
```

</details>

<details>
  <summary>Adding multiple logs in the same request</summary>

```js
const Log = require('@janiscommerce/log');

// Multiple logs send
await Log.add('some-client', [{
  service: 'catalog',
  entity: 'account',
  entityId: '5ea1c8c53fdac68fb60eac9e',
  type: 'upserted',
  dateCreated: '2020-04-22T22:03:50.507Z',
  log: {
    id: '5ea1c8c53fdac68fb60eac9e',
    referenceId: 'rv-000005'
  }
}, {
  service: 'catalog',
  entity: 'account',
  entityId: '5ea1c8cd11f82560a364cbd4',
  type: 'upserted',
  dateCreated: '2020-04-22T22:03:50.507Z',
  log: {
    id: '5ea1c8cd11f82560a364cbd4',
    referenceId: 'rf-00752'
  }
}]);
```

</details>

<details>
  <summary>Create LogTracker</summary>

```js
const Log = require('@janiscommerce/log');

// Incremental logs, during a map-reduce operation
const logTracker = Log.createTracker('some-client');

const numbers = [1, 2, 3];
logTracker.add('initialState', numbers);

const doubledNumbers = numbers.map(n => n * 2);
logTracker.add('intermediateState', doubledNumbers);

const sum = doubledNumbers.reduce((total, n) => total + n, 0);
logTracker.add('finalState', sum);

await logTracker.log({
  entity: 'math',
  entityId: 'someId',
  type: 'map-reduce',
  message: 'Map reduced to sum the double of some numbers'
});
```
</details>

### Serverless configuration

Returns an array with the hooks needed for Log's serverless configuration according to [Serverless Helper](https://www.npmjs.com/package/sls-helper-plugin-janis). In `path/to/root/serverless.js` add:

```js
'use strict';

const { helper } = require('sls-helper'); // eslint-disable-line
const functions = require('./serverless/functions.json');
const Log = require('@janiscommerce/log');

module.exports = helper({
	hooks: [
		// other hooks
    ...functions,
    ...Log.serverlessConfiguration
	]
});
```