// Jest setup file for global test configuration
// This file runs before each test file

// Set up any global test utilities or mocks here
// For example, you might want to mock environment variables

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeEach(() => {
	// Reset console mocks before each test
	console.log = jest.fn();
	console.error = jest.fn();
	console.warn = jest.fn();
});

afterEach(() => {
	// Restore original console methods after each test
	Object.assign(console, originalConsole);
});
