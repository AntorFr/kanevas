-- kanevas-battlemap-assistant: who wrote the art direction text (AD-battlemap-assistant-3; number taken at merge, AD-51).
-- Expand only: one column with a default, so every existing row reads `mj`. The banner of E-26 and « Annuler » read it.
ALTER TABLE bm_direction ADD COLUMN source TEXT NOT NULL DEFAULT 'mj' CHECK (source IN ('mj', 'assistant'));
