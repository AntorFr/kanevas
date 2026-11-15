# Ship designer — the rule ledger (`kanevas-concepteur-vaisseaux`)

> Source of the rules: *Stars Without Number Revised*, « Building a Starship » and « Modifying and Tuning Starships »
> (p. 93–109), as translated in Éneria (`base-de-connaissance/regles/swn/swn-vaisseaux-construction.md` and
> `…-modifications.md`; the data of the prototype is `_outils/vaisseaux_donnees.json`). The English edition is not in any
> repository: a rule whose wording the translation leaves open is marked `[À VÉRIFIER]` and the design says which
> reading it takes. This ledger is the reference of the epic: **no rule is left « to see at conversion »** — each row
> has a verdict, and a row that is not `carried` names the change of the model that closes it (decisions `H-n` of
> `ARCHITECTURE.md`, needs `B-88` to `B-95` of `docs/parcours.md`).
>
> Verdicts: **carried** (the model computes or stores it as the book says) · **gap** (the book says it, the model
> does not, or says it otherwise) · **text** (a game effect that no design number depends on: it is stated by the element
> and shown, never computed — a decision, not an omission) · **outside** (not a property of a design: the rule belongs to
> play, and a rules sheet — `swn_fiches_generees` — already carries the book text).

## 1. Hulls

| # | Rule of the book | Today | Verdict → change |
|---|---|---|---|
| L-1 | Four classes (fighter, frigate, cruiser, capital); a hull has price, speed, armour, HP, crew min/max, AC, free power, free mass, hardpoints, class | `coques` columns | carried |
| L-2 | The price of a hull includes a rank-1 Spike drive | the hull's `puissance`/`masse` are free values; `moteurs` rank 1 costs 0 | carried |
| L-3 | Speed is added to **every** Piloting test; armour is subtracted from incoming damage; both may be absent (stations: « N/A ») | `vitesse`/`armure` nullable, `null` stays `null` | carried |
| L-4 | **Stations have no Spike drive** and cannot manoeuvre (small and large station) | a station reads as a hull without speed; the `moteur_absent` watch alert fires; a Spike upgrade or a system drive can be fitted | **gap → H-2** : `coques.moteur_spike` |
| L-5 | Crew: minimum for basic operation, maximum for two months of life support; a crew of 3 for a safe Spike drill | `equipage_min/max`; `equipage_insuffisant` / `excessif` are watch alerts; the prototype's « 3 for a Spike drill » advice is a text of the reference data | carried (the advice is **text**) |
| L-6 | Light weapons (NT3) do nothing to a hull, heavy NT4 weapons do half damage minus armour, from inside armour does not apply | none | **outside** (combat) |
| L-7 | Free mass and free power are what fittings, weapons and defences spend; a negative balance is impossible | `puissance_insuffisante`, `masse_insuffisante` (blocking) | carried |
| L-8 | A hull's factors by class: cost ×1/10/25/100, power and mass ×1/2/3/4 | three `facteur_*` columns **per hull** (the data states them) | carried |

## 2. Fittings (aménagements) — the generic rules

