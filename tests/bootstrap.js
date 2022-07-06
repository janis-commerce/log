'use strict';

process.env.LOG_ROLE_ARN = 'some-role-arn';
process.env.JANIS_SERVICE_NAME = 'default-service';
process.env.JANIS_ENV = 'beta';

require('lllog')('none');
