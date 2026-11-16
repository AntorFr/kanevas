// The library panel of E-28 (grid of E-25): valid assets only, a floor arms Sol, a wall arms Mur, any other asset arms Poser
// (a click arms it, a drag drops it on the canvas). The list is read once by the editor; this panel only filters it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { CarteAsset, Champ, Segments } from '../../../ui';
import type { AssetCarte } from './types';

export type FiltreCategorie = '' | 'sol' | 'mur' | 'objet' | 'vaisseau' | 'decor';
const FILTRES: readonly { valeur: FiltreCategorie; libelle: string }[] = [
  { valeur: '', libelle: 'Tous' },
  { valeur: 'sol', libelle: 'Sols' },
  { valeur: 'mur', libelle: 'Murs' },
  { valeur: 'objet', libelle: 'Objets' },
  { valeur: 'decor', libelle: 'Décors' },
  { valeur: 'vaisseau', libelle: 'Vaisseaux' },
];
/** The drag payload an asset card carries to the canvas. */
export const TYPE_GLISSE = 'application/x-kanevas-asset';

export const urlImage = (universId: number, a: Pick<AssetCarte, 'fichierId' | 'jeton'>) =>
  `/api/univers/${universId}/fichiers/${a.fichierId}?v=${encodeURIComponent(a.jeton)}`;

/** The assets the panel lists: valid ones, filtered by category and search (name or tag). */
export function filtrerAssets(assets: readonly AssetCarte[], categorie: FiltreCategorie, q: string): AssetCarte[] {
  const mot = q.trim().toLocaleLowerCase('fr');
  return assets.filter((a) => a.etat === 'valide' && (categorie === '' || a.categorie === categorie)
    && (mot === '' || a.nom.toLocaleLowerCase('fr').includes(mot) || a.tags.some((t) => t.toLocaleLowerCase('fr').includes(mot))));
}

export function Bibliotheque({
  universId, assets, arme, onChoisir,
}: {
  universId: number;
  assets: readonly AssetCarte[] | null;
  /** The ids armed on Sol and on Mur, to ring their cards. */
  arme: readonly (string | null)[];
  onChoisir: (a: AssetCarte) => void;
}) {
  const [categorie, setCategorie] = useState<FiltreCategorie>('');
  const [q, setQ] = useState('');
  const liste = useMemo(() => (assets ? filtrerAssets(assets, categorie, q) : []), [assets, categorie, q]);
  const aucun = assets !== null && assets.filter((a) => a.etat === 'valide').length === 0;

  return (
    <section className="editeur-bibliotheque" aria-label="Bibliothèque">
      <h2 className="editeur-panneau-titre">Bibliothèque</h2>
      <Champ etiquette="Rechercher un asset" type="search" value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} />
      <Segments legende="Catégorie" options={FILTRES} valeur={categorie} onChange={setCategorie} />
      {assets === null ? (
        <p className="editeur-note" role="status">Chargement de la bibliothèque…</p>
      ) : aucun ? (
        <p className="editeur-note">
          La bibliothèque est vide. <Link to={`/univers/${universId}/outils/battlemap/assets`}>Ouvrez la bibliothèque</Link> pour y ajouter des assets.
        </p>
      ) : liste.length === 0 ? (
        <p className="editeur-note">Aucun asset ne correspond.</p>
      ) : (
        <div className="editeur-grille">
          {liste.map((a) => {
            const objet = a.categorie !== 'sol' && a.categorie !== 'mur';
            const carte = (
              <CarteAsset
                key={a.id}
                nom={a.nom}
                src={urlImage(universId, a)}
                empreinte={a.largeur !== null && a.hauteur !== null ? `${a.largeur}×${a.hauteur}` : null}
                vueDessus={a.vueDessus}
                mj={!a.visible}
                brouillon={false}
                selectionnable={false}
                selectionnee={false}
                ouverte={arme.includes(String(a.id))}
                onOuvrir={() => onChoisir(a)}
              />
            );
            return objet ? (
              <div
                key={a.id}
                draggable
                onDragStart={(ev) => { ev.dataTransfer.setData(TYPE_GLISSE, String(a.id)); ev.dataTransfer.effectAllowed = 'copy'; }}
              >
                {carte}
              </div>
            ) : carte;
          })}
        </div>
      )}
    </section>
  );
}
