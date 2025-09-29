function convertToSqlTimestamp(date: number) {
	return new Date(date).toISOString().slice(0, 23).replace('T', ' ');
}

export type IdempiereLog = {
	clientId?: number;
	duration?: number;
	errorData?: string;
	logTime: string;
	organizationId?: number;
	queryType: 'query' | 'mutation' | 'log';
	recordUU?: string;
	transactionName: string;
	variables?: any;
	userContext?: string;
	userId?: number;
};

const uuPattern = /UU: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const graphqlNamePattern = /LoggingInstrumentation\.onCompleted: (\w*) (\w*)\(/;
const logNamePattern = /LoggingMutation\.Log: /;
const executionDurationPattern = /execution time \(ms\): (\d*) /;
const variablesPattern =
	/variables: (.*), userId: (\d+), clientId: (\d+), organizationId: (\d+), roleId: (\d+), warehouseId: (\d+), execution/s;
const variablesPatternWithoutUserContext = /variables: (.*), execution/s;
const logPattern = /\.Log: (.*), AD_Client_ID: (\d+), AD_Org_ID: (\d+), AD_User_ID: (\d+)/s;
const exceptionPattern = /SimpleDataFetcherExceptionHandler.onException: (.*)/;
const logLineStartPattern = /^\d{2}:\d{2}:\d{2}.\d{3}/;
// some logs extend over multiple lines, so we'll want to capture those
let multiLineData = { logTime: new Date(), line: '', isPresent: false, queryType: '', transactionName: '' };
let exceptionData: string[] = [];
export const processLogLine = (
	{ year, month, day }: { year: string; month: string; day: string },
	line: string,
): IdempiereLog | undefined => {
	// If we're not doing anything with this line, be done
	if (
		!graphqlNamePattern.test(line) &&
		!multiLineData.isPresent &&
		!logNamePattern.test(line) &&
		!exceptionPattern.test(line) &&
		!exceptionData.length
	) {
		return;
	}
	// If this is a log, capture the data
	if (logNamePattern.test(line)) {
		const logTime = new Date(
			parseInt(year, 10),
			parseInt(month, 10) - 1,
			parseInt(day, 10),
			parseInt(line.substring(0, 2), 10),
			parseInt(line.substring(3, 5), 10),
			parseInt(line.substring(6, 8), 10),
			parseInt(line.substring(9, 12), 10),
		);
		const [, loggedData, clientId, organizationId, userId] = logPattern.exec(line) || [, '', '0', '0', '0'];
		return {
			clientId: clientId ? parseInt(clientId, 10) : undefined,
			logTime: convertToSqlTimestamp(logTime.getTime()),
			organizationId: organizationId ? parseInt(organizationId, 10) : undefined,
			queryType: 'log',
			transactionName: 'Log',
			userId: userId ? parseInt(userId, 10) : undefined,
			variables: loggedData,
		};
	}
	// If this is the start of an error or not a line starting with a date, capturing the data and return
	if (exceptionPattern.test(line) || (exceptionData.length && !logLineStartPattern.test(line))) {
		exceptionData.push(
			exceptionPattern.test(line) ? line.split('SimpleDataFetcherExceptionHandler.onException: ')[1] : line,
		);
		return;
	}
	// By now, we have the GraphQL data
	// If we got here and there's multi-line data present, let's assume a weird error and reset
	if (graphqlNamePattern.test(line)) {
		multiLineData.isPresent = false;
		multiLineData.line = '';
	}
	let queryType: string = '',
		transactionName: string = '';

	[, queryType, transactionName] = multiLineData.isPresent
		? [, multiLineData.queryType, multiLineData.transactionName]
		: graphqlNamePattern.exec(line) || [, '', ''];
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
	let [, variables, userId, clientId, organizationId, roleId, warehouseId] = variablesPattern.test(lineToUse)
		? variablesPattern.exec(lineToUse)!
		: variablesPatternWithoutUserContext.test(lineToUse)
		? variablesPatternWithoutUserContext.exec(lineToUse)!
		: [];
	let recordUU: string | undefined;
	let userContext: string | undefined;
	if (userId || clientId || organizationId || roleId || warehouseId) {
		userContext = JSON.stringify({
			clientId: clientId ? parseInt(clientId, 10) : undefined,
			organizationId: organizationId ? parseInt(organizationId, 10) : undefined,
			roleId: roleId ? parseInt(roleId, 10) : undefined,
			userId: userId ? parseInt(userId, 10) : undefined,
			warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
		});
	}
	if (variables) {
		try {
			// Try casting it to a valid JSON object
			let parsedVariables = JSON.parse(variables);
			recordUU = parsedVariables?.UU;
			variables = JSON.stringify(parsedVariables);
		} catch {
			// The cast failed, so just save it as a string
			variables = JSON.stringify({ variables });
			recordUU = uuPattern.exec(variables)?.[1];
		}
	}

	// Now prepare the data for saving to the DB
	const errorDataToReturn = exceptionData.length ? [...exceptionData].join('\n') : undefined;
	exceptionData.length = 0;
	// If nothing was set for the user's context information, all these should be 0 and we don't want to log that here (logged on the variables)
	return {
		duration,
		errorData: errorDataToReturn,
		logTime: convertToSqlTimestamp(logTime.getTime()),
		transactionName,
		queryType: queryType === 'mutation' ? 'mutation' : 'query',
		recordUU: recordUU || undefined,
		userContext: userContext || undefined,
		variables: variables || undefined,
	};
};
