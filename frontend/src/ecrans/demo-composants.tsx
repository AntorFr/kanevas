import { Flag, Pencil, Ellipsis, Trash2, Users, ArrowUp, ArrowDown, Eye, PenLine, Paperclip, Waypoints, Plus } from 'lucide-react';
import { useState } from 'react';

import type { Ecran } from '../registre';
import {
  Avatar,
  Bandeau,
  BlocSection,
  BoiteDialogue,
  Bouton,
  BoutonIcone,
  Case,
  Champ,
  Interrupteur,
  LigneFichier,
  LigneRelation,
  Menu,
  PageIntrouvable,
  PastilleAudience,
  PastilleRole,
  SqueletteFiche,
  useToasts,
  Vignette,
} from '../ui';
import './demo-composants.css';

/** The stub flag the server injects (AD-55): the demo page exists only then, otherwise it is an unknown address. */
const bouchon = typeof document !== 'undefined' && document.querySelector('meta[name="kanevas-bouchon"]') !== null;

const IMAGE_VIDE = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22160%22 height%3D%22120%22%2F%3E';

function Etat({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="demo-etat">
      <div className="demo-etat-titre">{titre}</div>
      {children}
    </div>
  );
}

function Groupe({ id, titre, children }: { id: string; titre: string; children: React.ReactNode }) {
  return (
    <section className="demo-groupe" aria-labelledby={id}>
      <h2 id={id}>{titre}</h2>
      <div className="demo-grille">{children}</div>
    </section>
  );
}

