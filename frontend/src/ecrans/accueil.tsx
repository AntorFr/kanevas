import { ChevronRight, Copy, Feather, Library, Plus, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useMoi, useUnivers } from '../cadre-contexte';
import { Avatar, Bouton, BoutonIcone, ErreurChargement, PastilleRole, Sceau, useToasts } from '../ui';
import type { Ecran } from '../registre';
import './ecrans.css';
import './accueil.css';

/** Loading skeleton shaped like the list (rows of seal, name, two lines), then the words. */
function SqueletteListe() {
  return (
    <div role="status">
      <div className="tete-liste">
        <span className="squelette" style={{ width: 64, height: 12 }} aria-hidden="true" />
      </div>
      {[
        ['38%', '86%', '64%'],
        ['46%', '80%', '52%'],
      ].map((l, i) => (
        <div className="squelette-univers" key={i} aria-hidden="true">
          <span className="squelette" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <span>
            <span className="squelette" style={{ display: 'block', width: l[0], height: 18 }} />
            <span className="squelette" style={{ display: 'block', width: l[1], height: 12, marginTop: 10 }} />
            <span className="squelette" style={{ display: 'block', width: l[2], height: 12, marginTop: 8 }} />
          </span>
        </div>
      ))}
      <p className="squelette-texte" style={{ margin: 'var(--e-5) 12px 0' }}>
        Chargement de vos univers…
      </p>
    </div>
  );
}

/** E-1 Accueil: my universes and my role in each, the way to create one, my identifier. */
function Accueil() {
  const { univers, recharger } = useUnivers();
  const moi = useMoi();
  const navigate = useNavigate();
  const { toast } = useToasts();
  const identifiant = moi.etat === 'ok' ? moi.valeur.username : null;
  const vide = univers.etat === 'ok' && univers.valeur.length === 0;
  const creer = (
    <Bouton variante="principal" ecrit icone={Plus} onClick={() => navigate('/univers/nouveau')}>
      Créer un univers
    </Bouton>
  );

  async function copier() {
    if (!identifiant) return;
    try {
      await navigator.clipboard.writeText(identifiant);
      toast('Identifiant copié');
    } catch {
      /* clipboard refused (insecure context): the identifier is on screen to be read out */
    }
  }

  return (
    <div className="accueil">
      <header className="entete-liste">
        <div>
          <h1>Mes univers</h1>
          {identifiant && (
            <p className="connecte">
              <Avatar nom={identifiant} petit />
              <span>
                Connecté en tant que <strong>{identifiant}</strong>
              </span>
            </p>
          )}
        </div>
        {!vide && creer}
      </header>
      {univers.etat === 'chargement' && <SqueletteListe />}
      {univers.etat === 'erreur' && <ErreurChargement texte="Impossible de charger vos univers." onReessayer={recharger} />}
      {vide && (
        <section className="accueil-vide" aria-labelledby="titre-vide">
          <div className="vide-tete">
            <span className="ic-vide">
              <Library size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h2 id="titre-vide">Aucun univers pour l’instant.</h2>
          </div>
          <div className="chemins">
            <div className="chemin">
              <Feather size={16} strokeWidth={1.75} aria-hidden="true" className="ic" />
              <p>
                <b>Vous menez une partie ?</b> Créez un univers.
              </p>
              {creer}
            </div>
            <div className="chemin">
              <UsersRound size={16} strokeWidth={1.75} aria-hidden="true" className="ic" />
              <p>
                <b>Vous êtes joueur ?</b> Donnez votre identifiant à votre MJ :{' '}
                <span className="identifiant">
                  <span>{identifiant}</span>
                  <BoutonIcone etiquette="Copier l’identifiant" infobulle="Copier" icone={Copy} onClick={copier} />
                </span>
              </p>
            </div>
          </div>
        </section>
      )}
      {univers.etat === 'ok' && !vide && (
        <>
          <div className="tete-liste" aria-hidden="true">
            <span>{univers.valeur.length} univers</span>
            <span className="col-role">Votre rôle</span>
          </div>
          <ul className="liste-univers" aria-label="Vos univers">
            {univers.valeur.map((u) => (
              <li key={u.id}>
                <Link className="ligne-univers" to={`/univers/${u.id}`}>
                  <Sceau nom={u.nom} taille="moyen" />
                  <span className="corps">
                    <span className="nom-u" title={u.nom}>
                      {u.nom}
                    </span>
                    {u.description && <span className="desc-u">{u.description}</span>}
                  </span>
                  <PastilleRole role={u.role} />
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="fleche" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default { chemin: '/', composant: Accueil } satisfies Ecran;
