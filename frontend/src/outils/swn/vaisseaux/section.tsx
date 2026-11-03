import { Markdown } from '../../../ui';
import type { PropsSection } from '../../types';
import './vaisseaux.css';

/** The display component of the section « Caractéristiques » (E-9, S-7): the framed text version, no editor. */
export default function SectionCaracteristiques({ html }: PropsSection) {
  return (
    <div className="vx-section" data-testid="composant-caracteristiques">
      <Markdown className="texte" html={html} />
    </div>
  );
}
