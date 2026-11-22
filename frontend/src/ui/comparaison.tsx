import { useId } from 'react';

/**
 * Comparison (charte, « Comparaison », E-24): « Valeur précédente » next to « Valeur actuelle », plain text,
 * read-only, never rendered as Markdown and never in the red and green of a diff. `seule` is the one-zone
 * variant (the sections of a deleted sheet, a field with no current value), labelled with `nom`.
 */
function Zone({ etiquette, texte, classe }: { etiquette: string; texte: string; classe: string }) {
  const id = useId();
  return (
    <div className={`comparaison-zone ${classe}`} role="region" aria-labelledby={id} tabIndex={0}>
      <span className="comparaison-etiquette" id={id}>
        {etiquette}
      </span>
      <pre className="comparaison-texte">{texte}</pre>
    </div>
  );
}

export function Comparaison({
  avant,
  courante,
}: {
  avant: string;
  /** Null: the object has no current value any more. */
  courante: string | null;
}) {
  return (
    <div className="comparaison">
      <Zone etiquette="Valeur précédente" texte={avant} classe="avant" />
      <Zone etiquette="Valeur actuelle" texte={courante ?? '—'} classe="courante" />
    </div>
  );
}

export function ComparaisonSeule({ nom, texte }: { nom: string; texte: string }) {
  return (
    <div className="comparaison seule">
      <Zone etiquette={nom} texte={texte} classe="courante" />
    </div>
  );
}
