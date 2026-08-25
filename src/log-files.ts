import { accessSync, constants } from 'fs';

export const iDempiereFileNamePattern = /idempiere\.(\d{4})-(\d{2})-(\d{2})_(\d+).log$/;

export type LogFileLocation = {
	directory: string;
	fileName: string;
};

export type ParsedLogFileName = {
	year: string;
	month: string;
	day: string;
	sequence: number;
	dateKey: string;
};

export function parseLogFileName(fileName: string): ParsedLogFileName | undefined {
	const match = fileName.match(iDempiereFileNamePattern);
	if (!match) {
		return undefined;
	}
	const [, year, month, day, sequence] = match;
	return {
		year,
		month,
		day,
		sequence: parseInt(sequence, 10),
		dateKey: `${year}-${month}-${day}`,
	};
}

export function compareLogFileNames(a: string, b: string): number {
	const parsedA = parseLogFileName(a);
	const parsedB = parseLogFileName(b);
	if (!parsedA && !parsedB) {
		return a.localeCompare(b);
	}
	if (!parsedA) {
		return -1;
	}
	if (!parsedB) {
		return 1;
	}
	if (parsedA.dateKey !== parsedB.dateKey) {
		return parsedA.dateKey.localeCompare(parsedB.dateKey);
	}
	return parsedA.sequence - parsedB.sequence;
}

export function sortLogFiles<T extends { fileName: string }>(files: T[]): T[] {
	return [...files].sort((a, b) => compareLogFileNames(a.fileName, b.fileName));
}

export function localDateKey(now: Date = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isReadablePath(filePath: string): boolean {
	try {
		accessSync(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

export function filterReadableFiles<T extends LogFileLocation>(
	files: T[],
	canRead: (file: T) => boolean,
): T[] {
	return files.filter((file) => {
		if (canRead(file)) {
			return true;
		}
		console.log('skipping unreadable file: ' + file.fileName);
		return false;
	});
}

export function isPermissionWatchError(error: unknown): boolean {
	if (error == null) {
		return false;
	}
	if (typeof error === 'string') {
		return /EACCES|EPERM|permission denied/i.test(error);
	}
	if (typeof error !== 'object') {
		return false;
	}
	const { code, message } = error as { code?: string; message?: string };
	if (code === 'EACCES' || code === 'EPERM') {
		return true;
	}
	return typeof message === 'string' && /EACCES|EPERM|permission denied/i.test(message);
}

export function selectStartupLogFiles({
	liveFiles,
	archivedFiles,
	considerExisting,
	today,
}: {
	liveFiles: LogFileLocation[];
	archivedFiles: LogFileLocation[];
	considerExisting: boolean;
	today: string;
}): { filesToParse: LogFileLocation[]; fileToWatch: LogFileLocation | undefined } {
	const sortedLiveFiles = sortLogFiles(liveFiles);
	const fileToWatch = sortedLiveFiles[sortedLiveFiles.length - 1];
	const shouldParse = (file: LogFileLocation) => {
		if (fileToWatch && file.directory === fileToWatch.directory && file.fileName === fileToWatch.fileName) {
			return false;
		}
		if (considerExisting) {
			return true;
		}
		return parseLogFileName(file.fileName)?.dateKey === today;
	};

	return {
		filesToParse: [...sortLogFiles(archivedFiles), ...sortedLiveFiles].filter(shouldParse),
		fileToWatch,
	};
}
