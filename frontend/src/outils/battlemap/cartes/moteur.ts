// The editor's local state (AD-battlemap-editeur-3, -4): the document, the queue of gestures not yet saved, and the
// undo / redo stacks. Pure: the core is injected, no timer, no network. A gesture is one batch (a drag is one command at
// release); undo and redo are ordinary batches made of the inverses the core gave back.
import type { Coeur } from './coeur';
import type { Commande, Document } from './types';

/** A gesture waiting to be sent: its commands, and the document it leaves once applied (the saved one after its acknowledgement). */
export interface Lot { commandes: Commande[]; apres: Document }
interface Pas { inverses: Commande[] }

export type Resultat = { ok: true } | { ok: false; code: string };

export class Moteur {
  document: Document;
  /** The last state the server acknowledged. */
  base: { document: Document; version: number };
  file: Lot[] = [];
  private defaire: Pas[] = [];
  private refaire_: Pas[] = [];
  /** Bumped at each change, for the React subscription. */
  revision = 0;

  constructor(private coeur: Coeur, document: Document, version: number) {
    this.document = document;
    this.base = { document, version };
  }

  get peutAnnuler() { return this.defaire.length > 0; }
  get peutRefaire() { return this.refaire_.length > 0; }
  get nonEnvoye() { return this.file.length > 0; }

  /** A gesture of the user: applied by the core now, queued, and put on the undo stack (the redo stack is dropped). */
  geste(commandes: Commande[]): Resultat {
    const r = this.coeur.appliquerLot(this.document, commandes);
    if (!r.ok) return { ok: false, code: r.code };
    this.document = r.document;
    this.file.push({ commandes, apres: r.document });
    this.defaire.push({ inverses: r.inverses });
    this.refaire_ = [];
    this.revision++;
    return { ok: true };
  }

  annuler(): Resultat { return this.rejouer(this.defaire, this.refaire_); }
  refaire(): Resultat { return this.rejouer(this.refaire_, this.defaire); }

  private rejouer(depuis: Pas[], vers: Pas[]): Resultat {
    const pas = depuis.pop();
    if (!pas) return { ok: true };
    const r = this.coeur.appliquerLot(this.document, pas.inverses);
    if (!r.ok) {
      // The stacks no longer fit the document (it moved under them): they are dropped, never forced.
      this.defaire = [];
      this.refaire_ = [];
      this.revision++;
      return { ok: false, code: r.code };
    }
    this.document = r.document;
    this.file.push({ commandes: pas.inverses, apres: r.document });
    vers.push({ inverses: r.inverses });
    this.revision++;
    return { ok: true };
  }

  /** The server took the first gesture of the queue. */
  acquitter(version: number) {
    const lot = this.file.shift();
    if (lot) this.base = { document: lot.apres, version };
    this.revision++;
  }

  /** The reply of a setting (title, visibility): only the version moves. */
  versionAcquise(version: number) {
    this.base = { document: this.base.document, version };
  }

  /**
   * The server refused the first gesture (`carte_pleine`, foreign id…): it is dropped, and what follows is replayed on the
   * saved state, the ones the core now refuses dropped too. The undo history no longer describes anything: cleared.
   */
  refuser() {
    const suite = this.file.slice(1);
    this.file = [];
    let courant = this.base.document;
    for (const l of suite) {
      const r = this.coeur.appliquerLot(courant, l.commandes);
      if (r.ok) {
        courant = r.document;
        this.file.push({ commandes: l.commandes, apres: courant });
      }
    }
    this.document = courant;
    this.defaire = [];
    this.refaire_ = [];
    this.revision++;
  }

  /** « Recharger »: the server's document replaces everything, the queue and the history go. */
  remplacer(document: Document, version: number) {
    this.document = document;
    this.base = { document, version };
    this.file = [];
    this.defaire = [];
    this.refaire_ = [];
    this.revision++;
  }
}
