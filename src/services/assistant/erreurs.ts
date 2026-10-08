/**
 * Failure of the assistant as a whole (AD-75, AD-77). The message is fixed and
 * never carries the cause: an SDK error could quote the token.
 *  - assistant_indisponible : no token outside the stub (503)
 *  - assistant_erreur       : transport failure or deadline (502)
 */
export class ErreurAssistant extends Error {
  constructor(
    readonly code: 'assistant_indisponible' | 'assistant_erreur',
    message: string,
  ) {
    super(message);
    this.name = 'ErreurAssistant';
  }
}

/** Raised by a transport (the stub's "échec" rule, or any SDK failure). */
export class ErreurTransport extends Error {
  constructor(message = 'Échec du transport.') {
    super(message);
    this.name = 'ErreurTransport';
  }
}
