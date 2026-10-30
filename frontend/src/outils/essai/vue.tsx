import type { PropsOutil } from '../types';

const texte = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v));

/** The trial tools' whole screen: a title, the description and the effective settings. */
export function VueEssai({ description }: Pick<PropsOutil, 'description'>) {
  const lignes = [...description.reglages, ...Object.keys(description.communs).map((nom) => ({ nom, libelle: nom }))];
  return (
    <section className="outil-essai">
      <h1>{description.libelle}</h1>
      <p>{description.description}</p>
      {lignes.length > 0 && (
        <dl>
          {description.reglages.map((r) => (
            <div key={r.nom}>
              <dt>{r.libelle}</dt>
              <dd>{texte(description.valeurs[r.nom]?.valeur)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
