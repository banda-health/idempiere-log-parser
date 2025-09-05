import { processLogLine } from '../src/process-log-line';

describe('Integration Tests', () => {
	describe('Real-world log line processing', () => {
		const testDate = { year: '2024', month: '01', day: '15' };

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
