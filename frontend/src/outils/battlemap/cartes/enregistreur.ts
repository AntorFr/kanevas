// Autosave (AD-battlemap-editeur-4): the queue of the engine is sent about one second after the last gesture, one request
// in flight, gesture by gesture with the version the server last gave. A failure to reach the server retries with a
// back-off and keeps the queue; a stale version stops everything; a refusal rolls the gesture back.
import type { Moteur } from './moteur';
import type { Commande } from './types';

export type EtatSauvegarde = 'enregistre' | 'attente' | 'envoi' | 'reessai' | 'perime';
/** A refusal of the server that is not a failure to save: shown to the user, the gesture rolled back. */
export type Refus = 'carte_pleine' | 'refuse';

export interface Echec { statut: number; code?: string }
export interface Transport {
  lot(version: number, commandes: Commande[]): Promise<{ version: number }>;
  reglage(version: number, corps: Record<string, unknown>): Promise<{ version: number }>;
}
export interface Horloge {
  attendre(ms: number, f: () => void): unknown;
  annuler(id: unknown): void;
}
const HORLOGE: Horloge = {
  attendre: (ms, f) => setTimeout(f, ms),
  annuler: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export const DELAI_ENVOI_MS = 1000;
export const REPRISES_MS = [1000, 2000, 4000, 8000, 15000];

export class Enregistreur {
  etat: EtatSauvegarde = 'enregistre';
  /** The last refusal, until the user dismisses it or a gesture succeeds. */
  refus: Refus | null = null;
  private minuteur: unknown;
  private reprise = 0;
  private serie: Promise<unknown> = Promise.resolve();

  constructor(
    private moteur: Moteur,
    private transport: Transport,
    private surChangement: () => void,
    private horloge: Horloge = HORLOGE,
    private delai = DELAI_ENVOI_MS,
  ) {}

  /** A gesture was queued: (re)start the delay. */
  noter() {
    if (this.etat === 'perime') return;
    this.refus = null;
    this.etat = 'attente';
    this.armer(this.delai);
    this.surChangement();
  }

  private armer(ms: number) {
    if (this.minuteur !== undefined) this.horloge.annuler(this.minuteur);
    this.minuteur = this.horloge.attendre(ms, () => {
      this.minuteur = undefined;
      void this.vider();
    });
  }

  /** Sends the queue now (closing, or before a setting). Resolves when it is empty or stopped. */
  vider(): Promise<void> {
    if (this.minuteur !== undefined) {
      this.horloge.annuler(this.minuteur);
      this.minuteur = undefined;
    }
    const p = this.serie.then(() => this.boucle());
    this.serie = p.catch(() => undefined);
    return p;
  }

  private async boucle(): Promise<void> {
    while (this.moteur.file.length > 0 && this.etat !== 'perime') {
      const lot = this.moteur.file[0]!;
      this.etat = 'envoi';
      this.surChangement();
      try {
        const r = await this.transport.lot(this.moteur.base.version, lot.commandes);
        this.reprise = 0;
        this.moteur.acquitter(r.version);
      } catch (e) {
        const echec = e as Echec;
        if (echec.statut === 409 && echec.code === 'version') {
          this.etat = 'perime';
          this.surChangement();
          return;
        }
        if (echec.statut >= 400 && echec.statut < 500 && echec.statut !== 408 && echec.statut !== 429) {
          this.refus = echec.statut === 409 && echec.code === 'carte_pleine' ? 'carte_pleine' : 'refuse';
          this.moteur.refuser();
          continue;
        }
        // The server could not be reached, or failed: keep the queue and try again.
        this.etat = 'reessai';
        this.surChangement();
        const ms = REPRISES_MS[Math.min(this.reprise++, REPRISES_MS.length - 1)]!;
        this.armer(ms);
        return;
      }
    }
    if (this.etat !== 'perime' && this.moteur.file.length === 0) this.etat = 'enregistre';
    this.surChangement();
  }

  /**
   * A setting (title, visibility, size): the queue goes first, then the request with the version the server last gave.
   * Rejects with the failure; a stale version also stops the autosave.
   */
  reglage(corps: Record<string, unknown>): Promise<{ version: number }> {
    const p = this.serie.then(async () => {
      await this.boucle();
      if (this.moteur.file.length > 0) throw { statut: 0 } satisfies Echec;
      try {
        const r = await this.transport.reglage(this.moteur.base.version, corps);
        this.moteur.versionAcquise(r.version);
        return r;
      } catch (e) {
        const echec = e as Echec;
        if (echec.statut === 409 && echec.code === 'version') {
          this.etat = 'perime';
          this.surChangement();
        }
        throw e;
      }
    });
    this.serie = p.catch(() => undefined);
    return p;
  }

  /** The user chose « Recharger »: the engine was replaced, the delay and the stop are forgotten. */
  reprendre() {
    if (this.minuteur !== undefined) this.horloge.annuler(this.minuteur);
    this.minuteur = undefined;
    this.reprise = 0;
    this.refus = null;
    this.etat = 'enregistre';
    this.surChangement();
  }

  /** The editor is closed: the delay is forgotten (the caller sends the queue with `vider`). */
  arreter() {
    if (this.minuteur !== undefined) this.horloge.annuler(this.minuteur);
    this.minuteur = undefined;
  }

  ignorerRefus() {
    this.refus = null;
    this.surChangement();
  }
}
