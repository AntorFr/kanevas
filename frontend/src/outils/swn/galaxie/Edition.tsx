import { CircleDashed } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { ErreurApi, lire } from '../../../api';
import { BoiteDialogue, Bouton, Champ, useToasts } from '../../../ui';
import { ancrerSysteme, poserTransitionSysteme, type JetonSysteme, type Place } from './ecriture';
import type { InterieurSysteme as Interieur } from './types';

/**
 * E-23, the GM's writes (AD-edition-1, AD-edition-2). The provider holds the interior as the last answer gave it and exposes
 * `avecAncrage(geste)`: the one door of every write — a defined system runs the gesture at once; a drawn one first opens
 * « Ancrer ce système ? », and the gesture leaves in the same request as the anchoring (one transaction) once « Ancrer » is
 * pressed; « Annuler » sends nothing. Nothing here is rendered for who may not write (`peutEcrire` absent).
 */

/** A gesture: the write that takes the token (and, if the system is drawn, the name of the anchoring). */
export type Geste = (jeton: JetonSysteme) => Promise<Interieur>;

export interface EchecEdition {
  sorte: 'conflit' | 'inconnu' | 'refus' | 'champ' | 'perdu' | 'autre';
  message: string;
  /** « Recharger » rereads the system. */
  recharger?: boolean;
}

export const MESSAGES = {
  conflit: 'Cet astre a changé depuis que vous l’avez ouvert.',
  inconnu: 'Cet astre n’existe plus.',
  refus: 'Vous ne pouvez plus modifier ce système.',
  orbite: 'Orbite invalide.',
  etoile: 'L’étoile principale ne peut pas être retirée.',
  erreur: 'Impossible d’enregistrer.',
  perdu: 'Connexion perdue.',
} as const;

/** What a refused write says, in the words of docs/ecrans.md. */
export function lireEchecEdition(e: unknown): EchecEdition {
  if (!(e instanceof ErreurApi)) return { sorte: 'autre', message: MESSAGES.erreur };
  if (e.statut === 0) return { sorte: 'perdu', message: MESSAGES.perdu };
  if (e.code === 'a_change') return { sorte: 'conflit', message: MESSAGES.conflit, recharger: true };
  if (e.code === 'astre_inconnu') return { sorte: 'inconnu', message: MESSAGES.inconnu, recharger: true };
  if (e.code === 'orbite_invalide') return { sorte: 'champ', message: MESSAGES.orbite };
  if (e.code === 'etoile_principale') return { sorte: 'champ', message: MESSAGES.etoile };
  if (e.statut === 403) return { sorte: 'refus', message: MESSAGES.refus };
  if (e.statut === 400 || e.statut === 413) return { sorte: 'champ', message: e.message };
  return { sorte: 'autre', message: MESSAGES.erreur };
}

/** The message of a failure inside a dialog, with « Recharger » or « Réessayer » when it has one. */
export function MessageEchec({ echec, onRecharger, onReessayer }: { echec: EchecEdition; onRecharger: () => void; onReessayer?: () => void }) {
  return (
    <div className="ed-echec">
      <p className="echec" role="alert">{echec.message}</p>
      {echec.recharger && <Bouton petit onClick={onRecharger}>Recharger</Bouton>}
      {echec.sorte === 'autre' && onReessayer && <Bouton petit onClick={onReessayer}>Réessayer</Bouton>}
    </div>
  );
}

interface Contexte {
  /** The interior as the last answer gave it. */
  interieur: Interieur;
  peutEcrire: boolean;
  /** The anchoring dialog is on screen: another dialog stands aside (one focus trap at a time). */
  ancrageOuvert: boolean;
  /** Runs `geste`, the anchoring dialog first on a drawn system. `null`: « Annuler ». A defined system's failure is thrown. */
  avecAncrage: (geste: Geste) => Promise<Interieur | null>;
  /** « Ancrer » alone (the menu entry; the first step of « Retirer »). On a defined system it answers it unchanged. */
  ancrer: () => Promise<Interieur | null>;
  /** Rereads the system (« Recharger »). */
  recharger: () => Promise<void>;
  /** Adopts the answer of a write. */
  adopter: (i: Interieur) => void;
  /** Where the writes go (the ids of the address). */
  place: Place;
}
const Ctx = createContext<Contexte | null>(null);

