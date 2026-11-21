-- migrate: sans-cles-etrangeres
-- Migration 0040 (kanevas-synchro-ecriture-retrait-fichiers, number taken at merge, AD-51, AD-138): the four
-- import bookkeeping columns leave the schema — `fiches.dernier_import`, `sections.dernier_import`,
-- `sections.version_importee` and `fichiers.dernier_import`. An import writes what the script carries
-- (B-47), so nothing remembers what a former import wrote. `sections.version` stays (AD-59).
-- DROP COLUMN edits the table in place: rows, indexes, search and history triggers and foreign keys stay as
-- they are (none of them names these columns); `foreign_key_check` runs before the commit (db.ts).

ALTER TABLE fiches DROP COLUMN dernier_import;
ALTER TABLE sections DROP COLUMN dernier_import;
ALTER TABLE sections DROP COLUMN version_importee;
ALTER TABLE fichiers DROP COLUMN dernier_import;
