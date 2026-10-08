import { Dices, Eye, Library } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCharge, useUnivers } from '../cadre-contexte';
import type { SystemeCompte } from '../types';
import { ErreurChargement, Pastille } from '../ui';
import { VisuelSysteme } from '../ui/dessins';
import type { Ecran } from '../registre';
import { PucesUnivers, resumeEntrees, utilisePar } from './systeme/puces';
import './ecrans.css';
import './cartes.css';

function SqueletteCartes() {
  return (
    <div role="status">
      <ul className="grille-cartes" aria-hidden="true">
        {[
          ['62%', '44%', 150],
          ['48%', '52%', 130],
          ['70%', '40%', 170],
        ].map(([nom, ligne, puce], i) => (
          <li key={i} className="squelette-carte">
            <span className="squelette cadre-sq" />
            <span className="squelette" style={{ width: nom as string, height: 18 }} />
            <span className="squelette" style={{ width: ligne as string, height: 12 }} />
            <span className="squelette" style={{ width: puce as number, height: 26, borderRadius: 8 }} />
          </li>
        ))}
      </ul>
      <p className="squelette-texte" style={{ margin: 'var(--e-4) 0 0' }}>
        Chargement des systèmes…
      </p>
    </div>
  );
}

/** E-16 Systèmes de jeu: the systems of the account's universes, as cards; every card leads to E-15. */
function Systemes() {
  const [systemes, recharger] = useCharge<SystemeCompte[]>('/api/systemes');
  const { univers } = useUnivers();
  const mj = univers.etat === 'ok' && univers.valeur.some((u) => u.role === 'mj');
  const liste = systemes.etat === 'ok' ? [...systemes.valeur].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })) : [];
  return (
    <div className="page-cartes">
      <header className="entete-liste">
        <div>
          <h1>Systèmes de jeu</h1>
          <p className="sous-titre">Les référentiels de vos univers.</p>
        </div>
      </header>
      {systemes.etat === 'chargement' && <SqueletteCartes />}
      {systemes.etat === 'erreur' && <ErreurChargement texte="Impossible de charger les systèmes de jeu." onReessayer={recharger} />}
      {systemes.etat === 'ok' && liste.length === 0 && (
        <section className="vide-panneau" aria-labelledby="titre-vide-sys">
          <span className="rond" aria-hidden="true">
            <Dices size={20} strokeWidth={1.75} />
          </span>
          <h2 id="titre-vide-sys">Aucun système de jeu pour l’instant.</h2>
          <p>
            {mj
              ? 'Un système se rattache depuis les paramètres d’un univers que vous menez.'
              : 'Les systèmes de vos univers apparaîtront ici quand leur MJ en rattachera un.'}
          </p>
          {mj && (
            <Link className="bouton neutre" to="/">
              <Library size={14} strokeWidth={1.75} aria-hidden="true" />
              Mes univers
            </Link>
          )}
        </section>
      )}
      {systemes.etat === 'ok' && liste.length > 0 && (
        <ul className="grille-cartes" aria-label="Vos systèmes de jeu">
          {liste.map((s) => (
            <li key={s.id}>
              <article className="carte-dessin">
                <div className="entete-dessin tete-systeme">
                  <VisuelSysteme nom={s.nom} />
                  {!s.peutEcrire && (
                    <Pastille sens="neutre" icone={Eye}>
                      Lecture seule
                    </Pastille>
                  )}
                </div>
                <div className="pied-dessin">
                  <Link className="lien-carte deux-lignes" to={`/systemes/${s.id}`} title={s.nom}>
                    {s.nom}
                  </Link>
                  <span className="meta-carte">{utilisePar(s.nbUnivers)}</span>
                  <span className="meta-carte">{resumeEntrees(s.entrees)}</span>
                  <PucesUnivers univers={s.mesUnivers} />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default { chemin: '/systemes', composant: Systemes } satisfies Ecran;