export function useEdition(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEdition outside FournisseurEdition');
  return c;
}

interface Demande { geste: Geste | null; fini: (i: Interieur | null) => void }

export function FournisseurEdition({ initial, base, suffixe, children }: { initial: Interieur; base: string; suffixe: string; children: ReactNode }) {
  const [interieur, setInterieur] = useState(initial);
  const courant = useRef(initial);
  const adopter = useCallback((i: Interieur) => { courant.current = i; setInterieur(i); }, []);
  const [demande, setDemande] = useState<Demande | null>(null);

  const recharger = useCallback(async () => {
    const i = courant.current;
    try {
      adopter(await lire<Interieur>(`${base}/interieur/${i.q}/${i.r}${suffixe}`));
    } catch (e) {
      // The system is gone (« Ce système n'existe plus. »): the page reads again and answers for itself.
      if (e instanceof ErreurApi && e.statut === 404 && typeof window !== 'undefined') window.location.reload();
      throw e;
    }
  }, [base, suffixe, adopter]);

  const place = useMemo(() => {
    const m = /\/galaxies\/(\d+)$/.exec(base);
    const u = /\/api\/univers\/(\d+)\//.exec(base);
    return { universId: Number(u?.[1]), galaxieId: Number(m?.[1]), q: interieur.q, r: interieur.r };
  }, [base, interieur.q, interieur.r]);

  const avecAncrage = useCallback((geste: Geste): Promise<Interieur | null> => {
    const i = courant.current;
    if (i.etat === 'defini') return geste({ versionSysteme: i.versionSysteme }).then((r) => { adopter(r); return r; });
    return new Promise((fini) => setDemande({ geste, fini }));
  }, [adopter]);

  const ancrer = useCallback((): Promise<Interieur | null> => {
    const i = courant.current;
    if (i.etat === 'defini') return Promise.resolve(i);
    return new Promise((fini) => setDemande({ geste: null, fini }));
  }, []);

  const valeur = useMemo<Contexte>(() => ({
    interieur, peutEcrire: interieur.peutEcrire === true, ancrageOuvert: demande !== null, avecAncrage, ancrer, recharger, adopter, place,
  }), [interieur, demande, avecAncrage, ancrer, recharger, adopter, place]);

  return (
    <Ctx.Provider value={valeur}>
      {children}
      {demande && (
        <DialogueAncrage
          interieur={interieur}
          place={place}
          demande={demande}
          adopter={adopter}
          recharger={recharger}
          onFini={(r) => { demande.fini(r); setDemande(null); }}
        />
      )}
    </Ctx.Provider>
  );
}

const NOM_MAX = 80;

/** « Ancrer ce système ? » (E-23): the name is optional; the gesture, if any, leaves with « Ancrer ». */
function DialogueAncrage({ interieur, place, demande, adopter, recharger, onFini }: {
  interieur: Interieur; place: Place;
  demande: Demande; adopter: (i: Interieur) => void; recharger: () => Promise<void>; onFini: (i: Interieur | null) => void;
}) {
  const { toast } = useToasts();
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const trop = [...nom].length > NOM_MAX;

  async function ancrer() {
    if (enCours || trop) return;
    setEnCours(true);
    setEchec(undefined);
    const nomAncrage = nom.trim() === '' ? undefined : nom.trim();
    try {
      const r = demande.geste
        ? await demande.geste({ versionSysteme: interieur.versionSysteme, nomAncrage })
        : await ancrerSysteme(place, { versionSysteme: interieur.versionSysteme, nom: nomAncrage });
      adopter(r);
      toast('Système ancré.');
      onFini(r);
    } catch (e) {
      const f = lireEchecEdition(e);
      setEchec(f);
      if (f.sorte === 'refus') { toast(f.message); onFini(null); }
    } finally {
      setEnCours(false);
    }
  }
  return (
    <BoiteDialogue
      variante="neutre"
      formulaire
      titre="Ancrer ce système ?"
      texte="L’intérieur de ce système sera figé tel que vous le voyez ; les réglages du générateur ne le changeront plus."
      action="Ancrer"
      libelleEnCours="Ancrage…"
      enCours={enCours}
      desactive={trop}
      onConfirmer={() => void ancrer()}
      onFermer={() => { if (!enCours) onFini(null); }}
    >
      <Champ
        etiquette="Nom du système"
        facultatif
        value={nom}
        placeholder={`Système (${interieur.q}, ${interieur.r})`}
        autoComplete="off"
        compteur={`${[...nom].length} / ${NOM_MAX}`}
        trop={trop}
        erreur={trop ? `${NOM_MAX} caractères au plus.` : undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNom(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void ancrer(); } }}
      />
      {echec && (
        <MessageEchec echec={echec} onReessayer={() => void ancrer()}
          onRecharger={() => { void recharger().finally(() => onFini(null)); }} />
      )}
    </BoiteDialogue>
  );
}

