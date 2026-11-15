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
| L-45 | Build speed: 25 000 cr of work per day on a yard; a reason to hurry doubles or quadruples it | `chantierJours = ceil(prix / 25 000)`, constant | **gap → H-5** : the pace is a module setting (×1, ×2, ×4) |
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
| L-59 | **Specialized mountings** (1 · 10 % · 0 · **yes**) | pick **one weapon or fitting at installation**; that element needs only **half** the power and mass **per installation, rounded down, minimum 1** | effect `montages_specialises`: the catalogue must state the target and the limit is 1; the half is **rounded up**, applied to the whole line | **gap → H-8** : E-14 and the rounding |
| L-60 | **Weapon overcharge** (2 · 5 % · 0 · **yes**) | one weapon of the engineer's choice needs **+50 % power** per installation, rolls its damage twice and keeps the better | effect `surcharge_cumulable`: the catalogue must state the target, one target per line | **gap → H-8** : E-14 (the target is chosen at installation) |
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
