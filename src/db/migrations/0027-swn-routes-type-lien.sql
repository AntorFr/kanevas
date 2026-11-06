-- Type of link of a route of the galaxy (kanevas-outils-format-evolue-routes, B-81, T-4): free text, 1 to 40 characters,
-- null when the route has none. Existing routes keep null. Number taken at merge (AD-51).
ALTER TABLE swn_routes ADD COLUMN type_lien TEXT CHECK (type_lien IS NULL OR length(type_lien) BETWEEN 1 AND 40);
