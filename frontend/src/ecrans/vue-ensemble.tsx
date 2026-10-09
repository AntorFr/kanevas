import { useParams } from 'react-router-dom';

import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { ErreurChargement, PageIntrouvable, PastilleRole, Sceau } from '../ui';
import './ecrans.css';
import './vue-ensemble.css';
import { blocsVisibles } from './vue-ensemble/registre';

/** E-3 Vue d'ensemble (shell): name, description, role, then the region of independent blocks. */
function VueEnsemble() {
  const { id } = useParams();
  const [univers, recharger] = useCharge<UniversListe>(`/api/univers/${id}`);

  if (univers.etat === 'chargement') {
    return (
      <div className="vue-ensemble">
        <header className="entete-univers" role="status" aria-label="Chargement…">
          <Sceau nom="" taille="grand" chargement />
          <div className="squelette" style={{ width: 280, maxWidth: '100%', height: 40 }} aria-hidden="true" />
          <p className="squelette-texte">Chargement…</p>
        </header>
      </div>
    );
  }
  if (univers.etat === 'erreur') {
    // Unknown universe or no role: the same answer, and no name anywhere.
    if (univers.statut === 404) return <PageIntrouvable />;
    return <ErreurChargement page onReessayer={recharger} />;
  }
  const u = univers.valeur;
  const blocs = blocsVisibles(u.role);
  const colonne = (nom: 'principale' | 'laterale') =>
    blocs
      .filter((b) => (b.colonne ?? 'principale') === nom)
      .map((b) => <b.composant key={b.id} universId={u.id} role={u.role} />);
  return (
    <div className="vue-ensemble">
      <header className="entete-univers">
        <Sceau nom={u.nom} taille="grand" />
        <div className="titre-univers">
          <h1>{u.nom}</h1>
          <PastilleRole role={u.role} />
        </div>
        {u.description && <p className="description-univers">{u.description}</p>}
      </header>
      <div className="blocs" aria-label="Blocs de la vue d’ensemble" role="group">
        <div className="colonne-blocs">{colonne('principale')}</div>
        <div className="colonne-blocs">{colonne('laterale')}</div>
        {/* A block may render nothing (e.g. no game system): the message then stays; see vue-ensemble.css. */}
        <div className="vide-region etat-vide-blocs">Rien à afficher pour l’instant. Les campagnes, les comptes-rendus et les cartes s’afficheront ici.</div>
      </div>
    </div>
  );
}

export default { chemin: '/univers/:id', composant: VueEnsemble } satisfies Ecran;
