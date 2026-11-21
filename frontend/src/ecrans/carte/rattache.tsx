import { Link2, Link2Off } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { appeler, useConnexionPerdue } from '../../api';
import { Bouton, Champ, Chargement, ErreurChargement, Fenetre } from '../../ui';
import { badgeFiche, typesActifs, useTypes } from '../../types-contexte';
import { ListeRecherche } from '../fiche/liste-recherche';
import type { Fiche } from '../fiche/types';
import type { Carte } from '../cartes/commun';
import { adresseFiche } from './types';

const ECHEC_RATTACHER = 'Impossible de rattacher la carte.';

/**
 * E-11, under the header: « Rattachée à <titre> » and the GM's gestures (AD-142). The line is the server's word:
 * an attached sheet the reader does not read comes without `fiche` and the line is absent.
 */
export function LigneRattachee({ universId, base, carte, gerer, onCarte }: {
  universId: string;
  base: string;
  carte: Carte;
  gerer: boolean;
  onCarte: (c: Carte) => void;
}) {
  const perdue = useConnexionPerdue();
  const [choix, setChoix] = useState(false);
  const [echec, setEchec] = useState<(() => Promise<void>) | undefined>();
  const [enCours, setEnCours] = useState(false);
  const fiche = carte.fiche;

  async function agir(f: () => Promise<Carte>) {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      onCarte(await f());
      setChoix(false);
    } catch {
      setEchec(() => () => agir(f));
      setChoix(false);
    } finally {
      setEnCours(false);
    }
  }
  const rattacher = (ficheId: number) => agir(() => appeler<Carte>('PUT', `${base}/fiche`, { ficheId }));
  const detacher = () => agir(() => appeler<Carte>('DELETE', `${base}/fiche`));

  if (!gerer && !fiche) return null;
  return (
    <div className="carte-rattachee">
      <div className="carte-rattachee-ligne">
        {fiche && (
          <span className="carte-rattachee-texte">
            Rattachée à{' '}
            <Link to={adresseFiche(universId, fiche.id)} title={fiche.titre}>
              {fiche.titre}
            </Link>
          </span>
        )}
        {gerer && (
          <>
            <Bouton petit ecrit icone={Link2} disabled={perdue} onClick={() => setChoix(true)}>
              {fiche ? 'Changer de fiche…' : 'Rattacher à une fiche…'}
            </Bouton>
            {fiche && (
              <Bouton petit ecrit icone={Link2Off} enCours={enCours} onClick={() => void detacher()}>
                Détacher
              </Bouton>
            )}
          </>
        )}
      </div>
      {echec && (
        <div className="echec" role="alert">
          {ECHEC_RATTACHER}{' '}
          <Bouton petit onClick={() => void echec()}>
            Réessayer
          </Bouton>
        </div>
      )}
      {choix && gerer && <ChoixFiche universId={universId} onChoix={rattacher} onFermer={() => setChoix(false)} />}
    </div>
  );
}

/** The search window of « Ajouter une fiche », with one choice: a click on a sheet attaches it. */
function ChoixFiche({ universId, onChoix, onFermer }: { universId: string; onChoix: (id: number) => Promise<void>; onFermer: () => void }) {
  const { types, etat, recharger } = useTypes();
  const actifs = typesActifs(types);
  const [choisi, setType] = useState('');
  const [recherche, setRecherche] = useState('');
  const courant = actifs.find((t) => t.type === choisi) ?? actifs[0];
  return (
    <Fenetre titre="Rattacher à une fiche" onFermer={onFermer}>
      <div className="carte-ajout">
        {!courant ? (
          etat === 'erreur' ? (
            <ErreurChargement texte="Impossible de charger les types." onReessayer={recharger} />
          ) : (
            <Chargement texte="Chargement des types…" />
          )
        ) : (
          <>
            <Champ
              etiquette="Type de fiche"
              liste
              value={courant.type}
              onChange={(e: { target: { value: string } }) => {
                setType(e.target.value);
                setRecherche('');
              }}
            >
              {actifs.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.singulier}
                </option>
              ))}
            </Champ>
            <ListeRecherche
              key={courant.type}
              universId={universId}
              type={courant}
              recherche={recherche}
              onRecherche={setRecherche}
              videListe={<p>{courant.aucun}.</p>}
              ligne={(f: Fiche) => (
                <button type="button" className="choix-fiche" onClick={() => void onChoix(f.id)}>
                  <span className="titre-fiche" title={f.titre}>
                    {f.titre}
                  </span>
                  <span className="badge-type">{badgeFiche(types, f)}</span>
                </button>
              )}
            />
          </>
        )}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}
