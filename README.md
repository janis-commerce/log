# log

![Build Status](https://github.com/janis-commerce/log/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/log/badge.svg?branch=master)](https://coveralls.io/github/janis-commerce/log?branch=master)
[![npm version](https://badge.fury.io/js/%40janiscommerce%2Flog.svg)](https://www.npmjs.com/package/@janiscommerce/log)

A package for creating logs in Firehose

## 📦 Installation
```sh
npm install @janiscommerce/log
```

## Breaking changes _Since 5.0.0_ :warning:
- Using env var `TRACE_LOG_ROLE_ARN` instead of `LOG_ROLE_ARN`
- New **required** env var `TRACE_FIREHOSE_DELIVERY_STREAM`
- `on()` method was removed, deprecated in `3.5.0`

## 🔧 Configuration
### ENV variables
- **`JANIS_SERVICE_NAME`** (required): The name of the service that will create the log.
- **`TRACE_LOG_ROLE_ARN`**: The ARN to assume the trace role in order to put records in Firehose.
- **`TRACE_FIREHOSE_DELIVERY_STREAM`** (required): The Delivery Stream Name to put records in Firehose.
- **`JANIS_TRACE_EXTENSION_ENABLED`**: If this variable is set, logs will be attempted to be buffered in the Janis Trace Extension server. If the server fails, direct call to Firehose is the fallback.
- **`JANIS_TRACE_PRIVATE_FIELDS`**: In case it is necessary to exclude properties to be logged, they should be defined in this variable. In order to set multiple fields, set them separated by commas. For example: `JANIS_TRACE_PRIVATE_FIELDS=password,token`

## Firehose delivery (direct path)

When logs are sent to Firehose — i.e. `Log.add()` without the Trace extension batch (fewer than 100 logs in one call), `Log.sendToTrace()`, or fallback after the local extension fails — the package:

- **Batches** records so each `PutRecordBatch` stays within AWS limits: **at most 500 records** and **total payload size** under Firehose’s per-request cap (the package uses a **safety margin** below 4 MiB).
- Runs **up to five** `PutRecordBatch` calls **in parallel**, then the next wave, so load stays bounded on large payloads.
- Uses a **1s** HTTP timeout on the Firehose client for each batch request.
- On **partial** failures, **retries** failed records by **splitting** the batch and retrying (with a maximum depth); records that succeed in a response are counted as delivered.
- If a single serialized record would exceed **1 MiB** (Firehose per-record limit), the payload is **replaced** with a small placeholder object (`truncated: true`) so the event is still sent.
- If the Firehose client cannot be prepared (for example **STS `assumeRole`** failure), **no** `PutRecordBatch` calls are made and the whole batch is reported as failed.

### Return value (Firehose path)

`Log.add()` when it ends in Firehose (direct path, more than 100 logs in one call, extension disabled, or extension error fallback), `Log.sendToTrace()`, etc., resolve to:

```js
{ successCount: number, failedCount: number }
```

counts **after** validation, batching, retries, and splits. The local extension path (`JANIS_TRACE_EXTENSION_ENABLED` and fewer than 100 logs) still uses HTTP to the sidecar and does not return this object on success.

## API
### **`add(clientCode, logs)`**
Parameters: `clientCode [String]`, `logs [Object] or [Object array]`  
Returns: `Promise<void>` when logs go to the Trace extension locally; `Promise<{ successCount: number, failedCount: number }>` when they are sent to Firehose (see [Firehose delivery](#firehose-delivery-direct-path)).

Puts the received log or logs into the janis-trace-firehose or local server.

### **`addCore(logs)`**
Parameters: `logs [Object] or [Object array]`  
Returns: same as [`add()`](#addclientcode-logs).

Wrapper around `add()` for **core logs**: logs for entities that don't belong to a client (e.g. Devops-managed entities), as opposed to client-scoped entities. It **forces** the `client` to the `CORE_CLIENT` sentinel on every log, **overriding any `client` field present on the logs** — unlike `add()`, where a `client` on the log object takes precedence. A core log has no client by definition, so it can't be routed to a real client.

```js
Log.addCore(logs); // every log is sent with client = Log.CORE_CLIENT, regardless of its own client field
```

### **`CORE_CLIENT`**
The sentinel `client` value used to identify core logs (entities without a client). It's a string value that's not a valid `clientCode`, reused as the `client` field so core logs flow through the same Trace infrastructure (Firehose/Athena partitioning by `client`) as client-scoped logs.

```js
Log.CORE_CLIENT // '__core__'
```

> Always reference `Log.CORE_CLIENT` instead of hardcoding the value, since it's the single source of truth for the sentinel.

### Log structure
The `log [Object]` parameter have the following structure:
- **`id [String]`** (optional): The ID of the log in UUID V4 format. Default will be auto-generated.
- **`client [String]`** (optional): The client code of the log owner. If set, this overrides the `clientCode` parameter of the `add()` method.
- **`service [String]`** (optional): The service name, if this field not exists, will be obtained from the ENV (**`JANIS_SERVICE_NAME`**)
- **`entity [String]`** (optional): The name of the entity that is creating the log. Required unless `relatedEntities` is provided.
- **`entityId [String]`** (optional): The ID of the entity that is creating the log.
- **`relatedEntities [Array<String>]`** (optional): Tokens in `entity:id` format relating one or more entities to a single log (e.g. `['price:5ea1c8c53fdac68fb60eac9e', 'base-price:5ea1c8cd11f82560a364cbd4']`). A log must have either `entity` or `relatedEntities`.
- **`entities [Array<String>]`** (auto-derived): The distinct set of entity names the log relates to (its own `entity` plus the entity prefixes of `relatedEntities`). Computed automatically in `preFormatLog`; you don't need to set it.
- **`type [String]`** (required): The log type.
- **`message [String]`** (optional): A general message about the log.
- **`userCreated [String]`** (optional): The user that creates the log.
- **`dateCreated [ISODate]`** (optional): The date when the log was created.
- **`log [Object|Array]`** (optional): This property is a JSON that includes all the technical data about your log. If `Array` was received, will be transformed as an `Object`.
  - **`log.functionName [String]`**: This field will be completed with ENV variable **`JANIS_FUNCTION_NAME`** (or **`AWS_LAMBDA_FUNCTION_NAME`** as fallback). The variable is created in package [@janiscommerce/lambda](https://www.npmjs.com/package/@janiscommerce/lambda). If the **`AWS_LAMBDA_REQUEST_ID`** env var is set (created by the Janis handler packages), the field is formatted as `functionName@requestId` (or `unknown@requestId` if no function name is available)
  - **`log.apiRequestLogId [String]`**: This field will be completed with ENV variable **`JANIS_API_REQUEST_LOG_ID`**. The variable is created in package [@janiscommerce/api](https://www.npmjs.com/package/@janiscommerce/api)

### **`createTracker(clientCode)`**
Parameters: `clientCode [String]`
Create a new tracker to build an incremental log. It returns a [LogTracker](#log-tracker) instance.

### **`sendToTrace(logs)`**
Parameters: `logs [Array<LogData>]`  
Returns: `Promise<{ successCount: number, failedCount: number }>`

Sends the received logs directly to Firehose, skipping the local extension server. Logs use the same structure as in the `add()` method, with the `client` property required.

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
| 4    | Assuming STS role error        |

- Error `code: 3` removed since _3.5.1_

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