import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import {
  ajouterFichier,
  choisirIllustration,
  joindreFichier,
  modifierFichier,
} from '../services/fichiers.js';
import { supprimerFichier } from '../services/stockage.js';
import { ajouterMembre } from '../services/membres.js';
import { ajouterSection, changerAudience, ecrireContenu, lireSection } from '../services/sections.js';
import { poserEtiquetage } from '../services/etiquettes.js';
import { relierSection } from '../services/relations.js';
import { creerCarte, ajouterElement } from '../services/cartes.js';
import { creerFiche, deplacerFiche, lireFiche } from '../services/fiches.js';
import { assurerCompte } from '../services/comptes.js';
import { creerEtRattacherSysteme, creerGabarit, rattacherSysteme } from '../services/systemes.js';
import { creerJetonDeValeur } from '../services/jetons.js';
import { creerUnivers } from '../services/univers.js';

/**
 * Starting world of the stub mode (AD-55, `docs/ecrans.md` « Données de départ du bouchon »),
 * seeded through the service functions (AD-2), never SQL. First half: universes, members,
 * systems and sheets without illustration; the illustrations are seeded afterwards by
 * `semerIllustrations` (below), which `server.ts` calls once this function has returned.
 * Demonstration files live in `./demo/` (versioned with the code).
 */
