# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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