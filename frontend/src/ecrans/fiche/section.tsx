import { ArrowDown, ArrowUp, Ellipsis, GitCompareArrows, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { useLimiteContenu } from '../../cadre-contexte';
import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import type { Role } from '../../types';
import { Bouton, BoiteDialogue, Menu, PastilleAudience, etatAudience, useToasts } from '../../ui';
import { ReglageAudience, type Joueur } from './audience';
import { blocsSectionVisibles } from './registre';
import type { Audience, FicheVue, SectionVue } from './types';

export type { Joueur };

// Same text whether the screen or the server refuses (docs/ecrans.md, AD-91); the limit itself comes from /api/moi.
const TROP_LONG = '20 000 caractères au plus.';
const ECHEC = 'L’action n’a pas abouti. Réessayez.';

interface Props {
  universId: string;
  fiche: FicheVue;
  section: SectionVue;
  /** Effective role: the GM in player mode is a `joueur`. */
  role: Role;
  /** `?mode=joueur` or ''. */
  suffixeMode: string;
  joueurs: Joueur[];
  premiere: boolean;
  derniere: boolean;
  /** Refetches the sheet after a write. */
  rafraichir: () => Promise<void>;
  onMonter: () => Promise<void>;
  onDescendre: () => Promise<void>;
}

/** The draft of an edit survives a session expiry: it is kept in `sessionStorage` until saved or cancelled. */
const cleBrouillon = (universId: string, ficheId: number, sectionId: number) =>
  `kanevas:brouillon:${universId}:${ficheId}:${sectionId}`;

function lireBrouillon(cle: string): { texte: string; version: number } | undefined {
  try {
    const b = sessionStorage.getItem(cle);
    if (b === null) return undefined;
    const j = JSON.parse(b) as { texte?: unknown; version?: unknown };
    return typeof j.texte === 'string' && typeof j.version === 'number' ? { texte: j.texte, version: j.version } : undefined;
  } catch {
    return undefined;
  }
}

/** One section of E-9: title and audience badge, text, blocks; for the GM the audience setting, the order and the removal. */
export function PanneauSection(p: Props) {
  const { section, fiche, role } = p;
  const perdue = useConnexionPerdue();
  const maxContenu = useLimiteContenu();
  const { toast } = useToasts();
  const cle = cleBrouillon(p.universId, fiche.id, section.id);
  const [brouillon] = useState(() => (section.peutEcrire ? lireBrouillon(cle) : undefined));
  const [edition, setEdition] = useState(brouillon !== undefined);
  const [texte, setTexte] = useState(brouillon?.texte ?? '');
  const [versionLue, setVersionLue] = useState(brouillon?.version ?? section.version);
  const [enCours, setEnCours] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [echecAudience, setEchecAudience] = useState<string>();
  const [perime, setPerime] = useState(false);
  const [actuel, setActuel] = useState<string>();
  const [erreurTexte, setErreurTexte] = useState<string>();
  const [aRetirer, setARetirer] = useState(false);
  const [reglage, setReglage] = useState(false);
  const pastille = useRef<HTMLSpanElement>(null);
  const idTitre = useId();
  const idErreur = useId();

  const mj = role === 'mj';
  const url = `/api/univers/${p.universId}/fiches/${fiche.id}/sections/${section.id}`;
  const a = section.audience;
  const etat = a ? etatAudience(a) : undefined;
  const auteur = a?.auteurId != null ? p.joueurs.find((j) => j.compteId === a.auteurId)?.username : undefined;
  // « MJ seul » is hatched in amber; the rule in the margin says who reads the rest.
  const reserveMj = mj && etat === 'mj';
  const filet = !mj || etat === undefined || etat === 'mj' ? undefined : etat === 'lue' ? 'table' : etat === 'ecrite' ? 'table-ecrit' : 'confiee';

  async function ecrire(cleAction: string, action: () => Promise<void>): Promise<boolean> {
    if (enCours) return false;
    setEnCours(cleAction);
    setEchec(undefined);
    try {
      await action();
      return true;
    } catch (e) {
      setEchec(e instanceof ErreurApi && e.statut === 403 ? e.message : ECHEC);
      return false;
    } finally {
      setEnCours(undefined);
    }
  }

  function modifier() {
    setTexte(section.contenu);
    setVersionLue(section.version);
    setPerime(false);
    setActuel(undefined);
    setErreurTexte(undefined);
    setEchec(undefined);
    setEdition(true);
  }

  function annuler() {
    sessionStorage.removeItem(cle);
    setEdition(false);
    setPerime(false);
    setActuel(undefined);
    setErreurTexte(undefined);
    setEchec(undefined);
  }

  function saisir(valeur: string) {
    setTexte(valeur);
    setErreurTexte(undefined);
    try {
      sessionStorage.setItem(cle, JSON.stringify({ texte: valeur, version: versionLue }));
    } catch {
      /* storage full or unavailable: the draft just is not kept */
    }
  }

  /** « Enregistrer » and Ctrl/⌘+Entrée: the same function, so the same refusals. */
  async function enregistrer() {
    if (enCours || perdue) return;
    if (maxContenu !== undefined && texte.length > maxContenu) return setErreurTexte(TROP_LONG);
    setEnCours('enregistrer');
    setEchec(undefined);
    try {
      await appeler('PUT', `${url}/contenu`, { contenu: texte, version: versionLue });
      sessionStorage.removeItem(cle);
      setEdition(false);
      setPerime(false);
      setActuel(undefined);
      await p.rafraichir();
      toast(`« ${section.titre} » enregistrée`);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'section_modifiee') setPerime(true);
      else if (e instanceof ErreurApi && e.statut === 400) setErreurTexte(TROP_LONG);
      else if (e instanceof ErreurApi && e.statut === 403) setEchec('Vous ne pouvez plus modifier cette section.');
      else setEchec(ECHEC);
    } finally {
      setEnCours(undefined);
    }
  }

  async function recharger() {
    await ecrire('recharger', async () => {
      const s = await lire<SectionVue>(`${url}${p.suffixeMode}`);
      setVersionLue(s.version);
      setActuel(s.contenu);
      setPerime(false);
      try {
        sessionStorage.setItem(cle, JSON.stringify({ texte, version: s.version }));
      } catch {
        /* see saisir */
      }
      await p.rafraichir();
    });
  }

  async function regler(changement: Partial<Audience>) {
    if (enCours) return;
    setEnCours('audience');
    setEchecAudience(undefined);
    try {
      await appeler('PATCH', url, changement);
      await p.rafraichir();
      toast(`Audience de « ${section.titre} » enregistrée`);
    } catch {
      // The switches are driven by the server's state: they are back on their value.
      setEchecAudience(ECHEC);
    } finally {
      setEnCours(undefined);
    }
  }

  async function retirer() {
    const ok = await ecrire('retrait', async () => {
      await appeler('DELETE', url);
      sessionStorage.removeItem(cle);
      await p.rafraichir();
      toast(`Section « ${section.titre} » retirée`);
    });
    if (!ok) setARetirer(false);
  }

  const nbPieces = section.piecesJointes?.length ?? 0;
  const perte =
    nbPieces === 0 ? 'Son contenu sera perdu.' : nbPieces === 1 ? 'Son contenu et sa pièce jointe seront perdus.' : `Son contenu et ses ${nbPieces} pièces jointes seront perdus.`;
  const blocs = blocsSectionVisibles(role);
  const inactif = Boolean(enCours) || perdue;
  const trop = maxContenu !== undefined && texte.length > maxContenu;
  const erreur = erreurTexte ?? (trop ? TROP_LONG : undefined);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <section className="sec" data-aud={reserveMj ? 'mj' : filet} aria-labelledby={idTitre}>
      <div className="sec-tete">
        <h2 id={idTitre}>{section.titre}</h2>
        {mj && a && etat && (
          <span className="ancre" ref={pastille}>
            <PastilleAudience
              etat={etat}
              auteur={auteur}
              section={section.titre}
              expanded={reglage}
              onRegler={() => setReglage((o) => !o)}
            />
            {reglage && (
              <ReglageAudience
                section={section.titre}
                audience={a}
                joueurs={p.joueurs}
                inactif={inactif}
                echec={echecAudience}
                onChange={(c) => void regler(c)}
                onFermer={() => {
                  setReglage(false);
                  pastille.current?.querySelector('button')?.focus();
                }}
              />
            )}
          </span>
        )}
      </div>
      {(section.peutEcrire && !edition) || mj ? (
        <div className="sec-actions">
          {section.peutEcrire && !edition && (
            <Bouton variante="fantome" petit ecrit icone={Pencil} onClick={modifier}>
              Modifier
            </Bouton>
          )}
          {mj && (
            <Menu
              etiquette={`Autres actions sur « ${section.titre} »`}
              icone={Ellipsis}
              entrees={[
                {
                  libelle: 'Monter',
                  icone: ArrowUp,
                  impossible: p.premiere || inactif,
                  onChoisir: () => void ecrire('monter', async () => {
                    await p.onMonter();
                    toast(`« ${section.titre} » montée d’un cran`);
                  }),
                },
                {
                  libelle: 'Descendre',
                  icone: ArrowDown,
                  impossible: p.derniere || inactif,
                  onChoisir: () => void ecrire('descendre', async () => {
                    await p.onDescendre();
                    toast(`« ${section.titre} » descendue d’un cran`);
                  }),
                },
                { separateur: true },
                { libelle: 'Retirer la section', icone: Trash2, danger: true, impossible: perdue, onChoisir: () => setARetirer(true) },
              ]}
            />
          )}
        </div>
      ) : null}

      {echec && (
        <div className="alerte" role="alert">
          <span>{echec}</span>
        </div>
      )}
      {edition ? (
        <>
          {perime && (
            <div className="alerte" role="alert">
              <GitCompareArrows size={16} strokeWidth={1.75} aria-hidden="true" />
              <div className="corps-alerte">
                <span>
                  La section a changé depuis que vous l’avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste
                  ci-dessous.
                </span>
                <Bouton petit ecrit icone={RotateCcw} enCours={enCours === 'recharger'} onClick={recharger}>
                  Recharger la section
                </Bouton>
              </div>
            </div>
          )}
          {actuel !== undefined && (
            <p className="actuelle" aria-label="Version actuelle de la section">
              {actuel === '' ? 'Rien d’écrit pour l’instant.' : actuel}
            </p>
          )}
          <div className="edition">
            <textarea
              aria-label={`Contenu de « ${section.titre} »`}
              aria-invalid={erreur ? true : undefined}
              aria-describedby={erreur ? idErreur : undefined}
              value={texte}
              autoFocus
              onChange={(e) => saisir(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  annuler();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void enregistrer();
                }
              }}
            />
            <div className="pied-edition">
              <span className={`compteur${trop ? ' trop' : ''}`}>
                {texte.length.toLocaleString('fr-FR')} / {(maxContenu ?? 20000).toLocaleString('fr-FR')}
              </span>
              <span className="aide">Échap annuler · {mac ? '⌘' : 'Ctrl'} ↵ enregistrer</span>
              <Bouton onClick={annuler}>Annuler</Bouton>
              <Bouton variante="principal" ecrit enCours={enCours === 'enregistrer'} onClick={enregistrer}>
                Enregistrer
              </Bouton>
            </div>
          </div>
          {erreur && (
            <div className="erreur-edition" id={idErreur}>
              Erreur : {erreur}
            </div>
          )}
        </>
      ) : (
        <p className={`texte${section.contenu === '' ? ' vide' : ''}`}>
          {section.contenu === '' ? 'Rien d’écrit pour l’instant.' : section.contenu}
        </p>
      )}

      <div className="blocs">
        {blocs.map((b) => (
          <b.composant key={b.id} universId={Number(p.universId)} fiche={fiche} section={section} role={role} rafraichir={p.rafraichir} suffixeMode={p.suffixeMode} />
        ))}
      </div>

      {aRetirer && (
        <BoiteDialogue
          titre={`Retirer la section « ${section.titre} » ?`}
          texte={perte}
          action="Retirer la section"
          enCours={enCours === 'retrait'}
          onConfirmer={() => void retirer()}
          onFermer={() => setARetirer(false)}
          reperage={() => document.querySelector<HTMLElement>('main h1')}
        />
      )}
    </section>
  );
}
