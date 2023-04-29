/* --------------------
 * yauzl-mac module
 * Shim `ZipFile.prototype` methods to capture reads from Central Directory
 * and do further processing for Mac Archive Utility ZIP files
 * ------------------*/

'use strict';

// Imports
const {readAndAssertNoEof, emitErrorAndAutoClose} = require('./internals.js');
const {
	SIXTY_FOUR_KIB, FOUR_GIB,
	CDH_MIN_LENGTH, CDH_MAX_LENGTH, CDH_SIGNATURE,
	LFH_LENGTH, LF_EXTRA_FIELDS_LENGTH_MAC, LF_MIN_LENGTH, LFH_SIGNATURE,
	DATA_DESCRIPTOR_LENGTH, DATA_DESCRIPTOR_SIGNATURE
} = require('./constants.js');

// Exports

module.exports = {
	shim,
	emittedEntry,
	emittedError
};

/*
 * Shim yauzl methods
 */
function shim(yauzl) {
	const {ZipFile} = yauzl;

	// Add `_readEntryAt` method
	ZipFile.prototype._readEntryAt = _readEntryAt;

	// Replace `readEntry` method
	ZipFile.prototype._publicReadEntryOriginal = ZipFile.prototype.readEntry;
	ZipFile.prototype.readEntry = readEntry;

	// Make `_readEntry` method a no-op to prevent `_readEntry` calling itself
	// prematurely (before `readEntryDone` executed) if `lazyEntries` option set
	ZipFile.prototype._readEntryOriginal = ZipFile.prototype._readEntry;
	ZipFile.prototype._readEntry = function() {};
}

/*
 * Event interceptors
 * (attached to zipFile in open.js)
 */
function emittedEntry(entry, cb) {
	const zipFile = this; // eslint-disable-line no-invalid-this

	// If during `_readEntryAt` operation, call `readAtEntry()`
	if (zipFile._readingAt) {
		readAtEntry(zipFile, entry);
		return;
	}

	// Call `readEntryDone()`
	readEntryDone(zipFile, entry, cb);
}

function emittedError(err, cb) {
	const zipFile = this; // eslint-disable-line no-invalid-this

	// If during `_readEntryAt` operation, call `readAtError()`
	if (zipFile._readingAt) {
		readAtError(zipFile, err);
		return;
	}

	// Emit all other errors
	cb(null, err);
}

/*
 * ZipFile.prototype._readEntryAt method
 * Attempt to read Central Directory entry at `offset`
 * Calls `cb` with entry or error.
 * After success/failure, resets everything as if the read never happened.
 *
 * Works by:
 *   - calling `._readEntry()`
 *   - capturing emitted `entry` and `error` events
 *   - passing captured events to `readAtEntry()` / `readAtError()`
 *   - those functions call the callback with result
 *   - no events emitted
 */
function _readEntryAt(offset, cb) {
	const zipFile = this; // eslint-disable-line no-invalid-this

	// Save parameters to be intercepted when read completes
	// and used within `readEntryAtEntry()` or `readEntryAtError()`
	zipFile._readingAt = {
		readEntryCursor: zipFile.readEntryCursor,
		autoClose: zipFile.autoClose,
		cb
	};

	// Set reading start position to desired location
	zipFile.readEntryCursor = offset;

	// Disable autoClose to prevent closing if error
	zipFile.autoClose = false;

	// Attempt to read entry
	zipFile._readEntryOriginal();
}

function readAtEntry(zipFile, entry) {
	// Restore state to as before
	const cb = readAtDone(zipFile);
	zipFile.entriesRead--;

	// Callback with entry
	cb(null, entry);
}

function readAtError(zipFile, err) {
	// Restore state to as before
	const cb = readAtDone(zipFile);
	zipFile.emittedError = false;

	// Callback with error
	cb(err);
}

function readAtDone(zipFile) {
	// Extract params
	const params = zipFile._readingAt;
	zipFile._readingAt = undefined;

	// Restore readEntryCursor and autoClose to what they were before
	zipFile.readEntryCursor = params.readEntryCursor;
	zipFile.autoClose = params.autoClose;

	// Return callback
	return params.cb;
}

/*
 * ZipFile.prototype.readEntry replacement method
 * Runs original method (to throw if cannot read now)
 * then runs actual `readEntry` method.
 */
function readEntry() {
	const zipFile = this; // eslint-disable-line no-invalid-this
	zipFile._publicReadEntryOriginal();
	zipFile._readEntryOriginal();
}

