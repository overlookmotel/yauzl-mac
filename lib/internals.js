/* --------------------
 * yauzl-mac module
 * `yauzl` internal functions copied from yauzl source code
 * ------------------*/

'use strict';

// Exports

module.exports = {readAndAssertNoEof, emitErrorAndAutoClose, emitError};

function readAndAssertNoEof(reader, buffer, offset, length, position, cb) {
	if (length === 0) {
		// fs.read will throw an out-of-bounds error if you try to read 0 bytes from a 0 byte file
		setImmediate(() => cb(null, Buffer.allocUnsafe(0)));
		return;
	}

	reader.read(buffer, offset, length, position, (err, bytesRead) => {
		if (err) {
			cb(err);
		} else if (bytesRead < length) {
			cb(new Error('Unexpected EOF'));
		} else {
			cb();
		}
	});
}

function emitErrorAndAutoClose(self, err) {
	if (self.autoClose) self.close();
	emitError(self, err);
}

function emitError(self, err) {
	if (self.emittedError) return;
	self.emittedError = true;
	self.emit('error', err);
}
