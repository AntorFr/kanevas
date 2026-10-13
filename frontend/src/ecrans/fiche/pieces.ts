/** Pure helpers of the attachments block (docs/ecrans.md, « Textes »). */

/** « 842 o », « 4,2 Ko », « 3,1 Mo », « 1,2 Go » (base 1024). */
export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const unites = ['Ko', 'Mo', 'Go'];
  let v = octets / 1024;
  let i = 0;
  while (v >= 1024 && i < unites.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1).replace('.', ',')} ${unites[i]}`;
}

export const MESSAGES_PIECES = {
  echec: 'L’action n’a pas abouti. Réessayez.',
  droit: 'Vous ne pouvez plus ajouter de fichier à cette section.',
  disparue: 'Cette pièce jointe n’existe plus.',
  introuvable: 'Page introuvable.',
  vide: (nom: string) => `« ${nom} » est vide.`,
  envoi: (nom: string) => `« ${nom} » : l’envoi n’a pas abouti.`,
  limite: (role: 'mj' | 'joueur') =>
    role === 'mj' ? 'Cette section porte déjà 50 pièces jointes.' : 'Cette section ne peut pas recevoir d’autre fichier.',
};
