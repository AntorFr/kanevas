// The app of the lot « vaisseaux », listening in this process on a free port (same HTTP, same seeded world as the stub server of
// `src/e2e/harnais.test.ts`, no child process, no browser). Used by the API files moved out of `src/e2e/` by the lot.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
export type Server = { base: string; stop: () => void };

export async function startServer(_env?: Record<string, string>): Promise<Server> {
  const app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}`, stop: () => void app.close() };
}
