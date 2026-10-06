import { ArrowRight, FileText, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Pastille } from './composants';

/** Section block (Relations, Pièces jointes): label (icon + 13 px) on the left, content on the right; stacked on a phone. */
export function BlocSection({
  libelle,
  icone: Icone,
  vide,
  children,
}: {
  libelle: string;
  icone: LucideIcon;
  /** Text of the empty block, e.g. « Aucune relation pour l’instant. »; the action goes in `children`. */
  vide?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bloc-section" role="group" aria-label={libelle}>
      <div className="bloc-libelle">
        <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
        {libelle}
      </div>
      <div className="bloc-contenu">
        {vide && <span className="bloc-vide">{vide}</span>}
        {children}
      </div>
    </div>
  );
}

/** A relation: « membre de » → target token (type icon, title, type). */
export function LigneRelation({
  lien,
  icone: Icone,
  cible,
  type,
  actions,
}: {
  lien: string;
  icone: LucideIcon;
  cible: string;
  type: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relation">
      <span className="relation-lien">{lien}</span>
      <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" className="relation-fleche" />
      <span className="jeton">
        <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
        <span className="jeton-titre" title={cible}>
          {cible}
        </span>
        <span className="jeton-type">{type}</span>
      </span>
      {actions && <span className="actions-revelees">{actions}</span>}
    </div>
  );
}

/** A file line (40 px); `secret` rings it in amber, `progression` (0–100) turns it into an upload line. */
export function LigneFichier({
  nom,
  taille,
  secret,
  progression,
  actions,
}: {
  nom: string;
  taille?: string;
  secret?: boolean;
  progression?: number;
  actions?: ReactNode;
}) {
  const envoi = progression !== undefined;
  return (
    <div className={`fichier${secret ? ' secret' : ''}`}>
      {secret ? (
        <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="fichier-nom" title={nom}>
        {nom}
      </span>
      <span className="fichier-taille">{envoi ? `Envoi… ${progression} %` : taille}</span>
      {actions && <span className="actions-revelees">{actions}</span>}
      {envoi && (
        <span
          className="fichier-barre"
          role="progressbar"
          aria-label={`Envoi de « ${nom} »`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progression}
        >
          <span style={{ width: `${progression}%` }} />
        </span>
      )}
    </div>
  );
}

/** A thumbnail 160 × 120 with its caption; a secret one is ringed in amber and wears its badge. */
export function Vignette({
  src,
  legende,
  secrete,
  actions,
}: {
  src: string;
  legende: string;
  secrete?: boolean;
  actions?: ReactNode;
}) {
  return (
    <figure className="vignette-bloc">
      <div className={`vignette-image${secrete ? ' secrete' : ''}`}>
        <img src={src} alt="" width={160} height={120} />
        {secrete && (
          <span className="vignette-pastille">
            <Pastille sens="secrete" icone={Lock}>
              Secrète — MJ seul
            </Pastille>
          </span>
        )}
      </div>
      <figcaption>
        <span title={legende}>{legende}</span>
        {actions && <span className="actions-revelees">{actions}</span>}
      </figcaption>
    </figure>
  );
}
