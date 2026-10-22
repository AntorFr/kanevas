-- Import bookkeeping only: existing campaigns and scenarios keep their data and have no origin key.
ALTER TABLE campagnes ADD COLUMN cle_origine TEXT
  CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200);
ALTER TABLE campagnes ADD COLUMN dernier_import TEXT
  CHECK (dernier_import IS NULL OR json_valid(dernier_import));
-- Finds a campaign in the token's universe, without making names unique.
CREATE UNIQUE INDEX campagnes_cle_origine ON campagnes (univers_id, cle_origine);

ALTER TABLE scenarios ADD COLUMN cle_origine TEXT
  CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200);
ALTER TABLE scenarios ADD COLUMN dernier_import TEXT
  CHECK (dernier_import IS NULL OR json_valid(dernier_import));
ALTER TABLE scenarios ADD COLUMN version_importee INTEGER
  CHECK (version_importee IS NULL OR version_importee >= 1);
-- Scenario keys belong to a campaign, not to the whole universe.
CREATE UNIQUE INDEX scenarios_cle_origine ON scenarios (campagne_id, cle_origine);
