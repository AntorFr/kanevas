import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { lire } from '../api';
import { useCharge, useMoi, useUnivers } from '../cadre-contexte';
import { GROUPE_ADMIN } from '../items';
import { ListeMembres, type Membre } from '../ListeMembres';
import type { Ecran } from '../registre';
import { Bouton, Chargement, EtatVide, ErreurChargement, PageIntrouvable, Pastille } from '../ui';
import './ecrans.css';

interface UniversInstance {
  id: number;
  nom: string;
  nbMembres: number;
}

const PAGE = 100;

/** Members of the selected universe; keyed by id so a change of selection resets the state. */
function Membres({ id, nom, surChangement }: { id: number; nom: string; surChangement: () => void }) {
  const { recharger: rechargerUnivers } = useUnivers();
  const moi = useMoi();
  const [membres, recharger] = useCharge<Membre[]>(`/api/instance/univers/${id}/membres`);
  if (membres.etat === 'chargement') return <Chargement texte="Chargement des membres…" />;
  if (membres.etat === 'erreur' && membres.statut === 404) return <PageIntrouvable />;
  if (membres.etat === 'erreur') return <ErreurChargement texte="Impossible de charger les membres." onReessayer={recharger} />;
  const monIdentifiant = moi.etat === 'ok' ? moi.valeur.username : undefined;
  return (
    <ListeMembres
      base={`/api/instance/univers/${id}/membres`}
      nomUnivers={nom}
      membres={membres.valeur}
      // My own membership changed: the sidebar, the home and the « Ouvrir » link follow.
      apres={(m) => {
        if (m.username === monIdentifiant) rechargerUnivers();
        surChangement();
      }}
      note={
        <p className="note-admin">
          Pour lire le contenu, l’admin s’ajoute lui-même comme membre : l’ajout apparaît dans la liste des membres que voit le MJ de l’univers.
        </p>
      }
    />
  );
}

/** E-5 Administration (instance admin only): the universes of the instance and their members, never their content. */
function Administration() {
  // One pattern answers `/administration` and `/administration/univers/:id` (one Ecran per file).
  const reste = useParams()['*'] ?? '';
  const m = /^univers\/(\d+)\/?$/.exec(reste);
  const moi = useMoi();
  const { univers: miens } = useUnivers();
  const [univers, recharger] = useCharge<UniversInstance[]>('/api/instance/univers');
  const [affiches, setAffiches] = useState(PAGE);
  // Member counts after a write: reloaded silently, so the screen does not flash a loading state.
  const [frais, setFrais] = useState<UniversInstance[] | null>(null);
  const rafraichir = () => {
    lire<UniversInstance[]>('/api/instance/univers').then(setFrais, () => undefined);
  };

  if (moi.etat === 'chargement') return <Chargement />;
  // Anyone outside the group: the answer of an unknown address.
  if (moi.etat === 'ok' && !moi.valeur.groups.includes(GROUPE_ADMIN)) return <PageIntrouvable />;
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;

  const selection = m ? Number(m[1]) : null;
  if (reste !== '' && reste !== '/' && !m) return <PageIntrouvable />;

  const entete = (
    <>
      <div className="fil">
        Instance / <strong>Administration</strong>
      </div>
      <h1>Administration</h1>
      <p className="admin-sous-titre">Les membres se gèrent ici ; le contenu (fiches, comptes-rendus, cartes) n’est jamais affiché.</p>
    </>
  );

  if (univers.etat === 'chargement') return <>{entete}<Chargement texte="Chargement des univers…" /></>;
  if (univers.etat === 'erreur') {
    return <>{entete}<ErreurChargement texte="Impossible de charger les univers." onReessayer={recharger} /></>;
  }
  const liste = frais ?? univers.valeur;
  const choisi = selection === null ? undefined : liste.find((u) => u.id === selection);
  if (selection !== null && !choisi) return <PageIntrouvable />;
  if (liste.length === 0) {
    return <>{entete}<EtatVide titre="Aucun univers sur l’instance pour l’instant." /></>;
  }
  // The selected universe stays visible even beyond the first page.
  const rang = choisi ? liste.indexOf(choisi) + 1 : 0;
  const visibles = liste.slice(0, Math.max(affiches, rang));
  const roles = miens.etat === 'ok' ? new Map(miens.valeur.map((u) => [u.id, u.role])) : new Map();

  return (
    <>
      {entete}
      <div className="admin-zones">
        <section>
          <h2>Univers de l’instance</h2>
          <ul className="liste-instance">
            {visibles.map((u) => (
              <li key={u.id}>
                <Link className="choix" to={`/administration/univers/${u.id}`} title={u.nom} aria-current={u.id === selection ? 'true' : undefined}>
                  <span className="nom">{u.nom}</span>
                  <small>{u.nbMembres === 1 ? '1 membre' : `${u.nbMembres} membres`}</small>
                </Link>
                {u.id === selection && <Pastille sens="table">Sélectionné</Pastille>}
                {roles.has(u.id) && <Link to={`/univers/${u.id}`}>Ouvrir</Link>}
              </li>
            ))}
          </ul>
          {visibles.length < liste.length && <Bouton onClick={() => setAffiches(visibles.length + PAGE)}>Charger la suite</Bouton>}
        </section>
        <section>
          {choisi ? (
            <>
              <h2>Membres — {choisi.nom}</h2>
              <Membres key={choisi.id} id={choisi.id} nom={choisi.nom} surChangement={rafraichir} />
            </>
          ) : (
            <EtatVide titre="Choisissez un univers pour voir ses membres." />
          )}
        </section>
      </div>
    </>
  );
}

export default { chemin: '/administration/*', composant: Administration } satisfies Ecran;
