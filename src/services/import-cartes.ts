import { attachmentsDir } from '../config/env.js';
import type { Db } from '../db/db.js';
import { resoudreFiche } from './cles.js';
import { roleDe } from './droits.js';
import { empreinteCarte } from './empreintes.js';
import { ErreurService, refuse } from './erreurs.js';
import { ecrireFond, MAX_TEXTE_CARTE, type CarteRow } from './cartes.js';
import { validerTitre } from './fiches.js';
import type { FluxEntrant } from './fichiers.js';
import { avecContexte } from './historique.js';
import { cleValide } from './import.js';
import type { JetonRequete as Jeton } from './jetons.js';
import { lireLot, noterDansLot, type Issue } from './lots.js';
import { contenuPublic } from './markdown.js';
import {
  empreintePerimee,
  lirePrecondition,
  RAISON_EMPREINTE_PERIMEE,
  verifierPrecondition,
} from './precondition.js';
import { abandonner, promouvoir, sha256Stocke, supprimerFichier } from './stockage.js';

const MAX_TITRE = 80;

export interface ResultatCarteImport {
  id: number;
  etat: 'creee' | 'mise_a_jour' | 'inchangee';
  /** Fingerprint of the map after the write (title, form, visibility, background; AD-139). */
  empreinte: string;
}

/** What the script sends, as read from the form: nothing is trusted. `undefined` means « not sent ». */
export interface EntreeCarteImport {
  titre: unknown;
  forme?: unknown;
  visible?: unknown;
  /** Origin key of a sheet, `null` (or an empty field) to detach, `undefined` to leave as is. */
  fiche?: unknown;
  texte?: unknown;
  /** The background stream; `null` when the request carries none (the background stays). */
  flux: FluxEntrant | null;
}

const ligne = (c: CarteRow) => c;

/**
 * Ensures an imported illustrated map (AD-104, AD-142, AD-143). The origin key identifies the map; a replay
 * with the same fields and the same background bytes is `inchangee`. A field left out leaves the map's value
 * (the sheet, the text, the visibility, the background); a new map starts hidden, without background.
 * Every refusal comes before the stream is read, and with a batch counts « 1 refusée ».
 */