function Demo() {
  const { toast } = useToasts();
  const [dialogue, setDialogue] = useState(false);
  const [retire, setRetire] = useState(false);
  const [interrupteurs, setInterrupteurs] = useState({ lisent: true, ecrivent: false });
  const [envoi, setEnvoi] = useState(false);
  const [secrete, setSecrete] = useState(true);
  const [sur, setSur] = useState(false);

  return (
    <div className="demo">
      <h1>Composants partagés</h1>
      <p className="demo-intro">Page de démonstration du mode bouchon : chaque composant de la charte dans ses états.</p>

      <Groupe id="d-bouton" titre="Bouton">
        <Etat titre="Neutre, principal, danger, fantôme">
          <div className="demo-ligne">
            <Bouton>Neutre</Bouton>
            <Bouton variante="principal">Principal</Bouton>
            <Bouton variante="danger">Retirer la section</Bouton>
            <Bouton variante="fantome">Fantôme</Bouton>
          </div>
        </Etat>
        <Etat titre="Avec icône, petit">
          <div className="demo-ligne">
            <Bouton icone={Plus}>Ajouter</Bouton>
            <Bouton variante="principal" icone={Pencil}>Modifier</Bouton>
            <Bouton petit>Petit</Bouton>
          </div>
        </Etat>
        <Etat titre="Désactivé">
          <div className="demo-ligne">
            <Bouton disabled>Neutre</Bouton>
            <Bouton variante="principal" disabled>Principal</Bouton>
            <Bouton variante="danger" disabled>Danger</Bouton>
          </div>
        </Etat>
        <Etat titre="Chargement (« … », un seul envoi)">
          <div className="demo-ligne">
            <Bouton variante="principal" enCours={envoi} onClick={() => { setEnvoi(true); setTimeout(() => setEnvoi(false), 1500); }}>
              Enregistrer
            </Bouton>
            <Bouton variante="principal" enCours>Enregistrer</Bouton>
          </div>
        </Etat>
        <Etat titre="Bouton icône (normal, danger, désactivé)">
          <div className="demo-ligne">
            <BoutonIcone etiquette="Modifier la section" infobulle="Modifier" icone={Pencil} />
            <BoutonIcone etiquette="Retirer la relation membre de → Lames Grises" infobulle="Retirer" icone={Trash2} danger />
            <BoutonIcone etiquette="Monter la section" infobulle="Monter" icone={ArrowUp} disabled />
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-menu" titre="Menu">
        <Etat titre="Actions d’une section (« ⋯ »)">
          <Menu
            etiquette="Actions de la section « Apparence »"
            icone={Ellipsis}
            aligne="debut"
            entrees={[
              { libelle: 'Monter', icone: ArrowUp, impossible: true, onChoisir: () => {} },
              { libelle: 'Descendre', icone: ArrowDown, onChoisir: () => toast('« Apparence » descendue d’un cran') },
              { separateur: true },
              { libelle: 'Retirer la section', icone: Trash2, danger: true, onChoisir: () => setDialogue(true) },
            ]}
          />
        </Etat>
        <Etat titre="Compte (titre de groupe, entrées)">
          <Menu
            etiquette="Compte"
            aligne="debut"
            declencheur={
              <>
                <Avatar nom="antor" />
                antor
              </>
            }
            entrees={[
              { titre: 'Votre identifiant' },
              { libelle: 'Se déconnecter', icone: Users, onChoisir: () => {} },
            ]}
          />
        </Etat>
      </Groupe>

      <Groupe id="d-interrupteur" titre="Interrupteur">
        <Etat titre="Allumé, éteint">
          <div className="demo-colonne">
            <Interrupteur
              etiquette="Les joueurs la lisent"
              icone={Eye}
              coche={interrupteurs.lisent}
              onChange={(v) => { setInterrupteurs({ ...interrupteurs, lisent: v }); toast('Audience de « Apparence » enregistrée'); }}
            />
            <Interrupteur
              etiquette="Les joueurs l’écrivent"
              icone={PenLine}
              coche={interrupteurs.ecrivent}
              onChange={(v) => setInterrupteurs({ ...interrupteurs, ecrivent: v })}
            />
          </div>
        </Etat>
        <Etat titre="Désactivé (connexion perdue)">
          <div className="demo-colonne">
            <Interrupteur etiquette="Les joueurs la lisent" icone={Eye} coche disabled onChange={() => {}} />
            <Interrupteur etiquette="Les joueurs l’écrivent" icone={PenLine} coche={false} disabled onChange={() => {}} />
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-pastille" titre="Pastille">
        <Etat titre="Les quatre états d’audience">
          <div className="demo-ligne">
            <PastilleAudience etat="lue" />
            <PastilleAudience etat="ecrite" />
            <PastilleAudience etat="confiee" auteur="Léa" />
            <PastilleAudience etat="mj" />
          </div>
        </Etat>
        <Etat titre="Sur une fiche du MJ (bouton, chevron)">
          <div className="demo-ligne">
            <PastilleAudience etat="lue" section="Apparence" onRegler={() => toast('Réglage d’audience')} />
            <PastilleAudience etat="mj" section="Vérité" onRegler={() => {}} />
          </div>
        </Etat>
        <Etat titre="Rôles">
          <div className="demo-ligne">
            <PastilleRole role="mj" />
            <PastilleRole role="joueur" />
          </div>
        </Etat>
        <Etat titre="Avatar (compte, joueur, dans une pastille)">
          <div className="demo-ligne">
            <Avatar nom="antor" />
            <Avatar nom="Léa" joueur />
            <Avatar nom="Léa" joueur petit />
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-toast" titre="Toast">
        <Etat titre="Un toast par action réussie (4 s, trois au plus)">
          <div className="demo-ligne">
            <Bouton onClick={() => toast('« Rumeurs entendues » enregistrée')}>Afficher un toast</Bouton>
            <Bouton onClick={() => ['Un', 'Deux', 'Trois', 'Quatre'].forEach((n) => toast(`Toast ${n}`))}>Quatre à la suite</Bouton>
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-dialogue" titre="Boîte de dialogue">
        <Etat titre="Confirmation de retrait">
          <div className="demo-ligne">
            <Bouton variante="danger" icone={Trash2} onClick={() => setDialogue(true)}>Retirer la section</Bouton>
            {retire && <span>Section retirée.</span>}
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-champ" titre="Champ">
        <Etat titre="Repos">
          <Champ etiquette="Titre de la section" placeholder="Apparence" />
        </Etat>
        <Etat titre="Focus (cliquez ou Tab)">
          <Champ etiquette="Nom de la fiche" defaultValue="Maître Aldric" />
        </Etat>
        <Etat titre="Erreur">
          <Champ etiquette="Titre" defaultValue="" erreur="Le titre est obligatoire." />
        </Etat>
        <Etat titre="Zone de texte, liste, case">
          <Champ zone etiquette="Texte" defaultValue="Un homme grand, la barbe grise, qui ne sourit jamais avant d’avoir compté les sorties." rows={3} />
          <Champ liste etiquette="Auteur">
            <option>Aucun</option>
            <option>Léa</option>
          </Champ>
          <div className="demo-ligne"><Case etiquette="Secrète (MJ seul)" mj checked={secrete} onChange={(e) => setSecrete(e.target.checked)} />
          <Case etiquette="Case ordinaire" checked={sur} onChange={(e) => setSur(e.target.checked)} /></div>
        </Etat>
      </Groupe>

      <Groupe id="d-bloc" titre="Bloc de section">
        <Etat titre="Relations">
          <BlocSection libelle="Relations" icone={Waypoints}>
            <LigneRelation
              lien="membre de"
              icone={Flag}
              cible="Lames Grises"
              type="Faction"
              actions={<BoutonIcone etiquette="Retirer la relation membre de → Lames Grises" infobulle="Retirer" icone={Trash2} danger />}
            />
          </BlocSection>
        </Etat>
        <Etat titre="Relations vides">
          <BlocSection libelle="Relations" icone={Waypoints} vide="Aucune relation pour l’instant.">
            <Bouton petit icone={Plus}>Relier</Bouton>
          </BlocSection>
        </Etat>
        <Etat titre="Pièces jointes (vignettes, fichiers, envoi)">
          <BlocSection libelle="Pièces jointes" icone={Paperclip}>
            <Vignette src={IMAGE_VIDE} legende="portrait.png" actions={<BoutonIcone etiquette="Retirer le fichier portrait.png" infobulle="Retirer" icone={Trash2} danger />} />
            <Vignette src={IMAGE_VIDE} legende="carte-secrete.png" secrete />
            <LigneFichier nom="plan-des-egouts.pdf" taille="1,2 Mo" actions={<BoutonIcone etiquette="Retirer le fichier plan-des-egouts.pdf" infobulle="Retirer" icone={Trash2} danger />} />
            <LigneFichier nom="indice-secret.pdf" taille="86 Ko" secret />
            <LigneFichier nom="bestiaire.pdf" progression={42} />
          </BlocSection>
        </Etat>
      </Groupe>

      <Groupe id="d-bandeau" titre="Bandeau">
        <Etat titre="Connexion perdue, bouchon, mode Joueur">
          <div className="demo-bandeaux">
            <Bandeau sorte="perdue">Connexion perdue. Ce que vous voyez peut être dépassé ; rien n’est enregistré tant qu’elle ne revient pas.</Bandeau>
            <Bandeau sorte="bouchon">Mode bouchon — les comptes sont fictifs. Ne jamais l’ouvrir en production.</Bandeau>
            <Bandeau sorte="joueur">Mode Joueur : vous voyez ce que voit un joueur.</Bandeau>
          </div>
        </Etat>
      </Groupe>

      <Groupe id="d-chargement" titre="Chargement">
        <Etat titre="Squelette de fiche">
          <SqueletteFiche />
        </Etat>
      </Groupe>

      {dialogue && (
        <BoiteDialogue
          titre="Retirer la section « Apparence » ?"
          texte="Son texte et ses réglages d’audience seront perdus."
          action="Retirer la section"
          onFermer={() => setDialogue(false)}
          onConfirmer={() => { setDialogue(false); setRetire(true); toast('Section « Apparence » retirée'); }}
        />
      )}
    </div>
  );
}

function PageDemo() {
  if (!bouchon) return <PageIntrouvable />;
  // The toast region is the application's (App.tsx): one region, not one per screen.
  return <Demo />;
}

export default { chemin: '/demo-composants', composant: PageDemo } satisfies Ecran;
