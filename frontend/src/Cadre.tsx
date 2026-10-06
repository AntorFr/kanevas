import { ChevronRight, Eye, Library, LockKeyhole, PanelLeft } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Outlet, matchPath, useLocation } from 'react-router-dom';

import { useConnexionPerdue } from './api';
import { Barre, Sceau, universDeLAdresse } from './Barre';
import { useUnivers, useVue, type ModeVue } from './cadre-contexte';
import { ITEMS_UNIVERS } from './items';
import { Bandeau } from './ui';
import './cadre.css';

const bouchon = typeof document !== 'undefined' && document.querySelector('meta[name="kanevas-bouchon"]') !== null;

interface Maillon {
  libelle: string;
  vers?: string;
  /** Sits before the text on a phone, where the label of a middle crumb is dropped. */
  icone?: 'bibliotheque' | 'item';
  sceau?: boolean;
}

/**
 * The crumbs of an address (pure, tested): the universe, then the section of the sidebar that
 * answers, then the last crumb a screen gave (a sheet's title). Outside a universe: « Mes univers »,
 * then « Créer un univers ».
 */
export function maillons(pathname: string, nomUnivers: string | undefined, titre: string | undefined, dedans: boolean): Maillon[] {
  if (!dedans) {
    if (matchPath('/univers/nouveau', pathname)) return [{ libelle: 'Mes univers', vers: '/', icone: 'bibliotheque' }, { libelle: 'Créer un univers' }];
    return pathname === '/' ? [{ libelle: 'Mes univers', icone: 'bibliotheque' }] : [{ libelle: 'Mes univers', vers: '/', icone: 'bibliotheque' }];
  }
  const id = universDeLAdresse(pathname) ?? matchPath('/univers/:id', pathname)?.params.id;
  const racine = `/univers/${id}`;
  const liste: Maillon[] = [{ libelle: nomUnivers ?? 'Univers', vers: racine, sceau: true }];
  const item = ITEMS_UNIVERS.filter((i) => i.chemin(Number(id)) !== racine)
    .filter((i) => pathname === i.chemin(Number(id)) || pathname.startsWith(`${i.chemin(Number(id))}/`))
    .sort((a, b) => b.chemin(Number(id)).length - a.chemin(Number(id)).length)[0];
  if (item) liste.push({ libelle: item.libelle, vers: item.chemin(Number(id)), icone: 'item' });
  else if (matchPath('/univers/:id/systeme', pathname)) liste.push({ libelle: 'Système de jeu', vers: `${racine}/systeme` });
  if (titre) liste.push({ libelle: titre });
  // The last crumb is the page you are on: it is not a link.
  const dernier = liste[liste.length - 1]!;
  liste[liste.length - 1] = { ...dernier, vers: titre || pathname === dernier.vers ? undefined : dernier.vers };
  return liste;
}

