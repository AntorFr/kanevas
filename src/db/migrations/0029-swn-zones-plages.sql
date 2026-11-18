-- A zone may be a set of hexagons (kanevas-outils-format-zones, B-84, Z-1): `plages` holds its canonical ranges
-- (JSON `[[r, q0, q1], …]`), null for a polygon zone. A set zone keeps `contour = '[]'`. Existing zones keep null.
-- Number taken at merge (AD-51).
ALTER TABLE swn_zones ADD COLUMN plages TEXT CHECK (plages IS NULL OR (json_valid(plages) AND json_type(plages) = 'array'));
