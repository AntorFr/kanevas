import { rayonEtoile } from '../outils/swn/galaxie/carte-geometrie';

/**
 * Star preview (charte, « ApercuEtoile »): the disc a system is drawn with on the galaxy map, at the map's own
 * radius (`rayonEtoile`), on `--surface-2`, outlined 1 px `--texte-3`. `couleur` is the resolved fill (free
 * colour, else the colour of the class: data of the core, never a token). `libelle` names the class: with it the
 * preview is an image (the panel), without it it is decoration (the dialogue, whose « Classe » field says it).
 */
export function ApercuEtoile({ taille, couleur, taillePx, libelle }: {
  taille: number;
  couleur: string | null;
  taillePx: 40 | 56;
  libelle?: string;
}) {
  const demi = 14; // the viewBox holds the largest disc (12) and its outline
  return (
    <svg
      className="apercu-etoile"
      width={taillePx}
      height={taillePx}
      viewBox={`${-demi} ${-demi} ${demi * 2} ${demi * 2}`}
      role={libelle ? 'img' : undefined}
      aria-label={libelle}
      aria-hidden={libelle ? undefined : true}
    >
      <circle cx={0} cy={0} r={rayonEtoile(taille)} style={couleur ? { fill: couleur } : undefined} />
    </svg>
  );
}
