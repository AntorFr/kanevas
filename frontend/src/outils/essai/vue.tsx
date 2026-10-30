import type { PropsOutil } from '../types';

const texte = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v));
const ORIGINES: Record<string, string> = { defaut: 'Par défaut', systeme: 'Système', univers: 'Univers' };

/** The trial tools' whole screen: a title, the description and the effective settings with their origin. */
export function VueEssai({ description }: Pick<PropsOutil, 'description'>) {
  return (
    <section className="outil-essai">
      <h1>{description.libelle}</h1>
      <p>{description.description}</p>
      {description.reglages.map((r) => {
        const v = description.valeurs[r.nom];
        return (
          <p key={r.nom} className="outil-reglage" style={{ overflowWrap: 'anywhere' }}>
            {r.libelle} : {texte(v?.valeur)}
            {v && <span> ({ORIGINES[v.origine] ?? v.origine} · {texte(v.valeur)})</span>}
          </p>
        );
      })}
    </section>
  );
}
