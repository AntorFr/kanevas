import { useCallback, useEffect, useState } from 'react';

import { appeler, ErreurApi, lire } from '../../api';
import { Bouton, Champ, Chargement, ErreurChargement, Panneau } from '../../ui';

const BASE = '/api/instance/reglages';
const HORS_BORNES = 'Entre 1 et 500 Mo.';

/** E-5 panel « Limites » (B-89): the largest map background, in MB. Instance admin only (the screen hides it from others). */
export function Limites() {
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    setLecture('chargement');
    lire<{ fondCarteMaxMo: number }>(BASE).then(
      (r) => {
        setSaisie(String(r.fondCarteMaxMo));
        setLecture('ok');
      },
      () => setLecture('erreur'),
    );
  }, []);
  useEffect(charger, [charger]);

  const enregistrer = async () => {
    setEnregistre(false);
    setEchec(false);
    const texte = saisie.trim();
    const n = Number(texte);
    if (!/^\d+$/.test(texte) || n < 1 || n > 500) return setErreur(HORS_BORNES);
    setErreur(undefined);
    setEnCours(true);
    try {
      const r = await appeler<{ fondCarteMaxMo: number }>('PUT', BASE, { fondCarteMaxMo: n });
      setSaisie(String(r.fondCarteMaxMo));
      setEnregistre(true);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 400 && e.details?.champ === 'fondCarteMaxMo') setErreur(HORS_BORNES);
      // A lost network is the banner's business, not an entry failure.
      else if (!(e instanceof ErreurApi && e.statut === 0)) setEchec(true);
    } finally {
      setEnCours(false);
    }
  };

  let corps;
  if (lecture === 'chargement') corps = <Chargement texte="Chargement…" />;
  else if (lecture === 'erreur') corps = <ErreurChargement texte="Impossible de charger les limites." onReessayer={charger} />;
  else {
    corps = (
      <form
        className="limites-formulaire"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void enregistrer();
        }}
      >
        <Champ
          className="limites-champ"
          etiquette="Taille maximale d’un fond de carte (Mo)"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={saisie}
          erreur={erreur ?? (echec ? 'L’action n’a pas abouti. Réessayez.' : undefined)}
          onChange={(e: { target: { value: string } }) => {
            setSaisie(e.target.value);
            setEnregistre(false);
          }}
        />
        <p className="note-admin">S’applique aux prochains envois ; les fonds déjà posés restent.</p>
        <div className="limites-actions">
          <Bouton variante="principal" ecrit enCours={enCours} onClick={() => void enregistrer()}>
            Enregistrer
          </Bouton>
          {enregistre && <span role="status">Limite enregistrée.</span>}
        </div>
      </form>
    );
  }
  return <Panneau titre="Limites">{corps}</Panneau>;
}
