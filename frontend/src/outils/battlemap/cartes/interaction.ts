// A pointer gesture of a tool, from press to release: it builds an overlay while it lasts and, at release, the commands of
// ONE batch (a drag is one gesture, never one command per move). It decides nothing about validity: the core refuses.
import {
  type Boite, type Empreintes, type Point, boite, calqueActif, cellule, contour, elementsDans, elementsSous, ligneCellules,
  rectangle, segmentProche, segmentsDroits, sommet,
} from './geometrie';
import type { Calque, Cellule, Commande, Document, Segment } from './types';

export type Outil = 'selection' | 'sol' | 'mur' | 'porte' | 'gomme';

export interface Contexte {
  doc: Document;
  aimanter: boolean;
  empreinte: Empreintes;
  assetSol: string | null;
  assetMur: string | null;
  selection: readonly string[];
}

/** What the canvas draws over the map while the gesture lasts. */
export interface Apercu {
  cellules?: Cellule[];
  segments?: Segment[];
  decalage?: Point;
  cadre?: Boite;
}

export type Issue =
  | { k: 'commandes'; commandes: Commande[] }
  | { k: 'selection'; ids: string[] }
  | { k: 'message'; texte: string }
  | { k: 'rien' };

const MESSAGE_ASSET_SOL = 'Choisissez un sol dans la bibliothèque.';
const MESSAGE_ASSET_MUR = 'Choisissez un mur dans la bibliothèque.';
const MESSAGE_PORTE = 'Cliquez sur un mur pour poser ou ôter une porte.';

const idsDe = (doc: Document, type: Calque['type']) => new Set(doc.calques.filter((c) => c.type === type && c.visible && !c.verrouille).map((c) => c.id));
const memeCellule = (a: Cellule, b: Cellule) => a.x === b.x && a.y === b.y;
const memeSegment = (a: Segment, b: Segment) => a.x === b.x && a.y === b.y && a.cote === b.cote;

export class Interaction {
  private suivi: Point[] = [];
  private decalage: Point = { x: 0, y: 0 };

  constructor(
    readonly outil: Outil,
    private ctx: Contexte,
    private depart: Point,
    private maj: boolean,
  ) {
    this.suivi = [depart];
  }

  deplacer(p: Point, maj = this.maj) {
    this.maj = maj;
    this.suivi.push(p);
    if (this.outil === 'selection') this.decalage = { x: p.x - this.depart.x, y: p.y - this.depart.y };
  }

  private cellules(): Cellule[] {
    const cs = this.suivi.map(cellule);
    if (this.maj && this.outil === 'sol') return rectangle(cs[0]!, cs[cs.length - 1]!);
    const sortie: Cellule[] = [];
    cs.forEach((c, i) => {
      for (const x of i === 0 ? [c] : ligneCellules(cs[i - 1]!, c)) if (!sortie.some((s) => memeCellule(s, x))) sortie.push(x);
    });
    return sortie;
  }

  private murs(): Segment[] {
    const a = sommet(this.depart);
    const b = sommet(this.suivi[this.suivi.length - 1]!);
    return this.maj ? contour(a, b) : segmentsDroits(a, b);
  }

  /** The decalage of a selection drag, snapped when asked: whole cells keep elements on their footprint. */
  private pas(): Point {
    const d = this.decalage;
    return this.ctx.aimanter ? { x: Math.round(d.x), y: Math.round(d.y) } : d;
  }

  apercu(): Apercu {
    switch (this.outil) {
      case 'sol':
      case 'gomme':
        return { cellules: this.cellules() };
      case 'mur':
        return { segments: this.murs() };
      case 'selection': {
        if (this.deplaceElements) return { decalage: this.pas() };
        return this.suivi.length > 1 ? { cadre: boite(this.depart, this.suivi[this.suivi.length - 1]!) } : {};
      }
      default:
        return {};
    }
  }

  /** True when the press started on a selected element: the drag moves the selection instead of drawing a frame. */
  deplaceElements = false;

  terminer(): Issue {
    const fin = this.suivi[this.suivi.length - 1]!;
    switch (this.outil) {
      case 'sol': return this.sol();
      case 'mur': return this.mur();
      case 'porte': return this.porte(fin);
      case 'gomme': return this.gomme();
      case 'selection': return this.selectionner(fin);
    }
  }

  private sol(): Issue {
    const actif = calqueActif(this.ctx.doc, 'sol');
    if ('message' in actif) return { k: 'message', texte: actif.message };
    if (this.ctx.assetSol === null) return { k: 'message', texte: MESSAGE_ASSET_SOL };
    return { k: 'commandes', commandes: [{ type: 'peindre_sol', calque: actif.calque.id, cellules: this.cellules(), asset_id: this.ctx.assetSol }] };
  }

