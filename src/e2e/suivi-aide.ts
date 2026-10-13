// Helpers shared by the suivi e2e tests: the campaign status is a pill-menu (button
// « <Statut> — changer le statut de « <nom> » », then a menuitem), not a native select.
// Not a test file (no `.test.ts` suffix): `npm test` does not run it on its own.
// Playwright pages are untyped here (as in the test files); not imported from harnais.test to keep it out of the typecheck.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** The status pill-menu button of a campaign (page-wide, or inside `portee`, e.g. a list row). */
export function declencheurStatut(page: Any, nom?: string, portee?: Any) {
  const racine = portee ?? page;
  return racine.getByRole('button', { name: nom ? new RegExp(`changer le statut de « ${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} »$`) : /changer le statut de/ });
}

/** Sets the status through the menu; `label` is « Active », « En préparation » or « Terminée ». */
export async function changerStatut(page: Any, label: string, nom?: string, portee?: Any) {
  await declencheurStatut(page, nom, portee).first().click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

/** The word shown on the pill-menu of `nom` (or of the first one): the button text before the dash. */
export async function statutAffiche(page: Any, nom?: string, portee?: Any): Promise<string> {
  const t: string = await declencheurStatut(page, nom, portee).first().innerText();
  return (t.split(/\s*—/)[0] ?? '').trim();
}

/** Opens the folded « Nouveau scénario » form of E-6. */
export async function ouvrirNouveauScenario(page: Any) {
  await page.getByRole('button', { name: 'Nouveau scénario', exact: true }).click();
}
