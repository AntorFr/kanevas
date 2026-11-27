import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Token line (charte, « Ligne de jeton »; class `ligne-jeton`, never `.jeton`): a named object, its meta and its
 * actions, shown on hover and focus. Only the visual frame lives here; the screen gives the content.
 * `inactif` is a revoked or expired token: no action, softer colours.
 */
export function ListeJetons({ etiquette, children }: { etiquette: string; children: ReactNode }) {
  return (
    <ul className="liste-jetons" aria-label={etiquette}>
      {children}
    </ul>
  );
}

export function LigneJeton({
  nom,
  pastilles,
  acces,
  acces2,
  meta,
  actions,
  inactif,
  hors,
}: {
  nom: string;
  pastilles?: ReactNode;
  acces: ReactNode;
  /** Second line of accesses (« Systèmes : … »), softer. */
  acces2?: ReactNode;
  meta: string[];
  actions?: ReactNode;
  inactif?: boolean;
  /** The connection is lost: the line is drawn at 45 %. */
  hors?: boolean;
}) {
  return (
    <li className={`ligne-jeton${inactif ? ' inactif' : ''}${hors ? ' hors' : ''}`}>
      <span className="ligne-jeton-icone" aria-hidden="true">
        <KeyRound size={14} strokeWidth={1.75} />
      </span>
      <div className="ligne-jeton-corps">
        <div className="ligne-jeton-nom">
          <b className="tronque" title={nom}>
            {nom}
          </b>
          {pastilles}
        </div>
        <div className="ligne-jeton-acces">{acces}</div>
        {acces2 && <div className="ligne-jeton-acces secondaire">{acces2}</div>}
        <div className="ligne-jeton-meta">{meta.join(' · ')}</div>
      </div>
      {actions && <div className="ligne-jeton-actions">{actions}</div>}
    </li>
  );
}
