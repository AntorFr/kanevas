import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { appeler } from '../api';
import { useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Alerte, Bouton, Champ, Pastille, Sceau, useToasts } from '../ui';
import './ecrans.css';
import './accueil.css';

const NOM_MAX = 80;
const DESCRIPTION_MAX = 500;

/** E-2 Créer un univers: the creator becomes its GM (B-2), then lands on E-3. */
function CreerUnivers() {
  const navigate = useNavigate();
  const { recharger } = useUnivers();
  const { toast } = useToasts();
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
      toast(`« ${cree.nom} » créé`);
      navigate(`/univers/${cree.id}`);
    } catch {
      setEchec(true); // the input is kept
      setEnCours(false);
    }
  }

  function touche(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Escape' && !enCours) return navigate('/');
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }

  return (
    <div className="creer">
      <form className="formulaire" onSubmit={soumettre} onKeyDown={touche} noValidate aria-labelledby="titre-creer">
        <header className="entete-form">
          <Sceau nom={nom} taille="grand" />
          <h1 id="titre-creer">Créer un univers</h1>
          <p className="chapo">
            Vous en serez le <Pastille sens="mj">MJ</Pastille>. Les joueurs s’y ajoutent ensuite, par leur identifiant.
          </p>
        </header>
        {echec && <Alerte>L’action n’a pas abouti. Réessayez.</Alerte>}
        <div className="champs">
          <Champ
            grand
            etiquette="Nom"
            value={nom}
            erreur={erreurNom}
            compteur={`${nom.length} / ${NOM_MAX}`}
            trop={nom.length > NOM_MAX}
            autoComplete="off"
            placeholder="Par exemple : Les Landes grises"
            aria-required="true"
            onChange={(e: { target: { value: string } }) => setNom(e.target.value)}
          />
          <Champ
            grand
            etiquette="Description"
            facultatif
            zone
            rows={4}
            value={description}
            erreur={erreurDescription}
            compteur={`${description.length} / ${DESCRIPTION_MAX}`}
            trop={description.length > DESCRIPTION_MAX}
            placeholder="Ce qu’un joueur doit savoir en arrivant : le lieu, le ton, l’enjeu."
            onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
          />
        </div>
        <div className="actions-form">
          <span className="aide-clavier">
            <kbd>Ctrl</kbd>
            <kbd>↵</kbd> créer · <kbd>Échap</kbd> annuler
          </span>
          <Bouton onClick={() => navigate('/')}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
            Créer l’univers
          </Bouton>
        </div>
      </form>
    </div>
  );
}

export default { chemin: '/univers/nouveau', composant: CreerUnivers } satisfies Ecran;
