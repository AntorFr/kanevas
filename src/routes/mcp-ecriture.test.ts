import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { buildApp } = await import('../app.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
const { cleDeUnivers } = await import('../services/cles.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection, changerAudience, ecrireContenu } = await import('../services/sections.js');
const { ajouterMembre } = await import('../services/membres.js');
const { creerUnivers } = await import('../services/univers.js');

const ECRITURE = { tous: true, niveauTous: 'ecriture' };
const LECTURE = { tous: true, niveauTous: 'lecture' };

async function monter() {
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const id = (n: string) => trouverCompte(app.db, n)!.id;
  for (const compte of ['antor', 'lea']) {
    await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  }
  const antor = id('antor');
  const u = creerUnivers(app.db, antor, { nom: 'Lame' });
  ajouterMembre(app.db, antor, u.id, 'lea', 'joueur');
  const f = creerFiche(app.db, antor, u.id, { type: 'lieu', titre: 'Tenebria' });
  const ouverte = ajouterSection(app.db, antor, u.id, f.id, { titre: 'Histoire', contenu: 'Fondée sous la cendre.' });
  changerAudience(app.db, antor, u.id, f.id, ouverte.id, { joueursLisent: true, joueursEcrivent: true });
  const lecteur = ajouterSection(app.db, antor, u.id, f.id, { titre: 'Rumeurs', contenu: 'Lecture seule.' });
  changerAudience(app.db, antor, u.id, f.id, lecteur.id, { joueursLisent: true });
  const cible = creerFiche(app.db, antor, u.id, { type: 'lieu', titre: 'Port' });
  const cle = cleDeUnivers(app.db, u.id)!;
  const jeton = (compte: string, acces: unknown = ECRITURE) =>
    creerJeton(app.db, id(compte), { nom: 'Agent', dureeJours: 30, acces } as never, app.horloge());
  const client = async (valeur: string) => {
    const c = new Client({ name: 't', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${cle}`), { requestInit: { headers: { authorization: `Bearer ${valeur}` } } }));
    return c;
  };
  const appel = async (c: InstanceType<typeof Client>, name: string, args: Record<string, unknown>) => {
    const r = await c.callTool({ name, arguments: args });
    const t = (r.content as { text: string }[])[0]!.text;
    return { erreur: r.isError === true, t, sc: r.structuredContent as { code?: string; champ?: string } | undefined, d: r.isError ? null : JSON.parse(t) };
  };
  return { app, u, f, cible, ouverte, lecteur, cle, id, antor, jeton, client, appel };
}
type M = Awaited<ReturnType<typeof monter>>;
const lire = async (m: M, c: InstanceType<typeof Client>, fiche: number) => (await m.appel(c, 'lire_fiche', { fiche: String(fiche) })).d;
const lignes = (m: M, ficheId: number) =>
  m.app.db.prepare('SELECT objet, action, origine, jeton_id FROM historique WHERE fiche_id = ? ORDER BY id').all(ficheId) as
    { objet: string; action: string; origine: string; jeton_id: number | null }[];

test('ecrire_section : avec l’empreinte lue écrit, historique mcp + jeton ; périmée (autre compte) : section_modifiee, rien écrit', async () => {
  const m = await monter();
  try {
    const j = m.jeton('antor');
    const c = await m.client(j.valeur);
    const noms = (await c.listTools()).tools.map((t) => t.name);
    for (const o of ['creer_fiche', 'modifier_entete', 'ecrire_section', 'supprimer_section', 'relier', 'modifier_relation', 'retirer_relation']) assert.ok(noms.includes(o), o);
    const avant = await lire(m, c, m.f.id);
    const emp = avant.sections.find((s: { id: number }) => s.id === m.ouverte.id).empreinte;
    // Un autre compte (la joueuse, qui peut écrire cette section) la change entre-temps.
    ecrireContenu(m.app.db, m.id('lea'), m.u.id, m.f.id, m.ouverte.id, 'Changée par Léa.', 1);
    const refus = await m.appel(c, 'ecrire_section', { fiche: String(m.f.id), sectionId: m.ouverte.id, empreinte: emp, contenu: 'Écrasement' });
    assert.equal(refus.erreur, true);
    assert.equal(refus.sc?.code, 'section_modifiee');
    assert.match(refus.t, /[Rr]elisez/);
    const apres = await lire(m, c, m.f.id);
    const s = apres.sections.find((x: { id: number }) => x.id === m.ouverte.id);
    assert.equal(s.contenu, 'Changée par Léa.');
    const ok = await m.appel(c, 'ecrire_section', { fiche: String(m.f.id), sectionId: m.ouverte.id, empreinte: s.empreinte, contenu: 'Version agent' });
    assert.equal(ok.erreur, false, ok.t);
    assert.equal(ok.d.evenement.type, 'section_modifiee');
    const l = lignes(m, m.f.id).filter((x) => x.objet === 'section').at(-1)!;
    assert.deepEqual({ o: l.origine, j: l.jeton_id, a: l.action }, { o: 'mcp', j: j.jeton.id, a: 'modifiee' });
    // sans empreinte, ou mal formée : invalide / empreinte
    for (const a of [{}, { empreinte: 'xyz' }]) {
      const r = await m.appel(c, 'ecrire_section', { fiche: String(m.f.id), sectionId: m.ouverte.id, contenu: 'x', ...a });
      assert.equal(r.sc?.code, 'invalide');
      assert.equal(r.sc?.champ, 'empreinte');
    }
    await c.close();
  } finally { await m.app.close(); }
});

test('jeton lecture : aucun outil d’écriture listé, appel par nom = lecture_seule', async () => {
  const m = await monter();
  try {
    const c = await m.client(m.jeton('antor', LECTURE).valeur);
    const n0 = lignes(m, m.f.id).length;
    const noms = (await c.listTools()).tools.map((t) => t.name);
    for (const o of ['creer_fiche', 'modifier_entete', 'ecrire_section', 'supprimer_section', 'relier', 'modifier_relation', 'retirer_relation']) {
      assert.ok(!noms.includes(o), o);
      const r = await m.appel(c, o, {});
      assert.equal(r.erreur, true);
      assert.equal(r.sc?.code, 'lecture_seule', o);
    }
    assert.equal(lignes(m, m.f.id).length, n0);
    await c.close();
  } finally { await m.app.close(); }
});

test('joueuse : écrit la section qu’elle peut écrire (empreinte lue), pas celle qu’elle ne peut pas ; pas d’outils MJ', async () => {
  const m = await monter();
  try {
    const j = m.jeton('lea');
    const c = await m.client(j.valeur);
    const fi = await lire(m, c, m.f.id);
    const sec = (id: number) => fi.sections.find((s: { id: number }) => s.id === id);
    const ok = await m.appel(c, 'ecrire_section', { fiche: String(m.f.id), sectionId: m.ouverte.id, empreinte: sec(m.ouverte.id).empreinte, contenu: 'Par Léa via MCP' });
    assert.equal(ok.erreur, false, ok.t);
    const l = lignes(m, m.f.id).filter((x) => x.objet === 'section').at(-1)!;
    assert.equal(l.origine, 'mcp');
    assert.equal(l.jeton_id, j.jeton.id);
    const ko = await m.appel(c, 'ecrire_section', { fiche: String(m.f.id), sectionId: m.lecteur.id, empreinte: sec(m.lecteur.id).empreinte, contenu: 'Intrusion' });
    assert.equal(ko.erreur, true);
    const contenu = m.app.db.prepare('SELECT contenu FROM sections WHERE id = ?').get(m.lecteur.id) as { contenu: string };
    assert.equal(contenu.contenu, 'Lecture seule.');
    // tentatives MJ : refusées, rien d'écrit
    const n = lignes(m, m.f.id).length;
    const rel = await m.appel(c, 'relier', { fiche: String(m.f.id), sectionId: m.ouverte.id, cible: String(m.cible.id), qualificatif: 'x' });
    const cr = await m.appel(c, 'creer_fiche', { type: 'lieu', titre: 'Pirate' });
    const del = await m.appel(c, 'supprimer_section', { fiche: String(m.f.id), sectionId: m.ouverte.id, empreinte: 'a'.repeat(32) });
    const te = await m.appel(c, 'modifier_entete', { fiche: String(m.f.id), empreinte: fi.empreinteEnTete, titre: 'Pwned' });
    for (const r of [rel, cr, del, te]) assert.equal(r.erreur, true, r.t);
    assert.equal(lignes(m, m.f.id).length, n);
    assert.equal((m.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(m.f.id) as { titre: string }).titre, 'Tenebria');
    await c.close();
  } finally { await m.app.close(); }
});

test('creer_fiche rend la clé lisible ; modifier_entete : réussit si une section a bougé, refuse si l’en-tête a changé', async () => {
  const m = await monter();
  try {
    const j = m.jeton('antor');
    const c = await m.client(j.valeur);
    const cr = await m.appel(c, 'creer_fiche', { type: 'lieu', titre: 'Nouvelle cité' });
    assert.equal(cr.erreur, false, cr.t);
    assert.equal(cr.d.fiche, 'lieu:nouvelle-cite');
    assert.ok(!/^\d+$/.test(cr.d.fiche), 'clé lisible, pas un id');
    assert.equal(cr.d.evenement.type, 'fiche_creee');
    const lc = lignes(m, cr.d.id).find((x) => x.objet === 'fiche')!;
    assert.deepEqual({ o: lc.origine, j: lc.jeton_id }, { o: 'mcp', j: j.jeton.id });

    const f = await lire(m, c, m.f.id);
    ecrireContenu(m.app.db, m.antor, m.u.id, m.f.id, m.ouverte.id, 'Une section a bougé', 1);
    const ok = await m.appel(c, 'modifier_entete', { fiche: String(m.f.id), empreinte: f.empreinteEnTete, titre: 'Tenebria la Grise' });
    assert.equal(ok.erreur, false, ok.t);
    assert.equal(ok.d.inchangee, false);
    // même empreinte (périmée maintenant) : refus, rien écrit
    const ko = await m.appel(c, 'modifier_entete', { fiche: String(m.f.id), empreinte: f.empreinteEnTete, titre: 'Autre' });
    assert.equal(ko.sc?.code, 'section_modifiee');
    assert.equal((m.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(m.f.id) as { titre: string }).titre, 'Tenebria la Grise');
    const sans = await m.appel(c, 'modifier_entete', { fiche: String(m.f.id), titre: 'Z' });
    assert.deepEqual([sans.sc?.code, sans.sc?.champ], ['invalide', 'empreinte']);
    await c.close();
  } finally { await m.app.close(); }
});

test('supprimer_section : empreinte périmée refusée puis supprime avec la bonne ; sans empreinte invalide', async () => {
  const m = await monter();
  try {
    const c = await m.client(m.jeton('antor').valeur);
    const f = await lire(m, c, m.f.id);
    const emp = f.sections.find((s: { id: number }) => s.id === m.lecteur.id).empreinte;
    const sans = await m.appel(c, 'supprimer_section', { fiche: String(m.f.id), sectionId: m.lecteur.id });
    assert.deepEqual([sans.sc?.code, sans.sc?.champ], ['invalide', 'empreinte']);
    ecrireContenu(m.app.db, m.antor, m.u.id, m.f.id, m.lecteur.id, 'Changée', 1);
    const ko = await m.appel(c, 'supprimer_section', { fiche: String(m.f.id), sectionId: m.lecteur.id, empreinte: emp });
    assert.equal(ko.sc?.code, 'section_modifiee');
    assert.ok(m.app.db.prepare('SELECT 1 FROM sections WHERE id = ?').get(m.lecteur.id));
    const neuve = (await lire(m, c, m.f.id)).sections.find((s: { id: number }) => s.id === m.lecteur.id).empreinte;
    const ok = await m.appel(c, 'supprimer_section', { fiche: String(m.f.id), sectionId: m.lecteur.id, empreinte: neuve });
    assert.equal(ok.erreur, false, ok.t);
    assert.equal(m.app.db.prepare('SELECT 1 FROM sections WHERE id = ?').get(m.lecteur.id), undefined);
    await c.close();
  } finally { await m.app.close(); }
});

test('relier idempotent sans empreinte ; modifier_relation et retirer_relation sous l’empreinte de la relation', async () => {
  const m = await monter();
  try {
    const c = await m.client(m.jeton('antor').valeur);
    const a = { fiche: String(m.f.id), sectionId: m.ouverte.id, cible: String(m.cible.id), qualificatif: 'voisin' };
    const r1 = await m.appel(c, 'relier', a);
    assert.equal(r1.erreur, false, r1.t);
    const r2 = await m.appel(c, 'relier', a);
    assert.equal(r2.erreur, false, r2.t);
    assert.equal(r2.d.id, r1.d.id);
    assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM relations').get() as { n: number }).n, 1);
    // sans empreinte
    for (const o of ['modifier_relation', 'retirer_relation']) {
      const r = await m.appel(c, o, { relation: r1.d.id, qualificatif: 'x' });
      assert.deepEqual([r.sc?.code, r.sc?.champ], ['invalide', 'empreinte'], o);
    }
    const ok = await m.appel(c, 'modifier_relation', { relation: r1.d.id, empreinte: r1.d.empreinte, qualificatif: 'allié' });
    assert.equal(ok.erreur, false, ok.t);
    // l'ancienne empreinte est périmée
    const ko = await m.appel(c, 'modifier_relation', { relation: r1.d.id, empreinte: r1.d.empreinte, qualificatif: 'ennemi' });
    assert.equal(ko.sc?.code, 'section_modifiee');
    const ko2 = await m.appel(c, 'retirer_relation', { relation: r1.d.id, empreinte: r1.d.empreinte });
    assert.equal(ko2.sc?.code, 'section_modifiee');
    assert.equal((m.app.db.prepare('SELECT qualificatif FROM relations WHERE id = ?').get(r1.d.id) as { qualificatif: string }).qualificatif, 'allié');
    const del = await m.appel(c, 'retirer_relation', { relation: r1.d.id, empreinte: ok.d.empreinte });
    assert.equal(del.erreur, false, del.t);
    assert.equal((m.app.db.prepare('SELECT COUNT(*) AS n FROM relations').get() as { n: number }).n, 0);
    await c.close();
  } finally { await m.app.close(); }
});
