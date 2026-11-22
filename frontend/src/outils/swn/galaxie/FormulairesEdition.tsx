import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useConnexionPerdue } from '../../../api';
import { catalogueAspects, galactiqueVersOrbiteHeure, orbiteHeureVersPlan, planVersOrbiteHeure, typesAstre } from '../../../wasm/coeur';
import { BoiteDialogue, Bouton, Champ, LigneConversion, Segments, useToasts } from '../../../ui';
import { dessineurDuCoeur } from './carte-sprites';
import {
  DESCRIPTION_COMPTEUR, DESCRIPTION_MAX, NOM_MAX, PAR_DEFAUT, PERSONNALISE, aspectApercu, aspectPreregle, champsAnneau, champsNuage, convertir,
  descriptionDe, lireGraine, lireHeure, lireNombre, lireOrbite, lireTaille, ligneConversion, nomsPreregles, orbiteParDefaut, parametresAnneau,
  parametresNuage, parametresZoneParDefaut, presetDe, texteNombre, type Aspect, type ChampsAnneau, type ChampsNuage, type Conversion,
  type ConvertisseurCoeur, type Repere,
} from './edition-logique';
import { MessageEchec, TRANSITION_DEFAUT, lireEchecEdition, useEdition, type EchecEdition, type Geste } from './Edition';
import { ajouterAstreSysteme, ajouterZoneSysteme, modifierAstreSysteme, modifierZoneSysteme } from './ecriture';
import { libelleType, nomAstre, nomFormation, placeAstre, typeAstre } from './systeme-libelles';
import type { AstreSysteme, FormationSysteme, InterieurSysteme } from './types';

/**
 * E-23, the forms of `-formulaires`: « Déplacer <nom> » and « Modifier <nom> » replace the panel; « Ajouter un astre » and
 * « Ajouter une zone » are dialogs. Each saves through `avecAncrage` (the anchoring dialog comes first on a drawn system).
 * The core converts in the browser for the line « = Orbite 4 · 7 h »; the server converts again and stores orbit and hour only.
 */

const COEUR: ConvertisseurCoeur = { planVersOrbiteHeure, galactiqueVersOrbiteHeure };

/** True once the core answered, false if it cannot load, null while it loads. */
export function useCoeurPret(): boolean | null {
  const [pret, setPret] = useState<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    typesAstre('planete').then(() => vivant && setPret(true), () => vivant && setPret(false));
    return () => { vivant = false; };
  }, []);
  return pret;
}

type Catalogue = Record<string, Aspect>;
/** The default aspect of each type, from the core (`{}` while it loads or if it is absent). */
function useCatalogue(): Catalogue {
  const [c, setC] = useState<Catalogue>({});
  useEffect(() => {
    let vivant = true;
    catalogueAspects().then((j) => { if (vivant) setC((JSON.parse(j) as { types: Catalogue }).types); }, () => undefined);
    return () => { vivant = false; };
  }, []);
  return c;
}
/** The types a genre may take, from the core (empty while it loads). */
function useTypes(genre: string): string[] {
  const [t, setT] = useState<string[]>([]);
  useEffect(() => {
    let vivant = true;
    typesAstre(genre).then((l) => vivant && setT(l), () => vivant && setT([]));
    return () => { vivant = false; };
  }, [genre]);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// The send: one hook for every form (saving, failure, anchoring)

export interface Envoi {
  enCours: boolean;
  echec: EchecEdition | undefined;
  /** A conflict or an unknown body blocks « Enregistrer » until « Recharger ». */
  bloque: boolean;
  envoyer: (geste: Geste, apres: (i: InterieurSysteme) => void, ok: string | ((i: InterieurSysteme) => string)) => Promise<void>;
  effacer: () => void;
}

export function useEnvoi(onFermer: () => void, lecteur: (e: unknown) => EchecEdition = lireEchecEdition): Envoi {
  const { avecAncrage } = useEdition();
  const { toast } = useToasts();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);
  async function envoyer(geste: Geste, apres: (i: InterieurSysteme) => void, ok: string | ((i: InterieurSysteme) => string)) {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      const r = await avecAncrage(geste);
      if (r) { toast(typeof ok === 'string' ? ok : ok(r)); apres(r); }
    } catch (e) {
      const f = lecteur(e);
      if (f.sorte === 'refus') { toast(f.message); onFermer(); return; }
      if (vivant.current) setEchec(f);
    } finally {
      if (vivant.current) setEnCours(false);
    }
  }
  const bloque = echec?.recharger === true;
  return { enCours, echec, bloque, envoyer, effacer: () => setEchec(undefined) };
}

