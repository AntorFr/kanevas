import { RotateCcw, Waypoints } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { Bouton, Case } from '../../../ui';
import { badgeFiche, iconeDuType, marqueDe, useTypes } from '../../../types-contexte';
import { CadreBlocFiche } from '../bloc-fiche';
import type { BlocFiche, PropsBlocFiche } from '../registre-blocs-fiche';
import { MarqueDisparu, classeDisparu } from '../marque';
import { adresseIllustration, useMJSeul } from '../vignette';
import type { Fiche } from '../types';
import './liees.css';

interface FicheLiee extends Fiche {
  qualificatif?: string;
}

interface Groupe {
  nature: string;
  libelle: string;
  types: { type: string; total: number; totalAvecDescendants: number }[];
  fiches: FicheLiee[];
  suivant: string | null;
}

interface Page {
  profondeurAtteinte: boolean;
  groupes: Groupe[];
}

/** What is on screen: the page, and whether it answers « sous-lieux compris ». */
interface Affiche {
  page: Page;
  descendants: boolean;
  /** The place has nothing at its own level: the toggle is checked and disabled. */
  force: boolean;
}

/** The lines a group has grown past its first five (one nature read alone, fifty at a time). */
interface Suite {
  fiches: FicheLiee[];
  suivant: string | null;
}

const CLE_MEMOIRE = 'kanevas-fiches-liees-sous-lieux';

function memorisee(): boolean {
  try {
    return window.localStorage.getItem(CLE_MEMOIRE) === '1';
  } catch {
    return false;
  }
}

function memoriser(v: boolean) {
  try {
    window.localStorage.setItem(CLE_MEMOIRE, v ? '1' : '0');
  } catch {
    // Storage refused: the choice lasts as long as the page.
  }
}

const compte = (g: Groupe, descendants: boolean) =>
  g.types.map((t) => ({ type: t.type, n: descendants ? t.totalAvecDescendants : t.total })).filter((t) => t.n > 0);
const total = (g: Groupe, descendants: boolean) => compte(g, descendants).reduce((s, t) => s + t.n, 0);
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function LigneLiee({ universId, fiche, lieu }: { universId: string; fiche: FicheLiee; lieu: boolean }) {
  const { types } = useTypes();
  const Icone = iconeDuType(types, fiche.type);
  const [ko, setKo] = useState(false);
  const marque = marqueDe(types, fiche);
  const mjSeul = useMJSeul(fiche);
  const ill = fiche.illustration && 'jeton' in fiche.illustration ? fiche.illustration : null;
  return (
    <li className="ligne-liee">
      <span className={`vignette-liee${classeDisparu(marque)}`} aria-hidden={marque ? undefined : 'true'}>
        {ill && !ko ? (
          <img src={adresseIllustration(universId, ill.id, ill.jeton)} alt="" width={36} height={36} loading="lazy" onError={() => setKo(true)} />
        ) : (
          <Icone size={16} strokeWidth={1.75} />
        )}
        {marque && <MarqueDisparu mot={marque.mot} Icone={marque.Icone} />}
      </span>
      <Link className="jeton cible titre-liee" to={`/univers/${universId}/fiche/${fiche.id}`} title={fiche.titre}>
        {fiche.titre}
      </Link>
      {fiche.type === 'personnage' && (
        <span className={`badge-type${fiche.charge.pj ? ' pj' : ''}`}>{badgeFiche(types, fiche)}</span>
      )}
      {fiche.sousType && <span className="gris-liee">{fiche.sousType}</span>}
      {mjSeul.badge}
      {fiche.qualificatif && <span className="gris-liee qualif-liee" title={fiche.qualificatif}>{fiche.qualificatif}</span>}
      {lieu && fiche.via && <span className="gris-liee via-liee" title={fiche.via.titre}>— {fiche.via.titre}</span>}
      {mjSeul.aide}
    </li>
  );
}

