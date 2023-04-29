/* --------------------
 * yauzl-mac module
 * Utility functions
 * ------------------*/

'use strict';

// Exports

module.exports = {isSlash};

/**
 * Returns `true` if character provided is a slash ('/').
 * Accepts string or Buffer.
 * @param {string|Buffer} c - Character
 * @returns {boolean} - `true` if character provided is a slash ('/')
 */
function isSlash(c) {
	// NB Code for '/' is 47 in both CP437 and UTF8
	if (c instanceof Buffer) return c[0] === 47;
	return c === '/';
}