/** The failure line of a form: « Recharger » rereads the system (and closes the form if the body is gone). */
export function EchecForm({ envoi, onReessayer, onFermer }: { envoi: Envoi; onReessayer: () => void; onFermer: () => void }) {
  const { recharger } = useEdition();
  if (!envoi.echec) return null;
  const inconnu = envoi.echec.sorte === 'inconnu';
  return (
    <MessageEchec echec={envoi.echec} onReessayer={onReessayer}
      onRecharger={() => { void recharger().then(() => { envoi.effacer(); if (inconnu) onFermer(); }).catch(() => undefined); }} />
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The place: three repères, one converted line

const REPERES = [{ valeur: 'orbite', libelle: 'Orbite et heure' }, { valeur: 'plan', libelle: 'Plan' }, { valeur: 'hexagone', libelle: 'Hexagone' }] as const;
const REPERES_LUNE = [{ valeur: 'orbite', libelle: 'Orbite et heure' }] as const;

interface EtatPlace {
  repere: Repere; a: string; b: string; touche: boolean;
}
export interface Place {
  etat: EtatPlace;
  setRepere: (r: Repere) => void;
  setA: (v: string) => void;
  setB: (v: string) => void;
  conversion: Conversion | null;
  /** The errors under the first and the second field. */
  erreurA?: string; erreurB?: string;
  pret: boolean;
  /** What the request carries for the place (`orbite` and `heure`, `plan` or `galactique`). */
  corps: () => Record<string, unknown>;
}

/** The state of the place fields and its conversion; `lune`: orbit and hour only. */
export function usePlace(orbite: number, heure: number, coeurPret: boolean | null): Place {
  const { interieur } = useEdition();
  const rayon = interieur.transition ?? TRANSITION_DEFAUT;
  const [etat, setEtat] = useState<EtatPlace>({ repere: 'orbite', a: texteNombre(orbite), b: texteNombre(heure), touche: false });
  const [conversion, setConversion] = useState<Conversion | null>(null);
  // Orbit and hour need no core; the two other repères do (and, without it, are not offered).
  useEffect(() => {
    let vivant = true;
    if (etat.repere !== 'orbite' && coeurPret === null) { setConversion(null); return; }
    convertir(etat.repere, etat.a, etat.b, { q: interieur.q, r: interieur.r }, rayon, COEUR).then((c) => vivant && setConversion(c));
    return () => { vivant = false; };
  }, [etat.repere, etat.a, etat.b, interieur.q, interieur.r, rayon, coeurPret]);

  const setRepere = (repere: Repere) => {
    // Bring the current place into the repère chosen: the plane by the core, the hexagon starts empty.
    if (repere === 'orbite') { setEtat({ repere, a: texteNombre(orbite), b: texteNombre(heure), touche: false }); return; }
    if (repere === 'hexagone') { setEtat({ repere, a: '', b: '', touche: false }); return; }
    const o = conversion?.ok ? conversion.orbite : orbite, h = conversion?.ok ? conversion.heure : heure;
    setEtat({ repere, a: '', b: '', touche: false });
    orbiteHeureVersPlan(o, h).then(([x, y]) => setEtat((e) => (e.repere === 'plan' && e.a === '' && e.b === '' ? { ...e, a: texteNombre(Math.round(x * 100) / 100), b: texteNombre(Math.round(y * 100) / 100) } : e)), () => undefined);
  };
  const montre = etat.touche || etat.a !== '' || etat.b !== '';
  let erreurA: string | undefined, erreurB: string | undefined;
  if (etat.repere === 'orbite') {
    erreurA = lireOrbite(etat.a).erreur;
    erreurB = lireHeure(etat.b).erreur;
  } else {
    erreurA = lireNombre(etat.a).erreur;
    erreurB = lireNombre(etat.b).erreur;
    if (!erreurA && !erreurB && conversion && !conversion.ok) erreurB = conversion.erreur;
  }
  const pret = !erreurA && !erreurB && (etat.repere === 'orbite' || conversion?.ok === true);
  const corps = (): Record<string, unknown> => {
    const a = lireNombre(etat.a).valeur!, b = lireNombre(etat.b).valeur!;
    if (etat.repere === 'orbite') return { orbite: a, heure: b };
    if (etat.repere === 'plan') return { plan: { x: a, y: b } };
    return { galactique: { q: a, r: b } };
  };
  return {
    etat, setRepere, conversion, pret, corps,
    setA: (a) => setEtat((e) => ({ ...e, a, touche: true })), setB: (b) => setEtat((e) => ({ ...e, b, touche: true })),
    erreurA: montre ? erreurA : undefined, erreurB: montre ? erreurB : undefined,
  };
}

/** The « Repère » choice and the two fields of the chosen one, with the converted line (when the core is there). */
export function ChampsPlace({ place, lune, coeurPret, idLigne }: { place: Place; lune: boolean; coeurPret: boolean | null; idLigne: string }) {
  const { etat } = place;
  const [la, lb] = etat.repere === 'orbite' ? ['Orbite', 'Heure'] : etat.repere === 'plan' ? ['X', 'Y'] : ['q', 'r'];
  const options = lune || coeurPret === false ? REPERES_LUNE : REPERES;
  return (
    <>
      {options.length > 1 && <Segments legende="Repère" variante="mj" options={options} valeur={etat.repere} onChange={place.setRepere} />}
      <div className="ed-ligne">
        <Champ etiquette={la} inputMode="decimal" autoComplete="off" value={etat.a} erreur={place.erreurA}
          aria-describedby={coeurPret ? idLigne : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => place.setA(e.target.value)} />
        <Champ etiquette={lb} inputMode="decimal" autoComplete="off" value={etat.b} erreur={place.erreurB}
          aria-describedby={coeurPret ? idLigne : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => place.setB(e.target.value)} />
      </div>
      {coeurPret !== false && <LigneConversion id={idLigne} texte={coeurPret === null ? '= …' : ligneConversion(place.conversion)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Frame of the inline forms (they replace the panel)

/** Returns the focus to the opener (the panel's button that carries `data-ouvreur`) when the form closes. */
function useRendreFocus(ouvreur: string) {
  useEffect(() => () => {
    setTimeout(() => document.querySelector<HTMLElement>(`[data-ouvreur="${ouvreur}"]`)?.focus(), 0);
  }, [ouvreur]);
}

export function CadreForm({ titre, ouvreur, envoi, pret, onEnvoyer, onFermer, children }: {
  titre: string; ouvreur: string; envoi: Envoi; pret: boolean; onEnvoyer: () => void; onFermer: () => void; children: ReactNode;
}) {
  const perdue = useConnexionPerdue();
  const racine = useRef<HTMLElement>(null);
  useRendreFocus(ouvreur);
  useEffect(() => { racine.current?.querySelector<HTMLElement>('input,textarea,select,[role="radio"][tabindex="0"]')?.focus(); }, []);
  return (
    <section ref={racine} className="gx-bloc gx-panneau cs-panneau ed-form" aria-label={titre}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
      <div className="gx-tete"><h2 className="cs-nom" title={titre}>{titre}</h2></div>
      <form onSubmit={(e) => { e.preventDefault(); if (pret && !envoi.bloque && !perdue) onEnvoyer(); }}>
        <fieldset className="ed-champs" disabled={perdue || envoi.enCours}>{children}</fieldset>
        <EchecForm envoi={envoi} onReessayer={onEnvoyer} onFermer={onFermer} />
        <div className="gx-actions ed-actions">
          <Bouton onClick={onFermer} disabled={envoi.enCours}>Annuler</Bouton>
          <Bouton variante="mj" ecrit type="submit" disabled={!pret || envoi.bloque || envoi.enCours}>
            {envoi.enCours ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Déplacer <nom> »

export function FormulaireDeplacer({ astre, onFermer }: { astre: AstreSysteme; onFermer: () => void }) {
  const { place: adresse, adopter } = useEdition();
  const coeurPret = useCoeurPret();
  const lune = astre.genre === 'lune';
  const p = usePlace(astre.orbite ?? 0, astre.heure, coeurPret);
  const envoi = useEnvoi(onFermer);
  const idLigne = useId();
  const nom = nomAstre(astre);
  const enregistrer = () => void envoi.envoyer(
    (jeton) => modifierAstreSysteme(adresse, astre.cle, { ...jeton, version: astre.version ?? 1, ...p.corps() }),
    (i) => { adopter(i); onFermer(); }, `${nom} déplacé.`,
  );
  return (
    <CadreForm titre={`Déplacer ${nom}`} ouvreur="deplacer" envoi={envoi} pret={p.pret} onEnvoyer={enregistrer} onFermer={onFermer}>
      <ChampsPlace place={p} lune={lune} coeurPret={coeurPret} idLigne={idLigne} />
    </CadreForm>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The fields of a body (« Modifier » and « Ajouter »)

export interface EtatAstre {
  nom: string; description: string; type: string; taille: string; aspect: Aspect; graine: string;
}

export const etatDeAstre = (a: AstreSysteme): EtatAstre => ({
  nom: a.nom ?? '', description: descriptionDe(a), type: a.type, taille: texteNombre(a.taille), aspect: a.aspect ?? {},
  graine: typeof a.aspect?.graine === 'number' ? String(a.aspect.graine) : '',
});

/** What the fields hold, as the request carries it, or the errors by field. */
function lireAstre(e: EtatAstre) {
  const taille = lireTaille(e.taille);
  const graine = e.graine.trim() === '' ? { valeur: undefined as number | undefined, erreur: undefined as string | undefined } : lireGraine(e.graine);
  const erreurs = {
    nom: [...e.nom.trim()].length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : undefined,
    description: [...e.description].length > DESCRIPTION_MAX ? `${DESCRIPTION_MAX.toLocaleString('fr-FR')} caractères au plus.` : undefined,
    taille: taille.erreur, graine: graine.erreur,
  };
  const aspect: Aspect = { ...e.aspect };
  if (graine.valeur === undefined) delete aspect.graine; else aspect.graine = graine.valeur;
  return { erreurs, ok: !Object.values(erreurs).some(Boolean), corps: { nom: e.nom.trim(), description: e.description, type: e.type, taille: taille.valeur, aspect } };
}

function Vignette({ type, taille, aspect, libelle }: { type: string; taille: number; aspect: Aspect; libelle: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const json = aspectApercu(type, taille, aspect);
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      dessineurDuCoeur(json, 96).then((octets) => {
        if (!vivant) return;
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(octets.buffer, octets.byteOffset, octets.byteLength).slice(), 96, 96), 0, 0);
        setUrl(c.toDataURL());
      }, () => vivant && setUrl(null));
    }, 120);
    return () => { vivant = false; clearTimeout(t); };
  }, [json]);
  return (
    <div className="cs-illustration reduite ed-vignette" role="img" aria-label={libelle}>
      {url && <img className="cs-net pret" src={url} alt="" />}
    </div>
  );
}

/** « Nom », « Description », « Type », « Taille », « Aspect », « Graine de la surface » and the thumbnail. */
function ChampsAstre({ genre, etat, onChange, types, catalogue, libelle }: {
  genre: string; etat: EtatAstre; onChange: (e: EtatAstre) => void; types: string[]; catalogue: Catalogue; libelle: string;
}) {
  const lu = lireAstre(etat);
  const [remis, setRemis] = useState(false);
  const defaut = catalogue[etat.type];
  const preset = presetDe(etat.aspect, defaut);
  const presets = nomsPreregles(defaut);
  const nd = [...etat.description].length;
  const taille = lireTaille(etat.taille).valeur;
  const avecGraine = (a: Aspect, g: string): Aspect => {
    const r = { ...a };
    const n = lireGraine(g);
    if (g.trim() !== '' && n.valeur !== undefined) r.graine = n.valeur; else delete r.graine;
    return r;
  };
  const changerType = (type: string) => {
    const d = catalogue[type];
    setRemis(type !== etat.type || remis);
    onChange({ ...etat, type, aspect: avecGraine(d ? { ...d } : {}, etat.graine) });
  };
  const changerPreset = (v: string) => {
    if (!defaut || v === PERSONNALISE) return;
    onChange({ ...etat, aspect: avecGraine(v === PAR_DEFAUT ? { ...defaut } : aspectPreregle(defaut, v), etat.graine) });
  };
  const changerGraine = (g: string) => onChange({ ...etat, graine: g, aspect: avecGraine(etat.aspect, g) });
  return (
    <>
      <Champ etiquette="Nom" facultatif value={etat.nom} placeholder="Astre sans nom" autoComplete="off" erreur={lu.erreurs.nom}
        compteur={`${[...etat.nom].length} / ${NOM_MAX}`} trop={lu.erreurs.nom !== undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...etat, nom: e.target.value })} />
      <Champ etiquette="Description" facultatif zone rows={3} value={etat.description} erreur={lu.erreurs.description}
        compteur={nd >= DESCRIPTION_COMPTEUR ? `${nd} / ${DESCRIPTION_MAX.toLocaleString('fr-FR')}` : undefined} trop={nd > DESCRIPTION_MAX}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...etat, description: e.target.value })} />
      <div>
        <Champ etiquette="Type" liste value={etat.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changerType(e.target.value)}>
          {(types.includes(etat.type) ? types : [etat.type, ...types]).map((t) => <option key={t} value={t}>{libelleType(genre, t)}</option>)}
        </Champ>
        {remis && <p className="gx-note" role="status">L’aspect est remis à celui du type.</p>}
      </div>
      <Champ etiquette="Taille" inputMode="decimal" autoComplete="off" value={etat.taille} erreur={lu.erreurs.taille}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...etat, taille: e.target.value })} />
      <Champ etiquette="Aspect" liste value={preset} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changerPreset(e.target.value)}>
        <option value={PAR_DEFAUT}>Par défaut du type</option>
        {presets.map((n) => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
        {preset === PERSONNALISE && <option value={PERSONNALISE}>Personnalisé</option>}
      </Champ>
      <div className="ed-graine">
        <Champ etiquette="Graine de la surface" facultatif inputMode="numeric" autoComplete="off" value={etat.graine} erreur={lu.erreurs.graine}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => changerGraine(e.target.value)} />
        <Bouton petit onClick={() => changerGraine(String(Math.floor(Math.random() * 4_294_967_296)))}>Tirer une autre</Bouton>
      </div>
      {taille !== undefined && <Vignette type={etat.type} taille={taille} aspect={lu.ok ? lu.corps.aspect : etat.aspect} libelle={libelle} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Modifier <nom> » of a body

export function FormulaireModifierAstre({ astre, onFermer }: { astre: AstreSysteme; onFermer: () => void }) {
  const { place, adopter } = useEdition();
  const [etat, setEtat] = useState(() => etatDeAstre(astre));
  const types = useTypes(astre.genre);
  const catalogue = useCatalogue();
  const envoi = useEnvoi(onFermer);
  const lu = lireAstre(etat);
  const nom = nomAstre(astre);
  const enregistrer = () => void envoi.envoyer(
    (jeton) => modifierAstreSysteme(place, astre.cle, { ...jeton, version: astre.version ?? 1, ...lu.corps }),
    (i) => { adopter(i); onFermer(); }, 'Enregistré.',
  );
  return (
    <CadreForm titre={`Modifier ${nom}`} ouvreur="modifier" envoi={envoi} pret={lu.ok} onEnvoyer={enregistrer} onFermer={onFermer}>
      <ChampsAstre genre={astre.genre} etat={etat} onChange={setEtat} types={types} catalogue={catalogue} libelle={`Aperçu de ${nom}`} />
    </CadreForm>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The fields of a zone

interface EtatZone { nom: string; description: string; anneau: ChampsAnneau; nuage: ChampsNuage }

const etatDeZone = (z: FormationSysteme): EtatZone => ({
  nom: z.nom ?? '', description: descriptionDe(z), anneau: champsAnneau(z.parametres), nuage: champsNuage(z.parametres),
});

function lireZone(forme: 'anneau' | 'nuage', e: EtatZone, base: Record<string, unknown>) {
  const p = forme === 'anneau' ? parametresAnneau(e.anneau, base) : parametresNuage(e.nuage, base);
  const erreurs = {
    ...p.erreurs,
    nom: [...e.nom.trim()].length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : undefined,
    description: [...e.description].length > DESCRIPTION_MAX ? `${DESCRIPTION_MAX.toLocaleString('fr-FR')} caractères au plus.` : undefined,
  };
  const ok = p.parametres !== undefined && !erreurs.nom && !erreurs.description;
  return { erreurs, ok, corps: { nom: e.nom.trim(), description: e.description, parametres: p.parametres } };
}

function ChampsZone({ forme, etat, onChange, erreurs, lectureForme }: {
  forme: 'anneau' | 'nuage'; etat: EtatZone; onChange: (e: EtatZone) => void; erreurs: Record<string, string | undefined>; lectureForme?: boolean;
}) {
  const nd = [...etat.description].length;
  const a = etat.anneau, n = etat.nuage;
  const maj = (k: keyof ChampsAnneau, v: string | boolean) => onChange({ ...etat, anneau: { ...a, [k]: v } });
  const majN = (k: keyof ChampsNuage, v: string) => onChange({ ...etat, nuage: { ...n, [k]: v } });
  const champ = (etiquette: string, valeur: string, err: string | undefined, onC: (v: string) => void) => (
    <Champ etiquette={etiquette} inputMode="decimal" autoComplete="off" value={valeur} erreur={err}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onC(e.target.value)} />
  );
  return (
    <>
      <Champ etiquette="Nom" facultatif value={etat.nom} placeholder="Zone sans nom" autoComplete="off" erreur={erreurs.nom}
        compteur={`${[...etat.nom].length} / ${NOM_MAX}`} trop={erreurs.nom !== undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...etat, nom: e.target.value })} />
      <Champ etiquette="Description" facultatif zone rows={3} value={etat.description} erreur={erreurs.description}
        compteur={nd >= DESCRIPTION_COMPTEUR ? `${nd} / ${DESCRIPTION_MAX.toLocaleString('fr-FR')}` : undefined} trop={nd > DESCRIPTION_MAX}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...etat, description: e.target.value })} />
      {lectureForme && <Champ etiquette="Forme" readOnly value={forme === 'anneau' ? 'Anneau' : 'Nuage'} />}
      {forme === 'anneau' ? (
        <>
          <div className="ed-ligne">
            {champ('De', a.de, erreurs.de, (v) => maj('de', v))}
            {champ('À', a.a, erreurs.a, (v) => maj('a', v))}
          </div>
          <Segments legende="Arc" variante="mj" options={[{ valeur: 'tout', libelle: 'Tout autour' }, { valeur: 'arc', libelle: 'De… à… h' }]}
            valeur={a.arcTout ? 'tout' : 'arc'} onChange={(v) => maj('arcTout', v === 'tout')} />
          {!a.arcTout && (
            <div className="ed-ligne">
              {champ('Début (h)', a.debut, erreurs.debut, (v) => maj('debut', v))}
              {champ('Fin (h)', a.fin, erreurs.fin, (v) => maj('fin', v))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ed-ligne">
            {champ('Centre : orbite', n.orbite, erreurs.orbite, (v) => majN('orbite', v))}
            {champ('Centre : heure', n.heure, erreurs.heure, (v) => majN('heure', v))}
          </div>
          {champ('Étendue', n.etendue, erreurs.etendue, (v) => majN('etendue', v))}
        </>
      )}
    </>
  );
}

export function FormulaireModifierZone({ zone, onFermer }: { zone: FormationSysteme; onFermer: () => void }) {
  const { place, adopter } = useEdition();
  const [etat, setEtat] = useState(() => etatDeZone(zone));
  const envoi = useEnvoi(onFermer);
  const lu = lireZone(zone.forme, etat, zone.parametres);
  const nom = nomFormation(zone);
  const enregistrer = () => void envoi.envoyer(
    (jeton) => modifierZoneSysteme(place, zone.cle, { ...jeton, version: zone.version ?? 1, ...lu.corps }),
    (i) => { adopter(i); onFermer(); }, 'Enregistré.',
  );
  return (
    <CadreForm titre={`Modifier ${nom}`} ouvreur="modifier" envoi={envoi} pret={lu.ok} onEnvoyer={enregistrer} onFermer={onFermer}>
      <ChampsZone forme={zone.forme} etat={etat} onChange={setEtat} erreurs={lu.erreurs} lectureForme />
    </CadreForm>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Ajouter un astre » and « Ajouter une zone » (dialogs)

type Genre = 'planete' | 'lune' | 'comete';
const GENRES: { valeur: Genre; libelle: string }[] = [{ valeur: 'planete', libelle: 'Planète' }, { valeur: 'lune', libelle: 'Lune' }, { valeur: 'comete', libelle: 'Comète' }];
const DEFAUT_TAILLE: Record<Genre, number> = { planete: 0.105, lune: 0.05, comete: 0.05 };
const DEFAUT_TYPE: Record<Genre, string> = { planete: 'tellurique', lune: 'rocheux', comete: 'comete' };

/** The key of the row an answer holds that the previous interior did not. */
export const cleNouvelle = (avant: InterieurSysteme, apres: InterieurSysteme, liste: 'astres' | 'formations' | 'elements'): string | undefined => {
  const vues = new Set((avant[liste] ?? []).map((x) => x.cle));
  return (apres[liste] ?? []).find((x) => !vues.has(x.cle))?.cle;
};

export function DialogueAjouterAstre({ onFermer, onAjoute }: { onFermer: () => void; onAjoute: (cle: string | undefined) => void }) {
  const { interieur, place: adresse, adopter, ancrageOuvert } = useEdition();
  const planetes = interieur.astres.filter((a) => a.genre === 'planete');
  const etoiles = interieur.astres.filter((a) => a.genre === 'etoile');
  const coeurPret = useCoeurPret();
  const catalogue = useCatalogue();
  const [genre, setGenre] = useState<Genre>('planete');
  const types = useTypes(genre);
  const [parent, setParent] = useState(planetes[0]?.cle ?? '');
  const [rang, setRang] = useState(0);
  const typeDe = (g: Genre, l: string[]) => (l.includes(DEFAUT_TYPE[g]) ? DEFAUT_TYPE[g] : l[0] ?? DEFAUT_TYPE[g]);
  const [etat, setEtat] = useState<EtatAstre>({
    nom: '', description: '', type: DEFAUT_TYPE.planete, taille: texteNombre(DEFAUT_TAILLE.planete), aspect: {}, graine: '',
  });
  const lune = genre === 'lune';
  const orbite0 = lune ? 1 : orbiteParDefaut(interieur);
  const p = usePlace(orbite0, 0, coeurPret);
  const envoi = useEnvoi(onFermer);
  const idLigne = useId();
  const lu = lireAstre(etat);
  // The default aspect is the type's, as soon as the core's catalogue is there (and at each change of genre).
  const aspectVu = useRef<string>('');
  useEffect(() => {
    const d = catalogue[etat.type];
    if (d && aspectVu.current !== etat.type) { aspectVu.current = etat.type; setEtat((e) => (Object.keys(e.aspect).length === 0 ? { ...e, aspect: { ...d } } : e)); }
  }, [catalogue, etat.type]);

  const choisirGenre = (g: Genre) => {
    setGenre(g);
    const t = DEFAUT_TYPE[g];
    setEtat((e) => ({ ...e, type: t, taille: texteNombre(DEFAUT_TAILLE[g]), aspect: catalogue[t] ? { ...catalogue[t] } : {} }));
    aspectVu.current = t;
    p.setRepere('orbite');
  };
  // The place restarts at the genre's default when the genre changes.
  const genreVu = useRef<Genre>('planete');
  useEffect(() => {
    if (genreVu.current === genre) return;
    genreVu.current = genre;
    p.setA(texteNombre(genre === 'lune' ? 1 : orbiteParDefaut(interieur)));
    p.setB('0');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);
  useEffect(() => {
    // Types arrive from the core after the genre: the default type is the one of the genre when the core offers it.
    if (types.length > 0 && !types.includes(etat.type)) {
      const t = typeDe(genre, types);
      setEtat((e) => ({ ...e, type: t, aspect: catalogue[t] ? { ...catalogue[t] } : e.aspect }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  const pret = lu.ok && p.pret && (!lune || parent !== '');
  const ajouter = () => void envoi.envoyer(
    (jeton) => ajouterAstreSysteme(adresse, {
      ...jeton, genre, ...lu.corps, ...p.corps(),
      ...(lune ? { parent_cle: parent } : { etoile_rang: rang }),
    }),
    (i) => { adopter(i); onAjoute(cleNouvelle(interieur, i, 'astres')); onFermer(); },
    (i) => `${nomNouveau(interieur, i)} ajouté.`,
  );
  if (ancrageOuvert) return null;
  const sansPlanete = planetes.length === 0;
  return (
    <BoiteDialogue
      variante="neutre" icone={Plus} formulaire focusChamp
      titre="Ajouter un astre"
      texte="Le nouvel astre est ajouté au système et sélectionné."
      action="Ajouter" libelleEnCours="Enregistrement…"
      enCours={envoi.enCours} desactive={!pret || envoi.bloque}
      onConfirmer={ajouter}
      onFermer={() => { if (!envoi.enCours) onFermer(); }}
    >
      <div className="ed-defile">
        <div>
          <Champ etiquette="Genre" liste value={genre} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => choisirGenre(e.target.value as Genre)}>
            {GENRES.map((g) => <option key={g.valeur} value={g.valeur} disabled={g.valeur === 'lune' && sansPlanete}>{g.libelle}</option>)}
          </Champ>
          {sansPlanete && <p className="gx-note">Ajoutez d’abord une planète.</p>}
        </div>
        {lune ? (
          <Champ etiquette="Planète" liste value={parent} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParent(e.target.value)}>
            {planetes.map((a) => <option key={a.cle} value={a.cle}>{nomAstre(a)}</option>)}
          </Champ>
        ) : etoiles.length > 1 && (
          <Champ etiquette="Étoile" liste value={String(rang)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRang(Number(e.target.value))}>
            {etoiles.map((a) => <option key={a.cle} value={a.etoile_rang}>{nomAstre(a)} — {typeAstre(a)}</option>)}
          </Champ>
        )}
        <ChampsAstre genre={genre} etat={etat} onChange={setEtat} types={types} catalogue={catalogue} libelle="Aperçu du nouvel astre" />
        <ChampsPlace place={p} lune={lune} coeurPret={coeurPret} idLigne={idLigne} />
      </div>
      <EchecForm envoi={envoi} onReessayer={ajouter} onFermer={onFermer} />
    </BoiteDialogue>
  );
}

const nomNouveau = (avant: InterieurSysteme, apres: InterieurSysteme): string => {
  const cle = cleNouvelle(avant, apres, 'astres');
  const a = apres.astres.find((x) => x.cle === cle);
  return a ? nomAstre(a) : 'Astre';
};

export function DialogueAjouterZone({ onFermer, onAjoute }: { onFermer: () => void; onAjoute: (cle: string | undefined) => void }) {
  const { interieur, place: adresse, adopter, ancrageOuvert } = useEdition();
  const [forme, setForme] = useState<'anneau' | 'nuage'>('anneau');
  const [etat, setEtat] = useState<EtatZone>(() => ({ nom: '', description: '', anneau: champsAnneau(parametresZoneParDefaut(interieur, 'anneau')), nuage: champsNuage(parametresZoneParDefaut(interieur, 'nuage')) }));
  const envoi = useEnvoi(onFermer);
  const lu = lireZone(forme, etat, {});
  const ajouter = () => void envoi.envoyer(
    (jeton) => ajouterZoneSysteme(adresse, { ...jeton, forme, ...lu.corps }),
    (i) => { adopter(i); onAjoute(cleNouvelle(interieur, i, 'formations')); onFermer(); },
    (i) => { const f = i.formations.find((x) => x.cle === cleNouvelle(interieur, i, 'formations')); return f?.nom ? `${f.nom} ajoutée.` : 'Zone ajoutée.'; },
  );
  if (ancrageOuvert) return null;
  return (
    <BoiteDialogue
      variante="neutre" icone={Plus} formulaire focusChamp
      titre="Ajouter une zone"
      texte="La nouvelle zone est ajoutée au système et sélectionnée."
      action="Ajouter" libelleEnCours="Enregistrement…"
      enCours={envoi.enCours} desactive={!lu.ok || envoi.bloque}
      onConfirmer={ajouter}
      onFermer={() => { if (!envoi.enCours) onFermer(); }}
    >
      <div className="ed-defile">
        <Segments legende="Forme" variante="mj" options={[{ valeur: 'anneau', libelle: 'Anneau' }, { valeur: 'nuage', libelle: 'Nuage' }]}
          valeur={forme} onChange={setForme} />
        <ChampsZone forme={forme} etat={etat} onChange={setEtat} erreurs={lu.erreurs} />
      </div>
      <EchecForm envoi={envoi} onReessayer={ajouter} onFermer={onFermer} />
    </BoiteDialogue>
  );
}
