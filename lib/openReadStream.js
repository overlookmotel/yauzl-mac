/* --------------------
 * yauzl-mac module
 * Shim openReadStream method
 * ------------------*/

'use strict';

// Imports
const {FOUR_GIB} = require('./constants.js');

// Exports

module.exports = function(yauzl) {
	const {ZipFile} = yauzl;

	// Replace `openReadStream` method
	ZipFile.prototype._openReadStreamOriginal = ZipFile.prototype.openReadStream;
	ZipFile.prototype.openReadStream = openReadStream;
};

/**
 * `ZipFile.prototype.openReadStream` replacement method.
 * Prevents errors being emitted for uncompressed size being wrong
 * for Mac Archive Utility files.
 * @this ZipFile - `ZipFile` object
 * @param {Object} entry - `Entry` object
 * @param {Object} [options] - Options
 * @param {Function} cb - Callback
 * @returns {undefined}
 */
function openReadStream(entry, options, cb) {
	const zipFile = this;

	// Conform arguments
	if (cb == null) {
		cb = options;
		options = {};
	} else if (options == null) {
		options = {};
	}

	// Call original `openReadStream()` method
	zipFile._openReadStreamOriginal(entry, options, (err, stream) => {
		if (err) {
			cb(err);
			return;
		}

		// If compressed size is being checked and may be incorrect due
		// to Mac Archive Utility truncating the size it records to int32,
		// replace stream `._transform()` and `._flush()` methods to only
		// check size is correct in lower 32 bits.
		if (
			zipFile.isMacArchive
			&& zipFile.validateEntrySizes
			&& entry.compressionMethod !== 0
			&& entry.compressedSize !== 0
			&& !entry.uncompressedSizeCertain
			&& (options.decompress == null || options.decompress)
		) {
			stream.entry = entry;
			stream.zipFile = zipFile;
			stream._transform = _transform;
			stream._flush = _flush;
		}

		cb(null, stream);
	});
}

/* eslint-disable no-invalid-this */
function _transform(chunk, encoding, cb) {
	this.actualByteCount += chunk.length;
	cb(null, chunk);
}

function _flush(cb) {
	// Error if wrong size
	if (this.actualByteCount % FOUR_GIB !== this.expectedByteCount) {
		cb(new Error(
			`Stream size incorrect. Expected ${this.expectedByteCount} `
			+ `(or greater in 4GiB multiples). Got ${this.actualByteCount}.`
		));
		return;
	}

	// Update size in entry
	if (this.actualByteCount !== this.entry.uncompressedSize) {
		this.zipFile.isFaulty = true;
		this.entry.uncompressedSize = this.actualByteCount;
	}
	this.entry.uncompressedSizeCertain = true;

	cb();
}
/* eslint-enable no-invalid-this */
