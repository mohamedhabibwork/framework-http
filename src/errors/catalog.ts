/**
 * Re-exported from core, where the catalog now lives — `@framework/openapi`
 * derives per-status code enums from it without a dependency on http.
 */

export type { ErrorCode, ErrorStatus } from '@framework/core';
export { codesForStatus, ERROR_CATALOG, ERROR_CODES, ERROR_STATUSES } from '@framework/core';
