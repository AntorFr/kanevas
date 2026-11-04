import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { typeParType, useTypes } from '../../types-contexte';
import { Alerte, BoiteDialogue, Bouton, useToasts } from '../../ui';
import type { FicheVue } from './types';

interface Bilan {
  sections: number;
  relations: number;
  places: number;
  fichiers: number;
  enfants: number;
  parent: { id: number; titre: string } | null;
  /** An adventure only, counted by the server (AD-119). */
  taches?: number;
  scenarios?: number;
  comptesRendus?: number;
}

/** Only non-empty posts are announced; files stay in the library (AD-119). */
function texteBilan(b: Bilan): string {
  const postes: string[] = [];
  if (b.sections) postes.push(`${b.sections} section${b.sections > 1 ? 's' : ''}`);
  if (b.relations) postes.push(`${b.relations} relation${b.relations > 1 ? 's qui la visent' : ' qui la vise'}`);
  if (b.places) postes.push(`${b.places} place${b.places > 1 ? 's sur des cartes' : ' sur une carte'}`);
  if (b.taches) postes.push(`${b.taches} tâche${b.taches > 1 ? 's' : ''} de préparation supprimée${b.taches > 1 ? 's' : ''}`);
  const phrases: string[] = postes.length ? [`${postes.join(' ; ')}.`] : [];
  if (b.fichiers) phrases.push(b.fichiers === 1 ? 'Son fichier reste dans la médiathèque.' : `Ses ${b.fichiers} fichiers restent dans la médiathèque.`);
  const autres = b.enfants - (b.scenarios ?? 0); // scenarios have their own line
  if (autres > 0) {
    const destination = b.parent ? `sous « ${b.parent.titre} »` : 'à la racine de la liste du type';
    phrases.push(autres === 1 ? `Son enfant remontera ${destination}.` : `Ses ${autres} enfants remonteront ${destination}.`);
  }
  if (b.scenarios) phrases.push(b.scenarios === 1 ? '1 scénario passe à la racine.' : `${b.scenarios} scénarios passent à la racine.`);
  if (b.comptesRendus) phrases.push(b.comptesRendus === 1 ? '1 compte-rendu restera sans aventure.' : `${b.comptesRendus} comptes-rendus resteront sans aventure.`);
  if (!phrases.length) phrases.push("Cette fiche ne porte rien d'autre.");
  phrases.push('Les liens qui la visent deviendront des liens cassés.');
  return phrases.join(' ');
}

/** E-9: reuse the shared destructive dialog, fetching the balance at each opening. */
export function SupprimerFiche({ universId, fiche, onFermer, onDroitPerdu, onIntrouvable }: {
  universId: string;
  fiche: FicheVue;
  onFermer: () => void;
  onDroitPerdu: () => void;
  onIntrouvable: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToasts();
  const { types } = useTypes();
  const perdue = useConnexionPerdue();
  const [bilan, setBilan] = useState<Bilan>();
  const [erreurLecture, setErreurLecture] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);
  const base = `/api/univers/${universId}/fiches/${fiche.id}`;

  useEffect(() => {
    let actif = true;
    setErreurLecture(false);
    lire<Bilan>(`${base}/suppression`).then(
      (b) => { if (actif) setBilan(b); },
      (e) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) onIntrouvable();
        else setErreurLecture(true);
      },
    );
    return () => { actif = false; };
  }, [base, essai, onIntrouvable]);

  async function supprimer() {
    if (!bilan || verrou.current || perdue) return;
    verrou.current = true;
    setEnCours(true);
    setErreur(undefined);
    try {
      await appeler('DELETE', base);
      const destination = fiche.type === 'compte_rendu' ? 'comptes-rendus' : `fiches/${typeParType(types, fiche.type)!.slug}`;
      navigate(`/univers/${universId}/${destination}`);
      toast('Fiche supprimée.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) onIntrouvable();
      else if (e instanceof ErreurApi && e.statut === 403) {
        onFermer();
        onDroitPerdu();
      } else setErreur("L'action n'a pas abouti. Réessayez.");
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <BoiteDialogue
      titre={`Supprimer « ${fiche.titre} » ?`}
      texte={bilan ? texteBilan(bilan) : <span role={erreurLecture ? 'alert' : 'status'}>{erreurLecture ? 'Impossible de charger le détail.' : 'Chargement…'}</span>}
      action="Supprimer la fiche"
      libelleEnCours="Suppression…"
      desactive={!bilan}
      enCours={enCours}
      onConfirmer={() => void supprimer()}
      onFermer={() => { if (!verrou.current) onFermer(); }}
      reperage={() => document.getElementById('titre-fiche')}
    >
      {erreurLecture && <Bouton onClick={() => setEssai((n) => n + 1)}>Réessayer</Bouton>}
      {erreur && <Alerte>{erreur}</Alerte>}
    </BoiteDialogue>
  );
}
