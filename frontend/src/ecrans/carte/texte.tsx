import { useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { Bouton, EditeurMarkdown, Markdown, Panneau } from '../../ui';
import type { Carte } from '../cartes/commun';

/** At most this many characters in a map's text (AD-142). */
const MAX = 5000;
const CHANGE = 'Le texte a changé depuis votre lecture.';
const ECHEC = 'Impossible d’enregistrer le texte.';

/**
 * E-11, under the frame: the text of the map. Everyone reads the server's HTML (a player's has no GM block);
 * the GM, outside player mode, also writes it. A conflict or a failure keeps the draft in the field.
 */
export function TexteCarte({ universId, base, carte, gerer, onCarte, relire }: {
  universId: string;
  base: string;
  carte: Carte;
  gerer: boolean;
  onCarte: (c: Carte) => void;
  /** Reads the map again (the version moved): returns it. */
  relire: () => Promise<Carte | undefined>;
}) {
  const perdue = useConnexionPerdue();
  const [brouillon, setBrouillon] = useState<string>();
  const [issue, setIssue] = useState<'conflit' | 'echec'>();
  const [enCours, setEnCours] = useState(false);
  const html = carte.html ?? '';
  const vide = html.trim() === '';
  const edition = gerer && brouillon !== undefined;

  async function ecrire(texte: string, fermer: boolean) {
    if (enCours) return;
    setEnCours(true);
    setIssue(undefined);
    try {
      const c = await appeler<Carte>('PUT', `${base}/texte`, { texte, version: carte.version ?? 0 });
      onCarte(c);
      if (fermer) setBrouillon(undefined);
    } catch (e) {
      if (fermer) setBrouillon((b) => b ?? texte);
      setIssue(e instanceof ErreurApi && (e.statut === 409 || e.code === 'carte_modifiee') ? 'conflit' : 'echec');
    } finally {
      setEnCours(false);
    }
  }

  async function recharger() {
    const c = await relire();
    if (c) onCarte(c);
    setIssue(undefined);
  }

  if (!gerer && vide) return null;
  const trop = (brouillon ?? '').length > MAX;
  return (
    <Panneau titre="Texte">
      {edition ? (
        <>
          <EditeurMarkdown
            etiquette="Texte de la carte"
            valeur={brouillon}
            onChange={setBrouillon}
            max={MAX}
            rows={8}
            autoFocus
            section={{ universId, modeJoueur: false, blocMJ: true }}
            onEnregistrer={() => !trop && !perdue && void ecrire(brouillon, true)}
            onAnnuler={() => {
              setBrouillon(undefined);
              setIssue(undefined);
            }}
          >
            <Bouton
              onClick={() => {
                setBrouillon(undefined);
                setIssue(undefined);
              }}
            >
              Annuler
            </Bouton>
            <Bouton variante="principal" ecrit disabled={trop || perdue} enCours={enCours} onClick={() => void ecrire(brouillon, true)}>
              Enregistrer
            </Bouton>
          </EditeurMarkdown>
          {issue === 'conflit' && (
            <div className="echec" role="alert">
              {CHANGE}{' '}
              <Bouton petit onClick={() => void recharger()}>
                Recharger
              </Bouton>
            </div>
          )}
          {issue === 'echec' && (
            <div className="echec" role="alert">
              {ECHEC}{' '}
              <Bouton petit disabled={perdue} onClick={() => void ecrire(brouillon, true)}>
                Réessayer
              </Bouton>
            </div>
          )}
        </>
      ) : (
        <>
          {!vide && <Markdown className="texte" html={html} />}
          {gerer && (
            <div className="actions">
              <Bouton petit ecrit onClick={() => setBrouillon(carte.texte ?? '')}>
                {vide && (carte.texte ?? '') === '' ? 'Ajouter un texte' : 'Modifier'}
              </Bouton>
              {(carte.texte ?? '') !== '' && (
                <Bouton petit ecrit variante="danger" enCours={enCours} onClick={() => void ecrire('', false)}>
                  Vider
                </Bouton>
              )}
            </div>
          )}
          {issue === 'conflit' && (
            <div className="echec" role="alert">
              {CHANGE}{' '}
              <Bouton petit onClick={() => void recharger()}>
                Recharger
              </Bouton>
            </div>
          )}
          {issue === 'echec' && (
            <div className="echec" role="alert">
              {ECHEC}
            </div>
          )}
        </>
      )}
    </Panneau>
  );
}
