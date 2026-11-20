import { Map as IconeCarte, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { ErreurApi, appeler } from '../../api';
import { Bouton, BoiteDialogue, Champ, Fenetre } from '../../ui';
import type { CarteOutil } from './commun';

const MAX_TITRE = 80;
const MIN_CASES = 1;
const MAX_CASES = 200;

/** Where the composed-map routes live (the framework's creation and deletion routes of a tool map). */
const base = (universId: string) => `/api/univers/${universId}/outils/battlemap/cartes`;

/** Parses a size field: the message under the field, or the whole number (the server stays the judge of the limits). */
function lireTaille(texte: string): { valeur?: number; erreur?: string } {
  if (texte.trim() === '') return { erreur: 'la taille est obligatoire.' };
  const n = Number(texte);
  if (!Number.isInteger(n)) return { erreur: 'un nombre entier de cases.' };
  if (n < MIN_CASES) return { erreur: `${MIN_CASES} case au moins.` };
  if (n > MAX_CASES) return { erreur: `${MAX_CASES} cases au plus.` };
  return { valeur: n };
}

/** E-10 « Nouvelle carte ▸ Carte composée »: name and size in cells, then the editor (E-28) opens. */
export function NouvelleCarteComposee({ universId, onFermer, onCreee }: {
  universId: string;
  onFermer: () => void;
  /** Called with the address of the editor once the map exists. */
  onCreee: (adresse: string) => void;
}) {
  const [titre, setTitre] = useState('');
  const [largeur, setLargeur] = useState('30');
  const [hauteur, setHauteur] = useState('20');
  const [erreurs, setErreurs] = useState<{ titre?: string; largeur?: string; hauteur?: string }>({});
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEchec(undefined);
    const t = titre.trim();
    const l = lireTaille(largeur);
    const h = lireTaille(hauteur);
    const refus = {
      titre: t === '' ? 'le nom est obligatoire.' : t.length > MAX_TITRE ? `${MAX_TITRE} caractères au plus.` : undefined,
      largeur: l.erreur,
      hauteur: h.erreur,
    };
    setErreurs(refus);
    if (refus.titre || refus.largeur || refus.hauteur) return;
    setEnCours(true);
    try {
      const { id } = await appeler<{ id: number }>('POST', base(universId), { titre: t, largeur: l.valeur, hauteur: h.valeur });
      onCreee(`/univers/${universId}/outils/battlemap/cartes/${id}`);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 0) return;
      const champ = e instanceof ErreurApi ? (e.details?.champ as string | undefined) : undefined;
      if (e instanceof ErreurApi && e.statut === 400 && (champ === 'titre' || champ === 'largeur' || champ === 'hauteur')) {
        setErreurs({ [champ]: e.message.replace(/^Erreur : /, '') });
      } else {
        setEchec(e instanceof ErreurApi && e.statut === 404 ? 'Cet outil est désactivé.' : 'La carte n’a pas pu être créée. Réessayez.');
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre titre="Nouvelle carte composée" onFermer={onFermer} icone={IconeCarte}>
      <form className="carte-composee" onSubmit={creer} noValidate>
        {echec && <div className="echec" role="alert">{echec}</div>}
        <Champ etiquette="Nom" value={titre} erreur={erreurs.titre} maxLength={MAX_TITRE + 20}
          onChange={(e: { target: { value: string } }) => setTitre(e.target.value)} />
        <div className="carte-composee-taille">
          <Champ etiquette="Largeur (cases)" type="number" inputMode="numeric" value={largeur} erreur={erreurs.largeur}
            onChange={(e: { target: { value: string } }) => setLargeur(e.target.value)} />
          <Champ etiquette="Hauteur (cases)" type="number" inputMode="numeric" value={hauteur} erreur={erreurs.hauteur}
            onChange={(e: { target: { value: string } }) => setHauteur(e.target.value)} />
        </div>
        <div className="actions">
          <Bouton type="submit" variante="principal" icone={Plus} ecrit enCours={enCours}>Créer</Bouton>
          <Bouton icone={X} onClick={onFermer} disabled={enCours}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}

/** E-10 row menu « Supprimer… »: the name must be typed back before the map goes with its layers and elements. */
export function SupprimerCarteComposee({ universId, carte, onFermer, onSupprimee }: {
  universId: string;
  carte: CarteOutil;
  onFermer: () => void;
  onSupprimee: () => void;
}) {
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string>();

  async function supprimer() {
    if (enCours || saisie.trim() !== carte.titre) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      await appeler<unknown>('DELETE', `${base(universId)}/${carte.id}`);
      onSupprimee();
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) {
        onSupprimee(); // already gone, or no longer ours to delete: the list is re-read either way
      } else if (!(e instanceof ErreurApi && e.statut === 0)) {
        setEchec('La suppression n’a pas abouti. Réessayez.');
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <BoiteDialogue
      titre={`Supprimer « ${carte.titre} »`}
      texte="Cette carte sera supprimée avec ses calques, ses éléments, sa table de jeu et ses pions."
      action="Supprimer la carte"
      desactive={saisie.trim() !== carte.titre}
      enCours={enCours}
      libelleEnCours="Suppression…"
      onConfirmer={() => void supprimer()}
      onFermer={onFermer}
    >
      {echec && <div className="echec" role="alert">{echec}</div>}
      <Champ etiquette={`Saisissez « ${carte.titre} » pour confirmer`} value={saisie} autoComplete="off"
        onChange={(e: { target: { value: string } }) => setSaisie(e.target.value)} />
    </BoiteDialogue>
  );
}
