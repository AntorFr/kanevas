import { query } from '@anthropic-ai/claude-agent-sdk';

import { env } from '../../config/env.js';
import type {
  LlmCompletionInput,
  LlmTextTransport,
  LlmTransportMessage,
} from './transport.js';

/**
 * Claude Agent SDK transport: uses the Claude subscription (Pro/Max) instead
 * of billing an API key. The SDK drives the Claude Code runtime embedded in
 * the npm package and authenticates through CLAUDE_CODE_OAUTH_TOKEN (generated
 * once with `claude setup-token`) or, in dev, through the machine's
 * `claude login` credentials.
 *
 * Deliberately minimal use: a single turn, no tool, custom system prompt —
 * the SDK is only a pipe to the model.
 *
 * Selective take-over of Antre-du-maitre (AD-10): the admin window that
 * generates and stores a token on disk (`services/claude-token.ts`) is not
 * taken over here — it would be a content route, out of scope for a base that
 * still calls no LLM (fonctionnelle.md, out of scope). To be reintroduced by
 * the feature that actually activates this transport, if the need is
 * confirmed.
 */
export class ClaudeAgentTransport implements LlmTextTransport {
  readonly name = 'claude-agent';
  readonly model = env.ANTHROPIC_MODEL;

  async complete(input: LlmCompletionInput): Promise<string> {
    let raw = '';
    let result: string | null = null;
    let failure: string | null = null;

    for await (const message of query({
      prompt: renderPrompt(input.messages),
      options: {
        systemPrompt: input.system,
        model: this.model,
        maxTurns: 1,
        allowedTools: [],
        permissionMode: 'dontAsk',
        includePartialMessages: Boolean(input.onTextDelta),
      },
    })) {
      if (message.type === 'stream_event' && input.onTextDelta) {
        const event = message.event;

        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          raw += event.delta.text;
          input.onTextDelta(raw);
        }
      } else if (message.type === 'result') {
        if (message.subtype === 'success') {
          result = message.result;
        } else {
          failure = message.subtype;
        }
      }
    }

    if (result === null) {
      throw new Error(
        `Claude Agent SDK returned no result (${failure ?? 'no result message'}).`,
      );
    }

    return result.trim();
  }
}

/**
 * The SDK takes a single user prompt per request: correction turns
 * (user → faulty assistant → instruction) are folded into one message that
 * quotes the faulty answer.
 */
function renderPrompt(messages: LlmTransportMessage[]): string {
  if (messages.length === 1 && messages[0]) {
    return messages[0].content;
  }

  return messages
    .map((message) =>
      message.role === 'assistant'
        ? `Ta réponse précédente était :\n${message.content}`
        : message.content,
    )
    .join('\n\n');
}
