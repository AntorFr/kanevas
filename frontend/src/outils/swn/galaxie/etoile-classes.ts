import { useEffect, useState } from 'react';

import { classeDeCle, classesEtoile } from '../../../wasm/coeur';
import { couleurEtoile } from './carte-geometrie';

export interface ClasseEtoile { lettre: string; libelle: string; couleur: string }

let promesse: Promise<ClasseEtoile[]> | null = null;
/** The seven classes of the core (letter, label, colour), read once. */
export function chargerClasses(): Promise<ClasseEtoile[]> {
  promesse ??= classesEtoile().then((j) => JSON.parse(j) as ClasseEtoile[]);
  promesse.catch(() => { promesse = null; });
  return promesse;
}

export function useClassesEtoile(): ClasseEtoile[] {
  const [liste, setListe] = useState<ClasseEtoile[]>([]);
  useEffect(() => {
    let vivant = true;
    chargerClasses().then((l) => { if (vivant) setListe(l); }, () => { /* the preview keeps the neutral fill */ });
    return () => { vivant = false; };
  }, []);
  return liste;
}

/**
 * What a star is drawn with: the class (the stored one, else the one the core draws from the key and the size;
 * none while the system has no key yet), its label and the fill (free colour first, then the class colour).
 */
export function useEtoile(cle: string | undefined, taille: number, classe: string | null | undefined, couleur: string | null | undefined) {
  const classes = useClassesEtoile();
  const [tiree, setTiree] = useState<string | null>(null);
  useEffect(() => {
    if (classe || !cle) { setTiree(null); return; }
    let vivant = true;
    classeDeCle(cle, Math.min(1, Math.max(0, taille))).then((l) => { if (vivant) setTiree(l); }, () => { if (vivant) setTiree(null); });
    return () => { vivant = false; };
  }, [cle, taille, classe]);
  const lettre = classe || tiree || undefined;
  const info = classes.find((c) => c.lettre === lettre);
  const fond = couleurEtoile(couleur, lettre, new Map(classes.map((c) => [c.lettre, c.couleur])));
  return { lettre, libelle: info?.libelle, fond, classes };
}
