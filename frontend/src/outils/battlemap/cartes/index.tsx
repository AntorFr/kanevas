import { Eraser, Keyboard, MousePointer2, PanelRight, Paintbrush, Redo2, Undo2, DoorOpen, BrickWall, Stamp, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { appeler, lire } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import {
  Alerte, Bandeau, Bouton, BoutonIcone, CanevasCarte, Champ, Chargement, ColonneOutils, ErreurChargement, Interrupteur, Onglets, PageIntrouvable, Pastille,
  type EntreeOutil, type ImageAsset,
} from '../../../ui';
import type { PropsOutil } from '../../types';
import { Bibliotheque, TYPE_GLISSE, urlImage } from './bibliotheque';
import { PanneauCalques } from './calques';
import { type Bornes, type Coeur, chargerBornes, chargerCoeur } from './coeur';
import { PanneauProprietes } from './proprietes';
import { type Enregistreur as EnregistreurT, Enregistreur } from './enregistreur';
import { calqueActif, calqueObjet, type Empreintes, type Point } from './geometrie';
import { Interaction, type Contexte, type Issue, type Outil, elementSous, surSelection } from './interaction';
import { Moteur } from './moteur';
import { erreurTaille, messageRefusTaille } from './taille';
import type { AssetCarte, CarteLue, Commande } from './types';
import './editeur.css';

const OUTILS: readonly EntreeOutil<Outil>[] = [
  { valeur: 'selection', libelle: 'Sélection', touche: 'V', icone: MousePointer2 },
  { valeur: 'sol', libelle: 'Sol', touche: 'F', icone: Paintbrush },
  { valeur: 'mur', libelle: 'Mur', touche: 'W', icone: BrickWall },
  { valeur: 'porte', libelle: 'Porte', touche: 'D', icone: DoorOpen },
  { valeur: 'poser', libelle: 'Poser un asset', touche: 'A', icone: Stamp },
  { valeur: 'gomme', libelle: 'Gomme', touche: 'E', icone: Eraser },
];
const TOUCHES: Record<string, Outil> = { v: 'selection', f: 'sol', w: 'mur', d: 'porte', a: 'poser', e: 'gomme' };
const RACCOURCIS: readonly [string, string][] = [
  ['V', 'Sélection'], ['F', 'Sol'], ['W', 'Mur'], ['D', 'Porte'], ['A', 'Poser un asset'], ['E', 'Gomme'],
  ['R', 'Pivoter la sélection (ou l’asset à poser)'], ['Ctrl+C / Ctrl+V', 'Copier / coller'], ['Ctrl+D', 'Dupliquer la sélection'], ['M', 'Retourner la sélection'], ['Suppr', 'Supprimer la sélection'], ['Flèches', 'Déplacer d’une case'],
  ['Ctrl+Z', 'Annuler'], ['Ctrl+Maj+Z', 'Rétablir'], ['Espace + glisser', 'Déplacer la vue'], ['Molette', 'Zoom'], ['Maj + glisser', 'Rectangle (Sol), contour (Mur)'],
];
const MESSAGE_TELEPHONE = 'Le dessin demande un pointeur : utilisez un écran plus large.';

type OngletPanneau = 'bibliotheque' | 'calques' | 'proprietes';
const ONGLETS: readonly { valeur: OngletPanneau; libelle: string }[] = [
  { valeur: 'bibliotheque', libelle: 'Bibliothèque' },
  { valeur: 'calques', libelle: 'Calques' },
  { valeur: 'proprietes', libelle: 'Propriétés' },
];

function useMedia(requete: string): boolean {
  const lireMedia = () => typeof window !== 'undefined' && window.matchMedia?.(requete).matches === true;
  const [v, setV] = useState(lireMedia);
  useEffect(() => {
    const m = window.matchMedia?.(requete);
    if (!m) return;
    const f = () => setV(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [requete]);
  return v;
}

/** E-28: the editor of a composed map, for the GM outside Player mode (anyone else: « Page introuvable. »). */
export default function EditeurCarte(props: PropsOutil) {
  const { universId, cible, prealable, suffixeMode } = props;
  const carte = prealable as CarteLue | undefined;
  if (suffixeMode || !carte || !carte.peutEcrire) return <PageIntrouvable />;
  return <Editeur universId={universId} cid={cible ?? String(carte.id)} initiale={carte} />;
}

interface Pret { coeur: Coeur; moteur: Moteur; enr: EnregistreurT }

function Editeur({ universId, cid, initiale }: { universId: number; cid: string; initiale: CarteLue }) {
  const base = `/api/univers/${universId}/outils/battlemap/cartes/${cid}`;
  const [pret, setPret] = useState<Pret | null>(null);
  const [echec, setEchec] = useState(false);
  const [essai, setEssai] = useState(0);
  const [, rafraichir] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let actif = true;
    let courant: Pret | null = null;
    setEchec(false);
    chargerCoeur().then(
      (coeur) => {
        if (!actif) return;
        const moteur = new Moteur(coeur, initiale.document, initiale.version);
        const enr = new Enregistreur(moteur, {
          lot: (version, commandes) => appeler('POST', `${base}/commandes`, { version, commandes }),
          reglage: (version, corps) => appeler('PATCH', base, { version, ...corps }),
        }, rafraichir);
        courant = { coeur, moteur, enr };
        setPret(courant);
      },
      () => actif && setEchec(true),
    );
    return () => {
      actif = false;
      // Closing: what is queued leaves now (AD-battlemap-editeur-4).
      if (courant) {
        courant.enr.arreter();
        void courant.enr.vider();
      }
    };
  }, [base, essai, initiale]);

  // The tab closes: one beacon with the whole queue, at the version the server last gave.
  useEffect(() => {
    if (!pret) return;
    const fermer = () => {
      const { moteur, enr } = pret;
      if (moteur.file.length === 0 || enr.etat === 'envoi' || enr.etat === 'perime') return;
      const corps = JSON.stringify({ version: moteur.base.version, commandes: moteur.file.flatMap((l) => l.commandes) });
      navigator.sendBeacon?.(`${base}/commandes`, new Blob([corps], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', fermer);
    return () => window.removeEventListener('pagehide', fermer);
  }, [pret, base]);

  if (echec) return <ErreurChargement page texte="Impossible de charger la carte." onReessayer={() => setEssai((n) => n + 1)} />;
  if (!pret) return <Chargement texte="Chargement de la carte…" />;
  return <Ecran universId={universId} base={base} initiale={initiale} pret={pret} rafraichir={rafraichir} />;
}

function Ecran({ universId, base, initiale, pret, rafraichir }: { universId: number; base: string; initiale: CarteLue; pret: Pret; rafraichir: () => void }) {
  const { coeur, moteur, enr } = pret;
  const doc = moteur.document;
  const [meta, setMeta] = useState({ titre: initiale.titre, visible: initiale.visible ?? true, tailleCase: initiale.tailleCase });
  useTitreAriane(meta.titre, 'Cartes');
  const [outil, setOutil] = useState<Outil>('selection');
  const [aimanter, setAimanter] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [assets, setAssets] = useState<AssetCarte[] | null>(null);
  const [assetSol, setAssetSol] = useState<string | null>(null);
  const [assetMur, setAssetMur] = useState<string | null>(null);
  const [assetObjet, setAssetObjet] = useState<string | null>(null);
  const [calqueChoisi, setCalqueChoisi] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [onglet, setOnglet] = useState<OngletPanneau>('bibliotheque');
  const [bornes, setBornes] = useState<Bornes | null>(null);
  const presse = useRef<{ ids: string[]; decalage: number } | null>(null);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState(0);
  const [panneau, setPanneau] = useState(false);
  const [raccourcis, setRaccourcis] = useState(false);
  const [taille, setTaille] = useState(false);
  const [rechargement, setRechargement] = useState(false);
  const naviguer = useNavigate();
  const lecture = useMedia('(max-width: 600px)');
  const etroit = useMedia('(max-width: 768px)');
  const cache = useRef(new Map<string, HTMLImageElement>());
  const minuteurMessage = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { chargerBornes().then(setBornes, () => setBornes(null)); }, []);

  useEffect(() => {
    let actif = true;
    lire<{ assets: AssetCarte[] }>(`/api/univers/${universId}/outils/battlemap/assets`).then(
      (l) => actif && setAssets(l.assets),
      () => actif && setAssets([]),
    );
    return () => { actif = false; };
  }, [universId]);

  const parId = useMemo(() => new Map((assets ?? []).map((a) => [String(a.id), a])), [assets]);
  const empreinte: Empreintes = useCallback((id) => {
    const a = parId.get(id);
    return { largeur: a?.largeur ?? 1, hauteur: a?.hauteur ?? 1 };
  }, [parId]);
  const image = useCallback((id: string): ImageAsset => {
    if (assets === null) return null;
    const a = parId.get(id);
    if (!a) return 'retire';
    let im = cache.current.get(id);
    if (!im) {
      im = new Image();
      im.onload = () => setImages((n) => n + 1);
      im.src = urlImage(universId, a);
      cache.current.set(id, im);
    }
    return im.complete && im.naturalWidth > 0 ? im : null;
  }, [assets, parId, universId]);

  const dire = useCallback((texte: string) => {
    setMessage(texte);
    clearTimeout(minuteurMessage.current);
    minuteurMessage.current = setTimeout(() => setMessage(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(minuteurMessage.current), []);

  const ids = useMemo(() => new Set(doc.elements.map((e) => e.id)), [doc]);
  const choix = useMemo(() => selection.filter((id) => ids.has(id)), [selection, ids]);

  /** One gesture. `refus` is the sentence of a refusal by the core (empty: say nothing, the caller does). */
  const geste = useCallback((commandes: Commande[], refus?: string): boolean => {
    const r = moteur.geste(commandes);
    if (!r.ok) {
      if (refus !== undefined) { if (refus !== '') dire(refus); }
      else dire(r.code === 'carte_pleine' ? 'Carte pleine. Retirez des éléments ou agrandissez la carte.' : 'Ce geste n’est pas possible ici.');
      return false;
    }
    enr.noter();
    rafraichir();
    return true;
  }, [moteur, enr, rafraichir, dire]);

  /** Copies of elements, one cell further each time (the core gives them new ids' state: we only name them). */
  const dupliquer = useCallback((sources: readonly string[], decalage = 1) => {
    const existants = sources.filter((id) => moteur.document.elements.some((e) => e.id === id));
    if (existants.length === 0) return;
    const nouveaux = existants.map(() => crypto.randomUUID());
    if (geste([{ type: 'dupliquer_elements', ids: existants, nouveaux_ids: nouveaux, dx: decalage, dy: decalage }])) setSelection(nouveaux);
  }, [moteur, geste]);

  const contexte = (sel: readonly string[]): Contexte => ({ doc: moteur.document, aimanter, empreinte, assetSol, assetMur, selection: sel, assetObjet, calqueObjet: calqueChoisi, rotation });

  const commencer = (p: Point, maj: boolean): Interaction | null => {
    const d = moteur.document;
    if (outil === 'selection' || lecture) {
      let sel = choix;
      const id = elementSous(contexte(sel), p);
      if (id && !sel.includes(id)) {
        sel = maj ? [...sel, id] : [id];
        setSelection(sel);
      }
      const ctx = contexte(sel);
      const i = new Interaction('selection', ctx, p, maj);
      i.deplaceElements = !lecture && surSelection(ctx, p);
      return i;
    }
    if (outil === 'poser') {
      const actif = calqueObjet(d, calqueChoisi);
      if ('message' in actif) {
        dire(actif.message);
        return null;
      }
    }
    const type = outil === 'sol' ? 'sol' : outil === 'gomme' || outil === 'poser' ? null : 'mur';
    if (type) {
      const actif = calqueActif(d, type);
      if ('message' in actif) {
        dire(actif.message);
        return null;
      }
    }
    return new Interaction(outil, contexte(choix), p, maj);
  };

  const surIssue = (issue: Issue) => {
    if (issue.k === 'commandes') {
      const ok = geste(issue.commandes);
      const pose = issue.commandes[0];
      if (ok && pose?.type === 'poser_element') setSelection([String(pose.id)]);
    }
    else if (issue.k === 'selection') setSelection(issue.ids);
    else if (issue.k === 'message') dire(issue.texte);
  };

  const choisirOutil = useCallback((o: Outil) => {
    setOutil(o);
    const type = o === 'sol' ? 'sol' : o === 'mur' || o === 'porte' ? 'mur' : null;
    const actif = o === 'poser' ? calqueObjet(moteur.document, calqueChoisi) : type ? calqueActif(moteur.document, type) : null;
    if (actif && 'message' in actif) dire(actif.message);
  }, [moteur, dire, calqueChoisi]);

  /** An asset dragged from the library and dropped on the map: placed there, whatever the armed tool. */
  const deposer = (p: Point, ev: React.DragEvent) => {
    const id = ev.dataTransfer.getData(TYPE_GLISSE);
    if (!id || !parId.has(id)) return;
    surIssue(new Interaction('poser', { ...contexte(choix), assetObjet: id }, p, false).terminer());
  };

  const annuler = () => { const r = moteur.annuler(); if (!r.ok) dire('Rien à annuler.'); else enr.noter(); rafraichir(); };
  const refaire = () => { const r = moteur.refaire(); if (!r.ok) dire('Rien à rétablir.'); else enr.noter(); rafraichir(); };

  function surTouche(ev: React.KeyboardEvent | KeyboardEvent) {
    const cible = ev.target as HTMLElement | null;
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT' || cible.isContentEditable)) return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) refaire(); else annuler();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !lecture && (k === 'c' || k === 'v' || k === 'd')) {
      ev.preventDefault();
      if (k === 'd') dupliquer(choix);
      else if (k === 'c') { if (choix.length) presse.current = { ids: [...choix], decalage: 0 }; }
      else if (presse.current) {
        presse.current.decalage += 1;
        dupliquer(presse.current.ids, presse.current.decalage);
      }
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || lecture) return;
    if (k === '?') return void setRaccourcis((v) => !v);
    if (Object.hasOwn(TOUCHES, k)) return choisirOutil(TOUCHES[k]!);
    if (choix.length === 0) {
      if (k === 'r' && outil === 'poser') { setRotation((r) => (r + 90) % 360); ev.preventDefault(); }
      return;
    }
    const els = moteur.document.elements.filter((e) => choix.includes(e.id));
    if (k === 'r') geste(els.map((e) => ({ type: 'pivoter_element', id: e.id, rotation: ((e.rotation ?? 0) + 90) % 360 })));
    else if (k === 'm') geste(els.map((e) => ({ type: 'retourner_element', id: e.id })));
    else if (k === 'delete' || k === 'backspace') geste(els.map((e) => ({ type: 'supprimer_element', id: e.id })));
    else if (k.startsWith('arrow')) {
      const [dx, dy] = k === 'arrowleft' ? [-1, 0] : k === 'arrowright' ? [1, 0] : k === 'arrowup' ? [0, -1] : [0, 1];
      geste(els.map((e) => ({ type: 'deplacer_element', id: e.id, x: e.x + dx, y: e.y + dy })));
    } else return;
    ev.preventDefault();
  }
  // Tool keys work wherever the focus is, but not in a field.
  const toucheRef = useRef(surTouche);
  toucheRef.current = surTouche;
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.('canvas')) return; // the canvas handles its own keys
      toucheRef.current(ev);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const recharger = async () => {
    setRechargement(true);
    try {
      const c = await lire<CarteLue>(base);
      moteur.remplacer(c.document, c.version);
      enr.reprendre();
      setMeta({ titre: c.titre, visible: c.visible ?? true, tailleCase: c.tailleCase });
      setSelection([]);
    } catch {
      dire('Impossible de recharger la carte.');
    } finally {
      setRechargement(false);
      rafraichir();
    }
  };

  async function enregistrerReglage(corps: Record<string, unknown>): Promise<boolean> {
    try {
      await enr.reglage(corps);
      return true;
    } catch {
      dire('Enregistrement impossible. Réessayez.');
      return false;
    }
  }

  async function appliquerTaille(largeur: number, hauteur: number, tailleCase: number): Promise<string | null> {
    const corps: Record<string, unknown> = {};
    if (largeur !== doc.largeur) corps.largeur = largeur;
    if (hauteur !== doc.hauteur) corps.hauteur = hauteur;
    if (tailleCase !== meta.tailleCase) corps.tailleCase = tailleCase;
    if (Object.keys(corps).length === 0) return null;
    try {
      await enr.reglage(corps);
      const c = await lire<CarteLue>(base);
      moteur.remplacer(c.document, c.version);
      setMeta((m) => ({ ...m, tailleCase: c.tailleCase }));
      setSelection([]);
      rafraichir();
      return null;
    } catch (e) {
      const x = e as { statut?: number; code?: string; message?: string };
      return messageRefusTaille({ statut: x.statut ?? 0, code: x.code, message: x.message ?? 'Enregistrement impossible.' }, coeur.tailleMax().largeur, largeur, hauteur);
    }
  }

  async function renommerCarte(t: string) {
    if (t === meta.titre) return;
    const ancien = meta.titre;
    setMeta((m) => ({ ...m, titre: t }));
    if (!(await enregistrerReglage({ titre: t }))) setMeta((m) => ({ ...m, titre: ancien }));
  }

  const annonce = choix.length === 1
    ? (() => {
      const e = doc.elements.find((x) => x.id === choix[0]);
      return e ? `${parId.get(e.asset_id)?.nom ?? 'Asset retiré'}, case ${Math.floor(e.x)}, ${Math.floor(e.y)}, calque ${doc.calques.find((c) => c.id === e.calque)?.nom ?? ''}` : '';
    })()
    : choix.length > 1 ? `${choix.length} éléments sélectionnés` : '';
  const vide = doc.sols.length + doc.murs.length + doc.elements.length === 0;
  const etat = enr.etat;
  const panneauVisible = !etroit || panneau;
  const choixCalque = calqueObjet(doc, calqueChoisi);
  const actifObjet = 'calque' in choixCalque ? choixCalque.calque.id : calqueChoisi;

  return (
    <div className="editeur-carte">
      <header className="editeur-haut">
        <Titre titre={meta.titre} onChanger={async (t) => {
          if (t === meta.titre) return;
          const ancien = meta.titre;
          setMeta((m) => ({ ...m, titre: t }));
          if (!(await enregistrerReglage({ titre: t }))) setMeta((m) => ({ ...m, titre: ancien }));
        }} />
        {!lecture && (
          <Taille
            coeur={coeur}
            largeur={doc.largeur}
            hauteur={doc.hauteur}
            tailleCase={meta.tailleCase}
            ouvert={taille}
            onOuvrir={setTaille}
            appliquer={appliquerTaille}
          />
        )}
        {lecture && <span className="editeur-etat">{doc.largeur} × {doc.hauteur}</span>}
        {!meta.visible && <Pastille sens="mj">Masquée aux joueurs</Pastille>}
        {!lecture && (
          <div className="editeur-visibilite editeur-ecriture">
            <Interrupteur
              etiquette="Visible des joueurs"
              coche={meta.visible}
              ecrit
              onChange={async (v) => {
                setMeta((m) => ({ ...m, visible: v }));
                if (!(await enregistrerReglage({ visible: v }))) setMeta((m) => ({ ...m, visible: !v }));
              }}
            />
          </div>
        )}
        <span className="editeur-etat" role="status">
          {etat === 'reessai' ? 'Enregistrement impossible, nouvelle tentative…' : etat === 'envoi' || etat === 'attente' ? 'Enregistrement…' : etat === 'perime' ? '' : 'Enregistré'}
        </span>
        {!lecture && (
          <>
            <BoutonIcone etiquette="Annuler" infobulle="Annuler (Ctrl+Z)" icone={Undo2} disabled={!moteur.peutAnnuler} onClick={annuler} />
            <BoutonIcone etiquette="Rétablir" infobulle="Rétablir (Ctrl+Maj+Z)" icone={Redo2} disabled={!moteur.peutRefaire} onClick={refaire} />
            <div className="editeur-popover-zone">
              <BoutonIcone etiquette="Raccourcis" infobulle="Raccourcis (?)" icone={Keyboard} aria-expanded={raccourcis} aria-haspopup="dialog" onClick={() => setRaccourcis((v) => !v)} />
              {raccourcis && (
                <div className="editeur-popover" role="dialog" aria-label="Raccourcis" onKeyDown={(e) => e.key === 'Escape' && setRaccourcis(false)}>
                  <h2>Raccourcis</h2>
                  <ul className="editeur-raccourcis">
                    {RACCOURCIS.map(([t, l]) => <li key={t} style={{ display: 'contents' }}><kbd>{t}</kbd><span>{l}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
        {etroit && !lecture && (
          <Bouton className="editeur-bouton-panneau" icone={PanelRight} aria-expanded={panneau} onClick={() => setPanneau((v) => !v)}>Panneau</Bouton>
        )}
        {/* « Jouer » (E-28 morceau): what is queued leaves first, so the table opens on the saved map; E-29 creates the table at the first visit. */}
        <Bouton variante="principal" icone={Play} onClick={() => { void enr.vider().finally(() => naviguer(`/univers/${universId}/outils/battlemap/cartes/${base.split('/').pop()}/jeu`)); }}>Jouer</Bouton>
      </header>

      {lecture && <Bandeau sorte="lecture">{MESSAGE_TELEPHONE}</Bandeau>}
      {(etat === 'perime' || enr.refus !== null) && (
        <div className="editeur-alertes">
          {etat === 'perime' && (
            <Alerte action={<Bouton petit enCours={rechargement} onClick={() => void recharger()}>Recharger</Bouton>}>Cette carte a changé.</Alerte>
          )}
          {enr.refus === 'carte_pleine' && <Alerte>Carte pleine. Retirez des éléments ou agrandissez la carte.</Alerte>}
          {enr.refus === 'refuse' && <Alerte>Ce geste n’a pas pu être enregistré : il a été annulé.</Alerte>}
        </div>
      )}

      <div className="editeur-corps">
        {!lecture && (
          <ColonneOutils
            outils={OUTILS}
            actif={outil}
            onChoisir={choisirOutil}
            pied={<Interrupteur etiquette="Aimanter à la grille" coche={aimanter} onChange={setAimanter} />}
          />
        )}
        <CanevasCarte
          doc={doc}
          tailleCase={meta.tailleCase}
          empreinte={empreinte}
          image={image}
          selection={choix}
          commencer={commencer}
          surIssue={surIssue}
          lecture={lecture}
          annonce={annonce}
          message={message}
          vide={vide && !lecture}
          enChargement={images}
          surTouche={surTouche}
          surDepot={lecture ? undefined : deposer}
        />
        {!lecture && (
          <aside className="editeur-panneau" hidden={!panneauVisible} aria-label="Panneau latéral">
            <Onglets legende="Panneau de la carte" onglets={ONGLETS} actif={onglet} onChange={setOnglet} />
            {onglet === 'bibliotheque' && (
              <Bibliotheque
                universId={universId}
                assets={assets}
                arme={[assetSol, assetMur, assetObjet]}
                onChoisir={(a) => {
                  if (a.categorie === 'sol') { setAssetSol(String(a.id)); choisirOutil('sol'); }
                  else if (a.categorie === 'mur') { setAssetMur(String(a.id)); choisirOutil('mur'); }
                  else { setAssetObjet(String(a.id)); choisirOutil('poser'); }
                }}
              />
            )}
            {onglet === 'calques' && (
              <PanneauCalques
                doc={doc}
                calquesMax={bornes?.calquesMax ?? doc.calques.length + 1}
                actifObjet={actifObjet}
                onActif={(id) => { setCalqueChoisi(id); const c = doc.calques.find((x) => x.id === id); if (c && (c.verrouille || !c.visible)) dire(c.verrouille ? 'Ce calque est verrouillé.' : 'Ce calque est masqué.'); }}
                geste={geste}
                dire={dire}
              />
            )}
            {onglet === 'proprietes' && (
              <PanneauProprietes
                universId={universId}
                doc={doc}
                titre={meta.titre}
                tailleCase={meta.tailleCase}
                visible={meta.visible}
                selection={choix}
                assets={parId}
                bornes={bornes}
                geste={geste}
                dupliquer={dupliquer}
                coeur={coeur}
                renommer={renommerCarte}
                appliquerTaille={appliquerTaille}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Titre({ titre, onChanger }: { titre: string; onChanger: (t: string) => void }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(titre);
  const fin = (valider: boolean) => {
    setEdition(false);
    const t = valeur.trim();
    if (valider && t !== '' && t.length <= 80) onChanger(t);
    else setValeur(titre);
  };
  return (
    <h1 className="editeur-titre">
      {edition ? (
        <input
          className="editeur-titre-champ"
          aria-label="Nom de la carte"
          value={valeur}
          maxLength={80}
          autoFocus
          onChange={(e) => setValeur(e.target.value)}
          onBlur={() => fin(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); }}
        />
      ) : (
        <button type="button" className="editeur-titre-bouton" title="Renommer la carte" onClick={() => { setValeur(titre); setEdition(true); }}>{titre}</button>
      )}
    </h1>
  );
}

function Taille({
  coeur, largeur, hauteur, tailleCase, ouvert, onOuvrir, appliquer,
}: {
  coeur: Coeur; largeur: number; hauteur: number; tailleCase: number; ouvert: boolean; onOuvrir: (v: boolean) => void;
  /** Resolves to the sentence to show under the field, or `null` when the server took the change. */
  appliquer: (largeur: number, hauteur: number, tailleCase: number) => Promise<string | null>;
}) {
  const [l, setL] = useState(String(largeur));
  const [h, setH] = useState(String(hauteur));
  const [c, setC] = useState(String(tailleCase));
  const [erreurs, setErreurs] = useState<{ l?: string; h?: string; c?: string }>({});
  const [enCours, setEnCours] = useState(false);
  const max = coeur.tailleMax();

  useEffect(() => {
    if (ouvert) {
      setL(String(largeur)); setH(String(hauteur)); setC(String(tailleCase)); setErreurs({});
    }
  }, [ouvert, largeur, hauteur, tailleCase]);

  async function valider() {
    const e = { l: erreurTaille(l, max.largeur) ?? undefined, h: erreurTaille(h, max.hauteur) ?? undefined, c: erreurTaille(c, Number.MAX_SAFE_INTEGER) ?? undefined };
    setErreurs(e);
    if (e.l || e.h || e.c) return;
    setEnCours(true);
    const refus = await appliquer(Number(l), Number(h), Number(c));
    setEnCours(false);
    if (refus === null) return onOuvrir(false);
    // The server's sentence belongs to the field it is about: the size pair, else the cell size.
    if (Number(c) !== tailleCase && Number(l) === largeur && Number(h) === hauteur) setErreurs({ c: refus });
    else setErreurs({ h: refus });
  }

  return (
    <div className="editeur-popover-zone editeur-ecriture">
      <Bouton aria-expanded={ouvert} aria-haspopup="dialog" onClick={() => onOuvrir(!ouvert)}>{largeur} × {hauteur} · {tailleCase} px</Bouton>
      {ouvert && (
        <div className="editeur-popover" role="dialog" aria-label="Taille de la carte" onKeyDown={(e) => e.key === 'Escape' && onOuvrir(false)}>
          <h2>Taille de la carte</h2>
          <Champ etiquette="Largeur (cases)" inputMode="numeric" value={l} erreur={erreurs.l} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setL(e.target.value)} />
          <Champ etiquette="Hauteur (cases)" inputMode="numeric" value={h} erreur={erreurs.h} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setH(e.target.value)} />
          <Champ etiquette="Taille de case (px)" inputMode="numeric" value={c} erreur={erreurs.c} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setC(e.target.value)} />
          <Bouton variante="principal" enCours={enCours} ecrit onClick={() => void valider()}>Appliquer</Bouton>
        </div>
      )}
    </div>
  );
}
