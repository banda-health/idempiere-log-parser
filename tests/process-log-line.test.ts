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
			expect(result?.userContext).toBeUndefined();
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
			expect(result?.userContext).toBeUndefined();
		});

		it('should extract UU from variables when present', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetRecord( variables: {"UU": "12345678-1234-1234-1234-123456789abc"}, execution time (ms): 30 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.recordUU).toBe('12345678-1234-1234-1234-123456789abc');
			expect(result?.userContext).toBeUndefined();
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

		it('should process GraphQL query with user context', () => {
			const line =
				'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetUserWithContext( variables: {"id": "123"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 45 ';

			const result = processLogLine(testDate, line);

			expect(result).toBeDefined();
			expect(result?.queryType).toBe('query');
			expect(result?.transactionName).toBe('GetUserWithContext');
			expect(result?.duration).toBe(45);
			expect(result?.variables).toBe('{"id":"123"}');
			expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
		});
	});

	describe('User Context Extraction', () => {
		describe('GraphQL logs with user context', () => {
			it('should extract all user context fields from GraphQL query', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetUser( variables: {"id": "123"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.queryType).toBe('query');
				expect(result?.transactionName).toBe('GetUser');
				expect(result?.duration).toBe(45);
				expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
				expect(result?.variables).toBe('{"id":"123"}');
			});

			it('should extract user context from GraphQL mutation', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: mutation UpdateUser( variables: {"name": "John", "email": "john@example.com"}, userId: 123, clientId: 200, organizationId: 1, roleId: 3, warehouseId: 15, execution time (ms): 120 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.queryType).toBe('mutation');
				expect(result?.transactionName).toBe('UpdateUser');
				expect(result?.duration).toBe(120);
				expect(result?.userContext).toBe(
					'{"clientId":200,"organizationId":1,"roleId":3,"userId":123,"warehouseId":15}',
				);
				expect(result?.variables).toBe('{"name":"John","email":"john@example.com"}');
			});

			it('should handle partial user context information', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetData( variables: {"filter": "active"}, userId: 456, clientId: 300, organizationId: 2, roleId: 0, warehouseId: 0, execution time (ms): 30 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBe('{"clientId":300,"organizationId":2,"roleId":0,"userId":456,"warehouseId":0}');
				expect(result?.variables).toBe('{"filter":"active"}');
			});

			it('should handle zero values in user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"test": true}, userId: 0, clientId: 0, organizationId: 0, roleId: 0, warehouseId: 0, execution time (ms): 10 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBe('{"clientId":0,"organizationId":0,"roleId":0,"userId":0,"warehouseId":0}');
			});

			it('should extract UU from variables when present with user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query GetRecord( variables: {"UU": "12345678-1234-1234-1234-123456789abc", "data": "test"}, userId: 789, clientId: 400, organizationId: 3, roleId: 7, warehouseId: 20, execution time (ms): 50 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.recordUU).toBe('12345678-1234-1234-1234-123456789abc');
				expect(result?.userContext).toBe(
					'{"clientId":400,"organizationId":3,"roleId":7,"userId":789,"warehouseId":20}',
				);
				expect(result?.variables).toBe('{"UU":"12345678-1234-1234-1234-123456789abc","data":"test"}');
			});
		});

		describe('User context edge cases', () => {
			it('should handle malformed user context numbers', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"test": "data"}, userId: abc, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 30 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				// Should still process the query even with malformed user context
				expect(result?.queryType).toBe('query');
				// When user context is malformed, it falls back to simple pattern and wraps variables
				expect(result?.variables).toBe(
					'{"variables":"{\\"test\\": \\"data\\"}, userId: abc, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10"}',
				);
			});

			it('should handle missing user context fields', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query PartialQuery( variables: {"id": "123"}, userId: 42, clientId: 100, execution time (ms): 20 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				// Should fall back to pattern without user context
				expect(result?.userContext).toBeUndefined();
				// When falling back, the variables get wrapped in a variables object
				expect(result?.variables).toBe('{"variables":"{\\"id\\": \\"123\\"}, userId: 42, clientId: 100"}');
			});

			it('should handle very large user context values', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query LargeQuery( variables: {"data": "large"}, userId: 999999999, clientId: 999999999, organizationId: 999999999, roleId: 999999999, warehouseId: 999999999, execution time (ms): 100 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBe(
					'{"clientId":999999999,"organizationId":999999999,"roleId":999999999,"userId":999999999,"warehouseId":999999999}',
				);
			});
		});

		describe('User context JSON structure validation', () => {
			it('should create valid JSON structure for user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query ValidQuery( variables: {"test": "data"}, userId: 1, clientId: 2, organizationId: 3, roleId: 4, warehouseId: 5, execution time (ms): 15 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBeDefined();

				// Parse the user context JSON to validate structure
				const userContext = JSON.parse(result!.userContext!);
				expect(userContext).toEqual({
					clientId: 2,
					organizationId: 3,
					roleId: 4,
					userId: 1,
					warehouseId: 5,
				});
			});

			it('should handle undefined values in user context JSON', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query UndefinedQuery( variables: {"test": "data"}, userId: 1, clientId: 0, organizationId: 0, roleId: 0, warehouseId: 0, execution time (ms): 15 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBeDefined();

				// Parse the user context JSON to validate structure
				const userContext = JSON.parse(result!.userContext!);
				expect(userContext).toEqual({
					clientId: 0,
					organizationId: 0,
					roleId: 0,
					userId: 1,
					warehouseId: 0,
				});
			});
		});
	});

	describe('Variable Pattern Matching', () => {
		describe('Pattern with user context', () => {
			it('should match variables pattern with complete user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123", "name": "John"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe('{"id":"123","name":"John"}');
				expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
			});

			it('should match variables pattern with minimal user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query MinQuery( variables: {}, userId: 1, clientId: 1, organizationId: 1, roleId: 1, warehouseId: 1, execution time (ms): 10 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe('{}');
				expect(result?.userContext).toBe('{"clientId":1,"organizationId":1,"roleId":1,"userId":1,"warehouseId":1}');
			});

			it('should match variables pattern with complex nested JSON', () => {
				const complexVariables = JSON.stringify({
					user: { id: '123', profile: { name: 'John', settings: { theme: 'dark' } } },
					filters: { status: ['active', 'pending'], dateRange: { start: '2024-01-01', end: '2024-12-31' } },
				});

				const line = `10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query ComplexQuery( variables: ${complexVariables}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 150 `;

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe(complexVariables);
				expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
			});

			it('should handle variables with special characters in user context pattern', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query SpecialQuery( variables: {"message": "Hello, \\"world\\"!", "path": "/api/v1/users"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 30 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe('{"message":"Hello, \\"world\\"!","path":"/api/v1/users"}');
				expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
			});
		});

		describe('Pattern without user context', () => {
			it('should match variables pattern without user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query SimpleQuery( variables: {"id": "456", "type": "user"}, execution time (ms): 25 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe('{"id":"456","type":"user"}');
				expect(result?.userContext).toBeUndefined();
			});

			it('should match empty variables pattern without user context', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query EmptyQuery( variables: {}, execution time (ms): 5 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe('{}');
				expect(result?.userContext).toBeUndefined();
			});

			it('should match complex variables without user context', () => {
				const complexVariables = JSON.stringify({
					data: Array(10)
						.fill(0)
						.map((_, i) => ({ id: i, name: `Item ${i}` })),
					metadata: { total: 10, page: 1, hasMore: true },
				});

				const line = `10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query DataQuery( variables: ${complexVariables}, execution time (ms): 200 `;

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBe(complexVariables);
				expect(result?.userContext).toBeUndefined();
			});
		});

		describe('Pattern matching edge cases', () => {
			it('should prioritize user context pattern over simple pattern', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query PriorityQuery( variables: {"test": "data"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 50 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				// Should use the user context pattern, not the simple pattern
				expect(result?.userContext).toBe('{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}');
			});

			it('should fall back to simple pattern when user context is incomplete', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query FallbackQuery( variables: {"test": "data"}, userId: 42, clientId: 100, execution time (ms): 30 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				// Should fall back to simple pattern since user context is incomplete
				expect(result?.userContext).toBeUndefined();
				// When falling back, the variables get wrapped in a variables object
				expect(result?.variables).toBe('{"variables":"{\\"test\\": \\"data\\"}, userId: 42, clientId: 100"}');
			});

			it('should handle pattern matching with execution time variations', () => {
				const testCases = [
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 0 ',
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 999999 ',
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, execution time (ms): 50 ',
				];

				testCases.forEach((line, index) => {
					const result = processLogLine(testDate, line);

					expect(result).toBeDefined();
					expect(result?.variables).toBe('{"id":"123"}');

					if (index < 2) {
						// First two should have user context
						expect(result?.userContext).toBe(
							'{"clientId":100,"organizationId":0,"roleId":5,"userId":42,"warehouseId":10}',
						);
					} else {
						// Third should not have user context
						expect(result?.userContext).toBeUndefined();
					}
				});
			});
		});
	});

	describe('Database Schema Compatibility', () => {
		describe('Data type compatibility', () => {
			it('should generate data compatible with timestamp column', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.logTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);

				// Should be a valid timestamp format
				const timestamp = new Date(result!.logTime);
				expect(timestamp.getTime()).not.toBeNaN();
			});

			it('should generate data compatible with varchar columns', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(typeof result?.queryType).toBe('string');
				expect(typeof result?.transactionName).toBe('string');
				expect(['query', 'mutation', 'log']).toContain(result?.queryType);
			});

			it('should generate data compatible with numeric columns', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(typeof result?.duration).toBe('number');
				expect(result?.duration).toBeGreaterThanOrEqual(0);
			});

			it('should generate data compatible with JSON columns', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123", "data": {"nested": true}}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.variables).toBeDefined();

				// Should be valid JSON string
				expect(() => JSON.parse(result!.variables!)).not.toThrow();

				const parsedVariables = JSON.parse(result!.variables!);
				expect(parsedVariables).toEqual({ id: '123', data: { nested: true } });
			});

			it('should generate data compatible with JSONB columns', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "123"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.userContext).toBeDefined();

				// Should be valid JSON string for JSONB column
				expect(() => JSON.parse(result!.userContext!)).not.toThrow();

				const parsedUserContext = JSON.parse(result!.userContext!);
				expect(parsedUserContext).toEqual({
					clientId: 100,
					organizationId: 0,
					roleId: 5,
					userId: 42,
					warehouseId: 10,
				});
			});

			it('should generate data compatible with UUID columns', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"UU": "12345678-1234-1234-1234-123456789abc", "id": "123"}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.recordUU).toBeDefined();

				// Should be a valid UUID format
				const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				expect(result?.recordUU).toMatch(uuidPattern);
			});

			it('should generate data compatible with text columns', () => {
				const exceptionLine =
					'10:30:45.123 ERROR [http-nio-8080-exec-1] SimpleDataFetcherExceptionHandler.onException: Database connection failed';
				const continuationLine = '  at com.example.DatabaseService.connect(DatabaseService.java:45)';
				const queryLine =
					'10:30:46.000 INFO  [http-nio-8080-exec-2] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "test"}, execution time (ms): 5 ';

				// Process exception
				processLogLine(testDate, exceptionLine);
				processLogLine(testDate, continuationLine);

				// Process query with error data
				const result = processLogLine(testDate, queryLine);

				expect(result).toBeDefined();
				expect(result?.errorData).toBeDefined();
				expect(typeof result?.errorData).toBe('string');
				expect(result?.errorData).toContain('Database connection failed');
				expect(result?.errorData).toContain('at com.example.DatabaseService.connect');
			});
		});

		describe('Primary key compatibility', () => {
			it('should generate unique combinations for primary key (log_time, query_type, query_name)', () => {
				const testCases = [
					{
						line: '10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "1"}, execution time (ms): 10 ',
						expectedType: 'query',
						expectedName: 'TestQuery',
					},
					{
						line: '10:30:45.124 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: mutation UpdateQuery( variables: {"id": "2"}, execution time (ms): 20 ',
						expectedType: 'mutation',
						expectedName: 'UpdateQuery',
					},
					{
						line: '10:30:45.125 INFO  [http-nio-8080-exec-1] LoggingMutation.Log: User action, AD_Client_ID: 100, AD_Org_ID: 0, AD_User_ID: 42',
						expectedType: 'log',
						expectedName: 'Log',
					},
				];

				testCases.forEach((testCase, index) => {
					const result = processLogLine(testDate, testCase.line);

					expect(result).toBeDefined();
					expect(result?.queryType).toBe(testCase.expectedType);
					expect(result?.transactionName).toBe(testCase.expectedName);
					expect(result?.logTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
				});
			});

			it('should handle timestamp precision for primary key uniqueness', () => {
				const lines = [
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "1"}, execution time (ms): 10 ',
					'10:30:45.124 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"id": "2"}, execution time (ms): 10 ',
				];

				const results = lines.map((line) => processLogLine(testDate, line));

				expect(results).toHaveLength(2);
				expect(results[0]?.logTime).not.toBe(results[1]?.logTime);
				expect(results[0]?.queryType).toBe(results[1]?.queryType);
				expect(results[0]?.transactionName).toBe(results[1]?.transactionName);
			});
		});

		describe('Column constraints and data integrity', () => {
			it('should handle NULL values appropriately', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {}, execution time (ms): 0 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();
				expect(result?.logTime).toBeDefined(); // NOT NULL
				expect(result?.queryType).toBeDefined(); // NOT NULL
				expect(result?.transactionName).toBeDefined(); // NOT NULL
				expect(result?.duration).toBeDefined(); // NOT NULL

				// These can be NULL
				expect(result?.variables).toBe('{}'); // JSON, can be NULL
				expect(result?.userContext).toBeUndefined(); // JSONB, can be NULL
				expect(result?.recordUU).toBeUndefined(); // UUID, can be NULL
				expect(result?.errorData).toBeUndefined(); // TEXT, can be NULL
			});

			it('should handle edge cases for numeric columns', () => {
				const testCases = [
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {}, execution time (ms): 0 ',
					'10:30:45.124 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {}, execution time (ms): 999999 ',
					'10:30:45.125 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {}, execution time (ms): 1 ',
				];

				testCases.forEach((line, index) => {
					const result = processLogLine(testDate, line);

					expect(result).toBeDefined();
					expect(typeof result?.duration).toBe('number');
					expect(result?.duration).toBeGreaterThanOrEqual(0);
				});
			});

			it('should handle JSON/JSONB data integrity', () => {
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( variables: {"complex": {"nested": {"deep": {"value": [1, 2, 3]}}}}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();

				// Test JSON column integrity
				expect(() => JSON.parse(result!.variables!)).not.toThrow();
				const parsedVariables = JSON.parse(result!.variables!);
				expect(parsedVariables.complex.nested.deep.value).toEqual([1, 2, 3]);

				// Test JSONB column integrity
				expect(() => JSON.parse(result!.userContext!)).not.toThrow();
				const parsedUserContext = JSON.parse(result!.userContext!);
				expect(parsedUserContext.userId).toBe(42);
			});
		});

		describe('Data migration compatibility', () => {
			it('should maintain backward compatibility with existing data structure', () => {
				// Test that new fields are optional and don't break existing functionality
				const line =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query LegacyQuery( variables: {"id": "123"}, execution time (ms): 45 ';

				const result = processLogLine(testDate, line);

				expect(result).toBeDefined();

				// Existing fields should still work
				expect(result?.logTime).toBeDefined();
				expect(result?.queryType).toBeDefined();
				expect(result?.transactionName).toBeDefined();
				expect(result?.duration).toBeDefined();
				expect(result?.variables).toBeDefined();

				// New fields should be undefined when not present
				expect(result?.userContext).toBeUndefined();
			});

			it('should handle mixed old and new data formats', () => {
				const oldFormatLine =
					'10:30:45.123 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query OldQuery( variables: {"id": "123"}, execution time (ms): 45 ';
				const newFormatLine =
					'10:30:45.124 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query NewQuery( variables: {"id": "456"}, userId: 42, clientId: 100, organizationId: 0, roleId: 5, warehouseId: 10, execution time (ms): 50 ';

				const oldResult = processLogLine(testDate, oldFormatLine);
				const newResult = processLogLine(testDate, newFormatLine);

				expect(oldResult).toBeDefined();
				expect(newResult).toBeDefined();

				// Both should have the same core structure
				expect(oldResult?.queryType).toBeDefined();
				expect(newResult?.queryType).toBeDefined();

				// New format should have additional user context
				expect(oldResult?.userContext).toBeUndefined();
				expect(newResult?.userContext).toBeDefined();
			});
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

	describe('Integration Tests', () => {
		describe('Real-world log line processing', () => {
			it('should handle a complete GraphQL query with all fields', () => {
				const realLogLine =
					'14:23:45.678 INFO  [http-nio-8080-exec-5] LoggingInstrumentation.onCompleted: query GetUserProfile( variables: {"userId": "12345", "includePreferences": true, "UU": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}, execution time (ms): 156 ';

				const result = processLogLine(testDate, realLogLine);

				expect(result).toBeDefined();
				expect(result?.queryType).toBe('query');
				expect(result?.transactionName).toBe('GetUserProfile');
				expect(result?.duration).toBe(156);
				// Note: The timestamp is converted to UTC, so it may be different from the input time
				expect(result?.logTime).toMatch(/^2024-01-15 \d{2}:\d{2}:\d{2}\.\d{3}$/);
				expect(result?.recordUU).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
				expect(result?.variables).toBe(
					'{"userId":"12345","includePreferences":true,"UU":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}',
				);
			});

			it('should handle a mutation with complex nested variables', () => {
				const realLogLine =
					'14:23:45.678 INFO  [http-nio-8080-exec-5] LoggingInstrumentation.onCompleted: mutation UpdateUserSettings( variables: {"user": {"id": "12345", "settings": {"theme": "dark", "notifications": true}}, "UU": "b2c3d4e5-f6g7-8901-bcde-f23456789012"}, execution time (ms): 234 ';

				const result = processLogLine(testDate, realLogLine);

				expect(result).toBeDefined();
				expect(result?.queryType).toBe('mutation');
				expect(result?.transactionName).toBe('UpdateUserSettings');
				expect(result?.duration).toBe(234);
				expect(result?.recordUU).toBe('b2c3d4e5-f6g7-8901-bcde-f23456789012');
			});

			it('should handle a log entry with all user context', () => {
				const realLogLine =
					'14:23:45.678 INFO  [http-nio-8080-exec-5] LoggingMutation.Log: User performed action: UPDATE_PREFERENCES, AD_Client_ID: 100, AD_Org_ID: 0, AD_User_ID: 42';

				const result = processLogLine(testDate, realLogLine);

				expect(result).toBeDefined();
				expect(result?.queryType).toBe('log');
				expect(result?.transactionName).toBe('Log');
				expect(result?.clientId).toBe(100);
				expect(result?.organizationId).toBe(0);
				expect(result?.userId).toBe(42);
				expect(result?.variables).toBe('User performed action: UPDATE_PREFERENCES');
			});

			it('should handle multiline GraphQL with error', () => {
				const exceptionLine =
					'14:23:45.678 ERROR [http-nio-8080-exec-5] SimpleDataFetcherExceptionHandler.onException: GraphQL execution failed';
				const stackTrace1 = '  at com.idempiere.graphql.GraphQLService.execute(GraphQLService.java:123)';
				const stackTrace2 = '  at com.idempiere.graphql.GraphQLController.handleRequest(GraphQLController.java:67)';
				const queryLine =
					'14:23:46.000 INFO  [http-nio-8080-exec-6] LoggingInstrumentation.onCompleted: query GetData( variables: {"id": "test"}, execution time (ms): 5 ';

				// Process exception
				const result1 = processLogLine(testDate, exceptionLine);
				expect(result1).toBeUndefined();

				// Process stack trace lines
				const result2 = processLogLine(testDate, stackTrace1);
				expect(result2).toBeUndefined();

				const result3 = processLogLine(testDate, stackTrace2);
				expect(result3).toBeUndefined();

				// Process the query that caused the error
				const result4 = processLogLine(testDate, queryLine);
				expect(result4).toBeDefined();
				expect(result4?.errorData).toContain('GraphQL execution failed');
				expect(result4?.errorData).toContain('at com.idempiere.graphql.GraphQLService.execute');
				expect(result4?.errorData).toContain('at com.idempiere.graphql.GraphQLController.handleRequest');
			});

			it('should handle edge case with malformed timestamp', () => {
				// This test ensures the function doesn't crash with unexpected input
				const malformedLine =
					'25:99:99.999 INFO  [http-nio-8080-exec-1] LoggingInstrumentation.onCompleted: query TestQuery( ) execution time (ms): 10 ';

				// Should not throw an error, even with malformed timestamp
				expect(() => {
					processLogLine(testDate, malformedLine);
				}).not.toThrow();
			});

			it('should handle very long variable strings', () => {
				const longVariables = JSON.stringify({
					data: 'x'.repeat(1000),
					nested: {
						array: Array(100).fill('test'),
						object: Object.fromEntries(
							Array(50)
								.fill(0)
								.map((_, i) => [`key${i}`, `value${i}`]),
						),
					},
				});

				const longLogLine = `14:23:45.678 INFO  [http-nio-8080-exec-5] LoggingInstrumentation.onCompleted: query LongQuery( variables: ${longVariables}, execution time (ms): 500 `;

				const result = processLogLine(testDate, longLogLine);

				expect(result).toBeDefined();
				expect(result?.variables).toBe(longVariables);
				expect(result?.duration).toBe(500);
			});
		});

		describe('Performance and memory', () => {
			it('should process multiple log lines efficiently', () => {
				const testDate = { year: '2024', month: '01', day: '15' };
				const lines = Array(1000)
					.fill(0)
					.map(
						(_, i) =>
							`14:23:45.${String(i % 1000).padStart(3, '0')} INFO  [http-nio-8080-exec-${
								i % 10
							}] LoggingInstrumentation.onCompleted: query TestQuery${i}( variables: {"id": ${i}}, execution time (ms): ${
								i % 100
							} `,
					);

				const startTime = Date.now();

				const results = lines.map((line) => processLogLine(testDate, line));

				const endTime = Date.now();
				const processingTime = endTime - startTime;

				// Should process 1000 lines in reasonable time (less than 1 second)
				expect(processingTime).toBeLessThan(1000);

				// All results should be defined
				const validResults = results.filter((r) => r !== undefined);
				expect(validResults).toHaveLength(1000);

				// Verify some results
				expect(validResults[0]?.transactionName).toBe('TestQuery0');
				expect(validResults[999]?.transactionName).toBe('TestQuery999');
			});
		});
	});
});
