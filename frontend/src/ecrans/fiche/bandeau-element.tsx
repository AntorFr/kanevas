import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * The banner of a system element opened from a universe (E-9): whose it is, and that it is read-only here.
 * A component of its own: the slice `surcharge` adds its button beside it, `actions`, without rewriting it.
 */
export function BandeauElement({ systeme, actions }: { systeme: { id: number; nom: string }; actions?: React.ReactNode }) {
  return (
    <div className="bandeau-element" role="status">
      <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>
        Élément de <Link to={`/systemes/${systeme.id}`}>{systeme.nom}</Link> — lecture seule
      </span>
      {actions && <span className="be-actions">{actions}</span>}
    </div>
  );
}
