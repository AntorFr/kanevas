// E-29 — play (AD-battlemap-table-5, -6): the GM's table (tools, tokens, fog, shared view) and the player's read-only view of it.
// The server filters what a player reads and refuses what is not allowed (the core); this screen draws and sends commands.
import {
  Copy, Eye, EyeOff, Link2, Lock, MousePointer2, PanelRight, Plus, Pencil, RotateCcw, ScreenShare, Trash2, UserRound, Unlink, BookOpen, Eraser,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { appeler, ErreurApi, lire } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import {
  Alerte, Bouton, BoutonIcone, BoiteDialogue, CanevasJeu, Chargement, ColonneOutils, ErreurChargement, Interrupteur, Menu, Onglets, PageIntrouvable, Pastille, Segments,
  type EntreeOutil, type ImageAsset, type PoigneeJeu, type ApercuJeu,
} from '../../../ui';
import { ChoixFiche } from '../cartes/proprietes';
import { urlImage } from '../cartes/bibliotheque';
import type { Empreintes, Point } from '../cartes/geometrie';
import { boiteElement, elementsSous } from '../cartes/geometrie';
import type { AssetCarte, CarteLue, Document } from '../cartes/types';
import { ouvrirDirect, avecReprise, TableChangee, type EtatConnexion } from '../flux';
import { AjouterPion, ChoixProprietaire, PanneauFiche, type Membre, type SpecPion } from './dialogues';
import {
  Grille, celluleLibre, commandePiece, commandeRect, cellulesPinceau, nouvelIdPion, pionSous, rectEntre, rectPartage, rectsDeCellules,
  type GestePinceau, type PionVu, type Rect, type Pion,
} from './logique';
import './jeu.css';

/** AD-163: the tokens a table holds. The server refuses the 201st (`table_pleine`); this only lets the alert show before the try. */
const PIONS_MAX = 200;
const CLE_SUIVRE = 'kanevas.battlemap.suivre-le-mj';
const REGLAGE_VUE_MS = 300;

interface TableMJ { commencee: true; version: number; peutEcrire: true; etat: { pions: Pion[]; brouillard: string; vue: Rect | null; calques_masques: string[] }; proprietaires: Record<string, number> }
interface TableJoueur { commencee: true; version: number; document: Document; pions: PionVu[]; brouillard: string; vue: Rect | null }
type Table = TableMJ | TableJoueur | { commencee: false; peutEcrire?: true };

type Outil = 'pions' | 'reveler' | 'masquer';
const OUTILS: readonly EntreeOutil<Outil>[] = [
  { valeur: 'pions', libelle: 'Pions', touche: 'P', icone: MousePointer2 },
  { valeur: 'reveler', libelle: 'Révéler', touche: 'R', icone: Eye },
  { valeur: 'masquer', libelle: 'Masquer', touche: 'M', icone: EyeOff },
];
type ModeFog = GestePinceau;
const MODES: readonly { valeur: ModeFog; libelle: string }[] = [
  { valeur: 'pinceau', libelle: 'Pinceau' },
  { valeur: 'rectangle', libelle: 'Rectangle' },
  { valeur: 'piece', libelle: 'Pièce' },
];
const TAILLES: readonly { valeur: '1' | '2' | '3'; libelle: string }[] = [
  { valeur: '1', libelle: '1 case' }, { valeur: '2', libelle: '2 cases' }, { valeur: '3', libelle: '3 cases' },
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

const suivreEnregistre = (): boolean => {
  try { return window.localStorage.getItem(CLE_SUIVRE) !== 'non'; } catch { return true; }
};

type Charge =
  | { k: 'chargement' }
  | { k: 'introuvable' }
  | { k: 'erreur' }
  | { k: 'ok'; carte: CarteLue; table: Table };

/** E-29 for whoever reads the map: the GM outside Player mode gets the tools, anyone else the player view. */
export function Jeu({ universId, cid, suffixe }: { universId: number; cid: string; suffixe: string }) {
  const base = `/api/univers/${universId}/outils/battlemap/cartes/${cid}`;
  const [charge, setCharge] = useState<Charge>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const versionRef = useRef(0);
  const [connexion, setConnexion] = useState<EtatConnexion>('connexion');
  const [affichages, setAffichages] = useState<number | null>(null);
  const [assets, setAssets] = useState<AssetCarte[] | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);

  /** The whole state of the screen, refetched: the table (created at the GM's first « Jouer »), then the map. Rejects when unreachable. */
  const recharger = useCallback(async () => {
    try {
      let table = await lire<Table>(`${base}/table${suffixe}`);
      if (!table.commencee && table.peutEcrire) table = await appeler<Table>('POST', `${base}/table`, {});
      const carte = await lire<CarteLue>(`${base}${suffixe}`);
      if (table.commencee) versionRef.current = table.version;
      setCharge({ k: 'ok', carte, table });
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 404 || e.statut === 403)) { setCharge({ k: 'introuvable' }); return; }
      throw e;
    }
  }, [base, suffixe]);

  useEffect(() => {
    let actif = true;
    setCharge({ k: 'chargement' });
    recharger().catch(() => actif && setCharge({ k: 'erreur' }));
    return () => { actif = false; };
  }, [recharger, essai]);

  const pret = charge.k === 'ok';
  useEffect(() => {
    if (!pret) return;
    const direct = ouvrirDirect({
      url: `${base}/flux${suffixe}`, recharger, surEtat: setConnexion, surPresence: setAffichages,
    });
    return () => direct.fermer();
  }, [pret, base, suffixe, recharger]);

  useEffect(() => {
    if (!pret) return;
    let actif = true;
    lire<{ assets: AssetCarte[] }>(`/api/univers/${universId}/outils/battlemap/assets`).then((l) => actif && setAssets(l.assets), () => actif && setAssets([]));
    return () => { actif = false; };
  }, [pret, universId]);

  const mj = charge.k === 'ok' && charge.table.commencee && 'peutEcrire' in charge.table;
  useEffect(() => {
    if (!mj) return;
    let actif = true;
    lire<Membre[]>(`/api/univers/${universId}/membres`).then((l) => actif && setMembres(l), () => undefined);
    return () => { actif = false; };
  }, [mj, universId]);

  useTitreAriane(charge.k === 'ok' ? charge.carte.titre : undefined, 'Cartes');

  if (charge.k === 'introuvable') return <PageIntrouvable />;
  if (charge.k === 'erreur') return <ErreurChargement page texte="Impossible de charger la partie." onReessayer={() => setEssai((n) => n + 1)} />;
  if (charge.k === 'chargement') return <Chargement texte="Chargement de la partie…" />;
  const { carte, table } = charge;
  if (!table.commencee) {
    return (
      <div className="page-message" role="status">
        <h1>La partie n’a pas commencé.</h1>
      </div>
    );
  }
  return (
    <Partie
      universId={universId} cid={cid} base={base} carte={carte} table={table} assets={assets} membres={membres}
      connexion={connexion} affichages={affichages} recharger={recharger} versionRef={versionRef}
    />
  );
}

