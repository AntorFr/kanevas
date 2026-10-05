import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { lire, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Chargement, ErreurChargement, PageIntrouvable } from '../ui';
import './ecrans.css';
import { LigneCompteRendu, type CompteRendu, type PageComptesRendus } from './suivi/commun';

/** E-13 Comptes-rendus: every report the account can read, newest created first; no creation here. */
function ComptesRendus() {
  const { id } = useParams();
  const perdue = useConnexionPerdue();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [page, recharger] = useCharge<PageComptesRendus>(`/api/univers/${id}/comptes-rendus`);
  const [liste, setListe] = useState<CompteRendu[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);

  useEffect(() => {
    if (page.etat === 'ok') {
      setListe(page.valeur.comptesRendus);
      setSuivant(page.valeur.suivant);
    }
  }, [page]);

  if (page.etat === 'chargement' || univers.etat === 'chargement') {
    return <Chargement texte="Chargement des comptes-rendus…" />;
  }
  if ((page.etat === 'erreur' && page.statut === 404) || (univers.etat === 'erreur' && univers.statut === 404)) {
    return <PageIntrouvable />;
  }
  if (page.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les comptes-rendus." onReessayer={recharger} />;
  }
  const mj = univers.valeur.role === 'mj';

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageComptesRendus>(`/api/univers/${id}/comptes-rendus?curseur=${encodeURIComponent(suivant)}`);
      setListe((l) => [...l, ...p.comptesRendus]);
      setSuivant(p.suivant);
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  return (
    <>
      <h1>Comptes-rendus</h1>
      {liste.length === 0 ? (
        <div className="etat">
          <p>{mj ? 'Aucun compte-rendu pour l’instant.' : 'Aucun compte-rendu à lire pour l’instant.'}</p>
          <Link to={`/univers/${id}/campagnes`}>Voir les campagnes</Link>
        </div>
      ) : (
        <ul className="suivi-liste">
          {liste.map((cr) => (
            <LigneCompteRendu key={cr.id} universId={id!} cr={cr} campagne />
          ))}
        </ul>
      )}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {suivant !== null && (
        <Bouton enCours={suiteEnCours} onClick={chargerSuite} disabled={perdue}>
          Charger la suite
        </Bouton>
      )}
    </>
  );
}

export default { chemin: '/univers/:id/comptes-rendus', composant: ComptesRendus } satisfies Ecran;
