import { Copy, Dices, Feather, Library, Plus, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useMoi, useUnivers } from '../cadre-contexte';
import type { UniversListe } from '../types';
import { Avatar, Bouton, BoutonIcone, ErreurChargement, PastilleRole, Sceau, useToasts } from '../ui';
import { VisuelUnivers } from '../ui/dessins';
import type { Ecran } from '../registre';
import './ecrans.css';
import './accueil.css';
import './cartes.css';

/** Loading skeleton shaped like the grid (header, name, two lines), then the words. */
function SqueletteListe() {
  return (
    <div role="status">
      <ul className="grille-cartes" aria-hidden="true">
        {[
          ['58%', '90%', '60%'],
          ['44%', '84%', '50%'],
          ['66%', '78%', '56%'],
        ].map((l, i) => (
          <li key={i} className="squelette-carte">
            <span className="squelette cadre-sq" />
            <span className="squelette" style={{ width: l[0], height: 18 }} />
            <span className="squelette" style={{ width: l[1], height: 12 }} />
            <span className="squelette" style={{ width: l[2], height: 12 }} />
          </li>
        ))}
      </ul>
      <p className="squelette-texte" style={{ margin: 'var(--e-5) 0 0' }}>
        Chargement de vos univers…
      </p>
    </div>
  );
}

/** One universe card (E-1): a drawn header, the name, the description, the system and the members. */
function CarteUnivers({ u }: { u: UniversListe }) {
  const membres = u.nbMembres ?? 0;
  return (
    <Link className="carte-dessin" to={`/univers/${u.id}`}>
      {/* The text comes first in the source (read first, the link's name starts with the universe); CSS puts the header on top. */}
      <div className="pied-dessin">
        <span className="lien-carte une-ligne nom-u" title={u.nom}>
          {u.nom}
        </span>
        {u.description && <span className="desc-carte">{u.description}</span>}
        <span className="meta-u">
          {u.systeme ? (
            <span className="sys-u" title={`Système de jeu : ${u.systeme.nom}`}>
              <Dices size={14} strokeWidth={1.75} aria-hidden="true" />
              <span className="t">{u.systeme.nom}</span>
            </span>
          ) : (
            <span>Sans système de jeu</span>
          )}
          <span>
            <UsersRound size={14} strokeWidth={1.75} aria-hidden="true" />
            {membres} membre{membres > 1 ? 's' : ''}
          </span>
        </span>
      </div>
      <div className="entete-dessin tete-univers">
        <VisuelUnivers nom={u.nom} />
        <span className="pos-sceau">
          <Sceau nom={u.nom} taille="moyen" />
        </span>
        <PastilleRole role={u.role} />
      </div>
    </Link>
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
    <div className={vide ? 'accueil' : 'accueil accueil-cartes'}>
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
          </div>
          <ul className="grille-cartes" aria-label="Vos univers">
            {univers.valeur.map((u) => (
              <li key={u.id}>
                <CarteUnivers u={u} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default { chemin: '/', composant: Accueil } satisfies Ecran;
