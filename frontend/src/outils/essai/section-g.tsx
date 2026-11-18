import { Markdown } from '../../ui';
import type { PropsSection } from '../types';

/** The trial generator's display component for « caracteristiques »: it draws the text version itself. */
export default function SectionEssaiG({ html }: PropsSection) {
  return (
    <div className="texte composant-section" data-testid="composant-essai">
      <Markdown html={html} />
    </div>
  );
}
