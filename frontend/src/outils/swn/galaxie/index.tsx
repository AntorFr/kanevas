import { Eye, EyeOff, FileText, KeyRound, MapPinPlus, Pencil, PenLine, Route as IconeRoute, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import { Bouton, Menu, PageIntrouvable, Pastille, type EntreeMenu } from '../../../ui';
import type { PropsOutil } from '../../types';
import { CarteHex, type ObjetsCarte } from './Carte';
import { DialogueDocument, DialogueGraine, DialogueRenommer, DialogueSuppression } from './Dialogues';
import { FormRoute, FormSysteme, FormZone, brouillonSystemeVide, brouillonZoneVide, type BrouillonSysteme, type BrouillonZone } from './Formulaires';
import { PanneauRoute, PanneauZone, RetraitSysteme } from './PanneauxEcriture';
import { PanneauSystemeVue, Recherche, Trajet, type EtatPanneau } from './Panneaux';
import { CONFLIT, couleurServeur, tailleNom } from './ecriture';
import type { Geste, PanneauSysteme, Reference, Resultat, Selection, SystemeCarte, Touche, VueGalaxie, VueTrajet } from './types';
import './galaxie.css';

type Formulaire =
  | { k: 'systeme'; mode: 'nouveau' | 'promouvoir' | 'modifier'; q: number; r: number; brouillon: BrouillonSysteme; cle?: string; version?: number; nbRoutes: number; n: number }
  | { k: 'route'; depart: SystemeCarte; arrivee: SystemeCarte }
  | { k: 'zone'; points: [number, number][] };
type Dialogue = 'renommer' | 'graine' | 'supprimer' | 'document' | 'retirer';

const POINTS_MAX = 64;

/** True below 760 px, where the controls fold into « Modifier la carte ▾ ». */
function useEtroit(): boolean {
  const lire = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 759px)').matches === true;
  const [etroit, setEtroit] = useState(lire);
  useEffect(() => {
    const m = window.matchMedia?.('(max-width: 759px)');
    if (!m) return;
    const f = () => setEtroit(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return etroit;
}

/** E-21: reading (P-18 steps 1–3) and, for the GM outside Player mode, writing (steps 4–5). */
export default function Galaxie({ universId, cible, prealable, suffixeMode }: PropsOutil) {
  const [galaxie, setGalaxie] = useState(prealable as VueGalaxie);
  const suffixe = suffixeMode ?? '';
  const baseNue = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${galaxie.id}`;
  const base = baseNue;
  const perdue = useConnexionPerdue();
  const navigate = useNavigate();
  const etroit = useEtroit();
  const [params, setParams] = useSearchParams();
  const lien = params.get('systeme');
  const [selection, setSelection] = useState<Selection | null>(lien ? { k: 'systeme', cle: lien } : null);
  const [panneau, setPanneau] = useState<EtatPanneau>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [centrer, setCentrer] = useState<{ q: number; r: number; n: number } | null>(null);
  const [depart, setDepart] = useState<Resultat | null>(null);
  const [arrivee, setArrivee] = useState<Resultat | null>(null);
  const [resultat, setResultat] = useState<VueTrajet | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [vide, setVide] = useState(false);
  const [rev, setRev] = useState(0);
  const [objets, setObjets] = useState<ObjetsCarte>({ systemes: new Map(), routes: new Map(), zones: new Map() });
  const [geste, setGeste] = useState<Geste | null>(null);
  const [avis, setAvis] = useState<string>();
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [brouillonZone, setBrouillonZone] = useState<BrouillonZone>(brouillonZoneVide);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [echecVisible, setEchecVisible] = useState<string | null>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const premiereLecture = useRef(true);
  const mj = galaxie.niveau === 'mj';

  useTitreAriane(galaxie.titre, 'Cartes');

  // The panel of a defined system; the first one comes from the address (`?systeme=`).
  const cleSysteme = selection?.k === 'systeme' ? selection.cle : null;
  useEffect(() => {
    if (cleSysteme === null) return;
    let actif = true;
    setPanneau({ k: 'chargement' });
    lire<PanneauSysteme>(`${base}/systemes/${encodeURIComponent(cleSysteme)}${suffixe}`).then(
      (s) => {
        if (!actif) return;
        setPanneau({ k: 'ok', s });
        if (premiereLecture.current) setCentrer({ q: s.q, r: s.r, n: 1 });
        premiereLecture.current = false;
      },
      (e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
        setPanneau({ k: 'erreur' });
      },
    );
    return () => { actif = false; };
  }, [cleSysteme, base, suffixe, essai]);

  // The address always holds a link to read (G-7).
  useEffect(() => {
    const voulu = cleSysteme;
    if ((params.get('systeme') ?? null) === voulu) return;
    const p = new URLSearchParams(params);
    if (voulu === null) p.delete('systeme'); else p.set('systeme', voulu);
    setParams(p, { replace: true });
  }, [cleSysteme]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = useCallback((s: Selection | null) => {
    setSelection(s);
    setGeste((g) => (g?.k === 'placer' && s ? null : g));
    if (s && window.matchMedia?.('(max-width: 759px)').matches) {
      setTimeout(() => panneauRef.current?.scrollIntoView({ block: 'nearest' }), 0);
    }
  }, []);

  const surIntrouvable = useCallback(() => setIntrouvable(true), []);

  // ---- Writing: every success reads the map and the galaxy again.
  const relireGalaxie = useCallback(async () => {
    try { setGalaxie(await lire<VueGalaxie>(`${base}${suffixe}`)); } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setIntrouvable(true);
    }
  }, [base, suffixe]);
  const rafraichir = useCallback(() => {
    setRev((n) => n + 1);
    setEssai((n) => n + 1);
    void relireGalaxie();
  }, [relireGalaxie]);

  const abandonner = useCallback(() => {
    setGeste(null);
    setAvis(undefined);
    setFormulaire(null);
  }, []);

  useEffect(() => {
    if (!geste) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="alertdialog"]')) abandonner();
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [geste, abandonner]);

  function commencer(g: Geste) {
    setFormulaire(null);
    setAvis(undefined);
    setGeste(g);
    if (g.k === 'zone') setBrouillonZone(brouillonZoneVide());
  }

  function toucher(t: Touche) {
    if (!geste) return;
    setAvis(undefined);
    if (geste.k === 'placer' && t.k === 'hex') {
      setGeste(null);
      return setFormulaire({ k: 'systeme', mode: t.genere ? 'promouvoir' : 'nouveau', q: t.q, r: t.r, brouillon: brouillonSystemeVide(), nbRoutes: 0, n: 0 });
    }
    if (geste.k === 'route' && t.k === 'systeme') {
      if (!geste.depart) return setGeste({ k: 'route', depart: t.systeme });
      if (geste.depart.cle === t.systeme.cle) return setAvis('Choisissez deux systèmes différents.');
      setFormulaire({ k: 'route', depart: geste.depart, arrivee: t.systeme });
      return setGeste(null);
    }
    if (geste.k === 'zone' && t.k === 'hex') {
      if (geste.points.length >= POINTS_MAX) return setAvis('Un contour compte 64 points au plus.');
      const dernier = geste.points[geste.points.length - 1];
      if (dernier && dernier[0] === t.q && dernier[1] === t.r) return;
      return setGeste({ k: 'zone', points: [...geste.points, [t.q, t.r]] });
    }
    if (geste.k === 'deplacer' && t.k === 'hex') {
      setGeste(null);
      setFormulaire((f) => (f && f.k === 'systeme' ? { ...f, q: t.q, r: t.r } : f));
    }
  }

  const modifier = useCallback((s: PanneauSysteme, cle: string) => {
    setGeste(null);
    setFormulaire({
      k: 'systeme', mode: 'modifier', q: s.q, r: s.r, cle, version: s.version, nbRoutes: s.routes.length,
      brouillon: { nom: s.nom, taille: tailleNom(s.taille), couleur: couleurServeur(s.couleur), notes: s.notes, secret: s.secret === true },
      n: Date.now(),
    });
  }, []);

  /** « Recharger » on a system: the fields are replaced by the stored ones. */
  async function rechargerSysteme(cle: string) {
    try {
      const s = await lire<PanneauSysteme>(`${base}/systemes/${encodeURIComponent(cle)}`);
      modifier(s, cle);
      rafraichir();
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setIntrouvable(true);
    }
  }

  async function basculerVisible() {
    setEchecVisible(null);
    try {
      await appeler('PATCH', base, { visible: !galaxie.visible, version: galaxie.version });
      await relireGalaxie();
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
      if (e instanceof ErreurApi && e.code === 'donnee_modifiee') return setEchecVisible(CONFLIT.galaxie!);
      if (e instanceof ErreurApi && e.statut === 0) return;
      setEchecVisible('L’enregistrement a échoué. Réessayez.');
    }
  }

  const mesure: Reference | null = depart ?? galaxie.reference;
  const chemin = useMemo(() => (resultat?.trouve ? resultat.etapes : []), [resultat]);

  if (introuvable) return <PageIntrouvable />;

  const entrees: EntreeMenu[] = [
    { libelle: 'Placer un système', icone: MapPinPlus, onChoisir: () => commencer({ k: 'placer' }) },
    { libelle: 'Tracer une route', icone: IconeRoute, onChoisir: () => commencer({ k: 'route', depart: null }) },
    { libelle: 'Dessiner une zone', icone: PenLine, onChoisir: () => commencer({ k: 'zone', points: [] }) },
    { separateur: true },
    ...galaxieEntrees(),
  ];
  function galaxieEntrees(): EntreeMenu[] {
    return [
      { libelle: 'Renommer', icone: Pencil, onChoisir: () => setDialogue('renommer') },
      { libelle: galaxie.visible ? 'Cacher aux joueurs' : 'Rendre visible', icone: galaxie.visible ? EyeOff : Eye, onChoisir: () => void basculerVisible() },
      { libelle: 'Document MJ…', icone: FileText, onChoisir: () => setDialogue('document') },
      { libelle: 'Graine…', icone: KeyRound, onChoisir: () => setDialogue('graine') },
      { separateur: true },
      { libelle: 'Supprimer la galaxie…', icone: Trash2, danger: true, onChoisir: () => setDialogue('supprimer') },
    ];
  }

  const systemeSel = selection?.k === 'systeme' && panneau.k === 'ok' ? panneau.s : null;
  const routeSel = selection?.k === 'route' ? objets.routes.get(selection.id) : undefined;
  const zoneSel = selection?.k === 'zone' ? [...objets.zones.values()].find((z) => z.cle === selection.cle) : undefined;
  const surFini = () => { setFormulaire(null); rafraichir(); };

  return (
    <div className="gx">
      <div className="gx-entete">
        <h1>{galaxie.titre}</h1>
        <p className="gx-sous">Carte de la galaxie</p>
        {mj && galaxie.visible === false && <Pastille sens="mj">MJ seul</Pastille>}
      </div>
      {mj && (
        <div className="gx-commandes" role="group" aria-label="Modifier la carte">
          {etroit ? (
            <Menu etiquette="Modifier la carte" classe="gx-menu" aligne="debut" desactive={perdue} icone={Settings2}
              declencheur={<>Modifier la carte ▾</>} entrees={entrees} />
          ) : (
            <>
              <Bouton variante="principal" icone={MapPinPlus} ecrit onClick={() => commencer({ k: 'placer' })}>Placer un système</Bouton>
              <Bouton icone={IconeRoute} ecrit onClick={() => commencer({ k: 'route', depart: null })}>Tracer une route</Bouton>
              <Bouton icone={PenLine} ecrit onClick={() => commencer({ k: 'zone', points: [] })}>Dessiner une zone</Bouton>
              <Menu etiquette="Galaxie" classe="gx-menu" aligne="debut" desactive={perdue} declencheur={<>Galaxie ▾</>} entrees={galaxieEntrees()} />
            </>
          )}
        </div>
      )}
      {echecVisible && (
        <p className="echec" role="alert">{echecVisible}{' '}
          {echecVisible === CONFLIT.galaxie && <Bouton petit onClick={() => { setEchecVisible(null); void relireGalaxie(); }}>Recharger</Bouton>}
        </p>
      )}
      {mj && geste && (
        <div className="gx-geste" role="status">
          <p>
            {geste.k === 'placer' && 'Touchez un hexagone.'}
            {geste.k === 'route' && (geste.depart ? `Départ : ${geste.depart.nom}. Touchez le système d’arrivée.` : 'Touchez le système de départ, puis celui d’arrivée.')}
            {geste.k === 'zone' && 'Touchez les sommets du contour, puis « Terminer ».'}
            {geste.k === 'deplacer' && 'Touchez le nouvel hexagone.'}
            {avis && <> <span className="echec">{avis}</span></>}
            {geste.k === 'zone' && geste.points.length > 0 && geste.points.length < 3 && <> Un contour compte au moins 3 points.</>}
          </p>
          {geste.k === 'zone' && (
            <>
              <Bouton disabled={geste.points.length === 0} onClick={() => setGeste({ k: 'zone', points: geste.points.slice(0, -1) })}>Annuler le dernier point</Bouton>
              <Bouton variante="principal" disabled={geste.points.length < 3} onClick={() => { setFormulaire({ k: 'zone', points: geste.points }); setGeste(null); }}>Terminer</Bouton>
            </>
          )}
          <Bouton onClick={() => { if (geste.k === 'deplacer') { setGeste(null); setAvis(undefined); } else abandonner(); }}>Annuler</Bouton>
        </div>
      )}
      {perdue && <p className="echec" role="status">Connexion perdue.</p>}
      {vide && <p className="gx-note" role="status">{mj ? 'Aucun système défini. Placez-en un ou promouvez un système généré.' : 'Rien à voir sur cette carte pour l’instant.'}</p>}
      <div className="gx-corps">
        <CarteHex
          base={base} suffixe={suffixe} galaxie={galaxie} selection={selection} onSelection={choisir} mesure={mesure}
          chemin={chemin} centrer={centrer} onIntrouvable={surIntrouvable} onVide={setVide}
          rev={rev} geste={mj ? geste : null} onToucher={toucher} onObjets={setObjets}
        />
        <div className="gx-colonne">
          {mj && formulaire?.k === 'systeme' && (
            <FormSysteme
              key={`${formulaire.mode}-${formulaire.cle ?? ''}-${formulaire.n}`} base={base} mode={formulaire.mode} q={formulaire.q} r={formulaire.r}
              brouillon={formulaire.brouillon} version={formulaire.version} cle={formulaire.cle} nbRoutes={formulaire.nbRoutes}
              onFini={(cle) => { surFini(); setCentrer({ q: formulaire.q, r: formulaire.r, n: Date.now() }); choisir({ k: 'systeme', cle }); }}
              onAnnuler={abandonner}
              onDeplacer={(b) => { setFormulaire({ ...formulaire, brouillon: b }); setGeste({ k: 'deplacer', cle: formulaire.cle! }); }}
              onRecharger={() => void rechargerSysteme(formulaire.cle!)} onIntrouvable={surIntrouvable}
            />
          )}
          {mj && formulaire?.k === 'route' && (
            <FormRoute base={base} depart={formulaire.depart} arrivee={formulaire.arrivee} onFini={surFini} onAnnuler={abandonner} onIntrouvable={surIntrouvable} />
          )}
          {mj && formulaire?.k === 'zone' && (
            <FormZone base={base} points={formulaire.points} brouillon={brouillonZone} onFini={surFini} onAnnuler={abandonner} onIntrouvable={surIntrouvable}
              onCorriger={(b) => { setBrouillonZone(b); setGeste({ k: 'zone', points: formulaire.points }); setFormulaire(null); }} />
          )}
          <Recherche base={base} suffixe={suffixe} onChoisir={(r) => { setCentrer({ q: r.q, r: r.r, n: Date.now() }); choisir({ k: 'systeme', cle: r.cle }); }} />
          <div ref={panneauRef}>
            {selection && (selection.k === 'systeme' || selection.k === 'genere') && (
              <PanneauSystemeVue
                selection={selection} etat={panneau} secret={selection.k === 'systeme' ? selection.secret : undefined} mesure={mesure}
                onDepuis={(r) => { setDepart(r); setResultat(null); }} onVers={(r) => { setArrivee(r); setResultat(null); }}
                onReessayer={() => setEssai((n) => n + 1)}
                gestes={mj ? {
                  onModifier: () => systemeSel && selection.k === 'systeme' && modifier(systemeSel, selection.cle),
                  onRetirer: () => setDialogue('retirer'),
                  onPromouvoir: (q, r) => setFormulaire({ k: 'systeme', mode: 'promouvoir', q, r, brouillon: brouillonSystemeVide(), nbRoutes: 0, n: Date.now() }),
                } : undefined}
              />
            )}
            {mj && routeSel && selection?.k === 'route' && (
              <PanneauRoute base={base} route={routeSel} systemes={objets.systemes}
                onFini={() => { setSelection(null); rafraichir(); }} onRecharger={rafraichir} onIntrouvable={surIntrouvable} />
            )}
            {mj && zoneSel && selection?.k === 'zone' && (
              <PanneauZone base={base} zone={zoneSel}
                onFini={() => { setSelection(null); rafraichir(); }} onRecharger={rafraichir} onIntrouvable={surIntrouvable} />
            )}
          </div>
          <Trajet
            base={base} suffixe={suffixe} mj={mj} depart={depart} arrivee={arrivee}
            onDepart={(r) => { setDepart(r); setResultat(null); }} onArrivee={(r) => { setArrivee(r); setResultat(null); }}
            resultat={resultat} onResultat={setResultat}
          />
        </div>
      </div>
      {mj && dialogue && dialogue !== 'retirer' && (() => {
        const commun = {
          base, galaxie, onFermer: () => setDialogue(null), onChange: rafraichir, onIntrouvable: surIntrouvable, onRecharger: () => void relireGalaxie(),
        };
        if (dialogue === 'renommer') return <DialogueRenommer {...commun} />;
        if (dialogue === 'graine') return <DialogueGraine {...commun} />;
        if (dialogue === 'document') return <DialogueDocument {...commun} universId={universId} />;
        return <DialogueSuppression {...commun} onSupprimee={() => navigate(`/univers/${universId}/cartes`)} />;
      })()}
      {mj && dialogue === 'retirer' && systemeSel && selection?.k === 'systeme' && systemeSel.version !== undefined && (
        <RetraitSysteme base={base} systeme={{ cle: selection.cle, nom: systemeSel.nom }} nbRoutes={systemeSel.routes.length} version={systemeSel.version}
          onFini={() => { setDialogue(null); setSelection(null); rafraichir(); }} onFermer={() => setDialogue(null)}
          onRecharger={() => { setEssai((n) => n + 1); }} onIntrouvable={surIntrouvable} />
      )}
    </div>
  );
}
