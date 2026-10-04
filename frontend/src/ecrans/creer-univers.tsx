import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { appeler } from '../api';
import { useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ } from '../ui';
import './ecrans.css';

const NOM_MAX = 80;
const DESCRIPTION_MAX = 500;

/** E-2 Créer un univers: the creator becomes its GM (B-2), then lands on E-3. */
function CreerUnivers() {
  const navigate = useNavigate();
  const { recharger } = useUnivers();
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [vide, setVide] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);

  const erreurNom = nom.length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : vide && nom.trim() === '' ? 'le nom est obligatoire.' : undefined;
  const erreurDescription = description.length > DESCRIPTION_MAX ? `${DESCRIPTION_MAX} caractères au plus.` : undefined;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    if (nom.trim() === '') return setVide(true);
    if (nom.length > NOM_MAX || description.length > DESCRIPTION_MAX) return;
    setEnCours(true);
    setEchec(false);
    try {
      const cree = await appeler<UniversListe>('POST', '/api/univers', { nom, description });
      recharger();
      navigate(`/univers/${cree.id}`);
    } catch {
      setEchec(true); // the input is kept
      setEnCours(false);
    }
  }

  return (
    <>
      <h1>Créer un univers</h1>
      {echec && (
        <div className="echec" role="alert">
          L’action n’a pas abouti. Réessayez.
        </div>
      )}
      <form onSubmit={soumettre} noValidate>
        <Champ etiquette="Nom" value={nom} erreur={erreurNom} onChange={(e: { target: { value: string } }) => setNom(e.target.value)} />
        <Champ
          etiquette="Description"
          zone
          rows={4}
          value={description}
          erreur={erreurDescription}
          onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
        />
        <div className="actions">
          <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
            Créer l’univers
          </Bouton>
          <Bouton onClick={() => navigate('/')}>Annuler</Bouton>
        </div>
      </form>
    </>
  );
}

export default { chemin: '/univers/nouveau', composant: CreerUnivers } satisfies Ecran;
