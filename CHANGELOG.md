# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.1.3] - 2025-11-19
### Changed
- Updated `axios` and `@aws-sdk` versions
- Added internal logging for debugging purposes

## [5.1.2] - 2025-09-30
### Changed
- Updated `axios` version

## [5.1.1] - 2025-02-27
### Fixed
- Fixed types definition path in package.json

## [5.1.0] - 2025-02-21
### Added
- Now `log` includes field `functionName` with value of env var `AWS_LAMBDA_FUNCTION_NAME`

## [5.0.14] - 2024-10-14
### Fixed
- Fixed usage of env vars when Trace Layer is used (format occurs earlier)

## [5.0.13] - 2024-08-15
### Fixed
- Dependencies updated

## [5.0.12] - 2024-06-19
### Fixed
- Ensure ending Trace Extension when no logs loaded in execution
- Added `start()` method to be called from **@janiscommerce** packages handlers

## [5.0.11] - 2024-06-14
### Fixed
- The package now sets `JANIS_TRACE_EXTENSION_USE_INVOKE_EVENT` env var using `serverlessConfiguration()`

## [5.0.10] - 2024-06-14
### Fixed
- Using `on()` to subscribe `janiscommerce.ended` event to ensure receive all events

## [5.0.9] - 2024-06-13
### Fixed
- Fixed missing `client` when `sendToTrace()` was called from Trace Lambda Layer

## [5.0.8] - 2024-06-13
### Added
- Local logs are notified with `/end` endpoint after listening `janiscommerce.ended` event

## [5.0.7] - 2024-06-13
### Fixed
- Locally flow: avoid multiple validations and formatting for logs
- Ensure `dateCreated` field for logs

## [5.0.6] - 2024-06-07
### Fixed
- The field `entityId` is optional in log validation

## [5.0.5] - 2024-02-09
### Changed
- Skip local lambda layer when saving more than 100 logs together and make firehose requests concurrent

## [5.0.4] - 2024-02-09
### Changed
- Improved package overall performance by removing loops, avoiding object creations and changed superstruct by fastest-validator

## [5.0.3] - 2023-09-12
### Changed
- Added local log generation chunk split to avoid request timeouts
- Changed `uuid` npm package for nodejs native `crypto` module

## [5.0.2] - 2023-07-04
### Fixed
- Added `LOG_ROLE_ARN` env var to help with backwards compatibility for janiscommerce packages that still use v4 of this package

## [5.0.0] - 2023-06-16
### Changed
- **Breaking Change** using env variable `TRACE_LOG_ROLE_ARN` instead of `LOG_ROLE_ARN`
- **Breaking Change** using env variable `TRACE_FIREHOSE_DELIVERY_STREAM` for Firehose DeliveryStream name

### Removed
- `on()` method

## [4.0.0] - 2023-02-24
### Changed
- Migrate `AWS SDK` to `V3` version

## [3.7.1] - 2023-01-10
### Changed
- Now sensitive data is redacted with '***' instead of being removed

## [3.7.0] - 2023-01-10
### Added
- Now logs sensitive data can be removed using the `JANIS_TRACE_PRIVATE_FIELDS` environment variable

## [3.6.0] - 2022-11-10
### Added
- Trace Layer support for local log buffering

## [3.5.1] - 2022-07-11
### Changed
- Validation of environment

### Removed
- LogError `code: 3` for environment validation

## [3.5.0] - 2022-07-07
### Added
- Now `log` includes fields `functionName` and `apiRequestLogId` with value of env vars `JANIS_FUNCTION_NAME` and `JANIS_API_REQUEST_LOG_ID`

### Changed
- Now `log` field on each **Log** is an _Object_, transformed into an object when _Array_ received

## [3.4.2] - 2022-01-29
### Changed
- AWS SDK require now requires only STS and Firehose client

## [3.4.1] - 2021-05-10
### Fixed
- Fixed TS `readonly` methods
- `userCreated` now supports **null** value

## [3.4.0] - 2021-04-27
### Added
- `Log.createTracker()` to generate an incremental log
- TS typings

### Changed
- CI is now done using github actions

## [3.3.0] - 2020-07-29
### Added
- serverlessConfiguration getter to easily get sls hooks.
- FirehoseInstance to cache the instance

### Changed
- Upgraded sinon, nyc and eslint devDependencies

## [3.2.0] - 2020-05-19
### Removed
- `package-lock.json` file

## [3.1.3] - 2020-05-15
### Fixed
- Unit tests improoves
- Errors that was not handled correctly

## [3.1.2] - 2020-05-12
### Fixed
- Assume role expiration date validation

## [3.1.1] - 2020-04-23
### Added
- Multiple logs support

## [3.1.0] - 2020-03-04
### Added
- Optional role assumption for authorizing the Firehose putRecord

## [3.0.0] - 2020-01-14
### Added
- Log struct and formatting

### Changed
- Uploading logs to Firehose instead S3
- Log `type` field now can be only a string, not a number
- Snake_case fields deprecated, only camelCase

## [2.0.0] - 2019-12-05
### Added
- `service` field support, will use it if exists, or will use ENV service name otherwise.

### Changed
- log S3 key/path now includes `service` and `entity` prefixes

## [1.2.0] - 2019-10-11
### Added
- target bucket stage is obtained from `JANIS_ENV` environment variable
- stage name ENV variable validation

### Changed
- target bucket now is a janis-trace-service bucket
- `add` method now receives client code name instead bucket name

## [1.1.0] - 2019-10-08
### Added
- log structure validations
- log structure documentation
- service name obtention from ENV variables

### Removed
- Removed useless `index.js`

## [1.0.1] - 2019-09-04
### Fixed
- `README.md` Parameters order for `add` method

## [1.0.0] - 2019-08-07
### Added
- Log package
- Unit tests
- Docs