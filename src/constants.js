/**
 * Constants shared between the API and the database update script
 * (scripts/check_database_update.js), which must not import the controllers
 * (they connect to Postgres/Redis as a side effect).
 */

/** Max length of the profile "aboutme" field (must match the DB column). */
export const MAX_ABOUTME_LENGTH = 1024;
