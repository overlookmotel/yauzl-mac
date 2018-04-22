/* --------------------
 * yauzl-mac module
 * yauzl internal functions copied from yauzl source code
 * ------------------*/

'use strict';
// jshint quotmark:double

// Exports
const internals = module.exports = {
	readAndAssertNoEof: function readAndAssertNoEof(reader, buffer, offset, length, position, callback) {
		if (length === 0) {
			// fs.read will throw an out-of-bounds error if you try to read 0 bytes from a 0 byte file
			return setImmediate(function() { callback(null, new Buffer(0)); });
		}
	 	reader.read(buffer, offset, length, position, function(err, bytesRead) {
			if (err) return callback(err);
			if (bytesRead < length) {
				return callback(new Error("unexpected EOF"));
			}
			callback();
		});
	},

	emitErrorAndAutoClose: function emitErrorAndAutoClose(self, err) {
		if (self.autoClose) self.close();
		internals.emitError(self, err);
	},

	emitError: function emitError(self, err) {
		if (self.emittedError) return;
		self.emittedError = true;
		self.emit("error", err);
	}
};
