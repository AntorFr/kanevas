import { type ComponentType, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ErreurApi, lire } from '../api';
import { useBasculeMode, useCharge, useTitreAriane } from '../cadre-contexte';
import { outilClient } from '../outils/registre';
import type { DescriptionOutil, PropsOutil } from '../outils/types';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Chargement, ErreurChargement, PageIntrouvable } from '../ui';

type Etat =
  | { k: 'chargement' }
  | { k: 'introuvable' }
  | { k: 'erreur' }
  | { k: 'ok'; description: DescriptionOutil; Composant: ComponentType<PropsOutil> };

/**
 * The generic screen of a tool (AD-133): the description first — a refusal is the page-not-found
 * answer and no code of the tool is requested — then the lazy `import()` of its component.
 */
function OutilEcran() {
  const { id, module, outil } = useParams();
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
    lire<DescriptionOutil>(`/api/univers/${id}/outils/${cle}/description${suffixe}`)
      .then(async (description) => {
        const { default: Composant } = await client.charger();
        if (actif) setEtat({ k: 'ok', description, Composant });
      })
      .catch((e: unknown) => {
        if (!actif) return;
        setEtat(e instanceof ErreurApi && e.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' });
      });
    return () => {
      actif = false;
    };
  }, [id, cle, suffixe, essai, univers.etat]); // eslint-disable-line react-hooks/exhaustive-deps

  useTitreAriane(etat.k === 'ok' ? etat.description.libelle : undefined, 'Outils');

  if (etat.k === 'introuvable') return <PageIntrouvable />;
  if (etat.k === 'erreur') return <ErreurChargement page texte="Impossible de charger l’outil." onReessayer={() => setEssai((n) => n + 1)} />;
  if (etat.k === 'chargement') return <Chargement texte="Chargement de l'outil…" />;
  return <etat.Composant universId={Number(id)} description={etat.description} />;
}

export default { chemin: '/univers/:id/outils/:module/:outil', composant: OutilEcran } satisfies Ecran;
