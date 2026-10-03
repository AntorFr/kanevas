import { Link, useNavigate } from 'react-router-dom';

import { useMoi, useUnivers } from '../cadre-contexte';
import { Bouton, Chargement, EtatVide, ErreurChargement, PastilleRole } from '../ui';
import type { Ecran } from '../registre';
import './ecrans.css';

/** E-1 Accueil: my universes and my role in each, the way to create one, my identifier. */
function Accueil() {
  const { univers, recharger } = useUnivers();
  const moi = useMoi();
  const navigate = useNavigate();
  const identifiant = moi.etat === 'ok' ? moi.valeur.username : null;
  const creer = (
    <Bouton variante="principal" ecrit onClick={() => navigate('/univers/nouveau')}>
      Créer un univers
    </Bouton>
  );

  return (
    <>
      <h1>Mes univers</h1>
      {identifiant && (
        <p className="connecte">
          Connecté en tant que <strong>{identifiant}</strong>
        </p>
      )}
      {univers.etat === 'chargement' && <Chargement texte="Chargement de vos univers…" />}
      {univers.etat === 'erreur' && <ErreurChargement texte="Impossible de charger vos univers." onReessayer={recharger} />}
      {univers.etat === 'ok' && univers.valeur.length === 0 && (
        <EtatVide titre="Aucun univers pour l’instant.">
          <p>Vous menez une partie ? Créez un univers.</p>
          <p>
            Vous êtes joueur ? Donnez votre identifiant à votre MJ : <strong>{identifiant}</strong>
          </p>
          {creer}
        </EtatVide>
      )}
      {univers.etat === 'ok' && univers.valeur.length > 0 && (
        <>
          <ul className="liste-univers">
            {univers.valeur.map((u) => (
              <li key={u.id}>
                <Link to={`/univers/${u.id}`}>
                  <div className="ligne">
                    <span className="tronque" title={u.nom}>
                      {u.nom}
                    </span>
                    <PastilleRole role={u.role} />
                  </div>
                  {u.description && <div className="description">{u.description}</div>}
                </Link>
              </li>
            ))}
          </ul>
          {creer}
        </>
      )}
    </>
  );
}

export default { chemin: '/', composant: Accueil } satisfies Ecran;
