-- Import of the galaxy by the API (B-65, AD-104, T-9): the version an import left each element at.
-- Null: never written by an import (created by hand). Written by services/swn/import-galaxie.ts only.
-- Number provisional until merge (AD-51).
ALTER TABLE swn_systemes ADD COLUMN version_importee INTEGER;
ALTER TABLE swn_routes ADD COLUMN version_importee INTEGER;
ALTER TABLE swn_zones ADD COLUMN version_importee INTEGER;
