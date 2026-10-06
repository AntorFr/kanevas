import { Check, ChevronsUpDown, Library, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';

import { appeler } from './api';
import { useMoi, useUnivers } from './cadre-contexte';
import { ITEMS_UNIVERS, type Item } from './items';
import { ecranEnregistre } from './registre';
import { type ChoixTheme, useTheme } from './theme';
import { Avatar, Bouton, Menu, PastilleRole, type EntreeMenu } from './ui';

/** Id of the universe in the address, or null outside a universe. */
export function universDeLAdresse(chemin: string): number | null {
  const m = matchPath({ path: '/univers/:id/*' }, chemin);
  const id = m?.params.id;
  return id && /^\d+$/.test(id) ? Number(id) : null;
}

/** An item is current on its own address, and below it (a sheet under « Lore » is not an item: no mark). */
export function itemCourant(item: Item, id: number, pathname: string): boolean {
  const chemin = item.chemin(id);
  return pathname === chemin || (chemin !== `/univers/${id}` && pathname.startsWith(`${chemin}/`));
}

/** The seal of a universe: its initial on a quiet tile. */
export function Sceau({ nom, petit }: { nom: string; petit?: boolean }) {
  return (
    <span className={`sceau${petit ? ' petit' : ''}`} aria-hidden="true">
      {nom.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

function Selecteur({ courant, onChoix }: { courant: number; onChoix: () => void }) {
  const { univers, recharger } = useUnivers();
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const actuel = univers.etat === 'ok' ? univers.valeur.find((u) => u.id === courant) : undefined;
  const etiquette = univers.etat === 'chargement' ? '…' : actuel ? actuel.nom : 'Univers';

  useEffect(() => {
    if (!ouvert) return;
    racine.current?.querySelector<HTMLElement>('.menu a, .menu button')?.focus();
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOuvert(false);
      bouton.current?.focus();
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', touche, true);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', touche, true);
    };
  }, [ouvert]);

  const choisi = () => {
    setOuvert(false);
    onChoix();
  };
  return (
    <div className="selecteur" ref={racine}>
      <button
        ref={bouton}
        type="button"
        className="univers"
        aria-expanded={ouvert}
        aria-haspopup="true"
        title={actuel ? `${actuel.nom} — changer d’univers` : undefined}
        onClick={() => setOuvert(!ouvert)}
      >
        <Sceau nom={actuel ? actuel.nom : ''} />
        <span className="nom tronque">{etiquette}</span>
        {actuel && <PastilleRole role={actuel.role} />}
        <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {ouvert && (
        <div className="menu menu-univers">
          {univers.etat === 'erreur' && (
            <div className="menu-contenu">
              <p role="alert">Impossible de charger vos univers.</p>
              <Bouton petit onClick={recharger}>
                Réessayer
              </Bouton>
            </div>
          )}
          {univers.etat === 'ok' && (
            <>
              <div className="menu-titre">Vos univers</div>
              {univers.valeur.map((u) => (
                <Link key={u.id} to={`/univers/${u.id}`} className="menu-entree" title={u.nom} onClick={choisi}>
                  <Sceau nom={u.nom} petit />
                  <span className="tronque">{u.nom}</span>
                  <PastilleRole role={u.role} />
                  {u.id === courant && <Check size={14} strokeWidth={1.75} aria-hidden="true" />}
                </Link>
              ))}
              <div className="menu-separateur" role="separator" />
            </>
          )}
          <Link to="/" className="menu-entree" onClick={choisi}>
            <Library size={16} strokeWidth={1.75} aria-hidden="true" />
            Mes univers
          </Link>
        </div>
      )}
    </div>
  );
}

const THEMES: { choix: ChoixTheme; libelle: string; icone: typeof Sun }[] = [
  { choix: 'clair', libelle: 'Clair', icone: Sun },
  { choix: 'sombre', libelle: 'Sombre', icone: Moon },
  { choix: 'systeme', libelle: 'Système', icone: Monitor },
];

/** The account: an avatar and the identifier, opening the menu with the theme and « Se déconnecter ». */
function Compte() {
  const moi = useMoi();
  const [theme, setTheme] = useTheme();
  const nom = moi.etat === 'ok' ? moi.valeur.username : undefined;
  const entrees: EntreeMenu[] = [
    ...(nom
      ? [
          {
            contenu: (
              <div className="qui">
                <Avatar nom={nom} />
                <span>
                  <b className="tronque" title={nom}>
                    {nom}
                  </b>
                  <small>Votre identifiant</small>
                </span>
              </div>
            ),
          } as EntreeMenu,
          { separateur: true } as EntreeMenu,
        ]
      : []),
    {
      groupe: 'Thème',
      options: THEMES.map((t) => ({ libelle: t.libelle, icone: t.icone, actif: theme === t.choix, onChoisir: () => setTheme(t.choix) })),
    },
    { separateur: true },
    {
      libelle: 'Se déconnecter',
      icone: LogOut,
      onChoisir: async () => {
        const r = await appeler<{ loginUrl: string }>('POST', '/api/auth/logout');
        window.location.assign(r.loginUrl);
      },
    },
  ];
  return (
    <div className="pied">
      <Menu
        etiquette="Compte"
        large
        ouvre="haut"
        aligne="debut"
        entrees={entrees}
        declencheur={
          <>
            <Avatar nom={nom ?? '?'} />
            <span className="ident tronque" title={nom}>
              {moi.etat === 'chargement' ? '…' : (nom ?? 'Compte')}
            </span>
            <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" />
          </>
        }
      />
    </div>
  );
}

/** The bar's content: universe selector and items inside a universe, « Mes univers » outside. */
function Contenu({ onNavigue }: { onNavigue: () => void }) {
  const { pathname } = useLocation();
  const { univers } = useUnivers();
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
      {dedans ? (
        <Selecteur courant={id} onChoix={onNavigue} />
      ) : (
        <Link to="/" className="marque" aria-label="Kanevas — Mes univers">
          <span className="sceau" aria-hidden="true">
            K
          </span>
          <span className="nom-marque">Kanevas</span>
        </Link>
      )}
      <nav aria-label="Navigation principale">
        {!dedans && (
          <div className="groupe">
            <Link to="/" className="item" aria-current={pathname === '/' ? 'page' : undefined}>
              <Library size={16} strokeWidth={1.75} aria-hidden="true" />
              Mes univers
            </Link>
          </div>
        )}
        {sections.map((s) => (
          <div key={s} className="groupe">
            {s && <div className="groupe-titre">{s}</div>}
            {items
              .filter((i) => (i.section ?? '') === s)
              .map((i) => (
                <Link key={i.libelle} to={i.chemin(id!)} className="item" aria-current={itemCourant(i, id!, pathname) ? 'page' : undefined}>
                  <i.icone size={16} strokeWidth={1.75} aria-hidden="true" />
                  {i.libelle}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <Compte />
    </>
  );
}

/**
 * Fixed bar on wide screens; below 760 px a drawer over the page with a veil behind, opened from the
 * top bar's « Menu ». Escape, the veil or an entry close it; the focus goes in, then back to « Menu ».
 */
export function Barre({ tiroir, fermer }: { tiroir: boolean; fermer: (rendreFocus: boolean) => void }) {
  const barre = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => fermer(false), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tiroir) return;
    barre.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer(true);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [tiroir]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div id="barre" className={`colonne-barre${tiroir ? ' ouverte' : ''}`}>
        <aside ref={barre} className="barre" aria-label="Barre latérale" tabIndex={-1}>
          <Contenu onNavigue={() => fermer(false)} />
        </aside>
      </div>
      <div className={`voile-tiroir${tiroir ? ' ouvert' : ''}`} onClick={() => fermer(true)} aria-hidden="true" />
    </>
  );
}