| # | Rule | Today | Verdict → change |
|---|---|---|---|
| L-9 | An asterisk (\*) multiplies the **cost** by the hull factor; a hash (#) multiplies **power or mass** by it, **rounded up**; the multiplier applies even if the fitting only works on a bigger hull | `x_cout`, `x_puissance`, `x_masse`; the product is **not rounded** (masses are multiples of 0.5, `Atelier` is 0.5# : a cruiser reads 1.5 where the book gives 2) | **gap → H-1** : the product of a hash is rounded up to a whole unit, per installation |
| L-10 | A fitting may need a **minimum class** (and a few a **maximum**: atmospheric configuration « not on a cruiser or bigger », amphibious « fighters and frigates only ») | `classe_min`, `classe_max`, alert `classe_inadaptee` | carried |
| L-11 | « Can be bought several times » or once | `limite` (1 or more), alert `limite_depassee` | carried |
| L-12 | A fitting whose **count depends on another element**: an auto-targeting system « must be installed once for each gun to make autonomous » | none | **gap → H-3** : `limite_par` |
| L-13 | Cost « Special » (cargo space, psionic anchorpoint, system drive, teleportation pads) | a number in the catalogue (the book's own figure where it gives one: pads 200 000) | carried (`cout` states the figure the source states; the word « Spécial » goes to the element's text) |
| L-14 | The « Effect » column of every fitting (a bonus, a capability) | `condition` (never evaluated), `description` | **text → H-4** : `effet_jeu`, a short line shown on the design (24 of 40 fittings have only this) |

### 2.1 Fittings with numbers that the book computes from the design

| # | Fitting | Rule | Today | Verdict → change |
|---|---|---|---|---|
| L-15 | **Cargo space** | each point of free mass given to it = 2 / 20 / 200 / 2 000 tonnes by hull class; repeatable | `soute_par_classe` | carried |
| L-16 | **Smuggler's hold** | each installation adds 0.2 / 2 / 20 / 200 tonnes of **hidden** cargo (never found by a standard inspection) | stated as text only | **gap → H-4** : capacity `fret_cache` |
| L-17 | **System drive** | replaces the Spike drive; −10 % **of the base hull cost**, + power 1/2/3/4 and mass double that, by class; once | `effet moteur_systeme`, `rend_*`, `reduction_cout_pct`, `reduction_base`, `moteur_systeme_multiple` | carried |
| L-18 | **Spike drive upgrades** (rank 2 to 6): only the final rank is bought, no intermediate | `moteurs`, `moteur_multiple` (blocking), class min | carried |
| L-19 | **Extended life support**: each installation raises the **maximum crew by 100 % of its normal maximum** (a free merchant twice: 18) | none (crew max is the hull's) | **gap → H-4** : capacity `equipage_max_pct` |
| L-20 | **Extended stores**: each doubles the two-month life-support duration | none | **gap → H-4** : capacity `provisions` |
| L-21 | **Hydroponic production**: indefinitely feeds a number of people equal to the max crew; each further installation doubles it | none | **gap → H-4** : capacity `hydroponie` |
| L-22 | **Cold sleep pods**: each installation keeps in stasis a number of people equal to the max crew | none | **gap → H-4** : capacity `sommeil_froid` |
| L-23 | **Exodus bay**: cruiser 1 000, capital 5 000 colonists in stasis; each further selection doubles | none | **gap → H-4** : capacity `soute_exode` |
| L-24 | **Lifeboats**: one selection = boats for the max crew, 20 people per boat at most | none | **gap → H-4** : capacity `canots` |
| L-25 | **Luxury cabins**: each selection = 10 % of the max crew | none | **gap → H-4** : capacity `cabines_luxe` |
| L-26 | **Colony core**: a colony of up to 5 × the max crew | none | **gap → H-4** : capacity `colonie` |
| L-27 | **Automation support**: robots replace crew at 1 000 cr per replaced member; at least one living supervisor; robots are not paid, take no life support | none | **gap → H-5** : `robots` of the design and the crew costs |
| L-28 | **Workshop**: bought « at sizes below the hull's maximum » (frigate workshop on a cruiser) | the fitting is one row, a cruiser pays the cruiser factors | **text** (the size of the workshop is the choice of the *element*: the catalogue may carry « Atelier (frégate) » and « Atelier (croiseur) » as two rows, each with its `classe_min`/`classe_max`) |
| L-29 | Vehicle transport fittings: carried vehicles count half their tonnage; Tractor beams, Teleportation pads, Drop pod, Cargo lighter, Ship bay (fighter/frigate), Shiptender mount, Boarding tubes, Armory, Ship's locker, Survey array, Sensor mask, Emissions dampers, Fuel bunkers, Fuel scoops, Mobile extractor, Mobile factory, Precognitive chamber, Psionic anchorpoint, Advanced lab, Advanced nav computer, Amphibious, Atmospheric, Course regulator | cost, power, mass, class, limit | **carried for the numbers; the effect is text (H-4)** — the carried-vehicles half-tonnage, the +2 of the nav computer, etc. are play effects |

## 3. Defences

| # | Rule | Today | Verdict → change |
|---|---|---|---|
| L-30 | Costs and factors as for fittings (\* and #) | same columns | carried (and **H-1** for the hash rounding) |
| L-31 | Ablative hull compartments: +1 AC, +20 maximum HP | `ca`, `pv` of the element, summed | carried |
| L-32 | Augmented plating: +2 AC, **−1 speed** (speed may go below 0: a penalty to Piloting tests) | `bonus_vitesse` signed −9..9; the result's `vitesse` is `max(0, …)` | **gap → H-6** : the speed of a design may be negative (the book says it explicitly) |
| L-33 | Boarding countermeasures, burst ECM generator (once per engagement), foxer drones (+2 AC one round, Ammo 5), grav eddy displacer (1 in 6), hardened polyceramic overlay (enemy Armour-piercing −5), planetary defence array, point defence lasers (+2 AC against ammo weapons) | cost, power, mass, class | **carried for the numbers; the effect is text (H-4)** — foxer drones carry « Munitions 5 » as the weapon quality: stated in `effet_jeu`, not computed |

## 4. Weapons

| # | Rule | Today | Verdict → change |
|---|---|---|---|
| L-34 | Cost, damage dice, hardpoints, power, mass, minimum class, minimum tech level (NT), qualities | `cout`, `degats` (text), `emport`, `puissance`, `masse`, `classe_min`, `niveau_tech`, `qualites`, `perforation` | carried |
| L-35 | The **minimum class** is a requirement (« can require a minimum hull class ») | `classe_min` only drives the ammunition doubling; `classe_inadaptee` is **not** evaluated for weapons — a spinal cannon fits a fighter | **gap → H-7** : the alert applies to weapons too (and Oversized mountings lifts it, H-8) |
| L-36 | Hardpoints: a weapon takes 1 or more of the hull's hardpoints | `emports`, `emports_insuffisants` (blocking) | carried |
| L-37 | **Ammo**: the shots of an ammo weapon fit in one unit of free mass; **double the ammo per class above the weapon's minimum class**; the weapon already includes one unit of magazine; extra magazines cost mass and price | `munitions`, `cout_munition`, `magasins` (1..9), doubling in the calculation | carried |
| L-38 | « Cost a/b »: the weapon / each shot | `cout` and `cout_munition` | carried |
| L-39 | Qualities: Armour-piercing N, Cloud, Clumsy (−4 vs fighters), Flak (double roll vs fighters) | `perforation`; the others are words of `qualites` | **text** (they act on an attack roll, not on a design) |
| L-40 | Special damage (nuclear missiles) | `degats` is free text | carried |
| L-41 | Ground weapons against ships, naval context (navy sizes, pirates) | none | **outside** |

## 5. Crew, running costs, build time

| # | Rule | Today | Verdict → change |
|---|---|---|---|
| L-42 | Merchants rarely carry more than twice the minimum crew; a warship rarely leaves with less than 75 % of the maximum | `equipage_excessif` and `equipage_insuffisant` watch alerts at the hull's bounds | carried (the 2× and 75 % are advice: **text**) |
| L-43 | A crew member costs on average **100 cr/day pay + 20 cr food**; player characters are not paid but eat | none | **gap → H-5** : daily crew cost, with `pj` and `robots` of the design |
| L-44 | **Maintenance every six months = 5 % of the total cost excluding crew**; unpaid: −1 to every skill and attack roll linked to the ship, per skipped period | `entretien` = 5 % of the price | carried (the −1 per period is play: **outside**) |
| L-45 | Build speed: 25 000 cr of work per day on a yard; a reason to hurry doubles or quadruples it | `chantierJours = ceil(prix / 25 000)`, constant | **gap → H-5** : the pace is a module setting `cadence_chantier` (25 000 by default, 50 000 or 100 000 to hurry) |
| L-46 | Prices assume rare, expensive ships; where ships are easy to get, **divide prices by 2 or 4** | none | **gap → H-5** : a module setting `diviseur_prix` (1, 2, 4) applied to the displayed price |
| L-47 | Spike jump range and speed depend on the drive rank | `porteeSaut` = module setting × (rank + 1) | carried |

## 6. Modifications (« mods »)

The book lists **18** mods, and the prototype's data too. Each is mapped to what carries it.

| # | Mod (Repair min · price % of the hull · components · repeatable) | Rule | Today | Verdict → change |
|---|---|---|---|---|
| L-48 | Every mod | **Repair min** (the engineer's skill), **price as a % of the bare hull**, **pretech components « n / hull class »** (1 fighter, 2 frigate, 3 cruiser, 4 capital) or a flat number | `reparation_min`, `cout_pct`; **components absent** | **gap → H-9** : `composants`, `composants_par_classe` |
| L-49 | Cargo efficiency bays (1 · 10 % · 1/class · no) | free mass −10 % rounded up; each point of mass in cargo counts double | effect `soutes_optimisees_livre` | carried |
| L-50 | Compact magazines (1 · 5 % · 0 · no) | « twice as much ammo as its weapons and magazine space normally allow » — **the whole ship** | effect `magasins_doubles`, which **aims at one weapon** | **gap → H-8** : no target, applies to every ammo weapon |
| L-51 | Drill velocity upgrade (2 · 10 % · 1/class · no) | the Spike drive counts as one rank better for transit speed and range, up to 6 | none (text only in the prototype) | **gap → H-8** : effect `moteur_niveau` |
| L-52 | Emergency drill activation (3), emergency thruster boost (1), eternal reactor (2), low emissions (1), Nemesis tracker (3), Q-ship cladding (1), volley capacitors (2) | play effects (once per combat, +2 to a roll, no refuelling, hidden weapons) | stored as `description` | **text** → `effet_jeu` (H-4) |
| L-53 | Engine optimization (2 · 10 % · 1/class · no) | speed +1 | effect `vitesse` | carried |
| L-54 | Extended mass support (1 · 10 % · 1 · **yes**) | lose up to 10 free power, gain **half** that in free mass, rounded down; each installation | effect `echange` (`points_max` 10, `arrondi installation`) | carried |
| L-55 | Power trunk streamlining (1 · 10 % · 1 · **yes**) | lose up to 5 free mass, gain **twice** as much free power | effect `echange` | carried |
| L-56 | Regenerative armour (3 · 15 % · 2/class · no) | armour +5 | effect `armure` | carried |
| L-57 | Reinforced armour (1 · 5 % · 0 · no) | armour + the engineer's Repair level; −1 power, −1 mass | effect `blindage_renforce` (B-87) | carried |
| L-58 | **Oversized mountings** (2 · 15 % · 1/class · **yes**) | pick **one weapon or fitting** that requires a hull class higher than the ship's: the ship may mount it | none | **gap → H-8** : effect `surdimensionne`, with a target per installation |
| L-59 | **Specialized mountings** (1 · 10 % · 0 · **yes**) | pick **one weapon or fitting at installation**; that element needs only **half** the power and mass **per installation, rounded down, minimum 1** | effect `montages_specialises`: the catalogue must state the target and the limit is 1; the half is **rounded up**, applied to the whole line | **gap → H-8** : EC-14 and the rounding |
| L-60 | **Weapon overcharge** (2 · 5 % · 0 · **yes**) | one weapon of the engineer's choice needs **+50 % power** per installation, rolls its damage twice and keeps the better | effect `surcharge_cumulable`: the catalogue must state the target, one target per line | **gap → H-8** : EC-14 (the target is chosen at installation) |
| L-61 | Maintenance of mods | an engineer maintains as many mods at once as their **Maintenance** score = Int mod + Con mod + 3 × Repair; a neglected mod breaks after a week of active use (8 hours to repair) | none | **gap → H-9** : the score, the alert `maintenance_depassee`; the breakdown is **outside** |
| L-62 | Installing | one crew-day per 5 000 cr of mod, one per 25 000 cr with a yard; removing takes less than a day; **alone, an engineer cannot modify a ship bigger than a frigate** | none | **gap → H-9** : installation days in the result; the lone engineer is **outside** (a fact of the table, not of the design) |
| L-63 | **Refit** (rebuild the hull around the mod) | the mod becomes part of the ship, needs no Maintenance; rebuilding costs **5 ×** credits and **2 ×** components, new hull costs the normal price; a limit of **2 × Repair** refitted mods | none | **gap → H-9** : the flag `integre` of a mod line, the refit cost, the alert `refonte_depassee` |
| L-64 | A component may be used for any mod | none | **text** (the components are one stock) |

## 7. What the designer does not carry, and why

Space combat, ground weapons against ships, boarding and piracy, the navy of a world (L-6, L-41), the breakdown of a neglected mod (L-61), the lone engineer (L-62) and the −1 of an unpaid maintenance period (L-44): rules of play, already in the generated rules sheets. A rule of the book that is not in this ledger is a gap in the ledger: it is added here first, then in the model.

## 8. The revised model, in one view

The model **keeps its shape** (seven catalogue tables, one JSON line list per design, a closed list of effects in code, X-2) and closes the gaps by seven additions, named `H-1` to `H-9` in `ARCHITECTURE.md`:

1. **Rounding of the hash** (H-1): `ceil` of the product, per installation.
2. **Hulls without a Spike drive** (H-2): `coques.moteur_spike`.
3. **A count tied to another element** (H-3): `amenagements.limite_par` (`armes`).
4. **Capacities and the effect line** (H-4): `amenagements.capacite` (a closed list in code, with 4 values per class where the book gives them) and `effet_jeu` on every element, shown on the design.
5. **Crew costs and settings** (H-5): `pj` and `robots` of the design, `diviseur_prix`, `cadence_chantier`, `solde_jour`, `vivres_jour` as module settings.
6. **Negative speed** (H-6).
7. **Weapons' minimum class enforced** (H-7).
8. **The target is the choice of the design** (H-8): the catalogue never states a target; a mod line of a design carries `cibles` (one per installation); three effects change (`montages_specialises`, `surcharge_cumulable`) or appear (`surdimensionne`, `moteur_niveau`), one loses its target (`magasins_doubles`).
9. **Mods as the book treats them** (H-9): `composants`, `composants_par_classe`, the engineer's Maintenance, installation days, refit.

## 9. The gaps of the first conversion: why each escaped, and what covers it now

Sources: the `ecarts.md` of the conversion (Éneria, branch `feature/kanevas-outils-eneria`, whole history), the arbitrations of 2026-11-10, 11 and 13 and the six format slices they created (`format-evolue`, `-vaisseaux-fiches`, `-effets`, `-ecarts`, `-suite`, `-regles-livre`), and EC-14 (2026-11-15). The cause column is what the archive shows; where it shows nothing, the cell says « inferred ».

**Causes found**, then the table:

- **C1 — the book was never read by the designer of the format.** The English book is in no repository and the translation lives in Éneria, not in kanevas: the slices derived effects *from the labels of the elements* (the fifth slice says so itself, the sixth fixed four of them).
- **C2 — the effects of a component were not inventoried.** The format was sized on the cases the designer thought of, as a closed list; nobody walked the 104 components of the real data (12 hulls, 6 drives, 40 fittings, 9 defences, 19 weapons, 18 mods) asking what each one does.
- **C3 — a chosen target was not a dimension of the model.** « One weapon of the engineer's choice » was read as a property of the catalogue (`vise` required), when the choice belongs to the design and to each installation.
- **C4 — the data of the tests were invented.** Every slice proved itself on `Éneria d'essai`, written by the slice from its own reading; the real data met the model only at the conversion, last, one rule at a time.
- **C5 — reviews read the plan against itself.** The plan reviewers had no book and no real data to compare with: they could check consistency, not truth.
- **C6 — one door fixed, the other forgotten.** A field was added to the catalogue without sweeping every other writer of the same data.
- **C7 — a value range sized for the cases seen** (a bound, a palette).

Gaps are numbered **EC-n** here (a gap of the conversion, not a screen: `E-n` is always a screen of `docs/ecrans.md`).

| Gap | What it was | Cause of the oversight | What covers it now |
|---|---|---|---|
| EC-1 | `nom_en` refused (« unknown field ») | C4: the real data carry an English name the invented catalogue never had | The ledger replays the **fields** of the real data, not only its rules (§ 11, step 2); decided before: the pushed catalogue no longer writes `nom_en` — nothing to carry |
| EC-2 | Ammunition does not double with the hull class | C1 + C2: the rule is in the book, the weapon had one fixed figure; no one asked what the class does to a weapon | Rows L-35 and L-37, one per weapon rule; `classe_min` is carried, H-7 makes it a requirement |
| EC-3 | Extra magazines of a launcher | C2: an effect of one component (a launcher) never listed | The component inventory (§ 10) lists every weapon with its stats and its effects; `magasins` carried |
| EC-4 | Design import refused `magasins` and left it out of the fingerprint | C6: EC-3 was fixed on the catalogue door only | Rule of this epic: a new field is checked against **all** its writers and its fingerprint (catalogue import, design import, design storage, export) — written as a closing line of every H-n |
| EC-5 | A negative speed bonus | C7 + C1: bound `0..9` taken from the labels; the book allows a speed malus | Row L-32, H-6: the speed is a plain sum, bounds are those of the book |
| EC-6 | One effect per modification (repair beside a number) | C2: the 18 mods were not read one by one; the format gave a mod one effect | The inventory reads each of the 18 mods for **all** its effects; H-9 and the effect list of § 8 carry several |
| EC-7 | Cargo per class, cost reduction, effects outside the closed list | C1 + C2 + C7: the closed list was written from the cases the designer saw | Every effect of every component is listed (§ 10); an effect found by nobody is a hole in the inventory, which is closed **before** the model, not after |
| EC-8 | Base of the system drive's 10 % cut (hull, not fitting) | C1: the label does not say the base | L-17 states it; the ledger carries the base as a field (`reduction_base`) |
| EC-9 | Colour of a territory (hex colour vs six palette names) | C4 + C7: palette sized on invented zones. **Not a ship rule**: zones are not the object of this epic | Not covered here (out of scope, not extended): the zone values are neither listed nor converted by this epic (§ 13.2); the format of the galaxy tool owns them |
| EC-10 | « Optimised cargo holds »: −10 % of total free mass, rounded up, cargo doubled | C1: derived from the label by the fifth slice | L-49 in the ledger, with the book's wording and the reading chosen |
| EC-11 | « Reinforced armour »: armour + the engineer's Repair | C1 | L-57: one row, one verdict |
| EC-12 | « Specialized mountings »: half of power **and** mass of the chosen element, minimum 1 | C1 + C3: the target of the choice taken for a property of the element | L-59, H-8: the target is stored **in the design**, per installation |
| EC-13 | « Weapon overcharge »: multiple installations | C1 + C3 | L-60, H-8, and the limit comes from the book, not from the format |
| EC-14 | Target required by the catalogue (`vise`); limit 1 of the mountings vs several in the book | C3 + C4: the sixth slice wrote the rule from the arbitration text, without a real element to try; `Éneria d'essai` could not show that the real source picks at installation | H-8; and the inventory gives, for each effect, **who chooses the target and when** (§ 10) |

**Reading the table.** Twelve of the fourteen gaps (all but EC-4, a C6 slip, and EC-9, outside ships) come from C1 to C4 and C7, and the slices that followed fixed each gap *as found*, which is the reason for six slices: each slice made the format right for the case that had just failed, none re-read the book. What the epic does differently, in the order of the causes: the **ledger is made from the book first** (C1), a **row per component effect** closes the inventory (C2), the **target and the moment of its choice are columns of the inventory** (C3), the **real data are the test, from the first task** (C4), reviewers receive the ledger **and** the inventory, with the instruction to find one effect of one real component the model cannot carry (C5), every H-n ends with its **list of writers** (C6), every range is **checked against the extremes of the real data** (C7).

## 10. The inventory, component by component (104 components)

Source: the prototype's data (`_outils/vaisseaux_donnees.json`: 12 hulls, 6 drives, 40 fittings, 9 defences, 19 weapons, 18 mods) read with the book's text (`desc`). **One row per component.** Columns, as asked on 2026-11-15:

- **Effects**: what the component does. `stat` = only the numbers of the element (cost, power, mass, hash flags, class, limit), carried by the calculation (V-2); `[H-n]` = what the model adds; `text` = shown by `effet_jeu`, computed by nobody.
- **Aims at**: **V** the whole ship · **E** a chosen element (weapon or fitting) · **K** a category (class, every ammo weapon) · **F** another effect or a derived figure (max crew, free mass, drive rank) · **—** nothing in the design.
- **Changes**: cost `$`, free mass `M`, free power `P`, a statistic (`CA`, `PV`, `Arm`, `Vit`), a count limit `N`, a capacity `Cap`, another effect `Ef`, or `—`.
- **Target chosen**: **D** at the design (the line itself) · **I** at installation, one per installation (`cibles`, H-8) · **—**.
- **Stacks**: `no` · `+` (each installation adds) · `×2` (each doubles) · `lim n` (blocked beyond n, alert `limite_depassee`).

### 10.1 Hulls (12)

All twelve: effect `stat` (cost, speed, armour, HP, crew min/max, AC, power, mass, hardpoints, class); aims at **V**; changes nothing else; target **—**; stacks `no` (one hull per design). The class gives the three factors (L-8). Only these carry something more:

| Hull | Beyond `stat` |
|---|---|
| Strike fighter, Shuttle | none (the fighter is « often fitted with a system drive »: text) |
| Free merchant, Patrol boat, Corvette, Heavy frigate | none |
| Bulk freighter (speed 0, class 2) | speed `0` ≠ `null`: it manoeuvres, with a null bonus; a −1 gives −1 (H-6) |
| Fleet cruiser | none |
| Battleship (speed 0) | idem bulk freighter |
| Carrier (class 3, mass 100, 4 hardpoints) | the ship bays (§ 10.3) are its fittings: text; no hull rule |
| Small station, Large station | **no Spike drive, no speed (`null`)** [H-2]; a Spike upgrade or a system drive on them is `moteur_sur_station`; a speed bonus on `null` stays `null` |

### 10.2 Drives (6)

All six: effect `stat` and **replaces the rank-1 drive of the hull**; aims at **V**; changes `$ P M`, the jump range (`porteeSaut`) and the class minimum; target **—**; stacks: **only the final rank is bought** (`moteur_multiple`, blocking). Rank 1 is free and included in the hull price (L-2); rank 2 and 3 class 0; rank 4 and 5 class 1; rank 6 class 2.

### 10.3 Fittings (40)

| Fitting | Effects | Aims at | Changes | Target | Stacks |
|---|---|---|---|---|---|
| Advanced lab | stat; text (analysis bonus) | — | `$ P M` | — | lim 1 |
| Advanced nav computer | stat; text (+2 on known routes) | — | `$ P M` | — | lim 1 |
| Amphibious | stat; **maximum class 1**; includes the atmospheric config (text) | V | `$ P M` | — | lim 1 |
| Armory | stat; text | — | `$` | — | lim 1 |
| Atmospheric | stat; **maximum class 1** (not on a cruiser or bigger) | V | `$ M` | — | lim 1 |
| Auto-targeting | stat; **one per gun made autonomous** [H-3]; text (+2 to hit) | F (weapon count) | `N` | — | `lim` = Σ weapons |
| Automation support | stat; **robots replace crew** [H-5] | F (crew) | crew cost, `Cap` | — | lim 1 |
| Boarding tubes | stat; text | — | `$ M` | — | lim 1 |
| Cargo lighter (Freight shuttle) | stat; text (200 t container) | — | `$ M` | — | `+` |
| Cargo space | **each free mass point = 2/20/200/2 000 t** by class | F (free mass) | `Cap` cargo | — | `+` |
| Cold sleep pods | **max crew in stasis per installation** [H-4] | F (max crew) | `Cap` | — | `+` |
| Colony core | **colony of 5 × max crew** [H-4] | F (max crew) | `Cap` | — | lim 1 |
| Course regulator | stat; text | — | `$ P M` | — | lim 1 |
| Drop pod | stat; text (100 soldiers, −3) | — | `$ M` | — | `+` |
| Emissions dampers | stat; text (+2, travel times doubled) | — | `$ P M` | — | lim 1 |
| Exodus bay | **1 000 (cruiser) / 5 000 (capital) in stasis, doubling** [H-4] | F (class) | `Cap` | — | `×2` |
| Extended life support | **max crew + 100 % of the normal max per installation** [H-4] | F (max crew) | `Cap`, `equipage_excessif` bound | — | `+` |
| Extended infirmary | stat; text | — | `$ P M` | — | lim 1 |
| Extended stores | **life support duration × 2 per installation** [H-4] | V | `Cap` | — | `×2` |
| Fuel bunkers | stat; text (one more Spike drill) | — | `$ M` | — | `+` |
| Fuel scoops | stat; text | — | `$ P M` | — | lim 1 |
| Hydroponic production | **feeds max crew indefinitely; each further one doubles** [H-4] | F (max crew) | `Cap` | — | `×2` |
| Lifeboats | **boats for the max crew, 20 per boat** [H-4] | F (max crew) | `Cap` | — | lim 1 |
| Luxury cabins | **10 % of max crew per installation** [H-4] | F (max crew) | `Cap` | — | `+` |
| Mobile extractor | stat; text | — | `$ P M` | — | `+` |
| Mobile factory | stat; text (parts at 5 000 cr/t) | — | `$ P M` | — | `+` |
| Precognitive nav chamber | stat; text | — | `$ P` | — | lim 1 |
| Psionic anchorpoint | stat (cost « special », 0 in data); text | — | `P` | — | lim 1 |
| Sensor mask | stat; text | — | `$ P` | — | lim 1 |
| Ship bay (fighter) | stat; text (hangar) | — | `$ M` | — | `+` |
| Ship bay (frigate) | stat; **class 3**; text | — | `$ P M` | — | `+` |
| Ship's locker | stat; text | — | `$` | — | lim 1 |
| Shiptender mount | stat; text (a hull smaller than the tug) | — | `$ P M` | — | `+` |
| Smuggler's hold | **hidden cargo 0.2/2/20/200 t per installation** [H-4] | F (class) | `Cap` | — | `+` |
| Survey array | stat; text | — | `$ P M` | — | lim 1 |
| System drive | **replaces the Spike drive**: −10 % of the **hull** cost, power 1/2/3/4, mass double [L-17, carried] | V | `$ P M`, drive removed | — | lim 1 |
| Teleportation pads | stat (200 000 cr where common); text | — | `$ P M` | — | lim 1 |
| Tractor beams | stat; text | — | `$ P M` | — | lim 1 |
| Vehicle transport mounts | stat; text (carried vehicles at half tonnage) | — | `$ M` | — | lim 1 |
| Workshop | stat (**mass 0.5 #**: hash rounded up, H-1); text; the size is the element's (L-28) | — | `$ P M` | — | `+` |

### 10.4 Defences (9)

| Defence | Effects | Aims at | Changes | Target | Stacks |
|---|---|---|---|---|---|
| Ablative hull compartments (class 3) | **+1 AC, +20 max HP** | V | `CA PV $ P M` | — | lim 1 |
| Augmented plating | **+2 AC, −1 speed** [H-6: speed may go below 0] | V | `CA Vit` | — | lim 1 |
| Boarding countermeasures | stat; text | — | `$ P M` | — | lim 1 |
| Burst ECM generator | stat; text (once per engagement) | — | `$ P M` | — | lim 1 |
| Foxer drones (class 2) | stat; text (+2 AC, **Ammo 5**: the shots are not priced: « almost free », their number is limited by the mass reserved) | — | `$ P M` | — | lim 1 |
| Grav eddy displacer | stat; text (1 in 6) | — | `$ P M` | — | lim 1 |
| Hardened polyceramic overlay | stat; text (enemy AP −5) | — | `$ M` | — | lim 1 |
| Planetary defence array | stat; text | — | `$ P M` | — | lim 1 |
| Point defence lasers | stat; text (+2 AC against ammo weapons) | — | `$ P M` | — | lim 1 |

### 10.5 Weapons (19)

All nineteen: effects `stat` (cost, damage, power, mass, hardpoints, class, tech level, qualities); aims at **V** (a weapon is an element of the design); the **minimum class is a requirement** [H-7] unless an `surdimensionne` installation aims at it [H-8]; target **—**; stacks `+` (the weapon is bought per installation, hardpoints bound the count). Three more rules hold for the **ammo** weapons: shots per unit of mass (`munitions`), **doubling per class above the minimum** (clamped at 0 when oversized), extra magazines `magasins` priced `cout_munition` (all carried, L-37); and `magasins_doubles` doubles them all (H-8). Per weapon:

| Weapon | Class min | Particular |
|---|---|---|
| Multifocal laser | 0 | AP 20 |
| Reaper battery | 0 | Clumsy: text |
| Fractal impact charge | 0 | **ammo 4**, 500/shot, AP 15 |
| Polyspectral MES beam | 0 | NT5 (prétech tech level shown), AP 25 |
| Sandthrowers | 0 | Flak: text |
| Flak emitter battery | 1 | Flak: text, mass 3 |
| Torpedo launcher | 1 | **ammo 4**, 2 500/shot, AP 20 |
| Charged particle cannon | 1 | Clumsy: text, 2 hardpoints |
| Plasma beam | 1 | 2 hardpoints |
| Spike magnetic darts | 1 | **ammo 5**, 5 000/shot, Flak: text, `2d6+2` |
| Nuclear missiles | 1 | **ammo 5**, 5 000/shot, damage « Special » (text) |
| Spinal beam cannon | 2 | Clumsy: text, 3 hardpoints |
| Smart cloud | 2 | Cloud, Clumsy: text |
| Gravcannon | 2 | 3 hardpoints, AP 20 |
| Spike inversion projector | 2 | 3 hardpoints |
| Vortex tunnel inductor | 3 | Clumsy: text, damage `3d20` |
| Mass cannon | 3 | **ammo 4**, 50 000/shot |
| Lightning charge mantle | 3 | Cloud: text |
| Singularity gun | 3 | NT5, damage `5d20`, 10 hardpoints |

### 10.6 Modifications (18)

Costs are a % of the bare hull; the components (`composants`, H-9) and Repair minimum are stats of every row. « Changes » lists the effects; **the model carries several per mod** (EC-6).

| Mod | Effects | Aims at | Changes | Target chosen | Stacks |
|---|---|---|---|---|---|
| Cargo efficiency bays | **free mass −10 % rounded up; mass in cargo counts double** (`soutes_optimisees_livre`) | V; F (cargo) | `M`, `Cap` cargo | — | no |
| Compact magazines | **every ammo weapon's shots × 2**, magazines unchanged (`magasins_doubles`) | **K** (all ammo weapons) | `Ef` (ammunition) | **—** (H-8: no target) | no |
| Drill velocity upgrade | **the Spike drive counts one rank higher, up to 6** (`moteur_niveau`) | F (drive rank) | jump range, transit speed | — | no |
| Emergency drill activation | text (once, +2/+4 difficulty) | — | — | — | no |
| Emergency thruster boost | text (+2 speed, 3 rounds, once) | — | — | — | no |
| Engine optimization | **speed +1** | V | `Vit` | — | no |
| Eternal reactor | text (no refuelling) | — | — | — | no |
| Extended mass support | **lose up to 10 power, gain half in mass, rounded down; per installation** | V | `P`, `M` | — (the points sacrificed are the installation's) | `+` |
| Low emissions | text (+2 difficulty to detect) | — | — | — | no |
| Nemesis tracker | text (one shot hits) | — | — | — | no |
| **Oversized mountings** | **lifts the class bar of one weapon or fitting, one class above the ship** (`surdimensionne`, H-8) | **E** | `classe_inadaptee` | **I**: one element per installation | `+` |
| Power trunk streamlining | **lose up to 5 mass, gain twice in power; per installation** | V | `P`, `M` | — | `+` |
| Q-ship cladding | text | — | — | — | no |
| Regenerative armour | **armour +5** | V | `Arm` | — | no |
| Reinforced armour | **armour + the engineer's Repair; −1 power, −1 mass** (`blindage_renforce`) | V; F (Repair level of the design) | `Arm P M` | — | no |
| **Specialized mountings** | **the chosen element needs half its power and mass, per installation, rounded down, minimum 1** (`montages_specialises`, H-8) | **E** | `P`, `M` of the target | **I**: one element per installation | `+` |
| Volley capacitors | text (4 command points once) | — | — | — | no |
| **Weapon overcharge** | **the chosen weapon needs +50 % power per installation; damage rolled twice (text)** (`surcharge_cumulable`, H-8) | **E** (a weapon) | `P` of the target | **I**: one weapon per installation | `+` |

### 10.7 What the walk found beyond the ledger of §§ 1 to 6

The row-by-row reading did not find a new rule of the book. It found **five places where the model had to say something it left implicit** — all stated in `ARCHITECTURE.md` (H-10), none « to see at conversion »:

1. **Derived figures chain.** Max crew is raised by extended life support; cold sleep, lifeboats, cabins, colony, hydroponics and robots read the **raised** max crew. The calculation therefore has a fixed order (hash rounding → effects of the mods on elements → statistics → max crew → capacities → crew costs).
2. **Two mods on one element.** Specialized mountings and weapon overcharge on the same weapon: the specialized halving applies to the base unit first, the overcharge's +50 % to the result (decided in H-10 (1); the book does not order them).
3. **Same target twice.** Two specialized mountings on one element would halve it twice: the second is refused (`cible_deja_visee`, whether the two installations sit on one line or on two), the book speaks of « the element chosen ». The rule is for specialised mountings only: overcharges add up on one weapon, and oversized mountings aimed twice at one element change nothing more (no refusal).
4. **An effect with nothing to act on.** Drill velocity on a system drive or a station, oversized mountings on an element that needs no bigger hull: a non-blocking watch alert `effet_sans_objet`, the line stays saved.
5. **Targets are weapons and fittings only.** Drives and defences are not targets of oversized or specialized mountings (the book says « a weapon or a fitting »; the defences are excluded on that reading, decided in H-10 (3); the surcharge aims at weapons only).

## 11. Method of the inventory

1. **Rules** — § 1 to 6 above: the book, rule by rule, with a verdict (done, 64 rows).
2. **Fields** — done, § 12: every key of the real data, table by table, and its place in the model (a key with no place would be a gap: none is left).
3. **Components** — done, § 10: one row per component of the real data (104), with the columns asked on 2026-11-15: its effects; what each aims at (the whole ship, a chosen component, a category, another effect); what it changes (cost, mass, power, a statistic, a count limit, another effect); **when the target is chosen** (at the design, at installation); whether it stacks.
4. **Model** — the model of § 8 must carry every cell of step 3; a cell it cannot carry becomes an `H-n`, never « to see at conversion ».
5. **Replay** — done, § 13: the ten examples and the four campaign ships of the real data are computed from the inventory and stand as the expected values of the construction tasks; the zones and the galaxy are not ships and stay outside this epic (§ 13.2).

## 12. The fields of the real data, table by table

Source: the keys of `_outils/vaisseaux_donnees.json` (branch `feature/kanevas-outils-eneria` of `eneria`), counted on the real rows. **Every key has a place**; the third column says which. « Absent » means the key is not in every row: the default is stated.

### 12.1 Hulls (12 rows) → `swn_catalogue_coques`

| Key | Place | Note |
|---|---|---|
| `id`, `nom`, `en`, `desc` | `cle`, `nom`, `nom_en`, `description` | |
| `cout`, `pv`, `ca`, `puissance`, `masse` | same names | `masse` real, multiple of 0.5 |
| `vitesse`, `armure`, `eqMin`, `eqMax` | `vitesse`, `armure`, `equipage_min`, `equipage_max` | speed `0` ≠ `null` (H-6) |
| `points` | `emports` | hardpoints |
| `classe` | `classe` and the three factors | the factors come from the top-level `multCout`, `multPm`, `tonnesParMasse` (one entry per class), written on each hull by the conversion |
| *(none)* | `moteur_spike` (H-2) | 1 on ten hulls, 0 on the two stations |

### 12.2 Drives (6 rows) → `swn_catalogue_moteurs`

| Key | Place | Note |
|---|---|---|
| `niveau` | `niveau` | the six rows are ranks 1 to 6 |
| `cout`, `puissance`, `masse` | same names | |
| `coutX`, `puissanceX`, `masseX` | `x_cout`, `x_puissance`, `x_masse` | |
| `classe` | `classe_min` | rank 2 and 3 class 0 … (§ 10.2) |
| *(none)* | `cle`, `nom`, `nom_en` | the data has no id or name: the conversion writes `spike-n`, « Spike drive, rank n », a value of the conversion and not of the book |

### 12.3 Fittings (40 rows) → `swn_catalogue_amenagements`

| Key | Place | Note |
|---|---|---|
| `id`, `nom`, `en`, `desc` | `cle`, `nom`, `nom_en`, `description` | |
| `cout`, `puissance`, `masse` and their `…X` | same names, `x_*` | |
| `classe` | `classe_min` | |
| `maxClasse` (2 rows: amphibious, atmospheric) | `classe_max` | |
| `effet` | `effet_jeu` (H-4) | text shown on the design; the **capacities** it names in words are written by the conversion in `capacite` from § 10.3 row by row (the data has no key for them: that is the gap H-4 closes) |
| `multi` (17 rows true) | `limite`: `0` (no bound) when true, **`1` when absent** | « absent = at most one » is the reading the data supports: no one-of fitting carries `multi` |
| `unique` (1 row: system drive) | `limite` 1 and the effect `moteur_systeme` | redundant with the previous line |
| `special` (4 rows) | `cout` and `condition` | cargo: `soute`/`soute_par_classe` carry the cargo, `cout` the book's figure; psionic anchorpoint and teleportation pads: the figure and the availability text in `condition`; system drive: `reduction_cout_pct` and `reduction_base` (Y-, Z-) |

### 12.4 Defences (9 rows) → `swn_catalogue_defenses`

`id`, `nom`, `en`, `desc` as above; `cout`, `puissance`, `masse` (+ `…X`), `classe` → `classe_min`; `effet` → `effet_jeu`; `bonusCA` (2 rows) → `ca`; `bonusPV` (1) → `pv`; `bonusVitesse` (1) → `bonus_vitesse`, −9 to 9 (H-6). No key left.

### 12.5 Weapons (19 rows) → `swn_catalogue_armes`

| Key | Place | Note |
|---|---|---|
| `id`, `nom`, `en`, `desc` | as above | |
| `cout`, `puissance`, `masse` | same names | a weapon has no `…X` key: the three flags are **false** (a weapon is not scaled by the hull) |
| `points` | `emport` | hardpoints |
| `classe` | `classe_min` | enforced as a requirement (H-7) |
| `nt` | `niveau_tech` | |
| `degats`, `perf`, `qualites` | `degats`, `perforation`, `qualites` | free text where the book says « special » |
| `coutMun`, `munitions` (5 rows) | `cout_munition`, `munitions` | absent = 0, 0 (not an ammo weapon) |
| top-level `qualitesArmes` (list of name + text) | **none, by decision** | the glossary of weapon qualities (Ammo, AP, Cloud, …) is rules text, already in the generated rules sheet; `qualites` names them, the sheet explains them |

### 12.6 Mods (18 rows) → `swn_catalogue_modifications`

| Key | Place | Note |
|---|---|---|
| `id`, `nom`, `en`, `desc` | as above | |
| `coutPct` | `cout_pct` | |
| `fix` (all 18) | `reparation_min` | the book's « Fix » is the Repair level the engineer needs; it is a **stat of every row**, not only of the rows with the effect `reparation_min` (H-9) |
| `composants`, `parClasse` | `composants`, `composants_par_classe` (H-9) | |
| `multi` | `limite`: `0` when true, `1` when false | the targeted effects take one target per installation (H-8), so `multi` true on them means several installations, each with its own target |
| `effet` | `effet_jeu` (H-4) | |
| `vitesse` (1) | effect `vitesse`, `valeur` | |
| `puissance`, `masse`, `variable` (3, 3, 2) | effect `echange` with `sens`, `echange_puissance`, `echange_masse`, `points_max`, `echange_arrondi` | `variable.perd/max/gain` become `sens`, `points_max` and the two exchange figures; `etiq` is the label the interface writes from them |
| `armure` (1) | effect `armure`, `valeur` 5 | |
| `armureFix` (1) | effect `blindage_renforce` | the −1 power, −1 mass are the `puissance`/`masse` keys of that row, carried as the effect's own |
| *(none)* | `soutes_optimisees_livre`, `magasins_doubles`, `montages_specialises`, `surdimensionne`, `surcharge_cumulable`, `moteur_niveau` | six effects the data states only in words (`effet`/`desc`): the conversion sets the code of each row from § 10.6 |

### 12.7 Examples (10 rows) and campaign ships (4 rows) → `swn_catalogue_exemples` and the sheets

| Key | Place | Note |
|---|---|---|
| `id`, `coque`, `moteur`, `amenagements`, `defenses`, `armes` | `cle`, `coque`, `choix` | the drive is a rank: its line is the `spike-n` of § 12.2 |
| `equipage` | `equipage` (`kanevas-outils-format-vaisseaux-fiches`) | |
| `extraMagasins` (1 row) | `magasins` of the weapon line (EC-3) | |
| `mods`, `fix` (campaign ship: 1, 1) | `choix` lines of mods, `reparation` of the design | and, with H-8, the `cibles` of a targeted mod, which the data **does not state**; the only campaign mod (Eternal reactor on the cadets' shuttle) is not a targeted one, so no `cibles` is to invent |
| `nom`, `image`, `lore` (`classe`, `infos`, `texte`), `note`, `pnj` (`comp`, `pc`), `tir` | **the ship sheet's text**, not the catalogue | a name, an image, a story, a note and the crew's skill and command points are the sheet's content (a compute-free section written by the conversion); `tir` is a firing figure of play, shown in the sheet and read by nobody (outside, § 7) |
| top-level `classes` | the class names `facteur_*` and the hull labels | text of the interface |

**Result of the walk.** Every key of the seven tables read; none without a place. Three places are **values the conversion writes without the data stating them**: the drive names (12.2), the capacities (12.3) and the code of the six new effects (12.6): each is listed row by row in § 10, which is the expected content of the conversion tasks, so none is left « to see at conversion ».

## 13. Replay of the ten examples (step 5)

Source: the ten `exemples` of `_outils/vaisseaux_donnees.json` (branch `feature/kanevas-outils-eneria` of `eneria`), computed with the prototype's pure calculator (`vaisseaux_calcul.js`, no mods, `fix` 0), then **checked against the revised rules** of § 1 to 6 and H-1 to H-10. These figures are the expected values of the construction tasks (a ship's `prix` is the cost with ammunition; `jours` is `ceil(prix / cadence_chantier)` at the default 25 000).

| Example | Hull (class) | Drive | Power used/total | Mass used/total | Hardpoints | Price | Upkeep (5 %) | Pay/year | Crew (min–max) | Cargo (t) | AC / HP / Speed | Install days |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ex-chasseur | chasseur-assaut (0) | 1 | 4/5 | 2/2 | 1 | 305 000 | 15 250 | 43 800 | 1 (1–1) | 0 | 16 / 8 / 5 | 13 |
| ex-navette | navette (0) | 1 | 1/3 | 5/5 | 0 | 210 000 | 10 500 | 43 800 | 1 (1–20) | 6 | 11 / 15 / 3 | 9 |
| ex-marchand | marchand-libre (1) | 1 | 10/10 | 15/15 | 2 | 775 000 | 38 750 | 131 400 | 3 (1–6) | 160 | 14 / 20 / 3 | 31 |
| ex-patrouilleur | patrouilleur (1) | 2 | 9/15 | 10/10 | 2 | 3 595 000 | 179 750 | 657 000 | 15 (5–20) | 0 | 14 / 25 / 4 | 144 |
| ex-corvette | corvette (1) | 2 | 15/15 | 15/15 | 5 | 6 045 000 | 302 250 | 1 314 000 | 30 (10–40) | 0 | 13 / 40 / 2 | 242 |
| ex-fregate-lourde | fregate-lourde (1) | 2 | 24/25 | 20/20 | 5 | 9 835 000 | 491 750 | 3 942 000 | 90 (30–120) | 0 | 15 / 50 / 1 | 394 |
| ex-cargo | cargo-lourd (2) | 2 | 8/15 | 25/25 | 2 | 6 087 500 | 304 375 | 657 000 | 15 (10–40) | 3 400 | 11 / 40 / 0 | 244 |
| ex-croiseur | croiseur (2) | 3 | 46/50 | 30/30 | 7 | 16 425 000 | 821 250 | 6 570 000 | 150 (50–200) | 800 | 14 / 60 / 1 | 657 |
| ex-porte-vaisseaux | porte-vaisseaux (3) | 3 | 40/50 | 100/100 | 3 | 89 050 000 | 4 452 500 | 43 800 000 | 1 000 (300–1 500) | 12 000 | 15 / 95 / 0 | 3 562 |
| ex-cuirasse | cuirasse (3) | 3 | 74/75 | 50/50 | 10 | 79 550 000 | 3 977 500 | 35 040 000 | 800 (200–1 000) | 0 | 17 / 120 / 0 | 3 182 |

Ammunition (only one example has an ammo weapon): ex-fregate-lourde, torpedo launcher on a class-1 hull, class factor 2^(1−1) = 1, `(1 launcher + 3 extra magazines) × 4 = 16` torpedoes (EC-3 of § 9). The prototype computes the same 16: the doubling rule (EC-2) is tested by no example, so the construction tasks add the case by hand (a class-2 hull with the same launcher: 32).

**What the revised rules change for these ten — checked one by one:**

1. **Weapon class (H-7)**: every weapon of the ten has `classe_min` ≤ the hull class (laser, faucheuse, sand thrower 0; torpedoes, plasma 1; cloud, gravitic cannon 2; vortex inductor, lightning mantle 3) → no refusal, no alert. A weapon below its class is refused only in the construction tests.
2. **Crew and capacities**: every crew lies within the hull's `[min, max]` (the navette's max is 20 because the extended life support doubles it); the two one-person ships raise the existing « Spike drill, 3 crew advised » alert and nothing else. Robots, cold sleep, exodus, pods, cabins: no example installs them → none of the ten exercises the capacities of § 10.3; the construction tasks test them on constructed designs, not on these.
3. **Station without Spike (H-2)**: no example is a station → nothing to refuse.
4. **Negative speed (H-6)**: the lowest speed is 0 (cargo, porte-vaisseaux, cuirasse), never negative.
5. **Mods, targets (H-8), refit, prétech**: **none of the ten carries a mod**, so none exercises a target. The construction tasks therefore carry their own constructed cases for H-8 and the six new effects (one design per effect of § 10.6, expected values written in the task), and the one campaign mod (Eternal reactor, not targeted) is replayed on the cadets' shuttle.
6. **Install days and upkeep**: unchanged (`ceil(prix / 25 000)`, 5 % of the price), now settings of the module (B-92).

### 13.1 Replay of the four campaign ships

Same calculator, same data (`campagne` of `vaisseaux_donnees.json`, with `mods` and `fix` of the ship), then checked against the revised rules. The sheet text (`note`, `lore`, `pnj`, `tir`, image) stays the sheet's, outside the catalogue (§ 12).

| Ship | Hull (class) | Drive | Power | Mass | Hardpoints | Price | Upkeep (5 %) | Pay/year | Crew (min–max) | Cargo (t) | AC / HP / Speed | Install days |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cadets-navette | navette (0) | 1 | 3/3 | 2/5 | 1/1 | 255 000 | 12 750 | 43 800 | 1 (1–10) | 0 | 11 / 15 / 3 | 11 |
| ouragan-lego | patrouilleur (1) | 1 | 11/15 | 6/10 | 2/4 | 3 375 000 | 168 750 | 657 000 | 15 (5–20) | 0 | 14 / 25 / 4 | 135 |
| ouragan-005 | patrouilleur (1) | 2 | 15/15 | 10/10 | 2/4 | 3 625 000 | 181 250 | 657 000 | 15 (5–20) | 0 | 14 / 25 / 4 | 145 |
| pie-rouge | marchand-libre (1) | 1 | 3/10 | 15/15 | 1/2 | 700 000 | 35 000 | 175 200 | 4 (1–6) | 160 | 14 / 20 / 3 | 28 |

Checked against the sheets: `ouragan-lego` falls exactly on the Lego sheet (3.375 M, power 11/15, mass 6/10, weapon points 2/4); `pie-rouge` on its 700 000 cr. `cadets-navette`: 255 000 here against the 250 000 of the Lego sheet, and 2 mass points used against the 4 the sheet announces without detail — the sheet's own note says the lance-sable takes 1; the converter keeps the **computed** figures and the sheet text keeps the sheet's, no correction is invented. Its mod (Eternal reactor, 5 % of the bare hull = 10 000 cr, 2 pretech components) is **not part of the price** in the prototype and stays so (the mod price is shown on its own line, § 6).

**Revised rules, one by one on the four ships:**

1. **Crew (H-5)**: all four lie within `[min, max]`; the shuttle raises the existing « Spike drill, 3 crew advised » alert (1 crew), nothing else. No robots, no automation fitting → `robots` 0, `pj` 0.
2. **Capacities (H-4)**: only `pie-rouge` and `ouragan-lego` install a hidden hold (1 each, class 1 → 2 t of hidden cargo, never counted in the 160 t of `pie-rouge`). `ouragan-005` removed it (sheet note). No cold sleep, cabin, lifeboat or hydroponics.
3. **Weapon class (H-7)**: lance-sable (class 0), laser multifocal and faucheuse battery (0 and 0): no refusal on any hull.
4. **Mods and targets (H-8, H-9)**: the shuttle's Eternal reactor is not targeted → no `cibles`; `composants` = 2 × (class 0 + 1) = 2 — the sheet's « 2 for a fighter hull » — `fix` 2 required and held (`reparation` 2). The three other ships carry no mod.
5. **Atmospheric fitting and station rule (H-2)**: no station; `ouragan-005` and `pie-rouge` carry `atmo`, as the notes require.
6. **Speed (H-6)**: lowest speed 3, never negative.

### 13.2 Zones and galaxy

The zones (territories, hexes) and the galaxy map are **not ships**: the designer computes nothing on them, and the conversion of their values belongs to the format of the galaxy tool, not to this epic (EC-9 above, outside the perimeter). B-95 names the ships only; nothing here is left « to see at conversion ».

## 14. The conversion of Éneria's ships (`kanevas-concepteur-vaisseaux-conversion-eneria`, B-95, P-22)

No change to `AntorFr/kanevas`: this slice is a script of `AntorFr/eneria` (`_outils/kanevas/`, P-22 step 1) that writes what §§ 10, 12 and 13 state and pushes it by the import API. The decisions below are the slice's own (`CE-n`); they keep the script the one door between the prototype's data and the catalogue, and make the report of what was not converted a test, not a promise.

- **CE-1 — Extend, never fork.** The script is the existing `convertir.py` (files `catalogue-vaisseaux.json`, `conceptions.json`, `non-converti.md`) and `pousser.py`, taken from the branch `feature/kanevas-outils-eneria` of `eneria`: they are brought up to this epic's model, the galaxy part is left untouched (EC-9, § 13.2). Its output stays tracked by git and byte-identical on a second run.
- **CE-2 — The three values the data do not state are written from § 10, row by row**: the drive names (`spike-n`, « Spike drive, rank n », § 12.2 — the prototype's `moteur-n` keys are retired and the examples' drive line follows), the capacities (§ 10.3) and the codes of the six effects of § 10.6. They live in **one table of the script** (`valeurs_de_conversion`), keyed by the component `id`, each entry carrying the ledger row it comes from (`L-n` or the § 10 row); a component of the data absent from that table where its row says one is due stops the script (code 2), naming the component.
- **CE-3 — « Non converti » is computed, not written.** The script walks the keys of every row of `vaisseaux_donnees.json` and checks each against the « Place » column of § 12 (a table of the script that mirrors § 12.1 to 12.7, not a copy of the data). A key without a place, a place the catalogue refuses, or a component of §§ 10.1 to 10.6 left without its row is one line of `sortie/non-converti.md` and exit code 1. The expected content is « Rien : tout a été converti. », and the test of the script fails otherwise. The counts are asserted: 12 hulls, 6 drives, 40 fittings, 9 defences, 19 weapons, 18 mods, 10 examples, 4 campaign ships.
- **CE-4 — The four campaign ships are designs like the ten examples.** They are written to `conceptions.json` with the same shape (`cle` = the id of the data, `coque`, `choix`, `equipage`, `reparation` = `fix`, `pj` and `robots` 0, `mod_int_con` 0), and pushed in the same lot. Their mods carry **no `cibles`**: the only one (Eternal reactor, the cadets' shuttle) is not targeted, and a targeted mod found in the data stops the script (« la donnée ne dit pas la cible », P-22 step 3). The text of their sheets (`note`, `lore`, `pnj`, `tir`, image) stays the sheet's, as § 12.7 says: nothing of it is written here.
- **CE-5 — The proof is the book, not the prototype.** The figures of § 13 and § 13.1 are copied **by hand** into `references/vaisseaux-livre.json` (price, power, mass, hardpoints, crew min–max, AC / HP / speed, install days, upkeep). The old frozen values of `references/vaisseaux.json` (computed by the prototype before the revised rules) are retired for ships; `figer.js` keeps only the galaxy's. The replay compares them with what the **instance** answers (`GET conceptions/:fid`), never with a figure the script computes. Any difference is a task failure, not a line of `ecarts.md`; a difference caused by the book's rules is a gap in the ledger, which goes back to the epic.
- **CE-6 — Idempotence is proved on a fresh base.** The test pushes twice into a fresh stub instance (`essai.sh`, `KANEVAS_DIR` = a checkout of the epic branch): the second lot creates nothing and moves no `version`, no catalogue version, no fingerprint; a third push after a change of one price in a copy of the data moves exactly that element's version.
- **CE-7 — Pushing to production is not the task's.** The script is run against the stub; the push to Éneria's production instance with Antor's token stays his gesture (P-20, P-22 step 1). The README of `_outils/kanevas/` says how.
