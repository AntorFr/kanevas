import Anthropic from '@anthropic-ai/sdk';

import { env } from '../../config/env.js';
import type { LlmCompletionInput, LlmTextTransport } from './transport.js';

/**
 * Direct Anthropic API transport (billed per API key). Taken over from
 * Antre-du-maitre (AD-10), unchanged — no route of this base calls it yet.
 */
export class AnthropicTransport implements LlmTextTransport {
  readonly name = 'anthropic';
  readonly model = env.ANTHROPIC_MODEL;

  private readonly client: Anthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
    }

    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  async complete(input: LlmCompletionInput): Promise<string> {
    // The system prompt is large and stable: cache it on the Anthropic side
    // to cut latency and cost of successive turns.
    const request = {
      model: this.model,
      max_tokens: input.maxTokens,
      temperature: 0.4,
      system: [
        {
          type: 'text' as const,
          text: input.system,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    };

    if (input.onTextDelta) {
      const stream = this.client.messages.stream(request);
      const onTextDelta = input.onTextDelta;

      stream.on('text', (_delta, snapshot) => {
        onTextDelta(snapshot);
      });

      const finalMessage = await stream.finalMessage();
      return extractText(finalMessage);
    }

    const message = await this.client.messages.create(request);
    return extractText(message);
  }
}

function extractText(message: Anthropic.Message): string {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Anthropic returned no text content.');
  }

  return text;
}
