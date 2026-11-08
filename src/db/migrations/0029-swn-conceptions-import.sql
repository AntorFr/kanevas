-- Import of ship designs by the API (B-65, AD-130, M-4): the `version` an import left a design at.
-- Null: never written by an import (created or saved by hand). Written by services/swn/import-conceptions.ts only.
ALTER TABLE swn_conceptions ADD COLUMN version_importee INTEGER;
