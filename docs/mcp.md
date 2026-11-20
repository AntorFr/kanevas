# The MCP door (`/mcp`)

An external agent reads and writes a universe through a [Model Context Protocol](https://modelcontextprotocol.io)
server, with an API token (E-23). Decisions: AD-145 and `AD-mcp-1` to `AD-mcp-6` in `ARCHITECTURE.md`; stories B-96 to B-98 and B-107 to B-111.

## Address, transport, guard

- `POST /mcp` and `POST /mcp/:univers` (`:univers` is the universe **key**; its numeric id is accepted too, as everywhere). Streamable HTTP, stateless, JSON
  answers; `GET` and `DELETE` answer 405 (after the guard: 401 without a valid token). A client sends `Accept: application/json, text/event-stream`, else the SDK answers « Not Acceptable ». A request with an `Origin` header is refused 403; the body is capped at 1 MiB.
- `Authorization: Bearer kvs_…`. Unknown, revoked or expired token (or a tool-scoped token): 401 `jeton_invalide`.
  A universe the token does not reach, or where the account has no role: 404, like an unknown one. The session cookie
  is ignored.
- Bare `/mcp` offers `lister_univers` only: the universes the token reaches, with the address to configure
  (`/mcp/<key>`), 20 per page and a `curseur`. `/mcp/:univers` offers that universe's tools.
- The effective right is the lesser of the token's level and the account's current role: a player's `ecriture` token
  writes only what a player writes. The account, universe, role, level and token are never tool parameters.

## Tools

A sheet is cited by `fiche`: its key (`lieu:tenebria`, a former key too) or its numeric id. Lists and searches take
an optional `curseur` and return `curseur` (`null` on the last page).

| Level | Tools |
|---|---|
| `lecture` and `ecriture` | `chercher`, `chercher_texte`, `lire_fiche`, `lire_section`, `mentions`; `lire_historique` for a GM account |
| `ecriture` only | `creer_fiche`, `modifier_entete`, `ecrire_section`, `supprimer_section`, `relier`, `modifier_relation`, `retirer_relation` |

Read parameters (`tools/list` gives them all): `chercher` and `chercher_texte` take `mots` and optionally `type`, `curseur`; `lire_fiche` and `mentions` take `fiche` (`mentions` also `curseur`); `lire_section` takes `fiche`, `sectionId`; `lire_historique` takes `fiche` (optional) and `curseur`.

A `lecture` token does not list the write tools; calling one by name answers `lecture_seule`.
Not offered on this door: `generer_image`, `proposer_mise_a_jour`, `modifier_section`, `ajouter_a_section`.

## Fingerprints (precondition of a write)

A write is made **under the precondition of what the agent read** (AD-140). The reads return the fingerprints:

- `lire_fiche`: `empreinteEnTete` (the header), `empreinte` (the whole sheet), `empreinte` on each section and on each
  relation it lists (`relations[].id` is the id to pass to the relation tools).
- `lire_section`: `empreinte` of the section.

| Tool | `empreinte` required | Parameters besides `fiche` |
|---|---|---|
| `creer_fiche` | none | `type`, `titre`, `sousType?`, `parent?`; answers the readable key `fiche` and both fingerprints |
| `modifier_entete` | the header's | any of `titre`, `sousType`, `parent` (key or `null`), `alias`, `etiquettes` (whole lists), `statut`, `disparu`, `pj` |
| `ecrire_section` | the section's | `sectionId`, `contenu` |
| `supprimer_section` | the section's | `sectionId` |
| `relier` | none (idempotent) | `sectionId`, `cible`, `nature?`, `qualificatif?`; repeated as is, it answers the existing relation (`inchangee: true`) |
| `modifier_relation` | the relation's | `relation` (id), `nature?`, `qualificatif?` |
| `retirer_relation` | the relation's | `relation` (id) |

The header fingerprint does not move when a section changes, and conversely: `modifier_entete` succeeds with the
header's fingerprint even if a section moved. A write answers the new fingerprints so the agent can chain writes.

## Refusals

A refusal is a tool error (`isError`) whose text carries the interface's words and, in brackets, the code
(and the field): `… [section_modifiee]`, `… [invalide, champ : empreinte]`; the same code and field ride in
`structuredContent`.

| Code | When |
|---|---|
| `section_modifiee` | the fingerprint read is no longer the current one (section, header or relation): nothing is written; the text says « Relisez » — read again, then retry |
| `invalide`, `champ: empreinte` | the fingerprint is missing or not a fingerprint (all five tools that require one) |
| `section_geree` | the section is managed by a tool; only that tool writes it |
| `lecture_seule` | a write tool called with a `lecture` token |
| `introuvable` | unknown or unreadable object, same words for both |
| refusal of a service | « Vous ne pouvez pas modifier cette section. », GM-only tools for a player, `relation_existante`, `nature_incompatible`, `limite_relations`… |

A successful write also returns an `evenement` (`type`, `libelle`, `cible`), as the assistant's tools do (AD-76).

## History

Every write of the door is recorded in the history (E-24) with origin `mcp`, the account, and the **token** (its id and
name), set by the door around the call — a tool never sets it. `lire_historique` (GM account, any level) reads it.

## Try it in stub mode

On a fresh database (`KANEVAS_STUB=1 npm start`, see the README), the stub token `kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue`
(`JETON_BOUCHON`) reaches « Essai Kanka »; `PORT` is the one you started on (3001 by default):

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H 'Authorization: Bearer kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue' \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lister_univers","arguments":{}}}'
```

It answers each universe with its `adresse` (`/mcp/<key>`); post `tools/list` there for the tools and their parameters.
