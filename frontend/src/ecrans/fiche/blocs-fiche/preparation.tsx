import { useState, type FormEvent } from 'react';
import { Check, ListChecks, Plus, Undo2 } from 'lucide-react';

import { appeler, useConnexionPerdue } from '../../../api';
import { Bouton, Case, Champ, useToasts } from '../../../ui';
import { CATEGORIES, ECHEC, libelleCategorie, type Categorie, type Tache } from '../../suivi/commun';
import { CadreBlocFiche } from '../bloc-fiche';
import type { BlocFiche, PropsBlocFiche } from '../registre-blocs-fiche';
import { useBlocFiche } from './charge';

function Preparation({ universId, fiche }: PropsBlocFiche) {
  const base = `/api/univers/${universId}/fiches/${fiche.id}/taches`;
  const [etat, setEtat, recharger] = useBlocFiche<{ taches: Tache[] }>(base);
  const [libelle, setLibelle] = useState('');
  const [categorie, setCategorie] = useState<Categorie>('autre');
  const [erreurLibelle, setErreurLibelle] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [ajout, setAjout] = useState(false);
  const [cochage, setCochage] = useState<number>();
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const taches = etat.k === 'ok' ? etat.valeur.taches : [];
  const ouvertes = taches.filter((t) => !t.faite);
  const cochees = taches.filter((t) => t.faite)
    .sort((a, b) => (b.faiteLe ?? '').localeCompare(a.faiteLe ?? '') || b.id - a.id);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (ajout || perdue) return;
    const nom = libelle.trim();
    if (!nom) return setErreurLibelle('le libellé est obligatoire.');
    if (nom.length > 200) return setErreurLibelle('200 caractères au plus.');
    setErreurLibelle(undefined);
    setEchec(undefined);
    setAjout(true);
    try {
      const tache = await appeler<Tache>('POST', base, { categorie, libelle: nom });
      setEtat((e) => e.k === 'ok' ? { k: 'ok', valeur: { taches: [...e.valeur.taches, tache] } } : e);
      setLibelle('');
      toast(`« ${nom} » ajoutée`);
    } catch {
      setEchec(ECHEC);
    } finally { setAjout(false); }
  }

  async function cocher(t: Tache) {
    if (cochage !== undefined || perdue) return;
    setCochage(t.id);
    setEchec(undefined);
    try {
      const tache = await appeler<Tache>('PUT', `/api/taches/${t.id}`, { faite: !t.faite });
      setEtat((e) => e.k === 'ok' ? { k: 'ok', valeur: {
        taches: e.valeur.taches.map((ancienne) => ancienne.id === t.id ? tache : ancienne),
      } } : e);
      toast(`« ${t.libelle} » ${tache.faite ? 'cochée' : 'décochée'}`);
    } catch { setEchec(ECHEC); }
    finally { setCochage(undefined); }
  }

  return (
    <CadreBlocFiche titre="Préparation" icone={ListChecks} mj chargement={etat.k === 'chargement'} erreur={etat.k === 'erreur'} recharger={recharger}>
      {ouvertes.length === 0 && <p className="bloc-fiche-vide">Rien à préparer pour l'instant.</p>}
      {CATEGORIES.map((c) => {
        const groupe = ouvertes.filter((t) => t.categorie === c.valeur).sort((a, b) => a.id - b.id);
        return groupe.length > 0 && (
          <div key={c.valeur} className="categorie-fiche">
            <h3>{c.libelle}</h3>
            <ul>{groupe.map((t) => (
              <li key={t.id}>
                <Case etiquette={t.libelle} checked={false} disabled={perdue || cochage !== undefined} onChange={() => void cocher(t)} />
              </li>
            ))}</ul>
          </div>
        );
      })}
      {cochees.length > 0 && (
        <details className="cochees-fiche">
          <summary>Cochées ({cochees.length})</summary>
          <ul>{cochees.map((t) => (
            <li key={t.id} className="tache-cochee-fiche">
              <Check size={14} aria-hidden="true" />
              <span className="libelle">{t.libelle}</span>
              <span className="type">{libelleCategorie(t.categorie)}</span>
              <Bouton petit icone={Undo2} ecrit disabled={cochage !== undefined} aria-label={`Décocher ${t.libelle}`} onClick={() => void cocher(t)}>Décocher</Bouton>
            </li>
          ))}</ul>
        </details>
      )}
      {echec && <div className="echec" role="alert">{echec}</div>}
      <form className="ajout-tache-fiche" onSubmit={ajouter} noValidate>
        <Champ etiquette="Nouvelle tâche" value={libelle} erreur={erreurLibelle} disabled={ajout} onChange={(e: { target: { value: string } }) => setLibelle(e.target.value)} />
        <Champ etiquette="Catégorie" liste value={categorie} disabled={ajout} onChange={(e: { target: { value: Categorie } }) => setCategorie(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
        </Champ>
        <Bouton type="submit" icone={Plus} ecrit enCours={ajout}>Ajouter</Bouton>
      </form>
    </CadreBlocFiche>
  );
}

export default { id: 'preparation', types: ['aventure'], roles: ['mj'], rang: 10, composant: Preparation } satisfies BlocFiche;
