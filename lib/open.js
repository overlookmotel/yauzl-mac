/* --------------------
 * yauzl-mac module
 * Shim open/fromFd/fromBuffer/fromRandomAccessReader methods
 * ------------------*/

'use strict';

// Modules
const yauzlClone = require('yauzl-clone');

// Imports
const {isSlash} = require('./utils');
const {
	SIXTY_FOUR_KIB, FOUR_GIB,
	ECDR_MIN_LENGTH,
	CDH_MIN_LENGTH, CDH_MAX_LENGTH,
	CDH_EXTRA_FIELDS_LENGTH_MAC, CDH_EXTRA_FIELD_ID_MAC,
	FOUND_NONE, FOUND_NORMAL, FOUND_MAC,
	INVALID_CDH_ERROR_MESSAGE
} = require('./constants');

const {emittedEntry, emittedError} = require('./readEntry');

// Exports

/*
 * Shim yauzl methods
 * `.open()`, `.fromFd()`, `.fromBuffer()` and `.fromRandomAccessReader()`
 */
module.exports = function(yauzl) {
	yauzlClone.patchAll(yauzl, wrapper);
};

function wrapper(original) {
	return function(path, totalSize, options, cb) {
		original(path, totalSize, options, function(err, zipFile) {
			afterMethod(err, zipFile, options, cb);
		});
	};
}

function afterMethod(err, zipFile, options, cb) {
	// If error, pass error to callback
	if (err) return cb(err);

	// Record supportMacArchiveUtility option to zipFile object
	zipFile.supportMacArchiveUtility = !!options.supportMacArchiveUtility;

	// If Archive Utility mode on, locate Central Directory
	if (options.supportMacArchiveUtility) return locateCentralDirectory(zipFile, cb);

	// Callback
	cb(null, zipFile);
}

/*
 * Locate Central Directory
 */
function locateCentralDirectory(zipFile, cb) {
	// Set initial flags
	zipFile.isMacArchive = false;
	zipFile.isFaulty = false;
	zipFile.entryCountCertain = true;
	zipFile._readingAt = undefined;

	// Create emit interceptors
	zipFile.intercept('entry', emittedEntry);
	zipFile.intercept('error', emittedError);

	// If cannot be Mac Archive, exit

	// Mac Archives are not ZIP64
	if (zipFile.zip64) return done(zipFile, cb);

	// Mac Archives do not contain comment after End of Central Directory
	const {endOfCentralDirectoryOffset} = zipFile;
	if (zipFile.fileSize - endOfCentralDirectoryOffset != ECDR_MIN_LENGTH) return done(zipFile, cb);

	// Mac Archives do not have gap between end of last Central Directory Header
	// and start of EOCD Record
	let offset = zipFile.centralDirectoryOffset,
		size = zipFile.centralDirectorySize;
	if (endOfCentralDirectoryOffset % FOUR_GIB != (offset + size) % FOUR_GIB) return done(zipFile, cb);

	// Ensure size and entryCount comply with each other
	// and adjust if they don't
	// TODO Test this actually works!
	let minSize = CDH_MIN_LENGTH * zipFile.entryCount,
		maxSize = CDH_MAX_LENGTH * zipFile.entryCount;

	if (size < minSize || size > maxSize) {
		zipFile.isFaulty = true;

		do {
			if (size < minSize) {
				// Size must be larger than stated
				size += Math.ceil((minSize - size) / FOUR_GIB) * FOUR_GIB;
			} else if (size > maxSize) {
				// EntryCount must be larger than stated
				zipFile.entryCount += Math.ceil((size - maxSize) / CDH_MAX_LENGTH / SIXTY_FOUR_KIB) * SIXTY_FOUR_KIB;
				minSize = CDH_MIN_LENGTH * zipFile.entryCount;
				maxSize = CDH_MAX_LENGTH * zipFile.entryCount;
			}
		} while (size < minSize || size > maxSize);
	}

	const maxOffset = endOfCentralDirectoryOffset - size;
	if (offset > maxOffset) return failed(cb);

	// Check if Central Directory is where it is stated to be
 	checkCentralDirectory(zipFile, offset, function(err, found) {
		if (err) return cb(err);

		// TODO Skip over if Mac header found but not with file offset 0.
		// Could find a file header which isn't the start of the Central
		// Directory but somewhere in the middle.
		// This would require a Central Directory larger than 4 GiB to occur,
		// but in that case it's fairly likely this could happen.
		if (found == FOUND_NORMAL) {
			if (zipFile.isFaulty) return failed(cb);
			done(zipFile, cb);
		} else if (found == FOUND_MAC) {
			zipFile.isMacArchive = true;
			foundCentralDirectory(zipFile, cb);
		} else {
			// Not found - must be a Mac Archive Utility ZIP (or corrupt)
			zipFile.isFaulty = true;
			zipFile.isMacArchive = true;

			// If no other possible locations, error
			if (offset + FOUR_GIB > maxOffset) return failed(cb);

			// Try all possibilities where Central Directory could be
			// Start with last possible position
			offset += Math.floor((maxOffset - offset) / FOUR_GIB) * FOUR_GIB;
			searchCentralDirectory(zipFile, offset, cb);
		}
	});
}