function readEntryDone(zipFile, entry, cb) {
	// If not Mac Archive Utility, emit event unchanged
	if (!zipFile.supportMacArchiveUtility || !zipFile.isMacArchive) {
		if (zipFile.supportMacArchiveUtility) entry.uncompressedSizeCertain = true;
		emitEntry(zipFile, entry, cb);
		return;
	}

	// Is Mac Archive Utility file
	// Check entry details are correct
	const size = entry.compressedSize;
	let offset = zipFile.readFileCursor;

	// Check this file carrying on from directly after last file's data descriptor ended
	if (entry.relativeOffsetOfLocalHeader !== offset % FOUR_GIB) {
		emitError(zipFile);
		return;
	}

	entry.relativeOffsetOfLocalHeader = offset;

	// Check if ambiguity over position of end of file
	// - Files are compressed and have Data Descriptor and Extra Fields.
	//   Size may be incorrect - truncated to lower 32 bits.
	// - Folders are not compressed and have no Data Descriptor but do have Extra Fields.
	//   Size = 0.
	// - Symlinks are not compressed and have no Data Descriptor or Extra Fields.
	//   Size assumed under 4GiB as file content is just path to linked file.
	offset += LFH_LENGTH + entry.fileNameLength + size;
	if (entry.compressionMethod !== 0) offset += DATA_DESCRIPTOR_LENGTH;
	if (entry.extraFieldLength > 0) offset += LF_EXTRA_FIELDS_LENGTH_MAC;
	zipFile.readFileCursor = offset;

	if (entry.compressionMethod === 0) {
		entry.uncompressedSizeCertain = true;
		found(zipFile, entry, cb);
		return;
	}

	entry.uncompressedSizeCertain = false;

	if (
		offset + LF_MIN_LENGTH * (zipFile.entryCount - zipFile.entriesRead) + FOUR_GIB
		> zipFile.centralDirectoryOffset
	) {
		found(zipFile, entry, cb);
		return;
	}

	// Size of compressed data is uncertain
	// Search for data descriptor at end of file data
	searchFileEnd(zipFile, entry, size, offset, cb);
}

function searchFileEnd(zipFile, entry, size, offset, cb) {
	// Read Data Descriptor + next 4 bytes
	const bufferLen = DATA_DESCRIPTOR_LENGTH + 4,
		buffer = Buffer.alloc(bufferLen);
	readAndAssertNoEof(zipFile.reader, buffer, 0, bufferLen, offset - DATA_DESCRIPTOR_LENGTH, (err) => {
		if (err) {
			emitErrorAndAutoClose(zipFile, err);
			return;
		}

		if (
			buffer.readUInt32LE(0) === DATA_DESCRIPTOR_SIGNATURE
			&& buffer.readUInt32LE(4) === entry.crc32
			&& buffer.readUInt32LE(8) === entry.compressedSize
			&& buffer.readUInt32LE(12) === entry.uncompressedSize
			&& (buffer.readUInt32LE(16) === LFH_SIGNATURE || buffer.readUInt32LE(16) === CDH_SIGNATURE)
		) {
			// Found!
			entry.compressedSize = size;
			zipFile.readFileCursor = offset;
			found(zipFile, entry, cb);
			return;
		}

		// Not found - try next position
		offset += FOUR_GIB;
		size += FOUR_GIB;

		if (offset > zipFile.centralDirectoryOffset) {
			emitError(zipFile);
			return;
		}

		searchFileEnd(zipFile, entry, size, offset, cb);
	});
}

/*
 * Size of compressed file data has been determined
 */
function found(zipFile, entry, cb) {
	// Check if entryCount is too low or is now certain
	if (!zipFile.entryCountCertain) {
		const bytesRemaining = zipFile.endOfCentralDirectoryOffset - zipFile.readEntryCursor;
		let entriesRemaining = zipFile.entryCount - zipFile.entriesRead;

		// Check if entryCount is too low
		const maxSize = CDH_MAX_LENGTH * entriesRemaining;
		if (bytesRemaining > maxSize) {
			zipFile.entryCount += Math.ceil((bytesRemaining - maxSize) / CDH_MAX_LENGTH / SIXTY_FOUR_KIB)
				* SIXTY_FOUR_KIB;
			entriesRemaining = zipFile.entryCount - zipFile.entriesRead;
			zipFile.isFaulty = true;
		}

		// Check if entryCount is now certain
		if ((entriesRemaining + SIXTY_FOUR_KIB) * CDH_MIN_LENGTH > bytesRemaining) {
			zipFile.entryCountCertain = true;
		}
	}

	// Emit entry
	emitEntry(zipFile, entry, cb);
}

/*
 * Read complete
 * Emit 'entry' event and run `_readEntry` if lazyEntries option not set.
 */
function emitEntry(zipFile, entry, cb) {
	// Emit entry
	cb(null, entry);

	// If lazyEntries option not set, read next entry
	if (!zipFile.lazyEntries) zipFile._readEntryOriginal();
}

/*
 * Error with finding local file header
 */
function emitError(zipFile) {
	emitErrorAndAutoClose(zipFile, new Error('cannot read local file header'));
}
