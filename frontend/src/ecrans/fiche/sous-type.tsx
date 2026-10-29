import { Check, Pencil } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { useToasts } from '../../ui';
import '../../ui/liste-liens.css';

export const MAX_SOUS_TYPE = 60;

/** The sub-types already used for a type in the universe (completion); a failure leaves the field free. */
export function useSousTypesEmployes(universId: string, type: string, actif = true): string[] {
  const [deja, setDeja] = useState<string[]>([]);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    setDeja([]);
    lire<{ sousTypes: { sousType: string }[] }>(`/api/univers/${universId}/sous-types?type=${type}`).then(
      (r) => vivant && setDeja(r.sousTypes.map((s) => s.sousType)),
      () => {},
    );
    return () => {
      vivant = false;
    };
  }, [universId, type, actif]);
  return deja;
}

/**
 * The sub-type in the badge (E-9, B-52). Everyone reads it as text (nothing when the sheet has none);
 * the GM outside player mode edits it in place: Enter saves, Escape cancels, an empty field removes it.
 */
export function SousTypeBadge({
  universId,
  ficheId,
  type,
  libelleType,
  sousType,
  gestion,
  rafraichir,
  onDroitPerdu,
}: {
  universId: string;
  ficheId: number;
  type: string;
  /** « Lieu », for the title of the completion list. */
  libelleType: string;
  sousType: string | null | undefined;
  gestion: boolean;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
}) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const idListe = useId();
  const [actif, setActif] = useState(-1);
  const tous = useSousTypesEmployes(universId, type, edition);
  const q = valeur.trim().toLocaleLowerCase('fr');
  const deja = tous.filter((x) => !q || x.toLocaleLowerCase('fr').includes(q));

  useEffect(() => {
    if (edition) champ.current?.focus();
  }, [edition]);

  if (!gestion) return sousType ? <span className="sous-type"> · {sousType}</span> : null;

  function ouvrir() {
    setValeur(sousType ?? '');
    setErreur(undefined);
    setActif(-1);
    setEdition(true);
  }
  function fermer() {
    setEdition(false);
    queueMicrotask(() => declencheur.current?.focus());
  }

  async function enregistrer(choix?: string) {
    if (enCours) return;
    const v = (choix ?? valeur).trim();
    if (Array.from(v).length > MAX_SOUS_TYPE) return setErreur(`Erreur : ${MAX_SOUS_TYPE} caractères au plus.`);
    if (v === (sousType ?? '')) return fermer();
    setEnCours(true);
    setErreur(undefined);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${ficheId}`, { sousType: v === '' ? null : v });
      await rafraichir();
      setEdition(false);
      toast(v === '' ? 'Sous-type retiré.' : 'Sous-type enregistré.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 403) {
        setEdition(false);
        onDroitPerdu();
      } else {
        setErreur('Le sous-type n’a pas été enregistré. Réessayez.');
      }
    } finally {
      setEnCours(false);
    }
  }

  if (!edition) {
    return (
      <>
        <span className="point-type" aria-hidden="true"> · </span>
        <button
          ref={declencheur}
          type="button"
          className={`sous-type-bouton${sousType ? '' : ' vide'}`}
          aria-label={sousType ? `Sous-type : ${sousType}. Modifier le sous-type` : 'Ajouter un sous-type'}
          disabled={perdue}
          onClick={ouvrir}
        >
          {sousType || 'Sous-type'}
          <Pencil size={12} strokeWidth={1.75} className="crayon" aria-hidden="true" />
        </button>
      </>
    );
  }
  const trop = Array.from(valeur.trim()).length > MAX_SOUS_TYPE;
  return (
    <span className="sous-type-edition">
      <span aria-hidden="true"> · </span>
      <input
        ref={champ}
        type="text"
        role="combobox"
        aria-label="Sous-type"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={idListe}
        aria-activedescendant={actif >= 0 ? `${idListe}-${actif}` : undefined}
        aria-invalid={erreur ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        value={valeur}
        disabled={enCours}
        onChange={(e) => {
          setValeur(e.target.value);
          setActif(-1);
          setErreur(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (deja.length === 0) return;
            const pas = e.key === 'ArrowDown' ? 1 : -1;
            setActif((actif + pas + deja.length) % deja.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void enregistrer(actif >= 0 ? deja[actif] : undefined);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            fermer();
          }
        }}
      />
      <span className="liste-liens liste-st" id={idListe} role="listbox" aria-label={`Sous-types de ${libelleType.toLowerCase()} déjà employés`}>
        {deja.length > 0 && (
          <span className="titre-menu" aria-hidden="true">
            Sous-types de {libelleType.toLowerCase()} déjà employés
          </span>
        )}
        {deja.map((x, i) => (
          <span
            key={x}
            id={`${idListe}-${i}`}
            role="option"
            className="option"
            aria-selected={i === actif}
            onMouseDown={(e) => {
              e.preventDefault();
              void enregistrer(x);
            }}
          >
            {x}
            {x === sousType && <Check size={14} strokeWidth={1.75} className="coche" aria-label="sous-type actuel" />}
          </span>
        ))}
        <span className={`pied-st${erreur || trop ? ' erreur' : ''}`} role={erreur ? 'alert' : undefined}>
          {erreur ?? (trop ? `Erreur : ${MAX_SOUS_TYPE} caractères au plus.` : 'Entrée enregistre · Échap annule · Champ vide : plus de sous-type')}
        </span>
      </span>
    </span>
  );
}
