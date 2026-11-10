import { Bouton } from '../../../ui';
import { AIDES, credits, entretien, jours, masse, nombre } from './format';
import type { Alerte, Resultat } from './types';

/** The figures of a result, with the labels of the text version (V-6). */
export function Chiffres({ r }: { r: Resultat }) {
  const lignes: [string, string][] = [
    ['Prix', credits(r.prix)],
    ['Chantier', jours(r.chantierJours)],
    ['Entretien', entretien(r.entretien)],
    ['PV', nombre(r.pv)],
    ['CA', nombre(r.ca)],
    ['Portée de saut', r.porteeSaut === null ? '—' : `${r.porteeSaut} cases`],
    ...(r.vitesse != null ? [['Vitesse', String(r.vitesse)] as [string, string]] : []),
    ...(r.armure != null ? [['Armure', String(r.armure)] as [string, string]] : []),
    ...(r.equipage != null ? [['Équipage', String(r.equipage.choisi)] as [string, string]] : []),
    ['Puissance libre', nombre(r.puissanceLibre)],
    ['Masse libre', masse(r.masseLibre)],
    ['Emports', `${r.emports.utilises} / ${r.emports.total}`],
  ];
  return (
    <dl className="vx-chiffres">
      {lignes.map(([k, v]) => (
        <div key={k} className="vx-chiffre">
          <dt>{k}</dt>
          <dd className={k === 'Puissance libre' && r.puissanceLibre < 0 || k === 'Masse libre' && r.masseLibre < 0 ? 'negatif' : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Blocking alerts first (the server already orders them), then the watch ones. */
export function Alertes({ alertes }: { alertes: Alerte[] }) {
  if (alertes.length === 0) return null;
  const ordre = [...alertes.filter((a) => a.niveau === 'bloquante'), ...alertes.filter((a) => a.niveau !== 'bloquante')];
  return (
    <ul className="vx-alertes">
      {ordre.map((a, i) => (
        <li key={`${a.code}-${i}`} className={`vx-alerte ${a.niveau === 'bloquante' ? 'bloquante' : 'surveiller'}`}>
          <span className="vx-niveau">{a.niveau === 'bloquante' ? 'Bloquante' : 'À surveiller'}</span>
          <span>{a.texte}</span>
          {a.niveau === 'bloquante' && AIDES[a.code] && <span className="vx-aide">{AIDES[a.code]}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ErreurCalcul({ onReessayer }: { onReessayer: () => void }) {
  return (
    <p className="echec vx-erreur-calcul" role="alert">
      Impossible de calculer ce vaisseau. <Bouton petit onClick={onReessayer}>Réessayer</Bouton>
    </p>
  );
}
