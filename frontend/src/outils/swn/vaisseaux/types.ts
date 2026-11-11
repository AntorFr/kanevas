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
  /** X-4: the points of an exchange line and the line a doubling aims at (the pair `nature/cle`). */
  points?: number;
  vise?: { nature: string; cle: string };
  /** X-3, from the server's result only: the line's own cost (a percentage line) and the exchange's deltas. */
  cout?: number;
  echange?: { puissance: number; masse: number };
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
  /** Absent in a result stored before B-82: read as `null`. */
  vitesse?: number | null;
  armure?: number | null;
  equipage?: { choisi: number; min: number | null; max: number | null } | null;
  /** Absent in a result stored before B-83: read as `null`. */
  soutes?: number | null;
  reparation?: { choisie: number; min: number | null } | null;
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
  perime: boolean;
  peutRecalculer: boolean;
  sectionId: number;
  sectionVersion: number;
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
  perime: boolean;
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
  /** The fields the catalogue states (null omitted); read by the player and, since B-82, by the GM. */
  donnees?: Donnees;
}

export interface Donnees {
  classe_min?: number; classe_max?: number; condition?: string; bonus_vitesse?: number;
  vitesse?: number; armure?: number; equipage_min?: number; equipage_max?: number;
  degats?: string; perforation?: number; qualites?: string; niveau_tech?: number;
  /** B-83 (X-1): stated by the catalogue only when the element has them. */
  cout_pct?: number; effet?: string; valeur?: number; points_max?: number; sens?: string;
  echange_puissance?: number; echange_masse?: number; rend_puissance?: number[]; rend_masse?: number[]; soute?: number;
  /** B-85 (Y-1): stated by the catalogue only when the element has them. */
  reparation_min?: number; soute_par_classe?: number[]; reduction_cout_pct?: number;
}

export interface PageCatalogue {
  elements: ElementCatalogue[];
  suivant: string | null;
}

/** The draft of the workshop: in memory only, never in the browser's storage (V-12). */
export interface Brouillon {
  coque: { cle: string; nom: string };
  lignes: Ligne[];
  /** The crew typed or stepped; `null` = not chosen, the server takes the hull's minimum (F-2). */
  equipage: number | null;
  /** The repair skill, 0 to 20 (X-4); 0 is not sent. */
  reparation: number;
}

export const NATURES: { nature: Nature; titre: string; singulier: string; ajout: string }[] = [
  { nature: 'moteurs', titre: 'Moteur de saut', singulier: 'moteur', ajout: 'Ajouter un moteur' },
  { nature: 'amenagements', titre: 'Aménagements', singulier: 'aménagement', ajout: 'Ajouter un aménagement' },
  { nature: 'defenses', titre: 'Défenses', singulier: 'défense', ajout: 'Ajouter une défense' },
  { nature: 'armes', titre: 'Armes', singulier: 'arme', ajout: 'Ajouter une arme' },
  { nature: 'modifications', titre: 'Modifications', singulier: 'modification', ajout: 'Ajouter une modification' },
];

export interface EtatFiche {
  cle: string;
  libelle: string;
  ficheId: number | null;
  titre: string;
  etat: 'absente' | 'a_jour' | 'perimee';
  propositionId: number | null;
}

export interface Rapport {
  creees: number;
  misesAJour: number;
  inchangees: number;
}