export function semerBouchon(db: Db): boolean {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM univers').get() as { n: number };
  if (n > 0) return false;

  const compte = (u: string) => assurerCompte(db, u).id;
  const id = { antor: compte('antor'), lea: compte('lea'), teo: compte('teo'), mira: compte('mira'), admin: compte('admin') };

  // A base migrated short of 0013 (the migration test) has no sub-type column yet.
  const sousTypes = (db.prepare('PRAGMA table_info(fiches)').all() as { name: string }[]).some(
    (c) => c.name === 'sous_type',
  );
  // Same for the parent column: no tree to seed before 0013.
  const arbre = (db.prepare('PRAGMA table_info(fiches)').all() as { name: string }[]).some(
    (c) => c.name === 'parent_id',
  );

  db.transaction(() => {
    const lame = creerUnivers(db, id.antor, {
      nom: "Lame d'Ébène",
      description: 'Une cité marchande rongée par les secrets.',
    });
    ajouterMembre(db, id.antor, lame.id, 'lea', 'joueur');
    const landes = creerUnivers(db, id.mira, {
      nom: 'Les Landes grises',
      description: 'Tourbières, brumes et villages isolés.',
    });
    const cendres = creerUnivers(db, id.admin, {
      nom: 'Les Cendres de Vaëlis',
      description: 'Un royaume après la chute de son astre.',
    });
    ajouterMembre(db, id.admin, cendres.id, 'antor', 'joueur');
    // `kanevas-import`: the universe where the import criteria play, without game system.
    const essai = creerUnivers(db, id.antor, {
      nom: 'Essai Kanka',
      description: "Un univers d'essai pour l'import.",
    });
    ajouterMembre(db, id.antor, essai.id, 'lea', 'joueur');
    creerJetonDeValeur(db, id.antor, essai.id, {
      nom: 'Jeton du bouchon',
      dureeJours: 365,
      valeur: JETON_BOUCHON,
    });

    const cof = creerEtRattacherSysteme(db, id.antor, lame.id, { nom: 'CoF Mini' });
    rattacherSysteme(db, id.mira, landes.id, cof.id);
    const cof2 = creerEtRattacherSysteme(db, id.admin, cendres.id, { nom: 'Chroniques Oubliées Fantasy' });

    const gab = (sid: number, acteur: number, type: string, noms: string[]) => {
      for (const nom of noms) {
        creerGabarit(db, acteur, sid, { type, nom, contenu: `${nom} : entrée de démonstration.` });
      }
    };
    gab(cof.id, id.antor, 'regle', ['Attaque au contact', 'Points de chance', 'Repos']);
    gab(cof.id, id.antor, 'creature', [
      'Gobelin des Landes',
      'Loup des brumes',
      "Sentinelle d'Ébène",
      'Vouivre des tourbières',
    ]);
    gab(cof.id, id.antor, 'objet', ['Lame grise', 'Sceau de Val-Fortin']);
    gab(cof2.id, id.admin, 'regle', ['Initiative', 'Voies de capacité']);
    gab(cof2.id, id.admin, 'creature', ['Squelette de garde', 'Ogre des collines']);
    gab(cof2.id, id.admin, 'objet', ['Potion de soin', 'Bâton de mage']);

    // A sheet with one section per title; `lue` = players read it (otherwise GM only).
    const fiche = (
      type: string,
      titre: string,
      sections: { titre: string; lue: boolean }[],
      charge?: Record<string, unknown>,
      sousType?: string,
    ) => {
      const f = creerFiche(db, id.antor, lame.id, { type, titre, charge, sousType: sousTypes ? sousType : undefined });
      const ids: Record<string, number> = {};
      for (const s of sections) {
        const v = ajouterSection(db, id.antor, lame.id, f.id, {
          titre: s.titre,
          contenu: `${s.titre} de ${titre}.`,
        });
        ids[s.titre] = v.id;
        if (s.lue) changerAudience(db, id.antor, lame.id, f.id, v.id, { joueursLisent: true });
      }
      return { id: f.id, sections: ids };
    };
    const apparence = { titre: 'Apparence', lue: true };
    const verite = { titre: 'Vérité — MJ seul', lue: false };
    const aldric = fiche('personnage', 'Maître Aldric', [apparence, verite], { pj: false });
    const bran = fiche('personnage', 'Bran Corvalis', [apparence], { pj: false });
    const prieur = fiche('personnage', 'Le Prieur masqué', [{ titre: 'Secret — MJ seul', lue: false }], { pj: false });
    fiche('personnage', 'Léa Brisefer', [apparence], { pj: true });
    const ombeline = fiche('personnage', 'Dame Ombeline de Val-Fortin', [apparence], { pj: false });
    const suie = fiche('personnage', 'Suie', [apparence], { pj: false });
    fiche('personnage', "Le Portrait de l'échec", [apparence], { pj: false });
    const lieux: [string, string | undefined][] = [
      ['Val-Fortin', 'Ville'],
      ['Le Pendu Joyeux', 'Taverne'],
      ['Rue des Cordiers', 'Rue'],
      ['La Fresque effacée', undefined],
    ];
    for (const [lieu, sousType] of lieux) {
      fiche('lieu', lieu, [{ titre: 'Description', lue: true }], undefined, sousType);
    }
    // « Port-Sel » (kanevas-import-secrets): Léa authors « Histoire », which carries a GM block.
    const port = creerFiche(db, id.antor, lame.id, { type: 'lieu', titre: 'Port-Sel' });
    const section = (titre: string, contenu: string, audience: Parameters<typeof changerAudience>[5]) => {
      const v = ajouterSection(db, id.antor, lame.id, port.id, { titre, contenu });
      changerAudience(db, id.antor, lame.id, port.id, v.id, audience);
      return v.id;
    };
    section(
      'Description',
      [
        '## Un port de sel et de brume',
        '',
        'Port-Sel ferme la côte des Brumes.',
        '',
        '- Quais de sel',
        '- Criée du matin',
        '',
        '| Quartier | Activité |',
        '| --- | --- |',
        '| Les Docks | Pêche et fret |',
        '| Quartier des Cordiers | Cordages et voiles |',
      ].join('\n'),
      { joueursLisent: true },
    );
    const histoire = section(
      'Histoire',
      [
        'Le port a été fondé par des sauniers.',
        '',
        ':::mj',
        'Le port est tenu en sous-main par la Guilde des Brumes, qui y fait passer ses cargaisons.',
        ':::',
        '',
        'Les marins en parlent peu.',
      ].join('\n'),
      { joueursLisent: true, auteurId: id.lea, auteurLit: true, auteurEcrit: true },
    );
    section('Vérité', 'Le port cache un secret réservé au MJ.', {});
    // The tree of `kanevas-arbre-service` (AD-115): Port-Sel under « Les Sphères » (GM only), five places under Port-Sel,
    // one of them (the hideout) GM only too. Placed through `deplacerFiche`, the one write of the parent.
    const lue = { titre: 'Description', lue: true };
    const mjSeul = { titre: 'Secret — MJ seul', lue: false };
    const ranger = (enfant: number, parent: number) =>
      arbre && deplacerFiche(db, { compteId: id.antor }, lame.id, enfant, parent);
    const spheres = fiche('lieu', 'Les Sphères', [mjSeul]);
    ranger(port.id, spheres.id);
    let docks: { id: number; sections: Record<string, number> } | undefined;
    for (const [titre, sections] of [
      ['La Taverne du Kraken', [lue]],
      ['Les Docks', [lue]],
      ['Le Phare aux Sels', [lue]],
      ['Quartier des Cordiers', [lue]],
      ['Le Repaire des contrebandiers', [mjSeul]],
    ] as const) {
      const f = fiche('lieu', titre, [...sections]);
      if (titre === 'Les Docks') docks = f;
      ranger(f.id, port.id);
    }
    fiche('faction', 'Lames Grises', [{ titre: 'Description', lue: true }]);
    const cercle = fiche('faction', 'Cercle des Cendres', [{ titre: 'Secret — MJ seul', lue: false }]);
    // Aliases, labels and a readable « savoir » (kanevas-recherche-donnees); a base short of 0014 (aliases) has no table.
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'fiche_alias'").get()) {
      const antor = { compteId: id.antor };
      poserEtiquetage(db, antor, lame.id, port.id, {
        alias: ['Salport', 'Port-aux-Sels'],
        etiquettes: ['Côte des Brumes'],
      });
      poserEtiquetage(db, antor, lame.id, cercle.id, { alias: [], etiquettes: ['Côte des Brumes'] });
      fiche('savoir', "Chronique de l'Âge d'Ombre", [{ titre: 'Récit', lue: true }], undefined, 'Récit');
    }

    // The links of `kanevas-import-liens` (docs/ecrans.md). The Guild and the report are closed to
    // players; the texts that point at sheets are written once those exist, through the service.
    const guilde = fiche('faction', 'La Guilde des Brumes', [{ titre: 'Description', lue: false }]);
    const rapport = fiche('evenement', "Rapport secret de l'amirauté", [{ titre: 'Secret — MJ seul', lue: false }]);
    const ecrire = (universId: number, ficheId: number, sectionId: number, contenu: string) => {
      const { version } = lireSection(db, { compteId: id.antor }, universId, ficheId, sectionId);
      ecrireContenu(db, id.antor, universId, ficheId, sectionId, contenu, version);
    };
    const lien = (cible: { id: number }, texte: string) => `[[${cible.id}|${texte}]]`;
    ecrire(
      lame.id,
      port.id,
      histoire,
      [
        'Le port a été fondé par des sauniers.',
        '',
        ':::mj',
        'Le port est tenu en sous-main par la Guilde des Brumes, qui y fait passer ses cargaisons.',
        ':::',
        '',
        'Les marins en parlent peu.',
        '',
        `Le maître de port, ${lien(aldric, 'Maître Aldric')}, tient les comptes ; ${lien(guilde, 'La Guilde des Brumes')} y a ses entrées.`,
      ].join('\n'),
    );
    ecrire(lame.id, aldric.id, aldric.sections['Apparence']!, `Grand, voûté. Il règne sur ${lien(port, 'Port-Sel')}.`);
    ecrire(lame.id, guilde.id, guilde.sections['Description']!, `Une confrérie de contrebandiers dont ${lien(aldric, 'Maître Aldric')} est l'indic.`);
    ecrire(
      lame.id,
      rapport.id,
      rapport.sections['Secret — MJ seul']!,
      ['Rapport de l\'amirauté.', '', ':::mj', `Piste : ${lien(aldric, 'Maître Aldric')} vend les horaires des convois.`, ':::'].join('\n'),
    );
    // `kanevas-import-tenir`: three relations that target Port-Sel (the criteria of its deletion); its place on
    // a map comes with the files (`semerFichiers`, a map is created asynchronously). A base short of 0005 has no table.
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'relations'").get()) {
      relierSection(db, id.antor, lame.id, aldric.id, aldric.sections['Apparence']!, { cibleFicheId: port.id, qualificatif: 'maître de port' });
      relierSection(db, id.antor, lame.id, guilde.id, guilde.sections['Description']!, { cibleFicheId: port.id, qualificatif: 'y fait passer ses cargaisons' });
      relierSection(db, id.antor, lame.id, rapport.id, rapport.sections['Secret — MJ seul']!, { cibleFicheId: port.id, qualificatif: 'surveille' });
      // `kanevas-fiches-liees-natures`: relations with a nature (AD-128) and the family « Les Corvalis » (a type).
      const relier = (src: { id: number; sections: Record<string, number> }, section: string, cible: { id: number }, nature: string, qualificatif: string) =>
        relierSection(db, id.antor, lame.id, src.id, src.sections[section]!, { cibleFicheId: cible.id, nature, qualificatif });
      const corvalis = fiche('famille', 'Les Corvalis', [{ titre: 'Description', lue: true }]);
      relier(aldric, 'Apparence', port, 'se_situe', 'habite');
      relier(aldric, 'Apparence', guilde, 'membre', 'trésorier');
      relier(prieur, 'Secret — MJ seul', port, 'se_situe', 'se cache');
      if (docks) relier(suie, 'Apparence', docks, 'se_situe', '');
      relier(ombeline, 'Apparence', guilde, 'membre', 'dirige');
      relier(bran, 'Apparence', corvalis, 'membre', 'aîné');
      relier(ombeline, 'Apparence', corvalis, 'membre', 'veuve');
    }
    // « Essai Kanka »: a place whose text waits for a key and points at a vanished sheet.
    const anse = creerFiche(db, id.antor, essai.id, { type: 'lieu', titre: 'Anse-aux-Sels' });
    const descriptionAnse = ajouterSection(db, id.antor, essai.id, anse.id, {
      titre: 'Description',
      contenu:
        'Une crique que fréquentent [[cle:faction:repaire|les contrebandiers du Repaire]] et jadis [[999999|Capitaine Hesk]].',
    });
    changerAudience(db, id.antor, essai.id, anse.id, descriptionAnse.id, { joueursLisent: true });
  })();
  return true;
}

