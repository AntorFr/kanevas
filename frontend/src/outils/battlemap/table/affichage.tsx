// E-30 — the table display (AD-159, AD-160): black ground, no chrome, read-only. It draws the player view fitted to the GM's shared
// rectangle; the server sends only what a player may see (the core), and every read here asks for the player view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ErreurApi, lire } from '../../../api';
import { CanevasJeu, PageIntrouvable, type ImageAsset } from '../../../ui';
import { appliquerTheme, choixMemorise } from '../../../theme';
import { urlImage } from '../cartes/bibliotheque';
import type { Empreintes } from '../cartes/geometrie';
import type { AssetCarte, CarteLue, Document } from '../cartes/types';
import { ouvrirDirect, type EtatConnexion } from '../flux';
import { Grille, type PionVu, type Rect } from './logique';
import './affichage.css';

interface TableLue { commencee: boolean; document?: Document; pions?: PionVu[]; brouillard?: string; vue?: Rect | null }
type Charge =
  | { k: 'chargement' }
  | { k: 'introuvable' }
  | { k: 'ok'; carte: CarteLue; table: TableLue };

const AUCUN = new Set<string>();
const SANS_APERCU = {};
const RELANCE_MS = 3000;
const CALME_MS = 3000;

export function Affichage({ universId, cid }: { universId: number; cid: string }) {
  const base = `/api/univers/${universId}/outils/battlemap/cartes/${cid}`;
  const [charge, setCharge] = useState<Charge>({ k: 'chargement' });
  const [connexion, setConnexion] = useState<EtatConnexion>('connexion');
  const [echec, setEchec] = useState(0);
  const [assets, setAssets] = useState<AssetCarte[] | null>(null);
  const [images, setImages] = useState(0);
  const [calme, setCalme] = useState(false);
  const cache = useRef(new Map<string, HTMLImageElement>());

  // The dark theme is forced here, whatever the account's choice, and given back on leaving.
  useEffect(() => {
    appliquerTheme('sombre');
    return () => appliquerTheme(choixMemorise());
  }, []);

  /** Refetches the player's table and the map; rejects when unreachable (the stream shows « Reconnexion… »). */
  const recharger = useCallback(async () => {
    try {
      const table = await lire<TableLue>(`${base}/table?mode=joueur`);
      const carte = await lire<CarteLue>(`${base}?mode=joueur`);
      setCharge({ k: 'ok', carte, table });
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 404 || e.statut === 403)) { setCharge({ k: 'introuvable' }); return; }
      throw e;
    }
  }, [base]);

  useEffect(() => {
    let actif = true;
    recharger().catch(() => actif && setEchec((n) => n + 1));
    return () => { actif = false; };
  }, [recharger]);

  // A first load that failed retries by itself, on the black ground.
  useEffect(() => {
    if (echec === 0 || charge.k !== 'chargement') return;
    const t = setTimeout(() => { recharger().catch(() => setEchec((n) => n + 1)); }, RELANCE_MS);
    return () => clearTimeout(t);
  }, [echec, charge.k, recharger]);

  const lu = charge.k === 'ok';
  useEffect(() => {
    if (!lu) return;
    const direct = ouvrirDirect({ url: `${base}/flux?role=affichage`, recharger, surEtat: setConnexion });
    return () => direct.fermer();
  }, [lu, base, recharger]);

  useEffect(() => {
    if (!lu) return;
    let actif = true;
    lire<{ assets: AssetCarte[] }>(`/api/univers/${universId}/outils/battlemap/assets`).then((l) => actif && setAssets(l.assets), () => actif && setAssets([]));
    return () => { actif = false; };
  }, [lu, universId]);

  // The cursor goes after 3 s without movement.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const armer = () => { setCalme(false); clearTimeout(t); t = setTimeout(() => setCalme(true), CALME_MS); };
    armer();
    window.addEventListener('mousemove', armer);
    return () => { clearTimeout(t); window.removeEventListener('mousemove', armer); };
  }, []);

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
  void images;

  const doc = charge.k === 'ok' ? charge.table.document : undefined;
  const brouillard = charge.k === 'ok' ? charge.table.brouillard : undefined;
  const grille = useMemo(() => (doc && brouillard !== undefined ? new Grille(doc.largeur, doc.hauteur, brouillard) : null), [doc, brouillard]);
  // The server sends a player only the tokens he sees (and no `visible` flag): they are drawn plainly.
  const pions = useMemo<PionVu[]>(() => (charge.k === 'ok' ? charge.table.pions ?? [] : []).map((p) => ({ ...p, visible: true })), [charge]);
  const sans = () => undefined;
  const sansBas = () => false;

  if (charge.k === 'introuvable') return <div className="affichage"><PageIntrouvable /></div>;
  if (charge.k === 'chargement') return <div className="affichage" />;
  const { carte, table } = charge;
  const classe = `affichage${calme ? ' calme' : ''}`;
  const badge = connexion === 'perdue' && <p className="affichage-badge" role="status">Reconnexion…</p>;

  if (!table.commencee) {
    return <div className={classe}><h1 className="affichage-centre affichage-attente" role="status">La partie n’a pas commencé.</h1>{badge}</div>;
  }
  if (!table.vue || !doc) {
    return <div className={classe}><h1 className="affichage-centre affichage-attente" role="status">En attente du MJ</h1>{badge}</div>;
  }
  return (
    <div className={classe}>
      <CanevasJeu
        doc={doc} tailleCase={carte.tailleCase} empreinte={empreinte} image={image} pions={pions} selection={null}
        grille={grille} mj={false} calquesMasques={AUCUN} apercu={SANS_APERCU} libre={false} suivre={table.vue}
        annonce="" message="" surBas={sansBas} surBouge={sans} surHaut={sans} affichage
      />
      {badge}
    </div>
  );
}
