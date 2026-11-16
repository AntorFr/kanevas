// The Calques panel of E-28 (list from top to bottom: the front-most layer first). It only builds commands of the core's list;
// the limit of layers is the core's (`carte_pleine`), its number comes from the core's limits, never from here.
import { Box, Eye, EyeOff, Lock, LockOpen, MoreHorizontal, Plus, Square, Waypoints } from 'lucide-react';
import { useState } from 'react';

import { BoiteDialogue, BoutonIcone, Menu, Pastille } from '../../../ui';
import type { Calque, Commande, Document, TypeCalque } from './types';

const ICONES = { sol: Square, mur: Waypoints, objet: Box } as const;
const TYPES: readonly { valeur: TypeCalque; libelle: string; nom: string }[] = [
  { valeur: 'sol', libelle: 'Calque de sol', nom: 'Sol' },
  { valeur: 'mur', libelle: 'Calque de murs', nom: 'Murs' },
  { valeur: 'objet', libelle: 'Calque d’objets', nom: 'Objets' },
];

/** A name for a new layer of that type that no other layer carries (« Objets 2 »). */
export function nomLibre(doc: Document, base: string): string {
  const pris = new Set(doc.calques.map((c) => c.nom));
  if (!pris.has(base)) return base;
  for (let n = 2; ; n++) if (!pris.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function PanneauCalques({
  doc, calquesMax, actifObjet, onActif, geste, dire,
}: {
  doc: Document;
  calquesMax: number;
  actifObjet: string | null;
  onActif: (id: string) => void;
  /** Applies one gesture; the `refus` sentence is shown when the core refuses with `carte_pleine`. */
  geste: (commandes: Commande[], refus?: string) => boolean;
  dire: (texte: string) => void;
}) {
  const [renomme, setRenomme] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [suppression, setSuppression] = useState<Calque | null>(null);
  const liste = [...doc.calques].reverse();
  const contenu = (c: Calque) => doc.sols.filter((s) => s.calque === c.id).length + doc.murs.filter((m) => m.calque === c.id).length
    + doc.elements.filter((e) => e.calque === c.id).length;

  const regler = (c: Calque, champs: Record<string, boolean>) => geste([{ type: 'regler_calque', id: c.id, ...champs }]);
  const deplacer = (c: Calque, pas: 1 | -1) => {
    const i = doc.calques.findIndex((x) => x.id === c.id);
    const j = i + pas;
    if (j < 0 || j >= doc.calques.length) return;
    geste([{ type: 'ordonner_calque', id: c.id, index: j }]);
  };
  const nouveau = (t: (typeof TYPES)[number]) => {
    if (doc.calques.length >= calquesMax) return dire(`${calquesMax} calques au plus.`);
    geste([{ type: 'creer_calque', id: crypto.randomUUID(), nom: nomLibre(doc, t.nom), genre: t.valeur }], `${calquesMax} calques au plus.`);
  };
  const finRenommer = (valider: boolean) => {
    const c = doc.calques.find((x) => x.id === renomme);
    const n = nom.trim();
    setRenomme(null);
    if (valider && c && n !== '' && n !== c.nom) geste([{ type: 'renommer_calque', id: c.id, nom: n }]);
  };

  return (
    <section className="editeur-calques" aria-label="Calques">
      <div className="editeur-calques-tete">
        <h2 className="editeur-panneau-titre">Calques</h2>
        <Menu
          etiquette="Nouveau calque"
          varianteDeclencheur="fantome-petit"
          declencheur="Nouveau calque"
          icone={Plus}
          entrees={TYPES.map((t) => ({ libelle: t.libelle, icone: ICONES[t.valeur], onChoisir: () => nouveau(t) }))}
        />
      </div>
      <ul className="editeur-calques-liste">
        {liste.map((c, i) => {
          const Icone = ICONES[c.type];
          const actif = c.type === 'objet' && c.id === actifObjet;
          return (
            <li key={c.id} className={`editeur-calque${actif ? ' actif' : ''}${c.visible ? '' : ' masque'}`} data-calque={c.nom}>
              <Icone size={16} strokeWidth={1.75} aria-hidden="true" className="editeur-calque-type" />
              {renomme === c.id ? (
                <input
                  className="editeur-titre-champ editeur-calque-champ"
                  aria-label={`Nom du calque ${c.nom}`}
                  value={nom}
                  maxLength={80}
                  autoFocus
                  onChange={(e) => setNom(e.target.value)}
                  onBlur={() => finRenommer(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter') finRenommer(true); if (e.key === 'Escape') finRenommer(false); }}
                />
              ) : (
                <button
                  type="button"
                  className="editeur-calque-nom"
                  aria-pressed={c.type === 'objet' ? actif : undefined}
                  title={c.type === 'objet' ? 'Calque actif de la pose d’assets' : undefined}
                  onClick={() => c.type === 'objet' && onActif(c.id)}
                >
                  {c.nom}
                </button>
              )}
              {c.mj_seul && <Pastille sens="mj">MJ seul</Pastille>}
              <BoutonIcone etiquette={c.visible ? `Masquer ${c.nom}` : `Afficher ${c.nom}`} icone={c.visible ? Eye : EyeOff} ecrit onClick={() => regler(c, { visible: !c.visible })} />
              <BoutonIcone etiquette={c.verrouille ? `Déverrouiller ${c.nom}` : `Verrouiller ${c.nom}`} icone={c.verrouille ? Lock : LockOpen} ecrit onClick={() => regler(c, { verrouille: !c.verrouille })} />
              <Menu
                etiquette={`Menu du calque ${c.nom}`}
                icone={MoreHorizontal}
                entrees={[
                  { libelle: 'Renommer', onChoisir: () => { setNom(c.nom); setRenomme(c.id); } },
                  { libelle: 'Monter', impossible: i === 0, onChoisir: () => deplacer(c, 1) },
                  { libelle: 'Descendre', impossible: i === liste.length - 1, onChoisir: () => deplacer(c, -1) },
                  { libelle: c.mj_seul ? 'MJ seul : retirer' : 'MJ seul : activer', onChoisir: () => regler(c, { mj_seul: !c.mj_seul }) },
                  { separateur: true },
                  { libelle: 'Supprimer le calque…', danger: true, onChoisir: () => setSuppression(c) },
                ]}
              />
            </li>
          );
        })}
      </ul>
      {suppression && (
        <BoiteDialogue
          titre={`Supprimer le calque « ${suppression.nom} » ?`}
          texte={contenu(suppression) > 0
            ? `Ce calque et ses ${contenu(suppression)} éléments seront supprimés. Vous pourrez annuler ce geste.`
            : 'Ce calque est vide. Vous pourrez annuler ce geste.'}
          action="Supprimer le calque"
          onConfirmer={() => { geste([{ type: 'supprimer_calque', id: suppression.id }]); setSuppression(null); }}
          onFermer={() => setSuppression(null)}
        />
      )}
    </section>
  );
}
