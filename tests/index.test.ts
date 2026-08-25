import { join } from 'path';
import {
	compareLogFileNames,
	filterReadableFiles,
	iDempiereFileNamePattern,
	isPermissionWatchError,
	isReadablePath,
	localDateKey,
	parseLogFileName,
	selectStartupLogFiles,
	sortLogFiles,
} from '../src/log-files';

describe('iDempiere Log Parser Utilities', () => {
	describe('File pattern matching', () => {
		it('should correctly identify iDempiere log files', () => {
			const validFiles = [
				'idempiere.2024-01-15_001.log',
				'idempiere.2023-12-31_999.log',
				'idempiere.2024-02-29_123.log',
			];

			const invalidFiles = [
				'idempiere.2024-01-15.log', // Missing sequence number
				'idempiere.24-01-15_001.log', // Wrong year format
				'other.2024-01-15_001.log', // Wrong prefix
				'idempiere.2024-01-15_001.txt', // Wrong extension
				'idempiere.2024-01-15_001.log.gz',
			];

			validFiles.forEach((file) => {
				expect(iDempiereFileNamePattern.test(file)).toBe(true);
			});

			invalidFiles.forEach((file) => {
				expect(iDempiereFileNamePattern.test(file)).toBe(false);
			});
		});

		it('should extract date components from filename', () => {
			const parsed = parseLogFileName('idempiere.2024-01-15_001.log');
			expect(parsed).toBeDefined();
			expect(parsed?.year).toBe('2024');
			expect(parsed?.month).toBe('01');
			expect(parsed?.day).toBe('15');
			expect(parsed?.sequence).toBe(1);
			expect(parsed?.dateKey).toBe('2024-01-15');
		});
	});

	describe('startup file selection', () => {
		const live = (fileName: string) => ({ directory: '/var/log/idempiere/ke', fileName });
		const archived = (fileName: string) => ({ directory: '/var/log/idempiere/ke/old', fileName });
		const today = '2026-08-25';

		it('sorts log files by date then sequence number, not directory order', () => {
			const sorted = sortLogFiles([
				live('idempiere.2026-08-25_10.log'),
				live('idempiere.2026-08-18_0.log'),
				live('idempiere.2026-08-25_2.log'),
				live('idempiere.2026-08-25_9.log'),
			]).map((file) => file.fileName);

			expect(sorted).toEqual([
				'idempiere.2026-08-18_0.log',
				'idempiere.2026-08-25_2.log',
				'idempiere.2026-08-25_9.log',
				'idempiere.2026-08-25_10.log',
			]);
			expect(compareLogFileNames('idempiere.2026-08-25_9.log', 'idempiere.2026-08-25_10.log')).toBeLessThan(0);
		});

		it('always parses earlier files from today even when considerExisting is false', () => {
			const { filesToParse, fileToWatch } = selectStartupLogFiles({
				liveFiles: [
					live('idempiere.2026-08-24_0.log'),
					live('idempiere.2026-08-25_0.log'),
					live('idempiere.2026-08-25_1.log'),
				],
				archivedFiles: [archived('idempiere.2026-08-20_0.log')],
				considerExisting: false,
				today,
			});

			expect(fileToWatch?.fileName).toBe('idempiere.2026-08-25_1.log');
			expect(filesToParse.map((file) => file.fileName)).toEqual(['idempiere.2026-08-25_0.log']);
		});

		it('tails the only today file from the start and skips older days when considerExisting is false', () => {
			const { filesToParse, fileToWatch } = selectStartupLogFiles({
				liveFiles: [live('idempiere.2026-08-24_0.log'), live('idempiere.2026-08-25_0.log')],
				archivedFiles: [archived('idempiere.2026-08-20_0.log')],
				considerExisting: false,
				today,
			});

			expect(fileToWatch?.fileName).toBe('idempiere.2026-08-25_0.log');
			expect(filesToParse).toEqual([]);
		});

		it('parses archived and older live files when considerExisting is true, except the newest live file', () => {
			const { filesToParse, fileToWatch } = selectStartupLogFiles({
				liveFiles: [live('idempiere.2026-08-24_0.log'), live('idempiere.2026-08-25_0.log')],
				archivedFiles: [archived('idempiere.2026-08-20_0.log')],
				considerExisting: true,
				today,
			});

			expect(fileToWatch?.fileName).toBe('idempiere.2026-08-25_0.log');
			expect(filesToParse.map((file) => file.fileName)).toEqual([
				'idempiere.2026-08-20_0.log',
				'idempiere.2026-08-24_0.log',
			]);
		});

		it('includes archived files from today even when considerExisting is false', () => {
			const { filesToParse, fileToWatch } = selectStartupLogFiles({
				liveFiles: [live('idempiere.2026-08-25_0.log')],
				archivedFiles: [archived('idempiere.2026-08-25_0.log'), archived('idempiere.2026-08-20_0.log')],
				considerExisting: false,
				today,
			});

			expect(fileToWatch?.fileName).toBe('idempiere.2026-08-25_0.log');
			expect(filesToParse).toEqual([archived('idempiere.2026-08-25_0.log')]);
		});

		it('skips unreadable files before selecting what to parse and watch', () => {
			const readable = filterReadableFiles(
				[live('idempiere.2026-08-18_0.log'), live('idempiere.2026-08-25_0.log')],
				(file) => file.fileName !== 'idempiere.2026-08-18_0.log',
			);

			expect(readable.map((file) => file.fileName)).toEqual(['idempiere.2026-08-25_0.log']);
			expect(console.log).toHaveBeenCalledWith('skipping unreadable file: idempiere.2026-08-18_0.log');
		});

		it('treats missing paths as unreadable', () => {
			expect(isReadablePath(join('/this/path/does/not/exist', 'idempiere.2026-08-18_0.log'))).toBe(false);
		});

		it('uses the local calendar date as today', () => {
			expect(localDateKey(new Date(2026, 7, 25, 23, 59, 59))).toBe('2026-08-25');
		});
	});

	describe('watch error handling', () => {
		it('recognizes permission errors that should not take the parser down', () => {
			expect(isPermissionWatchError({ code: 'EACCES', message: "EACCES: permission denied, watch '/tmp/a.log'" })).toBe(
				true,
			);
			expect(isPermissionWatchError({ code: 'EPERM' })).toBe(true);
			expect(isPermissionWatchError("Error: EACCES: permission denied, watch '/tmp/a.log'")).toBe(true);
			expect(isPermissionWatchError(new Error('EPERM: operation not permitted'))).toBe(true);
		});

		it('does not treat unrelated errors as permission watch failures', () => {
			expect(isPermissionWatchError({ code: 'ENOENT', message: 'file not found' })).toBe(false);
			expect(isPermissionWatchError(new Error('disk full'))).toBe(false);
			expect(isPermissionWatchError(null)).toBe(false);
		});
	});
});