/** The stub token of « Essai Kanka » (docs/ecrans.md): fixed, known to the tests, stub mode only. */
export const JETON_BOUCHON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';

const DEMO = join(dirname(fileURLToPath(import.meta.url)), 'demo');

/** Reads a demonstration file shipped with the code (`./demo/`). */
export function fichierDemo(nom: string): Buffer {
  return readFileSync(join(DEMO, nom));
}

/**
 * Second half of the stub starting world: the illustrations, put by the real upload function
 * (AD-93), and the two refusal files (« plan.pdf », the empty one) which stay in `./demo/` for the
 * browser to pick. To be called right after `semerBouchon` returned true.
 */
export async function semerIllustrations(db: Db, racine: string = attachmentsDir): Promise<void> {
  const antor = assurerCompte(db, 'antor').id;
  const lignes = db.prepare('SELECT id, univers_id, titre FROM fiches').all() as {
    id: number;
    univers_id: number;
    titre: string;
  }[];
  const trouver = (titre: string) => {
    const l = lignes.find((x) => x.titre === titre);
    if (!l) throw new Error(`Fiche de démonstration absente : ${titre}`);
    return l;
  };
  const poser = async (titre: string, fichier: string) => {
    const l = trouver(titre);
    return ajouterFichier(
      db,
      { compteId: antor },
      l.univers_id,
      Readable.from([fichierDemo(fichier)]),
      l.titre,
      { ou: 'illustration', ficheId: l.id },
      racine,
    );
  };

  const portraits: [string, string][] = [
    ['Le Prieur masqué', 'portrait-ambre.png'],
    ['Léa Brisefer', 'portrait-ambre.png'],
    ['Dame Ombeline de Val-Fortin', 'portrait-ambre.png'],
    ['Suie', 'portrait-ambre.png'],
    ["Le Portrait de l'échec", 'portrait-ambre.png'],
    ['Val-Fortin', 'paysage-brume.png'],
    ['Le Pendu Joyeux', 'paysage-brume.png'],
    ['Lames Grises', 'blason-cendre.png'],
    ['Cercle des Cendres', 'blason-cendre.png'],
  ];
  for (const [titre, fichier] of portraits) await poser(titre, fichier);

  // « La Fresque effacée »: the illustration is recorded but its file is gone from the disk.
  const fresque = await poser('La Fresque effacée', 'fresque.webp');
  supprimerFichier(fresque.jeton, racine);

  await semerFichiers(db, racine);
}