export async function assurerCarte(
  db: Db,
  jeton: Jeton,
  lotId: number | null,
  cle: string,
  entree: EntreeCarteImport,
  maintenant: Date = new Date(),
  racine: string = attachmentsDir,
  entetes: Record<string, string | string[] | undefined> = {},
): Promise<ResultatCarteImport> {
  const autoriser = () => {
    const role = roleDe(db, jeton.universId, jeton.compteId);
    if (!role) throw new ErreurService('introuvable', 'Introuvable.');
    if (role !== 'mj') throw refuse();
    if (lotId !== null && lireLot(db, jeton, lotId, maintenant).closLe !== null) {
      throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
    }
  };
  autoriser();
  const invalider = (champ: string, raison: string): never => {
    throw new ErreurService('invalide', raison, undefined, champ);
  };
  const lire = (): CarteRow | undefined =>
    db.prepare('SELECT * FROM cartes WHERE univers_id = ? AND cle_origine = ?').get(jeton.universId, cle) as
      | CarteRow
      | undefined;
  let temporaire: string | null = null;
  let nouveauDisque: string | null = null;
  let ancienDisque: string | null = null;
  let valide = false;
  try {
    const precondition = lirePrecondition(entetes, { creation: true });
    if (!cleValide(cle)) invalider('cle', "Clé d'origine invalide.");
    if (entree.forme !== undefined && entree.forme !== null && entree.forme !== 'illustree') {
      invalider('forme', 'Seule une carte « illustree » s’importe.');
    }
    if (typeof entree.titre !== 'string') invalider('titre', 'Titre manquant.');
    let titre: string;
    try {
      titre = validerTitre(entree.titre as string, MAX_TITRE, 'Le titre');
    } catch (e) {
      return invalider('titre', (e as Error).message);
    }
    let visible: boolean | undefined;
    if (entree.visible !== undefined && entree.visible !== null) {
      if (entree.visible === true || entree.visible === 'true') visible = true;
      else if (entree.visible === false || entree.visible === 'false') visible = false;
      else invalider('visible', 'La visibilité est « true » ou « false ».');
    }
    let texte: string | undefined;
    if (entree.texte !== undefined && entree.texte !== null) {
      if (typeof entree.texte !== 'string') invalider('texte', 'Le texte doit être une chaîne.');
      if ((entree.texte as string).length > MAX_TEXTE_CARTE) invalider('texte', 'Le texte : 5 000 caractères au plus.');
      texte = entree.texte as string;
    }
    // `fiche`: absent leaves the attachment, null / empty detaches, a key attaches (unknown: 400, nothing written).
    let fiche: number | null | undefined;
    if (entree.fiche !== undefined) {
      if (entree.fiche === null || entree.fiche === '' || entree.fiche === 'null') fiche = null;
      else {
        const r = typeof entree.fiche === 'string' ? resoudreFiche(db, jeton.universId, entree.fiche) : null;
        if (!r) invalider('fiche', 'Cette fiche est introuvable dans cet univers.');
        fiche = r!.id;
      }
    }
    const avant = lire();
    if (avant && avant.forme !== 'illustree') invalider('forme', 'Cette carte n’est pas une carte illustrée.');
    const shaDe = async (c: CarteRow | undefined) => (c?.fond ? await sha256Stocke(c.fond, racine) : null);
    const shaAvant = await shaDe(avant);
    const empreinteDe = (c: CarteRow | undefined, sha: string | null) =>
      c ? empreinteCarte({ titre: c.titre, forme: c.forme, visible: c.visible === 1, sha256Fond: sha }) : null;
    if (precondition.siEmpreinte !== undefined || precondition.siAbsent) {
      verifierPrecondition(precondition, empreinteDe(avant, shaAvant));
    }
    const ecrit = entree.flux ? await ecrireFond(db, entree.flux, racine) : null;
    temporaire = ecrit?.temporaire ?? null;
    const resultat = avecContexte(db, { compteId: jeton.compteId, jetonId: jeton.id, origine: 'import', lotId }, () => {
      autoriser();
      const courant = lire();
      // The upload yielded: the check is held again, on the state read before when the background did not move.
      if (precondition.siEmpreinte !== undefined || precondition.siAbsent) {
        if ((courant?.fond ?? null) !== (avant?.fond ?? null)) throw empreintePerimee();
        verifierPrecondition(precondition, empreinteDe(courant, shaAvant));
      }
      if (courant && courant.forme !== 'illustree') invalider('forme', 'Cette carte n’est pas une carte illustrée.');
      if (fiche !== undefined && fiche !== null) {
        const f = db.prepare('SELECT 1 AS ok FROM fiches WHERE id = ? AND univers_id = ?').get(fiche, jeton.universId);
        if (!f) invalider('fiche', 'Cette fiche est introuvable dans cet univers.');
      }
      let id: number;
      let etat: ResultatCarteImport['etat'];
      let sha = shaAvant;
      if (!courant) {
        if (ecrit) nouveauDisque = promouvoir(ecrit.temporaire, racine);
        const t = texte ?? '';
        const info = db
          .prepare(
            `INSERT INTO cartes (univers_id, titre, forme, visible, fond, fond_type, cree_le, cle_origine,
               fiche_id, texte, texte_public, version) VALUES (?, ?, 'illustree', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(jeton.universId, titre, visible ? 1 : 0, nouveauDisque, ecrit?.type ?? null, maintenant.toISOString(),
            cle, fiche ?? null, t, contenuPublic(t), t === '' ? 0 : 1);
        id = Number(info.lastInsertRowid);
        sha = ecrit?.empreinte ?? null;
        etat = 'creee';
      } else {
        id = courant.id;
        const octets = ecrit !== null && ecrit.empreinte !== shaAvant;
        if (octets) {
          nouveauDisque = promouvoir(ecrit!.temporaire, racine);
          ancienDisque = courant.fond;
          sha = ecrit!.empreinte;
        }
        const visibleEcrit = visible === undefined ? courant.visible : visible ? 1 : 0;
        const ficheEcrite = fiche === undefined ? courant.fiche_id : fiche;
        const texteEcrit = texte === undefined ? courant.texte : texte;
        const texteChange = texteEcrit !== courant.texte;
        const change = octets || titre !== courant.titre || visibleEcrit !== courant.visible
          || ficheEcrite !== courant.fiche_id || texteChange;
        if (change) {
          db.prepare(
            `UPDATE cartes SET titre = ?, visible = ?, fiche_id = ?, texte = ?, texte_public = ?,
               version = version + ?, fond = ?, fond_type = ? WHERE id = ?`,
          ).run(titre, visibleEcrit, ficheEcrite, texteEcrit, texteChange ? contenuPublic(texteEcrit) : courant.texte_public,
            texteChange ? 1 : 0, nouveauDisque ?? courant.fond, octets ? ecrit!.type : courant.fond_type, id);
        }
        etat = change ? 'mise_a_jour' : 'inchangee';
      }
      if (lotId !== null) {
        const issues: Record<ResultatCarteImport['etat'], Issue> = {
          creee: 'creees', mise_a_jour: 'mises_a_jour', inchangee: 'inchangees',
        };
        noterDansLot(db, lotId, 'cartes', issues[etat], [], maintenant);
      }
      const c = ligne(db.prepare('SELECT * FROM cartes WHERE id = ?').get(id) as CarteRow);
      return { id, etat, empreinte: empreinteDe(c, sha)! };
    });
    valide = true;
    if (ancienDisque) supprimerFichier(ancienDisque, racine);
    return resultat;
  } catch (e) {
    if (e instanceof ErreurService && lotId !== null) {
      if (e.detail === 'empreinte_perimee') {
        noterDansLot(db, lotId, 'cartes', 'refusees', [
          { cle, objet: 'carte', raison: RAISON_EMPREINTE_PERIMEE, gravite: 'refus', code: 'empreinte_perimee' },
        ], maintenant);
      } else if (e.code === 'invalide') {
        noterDansLot(db, lotId, 'cartes', 'refusees', [
          { cle, objet: 'carte', raison: e.message, gravite: 'refus' },
        ], maintenant);
      }
    }
    throw e;
  } finally {
    if (temporaire) await abandonner(temporaire, racine);
    if (!valide && nouveauDisque) supprimerFichier(nouveauDisque, racine);
  }
}
