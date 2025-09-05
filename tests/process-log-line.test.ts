import { processLogLine, IdempiereLog } from '../src/process-log-line';

describe('processLogLine', () => {
	const testDate = { year: '2024', month: '01', day: '15' };

	beforeEach(() => {
		// Reset any global state before each test
		jest.clearAllMocks();
	});

	describe('GraphQL query processing', () => {
		it('should process a simple GraphQL query line', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetUser( variables: {"id": "123"}, execution time (ms): 45 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.queryType).toBe('query');
			expect(result?.transactionName).toBe('GetUser');
			expect(result?.duration).toBe(45);
			// Note: The timestamp is converted to UTC, so it may be different from the input time
			expect(result?.logTime).toMatch(/^2024-01-15 \d{2}:\d{2}:\d{2}\.\d{3}$/);
			expect(result?.variables).toBe('{"id":"123"}');
		});

		it('should process a GraphQL mutation line', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: mutation UpdateUser( variables: {"id": "123", "name": "John"}, execution time (ms): 120 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.queryType).toBe('mutation');
			expect(result?.transactionName).toBe('UpdateUser');
			expect(result?.duration).toBe(120);
			expect(result?.variables).toBe('{"id":"123","name":"John"}');
		});

		it('should extract UU from variables when present', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetRecord( variables: {"UU": "12345678-1234-1234-1234-123456789abc"}, execution time (ms): 30 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.recordUU).toBe('12345678-1234-1234-1234-123456789abc');
		});

		it('should handle multiline GraphQL queries', () => {
			const line1 =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query ComplexQuery( ';
			const line2 = '  {"id": "123", "filters": {"status": "active"}} ';
			const line3 = ') execution time (ms): 200 ';

			// First line should return undefined (multiline start)
			const result1 = processLogLine(testDate, line1);
			expect(result1).toBeUndefined();

			// Second line should return undefined (continuing multiline)
			const result2 = processLogLine(testDate, line2);
			expect(result2).toBeUndefined();

			// Third line should return the complete result
			const result3 = processLogLine(testDate, line3);
			expect(result3).toBeDefined();
			expect(result3?.queryType).toBe('query');
			expect(result3?.transactionName).toBe('ComplexQuery');
			expect(result3?.duration).toBe(200);
		});
	});

	describe('Log processing', () => {
		it('should process a log line', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingMutation.Log: User action performed, AD_Client_ID: 100, AD_Org_ID: 0, AD_User_ID: 1';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.queryType).toBe('log');
			expect(result?.transactionName).toBe('Log');
			expect(result?.clientId).toBe(100);
			expect(result?.organizationId).toBe(0);
			expect(result?.userId).toBe(1);
			expect(result?.variables).toBe('User action performed');
		});
	});

	describe('Exception processing', () => {
		it('should process exception lines', () => {
			const exceptionLine =
				'10:30:45.123 ERROR [http-nio-8080-exec-1] SimpleDataFetcherExceptionHandler.onException: Database connection failed';
			const continuationLine = '  at com.example.DatabaseService.connect(DatabaseService.java:45)';
			const nextLine =
				'10:30:46.000 INFO  [http-nio-8080-exec-2] LoggingInstrumentation.onCompleted: query TestQuery( {} ) execution time (ms): 10 ';

			// Process exception line
			const result1 = processLogLine(testDate, exceptionLine);
			expect(result1).toBeUndefined();

			// Process continuation line
			const result2 = processLogLine(testDate, continuationLine);
			expect(result2).toBeUndefined();

			// Process next query line - should include error data
			const result3 = processLogLine(testDate, nextLine);
			expect(result3).toBeDefined();
			expect(result3?.errorData).toContain('Database connection failed');
			expect(result3?.errorData).toContain('at com.example.DatabaseService.connect');
		});
	});

	describe('Edge cases', () => {
		it('should return undefined for lines that do not match any pattern', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] SomeOtherLogMessage: This is not a GraphQL or log message';

			const result = processLogLine(testDate, line);

			expect(result).toBeUndefined();
		});

		it('should handle malformed JSON in variables', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"invalid": json}, execution time (ms): 30 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.variables).toBe('{"variables":"{\\"invalid\\": json}"}');
		});

		it('should handle empty variables', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( ) execution time (ms): 30 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.variables).toBeUndefined();
		});
	});

	describe('Date handling', () => {
		it('should correctly format timestamps', () => {
			const line =
				'23:59:59.999 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( ) execution time (ms): 1 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			// Note: The timestamp is converted to UTC, so it may be different from the input time
			expect(result?.logTime).toMatch(/^2024-01-15 \d{2}:\d{2}:\d{2}\.\d{3}$/);
		});
	});
});
