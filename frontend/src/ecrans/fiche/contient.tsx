import { FolderTree } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../api';
import { Bouton } from '../../ui';
import './contient.css';
import type { Enfant, PageEnfants } from './types';
import { iconeDuType, useTypes } from '../../types-contexte';

interface Props {
  universId: string;
  ficheId: number;
  /** `?mode=joueur` when the GM reads as a player. */
  suffixeMode: string;
}

type Etat = { k: 'chargement' } | { k: 'erreur' } | { k: 'ok'; enfants: Enfant[]; suivant: string | null };

/**
 * E-9 block « Contient » (AD-115): the readable children of the sheet, read on their own so that a failure
 * never takes the text away. Fifty at a time; the next page is read ahead so the button can say how many follow.
 * Absent when there is nothing to show (or the sheet is gone), and never a count of what is hidden.
 */
export function BlocContient({ universId, ficheId, suffixeMode }: Props) {
  const { types } = useTypes();
  const perdue = useConnexionPerdue();
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  // The page after the one shown, once read.
  const [prochaine, setProchaine] = useState<PageEnfants | null>(null);
  const [echecSuite, setEchecSuite] = useState(false);
  const generation = useRef(0);

  const adresse = useCallback(
    (curseur?: string) => {
      const q = [suffixeMode.replace('?', ''), curseur === undefined ? '' : `curseur=${encodeURIComponent(curseur)}`].filter((x) => x !== '');
      return `/api/univers/${universId}/fiches/${ficheId}/enfants${q.length ? `?${q.join('&')}` : ''}`;
    },
    [universId, ficheId, suffixeMode],
  );

  const lireAvance = useCallback(
    async (curseur: string, g: number) => {
      try {
        const p = await lire<PageEnfants>(adresse(curseur));
        if (g === generation.current) setProchaine(p);
      } catch (e) {
        if (g !== generation.current) return;
        if (e instanceof ErreurApi && e.statut === 404) setEtat({ k: 'ok', enfants: [], suivant: null });
        else setProchaine(null);
      }
    },
    [adresse],
  );

  useEffect(() => {
    const g = ++generation.current;
    setEtat({ k: 'chargement' });
    setProchaine(null);
    setEchecSuite(false);
    lire<PageEnfants>(adresse()).then(
      (p) => {
        if (g !== generation.current) return;
        setEtat({ k: 'ok', enfants: p.enfants, suivant: p.suivant });
        if (p.suivant !== null) void lireAvance(p.suivant, g);
      },
      (e) => {
        if (g !== generation.current) return;
        // The sheet is gone (404): the block goes with it.
        setEtat(e instanceof ErreurApi && e.statut === 404 ? { k: 'ok', enfants: [], suivant: null } : { k: 'erreur' });
      },
    );
  }, [adresse, lireAvance, essai]);

  if (etat.k === 'ok' && etat.enfants.length === 0) return null;

  function afficherSuite() {
    if (etat.k !== 'ok' || etat.suivant === null) return;
    const g = generation.current;
    if (prochaine === null) {
      // The read-ahead failed: ask again now.
      setEchecSuite(false);
      lire<PageEnfants>(adresse(etat.suivant)).then(
        (p) => g === generation.current && ajouter(p),
        () => g === generation.current && setEchecSuite(true),
      );
      return;
    }
    ajouter(prochaine);
  }

  function ajouter(p: PageEnfants) {
    const g = generation.current;
    setEtat((e) => (e.k === 'ok' ? { k: 'ok', enfants: [...e.enfants, ...p.enfants], suivant: p.suivant } : e));
    setProchaine(null);
    setEchecSuite(false);
    if (p.suivant !== null) void lireAvance(p.suivant, g);
  }

  return (
    <div className="blocs">
      <section className="bloc-section bloc-contient" aria-labelledby="titre-contient">
        <h2 id="titre-contient" className="bloc-libelle">
          <FolderTree size={14} strokeWidth={1.75} aria-hidden="true" />
          Contient
        </h2>
        <div className="bloc-contenu">
          {etat.k === 'chargement' && <p role="status" className="chargement-contient">Chargement…</p>}
          {etat.k === 'erreur' && (
            <div className="echec" role="alert">
              <span>Impossible de charger les enfants.</span>{' '}
              <Bouton petit disabled={perdue} onClick={() => setEssai((n) => n + 1)}>
                Réessayer
              </Bouton>
            </div>
          )}
          {etat.k === 'ok' && (
            <>
              <ul className="enfants">
                {etat.enfants.map((f) => {
                  const Icone = iconeDuType(types, f.type);
                  return (
                    <li key={f.id}>
                      <Link className="jeton cible" to={`/univers/${universId}/fiche/${f.id}`}>
                        <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span className="jeton-titre" title={f.titre}>
                          {f.titre}
                        </span>
                        {f.sousType && <small>· {f.sousType}</small>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {echecSuite && (
                <div className="echec" role="alert">
                  Impossible de charger la suite.
                </div>
              )}
              {etat.suivant !== null && (
                <Bouton ecrit={false} disabled={perdue} onClick={afficherSuite}>
                  {prochaine !== null ? `Afficher les ${prochaine.enfants.length} suivants` : echecSuite ? 'Réessayer' : 'Afficher la suite'}
                </Bouton>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
