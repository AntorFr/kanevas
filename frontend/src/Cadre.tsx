import { ChevronRight, Dices, Eye, Library, LockKeyhole, PanelLeft } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';

import { useConnexionPerdue } from './api';
import { Barre, Sceau, universDeLAdresse } from './Barre';
import { useUnivers, useVue, type AncetreAriane, type ModeVue } from './cadre-contexte';
import { ITEMS_UNIVERS, itemsLore, type Item } from './items';
import { ecranEnregistre } from './registre';
import { iconeDuType, useTypes } from './types-contexte';
import { Bandeau, Menu } from './ui';
import './cadre.css';

const bouchon = typeof document !== 'undefined' && document.querySelector('meta[name="kanevas-bouchon"]') !== null;

interface Maillon {
  libelle: string;
  vers?: string;
  /** Sits before the text on a phone, where the label of a middle crumb is dropped. */
  icone?: 'bibliotheque' | 'item' | 'systemes' | 'systemes-court';
  sceau?: boolean;
  /** Dropped on a phone with its separator (the first crumb of a page of a system). */
  long?: boolean;
  /** The « … » crumb: the ancestors it hides, in a menu (AD-115). */
  autres?: AncetreAriane[];
}

/** More ancestors than this fold: the first, « … », the last two. */
const ANCETRES_VISIBLES = 3;

/** The crumbs of the readable ancestors of a sheet, folded past three. */
function maillonsAncetres(racine: string, ancetres: AncetreAriane[], telephone: boolean, bascule = false): Maillon[] {
  const lien = (a: AncetreAriane): Maillon => ({ libelle: a.titre, vers: `${racine}/fiche/${a.id}` });
  // On a phone, two readable ancestors or more all go in the « … » menu; a single one is ellipsed.
  // The MJ / Player switch takes the width of the trail there: even one ancestor then folds, so the current title stays whole.
  if (telephone && (ancetres.length >= 2 || (bascule && ancetres.length >= 1))) return [{ libelle: '…', autres: ancetres }];
  if (ancetres.length <= ANCETRES_VISIBLES) return ancetres.map(lien);
  return [lien(ancetres[0]!), { libelle: '…', autres: ancetres.slice(1, -2) }, ...ancetres.slice(-2).map(lien)];
}

/**
 * The crumbs of an address (pure, tested): the universe, then the section of the sidebar that
 * answers, then the last crumb it gave (a sheet's title). Outside a universe: « Mes univers »,
 * then « Créer un univers ».
 */
export function maillons(pathname: string, nomUnivers: string | undefined, titre: string | undefined, dedans: boolean, section?: string, lore: Item[] = [], ancetres: AncetreAriane[] = [], telephone = false, bascule = false): Maillon[] {
  if (!dedans) {
    // E-5: the instance screen, not a universe's; its crumb says where it sits in the bar.
    if (pathname === '/administration' || pathname.startsWith('/administration/')) {
      return [{ libelle: 'Instance' }, { libelle: 'Administration' }];
    }
    if (pathname === '/systemes') return [{ libelle: 'Systèmes de jeu', icone: 'systemes' }];
    if (matchPath('/systemes/:sid', pathname)) {
      const liste: Maillon[] = [{ libelle: 'Systèmes de jeu', vers: '/systemes', icone: 'systemes', long: true }];
      if (titre) liste.push({ libelle: titre, icone: 'systemes-court' });
      return liste;
    }
    if (matchPath('/univers/nouveau', pathname)) return [{ libelle: 'Mes univers', vers: '/', icone: 'bibliotheque' }, { libelle: 'Créer un univers' }];
    return pathname === '/' ? [{ libelle: 'Mes univers', icone: 'bibliotheque' }] : [{ libelle: 'Mes univers', vers: '/', icone: 'bibliotheque' }];
  }
  const id = universDeLAdresse(pathname) ?? matchPath('/univers/:id', pathname)?.params.id;
  const racine = `/univers/${id}`;
  const liste: Maillon[] = [{ libelle: nomUnivers ?? 'Univers', vers: racine, sceau: true }];
  // The overview is the universe's own address: its item is a crumb only on that address itself
  // (« univers › Vue d'ensemble »); on any other page the universe crumb already stands for it.
  const surRacine = pathname === racine || pathname === `${racine}/`;
  const item = [...ITEMS_UNIVERS, ...lore].filter((i) => (i.chemin(Number(id)) === racine ? surRacine && section === undefined : true))
    .filter((i) => section === undefined || i.libelle === section)
    .filter((i) => section !== undefined || i.chemin(Number(id)) === racine || pathname === i.chemin(Number(id)) || pathname.startsWith(`${i.chemin(Number(id))}/`))
    .sort((a, b) => b.chemin(Number(id)).length - a.chemin(Number(id)).length)[0];
  if (item) liste.push({ libelle: item.libelle, vers: item.chemin(Number(id)), icone: 'item' });
  if (titre) liste.push(...maillonsAncetres(racine, ancetres, telephone, bascule), { libelle: titre });
  // The last crumb is the page you are on: it is not a link.
  const dernier = liste[liste.length - 1]!;
  liste[liste.length - 1] = { ...dernier, vers: titre || pathname === dernier.vers || (surRacine && dernier.vers === racine) ? undefined : dernier.vers };
  return liste;
}

