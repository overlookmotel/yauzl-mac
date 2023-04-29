/* --------------------
 * yauzl-mac module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const yauzl = require('@overlookmotel/yauzl'),
	yauzlClone = require('yauzl-clone');

// Imports
const open = require('./open'),
	readEntry = require('./readEntry'),
	openReadStream = require('./openReadStream');

// Exports
module.exports = yauzl;

// Add events-intercept methods to ZipFile prototype
yauzlClone.clone(yauzl, {clone: false, eventsIntercept: true});

// Shim yauzl methods
open(yauzl);
readEntry.shim(yauzl);
openReadStream(yauzl);
