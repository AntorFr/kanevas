import { ExternalLink, ImagePlus, RotateCcw } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { aller } from '../adresse';
import type { PropsBloc } from './registre';

type Etat = 'chargement' | 'charge' | 'indisponible';

// Distinct per mounted block: a reopened panel must not be served the image from the document's memory cache.
let compteurMontages = 0;

/**
 * « Image attachée » (E-12, AD-76): the label, the thumbnail read by the authenticated attachment
 * route (AD-67, no public address) and a link to the section. A thumbnail that fails stays inside
 * its own block: the rest of the thread is untouched.
 */
export function ImageAttachee({ evenement, universId, surOuverture }: PropsBloc) {
  const { ficheId, sectionId, pieceId, description } = evenement.cible;
  const perdue = useConnexionPerdue();
  const [etat, setEtat] = useState<Etat>('chargement');
  const montage = useRef('');
  if (!montage.current) montage.current = `${Date.now().toString(36)}-${++compteurMontages}`;
  const [essai, setEssai] = useState(0);
  const racine = useRef<HTMLDivElement>(null);

  // The block grows once rendered in its new state (image shown, or the unavailable frame and its
  // button): scroll the thread after that render, not from the load handlers, which run before it.
  useLayoutEffect(() => {
    const fil = racine.current?.closest('.asst-fil');
    if (fil) fil.scrollTop = fil.scrollHeight;
  }, [etat]);

  const lien = `/univers/${universId}/fiche/${ficheId}#section-${sectionId}`;
  const source = `/api/univers/${universId}/fiches/${ficheId}/pieces-jointes/${pieceId}/fichier?essai=${montage.current}-${essai}`;

  return (
    <div className="asst-ecriture" ref={racine}>
      <p className="asst-ecriture-mot">
        <ImagePlus size={12} strokeWidth={1.75} aria-hidden="true" /> Écrit par l’assistant
      </p>
      <p className="asst-ecriture-libelle">{evenement.libelle}</p>
      <div className="asst-image-cadre">
        {etat === 'chargement' && (
          <div className="asst-image-vide" role="status">
            Chargement de l’image…
          </div>
        )}
        {etat === 'indisponible' ? (
          <div className="asst-image-vide">
            <p>Image indisponible.</p>
          </div>
        ) : (
          <img
            key={essai}
            src={source}
            alt={String(description ?? '')}
            hidden={etat !== 'charge'}
            onLoad={() => setEtat('charge')}
            onError={() => setEtat('indisponible')}
          />
        )}
      </div>
      {etat === 'indisponible' && (
        <div className="asst-image-recharger">
          <Bouton
            petit
            icone={RotateCcw}
            disabled={perdue}
            onClick={() => {
              setEtat('chargement');
              setEssai((n) => n + 1);
            }}
          >
            Recharger l’image
          </Bouton>
        </div>
      )}
      <a
        href={lien}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          surOuverture();
          aller(lien);
          // A sheet already on screen does not know the image: ask it to read itself again.
          window.dispatchEvent(new Event('kanevas:fiche-ecrite'));
        }}
      >
        Ouvrir la section <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
      </a>
    </div>
  );
}
