/* --------------------
 * yauzl-mac module
 * Tests
 * ------------------*/

'use strict';

// Modules
const chai = require('chai'),
	{expect} = chai,
	yauzl = require('../index.js');

// Init
chai.config.includeStack = true;

// Tests

/* global describe, it */

describe('Tests', () => {
	it.skip('all', () => {
		expect(yauzl).to.be.ok; // eslint-disable-line no-unused-expressions
	});
});