/**
 * The files of the media library (AD-111, `docs/ecrans.md` « Semis de `kanevas-import` »), added
 * by the real functions: « Plan secret de la Guilde » (GM only, unused), « Carte des Sphères »
 * (illustration of Port-Sel, in the text of « Val-Fortin », joined to « Maître Aldric »),
 * « port-sel-quais.webp » joined to Port-Sel, and the closed section « Notes de la table » of Léa.
 */
async function semerFichiers(db: Db, racine: string): Promise<void> {
  const antor = { compteId: assurerCompte(db, 'antor').id };
  const lea = assurerCompte(db, 'lea').id;
  const fiches = db
    .prepare('SELECT f.id, f.univers_id, f.titre FROM fiches f JOIN univers u ON u.id = f.univers_id WHERE u.nom = ?')
    .all("Lame d'Ébène") as { id: number; univers_id: number; titre: string }[];
  const trouver = (titre: string) => {
    const l = fiches.find((x) => x.titre === titre);
    if (!l) throw new Error(`Fiche de démonstration absente : ${titre}`);
    return l;
  };
  const univers = trouver('Port-Sel').univers_id;
  const section = (titre: string, section: string) => {
    const f = trouver(titre);
    const v = lireFiche(db, antor, univers, f.id).sections.find((x) => x.titre === section);
    if (!v) throw new Error(`Section de démonstration absente : ${titre} / ${section}`);
    return { fiche: f.id, section: v.id, version: v.version, contenu: v.contenu ?? '' };
  };
  const ajouter = (nom: string, demo: string, cible: Parameters<typeof ajouterFichier>[5]) =>
    ajouterFichier(db, antor, univers, Readable.from([fichierDemo(demo)]), nom, cible, racine);

  const plan = await ajouter('Plan secret de la Guilde', 'plan-guilde.png', { ou: 'mediatheque' });
  modifierFichier(db, antor, univers, plan.id, { visibilite: 'mj' });

  const carte = await ajouter('Carte des Sphères', 'carte-spheres.png', { ou: 'mediatheque' });
  choisirIllustration(db, antor, univers, trouver('Port-Sel').id, carte.id);
  // The alt text must not repeat « Sphères »: the search of the tree tests (B-35) look for a hidden sheet by that word.
  const val = section('Val-Fortin', 'Description');
  ecrireContenu(db, antor.compteId, univers, val.fiche, val.section, `${val.contenu}\n\n![Carte du royaume](fichier:${carte.id})`, val.version);
  const aldric = section('Maître Aldric', 'Apparence');
  joindreFichier(db, antor, univers, aldric.fiche, aldric.section, carte.id);

  const port = section('Port-Sel', 'Description');
  await ajouter('port-sel-quais.webp', 'port-sel-quais.webp', {
    ou: 'section',
    sectionId: port.section,
    maniere: 'joint',
  });

  // A graph map holds Port-Sel (its place goes with it when the sheet is deleted).
  const graphe = await creerCarte(db, antor.compteId, false, univers, { titre: 'Carte de la côte', forme: 'graphe' });
  ajouterElement(db, antor.compteId, false, graphe.id, { ficheId: trouver('Port-Sel').id });
  ajouterElement(db, antor.compteId, false, graphe.id, { ficheId: trouver('Maître Aldric').id });

  const lb = trouver('Léa Brisefer');
  const notes = ajouterSection(db, antor.compteId, univers, lb.id, {
    titre: 'Notes de la table',
    contenu: 'Notes de la table de Léa.',
  });
  changerAudience(db, antor.compteId, univers, lb.id, notes.id, {
    auteurId: lea,
    auteurLit: true,
    auteurEcrit: true,
  });
}
