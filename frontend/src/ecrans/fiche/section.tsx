import { useState } from 'react';

import { useLimiteContenu } from '../../cadre-contexte';
import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import type { Role } from '../../types';
import { Bouton, Champ, Panneau } from '../../ui';
import { blocsSectionVisibles } from './registre';
import type { Audience, FicheVue, SectionVue } from './types';

// Same text whether the screen or the server refuses (docs/ecrans.md, AD-91); the limit itself comes from /api/moi.
const TROP_LONG = '20 000 caractères au plus.';
const ECHEC = 'L’action n’a pas abouti. Réessayez.';

export interface Joueur {
  compteId: number;
  username: string;
}

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

/** One section of E-9: reading, editing, and for the GM the audience, the order and the removal. */
export function PanneauSection(p: Props) {
  const { section, fiche, role } = p;
  const perdue = useConnexionPerdue();
  const maxContenu = useLimiteContenu();
  const cle = cleBrouillon(p.universId, fiche.id, section.id);
  const [brouillon] = useState(() => (section.peutEcrire ? lireBrouillon(cle) : undefined));
  const [edition, setEdition] = useState(brouillon !== undefined);
  const [texte, setTexte] = useState(brouillon?.texte ?? '');
  const [versionLue, setVersionLue] = useState(brouillon?.version ?? section.version);
  const [enCours, setEnCours] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [perime, setPerime] = useState(false);
  const [actuel, setActuel] = useState<string>();
  const [erreurTexte, setErreurTexte] = useState<string>();
  const [aRetirer, setARetirer] = useState(false);

  const mj = role === 'mj';
  const url = `/api/univers/${p.universId}/fiches/${fiche.id}/sections/${section.id}`;
  const a = section.audience;
  const reserveMj = mj && a !== undefined && !a.joueursLisent && !(a.auteurId !== null && a.auteurLit);

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

  async function enregistrer() {
    if (enCours) return;
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

  function regler(changement: Partial<Audience>) {
    return ecrire('audience', async () => {
      await appeler('PATCH', url, changement);
      await p.rafraichir();
    });
  }

  async function retirer() {
    const ok = await ecrire('retrait', async () => {
      await appeler('DELETE', url);
      sessionStorage.removeItem(cle);
      await p.rafraichir();
    });
    if (!ok) setARetirer(false);
  }

  const nbPieces = section.piecesJointes?.length ?? 0;
  const perte =
    nbPieces === 0 ? 'Son contenu sera perdu.' : nbPieces === 1 ? 'Son contenu et sa pièce jointe seront perdus.' : `Son contenu et ses ${nbPieces} pièces jointes seront perdus.`;
  const blocs = blocsSectionVisibles(role);
  const inactif = Boolean(enCours) || perdue;

  return (
    <div className="section-fiche">
      <Panneau titre={section.titre} reserveMj={reserveMj}>
        {echec && (
          <div className="echec" role="alert">
            {echec}
          </div>
        )}
        {edition ? (
          <>
            {perime && (
              <div className="echec" role="alert">
                La section a changé depuis que vous l’avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste
                ci-dessous.{' '}
                <Bouton petit ecrit enCours={enCours === 'recharger'} onClick={recharger}>
                  Recharger la section
                </Bouton>
              </div>
            )}
            {actuel !== undefined && (
              <p className="actuelle" aria-label="Version actuelle de la section">
                {actuel === '' ? 'Rien d’écrit pour l’instant.' : actuel}
              </p>
            )}
            <Champ
              zone
              etiquette={`Contenu de « ${section.titre} »`}
              value={texte}
              erreur={erreurTexte ?? (maxContenu !== undefined && texte.length > maxContenu ? TROP_LONG : undefined)}
              onChange={(e: { target: { value: string } }) => saisir(e.target.value)}
            />
            <div className="actions">
              <Bouton variante="principal" ecrit enCours={enCours === 'enregistrer'} onClick={enregistrer}>
                Enregistrer
              </Bouton>
              <Bouton onClick={annuler}>Annuler</Bouton>
            </div>
          </>
        ) : (
          <>
            <p className={`contenu${section.contenu === '' ? ' vide' : ''}`}>
              {section.contenu === '' ? 'Rien d’écrit pour l’instant.' : section.contenu}
            </p>
            {section.peutEcrire && (
              <Bouton ecrit onClick={modifier}>
                Modifier
              </Bouton>
            )}
          </>
        )}

        {mj && a && (
          <>
            <div className="audience" role="group" aria-label={`Audience de « ${section.titre} »`}>
              <label>
                <input type="checkbox" checked={a.joueursLisent} disabled={inactif} onChange={(e) => regler({ joueursLisent: e.target.checked })} />
                Les joueurs la lisent
              </label>
              <label>
                <input type="checkbox" checked={a.joueursEcrivent} disabled={inactif} onChange={(e) => regler({ joueursEcrivent: e.target.checked })} />
                Les joueurs l’écrivent
              </label>
              <label>
                Auteur
                <select
                  value={a.auteurId ?? ''}
                  disabled={inactif}
                  onChange={(e) => regler({ auteurId: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <option value="">aucun</option>
                  {p.joueurs.map((j) => (
                    <option key={j.compteId} value={j.compteId}>
                      {j.username}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" checked={a.auteurLit} disabled={inactif || a.auteurId === null} onChange={(e) => regler({ auteurLit: e.target.checked })} />
                L’auteur la lit
              </label>
              <label>
                <input type="checkbox" checked={a.auteurEcrit} disabled={inactif || a.auteurId === null} onChange={(e) => regler({ auteurEcrit: e.target.checked })} />
                L’auteur l’écrit
              </label>
            </div>
            <div className="actions">
              <Bouton petit ecrit disabled={p.premiere} enCours={enCours === 'monter'} onClick={() => ecrire('monter', p.onMonter)}>
                Monter
              </Bouton>
              <Bouton petit ecrit disabled={p.derniere} enCours={enCours === 'descendre'} onClick={() => ecrire('descendre', p.onDescendre)}>
                Descendre
              </Bouton>
              {!aRetirer && (
                <Bouton petit variante="danger" ecrit onClick={() => setARetirer(true)}>
                  Retirer la section
                </Bouton>
              )}
            </div>
            {aRetirer && (
              <div className="confirmation" role="alertdialog" aria-label="Confirmer le retrait">
                <p>Retirer la section « {section.titre} » ? {perte}</p>
                <div className="actions">
                  <Bouton variante="danger" ecrit enCours={enCours === 'retrait'} onClick={retirer}>
                    Retirer la section
                  </Bouton>
                  <Bouton onClick={() => setARetirer(false)}>Annuler</Bouton>
                </div>
              </div>
            )}
          </>
        )}

        {blocs.map((b) => (
          <b.composant key={b.id} universId={Number(p.universId)} fiche={fiche} section={section} role={role} rafraichir={p.rafraichir} />
        ))}
      </Panneau>
    </div>
  );
}
