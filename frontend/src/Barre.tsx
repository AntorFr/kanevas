import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';

import { appeler } from './api';
import { useMoi, useUnivers } from './cadre-contexte';
import { ecranEnregistre } from './registre';
import { ITEMS_UNIVERS } from './items';
import { type ChoixTheme, useTheme } from './theme';
import { Bouton, PastilleRole } from './ui';

const THEMES: [ChoixTheme, string][] = [
  ['clair', 'Clair'],
  ['sombre', 'Sombre'],
  ['systeme', 'Système'],
];

/** Id of the universe in the address, or null outside a universe. */
export function universDeLAdresse(chemin: string): number | null {
  const m = matchPath({ path: '/univers/:id/*' }, chemin);
  const id = m?.params.id;
  return id && /^\d+$/.test(id) ? Number(id) : null;
}

function Selecteur({ courant }: { courant: number }) {
  const { univers, recharger } = useUnivers();
  const [ouvert, setOuvert] = useState(false);
  const actuel = univers.etat === 'ok' ? univers.valeur.find((u) => u.id === courant) : undefined;
  const etiquette = univers.etat === 'chargement' ? '…' : actuel ? actuel.nom : 'Univers';
  return (
    <div className="selecteur">
      <button
        type="button"
        className="selecteur-bouton"
        aria-expanded={ouvert}
        aria-haspopup="true"
        title={actuel?.nom}
        onClick={() => setOuvert(!ouvert)}
      >
        <span className="tronque">{etiquette}</span>
        {actuel && <PastilleRole role={actuel.role} />}
      </button>
      {ouvert && (
        <div className="selecteur-liste">
          {univers.etat === 'erreur' && (
            <div>
              <p role="alert">Impossible de charger vos univers.</p>
              <Bouton petit onClick={recharger}>
                Réessayer
              </Bouton>
            </div>
          )}
          {univers.etat === 'ok' && (
            <ul>
              {univers.valeur.map((u) => (
                <li key={u.id}>
                  <Link to={`/univers/${u.id}`} title={u.nom} onClick={() => setOuvert(false)}>
                    <span className="tronque">{u.nom}</span>
                    <PastilleRole role={u.role} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/" onClick={() => setOuvert(false)}>
            Mes univers
          </Link>
        </div>
      )}
    </div>
  );
}

/** The bar's content: universe selector and items inside a universe, « Mes univers » outside. */
function Contenu() {
  const { pathname } = useLocation();
  const { univers } = useUnivers();
  const moi = useMoi();
  const [theme, setTheme] = useTheme();
  const id = universDeLAdresse(pathname);
  // Inside a universe only if the account has it: an unknown universe, or one without a role,
  // gets the bar of a screen outside (no selector, no name) — the refusal state of docs/ecrans.md.
  const connu = univers.etat !== 'ok' || univers.valeur.some((u) => u.id === id);
  const dedans = id !== null && connu;
  const role = univers.etat === 'ok' ? univers.valeur.find((u) => u.id === id)?.role : undefined;
  const items = dedans ? ITEMS_UNIVERS.filter((i) => ecranEnregistre(i.chemin(id), undefined) && (!i.role || i.role === role)) : [];
  const sections = [...new Set(items.map((i) => i.section ?? ''))];

  return (
    <>
      <div className="marque">Kanevas</div>
      {dedans && <Selecteur courant={id} />}
      <nav aria-label="Navigation principale">
        {!dedans && (
          <NavLink to="/" end className="item">
            Mes univers
          </NavLink>
        )}
        {sections.map((s) => (
          <div key={s}>
            {s && <div className="section">{s}</div>}
            {items
              .filter((i) => (i.section ?? '') === s)
              .map((i) => (
                <NavLink key={i.libelle} to={i.chemin(id!)} end className="item">
                  {i.libelle}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
      <div className="pied">
        <div className="identifiant">{moi.etat === 'ok' ? moi.valeur.username : '…'}</div>
        <label className="theme">
          Thème
          <select value={theme} onChange={(e) => setTheme(e.target.value as ChoixTheme)}>
            {THEMES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Bouton
          petit
          onClick={async () => {
            const r = await appeler<{ loginUrl: string }>('POST', '/api/auth/logout');
            window.location.assign(r.loginUrl);
          }}
        >
          Se déconnecter
        </Bouton>
      </div>
    </>
  );
}

/** Fixed bar on wide screens, a drawer under « Menu » below 760 px (Escape closes, focus returns). */
export function Barre() {
  const [tiroir, setTiroir] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setTiroir(false), [pathname]);
  useEffect(() => {
    if (!tiroir) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTiroir(false);
        menu.current?.focus();
      }
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [tiroir]);
  return (
    <>
      <button type="button" ref={menu} className="bouton menu-bouton" aria-expanded={tiroir} aria-controls="barre" onClick={() => setTiroir(!tiroir)}>
        Menu
      </button>
      <aside id="barre" className={`barre${tiroir ? ' ouverte' : ''}`}>
        <Contenu />
      </aside>
    </>
  );
}
