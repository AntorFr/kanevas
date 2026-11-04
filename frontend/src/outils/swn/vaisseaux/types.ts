/** What the routes of the ship designer give (V-8); the screen carries no rule, only these shapes. */
export type Nature = 'moteurs' | 'amenagements' | 'defenses' | 'armes' | 'modifications';

export interface Alerte {
  niveau: 'bloquante' | 'a_surveiller';
  code: string;
  texte: string;
  ligne?: number;
}

export interface Ligne {
  nature: Nature;
  cle: string;
  nom: string;
  quantite: number;
}

export interface Resultat {
  coque: { cle: string; nom: string; classe: number };
  lignes: Ligne[];
  prix: number;
  pv: number;
  ca: number;
  puissanceLibre: number;
  masseLibre: number;
  emports: { utilises: number; total: number };
  chantierJours: number;
  entretien: number;
  porteeSaut: number | null;
  alertes: Alerte[];
}

export interface Conception {
  ficheId: number;
  titre: string;
  coque: { cle: string; nom: string; classe: number };
  lignes: Ligne[];
  resultat: Resultat;
  alertes: Alerte[];
  version: number;
  peutEcrire: boolean;
  lienFiche: string;
}

export interface Listee {
  ficheId: number;
  titre: string;
  coque: { cle: string; nom: string; classe: number };
  prix: number;
  bloquantes: number;
  aSurveiller: number;
  auteur: { id: number; nom: string } | null;
  peutEcrire: boolean;
}

export interface ListeConceptions {
  conceptions: Listee[];
  peutCreer: boolean;
  fichesSansConception?: { ficheId: number; titre: string }[];
}

export interface Calcul {
  resultat: Resultat | null;
  alertes: Alerte[];
}

export interface ElementCatalogue {
  nature: string;
  cle: string;
  nom: string;
  resume: string;
  origine?: string;
  masque?: boolean;
  univers?: true;
}

export interface PageCatalogue {
  elements: ElementCatalogue[];
  suivant: string | null;
}

/** The draft of the workshop: in memory only, never in the browser's storage (V-12). */
export interface Brouillon {
  coque: { cle: string; nom: string };
  lignes: Ligne[];
}

export const NATURES: { nature: Nature; titre: string; singulier: string; ajout: string }[] = [
  { nature: 'moteurs', titre: 'Moteur de saut', singulier: 'moteur', ajout: 'Ajouter un moteur' },
  { nature: 'amenagements', titre: 'Aménagements', singulier: 'aménagement', ajout: 'Ajouter un aménagement' },
  { nature: 'defenses', titre: 'Défenses', singulier: 'défense', ajout: 'Ajouter une défense' },
  { nature: 'armes', titre: 'Armes', singulier: 'arme', ajout: 'Ajouter une arme' },
  { nature: 'modifications', titre: 'Modifications', singulier: 'modification', ajout: 'Ajouter une modification' },
];
