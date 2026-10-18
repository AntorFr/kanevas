import { Tags, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { Bouton, Champ, Fenetre, useToasts } from '../../ui';
import type { FicheVue } from './types';

export const MAX_ALIAS = 20;
export const MAX_ETIQUETTES = 20;
export const LONGUEUR_ALIAS = 120;
export const LONGUEUR_ETIQUETTE = 40;
const ECHEC = 'L’action n’a pas abouti. Réessayez.';

const cle = (s: string) => s.toLocaleLowerCase('fr');
const longueur = (s: string) => Array.from(s).length;

/**
 * Adds `texte` to `liste` (E-9 box rules): trimmed, empty ignored, a duplicate without case ignored.
 * Returns the new list or the refusal to show; pure.
 */
export function ajouterPastille(
  liste: string[],
  texte: string,
  max: number,
  longueurMax: number,
  quoi: string,
): { liste: string[]; erreur?: string } {
  const t = texte.trim();
  if (t === '' || liste.some((x) => cle(x) === cle(t))) return { liste };
  if (longueur(t) > longueurMax) return { liste, erreur: `${longueurMax} caractères au plus.` };
  if (liste.length >= max) return { liste, erreur: `${max} ${quoi} au plus.` };
  return { liste: [...liste, t] };
}

/** The refusal codes of `PUT …/etiquetage` (AD-118), in the words of the interface. */
export function messageRefus(code: string | undefined): string | undefined {
  switch (code) {
    case 'alias_trop_nombreux':
      return `Erreur : ${MAX_ALIAS} alias au plus.`;
    case 'etiquettes_trop_nombreuses':
      return `Erreur : ${MAX_ETIQUETTES} étiquettes au plus.`;
    case 'alias_trop_long':
      return `Erreur : ${LONGUEUR_ALIAS} caractères au plus.`;
    case 'etiquette_trop_longue':
      return `Erreur : ${LONGUEUR_ETIQUETTE} caractères au plus.`;
    default:
      return undefined;
  }
}

function ChampPastilles({
  etiquette,
  valeurs,
  onChange,
  max,
  longueurMax,
  quoi,
  propositions,
  autoFocus,
}: {
  etiquette: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
  max: number;
  longueurMax: number;
  quoi: string;
  propositions?: string[];
  autoFocus?: boolean;
}) {
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string>();
  const idListe = useId();

  function valider() {
    if (saisie.trim() === '') return;
    const r = ajouterPastille(valeurs, saisie, max, longueurMax, quoi);
    setErreur(r.erreur);
    if (r.erreur) return;
    onChange(r.liste);
    setSaisie('');
  }

  function touche(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    // Enter adds the pill; it never submits the box.
    e.preventDefault();
    valider();
  }

  return (
    <div className="champ-pastilles">
      <Champ
        etiquette={etiquette}
        value={saisie}
        autoFocus={autoFocus}
        autoComplete="off"
        erreur={erreur}
        list={propositions && propositions.length > 0 ? idListe : undefined}
        onKeyDown={touche}
        onChange={(e: { target: { value: string } }) => {
          setSaisie(e.target.value);
          setErreur(undefined);
        }}
        onBlur={valider}
      />
      {propositions && propositions.length > 0 && (
        <datalist id={idListe}>
          {propositions
            .filter((p) => !valeurs.some((v) => cle(v) === cle(p)))
            .map((p) => (
              <option key={p} value={p} />
            ))}
        </datalist>
      )}
      {valeurs.length > 0 && (
        <ul className="pastilles-saisies" aria-label={`${etiquette} saisis`}>
          {valeurs.map((v) => (
            <li key={v} className="pastille neutre">
              <span className="texte-pastille" title={v}>
                {v}
              </span>
              <button type="button" aria-label={`Retirer « ${v} »`} onClick={() => onChange(valeurs.filter((x) => x !== v))}>
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** E-9 « Alias et étiquettes… »: both lists replaced at once (AD-118), GM outside player mode. */
export function BoiteEtiquetage({
  universId,
  fiche,
  onFermer,
  rafraichir,
  onDroitPerdu,
}: {
  universId: string;
  fiche: FicheVue;
  onFermer: () => void;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
}) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const [alias, setAlias] = useState<string[]>(fiche.alias ?? []);
  const [etiquettes, setEtiquettes] = useState<string[]>(fiche.etiquettes ?? []);
  const [propositions, setPropositions] = useState<string[]>([]);
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    lire<{ nom: string }[]>(`/api/univers/${universId}/etiquettes`).then(
      (l) => actif && setPropositions(l.map((e) => e.nom)),
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [universId]);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (enCours || perdue) return;
    setRefus(undefined);
    setEnCours(true);
    try {
      await appeler('PUT', `/api/univers/${universId}/fiches/${fiche.id}/etiquetage`, { alias, etiquettes });
      await rafraichir();
      toast('Alias et étiquettes enregistrés.');
      onFermer();
    } catch (err) {
      setEnCours(false);
      if (err instanceof ErreurApi && err.statut === 403) {
        onFermer();
        onDroitPerdu();
      } else {
        setRefus((err instanceof ErreurApi && err.statut === 400 ? messageRefus(err.code) : undefined) ?? ECHEC);
      }
    }
  }

  return (
    <Fenetre titre={`Alias et étiquettes de « ${fiche.titre} »`} onFermer={onFermer} icone={Tags}>
      <form className="boite-etiquetage" onSubmit={enregistrer} noValidate>
        {refus && (
          <div className="echec" role="alert">
            {refus}
          </div>
        )}
        <ChampPastilles
          etiquette="Alias"
          valeurs={alias}
          onChange={setAlias}
          max={MAX_ALIAS}
          longueurMax={LONGUEUR_ALIAS}
          quoi="alias"
          autoFocus
        />
        <ChampPastilles
          etiquette="Étiquettes"
          valeurs={etiquettes}
          onChange={setEtiquettes}
          max={MAX_ETIQUETTES}
          longueurMax={LONGUEUR_ETIQUETTE}
          quoi="étiquettes"
          propositions={propositions}
        />
        <div className="actions">
          <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={perdue}>
            Enregistrer
          </Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
