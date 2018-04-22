# yauzl-mac.js

# Unzipping with yauzl with added support for Mac OS Archive Utility ZIP files

## Current status

[![NPM version](https://img.shields.io/npm/v/yauzl-mac.svg)](https://www.npmjs.com/package/yauzl-mac)
[![Build Status](https://img.shields.io/travis/overlookmotel/yauzl-mac/master.svg)](http://travis-ci.org/overlookmotel/yauzl-mac)
[![Dependency Status](https://img.shields.io/david/overlookmotel/yauzl-mac.svg)](https://david-dm.org/overlookmotel/yauzl-mac)
[![Dev dependency Status](https://img.shields.io/david/dev/overlookmotel/yauzl-mac.svg)](https://david-dm.org/overlookmotel/yauzl-mac)
[![Greenkeeper badge](https://badges.greenkeeper.io/overlookmotel/yauzl-mac.svg)](https://greenkeeper.io/)
[![Coverage Status](https://img.shields.io/coveralls/overlookmotel/yauzl-mac/master.svg)](https://coveralls.io/r/overlookmotel/yauzl-mac)

## What it does

Drop-in replacement for [yauzl](https://www.npmjs.com/package/yauzl) unzipper module, adding support for ZIP files created with Mac OS Archive Utility.

Mac OS Archive Utility creates ZIP files which are corrupt according to the ZIP file spec where either:

1. Archive is larger than 4GB
2. Any file in the archive larger than 4GB
3. Archive contains more than 65535 files

[yauzl](https://www.npmjs.com/package/yauzl), and many other unzip applications, cannot unzip such files.

This module is based on [yauzl](https://www.npmjs.com/package/yauzl) and parses the malformed metadata that Mac OS Archive Utility creates to be able to unzip these files successfully.

There are no tests written, but I have tested this on thousands of ZIP files, including hundreds of malformed Mac OS Archive Utility files and it works.

## Usage

API is identical to [yauzl](https://www.npmjs.com/package/yauzl), except set the option `supportMacArchiveUtility: true` when calling `.open()`, `.fromFd()`, `.fromBuffer()` or `.fromRandomAccessReader()`.

```js
const yauzl = require('yauzl-mac');

yauzl.open(
  '/path/to/file.zip',
  { supportMacArchiveUtility: true },
  function(err, zipfile) {
    /* ... usual API ... */
  }
);
```

### Promises

You can combine with [yauzl-promise](https://www.npmjs.com/package/yauzl-promise) for a promise-based API.

```js
const yauzlMac = require('yauzl-mac');
const yauzl = require('yauzl-promise').useYauzl(yauzlMac);

// Now use yauzl with promisified API
```

## Other useful additions to yauzl

* [yauzl-crc](https://www.npmjs.com/package/yauzl-crc) - yauzl with CRC32 checksum verification

## Tests

Use `npm test` to run the tests. Use `npm run cover` to check coverage.

## Changelog

See [changelog.md](https://github.com/overlookmotel/yauzl-mac/blob/master/changelog.md)

## Issues

If you discover a bug, please raise an issue on Github. https://github.com/overlookmotel/yauzl-mac/issues

## Contribution

Pull requests are very welcome. Please:

* ensure all tests pass before submitting PR
* add an entry to changelog
* add tests for new features
* document new functionality/API additions in README
