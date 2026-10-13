import { useEffect, useId, useRef, useState } from 'react';

import { ErreurApi, appeler, lire } from '../../api';
import { useToasts } from '../../ui';

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
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const idListe = useId();
  const idAide = useId();
  const deja = useSousTypesEmployes(universId, type, edition);

  useEffect(() => {
    if (edition) champ.current?.focus();
  }, [edition]);

  if (!gestion) return sousType ? <span className="sous-type"> · {sousType}</span> : null;

  function ouvrir() {
    setValeur(sousType ?? '');
    setErreur(undefined);
    setEdition(true);
  }
  function fermer() {
    setEdition(false);
    queueMicrotask(() => declencheur.current?.focus());
  }

  async function enregistrer() {
    if (enCours) return;
    const v = valeur.trim();
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
        {' · '}
        <button
          ref={declencheur}
          type="button"
          className={`sous-type-bouton${sousType ? '' : ' vide'}`}
          title="Modifier le sous-type"
          onClick={ouvrir}
        >
          {sousType || 'Sous-type'}
        </button>
      </>
    );
  }
  return (
    <span className="sous-type-edition">
      {' · '}
      <input
        ref={champ}
        type="text"
        aria-label="Sous-type"
        aria-invalid={erreur ? true : undefined}
        aria-describedby={idAide}
        list={deja.length > 0 ? idListe : undefined}
        autoComplete="off"
        value={valeur}
        disabled={enCours}
        onChange={(e) => {
          setValeur(e.target.value);
          setErreur(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void enregistrer();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            fermer();
          }
        }}
      />
      {deja.length > 0 && (
        <datalist id={idListe} title={`Sous-types de ${libelleType.toLowerCase()} déjà employés`}>
          {deja.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      )}
      <small id={idAide} className={erreur ? 'erreur' : undefined} role={erreur ? 'alert' : undefined}>
        {erreur ?? 'Entrée enregistre · Échap annule · Champ vide : plus de sous-type'}
      </small>
    </span>
  );
}
