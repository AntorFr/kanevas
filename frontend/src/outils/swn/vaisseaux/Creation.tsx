import { useEffect, useMemo, useState } from 'react';

import { appeler, ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { Bouton, Champ, Fenetre } from '../../../ui';
import { requete } from './format';
import type { Conception, ElementCatalogue, PageCatalogue } from './types';

interface Membre { compteId: number; username: string; role: string }

/** « Nouvelle conception » (GM): the sheet, the hull, the author. Nothing is written before « Créer ». */
export function Creation({ universId, suffixe, fiches, onFermer, onCree }: {
  universId: number;
  suffixe: string;
  fiches: { ficheId: number; titre: string }[];
  onFermer: () => void;
  onCree: (ficheId: number) => void;
}) {
  const perdue = useConnexionPerdue();
  const [coques, setCoques] = useState<ElementCatalogue[] | null>(null);
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [echecLecture, setEchecLecture] = useState(false);
  const [fiche, setFiche] = useState(fiches[0] ? String(fiches[0].ficheId) : '');
  const [coque, setCoque] = useState('');
  const [filtre, setFiltre] = useState('');
  const [auteur, setAuteur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    const tout = async () => {
      const elements: ElementCatalogue[] = [];
      let curseur: string | undefined;
      do {
        const p = await lire<PageCatalogue>(`/api/univers/${universId}/outils/swn/vaisseaux/catalogue${requete(suffixe, { nature: 'coques', curseur })}`);
        elements.push(...p.elements);
        curseur = p.suivant ?? undefined;
      } while (curseur);
      return elements;
    };
    Promise.all([tout(), lire<Membre[]>(`/api/univers/${universId}/membres`)]).then(
      ([c, m]) => {
        if (!actif) return;
        // A masked hull is not offered: a new line cannot be a masked element (V-3).
        const offertes = c.filter((e) => !e.masque);
        setCoques(offertes);
        setMembres(m);
        if (offertes[0]) setCoque(offertes[0].cle);
      },
      () => actif && setEchecLecture(true),
    );
    return () => { actif = false; };
  }, [universId, suffixe]);

  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return (coques ?? []).filter((c) => !f || c.nom.toLowerCase().includes(f));
  }, [coques, filtre]);

  const charge = coques === null && !echecLecture;
  const sansFiche = fiches.length === 0;
  const sansCoque = coques !== null && coques.length === 0;
  const peutCreer = !charge && !sansFiche && !sansCoque && fiche !== '' && coque !== '' && !perdue && !enCours;

  async function creer() {
    if (!peutCreer) return;
    setEnCours(true);
    setErreur(null);
    try {
      const c = await appeler<Conception>('POST', `/api/univers/${universId}/outils/swn/vaisseaux/conceptions${requete(suffixe)}`, {
        ficheId: Number(fiche), coque, auteurId: auteur === '' ? null : Number(auteur),
      });
      onCree(c.ficheId);
    } catch (e) {
      setEnCours(false);
      if (e instanceof ErreurApi && e.statut === 0) setErreur('Connexion perdue.');
      else if (e instanceof ErreurApi && e.code === 'deja_concue') setErreur('Cette fiche a déjà une conception.');
      else setErreur('Impossible de créer la conception.');
    }
  }

  return (
    <Fenetre titre="Nouvelle conception" onFermer={onFermer}>
      <div className="vx-dialogue">
        {sansFiche ? (
          <p>Aucune fiche de vaisseau sans conception.</p>
        ) : (
          <Champ etiquette="Fiche" liste value={fiche} onChange={(e: { target: { value: string } }) => setFiche(e.target.value)} disabled={charge}>
            {fiches.map((f) => <option key={f.ficheId} value={f.ficheId}>{f.titre}</option>)}
          </Champ>
        )}
        {echecLecture && <p className="echec" role="alert">Impossible de charger le catalogue.</p>}
        {charge && <p role="status">Chargement…</p>}
        {sansCoque && <p>Le catalogue du système n&apos;a aucune coque.</p>}
        {coques && !sansCoque && (
          <>
            <Champ etiquette="Filtrer les coques" type="search" value={filtre} onChange={(e: { target: { value: string } }) => setFiltre(e.target.value)} />
            <Champ etiquette="Coque" liste value={coque} onChange={(e: { target: { value: string } }) => setCoque(e.target.value)}>
              {visibles.map((c) => <option key={c.cle} value={c.cle}>{c.nom}{c.univers || c.origine === 'univers' || c.origine === 'remplace' ? ' (Univers)' : ''}</option>)}
            </Champ>
          </>
        )}
        {membres && (
          <Champ etiquette="Auteur" liste value={auteur} onChange={(e: { target: { value: string } }) => setAuteur(e.target.value)}>
            <option value="">Personne</option>
            {membres.map((m) => <option key={m.compteId} value={m.compteId}>{m.username}</option>)}
          </Champ>
        )}
        {perdue && <p className="echec" role="status">Connexion perdue.</p>}
        {erreur && <p className="echec" role="alert">{erreur}</p>}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!peutCreer} enCours={enCours} onClick={() => void creer()}>Créer</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}
