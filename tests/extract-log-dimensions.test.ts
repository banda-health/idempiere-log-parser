import { extractLogDimensions } from '../src/extract-log-dimensions';
import { IdempiereLog } from '../src/process-log-line';

describe('extractLogDimensions', () => {
	it('extracts client id from user context on any record type', () => {
		const record: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'query',
			transactionName: 'getPatient',
			userContext: '{"clientId":100,"organizationId":0,"userId":1}',
		};

		expect(extractLogDimensions([record])).toEqual({
			appVersions: [],
			clientIds: [100],
			eventTypes: [],
			pathnames: [],
		});
	});

	it('extracts site activity dimensions from structured log variables', () => {
		const record: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'log',
			transactionName: 'Log',
			userContext: '{"clientId":200,"userId":42}',
			variables: JSON.stringify({
				data: {
					appVersion: '1.2.3',
					pathname: '/visits/my-queue',
					timestamp: 1718457600000,
				},
				type: 'page_view',
			}),
		};

		expect(extractLogDimensions([record])).toEqual({
			appVersions: ['1.2.3'],
			clientIds: [200],
			eventTypes: ['page_view'],
			pathnames: ['/visits/my-queue'],
		});
	});

	it('ignores plain-text log variables and malformed user context', () => {
		const record: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'log',
			transactionName: 'Log',
			userContext: 'not-json',
			variables: 'User action performed',
		};

		expect(extractLogDimensions([record])).toEqual({
			appVersions: [],
			clientIds: [],
			eventTypes: [],
			pathnames: [],
		});
	});

	it('deduplicates values across records', () => {
		const sharedLogVariables = JSON.stringify({
			data: {
				appVersion: '1.0.0',
				pathname: '/dashboard',
			},
			type: 'error',
		});
		const records: IdempiereLog[] = [
			{
				logTime: new Date().toISOString(),
				queryType: 'log',
				transactionName: 'Log',
				userContext: '{"clientId":100}',
				variables: sharedLogVariables,
			},
			{
				logTime: new Date().toISOString(),
				queryType: 'log',
				transactionName: 'Log',
				userContext: '{"clientId":100}',
				variables: sharedLogVariables,
			},
		];

		expect(extractLogDimensions(records)).toEqual({
			appVersions: ['1.0.0'],
			clientIds: [100],
			eventTypes: ['error'],
			pathnames: ['/dashboard'],
		});
	});
});
