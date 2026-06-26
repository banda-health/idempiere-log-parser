import { IdempiereLog } from './process-log-line';

type ParsedLogVariables = {
	type?: string;
	data?: {
		appVersion?: string;
		pathname?: string;
	};
};

const parseLogVariables = (variables: IdempiereLog['variables']): ParsedLogVariables | undefined => {
	if (!variables) {
		return undefined;
	}

	try {
		return typeof variables === 'string' ? JSON.parse(variables) : variables;
	} catch {
		return undefined;
	}
};

export const extractLogDimensions = (records: IdempiereLog[]) => {
	const clientIds = new Set<number>();
	const eventTypes = new Set<string>();
	const pathnames = new Set<string>();
	const appVersions = new Set<string>();

	for (const record of records) {
		if (record.userContext) {
			try {
				const userContext = JSON.parse(record.userContext);
				if (userContext.clientId) {
					clientIds.add(userContext.clientId);
				}
			} catch {
				// Ignore malformed user context.
			}
		}

		if (record.queryType !== 'log') {
			continue;
		}

		const parsedVariables = parseLogVariables(record.variables);
		if (!parsedVariables) {
			continue;
		}

		const eventType = parsedVariables.type?.trim();
		if (eventType) {
			eventTypes.add(eventType);
		}

		const pathname = parsedVariables.data?.pathname?.trim();
		if (pathname) {
			pathnames.add(pathname);
		}

		const appVersion = parsedVariables.data?.appVersion?.trim();
		if (appVersion) {
			appVersions.add(appVersion);
		}
	}

	return {
		appVersions: [...appVersions],
		clientIds: [...clientIds],
		eventTypes: [...eventTypes],
		pathnames: [...pathnames],
	};
};