function searchCentralDirectory(zipFile, offset, cb) {
	checkCentralDirectory(zipFile, offset, function(err, found) {
		if (err) return cb(err);

		// If Central Directory found, exit
		if (found == FOUND_MAC) {
			zipFile.centralDirectoryOffset = offset;
			zipFile.readEntryCursor = offset;
			zipFile.centralDirectorySize = zipFile.endOfCentralDirectoryOffset - offset;
			return foundCentralDirectory(zipFile, cb);
		}

		// Not found - try again in next location
		offset -= FOUR_GIB;
		if (offset == zipFile.centralDirectoryOffset) return failed(cb);

		searchCentralDirectory(zipFile, offset, cb);
	});
}

/*
 * Check if central directory is at offset
 * Calls back with:
 *   - Error if IO error
 *   - FOUND_NONE if not found
 *   - FOUND_NORMAL if Central Directory found
 *   - FOUND_MAC if Mac Archive Utility Central Directory found
 */
function checkCentralDirectory(zipFile, offset, cb) {
	zipFile._readEntryAt(offset, function(err, entry) {
		// Catch error
		// If error because CDH not found, callback with FOUND_NONE
		// otherwise callback with error
		if (err) {
			if (err instanceof Error && err.message && err.message.slice(0, INVALID_CDH_ERROR_MESSAGE.length) == INVALID_CDH_ERROR_MESSAGE) return cb(null, FOUND_NONE);
			return cb(err);
		}

		// Check if entry has signature of a Mac Archive Utility archive
		cb(null, entryIsMac(entry) ? FOUND_MAC : FOUND_NORMAL);
	});
}

/*
 * Identify whether ZIP file is made by Mac Archive Utility
 * by signature of what they look like.
 */
function entryIsMac(entry) {
	if (entry.versionMadeBy != 789) return false;

	// First file always starts at byte 0
	if (entry.relativeOffsetOfLocalHeader != 0) return false;

	// Entries never have file comments
	if (entry.fileCommentLength != 0) return false;

	// Entries never have ZIP64 headers
	if (entry.zip64) return false;

	// Check various attributes for files, folders and symlinks
	let isLink = false;
	if (entry.versionNeededToExtract == 20) {
		// File
		if (
			entry.generalPurposeBitFlag != 8 ||
			entry.compressionMethod != 8 ||
			isSlash(entry.fileName.slice(-1))
		) return false;
	} else if (entry.versionNeededToExtract == 10) {
		// Folder or symlink
		if (
			entry.generalPurposeBitFlag != 0 ||
			entry.compressionMethod != 0
		) return false;

		if (entry.compressedSize == 0) {
			// Folder
			if (
				entry.uncompressedSize != 0 ||
				entry.crc32 != 0 ||
				!isSlash(entry.fileName.slice(-1))
			) return false;
		} else {
			// Symlink
			if (
				entry.uncompressedSize != entry.compressedSize ||
				entry.extraFieldLength != 0 ||
				isSlash(entry.fileName.slice(-1))
			) return false;

			isLink = true;
		}
	} else {
		// Unrecognised
		return false;
	}

	// Files + folders always have 1 Extra Field with certain id and length
	// Symlinks have no Extra Fields
	if (!isLink) {
		if (
			entry.extraFieldLength != CDH_EXTRA_FIELDS_LENGTH_MAC ||
			entry.extraFields.length != 1 ||
			entry.extraFields[0].id != CDH_EXTRA_FIELD_ID_MAC
		) return false;
	}

	// It is a Mac Archive Utility ZIP file
	return true;
}

function foundCentralDirectory(zipFile, cb) {
	// Check whether entryCount is reliable
	if ((zipFile.entryCount + SIXTY_FOUR_KIB) * CDH_MIN_LENGTH < zipFile.centralDirectorySize) zipFile.entryCountCertain = false;

	// Record cursor for file reading
	zipFile.readFileCursor = 0;

	// Done
	done(zipFile, cb);
}

function done(zipFile, cb) {
	// If lazyEntries option not set, read first entry
	if (!zipFile.lazyEntries) zipFile._readEntryOriginal();

	// Return ZipFile object
	cb(null, zipFile);
}

function failed(cb) {
	cb(new Error('central directory not found'));
}
