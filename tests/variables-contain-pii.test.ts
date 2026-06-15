import { variablesContainPii } from '../src/variables-contain-pii';

describe('variablesContainPii', () => {
	it('detects sensitive JSON fields', () => {
		expect(variablesContainPii('{"Password":"secret"}')).toBe(true);
		expect(variablesContainPii('{"NewPassword":"secret"}')).toBe(true);
		expect(variablesContainPii('{"Answer":"secret answer"}')).toBe(true);
	});

	it('does not flag normal site activity logs', () => {
		expect(
			variablesContainPii(
				'{"type":"page_view","data":{"pathname":"/visits","timestamp":1718457600000}}',
			),
		).toBe(false);
		expect(variablesContainPii('User action performed')).toBe(false);
	});
});
