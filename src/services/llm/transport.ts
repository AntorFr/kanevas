// Transport abstraction: a future application engine builds the prompts and
// validates the answers; the transport only sends an exchange (system +
// messages) to a model and returns the raw text of the answer.
// Reused from Antre-du-maitre (AD-10): no route of this socle calls these
// transports yet.

export interface LlmTransportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionInput {
  system: string;
  messages: LlmTransportMessage[];
  maxTokens: number;
  /**
   * If provided and supported by the transport, receives the raw text of the
   * answer accumulated as it is generated (JSON being written).
   */
  onTextDelta?: (rawTextSoFar: string) => void;
}

export interface LlmTextTransport {
  /** Provider name, used in LLM error logs. */
  readonly name: string;
  readonly model: string;
  complete(input: LlmCompletionInput): Promise<string>;
}
