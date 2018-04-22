/* --------------------
 * yauzl-mac module
 * Shim openReadStream method
 * ------------------*/

'use strict';

// Imports
const {FOUR_GIB} = require('./constants');

// Exports
module.exports = function(yauzl) {
	const {ZipFile} = yauzl;

	// Replace `openReadStream` method
	ZipFile.prototype._openReadStreamOriginal = ZipFile.prototype.openReadStream;
	ZipFile.prototype.openReadStream = openReadStream;
};

/*
 * ZipFile.prototype.openReadStream replacement method
 * Prevents errors being emitted for uncompressed size being wrong
 * for Mac Archive Utility files.
 */
function openReadStream(entry, options, callback) {
	const zipFile = this; // jshint ignore:line

	// Conform arguments
	if (callback == null) {
		callback = options;
		options = {};
	} else if (options == null) {
		options = {};
	}

	// Call original `openReadStream()` method
	zipFile._openReadStreamOriginal(entry, options, function(err, stream) {
		if (err) return callback(err);

		// If compressed size is being checked and may be incorrect due
		// to Mac Archive Utility truncating the size it records to int32,
		// replace stream `._transform()` and `._flush()` methods to only
		// check size is correct in lower 32 bits.
		if (
			zipFile.isMacArchive &&
			zipFile.validateEntrySizes &&
			entry.compressionMethod != 0 &&
			entry.compressedSize != 0 &&
			!entry.uncompressedSizeCertain &&
			(options.decompress == null || options.decompress)
		) {
			stream.entry = entry;
			stream.zipFile = zipFile;
			stream._transform = _transform;
			stream._flush = _flush;
		}

		callback(null, stream);
	});
}

function _transform(chunk, encoding, cb) { // jshint ignore:line
	// jshint validthis:true
	this.actualByteCount += chunk.length;
	cb(null, chunk);
}

function _flush(cb) {
	// jshint validthis:true
	// Error if wrong size
	if (this.actualByteCount % FOUR_GIB != this.expectedByteCount) {
		const msg = `stream size incorrect. expected ${this.expectedByteCount} (or greater in 4GiB multiples). got ${this.actualByteCount}`;
		return cb(new Error(msg));
	}

	// Update size in entry
	if (this.actualByteCount != this.entry.uncompressedSize) {
		this.zipFile.isFaulty = true;
		this.entry.uncompressedSize = this.actualByteCount;
	}
	this.entry.uncompressedSizeCertain = true;

	cb();
}
