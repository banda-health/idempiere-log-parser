function convertToSqlTimestamp(date: number) {
	return new Date(date).toISOString().slice(0, 23).replace('T', ' ');
}

export type IdempiereLog = [
	string,
	string,
	string,
	number,
	any | undefined,
	number | undefined,
	number | undefined,
	string | undefined,
];

const uuPattern = /UU: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const graqphqlNamePattern = /LoggingInstrumentation\.onCompleted: (\w*) (\w*)\(/;
const executionDurationPattern = /execution time \(ms\): (\d*) /;
const variablesPattern = /variables: (.*), execution/s;
// some logs extend over multiple lines, so we'll want to capture those
let multiLineData = { logTime: new Date(), line: '', isPresent: false, queryType: '', transactionName: '' };
export const processLogLine = (
	{ year, month, day }: { year: string; month: string; day: string },
	line: string,
): IdempiereLog | undefined => {
	if (!graqphqlNamePattern.test(line) && !multiLineData.isPresent) {
		return;
	}
	// If we got here and there's multi-line data present, let's assume a weird error and reset
	if (graqphqlNamePattern.test(line)) {
		multiLineData.isPresent = false;
		multiLineData.line = '';
	}
	let queryType: string = '',
		transactionName: string = '';

	[, queryType, transactionName] = multiLineData.isPresent
		? [, multiLineData.queryType, multiLineData.transactionName]
		: graqphqlNamePattern.exec(line) || [, '', ''];
	// Pull the time from the log file
	const logTime = multiLineData.isPresent
		? multiLineData.logTime
		: new Date(
				parseInt(year, 10),
				parseInt(month, 10) - 1,
				parseInt(day, 10),
				parseInt(line.substring(0, 2), 10),
				parseInt(line.substring(3, 5), 10),
				parseInt(line.substring(6, 8), 10),
				parseInt(line.substring(9, 12), 10),
		  );
	// If we don't have a closing execution match, we'll start adding this line
	let lineToUse = multiLineData.isPresent ? multiLineData.line : line;
	if (!executionDurationPattern.test(line)) {
		multiLineData.isPresent = true;
		if (multiLineData.line) {
			multiLineData.line += '\n';
		}
		multiLineData.line += line;
		multiLineData = { ...multiLineData, logTime, queryType, transactionName };
		return;
	} else {
		if (multiLineData.isPresent) {
			multiLineData.line += '\n' + line;
			lineToUse = multiLineData.line;
		}
		multiLineData.isPresent = false;
		multiLineData.line = '';
	}
	const duration = parseInt(executionDurationPattern.exec(lineToUse)?.[1] || '0', 10);
	let variables: any | undefined =
		variablesPattern.test(lineToUse) && variablesPattern.exec(lineToUse)![1]
			? variablesPattern.exec(lineToUse)![1]
			: undefined;
	let recordUU: string | undefined;
	if (variables) {
		try {
			// Try casting it to a valid JSON object
			variables = JSON.stringify({ variables: JSON.parse('{' + variables + '}') });
			recordUU = variables?.UU;
		} catch {
			// The cast failed, so just save it as a string
			variables = JSON.stringify({ variables });
			recordUU = uuPattern.exec(variables)?.[1];
		}
	}

	// Now prepare the data for saving to the DB
	return [
		convertToSqlTimestamp(logTime.getTime()),
		queryType,
		transactionName,
		duration,
		variables || undefined,
		undefined, // future use ad_client_id
		undefined, // future use ad_org_id
		recordUU || undefined,
	];
};