  private mur(): Issue {
    const actif = calqueActif(this.ctx.doc, 'mur');
    if ('message' in actif) return { k: 'message', texte: actif.message };
    if (this.ctx.assetMur === null) return { k: 'message', texte: MESSAGE_ASSET_MUR };
    const segments = this.murs();
    if (segments.length === 0) return { k: 'rien' };
    return { k: 'commandes', commandes: [{ type: 'tracer_mur', calque: actif.calque.id, segments, asset_id: this.ctx.assetMur }] };
  }

  private porte(p: Point): Issue {
    const actif = calqueActif(this.ctx.doc, 'mur');
    if ('message' in actif) return { k: 'message', texte: actif.message };
    const murs = this.ctx.doc.murs.filter((m) => m.calque === actif.calque.id);
    const s = segmentProche(p, murs);
    if (!s) return { k: 'message', texte: MESSAGE_PORTE };
    const porte = !(murs.find((m) => memeSegment(m, s))?.porte ?? false);
    return { k: 'commandes', commandes: [{ type: 'poser_porte', calque: actif.calque.id, x: s.x, y: s.y, cote: s.cote, porte }] };
  }

  /** Erases, on the layers of each type the tools would use, what the pointer crossed (one gesture). */
  private gomme(): Issue {
    const { doc } = this.ctx;
    const commandes: Commande[] = [];
    const sol = calqueActif(doc, 'sol');
    if ('calque' in sol) {
      const cellules = this.cellules().filter((c) => doc.sols.some((s) => s.calque === sol.calque.id && memeCellule(s, c)));
      if (cellules.length) commandes.push({ type: 'gommer', calque: sol.calque.id, cellules });
    }
    const mur = calqueActif(doc, 'mur');
    if ('calque' in mur) {
      const murs = doc.murs.filter((m) => m.calque === mur.calque.id);
      const segments: Segment[] = [];
      for (const p of this.suivi) {
        const s = segmentProche(p, murs);
        if (s && !segments.some((x) => memeSegment(x, s))) segments.push(s);
      }
      if (segments.length) commandes.push({ type: 'gommer', calque: mur.calque.id, segments: segments.map(({ x, y, cote }) => ({ x, y, cote })) });
    }
    const objets = idsDe(doc, 'objet');
    const vus = new Set<string>();
    for (const p of this.suivi) {
      const e = elementsSous(doc, p, objets, this.ctx.empreinte)[0];
      if (e && !vus.has(e.id)) {
        vus.add(e.id);
        commandes.push({ type: 'supprimer_element', id: e.id });
      }
    }
    return commandes.length ? { k: 'commandes', commandes } : { k: 'rien' };
  }

  private selectionner(fin: Point): Issue {
    const { doc, selection } = this.ctx;
    const visibles = new Set(doc.calques.filter((c) => c.type === 'objet' && c.visible && !c.verrouille).map((c) => c.id));
    if (this.deplaceElements) {
      const d = this.pas();
      if (d.x === 0 && d.y === 0) return { k: 'rien' };
      const commandes = selection.flatMap((id): Commande[] => {
        const e = doc.elements.find((x) => x.id === id);
        if (!e) return [];
        const cible = { x: e.x + d.x, y: e.y + d.y };
        return [{ type: 'deplacer_element', id, x: cible.x, y: cible.y }];
      });
      return commandes.length ? { k: 'commandes', commandes } : { k: 'rien' };
    }
    const deplace = Math.hypot(fin.x - this.depart.x, fin.y - this.depart.y) > 0.15;
    const trouves = deplace
      ? elementsDans(doc, boite(this.depart, fin), visibles, this.ctx.empreinte)
      : elementsSous(doc, this.depart, visibles, this.ctx.empreinte).slice(0, 1);
    const ids = trouves.map((e) => e.id);
    if (!this.maj) return { k: 'selection', ids };
    return { k: 'selection', ids: [...new Set([...selection, ...ids])] };
  }
}

/** Does a press of the selection tool land on an element already selected (so the drag moves it)? */
export function surSelection(ctx: Contexte, p: Point): boolean {
  const visibles = new Set(ctx.doc.calques.filter((c) => c.type === 'objet' && c.visible && !c.verrouille).map((c) => c.id));
  const e = elementsSous(ctx.doc, p, visibles, ctx.empreinte)[0];
  return e !== undefined && ctx.selection.includes(e.id);
}

/** The element under a press, to select it at once (a press on an unselected element selects it and may drag it). */
export function elementSous(ctx: Contexte, p: Point): string | undefined {
  const visibles = new Set(ctx.doc.calques.filter((c) => c.type === 'objet' && c.visible && !c.verrouille).map((c) => c.id));
  return elementsSous(ctx.doc, p, visibles, ctx.empreinte)[0]?.id;
}
