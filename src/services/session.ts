import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/** Name of the signed session cookie (AD-56). */
export const SESSION_COOKIE = 'kanevas_session';
/** The session lasts 7 days (AD-56). */
export const SESSION_MAX_AGE_S = 7 * 24 * 3600;

/** What the cookie carries: the account id and the Authelia groups. Never a universe role (AD-9). */
export const sessionSchema = z.object({
  id: z.number().int().positive(),
  groups: z.array(z.string()),
});
export type Session = z.infer<typeof sessionSchema>;

export function encoderSession(session: Session): string {
  return Buffer.from(JSON.stringify({ id: session.id, groups: session.groups })).toString(
    'base64url',
  );
}

/** Decodes a verified cookie value; anything malformed means "no session". */
export function decoderSession(value: string): Session | null {
  try {
    const parsed = sessionSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Signing secret (AD-56): `SESSION_SECRET` if set, else read from — or created once in —
 * `session.key` next to the database (0600), so sessions survive a restart. With an
 * in-memory database nothing durable exists: a throwaway secret is used.
 */
export function chargerCleSession(secret: string | undefined, dbPath: string): string {
  if (secret) return secret;
  if (dbPath === ':memory:') return randomBytes(32).toString('hex');
  const dir = dirname(dbPath);
  const fichier = join(dir, 'session.key');
  if (existsSync(fichier)) {
    const cle = readFileSync(fichier, 'utf8').trim();
    if (cle) return cle;
  }
  mkdirSync(dir, { recursive: true });
  const cle = randomBytes(32).toString('hex');
  writeFileSync(fichier, cle + '\n', { mode: 0o600 });
  chmodSync(fichier, 0o600);
  return cle;
}
