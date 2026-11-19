import { KeyRound, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import { tirerSysteme } from '../../../wasm/coeur';
import {
  Alerte, BarreApplication, BoiteDialogue, Bandeau, Bouton, Champ, Curseur, Onglets, PageIntrouvable, Panneau, Pastille, PastilleRole,
  idOnglet, idPanneau,
} from '../../../ui';
import type { PropsOutil } from '../../types';
import Aspects from './Aspects';
import CarteCompacte from './CarteCompacte';
import { brouillonAspect, canonAspect, type BrouillonAspect } from './aspects-logique';
import { DialogueGraine } from './Dialogues';
import {
  CHAMPS_PLAGE, CLASSES, FREQUENCES, brouillonDe, canon, champFrequence, champPlage, lireBrouillon, phraseDecompte, phraseEtendue,
  proposition, surchargeEnregistree, texteNombre, type Brouillon, type ChampPlage, type CleFrequence,
} from './reglages-logique';
import { apercevoirReglages, lireReglages, poserReglages, type ApercuReglages, type VueReglages } from './reglages-api';
import type { InterieurSysteme, VueGalaxie } from './types';
import './reglages.css';

type Objet = Record<string, unknown>;

/** The three samples (AD-reglages-7): constants far from any galaxy, so a sample never reads one. */
export const EXEMPLES = [
  { cle: 'm', libelle: 'Naine rouge (M)', q: 9001, r: -7003, taille: 1.0, lettre: 'M' },
  { cle: 'g', libelle: 'Étoile jaune (G)', q: 9004, r: -7011, taille: 1.0, lettre: 'G' },
  { cle: 'a', libelle: 'Étoile blanche brillante (A)', q: 9010, r: -7002, taille: 1.6, lettre: 'A' },
] as const;

const ONGLETS = [{ id: 'generateur', libelle: 'Générateur' }, { id: 'aspects', libelle: 'Aspects' }] as const;
type IdOnglet = (typeof ONGLETS)[number]['id'];

const DELAI_DECOMPTE_MS = 400;
const DELAI_EXEMPLES_MS = 120;

type Decompte = { k: 'aucun' } | { k: 'calcul' } | { k: 'ok'; apercu: ApercuReglages } | { k: 'echec' };

/** E-24, « Générateur »: the GM tunes the generator, sees what it moves, then applies. Read before this code by the tool's `verifier`. */
export default function Reglages({ universId, cible, prealable, suffixeMode }: PropsOutil) {
  const gid = cible ?? '';
  const base = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${gid}`;
  const suffixe = suffixeMode ?? '';
  const lectureSeule = suffixe !== '';
  const perdue = useConnexionPerdue();
  const [params, setParams] = useSearchParams();
  const onglet: IdOnglet = ONGLETS.find((o) => o.id === params.get('onglet'))?.id ?? 'generateur';

  const [vue, setVue] = useState(prealable as VueReglages);
  const [galaxie, setGalaxie] = useState<VueGalaxie | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(vue.valeurs, vue.densite_defaut, vue.version_generateur));
  const [conflit, setConflit] = useState(false);
  const [echec, setEchec] = useState<string>();
  const [confirmation, setConfirmation] = useState(false);
  const [graine, setGraine] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [decompte, setDecompte] = useState<Decompte>({ k: 'aucun' });
  const [essaiDecompte, setEssaiDecompte] = useState(0);
  const [introuvable, setIntrouvable] = useState(false);
  const appliquant = useRef(false);
  const enTete = useRef<HTMLDivElement>(null);
  useEffect(() => { if (conflit) enTete.current?.scrollIntoView?.({ block: 'start' }); }, [conflit]);

  useEffect(() => {
    let actif = true;
    lire<VueGalaxie>(`${base}${suffixe}`).then((g) => actif && setGalaxie(g), () => undefined);
    return () => { actif = false; };
  }, [base, suffixe]);
  useTitreAriane('Réglages du générateur', 'Cartes');

  const lecture = useMemo(() => lireBrouillon(brouillon, vue.defauts), [brouillon, vue.defauts]);
  const propose = useMemo(() => proposition(brouillon, lecture, vue), [brouillon, lecture, vue]);
  const invalide = Object.keys(lecture.erreurs).length > 0;
  const [brouillonsAspects, setBrouillonsAspects] = useState<Record<string, BrouillonAspect>>({});
  const aspectsModifies = Object.entries(brouillonsAspects).some(([t, b]) => {
    const a = vue.aspects.find((x) => x.type === t);
    return a !== undefined && canonAspect(b) !== canonAspect(brouillonAspect(a.defaut, a.surcharge));
  });
  const modifie = aspectsModifies || propose !== null || (invalide && canon(brouillon) !== canon(brouillonDe(vue.valeurs, vue.densite_defaut, vue.version_generateur)));
  const versionsPlusHautes = vue.versions_connues.filter((v) => v > brouillon.version);
  const parDefaut = vue.par_defaut;

  // ---- Leaving with an unsaved change.
  const bloqueur = useBlocker(({ currentLocation, nextLocation }) =>
    !appliquant.current && modifie && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!modifie) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [modifie]);

  // ---- The count, after 400 ms of rest.
  const cleProposition = canon(propose);
  useEffect(() => {
    if (lectureSeule || propose === null || invalide) { setDecompte({ k: 'aucun' }); return; }
    setDecompte({ k: 'calcul' });
    let actif = true;
    const t = setTimeout(() => {
      apercevoirReglages(universId, gid, propose).then(
        (a) => actif && setDecompte({ k: 'ok', apercu: a }),
        (e: unknown) => {
          if (!actif) return;
          if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
          setDecompte({ k: 'echec' });
        },
      );
    }, DELAI_DECOMPTE_MS);
    return () => { actif = false; clearTimeout(t); };
  }, [cleProposition, invalide, lectureSeule, essaiDecompte]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- The samples: the core draws them in the browser, a refused draft keeps the last valid draw.
  const [exemples, setExemples] = useState<Record<string, InterieurSysteme | null>>({ m: null, g: null, a: null });
  const cleSurcharge = canon(lecture.surcharge);
  const valide = lecture.surcharge !== undefined && Object.keys(lecture.erreurs).filter((k) => k !== 'densite').length === 0;
  useEffect(() => {
    if (!valide) return;
    let actif = true;
    const t = setTimeout(async () => {
      const valeurs = JSON.stringify(lecture.surcharge ?? {});
      const nouveaux: Record<string, InterieurSysteme | null> = {};
      try {
        for (const e of EXEMPLES) {
          const s = JSON.parse(await tirerSysteme(e.q, e.r, e.taille, e.lettre, brouillon.version, valeurs)) as
            Pick<InterieurSysteme, 'astres' | 'formations' | 'transition'>;
          nouveaux[e.cle] = { q: e.q, r: e.r, nom: null, etat: 'tire', ...s };
        }
      } catch { return; }
      if (actif) setExemples(nouveaux);
    }, DELAI_EXEMPLES_MS);
    return () => { actif = false; clearTimeout(t); };
  }, [cleSurcharge, brouillon.version, valide]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Changing the draft.
  const poserFrequence = (c: CleFrequence, t: string) => setBrouillon((b) => ({ ...b, frequences: { ...b.frequences, [c]: t } }));
  const poserPlage = (classe: string, ch: ChampPlage, i: 0 | 1, t: string) => setBrouillon((b) => {
    const paire: [string, string] = [...b.classes[classe]![ch]];
    paire[i] = t;
    return { ...b, classes: { ...b.classes, [classe]: { ...b.classes[classe]!, [ch]: paire } } };
  });
  const defaut = useMemo(() => brouillonDe(vue.defauts, vue.densite_defaut, vue.version_generateur), [vue]);
  const sansDefauts = canon(brouillon.frequences) === canon(defaut.frequences) && canon(brouillon.classes) === canon(defaut.classes);

  const recharger = useCallback(async () => {
    try {
      const v = await lireReglages(universId, gid);
      setVue(v);
      setBrouillon(brouillonDe(v.valeurs, v.densite_defaut, v.version_generateur));
      setBrouillonsAspects({}); setConflit(false); setEchec(undefined); setConfirmation(false);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setIntrouvable(true);
      else setEchec('Impossible de recharger les réglages.');
    }
  }, [universId, gid]);

  // ---- Applying.
  const tiresChangent = decompte.k === 'ok' ? decompte.apercu.tires_changent : 0;
  async function appliquer(confirme: boolean) {
    if (propose === null || invalide) return;
    setEnCours(true); setEchec(undefined);
    appliquant.current = true;
    try {
      const v = await poserReglages(universId, gid, { ...propose, version: vue.version, ...(confirme ? { confirme: true } : {}) });
      setVue(v);
      setBrouillon(brouillonDe(v.valeurs, v.densite_defaut, v.version_generateur));
      setConfirmation(false);
    } catch (e) {
      setConfirmation(false);
      if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
      if (e instanceof ErreurApi && e.statut === 409 && e.code === 'a_change') return setConflit(true);
      if (e instanceof ErreurApi && e.code === 'confirmation_requise') { setEssaiDecompte((n) => n + 1); setEchec('Le décompte a changé : relisez-le avant d\'appliquer.'); return; }
      if (e instanceof ErreurApi && e.code === 'reglage_invalide') { setEchec('Valeur refusée : voir le champ.'); return; }
      setEchec('Impossible d\'appliquer les réglages.');
    } finally {
      appliquant.current = false;
      setEnCours(false);
    }
  }
  const demanderApplication = () => (tiresChangent > 0 ? setConfirmation(true) : void appliquer(false));

  if (introuvable) return <PageIntrouvable />;

  const phrase = decompte.k === 'calcul' ? 'Calcul…' : decompte.k === 'ok' ? phraseDecompte(decompte.apercu)
    : decompte.k === 'echec' ? 'Le décompte n\'est pas disponible.' : invalide ? 'Corrigez les champs marqués.' : undefined;
  const etendue = decompte.k === 'ok' ? phraseEtendue(decompte.apercu) : null;
  const retourGalaxie = `/univers/${universId}/outils/swn/galaxie/${gid}`;

  return (
    <div className="rg">
      <div className="rg-entete" ref={enTete}>
        <Link className="rg-retour" to={retourGalaxie}>← Galaxie</Link>
        <h1>Réglages du générateur</h1>
        {galaxie && <p className="rg-sous">{galaxie.titre}</p>}
        {parDefaut && <Pastille sens="neutre">Valeurs par défaut</Pastille>}
        <PastilleRole role="mj" />
      </div>
      {lectureSeule && <Bandeau sorte="joueur">Mode joueur actif.</Bandeau>}
      {conflit && (
        <Alerte action={<Bouton petit onClick={() => void recharger()}>Recharger</Bouton>}>
          Ces réglages ont changé depuis que vous les avez ouverts. Vos modifications non appliquées sont perdues.
        </Alerte>
      )}
      {echec && !conflit && <Alerte>{echec}</Alerte>}

      <Onglets etiquette="Réglages" onglets={ONGLETS} actif={onglet} prefixe="rg"
        onChange={(id) => { const p = new URLSearchParams(params); p.set('onglet', id); setParams(p, { replace: true }); }} />

      <div role="tabpanel" id={idPanneau('rg', onglet)} aria-labelledby={idOnglet('rg', onglet)} className={onglet === 'generateur' ? 'rg-corps' : 'rg-corps-aspects'}>
        {onglet === 'aspects' ? (
          <Aspects universId={universId} gid={gid} vue={vue} lectureSeule={lectureSeule} perdue={perdue} brouillons={brouillonsAspects}
            onBrouillon={(t, b) => setBrouillonsAspects((o) => { const n = { ...o }; if (b === null) delete n[t]; else n[t] = b; return n; })}
            onVue={setVue} onConflit={() => setConflit(true)} onIntrouvable={() => setIntrouvable(true)} onEchec={setEchec} />
        ) : (<>
        <form className="rg-formulaire" onSubmit={(e) => e.preventDefault()} noValidate>
          <Panneau titre="Graine et version">
            {!lectureSeule && <p className="rg-ligne">Graine : <code><GraineLue key={vue.version} base={base} /></code></p>}
            {!lectureSeule && <Bouton icone={KeyRound} ecrit disabled={perdue || galaxie === null} onClick={() => setGraine(true)}>Changer la graine…</Bouton>}
            <p className="rg-ligne">Version du générateur : <strong>{vue.version_generateur}</strong></p>
            {!lectureSeule && versionsPlusHautes.length > 0 && (
              <Bouton ecrit onClick={() => setBrouillon((b) => ({ ...b, version: Math.max(...versionsPlusHautes) }))}>
                Passer à la version {Math.max(...versionsPlusHautes)}…
              </Bouton>
            )}
            {brouillon.version !== vue.version_generateur && <p className="rg-ligne">Passage à la version {brouillon.version} proposé : voir le décompte.</p>}
          </Panneau>

          <Panneau titre="Densité par défaut">
            <ChampReglable etiquette="Densité par défaut (%)" valeur={brouillon.densite} defaut={defaut.densite} erreur={lecture.erreurs.densite}
              desactive={lectureSeule} onChange={(t) => setBrouillon((b) => ({ ...b, densite: t }))}
              onDefaut={() => setBrouillon((b) => ({ ...b, densite: defaut.densite }))} />
            <p className="rg-aide">Les zones de densité écrasent cette valeur.</p>
          </Panneau>

          <Panneau titre="Fréquences">
            {FREQUENCES.map((f) => {
              const n = Number(brouillon.frequences[f.cle].replace(',', '.'));
              return (
                <div key={f.cle} className="rg-frequence">
                  <ChampReglable etiquette={f.libelle} valeur={brouillon.frequences[f.cle]} defaut={defaut.frequences[f.cle]}
                    erreur={lecture.erreurs[champFrequence(f.cle)]} desactive={lectureSeule}
                    onChange={(t) => poserFrequence(f.cle, t)} onDefaut={() => poserFrequence(f.cle, defaut.frequences[f.cle])} />
                  <Curseur etiquette={`${f.libelle} (curseur)`} valeur={Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0} min={0} max={1} pas={0.05}
                    disabled={lectureSeule} affichage={texteNombre} onChange={(v) => poserFrequence(f.cle, texteNombre(v))} />
                </div>
              );
            })}
          </Panneau>

          <Panneau titre="Bornes par classe d'étoile">
            <table className="rg-table">
              <thead>
                <tr>
                  <th scope="col">Classe</th>
                  {CHAMPS_PLAGE.map((c) => <th key={c.cle} scope="col">{c.libelle}</th>)}
                </tr>
              </thead>
              <tbody>
                {CLASSES.map((c) => (
                  <tr key={c.cle}>
                    <th scope="row">{c.libelle}</th>
                    {CHAMPS_PLAGE.map((ch) => (
                      <CellulePlage key={ch.cle} classe={c.libelle} cleClasse={c.cle} champ={ch.cle} libelle={ch.libelle}
                        valeur={brouillon.classes[c.cle]![ch.cle]} defaut={defaut.classes[c.cle]![ch.cle]} desactive={lectureSeule}
                        erreurs={[lecture.erreurs[champPlage(c.cle, ch.cle, 0)], lecture.erreurs[champPlage(c.cle, ch.cle, 1)]]}
                        onChange={(i, t) => poserPlage(c.cle, ch.cle, i, t)}
                        onDefaut={() => setBrouillon((b) => ({ ...b, classes: { ...b.classes, [c.cle]: { ...b.classes[c.cle]!, [ch.cle]: [...defaut.classes[c.cle]![ch.cle]] as [string, string] } } }))} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panneau>

          {!lectureSeule && (
            <div className="rg-pied">
              <Bouton icone={RotateCcw} disabled={sansDefauts && brouillon.densite === defaut.densite}
                onClick={() => setBrouillon((b) => ({ ...b, densite: defaut.densite, frequences: { ...defaut.frequences }, classes: structuredClone(defaut.classes) }))}>
                Tout remettre aux valeurs par défaut
              </Bouton>
            </div>
          )}
        </form>

        <aside className="rg-exemples" aria-labelledby="rg-exemples-titre">
          <h2 id="rg-exemples-titre">Systèmes d'exemple, pas de votre galaxie.</h2>
          {invalide && <p className="rg-aide" role="status">Valeur refusée : voir le champ.</p>}
          <div className="rg-cartes">
            {EXEMPLES.map((e) => (
              <figure key={e.cle} className="rg-exemple" data-exemple={e.cle}>
                <CarteCompacte systeme={exemples[e.cle] ?? null} cote={160} />
                <figcaption>
                  <strong>{e.libelle}</strong>
                  <span>{exemples[e.cle] ? resume(exemples[e.cle]!) : 'Calcul…'}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </aside>
        </>)}
      </div>

      {!lectureSeule && onglet === 'generateur' && (
        <BarreApplication
          decompte={propose === null && !invalide ? undefined : phrase}
          detail={etendue ?? undefined}
          desactive={invalide || decompte.k !== 'ok' || conflit || perdue}
          enCours={enCours}
          onAppliquer={demanderApplication}
          secondaire={{ libelle: 'Annuler les changements', onClick: () => setBrouillon(brouillonDe(vue.valeurs, vue.densite_defaut, vue.version_generateur)) }}
        />
      )}
      {!lectureSeule && onglet === 'generateur' && decompte.k === 'echec' && (
        <div className="rg-reessai"><Bouton petit onClick={() => setEssaiDecompte((n) => n + 1)}>Réessayer</Bouton></div>
      )}

      {confirmation && decompte.k === 'ok' && (
        <BoiteDialogue titre="Appliquer ces réglages ?" variante="mj" action="Appliquer" enCours={enCours}
          texte={`${phraseDecompte(decompte.apercu)} Les étoiles de la galaxie ne bougent pas.`}
          onConfirmer={() => void appliquer(true)} onFermer={() => setConfirmation(false)} />
      )}
      {bloqueur.state === 'blocked' && (
        <BoiteDialogue titre="Quitter sans appliquer ?" texte="Les modifications non enregistrées seront perdues." action="Quitter" annulation="Rester"
          variante="mj" onConfirmer={() => bloqueur.proceed()} onFermer={() => bloqueur.reset()} />
      )}
      {graine && galaxie && (
        <DialogueGraine base={base} galaxie={galaxie} onFermer={() => setGraine(false)}
          onChange={() => { void recharger(); void lire<VueGalaxie>(`${base}${suffixe}`).then(setGalaxie, () => undefined); }}
          onIntrouvable={() => setIntrouvable(true)} onRecharger={() => void lire<VueGalaxie>(`${base}${suffixe}`).then(setGalaxie, () => undefined)} />
      )}
    </div>
  );
}

/** The seed, read once for the display (the dialogue reads it again). */
function GraineLue({ base }: { base: string }) {
  const [g, setG] = useState<string>('…');
  useEffect(() => {
    let actif = true;
    lire<{ graine: string }>(`${base}/graine`).then((r) => actif && setG(r.graine), () => actif && setG('indisponible'));
    return () => { actif = false; };
  }, [base]);
  return <>{g}</>;
}

/** « 4 planètes · 3 lunes · 1 ceinture · 1 comète » */
function resume(s: InterieurSysteme): string {
  const ceinture = (a: { type: string }) => a.type === 'ceinture' || a.type === 'asteroides';
  const n = (genre: string, f: (a: { type: string }) => boolean = () => true) => s.astres.filter((a) => a.genre === genre && f(a)).length;
  const p = n('planete', (a) => !ceinture(a)), l = n('lune'), c = s.astres.filter((a) => ceinture(a)).length, k = n('comete');
  const mot = (x: number, un: string, pl: string) => `${x} ${x === 1 ? un : pl}`;
  return [mot(p, 'planète', 'planètes'), mot(l, 'lune', 'lunes'), mot(c, 'ceinture', 'ceintures'), mot(k, 'comète', 'comètes')].join(' · ');
}

/** A text field with its « Défaut » line and « Revenir au défaut » when it differs from the default. */
function ChampReglable({ etiquette, valeur, defaut, erreur, desactive, onChange, onDefaut }: {
  etiquette: string; valeur: string; defaut: string; erreur?: string; desactive?: boolean; onChange: (t: string) => void; onDefaut: () => void;
}) {
  const different = valeur.trim() !== defaut;
  return (
    <div className="rg-champ">
      <Champ etiquette={etiquette} value={valeur} erreur={erreur} disabled={desactive} inputMode="decimal" autoComplete="off"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value)} />
      {different && !desactive && (
        <p className="rg-defaut"><span className="rg-point" aria-hidden="true" />Défaut : {defaut}{' '}
          <Bouton petit variante="fantome" onClick={onDefaut} aria-label={`Revenir au défaut : ${etiquette}`}>Revenir au défaut</Bouton></p>
      )}
    </div>
  );
}

/** One cell of the table: `min – max`, each an integer field. */
function CellulePlage({ classe, cleClasse, champ, libelle, valeur, defaut, erreurs, desactive, onChange, onDefaut }: {
  classe: string; cleClasse: string; champ: ChampPlage; libelle: string; valeur: [string, string]; defaut: [string, string];
  erreurs: (string | undefined)[]; desactive?: boolean; onChange: (i: 0 | 1, t: string) => void; onDefaut: () => void;
}) {
  const erreur = erreurs[0] ?? erreurs[1];
  const idErreur = `rg-e-${cleClasse}-${champ}`;
  const different = valeur[0].trim() !== defaut[0] || valeur[1].trim() !== defaut[1];
  return (
    <td data-libelle={libelle} className={erreur ? 'rg-refuse' : undefined}>
      <span className="rg-etiquette-cellule" aria-hidden="true">{libelle}</span>
      <span className="rg-paire">
        {([0, 1] as const).map((i) => (
          <span key={i} className="rg-paire-champ">
            {i === 1 && <span aria-hidden="true">–</span>}
            <input className="rg-entier" inputMode="numeric" autoComplete="off" value={valeur[i]} disabled={desactive}
              aria-label={`${classe}, ${libelle.toLowerCase()}, ${i === 0 ? 'minimum' : 'maximum'}`}
              aria-invalid={erreurs[i] ? true : undefined} aria-describedby={erreur ? idErreur : undefined}
              onChange={(e) => onChange(i, e.currentTarget.value)} />
          </span>
        ))}
      </span>
      {erreur && <span className="erreur rg-erreur-cellule" id={idErreur}>Erreur : {erreur}</span>}
      {different && !desactive && (
        <span className="rg-defaut"><span className="rg-point" aria-hidden="true" />Défaut : {defaut[0]}–{defaut[1]}{' '}
          <Bouton petit variante="fantome" onClick={onDefaut} aria-label={`Revenir au défaut : ${classe}, ${libelle.toLowerCase()}`}>Revenir au défaut</Bouton></span>
      )}
    </td>
  );
}