function Partie({
  universId, cid, base, carte, table, assets, membres, connexion, affichages, recharger, versionRef,
}: {
  universId: number; cid: string; base: string; carte: CarteLue; table: TableMJ | TableJoueur; assets: AssetCarte[] | null; membres: Membre[];
  connexion: EtatConnexion; affichages: number | null; recharger: () => Promise<void>; versionRef: { current: number };
}) {
  const gm = 'peutEcrire' in table;
  const perdue = connexion === 'perdue';
  const etroit = useMedia('(max-width: 768px)');
  const [outil, setOutil] = useState<Outil>('pions');
  const [mode, setMode] = useState<ModeFog>('pinceau');
  const [taillePinceau, setTaillePinceau] = useState<'1' | '2' | '3'>('1');
  const [onglet, setOnglet] = useState<'pions' | 'calques'>('pions');
  const [panneau, setPanneau] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [selectionElement, setSelectionElement] = useState<string | null>(null);
  const [fiche, setFiche] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [lier, setLier] = useState<string | null>(null);
  const [proprio, setProprio] = useState<string | null>(null);
  const [reinit, setReinit] = useState(false);
  const [enReinit, setEnReinit] = useState(false);
  const [echec, setEchec] = useState(false);
  const [pleine, setPleine] = useState(false);
  const [change, setChange] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState(0);
  const [apercu, setApercu] = useState<ApercuJeu>({});
  const [copie, setCopie] = useState(false);
  const [suivre, setSuivre] = useState(suivreEnregistre);
  const [partage, setPartage] = useState(() => gm && (table as TableMJ).etat.vue !== null);
  const poignee = useRef<PoigneeJeu>(null);
  const cache = useRef(new Map<string, HTMLImageElement>());
  const minuteurVue = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doc: Document = gm ? carte.document : (table as TableJoueur).document;
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
  // `images` is a dependency on purpose: a new identity redraws the canvas when a picture has loaded.
  }, [assets, parId, universId, images]);

  const pions: PionVu[] = useMemo(() => {
    if (!gm) return (table as TableJoueur).pions.map((p) => ({ ...p, visible: true }));
    return (table as TableMJ).etat.pions.map((p) => {
      const e = p.asset_id !== null ? empreinte(p.asset_id) : { largeur: 1, hauteur: 1 };
      return { ...p, l: e.largeur, h: e.hauteur };
    });
  }, [gm, table, empreinte]);
  const grille = useMemo(() => new Grille(doc.largeur, doc.hauteur, 'etat' in table ? table.etat.brouillard : table.brouillard), [doc.largeur, doc.hauteur, table]);
  const masques = useMemo(() => new Set(gm ? (table as TableMJ).etat.calques_masques : []), [gm, table]);
  const vuePartagee = gm ? (table as TableMJ).etat.vue : (table as TableJoueur).vue;
  const proprietaires = gm ? (table as TableMJ).proprietaires : {};
  const nomMembre = (id: number | undefined) => (id === undefined ? null : membres.find((m) => m.compteId === id)?.username ?? 'Membre');
  const plein = pions.length >= PIONS_MAX || pleine;

  const dire = useCallback((t: string) => { setMessage(t); setTimeout(() => setMessage(''), 3500); }, []);

  /** A GM's write at the version read; the same batch is sent once more on a `conflit`, a second one says « Cette table a changé ». */
  const ecrire = useCallback(async (commandes: unknown[]): Promise<boolean> => {
    setEchec(false);
    try {
      await avecReprise(
        () => appeler('POST', `${base}/table/commandes`, { version: versionRef.current, commandes }),
        recharger,
      );
      await recharger();
      return true;
    } catch (e) {
      if (e instanceof TableChangee) setChange(true);
      else if (e instanceof ErreurApi && e.code === 'table_pleine') setPleine(true);
      else setEchec(true);
      await recharger().catch(() => undefined);
      return false;
    }
  }, [base, recharger, versionRef]);

  // ---- the shared view: while on, each pan or zoom settles 300 ms, then is the view.
  const envoyerVue = useCallback((r: Rect) => {
    const v = rectPartage(r, doc.largeur, doc.hauteur);
    if (v) void ecrire([{ type: 'partager_vue', vue: v }]);
  }, [doc.largeur, doc.hauteur, ecrire]);
  const surVue = useCallback((r: Rect) => {
    if (!gm || !partage) return;
    clearTimeout(minuteurVue.current);
    minuteurVue.current = setTimeout(() => envoyerVue(r), REGLAGE_VUE_MS);
  }, [gm, partage, envoyerVue]);
  useEffect(() => () => clearTimeout(minuteurVue.current), []);

  // ---- gestures
  const geste = useRef<
    | { k: 'pinceau'; cellules: Map<string, [number, number]> }
    | { k: 'rect'; depart: { x: number; y: number }; actuel: { x: number; y: number } }
    | { k: 'piece' }
    | { k: 'pion'; id: string; dx: number; dy: number; x: number; y: number; bouge: boolean }
    | null
  >(null);
  const cellule = (p: Point) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
  const dedans = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < doc.largeur && c.y < doc.hauteur;
  const bornee = (c: { x: number; y: number }) => ({ x: Math.min(doc.largeur - 1, Math.max(0, c.x)), y: Math.min(doc.hauteur - 1, Math.max(0, c.y)) });
  const reveler = outil === 'reveler';
  const outilsActifs = gm && !perdue;

  /** Selects what is under the point (a token, else an element that carries a sheet) — the « Ouvrir la fiche » bar follows. */
  function choisirSous(p: Point): PionVu | undefined {
    const c = cellule(p);
    const pion = pionSous(pions, c.x, c.y);
    setSelection(pion?.id ?? null);
    if (pion) { setSelectionElement(null); return pion; }
    const calques = new Set(doc.calques.filter((k) => k.visible).map((k) => k.id));
    const e = elementsSous(doc, p, calques, empreinte).find((x) => x.fiche_id !== undefined);
    setSelectionElement(e?.id ?? null);
    return undefined;
  }

  const surBas = (p: Point): boolean => {
    const c = cellule(p);
    if (!outilsActifs) { choisirSous(p); return false; }
    if (outil === 'pions') {
      const pion = choisirSous(p);
      if (!pion) return false;
      geste.current = { k: 'pion', id: pion.id, dx: c.x - pion.x, dy: c.y - pion.y, x: pion.x, y: pion.y, bouge: false };
      return true;
    }
    if (!dedans(c)) return false;
    if (mode === 'pinceau') {
      const cellules = new Map<string, [number, number]>();
      for (const k of cellulesPinceau(c.x, c.y, Number(taillePinceau), doc.largeur, doc.hauteur)) cellules.set(`${k[0]},${k[1]}`, k);
      geste.current = { k: 'pinceau', cellules };
      setApercu({ rects: rectsDeCellules(cellules.values()), reveler });
    } else if (mode === 'rectangle') {
      geste.current = { k: 'rect', depart: c, actuel: c };
      setApercu({ rects: [rectEntre(c, c)], reveler });
    } else {
      geste.current = { k: 'piece' };
    }
    return true;
  };
  const surBouge = (p: Point) => {
    const g = geste.current;
    if (!g) return;
    const c = cellule(p);
    if (g.k === 'pinceau') {
      for (const k of cellulesPinceau(Math.min(doc.largeur - 1, Math.max(0, c.x)), Math.min(doc.hauteur - 1, Math.max(0, c.y)), Number(taillePinceau), doc.largeur, doc.hauteur)) g.cellules.set(`${k[0]},${k[1]}`, k);
      setApercu({ rects: rectsDeCellules(g.cellules.values()), reveler });
    } else if (g.k === 'rect') {
      g.actuel = bornee(c);
      setApercu({ rects: [rectEntre(g.depart, g.actuel)], reveler });
    } else if (g.k === 'pion') {
      const pion = pions.find((q) => q.id === g.id);
      if (!pion) return;
      g.x = Math.min(doc.largeur - pion.l, Math.max(0, c.x - g.dx));
      g.y = Math.min(doc.hauteur - pion.h, Math.max(0, c.y - g.dy));
      g.bouge = g.x !== pion.x || g.y !== pion.y;
      setApercu({ pion: { id: g.id, x: g.x, y: g.y } });
    }
  };
  const surHaut = (p: Point) => {
    const g = geste.current;
    geste.current = null;
    setApercu({});
    if (!g) return;
    const c = cellule(p);
    if (g.k === 'pinceau') {
      const rects = rectsDeCellules(g.cellules.values());
      if (rects.length) void ecrire(rects.map((r) => commandeRect(reveler, r)));
    } else if (g.k === 'rect') {
      void ecrire([commandeRect(reveler, rectEntre(g.depart, bornee(c)))]);
    } else if (g.k === 'piece') {
      if (dedans(c)) void ecrire([commandePiece(reveler, c.x, c.y)]);
    } else if (g.bouge) {
      void ecrire([{ type: 'deplacer_pion', id: g.id, x: g.x, y: g.y }]);
    }
  };

  // ---- tokens
  async function ajouterPion(s: SpecPion): Promise<string | null> {
    const pion = { nom: s.nom, asset_id: s.assetId, fiche_id: s.ficheId };
    const e = pion.asset_id !== null ? empreinte(pion.asset_id) : { largeur: 1, hauteur: 1 };
    const centre = poignee.current?.centre() ?? { x: doc.largeur / 2, y: doc.hauteur / 2 };
    const case_ = celluleLibre(pions, e.largeur, e.hauteur, centre.x - e.largeur / 2, centre.y - e.hauteur / 2, doc.largeur, doc.hauteur);
    if (!case_) return 'Il n’y a plus de place sur la carte.';
    const id = nouvelIdPion();
    setPleine(false);
    setEchec(false);
    try {
      await avecReprise(() => appeler('POST', `${base}/table/commandes`, {
        version: versionRef.current,
        commandes: [{ type: 'ajouter_pion', id, ...pion, x: case_.x, y: case_.y, visible: true }],
      }), recharger);
      if (s.proprietaire !== null) await appeler('PUT', `${base}/table/pions/${id}/proprietaire`, { compte_id: s.proprietaire });
      await recharger();
      setSelection(id);
      setAjout(false);
      return null;
    } catch (e) {
      await recharger().catch(() => undefined);
      if (e instanceof ErreurApi && e.code === 'table_pleine') { setPleine(true); return 'Cette table est pleine (200 pions).'; }
      if (e instanceof TableChangee) { setChange(true); return 'Cette table a changé.'; }
      return 'L’action n’a pas abouti.';
    }
  }

  async function definirProprietaire(pid: string, compteId: number | null): Promise<boolean> {
    try {
      await appeler('PUT', `${base}/table/pions/${pid}/proprietaire`, { compte_id: compteId });
      await recharger();
      return true;
    } catch {
      return false;
    }
  }

  const pionSelectionne = pions.find((p) => p.id === selection);
  const elementSelectionne = doc.elements.find((e) => e.id === selectionElement);
  const ficheSelection = pionSelectionne?.fiche_id ?? elementSelectionne?.fiche_id ?? null;

  const adresseAffichage = `${window.location.origin}/univers/${universId}/outils/battlemap/cartes/${cid}/affichage`;
  async function copierAdresse() {
    try {
      await navigator.clipboard.writeText(adresseAffichage);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      dire('Copie impossible.');
    }
  }

  async function reinitialiser() {
    setEnReinit(true);
    const ok = await ecrire([{ type: 'reinitialiser' }]);
    setEnReinit(false);
    if (ok) { setReinit(false); setSelection(null); setPartage(false); }
  }

  const libelleStatut = perdue ? 'Connexion perdue.' : affichages !== null && affichages > 0 ? 'Écran joueurs connecté' : 'Aucun écran joueur connecté';
  const enSuivi = !gm && suivre && vuePartagee !== null ? vuePartagee : null;

  const lignePion = (p: PionVu) => {
    const proprio = nomMembre(proprietaires[p.id]);
    const retire = p.asset_id !== null && assets !== null && !parId.has(p.asset_id);
    const entrees = [
      p.fiche_id === null
        ? { libelle: 'Lier une fiche…', icone: Link2, onChoisir: () => setLier(p.id) }
        : { libelle: 'Délier', icone: Unlink, onChoisir: () => void ecrire([{ type: 'regler_pion', id: p.id, fiche_id: null }]) },
      ...(p.fiche_id !== null ? [{ libelle: 'Ouvrir la fiche', icone: BookOpen, onChoisir: () => setFiche(p.fiche_id) }] : []),
      { libelle: 'Propriétaire…', icone: UserRound, onChoisir: () => setProprio(p.id) },
      { libelle: 'Retirer le pion', icone: Trash2, danger: true, onChoisir: () => void ecrire([{ type: 'retirer_pion', id: p.id }]) },
    ];
    return (
      <li key={p.id} className={`jeu-pion${selection === p.id ? ' choisi' : ''}${p.visible ? '' : ' cache'}`}>
        <button type="button" className="jeu-pion-corps" title={p.nom} aria-pressed={selection === p.id} onClick={() => { setSelection(p.id); setSelectionElement(null); }}>
          <span className="jeu-pion-nom">{p.nom}</span>
          <small title={proprio ?? undefined}>{proprio ?? 'Sans propriétaire'}{retire ? ' · Asset retiré' : ''}</small>
        </button>
        {!p.visible && <Pastille sens="mj">Masqué aux joueurs</Pastille>}
        <BoutonIcone
          etiquette={p.visible ? `Masquer ${p.nom} aux joueurs` : `Montrer ${p.nom} aux joueurs`}
          icone={p.visible ? Eye : EyeOff}
          disabled={perdue}
          onClick={() => void ecrire([{ type: 'regler_pion', id: p.id, visible: !p.visible }])}
        />
        <Menu etiquette={`Actions sur ${p.nom}`} icone={Pencil} entrees={entrees} desactive={perdue} />
      </li>
    );
  };

  const panneauVisible = !etroit || panneau;
  const cible = lier !== null ? pions.find((p) => p.id === lier) : undefined;

  return (
    <div className="jeu">
      <header className="jeu-haut">
        <h1 className="jeu-titre" title={carte.titre}>{carte.titre}</h1>
        {gm && (
          <>
            <span className={`jeu-statut${perdue ? ' perdue' : affichages ? ' connecte' : ''}`} role="status">
              <span className="jeu-point" aria-hidden="true" />{libelleStatut}
            </span>
            <Menu
              etiquette="Écran joueurs" declencheur="Écran joueurs" icone={ScreenShare} varianteDeclencheur="fantome-petit"
              entrees={[
                { libelle: 'Ouvrir l’écran joueurs', icone: ScreenShare, onChoisir: () => window.open(adresseAffichage, '_blank', 'noopener') },
                { libelle: copie ? 'Adresse copiée' : 'Copier l’adresse', icone: Copy, onChoisir: () => void copierAdresse() },
              ]}
            />
            <Bouton icone={RotateCcw} disabled={perdue} onClick={() => setReinit(true)}>Réinitialiser la table…</Bouton>
            <Link className="bouton neutre" to={`/univers/${universId}/outils/battlemap/cartes/${cid}`}>Modifier la carte</Link>
            {etroit && <Bouton className="editeur-bouton-panneau" icone={PanelRight} aria-expanded={panneau} onClick={() => setPanneau((v) => !v)}>Panneau</Bouton>}
          </>
        )}
      </header>

      {perdue && <div className="jeu-bande" role="status">Connexion perdue.</div>}
      {(echec || plein || change) && (
        <div className="editeur-alertes">
          {echec && <Alerte>L’action n’a pas abouti.</Alerte>}
          {plein && <Alerte sens="avertissement">Table pleine. Cette table est pleine (200 pions).</Alerte>}
          {change && <Alerte action={<Bouton petit onClick={() => { setChange(false); void recharger(); }}>Recharger</Bouton>}>Cette table a changé</Alerte>}
        </div>
      )}

      <div className="jeu-corps">
        {gm && (
          <ColonneOutils
            outils={OUTILS}
            actif={outil}
            onChoisir={(o) => { if (!perdue) setOutil(o); }}
            pied={
              <Interrupteur
                etiquette="Vue partagée" coche={partage} disabled={perdue}
                onChange={(v) => {
                  setPartage(v);
                  if (v && poignee.current) envoyerVue(poignee.current.rect());
                }}
              />
            }
          />
        )}
        <div className="jeu-centre">
          {gm && outil !== 'pions' && (
            <div className="jeu-modes">
              <Segments legende="Geste" options={MODES} valeur={mode} onChange={setMode} />
              {mode === 'pinceau' && <Segments legende="Taille du pinceau" options={TAILLES} valeur={taillePinceau} onChange={setTaillePinceau} />}
            </div>
          )}
          <CanevasJeu
            doc={doc} tailleCase={carte.tailleCase} empreinte={empreinte} image={image} pions={pions} selection={selection}
            grille={grille} mj={gm} calquesMasques={masques} apercu={apercu} libre={!gm || perdue}
            suivre={enSuivi} annonce={pionSelectionne ? `${pionSelectionne.nom}, case ${pionSelectionne.x}, ${pionSelectionne.y}` : ''} message={message}
            surBas={surBas} surBouge={surBouge} surHaut={surHaut} surVue={surVue} poignee={poignee}
          />
          {ficheSelection !== null && (
            <div className="jeu-barre-fiche">
              <Bouton icone={BookOpen} onClick={() => setFiche(ficheSelection)}>Ouvrir la fiche</Bouton>
            </div>
          )}
          {!gm && (
            <div className="jeu-suivre">
              <Interrupteur etiquette="Suivre le MJ" coche={suivre} onChange={(v) => {
                setSuivre(v);
                try { window.localStorage.setItem(CLE_SUIVRE, v ? 'oui' : 'non'); } catch { /* the setting stays for this page */ }
              }} />
            </div>
          )}
        </div>
        {gm && (
          <aside className="editeur-panneau jeu-panneau" hidden={!panneauVisible} aria-label="Panneau latéral">
            <Onglets legende="Panneau de la table" onglets={[{ valeur: 'pions', libelle: 'Pions' }, { valeur: 'calques', libelle: 'Calques' }]} actif={onglet} onChange={setOnglet} />
            {onglet === 'pions' && (
              <section className="jeu-pions" aria-label="Pions">
                <Bouton variante="principal" icone={Plus} disabled={perdue || plein} onClick={() => setAjout(true)}>Ajouter un pion</Bouton>
                {vuePartagee !== null && (
                  <Bouton icone={Eraser} disabled={perdue} onClick={() => { setPartage(false); void ecrire([{ type: 'partager_vue', vue: null }]); }}>Effacer la vue</Bouton>
                )}
                {pions.length === 0 ? <p className="editeur-note">Aucun pion.</p> : <ul className="jeu-pions-liste">{pions.map(lignePion)}</ul>}
              </section>
            )}
            {onglet === 'calques' && (
              <section className="jeu-calques" aria-label="Calques">
                <ul className="editeur-calques-liste">
                  {doc.calques.map((c) => (
                    <li key={c.id} className={`editeur-calque jeu-calque${c.mj_seul ? ' mj' : ''}`}>
                      <span className="editeur-calque-nom" title={c.nom}>{c.nom}</span>
                      {c.mj_seul
                        ? <Pastille sens="mj" icone={Lock}>MJ seul</Pastille>
                        : <Interrupteur etiquette={`Visible des joueurs : ${c.nom}`} coche={!masques.has(c.id)} disabled={perdue}
                          onChange={(v) => void ecrire([{ type: 'regler_calque_joueurs', calque: c.id, montre: v }])} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
        {fiche !== null && <PanneauFiche universId={universId} ficheId={fiche} onFermer={() => setFiche(null)} />}
      </div>

      {ajout && <AjouterPion universId={universId} assets={assets} membres={membres} onFermer={() => setAjout(false)} onAjouter={ajouterPion} />}
      {lier !== null && cible && (
        <ChoixFiche universId={universId} onFermer={() => setLier(null)} onChoisir={(f) => { setLier(null); void ecrire([{ type: 'regler_pion', id: cible.id, fiche_id: String(f.id) }]); }} />
      )}
      {proprio !== null && pions.find((p) => p.id === proprio) && (
        <ChoixProprietaire nom={pions.find((p) => p.id === proprio)!.nom} membres={membres} courant={proprietaires[proprio] ?? null}
          onFermer={() => setProprio(null)} onChoisir={(c) => definirProprietaire(proprio, c)} />
      )}
      {reinit && (
        <BoiteDialogue titre="Réinitialiser la table" texte="Les pions, le brouillard et la vue partagée seront effacés." action="Réinitialiser" icone={RotateCcw}
          enCours={enReinit} onConfirmer={() => void reinitialiser()} onFermer={() => setReinit(false)} />
      )}
    </div>
  );
}