/** Fallback shown only when the answer carries no radius; the real default is the core's, computed from the farthest body. */
export const TRANSITION_DEFAUT = 12;
const TRANSITION_MAX = 1000;

/** Reads the radius field: a number from 0 to 1 000, else the words of the bound or « Nombre attendu. ». */
export function lireRayon(texte: string): { valeur?: number; erreur?: string } {
  const t = texte.trim().replace(',', '.');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return { erreur: 'Nombre attendu.' };
  const v = Number(t);
  if (v < 0 || v > TRANSITION_MAX) return { erreur: 'Entre 0 et 1 000.' };
  return { valeur: v };
}

/** « Rayon de transition » (E-23): opens at once; the anchoring dialog, if the system is drawn, comes at « Enregistrer ». */
export function DialogueRayon({ onFermer }: { onFermer: () => void }) {
  const { interieur, avecAncrage, ancrageOuvert, recharger, place } = useEdition();
  const { toast } = useToasts();
  const [texte, setTexte] = useState(String(interieur.transition ?? TRANSITION_DEFAUT).replace('.', ','));
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const lu = lireRayon(texte);
  const [touche, setTouche] = useState(false);

  async function envoyer(transition: number | null) {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      const r = await avecAncrage((jeton) => poserTransitionSysteme(place, { ...jeton, transition }));
      if (r) { toast('Enregistré.'); onFermer(); }
    } catch (e) {
      const f = lireEchecEdition(e);
      setEchec(f);
      if (f.sorte === 'refus') { toast(f.message); onFermer(); }
    } finally {
      setEnCours(false);
    }
  }
  // The anchoring dialog stands over this one; this one is shown again, as typed, if « Annuler ».
  if (ancrageOuvert) return null;
  const erreur = touche || texte !== '' ? lu.erreur : undefined;
  return (
    <BoiteDialogue
      variante="mj"
      icone={CircleDashed}
      formulaire
      focusChamp
      titre="Rayon de transition"
      texte="Le cercle pointillé où naissent les sorties vers les systèmes voisins, en unités d’orbite."
      action="Enregistrer"
      libelleEnCours="Enregistrement…"
      enCours={enCours}
      desactive={lu.erreur !== undefined}
      onConfirmer={() => void envoyer(lu.valeur ?? null)}
      onFermer={() => { if (!enCours) onFermer(); }}
    >
      <Champ
        etiquette="Rayon"
        inputMode="decimal"
        autoComplete="off"
        value={texte}
        erreur={erreur}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setTexte(e.target.value); setTouche(true); }}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && lu.valeur !== undefined) { e.preventDefault(); void envoyer(lu.valeur); } }}
      />
      <p className="gx-note">Par défaut : calculé selon le corps le plus éloigné du système.</p>
      <Bouton petit disabled={enCours} onClick={() => { void envoyer(null); }}>Revenir au défaut</Bouton>
      {echec && <MessageEchec echec={echec} onReessayer={() => void envoyer(lu.valeur ?? null)} onRecharger={() => { void recharger().finally(onFermer); }} />}
    </BoiteDialogue>
  );
}
