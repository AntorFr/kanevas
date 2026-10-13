import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { Db } from '../db/db.js';
import { attachmentsDir } from '../config/env.js';
import { poserIllustration } from '../services/illustrations.js';
import { supprimerFichier } from '../services/stockage.js';
import { ajouterMembre } from '../services/membres.js';
import { ajouterSection, changerAudience, ecrireContenu, lireSection } from '../services/sections.js';
import { creerFiche } from '../services/fiches.js';
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
    ) => {
      const f = creerFiche(db, id.antor, lame.id, { type, titre, charge });
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
    fiche('personnage', 'Bran Corvalis', [apparence], { pj: false });
    fiche('personnage', 'Le Prieur masqué', [{ titre: 'Secret — MJ seul', lue: false }], { pj: false });
    fiche('personnage', 'Léa Brisefer', [apparence], { pj: true });
    fiche('personnage', 'Dame Ombeline de Val-Fortin', [apparence], { pj: false });
    fiche('personnage', 'Suie', [apparence], { pj: false });
    fiche('personnage', "Le Portrait de l'échec", [apparence], { pj: false });
    for (const lieu of ['Val-Fortin', 'Le Pendu Joyeux', 'Rue des Cordiers', 'La Fresque effacée']) {
      fiche('lieu', lieu, [{ titre: 'Description', lue: true }]);
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
    fiche('faction', 'Lames Grises', [{ titre: 'Description', lue: true }]);
    fiche('faction', 'Cercle des Cendres', [{ titre: 'Secret — MJ seul', lue: false }]);

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
    return poserIllustration(db, antor, l.univers_id, l.id, Readable.from([fichierDemo(fichier)]), racine);
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
}
