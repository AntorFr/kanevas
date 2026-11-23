/**
 * Port of the image engine (AD-88): one description in, the bytes of ONE image out.
 * Nothing else crosses it — no path, no engine output.
 */
export interface GenerateurImage {
  generer(description: string, signal?: AbortSignal): Promise<Buffer>;
}

export type NomAdaptateur = 'bouchon' | 'codex' | 'aucun';

/**
 * Failure of a generation (B-25, AD-88). The message is fixed and never carries a cause: the engine's
 * output or an error could quote the credentials (`auth.json`).
 */
export class ErreurGeneration extends Error {
  constructor(message = "La génération de l'image a échoué.") {
    super(message);
    this.name = 'ErreurGeneration';
  }
}

/** The engine is not there (nothing configured, or gone since): the batch says so in its own words (AD-battlemap-generation-3). */
export class ErreurMoteurAbsent extends ErreurGeneration {
  constructor() {
    super("Aucun moteur d'images n'est configuré.");
    this.name = 'ErreurMoteurAbsent';
  }
}
