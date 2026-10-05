import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { appeler, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ErreurChargement, PageIntrouvable } from '../ui';
import './ecrans.css';
import { BadgeStatut, ECHEC, ListeStatut, STATUTS, type Campagne, type Statut } from './suivi/commun';

const rang = (s: Statut) => STATUTS.indexOf(s);

/** Same order as the server: active, in preparation, finished; each by name, case ignored. */
function trier(l: Campagne[]): Campagne[] {
  return [...l].sort(
    (a, b) => rang(a.statut) - rang(b.statut) || a.nom.toLowerCase().localeCompare(b.nom.toLowerCase()) || a.id - b.id,
  );
}

/** E-6, list view: the universe's campaigns; the GM creates and changes status in place. */
function ListeCampagnes() {
  const { id } = useParams();
  const perdue = useConnexionPerdue();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [donnees, recharger] = useCharge<{ campagnes: Campagne[] }>(`/api/univers/${id}/campagnes`);
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (donnees.etat === 'ok') setCampagnes(donnees.valeur.campagnes);
  }, [donnees]);

  if (donnees.etat === 'chargement' || univers.etat === 'chargement') {
    return <Chargement texte="Chargement des campagnes…" />;
  }
  if ((donnees.etat === 'erreur' && donnees.statut === 404) || (univers.etat === 'erreur' && univers.statut === 404)) {
    return <PageIntrouvable />;
  }
  if (donnees.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les campagnes." onReessayer={recharger} />;
  }
  const mj = univers.valeur.role === 'mj';

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const n = nom.trim();
    if (n === '') return setErreur('le nom est obligatoire.');
    if (n.length > 80) return setErreur('80 caractères au plus.');
    setErreur(undefined);
    setEchec(false);
    setEnCours(true);
    try {
      const c = await appeler<Campagne>('POST', `/api/univers/${id}/campagnes`, { nom: n });
      setCampagnes((l) => [...l, c]);
      setNom('');
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  async function changer(c: Campagne, statut: Statut) {
    setEchec(false);
    const avant = c.statut;
    setCampagnes((l) => l.map((x) => (x.id === c.id ? { ...x, statut } : x)));
    try {
      const maj = await appeler<Campagne>('PATCH', `/api/campagnes/${c.id}`, { statut });
      setCampagnes((l) => l.map((x) => (x.id === c.id ? maj : x)));
    } catch {
      setCampagnes((l) => l.map((x) => (x.id === c.id ? { ...x, statut: avant } : x)));
      setEchec(true);
    }
  }

  return (
    <>
      <h1>Campagnes</h1>
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      {mj && (
        <h2>Nouvelle campagne</h2>
      )}
      {mj && (
        <form className="formulaire-ligne" onSubmit={creer} noValidate aria-label="Nouvelle campagne">
          <Champ etiquette="Nom" value={nom} erreur={erreur} onChange={(e: { target: { value: string } }) => setNom(e.target.value)} />
          <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
            Créer la campagne
          </Bouton>
        </form>
      )}
      {campagnes.length === 0 ? (
        <div className="etat">
          <p>Aucune campagne pour l’instant.</p>
        </div>
      ) : (
        <ul className="suivi-liste liste-campagnes">
          {trier(campagnes).map((c) => (
            <li key={c.id} className="ligne-suivi">
              <Link className="grand" to={`/univers/${id}/campagnes/${c.id}`}>
                {c.nom}
              </Link>
              {mj ? (
                <ListeStatut statut={c.statut} nom={c.nom} desactive={perdue} onChange={(s) => void changer(c, s)} />
              ) : (
                <BadgeStatut statut={c.statut} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default { chemin: '/univers/:id/campagnes', composant: ListeCampagnes } satisfies Ecran;
