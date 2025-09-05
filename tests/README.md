# Testing Guide

This directory contains the test suite for the iDempiere Log Parser project.

## Test Structure

- `setup.ts` - Global test configuration and setup
- `process-log-line.test.ts` - Unit tests for the log line processing functionality
- `index.test.ts` - Unit tests for the main application logic
- `integration.test.ts` - Integration tests with real-world scenarios

## Running Tests

### Run all tests

```bash
npm test
```

### Run tests in watch mode (for development)

```bash
npm run test:watch
```

### Run tests with coverage report

```bash
npm run test:coverage
```

## Test Categories

### Unit Tests

- **process-log-line.test.ts**: Tests the core log parsing functionality

  - GraphQL query/mutation processing
  - Log entry processing
  - Exception handling
  - Multiline log processing
  - Edge cases and error handling

- **index.test.ts**: Tests the main application setup
  - Environment variable validation
  - Database configuration
  - File pattern matching
  - File watching setup

### Integration Tests

- **integration.test.ts**: Tests with realistic log data
  - Real-world log line processing
  - Performance testing
  - Complex scenarios
  - Memory efficiency

## Writing New Tests

When adding new functionality:

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test how components work together
3. **Edge Cases**: Test boundary conditions and error scenarios
4. **Performance**: Test with large datasets when relevant

### Test Naming Convention

- Use descriptive test names that explain what is being tested
- Group related tests using `describe` blocks
- Use `it` for individual test cases

### Example Test Structure

```typescript
describe('FunctionName', () => {
	beforeEach(() => {
		// Setup for each test
	});

	describe('specific behavior', () => {
		it('should do something specific', () => {
			// Test implementation
		});
	});
});
```

## Mocking

The tests use Jest mocking for:

- File system operations
- Database connections
- External dependencies
- Environment variables

## Coverage

The test suite aims for:

- High code coverage (>80%)
- All critical paths tested
- Edge cases covered
- Error scenarios tested

Run `npm run test:coverage` to see the current coverage report.
