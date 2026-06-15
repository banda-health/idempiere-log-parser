import { watch } from 'chokidar';
import { config } from 'dotenv';
import { createReadStream, readdirSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { createInterface } from 'readline';
import { Tail, TailOptions } from 'tail';
import { IdempiereLog, processLogLine } from './process-log-line';
import { saveRecords } from './save-records';
import { scheduleVariablesPurge } from './schedule-variables-purge';

// Load environment variables from any .env file that exists
config();

if (!process.env.IDEMPIERE_LOG_DIRECTORY || !process.env.GRAFANA_TABLE) {
	if (!process.env.IDEMPIERE_LOG_DIRECTORY) {
		console.log('No log directory specified');
	}
	if (!process.env.GRAFANA_TABLE) {
		console.log('No Grafana table entered');
	}
	process.exit(1);
}

console.log('initializing DB connections...');
const grafana = new pg.Pool({
	user: process.env.GRAFANA_USER,
	host: process.env.GRAFANA_HOST,
	database: process.env.GRAFANA_DATABASE,
	password: process.env.GRAFANA_PASSWORD,
	port: parseInt(process.env.GRAFANA_DB_PORT || '5432', 10),
});
grafana.on('connect', (client) => {
	client
		.query('SET synchronous_commit TO OFF')
		.then(() => console.log('synchronous_commit is OFF for this DB session'))
		.catch((error) => console.log('failed to set synchronous_commit to OFF: ' + error));
});

const maxRecordsToSaveAtATime = 5000;
const variablesRetentionDays = parseInt(process.env.PII_VARIABLES_RETENTION_DAYS || '0', 10);
if (variablesRetentionDays > 0) {
	console.log(
		`variables purge enabled: clearing GraphQL variables older than ${variablesRetentionDays} days after saves`,
	);
} else {
	console.log('variables purge disabled: PII_VARIABLES_RETENTION_DAYS is not set or is 0');
}
const maybePurgeOldVariables =
	variablesRetentionDays > 0 ? scheduleVariablesPurge(grafana, variablesRetentionDays) : () => {};

// Ensure the process doesn't terminate by checking for and sending batch updates
let psqlInsertsToSend: IdempiereLog[] = [];
let areProcessingExistingFiles = false;

const iDempiereFileNamePattern = /idempiere\.(\d{4})-(\d{2})-(\d{2})_\d+.log$/;
let fileNames = readdirSync(process.env.IDEMPIERE_LOG_DIRECTORY).filter((fileName) =>
	iDempiereFileNamePattern.test(fileName),
);
const lastFileName = fileNames[fileNames.length - 1];
const shouldConsiderArchivedFiles =
	process.env.CONSIDER_ARCHIVED === 'true' && !!process.env.IDEMPIERE_LOG_ARCHIVE_DIRECTORY;

type LogFileLocation = {
	directory: string;
	fileName: string;
};

const getArchivedFiles = (): LogFileLocation[] => {
	if (!shouldConsiderArchivedFiles) {
		return [];
	}

	try {
		return readdirSync(process.env.IDEMPIERE_LOG_ARCHIVE_DIRECTORY!)
			.filter((fileName) => iDempiereFileNamePattern.test(fileName))
			.map((fileName) => ({
				directory: process.env.IDEMPIERE_LOG_ARCHIVE_DIRECTORY!,
				fileName,
			}));
	} catch (error) {
		console.log('unable to read archive directory: ' + error);
		return [];
	}
};

if (process.env.CONSIDER_EXISTING === 'true') {
	console.log('parsing existing files...');
	const filesToParse: LogFileLocation[] = [
		...getArchivedFiles(),
		...fileNames
			.filter((fileName) => fileName !== lastFileName)
			.map((fileName) => ({
				directory: process.env.IDEMPIERE_LOG_DIRECTORY!,
				fileName,
			})),
	];
	areProcessingExistingFiles = true;
	let fileCounter = 1;
	for (const { directory, fileName } of filesToParse) {
		console.log('parsing file ' + fileCounter++ + ' of ' + filesToParse.length + ': ' + fileName);
		// Pull day information from the file name
		const [, year, month, day] = fileName.match(iDempiereFileNamePattern) || [];
		const fileStream = createReadStream(join(directory, fileName));

		const readLineInterface = createInterface({
			input: fileStream,
			crlfDelay: Infinity,
		});
		for await (const line of readLineInterface) {
			// Now prepare the data for saving to the DB
			let processedLine: IdempiereLog | undefined;
			(processedLine = processLogLine({ year, month, day }, line)) && psqlInsertsToSend.push(processedLine);
			if (psqlInsertsToSend.length >= maxRecordsToSaveAtATime) {
				console.log('saving existing file records...');
				await saveRecords(grafana, psqlInsertsToSend)
					.then(() => {
						console.log('successfully saved records');
						psqlInsertsToSend.length = 0;
						maybePurgeOldVariables();
					})
					.catch((error) => {
						console.log('error saving records: ' + error);
					});
			}
		}
	}
	areProcessingExistingFiles = false;
} else {
	console.log('skipping existing files...');
}

setInterval(() => {
	// If we're currently saving or there's nothing to send, be done
	if (isAQueryInProcess || !psqlInsertsToSend.length || areProcessingExistingFiles) {
		return;
	}
	isAQueryInProcess = true;
	// Don't send more than 5000 at a time
	let psqlInsertsBeingSent = [...psqlInsertsToSend.slice(0, maxRecordsToSaveAtATime)];
	isAQueryInProcess = true;

	console.log('saving ' + psqlInsertsBeingSent.length + ' records');
	saveRecords(grafana, psqlInsertsBeingSent)
		.then(() => {
			console.log('successfully saved records');
			psqlInsertsToSend.splice(0, psqlInsertsBeingSent.length);
			maybePurgeOldVariables();
		})
		.catch((error) => {
			console.log('error saving records: ' + error);
		})
		.finally(() => {
			isAQueryInProcess = false;
		});
}, 1000);

console.log('watching files...');

const watchedFiles: { [fileName: string]: Tail } = {};
let isAQueryInProcess = false;
const handleFileChange = (fileName: any, options?: TailOptions) => {
	// If this was a rename, not an idempiere log file, or we're already watching it, be done
	if (fileName === null || !iDempiereFileNamePattern.test(fileName) || watchedFiles[fileName]) {
		return;
	}

	// Pull day information from the file name
	const [, year, month, day] = fileName.match(iDempiereFileNamePattern) || [];
	// Watch the new file
	const tail = new Tail(join(process.env.IDEMPIERE_LOG_DIRECTORY!, fileName), options);

	tail.on('line', (line) => {
		let processedLine: IdempiereLog | undefined;
		(processedLine = processLogLine({ year, month, day }, line)) && psqlInsertsToSend.push(processedLine);
	});

	tail.on('error', (error) => {
		console.log('ERROR: ' + error);
	});

	// Finally, add this file to the watched files
	watchedFiles[fileName] = tail;
};

handleFileChange(lastFileName, { fromBeginning: true });

watch(process.env.IDEMPIERE_LOG_DIRECTORY, {
	ignored: (file, stats) => !!stats?.isFile() && !file.endsWith('.log'),
	ignoreInitial: true,
	cwd: process.env.IDEMPIERE_LOG_DIRECTORY,
})
	.on('change', handleFileChange)
	.on('add', (file) => {
		console.log('new log file: ' + file, ' - removing watches on others...');
		Object.keys(watchedFiles).forEach((watchedFile) => {
			if (watchedFile !== file) {
				delete watchedFiles[watchedFile];
			}
		});
		handleFileChange(file);
	})
	.on('unlink', (file) => {
		console.log('file was removed, so no longer watching it: ' + file);
		delete watchedFiles[file];
	});

// Clean up if the process needs to exit
process.on('uncaughtException', (err, origin) => {
	console.log(process.stderr.fd, `Caught exception: ${err}\n` + `Exception origin: ${origin}\n`);
	grafana.end();
	Object.keys(watchedFiles).forEach((watchedFile) => {
		watchedFiles[watchedFile].unwatch();
		delete watchedFiles[watchedFile];
	});
	process.exit(1);
});
