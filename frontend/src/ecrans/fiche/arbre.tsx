import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { lire, useConnexionPerdue } from '../../api';
import { Bouton, ErreurChargement, ChargementListe } from '../../ui';
import { iconeDuType, useTypes, type TypeVue } from '../../types-contexte';
import './arbre.css';
import type { Fiche, PageFiches } from './types';
import { useMJSeul } from './vignette';

/** A row of the tree (AD-115): `aDesEnfants` and `dans` are computed by the server under the caller's reading. */
export type FicheArbre = Fiche & { aDesEnfants?: boolean; dans?: { id: number; titre: string } | null };

export type VueListe = 'grille' | 'arbre';

/** Indentation stops growing after this many levels (E-8). */
export const NIVEAUX_MAX = 6;

const cleVue = (universId: string | number, type: string) => `kanevas:vue-liste:${universId}:${type}`;

/** The remembered view of a type in this browser; absent or unreadable: the grid. */
export function lireVue(universId: string | number, type: string): VueListe {
  try {
    return window.localStorage.getItem(cleVue(universId, type)) === 'arbre' ? 'arbre' : 'grille';
  } catch {
    return 'grille';
  }
}

export function memoriserVue(universId: string | number, type: string, vue: VueListe): void {
  try {
    window.localStorage.setItem(cleVue(universId, type), vue);
  } catch {
    // Storage refused: the choice lasts as long as the page.
  }
}

interface Noeud {
  etat: 'chargement' | 'ok' | 'erreur';
  fiches: FicheArbre[];
  suivant: string | null;
  suiteEnCours: boolean;
  suiteEchec: boolean;
}

const RACINE = 'racine';

interface Ligne {
  kind: 'fiche' | 'etat';
  cle: string;
  niveau: number;
  fiche?: FicheArbre;
  contenu?: ReactNode;
}

/**
 * The tree of one type (E-8): the roots, then the children a reader opens, 100 at a time.
 * Folding keeps what is loaded; unfolding again does not call. The parent changes this component
 * only through its `key` (mode, type): everything reloads then.
 */
