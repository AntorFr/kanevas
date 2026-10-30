import { z } from 'zod';
import { jsonCanonique } from '../catalogue-json.js';
import type { CibleCatalogue, DeclarationCatalogue, LigneCatalogue, StockageCatalogue } from '../declaration.js';
import type { Db } from '../../db/db.js';
import { ErreurService, introuvable } from '../../services/erreurs.js';

const owner = (c: CibleCatalogue) => 'systemeId' in c
  ? { niveau: 'systeme', colonne: 'systeme_id', id: c.systemeId }
  : { niveau: 'univers', colonne: 'univers_id', id: c.universId };
interface Row {
  nature: string; cle: string; nom: string; masse: number; cout: number;
  portee: string | null; masque: number; version: number;
}
const line = (r: Row): LigneCatalogue => ({
  nature: r.nature, cle: r.cle, nom: r.nom, masque: Boolean(r.masque), version: r.version,
  donnees: { nom: r.nom, masse: r.masse, cout: r.cout, ...(r.nature === 'armes' ? { portee: r.portee } : {}) },
});
const read = (db: Db, c: CibleCatalogue, nature: string, cle: string): LigneCatalogue | null => {
  const o = owner(c);
  const r = db.prepare(`SELECT * FROM essai_catalogue_elements WHERE niveau = ? AND ${o.colonne} = ? AND nature = ? AND cle = ?`)
    .get(o.niveau, o.id, nature, cle) as Row | undefined;
  return r ? line(r) : null;
};
export const stockageEssai: StockageCatalogue = {
  lister(db, c, nature, page) {
    const o = owner(c);
    let rows = (db.prepare(`SELECT * FROM essai_catalogue_elements WHERE niveau = ? AND ${o.colonne} = ?
      ${nature === undefined ? '' : 'AND nature = ?'} ORDER BY nom, cle, nature`)
      .all(o.niveau, o.id, ...(nature === undefined ? [] : [nature])) as Row[]).map(line);
    if (page?.curseur) {
      const i = rows.findIndex((r) => r.cle === page.curseur);
      rows = i < 0 ? [] : rows.slice(i + 1);
    }
    return page?.limite === undefined ? rows : rows.slice(0, page.limite);
  },
  lirePar: read,
  ecrire(db, c, nature, { cle, donnees: d, versionCatalogue }) {
    const o = owner(c);
    const previous = read(db, c, nature, cle);
    if (previous && jsonCanonique(previous.donnees) === jsonCanonique(d)) return 'inchange';
    if (previous) {
      db.prepare(`UPDATE essai_catalogue_elements SET nom = ?, masse = ?, cout = ?, portee = ?,
        version_catalogue = ?, version = version + 1 WHERE niveau = ? AND ${o.colonne} = ? AND nature = ? AND cle = ?`)
        .run(d.nom, d.masse, d.cout, d.portee ?? null, versionCatalogue, o.niveau, o.id, nature, cle);
      return 'modifie';
    }
    db.prepare(`INSERT INTO essai_catalogue_elements
      (niveau, systeme_id, univers_id, nature, cle, nom, masse, cout, portee, version_catalogue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(o.niveau, 'systemeId' in c ? c.systemeId : null, 'universId' in c ? c.universId : null,
        nature, cle, d.nom, d.masse, d.cout, d.portee ?? null, versionCatalogue);
    return 'cree';
  },
  poserMasque(db, universId, nature, cle, masque, versionLue) {
    const changed = db.prepare(`UPDATE essai_catalogue_elements SET masque = ?, version = version + 1
      WHERE univers_id = ? AND nature = ? AND cle = ? AND version = ?`)
      .run(Number(masque), universId, nature, cle, versionLue).changes;
    if (!changed) {
      if (!read(db, { universId }, nature, cle)) throw introuvable();
      throw new ErreurService('conflit', "Cet élément a changé depuis que vous l'avez ouvert.", 'donnee_modifiee');
    }
    return read(db, { universId }, nature, cle)!;
  },
  retraits(db, universId) {
    return db.prepare('SELECT nature, cle FROM essai_catalogue_retraits WHERE univers_id = ?')
      .all(universId) as { nature: string; cle: string }[];
  },
  poserRetrait(db, universId, nature, cle, retire) {
    if (retire) db.prepare('INSERT INTO essai_catalogue_retraits (univers_id, nature, cle) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(universId, nature, cle);
    else db.prepare('DELETE FROM essai_catalogue_retraits WHERE univers_id = ? AND nature = ? AND cle = ?')
      .run(universId, nature, cle);
  },
};
const hull = { nom: z.string().min(1), masse: z.number().nonnegative(), cout: z.number().int().nonnegative() };
export const catalogueEssai: DeclarationCatalogue = {
  natures: [
    { nom: 'coques', libelle: 'Coque', libellePluriel: 'Coques', schema: z.strictObject(hull),
      resume: (d) => `${d.masse} masse · ${d.cout} crédits` },
    { nom: 'armes', libelle: 'Arme', libellePluriel: 'Armes',
      schema: z.strictObject({ ...hull, portee: z.enum(['courte', 'longue']) }),
      resume: (d) => `${d.masse} masse · ${d.cout} crédits · portée ${d.portee}` },
  ],
  stockage: stockageEssai,
};
