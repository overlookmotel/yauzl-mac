/* --------------------
 * yauzl-mac module
 * Constants
 * ------------------*/

'use strict';

// Exports

const SIXTY_FOUR_KIB = 0x10000, // largest 16 bit integer + 1
	FOUR_GIB = 0x100000000, // largest 32 bit integer + 1
	// End Of Central Directory min/max length
	ECDR_MIN_LENGTH = 22,
	ECDR_MAX_LENGTH = ECDR_MIN_LENGTH + SIXTY_FOUR_KIB - 1,
	ECDR_SIGNATURE = 0x06054b50,
	// Filename min/max length
	FILENAME_MIN_LENGTH = 0,
	FILENAME_MAX_LENGTH = SIXTY_FOUR_KIB - 1,
	// Central Directory Header for 1 file min/max length
	CDH_BASE_LENGTH = 46,
	CDH_MIN_LENGTH = CDH_BASE_LENGTH + FILENAME_MIN_LENGTH,
	CDH_MAX_LENGTH = CDH_BASE_LENGTH + FILENAME_MAX_LENGTH + (SIXTY_FOUR_KIB - 1) * 2,
	CDH_EXTRA_FIELDS_LENGTH_MAC = 12,
	CDH_EXTRA_FIELD_ID_MAC = 22613,
	CDH_SIGNATURE = 0x02014b50,
	// Local Header for 1 file min/max length
	LFH_LENGTH = 30,
	LF_EXTRA_FIELDS_LENGTH_MAC = 16,
	LF_MIN_LENGTH = LFH_LENGTH + FILENAME_MIN_LENGTH,
	LFH_SIGNATURE = 0x04034b50,
	// Data Descriptor
	DATA_DESCRIPTOR_LENGTH = 16,
	DATA_DESCRIPTOR_SIGNATURE = 0x08074b50,
	// Found Central Directory values
	FOUND_NONE = 0,
	FOUND_NORMAL = 1,
	FOUND_MAC = 2,
	// Error message returned by `._readEntry()` when bad CDH found
	INVALID_CDH_ERROR_MESSAGE = 'invalid central directory file header signature: 0x';

module.exports = {
	SIXTY_FOUR_KIB, FOUR_GIB,
	ECDR_MIN_LENGTH, ECDR_MAX_LENGTH, ECDR_SIGNATURE,
	FILENAME_MIN_LENGTH, FILENAME_MAX_LENGTH,
	CDH_BASE_LENGTH, CDH_MIN_LENGTH, CDH_MAX_LENGTH,
	CDH_EXTRA_FIELDS_LENGTH_MAC, CDH_EXTRA_FIELD_ID_MAC, CDH_SIGNATURE,
	LFH_LENGTH, LF_EXTRA_FIELDS_LENGTH_MAC, LF_MIN_LENGTH, LFH_SIGNATURE,
	DATA_DESCRIPTOR_LENGTH, DATA_DESCRIPTOR_SIGNATURE,
	FOUND_NONE, FOUND_NORMAL, FOUND_MAC,
	INVALID_CDH_ERROR_MESSAGE
};