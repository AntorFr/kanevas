// Sprites of the system map (AD-carte-3): `dessiner` of the core called in the browser, one sprite cached per
// `(cle, cote)`. A blurred version (the same function at 16 px, scaled and smoothed) comes first for every body, then the
// sharp one at the side the zoom needs, shown after a 160 ms fade (none under reduced motion).
import { dessiner, versionRendu } from '../../../wasm/coeur';

export const COTE_FLOU = 16;
export const FONDU_MS = 160;

export type Dessineur = (aspect: string, cote: number) => Promise<Uint8Array>;

/** The core's drawing at the renderer's current version; rejects if the core cannot load. */
export const dessineurDuCoeur: Dessineur = async (aspect, cote) => dessiner(aspect, cote, await versionRendu());

interface Net { image: HTMLCanvasElement; depuis: number }
interface Demande { cle: string; aspect: string; cote: number }

function versCanvas(octets: Uint8Array, cote: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = cote;
  const data = new ImageData(new Uint8ClampedArray(octets.buffer, octets.byteOffset, octets.byteLength).slice(), cote, cote);
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c;
}

export class Sprites {
  private flous = new Map<string, HTMLCanvasElement>();
  private nets = new Map<string, Net>();
  private vus = new Set<string>();
  private file: Demande[] = [];
  private enCours = false;
  private arrete = false;
  /** Set when the core refuses to draw (not only a body): the screen then falls back to the lists. */
  public echecs = new Set<string>();

  constructor(private dessineur: Dessineur, private change: () => void, private reduit: boolean, private erreurCoeur: () => void) {}

  arreter() { this.arrete = true; this.file = []; }

  /** Asks the blurred version, then the sharp one at `cote`; asking again for the same pair does nothing. */
  demander(cle: string, aspect: string, cote: number) {
    const f = `f|${cle}`, n = `n|${cle}|${cote}`;
    if (!this.vus.has(f)) { this.vus.add(f); this.file.push({ cle, aspect, cote: COTE_FLOU }); }
    if (!this.vus.has(n)) { this.vus.add(n); this.file.push({ cle, aspect, cote }); }
    this.file.sort((a, b) => (a.cote === COTE_FLOU ? 0 : 1) - (b.cote === COTE_FLOU ? 0 : 1));
    void this.pomper();
  }

  private async pomper() {
    if (this.enCours) return;
    this.enCours = true;
    try {
      while (this.file.length > 0 && !this.arrete) {
        const d = this.file.shift()!;
        try {
          const octets = await this.dessineur(d.aspect, d.cote);
          if (this.arrete) return;
          const image = versCanvas(octets, d.cote);
          if (d.cote === COTE_FLOU) this.flous.set(d.cle, image);
          else this.nets.set(`${d.cle}|${d.cote}`, { image, depuis: performance.now() });
        } catch {
          // A body the core cannot draw keeps what it has; if it is the core itself, the screen is told once.
          this.echecs.add(`${d.cle}|${d.cote}`);
          if (this.flous.size === 0 && this.nets.size === 0) { this.erreurCoeur(); return; }
        }
        this.change();
        // Let the browser breathe between two drawings (a sprite at 512 px takes a few milliseconds).
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      this.enCours = false;
    }
  }

  /** What to draw for a body wanting `cote`, back to front, with each image's alpha at `maintenant`. */
  couches(cle: string, cote: number, maintenant: number): { image: HTMLCanvasElement; alpha: number }[] {
    const sortie: { image: HTMLCanvasElement; alpha: number }[] = [];
    const flou = this.flous.get(cle);
    if (flou) sortie.push({ image: flou, alpha: 1 });
    const nets = [...this.nets.entries()].filter(([k]) => k.startsWith(`${cle}|`))
      .map(([k, v]) => ({ cote: Number(k.slice(cle.length + 1)), ...v })).sort((a, b) => a.cote - b.cote);
    const voulu = nets.find((n) => n.cote >= cote) ?? nets[nets.length - 1];
    const dessous = nets.filter((n) => voulu && n.cote < voulu.cote).pop();
    if (dessous) sortie.push({ image: dessous.image, alpha: 1 });
    if (voulu) sortie.push({ image: voulu.image, alpha: this.reduit ? 1 : Math.min(1, (maintenant - voulu.depuis) / FONDU_MS) });
    return sortie;
  }

  /** True while a fade is still running (the screen keeps redrawing). */
  enFondu(maintenant: number): boolean {
    if (this.reduit) return false;
    for (const n of this.nets.values()) if (maintenant - n.depuis < FONDU_MS) return true;
    return false;
  }
}
