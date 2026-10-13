declare module 'markdown-it-container' {
  import type MarkdownIt from 'markdown-it';
  import type Token from 'markdown-it/lib/token.mjs';

  const container: (
    md: InstanceType<typeof MarkdownIt>,
    name: string,
    options?: {
      validate?: (params: string, markup: string) => boolean;
      render?: (tokens: Token[], idx: number) => string;
      marker?: string;
    },
  ) => void;
  export default container;
}