function Liees({ universId, fiche, suffixeMode }: PropsBlocFiche) {
  const { types } = useTypes();
  const perdue = useConnexionPerdue();
  const lieu = fiche.type === 'lieu';
  const base = `/api/univers/${universId}/fiches/${fiche.id}/liees`;
  const adresse = (descendants: boolean, extra = '') => {
    const q = [suffixeMode.replace('?', ''), descendants ? 'descendants=1' : '', extra].filter((x) => x !== '');
    return `${base}${q.length ? `?${q.join('&')}` : ''}`;
  };

  const [demande, setDemande] = useState(() => lieu && memorisee());
  const [essai, setEssai] = useState(0);
  const [affiche, setAffiche] = useState<Affiche>();
  const [absent, setAbsent] = useState(false);
  const [enCours, setEnCours] = useState(true);
  const [echec, setEchec] = useState(false);
  const [suites, setSuites] = useState<Record<string, Suite>>({});
  const [plus, setPlus] = useState<string>();
  // A failed re-read puts the toggle back: that change must not read again.
  const saut = useRef(false);

  useEffect(() => {
    if (saut.current) {
      saut.current = false;
      return;
    }
    let actif = true;
    setEnCours(true);
    setEchec(false);
    (async () => {
      let page = await lire<Page>(adresse(demande));
      let descendants = demande;
      let force = false;
      // Nothing at the place's own level but something below: show what is below, the toggle fixed.
      if (lieu && !demande && !page.groupes.some((g) => total(g, false) > 0)
        && page.groupes.some((g) => total(g, true) > 0)) {
        page = await lire<Page>(adresse(true));
        descendants = true;
        force = true;
      }
      return { page, descendants, force } satisfies Affiche;
    })().then(
      (a) => {
        if (!actif) return;
        setAffiche(a);
        setSuites({});
        setAbsent(false);
        setEnCours(false);
        if (lieu && !a.force) memoriser(a.descendants);
      },
      (e: unknown) => {
        if (!actif) return;
        setEnCours(false);
        if (e instanceof ErreurApi && e.statut === 404) {
          setAffiche(undefined);
          setAbsent(true);
          return;
        }
        setEchec(true);
        // A failed re-read keeps what is shown, the toggle back on the state that content answers.
        if (affiche) {
          const avant = affiche.descendants && !affiche.force;
          if (avant !== demande) saut.current = true;
          setDemande(avant);
        }
      },
    );
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, essai, base, suffixeMode]);

  if (absent) return null;
  const groupes = affiche ? affiche.page.groupes.filter((g) => total(g, affiche.descendants) > 0) : [];
  if (affiche && !enCours && groupes.length === 0 && !echec) return null;

  const descendants = affiche?.descendants ?? false;
  const ailleurs = affiche?.force
    ? affiche.page.groupes.reduce((s, g) => s + total(g, true), 0)
    : 0;

  async function deplier(g: Groupe, apres?: string) {
    if (plus !== undefined || perdue) return;
    setPlus(g.nature);
    setEchec(false);
    try {
      const p = await lire<Page>(adresse(descendants, `nature=${encodeURIComponent(g.nature)}${apres ? `&curseur=${encodeURIComponent(apres)}` : ''}`));
      const lu = p.groupes.find((x) => x.nature === g.nature);
      if (lu) {
        setSuites((s) => ({
          ...s,
          [g.nature]: { fiches: apres ? [...(s[g.nature]?.fiches ?? []), ...lu.fiches] : lu.fiches, suivant: lu.suivant },
        }));
      }
    } catch {
      setEchec(true);
    } finally {
      setPlus(undefined);
    }
  }

  const occupe = enCours || plus !== undefined;
  const suffixeRecherche = suffixeMode.replace('?', '&');

  return (
    <CadreBlocFiche titre="Fiches liées" icone={Waypoints} chargement={!affiche && enCours} erreur={false} recharger={() => setEssai((n) => n + 1)}>
      {!affiche && echec && <ErreurLiees perdue={perdue} onReessayer={() => setEssai((n) => n + 1)} />}
      {affiche && (
        <div className={`liees${occupe ? ' rafraichit' : ''}`} aria-busy={occupe || undefined}>
          {lieu && (
            <div className="liees-tete">
              <Case
                etiquette={affiche.page.profondeurAtteinte ? 'sous-lieux compris (50 niveaux au plus)' : 'sous-lieux compris'}
                checked={descendants}
                disabled={affiche.force || occupe || perdue}
                onChange={(e) => setDemande(e.target.checked)}
              />
              {affiche.force && (
                <small className="gris-liee">
                  Rien à ce niveau ; {ailleurs} {ailleurs > 1 ? 'fiches' : 'fiche'} dans ses sous-lieux.
                </small>
              )}
            </div>
          )}
          {groupes.map((g) => {
            const suite = suites[g.nature];
            const lignes = suite?.fiches ?? g.fiches;
            const suivant = suite ? suite.suivant : g.suivant;
            const n = total(g, descendants);
            const comptes = compte(g, descendants).map((c) => {
              const t = types.find((x) => x.type === c.type);
              return `${t?.pluriel ?? c.type} (${c.n})`;
            }).join(', ');
            const recherche = `/univers/${universId}/recherche?lie=${fiche.id}&nature=${encodeURIComponent(g.nature)}${lieu && descendants ? '&descendants=1' : ''}${suffixeRecherche}`;
            const reste = suite ? n - lignes.length : n;
            return (
              <section key={g.nature} className="groupe-liees" aria-label={majuscule(g.libelle)}>
                <h3>
                  {majuscule(g.libelle)} :
                  <span className="comptes">{comptes}</span>
                  <Link className="chercher" to={recherche}>Chercher parmi</Link>
                </h3>
                <ul className="lignes-liees">
                  {lignes.map((f) => <LigneLiee key={f.id} universId={universId} fiche={f} lieu={lieu} />)}
                </ul>
                {suivant !== null && (
                  <Bouton
                    ecrit={false}
                    className="plus-liees"
                    disabled={occupe || perdue}
                    onClick={() => void deplier(g, suite ? (suivant ?? undefined) : undefined)}
                  >
                    {plus === g.nature ? 'Chargement…' : suite ? `Afficher les ${reste} suivants` : `Afficher les ${n}`}
                  </Bouton>
                )}
              </section>
            );
          })}
          {echec && <ErreurLiees perdue={perdue} onReessayer={() => setEssai((x) => x + 1)} />}
        </div>
      )}
    </CadreBlocFiche>
  );
}

function ErreurLiees({ perdue, onReessayer }: { perdue: boolean; onReessayer: () => void }) {
  return (
    <div className="echec" role="alert">
      Impossible de charger les fiches liées.{' '}
      <Bouton petit icone={RotateCcw} disabled={perdue} onClick={onReessayer}>Réessayer</Bouton>
    </div>
  );
}

export default {
  id: 'liees',
  types: ['lieu', 'faction', 'famille', 'personnage', 'objet', 'vaisseau'],
  roles: ['mj', 'joueur'],
  rang: 90,
  composant: Liees,
} satisfies BlocFiche;
