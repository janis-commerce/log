'use strict';

const assert = require('assert');
const sinon = require('sinon');

const Log = require('../lib/log');

const deliveryStreamName = 'TraceDeliveryStreamName';
const traceLogRoleArn = 'TraceLogRoleArn';

describe('Serverless configuration', () => {

	afterEach(() => {
		sinon.restore();
	});

	it('Should return the serverless hooks', () => {

		sinon.stub(process, 'env')
			.value({
				...process.env,
				TRACE_LOG_ROLE_ARN: traceLogRoleArn,
				TRACE_FIREHOSE_DELIVERY_STREAM: deliveryStreamName
			});

		assert.deepStrictEqual(Log.serverlessConfiguration, [
			['envVars', {
				LOG_ROLE_ARN: traceLogRoleArn,
				TRACE_LOG_ROLE_ARN: traceLogRoleArn,
				TRACE_FIREHOSE_DELIVERY_STREAM: deliveryStreamName,
				JANIS_TRACE_EXTENSION_USE_INVOKE_EVENT: 1
			}],

			['iamStatement', {
				action: 'Sts:AssumeRole',
				resource: traceLogRoleArn
			}]
		]);
	});
});
