import { watch } from 'chokidar';
import { config } from 'dotenv';
import { createReadStream, readdirSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { createInterface } from 'readline';
import { Tail, TailOptions } from 'tail';
import { IdempiereLog, processLogLine } from './process-log-line';

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

// Ensure the process doesn't terminate by checking for and sending batch updates
let psqlInsertsToSend: IdempiereLog[] = [];
setInterval(() => {
	// If we're currently saving or there's nothing to send, be done
	if (isAQueryInProcess || !psqlInsertsToSend.length) {
		return;
	}
	isAQueryInProcess = true;
	let psqlInsertsBeingSent = [...psqlInsertsToSend];
	isAQueryInProcess = true;
	let variableCounter = 1;
	let valuesStatement = psqlInsertsBeingSent
		.map((record) => '(' + record.map(() => '$' + variableCounter++).join(',') + ')')
		.join(',');
	console.log('saving ' + psqlInsertsBeingSent.length + ' records');
	grafana
		.query(
			`insert into ${process.env
				.GRAFANA_TABLE!} (log_time, query_type, query_name, duration, variables, ad_client_id, ad_org_id, record_uu) VALUES` +
				valuesStatement +
				' ON CONFLICT DO NOTHING',
			psqlInsertsBeingSent.flatMap((record) => record),
		)
		.then(() => {
			console.log('successfully saved records');
			psqlInsertsToSend.splice(0, psqlInsertsBeingSent.length);
		})
		.catch((error) => {
			console.log('error saving records: ' + error);
		})
		.finally(() => {
			isAQueryInProcess = false;
		});
}, 5000);

const iDempiereFileNamePattern = /idempiere\.(\d{4})-(\d{2})-(\d{2})_\d+.log$/;
let fileNames = readdirSync(process.env.IDEMPIERE_LOG_DIRECTORY).filter((fileName) =>
	iDempiereFileNamePattern.test(fileName),
);
const lastFileName = fileNames[fileNames.length - 1];
if (process.env.CONSIDER_EXISTING === 'true') {
	console.log('parsing existing files...');
	let fileCounter = 1;
	for (let fileName of fileNames) {
		if (fileName === lastFileName) {
			continue;
		}
		console.log('parsing file ' + fileCounter++ + ' of ' + (fileNames.length - 1) + ': ' + fileName);
		// Pull day information from the file name
		const [, year, month, day] = fileName.match(iDempiereFileNamePattern) || [];
		const fileStream = createReadStream(join(process.env.IDEMPIERE_LOG_DIRECTORY!, fileName));

		const readLineInterface = createInterface({
			input: fileStream,
			crlfDelay: Infinity,
		});
		for await (const line of readLineInterface) {
			// Now prepare the data for saving to the DB
			let processedLine: IdempiereLog | undefined;
			(processedLine = processLogLine({ year, month, day }, line)) && psqlInsertsToSend.push(processedLine);
		}
	}
} else {
	console.log('skipping existing files...');
}

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
})
	.on('change', (file) => handleFileChange)
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