/** Phone width (docs/ecrans.md, E-9 header): the trail folds its ancestors into the « … » menu. */
const TELEPHONE_ARIANE = '(max-width: 480px)';

function useTelephoneAriane(): boolean {
  const [oui, setOui] = useState(() => typeof window !== 'undefined' && window.matchMedia(TELEPHONE_ARIANE).matches);
  useEffect(() => {
    const mq = window.matchMedia(TELEPHONE_ARIANE);
    const maj = () => setOui(mq.matches);
    maj();
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  return oui;
}

function Ariane() {
  const telephone = useTelephoneAriane();
  const { pathname } = useLocation();
  const { univers } = useUnivers();
  const { titre, section, ancetres, bascule } = useVue();
  const navigate = useNavigate();
  const id = universDeLAdresse(pathname);
  const connu = univers.etat !== 'ok' || univers.valeur.some((u) => u.id === id);
  const dedans = id !== null && connu;
  const nom = univers.etat === 'ok' ? univers.valeur.find((u) => u.id === id)?.nom : univers.etat === 'chargement' ? '…' : undefined;
  const { types } = useTypes();
  const lore = itemsLore(types);
  const liste = maillons(pathname, nom, titre, dedans, section, lore, ancetres, telephone, bascule);
  const typeDe = (t: string) => iconeDuType(types, t);
  const icones = dedans ? new Map([...ITEMS_UNIVERS, ...lore].map((i) => [i.libelle, i.icone])) : new Map();
  return (
    <nav className="ariane" aria-label="Fil d’Ariane" style={{ '--avant': liste.filter((m, i) => i < liste.length - 1 && !m.sceau && !m.long && !m.autres && !(i > 0 && m.icone === 'item' && icones.get(m.libelle) !== undefined)).length } as CSSProperties}>
      {liste.map((m, i) => {
        const dernier = i === liste.length - 1;
        const Icone = m.icone === 'bibliotheque' ? Library : m.icone === 'item' ? icones.get(m.libelle) : m.icone === 'systemes' || m.icone === 'systemes-court' ? Dices : undefined;
        const milieu = !dernier && i > 0 && m.icone === 'item' && Icone !== undefined;
        if (m.autres) {
          return (
            <span key={i} className="maillon plie">
              <ChevronRight className="sep-ariane" size={14} strokeWidth={1.75} aria-hidden="true" />
              <Menu
                etiquette="Autres ancêtres"
                declencheur={<span>…</span>}
                aligne="debut"
                entrees={m.autres.map((a) => ({ libelle: a.titre, icone: typeDe(a.type), onChoisir: () => navigate(`/univers/${id}/fiche/${a.id}`) }))}
              />
            </span>
          );
        }
        const contenu = (
          <>
            {m.sceau && <Sceau nom={m.libelle} petit />}
            {Icone && !m.sceau && <Icone className={m.icone === 'item' || m.icone === 'systemes-court' ? 'court' : 'toujours'} size={14} strokeWidth={1.75} aria-hidden="true" />}
            <span className={`${milieu ? 'lib-ariane ' : ''}tronque`}>{m.libelle}</span>
          </>
        );
        return (
          <span key={i} className={`maillon${dernier ? ' dernier' : ''}${(m.sceau || m.long) && !dernier ? ' long' : ''}${milieu ? ' milieu' : ''}`}>
            {i > 0 && <ChevronRight className={`sep-ariane${i === 1 && (liste[0]!.sceau || liste[0]!.long) ? ' long' : ''}`} size={14} strokeWidth={1.75} aria-hidden="true" />}
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

/** True when the key goes to something the user is typing in, or to an open dialog. */
export function saisieEnCours(actif: Element | null, doc: Document = document): boolean {
  if (actif instanceof HTMLElement) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(actif.tagName) || actif.isContentEditable || actif.closest('[contenteditable]')) return true;
  }
  return doc.querySelector('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]') !== null;
}

/**
 * The `/` key opens the search of the universe in the address (E-17), set once by the frame. It does
 * nothing in a field, an editor or an open dialog, outside a universe, or with a modifier. In player
 * mode the GM keeps the mode (`mode=joueur`).
 */
export function useRaccourciRecherche() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { mode } = useVue();
  const id = universDeLAdresse(pathname);
  useEffect(() => {
    if (id === null || !ecranEnregistre(`/univers/${id}/recherche`)) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (saisieEnCours(document.activeElement)) return;
      e.preventDefault();
      const adresse = `/univers/${id}/recherche`;
      if (pathname !== adresse) navigate(mode === 'joueur' ? `${adresse}?mode=joueur` : adresse);
      // Already there, or arriving: the field takes the focus.
      setTimeout(() => document.querySelector<HTMLElement>('[data-champ-recherche]')?.focus(), 0);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [id, pathname, mode, navigate]);
}

/** The frame around every screen: sidebar, top bar, banners, content (docs/ecrans.md, E-9 mockup). */
export function Cadre() {
  const perdue = useConnexionPerdue();
  const { mode, bascule } = useVue();
  useRaccourciRecherche();
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