export function Arbre({
  universId,
  type,
  suffixeMode,
  videListe,
}: {
  universId: string;
  type: TypeVue;
  /** `&mode=joueur` when a GM looks as a player, else empty. */
  suffixeMode: string;
  videListe: ReactNode;
}) {
  const perdue = useConnexionPerdue();
  const navigate = useNavigate();
  const { types } = useTypes();
  const Icone = iconeDuType(types, type.type);
  const [noeuds, setNoeuds] = useState<Record<string, Noeud>>({});
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<string>();
  const racine = useRef<HTMLUListElement>(null);
  const vivant = useRef(true);

  const chemin = (cle: string) =>
    `/api/univers/${universId}/fiches?type=${type.type}&parent=${cle}${suffixeMode}`;

  async function charger(cle: string, curseur?: string) {
    const maj = (f: (n: Noeud) => Noeud) =>
      vivant.current &&
      setNoeuds((m) => ({
        ...m,
        [cle]: f(m[cle] ?? { etat: 'chargement', fiches: [], suivant: null, suiteEnCours: false, suiteEchec: false }),
      }));
    if (curseur === undefined) maj((n) => ({ ...n, etat: 'chargement', fiches: [] }));
    else maj((n) => ({ ...n, suiteEnCours: true, suiteEchec: false }));
    try {
      const p = await lire<PageFiches>(chemin(cle) + (curseur === undefined ? '' : `&curseur=${encodeURIComponent(curseur)}`));
      maj((n) => ({
        etat: 'ok',
        fiches: [...(curseur === undefined ? [] : n.fiches), ...(p.fiches as FicheArbre[])],
        suivant: p.suivant,
        suiteEnCours: false,
        suiteEchec: false,
      }));
    } catch {
      if (curseur === undefined) maj((n) => ({ ...n, etat: 'erreur' }));
      else maj((n) => ({ ...n, suiteEnCours: false, suiteEchec: true }));
    }
  }

  useEffect(() => {
    vivant.current = true;
    void charger(RACINE);
    return () => {
      vivant.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function deplier(id: number) {
    if (ouverts.has(id)) return;
    setOuverts(new Set(ouverts).add(id));
    const e = noeuds[String(id)]?.etat;
    if (e === undefined || e === 'erreur') void charger(String(id));
  }

  function replier(id: number) {
    if (!ouverts.has(id)) return;
    const n = new Set(ouverts);
    n.delete(id);
    setOuverts(n);
  }

  const r = noeuds[RACINE];
  if (!r || r.etat === 'chargement') return <ChargementListe texte="Chargement des fiches…" />;
  if (r.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les fiches." onReessayer={() => void charger(RACINE)} />;
  }
  if (r.fiches.length === 0) return <>{videListe}</>;

  const lignes: Ligne[] = [];
  function ajouter(cle: string, niveau: number) {
    const n = noeuds[cle];
    if (!n) return;
    if (n.etat === 'chargement') {
      lignes.push({ kind: 'etat', cle: `${cle}:charge`, niveau, contenu: <span role="status">Chargement…</span> });
      return;
    }
    if (n.etat === 'erreur') {
      lignes.push({
        kind: 'etat',
        cle: `${cle}:erreur`,
        niveau,
        contenu: (
          <>
            <span role="alert">Impossible de charger la suite.</span>
            <Bouton ecrit={false} onClick={() => void charger(cle)}>
              Réessayer
            </Bouton>
          </>
        ),
      });
      return;
    }
    for (const f of n.fiches) {
      lignes.push({ kind: 'fiche', cle: `f${f.id}`, niveau, fiche: f });
      if (ouverts.has(f.id)) ajouter(String(f.id), niveau + 1);
    }
    if (n.suiteEchec) {
      lignes.push({
        kind: 'etat',
        cle: `${cle}:echec`,
        niveau,
        contenu: <span role="alert">Impossible de charger la suite.</span>,
      });
    }
    if (n.suivant !== null) {
      const suivant = n.suivant;
      lignes.push({
        kind: 'etat',
        cle: `${cle}:suite`,
        niveau,
        contenu: (
          <Bouton ecrit={false} enCours={n.suiteEnCours} disabled={perdue} onClick={() => void charger(cle, suivant)}>
            Charger la suite
          </Bouton>
        ),
      });
    }
  }
  ajouter(RACINE, 1);

  const ids = lignes.filter((l) => l.kind === 'fiche').map((l) => l.cle);
  const actif = focus !== undefined && ids.includes(focus) ? focus : ids[0];

  function toucher(e: KeyboardEvent<HTMLLIElement>, f: FicheArbre) {
    if (e.target !== e.currentTarget) {
      // From the chevron or a link inside the row: only the arrows act, Enter keeps its own meaning.
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    }
    const aEnfants = f.aDesEnfants === true;
    if (e.key === 'ArrowRight' && aEnfants) {
      e.preventDefault();
      deplier(f.id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      replier(f.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigate(`/univers/${universId}/fiche/${f.id}`);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(racine.current?.querySelectorAll<HTMLLIElement>('li[role="treeitem"]') ?? []);
      const i = items.indexOf(e.currentTarget);
      const cible = items[e.key === 'ArrowDown' ? i + 1 : i - 1];
      if (cible) {
        setFocus(cible.dataset.cle);
        cible.focus();
      }
    }
  }

  return (
    <ul className="arbre liste-fiches" role="tree" aria-label={type.pluriel} ref={racine}>
      {lignes.map((l) => {
        const style = { ['--niveau' as string]: Math.min(l.niveau - 1, NIVEAUX_MAX) };
        if (l.kind === 'etat') {
          return (
            <li key={l.cle} role="none" className="ligne-etat" style={style}>
              <div className="ligne-arbre">{l.contenu}</div>
            </li>
          );
        }
        const f = l.fiche!;
        const aEnfants = f.aDesEnfants === true;
        const ouvert = ouverts.has(f.id);
        return (
          <li
            key={l.cle}
            role="treeitem"
            aria-level={l.niveau}
            aria-expanded={aEnfants ? ouvert : undefined}
            data-cle={l.cle}
            tabIndex={actif === l.cle ? 0 : -1}
            style={style}
            onFocus={(e) => e.target === e.currentTarget && setFocus(l.cle)}
            onKeyDown={(e) => toucher(e, f)}
          >
            <div className="ligne-arbre">
              {aEnfants ? (
                <button
                  type="button"
                  className="chevron"
                  tabIndex={-1}
                  aria-label={ouvert ? 'Replier' : 'Déplier'}
                  onClick={() => (ouvert ? replier(f.id) : deplier(f.id))}
                >
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className={ouvert ? 'ouvert' : undefined} />
                </button>
              ) : (
                <span className="chevron vide" aria-hidden="true" />
              )}
              <LienFiche universId={universId} fiche={f} Icone={Icone} />
              {f.dans && (
                <Link className="dans" to={`/univers/${universId}/fiche/${f.dans.id}`} tabIndex={-1}>
                  dans {f.dans.titre}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The link of a tree row: glyph, title, sub-type, and the « MJ seul » badge of a sheet the players cannot read (B-57). */
function LienFiche({ universId, fiche: f, Icone }: { universId: string; fiche: FicheArbre; Icone: LucideIcon }) {
  const mjSeul = useMJSeul(f);
  return (
    <>
      <Link className="lien-fiche" to={`/univers/${universId}/fiche/${f.id}`} tabIndex={-1}>
        <span className="glyphe" aria-hidden="true">
          <Icone size={16} strokeWidth={1.75} />
        </span>
        <span className="titre-fiche" title={f.titre}>
          {f.titre}
        </span>
        {f.sousType && (
          <span className="sous-type" title={f.sousType}>
            {f.sousType}
          </span>
        )}
      </Link>
      {mjSeul.badge}
      {mjSeul.aide}
    </>
  );
}
