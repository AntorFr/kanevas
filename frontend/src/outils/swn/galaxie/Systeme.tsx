import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useCharge, useTitreAriane } from '../../../cadre-contexte';
import type { UniversListe } from '../../../types';
import { EtatVide, Pastille } from '../../../ui';
import type { PropsOutil } from '../../types';
import CarteSysteme from './CarteSysteme';
import { nomAstre, nomFormation, placeAstre, placeFormation, typeAstre, typeFormation } from './systeme-libelles';
import type { InterieurSysteme } from './types';
import './galaxie.css';

/**
 * E-23, text version (AD-systeme-5): the bodies and zones of a system as rows. Read by the tool's `verifier` before
 * this code is requested, so loading, error with « Réessayer » and « Page introuvable. » are the tool screen's own.
 * « Connexion perdue. » is the shared frame's banner alone. The counts are those of the answer, never of what is hidden.
 */
export default function Systeme({ universId, cible, prealable, suffixeMode }: PropsOutil) {
  const [univers] = useCharge<UniversListe>(`/api/univers/${universId}`);
  // The GM outside Player mode reads as a GM; in Player mode (`?mode=joueur`) he reads what a player reads.
  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj' && !suffixeMode;
  const s = prealable as InterieurSysteme;
  const titre = s.nom !== null && s.nom !== '' ? s.nom : `Système sans nom (${s.q}, ${s.r})`;
  useTitreAriane(titre, 'Cartes');
  const vide = s.astres.length === 0 && s.formations.length === 0;
  // The selected body (a key of the answer): set by the canvas, a list row or the keyboard; the panel (next task) reads it.
  const [selection, setSelection] = useState<string | null>(null);
  const base = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${cible ?? ''}`;
  const adresseVoisin = `/univers/${universId}/outils/swn/galaxie/${cible ?? ''}/interieur/`;

  return (
    <div className="gx-systeme-page">
      <header className="gx-entete">
        <h1>{titre}</h1>
        <Pastille sens="neutre">{s.etat === 'tire' ? 'Tiré' : 'Défini'}</Pastille>
        <Pastille sens="neutre">Hexagone {s.q}, {s.r}</Pastille>
        <Link className="gx-retour" to={`/univers/${universId}/outils/swn/galaxie/${cible ?? ''}`}>← Galaxie</Link>
      </header>
      {vide ? (
        <EtatVide titre={mj ? 'Ce système est vide.' : 'Rien à voir dans ce système pour l’instant.'} />
      ) : (
        <>
          <CarteSysteme
            interieur={s}
            base={base}
            adresseVoisin={adresseVoisin}
            suffixe={suffixeMode ?? ''}
            selection={selection}
            onSelection={setSelection}
          />
          {s.astres.length > 0 && (
            <section>
              <h2>Corps ({s.astres.length})</h2>
              <ul className="gx-lignes" id="gx-liste-corps" aria-label="Corps du système">
                {s.astres.map((a) => (
                  <li key={a.cle} title={nomAstre(a)} className={`cliquable${a.genre === 'lune' ? ' lune' : ''}${selection === a.cle ? ' choisi' : ''}`}>
                    <button type="button" className="ligne-corps" aria-pressed={selection === a.cle} onClick={() => setSelection(a.cle)}>
                      <span className={a.nom ? 'nom' : 'nom vide'}>{nomAstre(a)}</span>
                      <span className="place">{placeAstre(a)}</span>
                      <span className="meta">{typeAstre(a)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {s.formations.length > 0 && (
            <section>
              <h2>Zones ({s.formations.length})</h2>
              <ul className="gx-lignes" aria-label="Zones du système">
                {s.formations.map((f) => (
                  <li key={f.cle} title={nomFormation(f)}>
                    <span className={f.nom ? 'nom' : 'nom vide'}>{nomFormation(f)}</span>
                    <span className="place">{placeFormation(f)}</span>
                    <span className="meta">{typeFormation(f)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
