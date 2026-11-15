import { type ComponentType, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErreurApi, lire } from '../api';
import { useBasculeMode, useCharge, useTitreAriane, useVue } from '../cadre-contexte';
import { outilClient } from '../outils/registre';
import type { DescriptionOutil, PropsOutil } from '../outils/types';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Chargement, ErreurChargement, PageIntrouvable } from '../ui';

type Etat =
  | { k: 'chargement' }
  | { k: 'introuvable' }
  | { k: 'erreur' }
  | { k: 'mode-joueur' }
  | { k: 'ok'; description: DescriptionOutil; prealable: unknown; suffixe: string; Composant: ComponentType<PropsOutil> };

/**
 * The generic screen of a tool (AD-133): the description first — a refusal is the page-not-found
 * answer and no code of the tool is requested — then the lazy `import()` of its component.
 */
export function OutilEcran() {
  const { id, module, outil, cible } = useParams();
  const cle = `${module}/${outil}`;
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj';
  const mode = useBasculeMode(mj);
  const suffixe = mj && mode === 'joueur' ? '?mode=joueur' : '';
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const client = outilClient(cle);

  useEffect(() => {
    if (!client) return setEtat({ k: 'introuvable' });
    // Wait for the role: the mode of a GM must be known before the first request.
    if (univers.etat === 'chargement') return;
    let actif = true;
    setEtat({ k: 'chargement' });
    Promise.all([
      lire<DescriptionOutil>(`/api/univers/${id}/outils/${cle}/description${suffixe}`),
      client.verifier ? client.verifier(Number(id), cible, suffixe) : Promise.resolve(undefined),
    ])
      .then(async ([description, prealable]) => {
        const { default: Composant } = await client.charger();
        if (actif) setEtat({ k: 'ok', description, prealable, suffixe, Composant });
      })
      .catch((e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 403 && e.code === 'mode_joueur') return setEtat({ k: 'mode-joueur' });
        setEtat(e instanceof ErreurApi && e.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' });
      });
    return () => {
      actif = false;
    };
  }, [id, cle, cible, suffixe, essai, univers.etat]); // eslint-disable-line react-hooks/exhaustive-deps

  useTitreAriane(etat.k === 'ok' ? etat.description.libelle : undefined, 'Outils');

  if (etat.k === 'introuvable') return <PageIntrouvable />;
  if (etat.k === 'mode-joueur') return <CarteCachee />;
  if (etat.k === 'erreur') return <ErreurChargement page texte="Impossible de charger l’outil." onReessayer={() => setEssai((n) => n + 1)} />;
  if (etat.k === 'chargement') return <Chargement texte="Chargement de l'outil…" />;
  return <etat.Composant universId={Number(id)} description={etat.description} cible={cible} prealable={etat.prealable} suffixeMode={etat.suffixe} />;
}

/** Player mode on a map the players cannot see (E-11's notice, shared). */
function CarteCachee() {
  const { setMode } = useVue();
  return (
    <div className="page-message" role="alert">
      <h1>Cette carte n’est pas visible des joueurs.</h1>
      <div className="actions">
        <Bouton onClick={() => setMode('mj')}>Quitter le mode Joueur</Bouton>
        <Link className="bouton neutre" to="/">
          Mes univers
        </Link>
      </div>
    </div>
  );
}

export default { chemin: '/univers/:id/outils/:module/:outil', composant: OutilEcran } satisfies Ecran;
