export const sensitiveVariableFieldNames = ['Password', 'NewPassword', 'Answer'] as const;

export const sensitiveVariableFieldSqlPatterns = sensitiveVariableFieldNames.map(
	(fieldName) => `"${fieldName}"\\s*:`,
);

export const variablesContainPii = (variables: string) =>
	sensitiveVariableFieldSqlPatterns.some((pattern) => new RegExp(pattern, 'i').test(variables));
