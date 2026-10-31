import { ChevronRight, CornerLeftUp, FolderInput, ListTree, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { badgeFiche, iconeDuType, useTypes } from '../../types-contexte';
import { useUnivers } from '../../cadre-contexte';
import { Alerte, Bouton, BoutonIcone, Champ, Fenetre, Menu, useToasts } from '../../ui';
import { LONGUEUR_RECHERCHE } from './liste-recherche';
import type { Enfant, Fiche, FicheVue, PageEnfants, PageFiches } from './types';

const DELAI = 300;

/** A level of the tree: a sheet of the path (the universe root is the empty path). */
interface Maillon {
  id: number;
  titre: string;
  type: string;
}

/** The chosen parent: `undefined` nothing yet, `null` « Aucun parent ». */
type Choix = { id: number; titre: string } | null | undefined;

type Niveau =
  | { k: 'chargement' }
  | { k: 'erreur' }
  | { k: 'introuvable' }
  | { k: 'ok'; enfants: Enfant[]; suivant: string | null };

/** Crumbs shown / hidden in « … » for a path of `n` levels (E-9's rule: three at most, one on a phone). */
export function coupeChemin(n: number, telephone: boolean): { caches: number } {
  const garde = telephone ? 1 : 2;
  return { caches: n > (telephone ? 1 : 3) ? n - garde : 0 };
}

function useTelephone(): boolean {
  const q = '(max-width: 480px)';
  const [t, setT] = useState(() => (typeof matchMedia === 'function' ? matchMedia(q).matches : false));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const f = () => setT(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  return t;
}


type Resultats =
  | { k: 'attente' }
  | { k: 'recherche' }
  | { k: 'erreur' }
  | { k: 'ok'; fiches: Fiche[]; suivant: string | null };

/** The refusals of the move, in the interface's words; anything else is the generic failure. */
export function texteRefus(e: unknown): string {
  if (e instanceof ErreurApi) {
    if (e.code === 'cycle') return 'Une fiche ne peut pas être rangée sous l’un de ses descendants.';
    if (e.code === 'trop_profond') return 'La hiérarchie est trop profonde.';
    if (e.statut === 404) return 'Introuvable.';
  }
  return 'La fiche n’a pas été déplacée. Réessayez.';
}

/**
 * E-9 « Déplacer sous… » (P-14, AD-115, AD-129): two views of one choice. « Arborescence » opens on the level
 * of the sheet and walks the hierarchy; « Recherche » looks a sheet up by title, the sheet and its descendants
 * left out by the server. A refusal is said under the list; the box stays open.
 */
export function DeplacerSous({
  universId,
  fiche,
  onFermer,
  rafraichir,
  onDroitPerdu,
}: {
  universId: string;
  fiche: FicheVue;
  onFermer: () => void;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
}) {
  const { types } = useTypes();
  const { toast } = useToasts();
  const { univers: tous } = useUnivers();
  const nomUnivers = (tous.etat === 'ok' ? tous.valeur.find((u) => String(u.id) === universId)?.nom : undefined) ?? 'Univers';
  const perdue = useConnexionPerdue();
  const telephone = useTelephone();
  const parentActuel = fiche.ancetres?.at(-1)?.id ?? null;
  const [vue, setVue] = useState<'arbre' | 'recherche'>('arbre');
  // One choice for both views.
  const [choisi, setChoisi] = useState<Choix>();
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  // Tree view.
  const [chemin, setChemin] = useState<Maillon[]>(() => (fiche.ancetres ?? []).map((a) => ({ id: a.id, titre: a.titre, type: a.type })));
  const [niveau, setNiveau] = useState<Niveau>({ k: 'chargement' });
  const [essaiN, setEssaiN] = useState(0);
  const [suiteEnCoursN, setSuiteEnCoursN] = useState(false);
  const [suiteEchecN, setSuiteEchecN] = useState(false);
  const [annonce, setAnnonce] = useState('');
  const focusApres = useRef(false);
  const liste = useRef<HTMLDivElement>(null);
  const idNiveau = chemin.at(-1)?.id ?? null;
  const nomNiveau = chemin.at(-1)?.titre ?? nomUnivers;

  // Search view.
  const [saisie, setSaisie] = useState('');
  const [essai, setEssai] = useState(0);
  const [resultats, setResultats] = useState<Resultats>({ k: 'attente' });
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const mot = saisie.trim();
  const trop = mot.length > LONGUEUR_RECHERCHE;

  function droitPerdu(e: unknown): boolean {
    if (e instanceof ErreurApi && e.statut === 403) {
      onFermer();
      onDroitPerdu();
      return true;
    }
    return false;
  }

  const baseNiveau = (id: number | null) => `/api/univers/${universId}/fiches/${id === null ? 'racines' : `${id}/enfants`}`;

  // The level is read when the box opens and at each change of level.
  useEffect(() => {
    if (vue !== 'arbre') return;
    setNiveau({ k: 'chargement' });
    setSuiteEchecN(false);
    let actif = true;
    lire<PageEnfants>(baseNiveau(idNiveau)).then(
      (p) => {
        if (!actif) return;
        setNiveau({ k: 'ok', enfants: p.enfants, suivant: p.suivant });
        setAnnonce(`Niveau : ${nomNiveau}`);
      },
      (e) => {
        if (!actif || droitPerdu(e)) return;
        setNiveau(e instanceof ErreurApi && e.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' });
      },
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue, idNiveau, essaiN, universId]);

  // After a change of level the focus goes to the first choosable row; at opening, the own row is scrolled into view.
  useEffect(() => {
    if (niveau.k !== 'ok' || vue !== 'arbre') return;
    if (focusApres.current) {
      focusApres.current = false;
      liste.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
    } else {
      liste.current?.querySelector<HTMLElement>('[aria-disabled="true"]')?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [niveau, vue]);

  // Search 300 ms after the typing stops; one character at least, a hundred at most.
  useEffect(() => {
    setSuiteEchec(false);
    if (vue !== 'recherche') return;
    if (mot === '' || trop) {
      setResultats({ k: 'attente' });
      return;
    }
    setResultats({ k: 'recherche' });
    let actif = true;
    const minuteur = setTimeout(() => {
      lire<PageFiches>(`/api/univers/${universId}/fiches?q=${encodeURIComponent(mot)}&horsDe=${fiche.id}`).then(
        (p) => actif && setResultats({ k: 'ok', fiches: p.fiches, suivant: p.suivant }),
        (e) => actif && !droitPerdu(e) && setResultats({ k: 'erreur' }),
      );
    }, DELAI);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue, mot, trop, universId, essai, fiche.id]);

  async function suite() {
    if (resultats.k !== 'ok' || resultats.suivant === null || suiteEnCours) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(
        `/api/univers/${universId}/fiches?q=${encodeURIComponent(mot)}&horsDe=${fiche.id}&curseur=${encodeURIComponent(resultats.suivant)}`,
      );
      setResultats((r) => (r.k === 'ok' ? { k: 'ok', fiches: [...r.fiches, ...p.fiches], suivant: p.suivant } : r));
    } catch (e) {
      if (!droitPerdu(e)) setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function suiteNiveau() {
    if (niveau.k !== 'ok' || niveau.suivant === null || suiteEnCoursN) return;
    setSuiteEnCoursN(true);
    setSuiteEchecN(false);
    const curseur = encodeURIComponent(niveau.suivant);
    try {
      const p = await lire<PageEnfants>(`${baseNiveau(idNiveau)}?curseur=${curseur}`);
      setNiveau((n) => (n.k === 'ok' ? { k: 'ok', enfants: [...n.enfants, ...p.enfants], suivant: p.suivant } : n));
    } catch (e) {
      if (!droitPerdu(e)) setSuiteEchecN(true);
    } finally {
      setSuiteEnCoursN(false);
    }
  }

  function aller(nouveau: Maillon[]) {
    if (perdue) return;
    focusApres.current = true;
    setChemin(nouveau);
  }
  const descendre = (e: Enfant) => aller([...chemin, { id: e.id, titre: e.titre, type: e.type }]);
  const remonter = () => chemin.length > 0 && aller(chemin.slice(0, -1));

  function choisir(c: Choix) {
    setChoisi(c);
    setRefus(undefined);
  }

  const identique = choisi !== undefined && (choisi?.id ?? null) === parentActuel;

  async function deplacer(e: FormEvent) {
    e.preventDefault();
    if (enCours || choisi === undefined || identique || perdue) return;
    setRefus(undefined);
    setEnCours(true);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { parent: choisi === null ? null : choisi.id });
    } catch (err) {
      setEnCours(false);
      if (!droitPerdu(err)) setRefus(texteRefus(err));
      return;
    }
    // The move is done; a failed refetch does not undo it.
    await rafraichir().catch(() => undefined);
    toast('Fiche déplacée.');
    onFermer();
  }

  function touche(e: KeyboardEvent<HTMLDivElement>) {
    if (vue !== 'arbre') return;
    const cible = e.target as HTMLElement;
    if (e.key === 'ArrowRight' && cible instanceof HTMLInputElement && cible.dataset.enfants) {
      e.preventDefault();
      const f = niveau.k === 'ok' ? niveau.enfants.find((x) => x.id === Number(cible.dataset.enfants)) : undefined;
      if (f) descendre(f);
    } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !(cible instanceof HTMLTextAreaElement) && !(cible instanceof HTMLInputElement && cible.type === 'text')) {
      e.preventDefault();
      remonter();
    }
  }

  const ligne = (f: { id: number; titre: string; type: string; sousType?: string | null }, badge: string, enfants: boolean, arbre = false) => {
    const soi = f.id === fiche.id;
    const Icone = iconeDuType(types, f.type);
    const detail = [badge, f.sousType].filter(Boolean).join(' · ') + (f.id === parentActuel ? ' (parent actuel)' : '');
    return (
      <div key={f.id} className="ligne-res">
        <label className={`resultat${soi ? ' soi' : ''}`} aria-disabled={soi || undefined} title={f.titre}>
          <input
            type="radio"
            name="nouveau-parent"
            disabled={soi}
            checked={!soi && choisi?.id === f.id}
            data-enfants={enfants && !soi ? f.id : undefined}
            onChange={() => choisir({ id: f.id, titre: f.titre })}
          />
          <span className="puce" aria-hidden="true" />
          <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="titre-res">{f.titre}</span>
          {soi && ' '}
          {soi && <span className="note-soi">(cette fiche)</span>}
          <span className="type-option">{detail}</span>
        </label>
        {enfants && !soi && (
          <button type="button" className="chevron-res" tabIndex={-1} aria-label={`Ouvrir « ${f.titre} »`} aria-disabled={perdue || undefined} onClick={() => !perdue && descendre(f as Enfant)}>
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        {arbre && (!enfants || soi) && <span className="sans-chevron" aria-hidden="true" />}
      </div>
    );
  };

  const fiches = resultats.k === 'ok' ? resultats.fiches.filter((f) => f.id !== fiche.id) : [];
  const { caches } = coupeChemin(chemin.length, telephone);
  const crumb = (m: Maillon, i: number) => {
    const dernier = i === chemin.length - 1;
    return dernier ? (
      <span key={m.id} className="maillon" aria-current="location" title={m.titre}>{m.titre}</span>
    ) : (
      <button key={m.id} type="button" className="maillon" title={m.titre} aria-disabled={perdue || undefined} onClick={() => aller(chemin.slice(0, i + 1))}>{m.titre}</button>
    );
  };
  const sep = (k: string) => <ChevronRight key={k} className="sep-chemin" size={14} strokeWidth={1.75} aria-hidden="true" />;

  const aucun = (
    <label className="resultat aucun">
      <input type="radio" name="nouveau-parent" checked={choisi === null} onChange={() => choisir(null)} />
      <span className="puce" aria-hidden="true" />
      Aucun parent
      {parentActuel === null && <span className="type-option">(actuel)</span>}
    </label>
  );

  return (
    <Fenetre titre={`Déplacer « ${fiche.titre} » sous…`} onFermer={onFermer} icone={FolderInput}>
      <form className="changer-type deplacer" onSubmit={deplacer} noValidate>
        <div className="bascule-vue" role="group" aria-label="Vue">
          <button type="button" aria-pressed={vue === 'arbre'} onClick={() => setVue('arbre')}>
            <ListTree size={16} strokeWidth={1.75} aria-hidden="true" />
            Arborescence
          </button>
          <button type="button" aria-pressed={vue === 'recherche'} onClick={() => setVue('recherche')}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            Recherche
          </button>
        </div>
        {vue === 'recherche' && (
          <Champ
            etiquette="Chercher une fiche"
            value={saisie}
            autoFocus
            autoComplete="off"
            erreur={trop ? `${LONGUEUR_RECHERCHE} caractères au plus.` : undefined}
            onChange={(e: { target: { value: string } }) => {
              setSaisie(e.target.value);
              setRefus(undefined);
            }}
          />
        )}
        {vue === 'arbre' && (
          <nav className="chemin-deplacer" aria-label="Chemin">
            <BoutonIcone etiquette="Remonter d’un niveau" icone={CornerLeftUp} disabled={chemin.length === 0 || perdue} onClick={remonter} />
            <button type="button" className="maillon" title={nomUnivers} aria-disabled={perdue || undefined} {...(chemin.length === 0 ? { 'aria-current': 'location' as const } : {})} onClick={() => chemin.length > 0 && aller([])}>
              {nomUnivers}
            </button>
            {caches > 0 && (
              <>
                {sep('s-')}
                <Menu
                  etiquette="Niveaux masqués"
                  declencheur="…"
                  desactive={perdue}
                  aligne="debut"
                  entrees={chemin.slice(0, caches).map((m, i) => ({
                    libelle: m.titre,
                    icone: iconeDuType(types, m.type),
                    onChoisir: () => aller(chemin.slice(0, i + 1)),
                  }))}
                />
              </>
            )}
            {chemin.slice(caches).map((m, j) => (
              <span key={m.id} className="suite-chemin">
                {sep(`s${j}`)}
                {crumb(m, j + caches)}
              </span>
            ))}
          </nav>
        )}
        <div className="resultats" role="radiogroup" aria-label="Nouveau parent" ref={liste} onKeyDown={touche}>
          {aucun}
          <div className="sep-res" role="presentation" />
          {vue === 'arbre' && (
            <>
              {niveau.k === 'chargement' && (
                <p className="vide-res" role="status">
                  Chargement…
                </p>
              )}
              {niveau.k === 'erreur' && (
                <p className="vide-res" role="alert">
                  Impossible de charger ce niveau.{' '}
                  <Bouton petit onClick={() => setEssaiN((n) => n + 1)}>
                    Réessayer
                  </Bouton>
                </p>
              )}
              {niveau.k === 'introuvable' && (
                <p className="vide-res" role="alert">
                  Introuvable.
                </p>
              )}
              {niveau.k === 'ok' && niveau.enfants.length === 0 && <p className="vide-res">Aucune fiche à ce niveau.</p>}
              {niveau.k === 'ok' && niveau.enfants.map((f) => ligne(f, badgeFiche(types, f), f.aDesEnfants, true))}
              {suiteEchecN && (
                <p className="vide-res" role="alert">
                  Impossible de charger la suite.
                </p>
              )}
              {niveau.k === 'ok' && niveau.suivant !== null && (
                <Bouton ecrit={false} disabled={perdue || suiteEnCoursN} onClick={() => void suiteNiveau()}>
                  {suiteEnCoursN ? 'Chargement…' : 'Charger la suite'}
                </Bouton>
              )}
            </>
          )}
          {vue === 'recherche' && (
            <>
              {resultats.k === 'attente' && <p className="vide-res">Tapez le début d’un titre.</p>}
              {resultats.k === 'recherche' && (
                <p className="vide-res" role="status">
                  Recherche…
                </p>
              )}
              {resultats.k === 'erreur' && (
                <p className="vide-res" role="alert">
                  Impossible de chercher.{' '}
                  <Bouton petit onClick={() => setEssai((n) => n + 1)}>
                    Réessayer
                  </Bouton>
                </p>
              )}
              {resultats.k === 'ok' && fiches.length === 0 && resultats.suivant === null && <p className="vide-res">Aucune fiche ne correspond.</p>}
              {fiches.map((f) => ligne(f, badgeFiche(types, f), false))}
              {suiteEchec && (
                <p className="vide-res" role="alert">
                  Impossible de charger la suite.
                </p>
              )}
              {resultats.k === 'ok' && resultats.suivant !== null && (
                <Bouton ecrit={false} disabled={perdue || suiteEnCours} onClick={() => void suite()}>
                  {suiteEnCours ? 'Chargement…' : 'Charger la suite'}
                </Bouton>
              )}
            </>
          )}
        </div>
        <p className="cache-lecteur" role="status" aria-live="polite">
          {vue === 'arbre' ? annonce : ''}
        </p>
        {choisi !== undefined && (
          <p className="nouveau-parent">Nouveau parent : {choisi === null ? 'aucun (racine de l’univers)' : choisi.titre}</p>
        )}
        {refus && !trop && <Alerte>{refus}</Alerte>}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={choisi === undefined || identique || perdue}>
            Déplacer
          </Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
