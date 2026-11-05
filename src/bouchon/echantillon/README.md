# Import acceptance sample

`echantillon.json` is derived from `AntorFr/eneria` at
`960538bf07b2a7b2ac560c3edd193abaab87c44e`, following the owner's October 15 clarification.
Its `provenance` lists the source sheets. It contains extracts, not a Kanka converter.

Each `fiches` entry is an API payload plus `cle`; the campaigns and scenarios are `aventure`
sheets with `sousType` and `statut` (a scenario has its campaign as `parent`). Adventures precede
the reports whose `campagne` names their origin key. Éneria starts `en_preparation`, Prélude
`terminee`, the long scenario `prete` and the arrival scenario `terminee`. The client sends
files, parent-first sheets and relations; adventures count in « Fiches ». A file has `cle`, `chemin` (relative to the JSON), `nom` and `visibilite`.
Relations are grouped by source `fiche`, with the API array in `entrees`.
Arrays may be omitted; the optional fourth CLI argument selects another JSON file.

The source replaces the composed Port-Sel sample with the same acceptance shape:

| Composed sample case | Source-based replacement |
| --- | --- |
| Les Sphères → Port-Sel → child | Eneria → Éneria Prime → Base Éneria-1 |
| Character, aliases, labels, illustration | Tenny Balla (Teny Balla), AST and Échantillon labels |
| Table, heading and GM block | Éneria Prime; metadata table and source GM paragraph |
| GM-only faction and event | Obscura and Ascension des Vael’Khor |
| Quest and object with document | Le Temple des Lamentations and Dalle de données |
| Late link and permanently waiting link | Base Éneria-1 (sent later) and Nyx (not sent) |
| Long scenario linking to Port-Sel | 60,000 characters linking to Éneria Prime |

Source `organisation` becomes `faction`, `journal` becomes `compte_rendu`, and
`<!-- mj -->` blocks become `:::mj`. Internal links use origin keys; excluded references
in extracts become plain labels, except the deliberate waiting link. Source GM visibility
stays closed through section audiences. The journal extracts use fixture dates March 3,
February 10 and April 18, 2021, in that send order; dates and campaign grouping are
acceptance data, not source chronology.

Two small images come from the source test-image deposit: `_images/sombrelame.png` and
`_images/le-temple-des-lamentations-1.png` (local `temple.png`). Their assignments are test
illustrations, not canonical portraits. `plan.pdf` reuses the repository's demo document.
The long scenario repeats an extract of `scenarios/pitch-initial.md`. The metadata table,
extra label and four relation probes are acceptance data. No credentials are stored here.

Expected first batch: 15 sheets (2 campaign and 2 scenario adventures among them), 3 files and 3 relations created;
one warning for the unknown relation target, zero refusals. Replay creates nothing;
the unknown relation still warns and Nyx still waits. Change an adventure’s status in Kanevas
and replay: it stays changed, with « statut modifié dans Kanevas : non écrasé ». Omitting
`statut` leaves an existing status alone; a new adventure defaults to `en_preparation`. `refus.json` produces one refused
sheet with `champ: campagne` and an unknown-campaign reason; the client prints the closed
report and exits with status 1. A connection or fatal HTTP error leaves the batch open;
rerunning resumes it and safely replays the entries already sent.