function Ariane() {
  const { pathname } = useLocation();
  const { univers } = useUnivers();
  const { titre } = useVue();
  const id = universDeLAdresse(pathname);
  const connu = univers.etat !== 'ok' || univers.valeur.some((u) => u.id === id);
  const dedans = id !== null && connu;
  const nom = univers.etat === 'ok' ? univers.valeur.find((u) => u.id === id)?.nom : univers.etat === 'chargement' ? '…' : undefined;
  const liste = maillons(pathname, nom, titre, dedans);
  const icones = dedans ? new Map(ITEMS_UNIVERS.map((i) => [i.libelle, i.icone])) : new Map();
  return (
    <nav className="ariane" aria-label="Fil d’Ariane">
      {liste.map((m, i) => {
        const dernier = i === liste.length - 1;
        const Icone = m.icone === 'bibliotheque' ? Library : m.icone === 'item' ? icones.get(m.libelle) : undefined;
        const milieu = !dernier && i > 0 && m.icone === 'item' && Icone !== undefined;
        const contenu = (
          <>
            {m.sceau && <Sceau nom={m.libelle} petit />}
            {Icone && !m.sceau && <Icone className={m.icone === 'item' ? 'court' : 'toujours'} size={14} strokeWidth={1.75} aria-hidden="true" />}
            <span className={`${milieu ? 'lib-ariane ' : ''}tronque`}>{m.libelle}</span>
          </>
        );
        return (
          <span key={i} className={`maillon${dernier ? ' dernier' : ''}${m.sceau && !dernier ? ' long' : ''}${milieu ? ' milieu' : ''}`}>
            {i > 0 && <ChevronRight className={`sep-ariane${i === 1 && liste[0]!.sceau ? ' long' : ''}`} size={14} strokeWidth={1.75} aria-hidden="true" />}
            {m.vers ? (
              <Link to={m.vers} title={m.libelle}>
                {contenu}
              </Link>
            ) : (
              <span className="courant" aria-current={dernier ? 'page' : undefined} title={m.libelle}>
                {contenu}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const MODES: { mode: ModeVue; mot: string; icone: typeof Eye }[] = [
  { mode: 'mj', mot: 'MJ', icone: LockKeyhole },
  { mode: 'joueur', mot: 'Joueur', icone: Eye },
];

/** « Mode MJ » / « Mode Joueur » (« MJ » / « Joueur » on a phone), a radio group the arrows move. */
function BasculeMode() {
  const { mode, setMode } = useVue();
  const boutons = useRef<(HTMLButtonElement | null)[]>([]);
  const touche = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const n = (i + delta + MODES.length) % MODES.length;
    setMode(MODES[n]!.mode);
    boutons.current[n]?.focus();
  };
  return (
    <div className="mode" role="radiogroup" aria-label="Mode d’affichage">
      {MODES.map((m, i) => (
        <button
          key={m.mode}
          ref={(el) => {
            boutons.current[i] = el;
          }}
          type="button"
          role="radio"
          className={m.mode}
          aria-checked={mode === m.mode}
          aria-label={`Mode ${m.mot}`}
          tabIndex={mode === m.mode ? 0 : -1}
          onClick={() => setMode(m.mode)}
          onKeyDown={(e) => touche(e, i)}
        >
          <m.icone size={14} strokeWidth={1.75} aria-hidden="true" />
          <span aria-hidden="true">
            <span className="lib-long">Mode </span>
            {m.mot}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The frame around every screen: sidebar, top bar, banners, content (docs/ecrans.md, E-9 mockup). */
export function Cadre() {
  const perdue = useConnexionPerdue();
  const { mode, bascule } = useVue();
  const [tiroir, setTiroir] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const fermer = (rendreFocus: boolean) => {
    setTiroir(false);
    if (rendreFocus) menu.current?.focus();
  };
  return (
    <div className={`cadre${bouchon ? ' avec-bouchon' : ''}`}>
      {bouchon && <Bandeau sorte="bouchon">Mode bouchon — les comptes sont fictifs. Ne jamais l’ouvrir en production.</Bandeau>}
      <div className="app">
        <Barre tiroir={tiroir} fermer={fermer} />
        <div className="zone-principale">
          <header className="haute">
            <button
              type="button"
              ref={menu}
              className="bouton-icone bouton-menu"
              aria-label="Menu"
              aria-expanded={tiroir}
              aria-controls="barre"
              onClick={() => setTiroir(!tiroir)}
            >
              <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Ariane />
            {bascule && <BasculeMode />}
          </header>
          {(perdue || (bascule && mode === 'joueur')) && (
            <div className="bandeaux">
              {perdue && (
                <Bandeau sorte="perdue">
                  Connexion perdue. Ce que vous voyez peut être dépassé ; rien n’est enregistré tant qu’elle ne revient pas.
                </Bandeau>
              )}
              {bascule && mode === 'joueur' && <Bandeau sorte="joueur">Mode Joueur : vous voyez ce que voit un joueur.</Bandeau>}
            </div>
          )}
          <main className="principal">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
