import { BookOpen, ChevronDown, Eye, Pencil, PenLine, UserRound } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Interrupteur } from '../../ui';
import type { Audience } from './types';

export interface Joueur {
  compteId: number;
  username: string;
}

/**
 * The audience setting (« Qui voit « <section> » »): five settings, four switches and a list, each
 * change saved at once by the caller. Opened by the badge; Escape or a click outside closes it and
 * hands the focus back to the badge. Everything is disabled (and still readable) while `inactif`.
 */
export function ReglageAudience({
  section,
  audience,
  joueurs,
  inactif,
  echec,
  onChange,
  onFermer,
}: {
  section: string;
  audience: Audience;
  joueurs: Joueur[];
  inactif: boolean;
  echec?: string;
  onChange: (changement: Partial<Audience>) => void;
  onFermer: () => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const idTitre = useId();
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      // A click on the badge itself is its own toggle.
      const cible = e.target as Element;
      if (!racine.current?.contains(cible) && !racine.current?.parentElement?.contains(cible)) fermer.current();
    };
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, []);

  const a = audience;
  return (
    <div
      className="menu audience"
      role="dialog"
      aria-labelledby={idTitre}
      ref={racine}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onFermer();
        }
      }}
    >
      <div className="menu-titre" id={idTitre}>
        Qui voit « {section} »
      </div>
      <Interrupteur etiquette="Les joueurs la lisent" icone={Eye} coche={a.joueursLisent} disabled={inactif} onChange={(v) => onChange({ joueursLisent: v })} />
      <Interrupteur etiquette="Les joueurs l’écrivent" icone={PenLine} coche={a.joueursEcrivent} disabled={inactif} onChange={(v) => onChange({ joueursEcrivent: v })} />
      <div className="menu-separateur" role="separator" />
      <label className="reglage">
        <span className="reglage-libelle">
          <UserRound size={14} strokeWidth={1.75} aria-hidden="true" />
          Auteur
        </span>
        <span className="champ-liste">
          <select
            className="choix"
            value={a.auteurId ?? ''}
            disabled={inactif}
            onChange={(e) => onChange({ auteurId: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">aucun</option>
            {joueurs.map((j) => (
              <option key={j.compteId} value={j.compteId}>
                {j.username}
              </option>
            ))}
          </select>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </label>
      <Interrupteur etiquette="L’auteur la lit" icone={BookOpen} coche={a.auteurLit} disabled={inactif || a.auteurId === null} onChange={(v) => onChange({ auteurLit: v })} />
      <Interrupteur etiquette="L’auteur l’écrit" icone={Pencil} coche={a.auteurEcrit} disabled={inactif || a.auteurId === null} onChange={(v) => onChange({ auteurEcrit: v })} />
      {echec && (
        <div className="reglage-echec" role="alert">
          {echec}
        </div>
      )}
      <p className="reglage-note">Chaque changement est enregistré aussitôt.</p>
    </div>
  );
}
