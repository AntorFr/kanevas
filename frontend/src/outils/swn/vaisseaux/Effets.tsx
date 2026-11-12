import { Champ } from '../../../ui';
import { Equipage } from './Equipage';
import { consequencePoints } from './format';
import type { Alerte, ElementCatalogue, Ligne, Resultat } from './types';

type Info = { el: ElementCatalogue } | undefined;

/** The effect controls under a chosen line (B-83, X-7): the points of an exchange, the element a doubling aims at.
 *  Present only when the catalogue's row states the effect; nothing is computed here (V-5) — the consequence is the server's `echange`,
 *  the eligible lines are a display filter, and whether the target is valid is the server's blocking alert. */
export function Effets({ ligne, info, infos, lignes, resultat, alerte, ecriture, verrou, cle, onPoints, onInvalide, onVise }: {
  ligne: Ligne;
  info: Info;
  infos: Record<string, Info>;
  lignes: Ligne[];
  resultat: Resultat;
  alerte: Alerte | undefined;
  ecriture: boolean;
  verrou: boolean;
  cle: number;
  onPoints: (n: number) => void;
  onInvalide: (invalide: boolean) => void;
  onVise: (valeur: string) => void;
}) {
  const d = info?.el.donnees;
  if (!d) return null;

  if (d.effet === 'echange') {
    const points = ligne.points ?? 0;
    const echange = resultat.lignes.find((r) => r.nature === ligne.nature && r.cle === ligne.cle)?.echange;
    const consequence = echange && (resultat.lignes.find((r) => r.nature === ligne.nature && r.cle === ligne.cle)?.points ?? 0) === points && points > 0
      ? consequencePoints(points, echange) : undefined;
    if (!ecriture) {
      return (
        <div className="vx-effets">
          <p className="vx-lu">Points échangés : {points}</p>
          {consequence && <p className="vx-equipage-bornes">{consequence}</p>}
        </div>
      );
    }
    return (
      <div className="vx-effets">
        <p className="vx-effets-lib">Points échangés</p>
        <Equipage
          key={`${ligne.nature}/${ligne.cle}-${cle}`} nom="Points échangés" etiquette={`Points échangés : ${ligne.nom}`} maximum={d.points_max ?? 99}
          valeur={points} bornes="" ligne={consequence} lecture={false} desactive={verrou}
          onChange={onPoints} onInvalide={onInvalide}
        />
      </div>
    );
  }

  if (d.effet === 'soutes_doublees' || d.effet === 'magasins_doubles' || d.effet === 'soutes_optimisees' || d.effet === 'montage_specialise' || d.effet === 'surcharge_arme') {
    const eligibles = lignes.filter((l) => d.effet === 'soutes_doublees' || d.effet === 'soutes_optimisees'
      ? l.nature === 'amenagements' && (() => { const x = infos[`${l.nature}/${l.cle}`]?.el.donnees; return x?.soute !== undefined || x?.soute_par_classe !== undefined; })()
      : l.nature === 'armes');
    const valeur = ligne.vise ? `${ligne.vise.nature}/${ligne.vise.cle}` : '';
    const choisi = eligibles.some((l) => `${l.nature}/${l.cle}` === valeur) ? valeur : '';
    if (!ecriture) {
      const cible = ligne.vise && lignes.find((l) => l.nature === ligne.vise!.nature && l.cle === ligne.vise!.cle);
      return <div className="vx-effets"><p className="vx-lu">Élément visé : {cible ? cible.nom : 'aucun'}</p></div>;
    }
    if (eligibles.length === 0) {
      return <div className="vx-effets"><p className="vx-equipage-bornes">Aucun élément à viser dans cette conception.</p></div>;
    }
    return (
      <div className="vx-effets vx-vise">
        <Champ
          etiquette="Élément visé" liste value={choisi} disabled={verrou} aria-invalid={alerte ? true : undefined}
          onChange={(e: { target: { value: string } }) => onVise(e.target.value)}
        >
          <option value="">Choisir un élément</option>
          {eligibles.map((l) => <option key={`${l.nature}/${l.cle}`} value={`${l.nature}/${l.cle}`}>{l.nom}</option>)}
        </Champ>
      </div>
    );
  }
  return null;
}
