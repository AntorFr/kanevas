-- AD-etoiles-7 (kanevas-carte-spatiale-etoiles; number taken at merge, AD-51).
-- `densite` now means the chance that a block holds a star (the core's draw, AD-148), not the share of hexagons holding a system.
-- Galaxies still at the former default 0.2 take the core's DENSITE_DEFAUT (0.68); every other value and every zone stays as the GM wrote it.
UPDATE swn_galaxies SET densite_defaut = 0.68 WHERE densite_defaut = 0.2;
