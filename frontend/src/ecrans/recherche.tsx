import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams, type SetURLSearchParams } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../api';
import { useBasculeMode, useCharge, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import { badgeFiche, iconeDuType, marqueDe, typesActifs, useTypes } from '../types-contexte';
import type { UniversListe } from '../types';
import { Bouton, Champ, PageIntrouvable } from '../ui';
import { adresseIllustration, useMJSeul } from './fiche/vignette';
import { MarqueDisparu, classeDisparu, etatDe } from './fiche/marque';
import { LONGUEUR_RECHERCHE } from './fiche/liste-recherche';
import type { Fiche, PageFiches } from './fiche/types';
import { StatutAventure } from './fiche/statut';
import './liste.css';
import './recherche.css';
import { Avancee, useAvancee } from './recherche/avancee';

const DELAI = 300;
/** Labels shown on a row before « +N ». */
const MAX_ETIQUETTES_LIGNE = 4;

type Resultats =
  | { etat: 'depart' }
  | { etat: 'ok' | 'chargement'; fiches: Fiche[]; suivant: string | null }
  | { etat: 'erreur'; fiches: Fiche[]; suivant: string | null };

/** E-17: search all the types of a universe by title, alias, sub-type and readable sections. */
function Recherche() {
  const { id } = useParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  if (univers.etat === 'erreur') return <PageIntrouvable />;
  if (univers.etat === 'chargement') return <div className="page-recherche" role="status"><p className="note-recherche">Chargement…</p></div>;
  return <Corps key={id} universId={id!} mj={univers.valeur.role === 'mj'} />;
}

function Corps({ universId, mj }: { universId: string; mj: boolean }) {
  const perdue = useConnexionPerdue();
  const { types, etat: etatTypes } = useTypes();
  const [params, setParamsAdresse] = useSearchParams();
  // Navigation updates the address before React commits the next render. Compose quick filter
  // gestures with that address, so the next control cannot restore a filter just removed.
  const setParams = useCallback<SetURLSearchParams>((suite, options) => {
    setParamsAdresse(typeof suite === 'function' ? suite(new URLSearchParams(window.location.search)) : suite, options);
  }, [setParamsAdresse]);
  const mode = useBasculeMode(mj);
  const { setMode } = useVue();

  // The player mode rides on the address: the GM arriving with `mode=joueur` takes it, then the toggle writes it.
  const initialise = useRef(false);
  const precedent = useRef(mode);
  useEffect(() => {
    if (!mj || initialise.current) return;
    initialise.current = true;
    if (params.get('mode') === 'joueur') {
      precedent.current = 'joueur';
      setMode('joueur');
    }
  }, [mj, params, setMode]);
  useEffect(() => {
    if (mode === precedent.current) return;
    precedent.current = mode;
    if (!initialise.current) return;
    setParams((p) => majParam(p, 'mode', mode === 'joueur' ? 'joueur' : ''), { replace: true });
  }, [mode, setParams]);
  const joueur = mj && params.get('mode') === 'joueur';
  const suffixeMode = joueur ? 'mode=joueur' : '';

  const q = (params.get('q') ?? '').trim();
  const [saisie, setSaisie] = useState(params.get('q') ?? '');
  const proposes = useMemo(() => typesActifs(types).filter((t) => t.reglable), [types]);
  const typeUrl = params.get('type') ?? '';
  const type = proposes.some((t) => t.type === typeUrl) ? typeUrl : '';

  const [etiquettesLues] = useCharge<{ nom: string }[]>(`/api/univers/${universId}/etiquettes${suffixeMode ? `?${suffixeMode}` : ''}`);
  const noms = etiquettesLues.etat === 'ok' ? etiquettesLues.valeur.map((e) => e.nom) : [];
  const etiquetteUrl = params.get('etiquette') ?? '';
  const etiquette = etiquettesLues.etat === 'ok' && noms.includes(etiquetteUrl) ? etiquetteUrl : '';

  const mots = proposes.find((t) => t.type === type)?.disparu;
  const etat = mots ? etatDe(params.get('etat')) : '';
  const avancee = useAvancee(universId, suffixeMode, params, setParams);
  const { lie, nature, descendants } = avancee;
  const trop = q.length > LONGUEUR_RECHERCHE;
  const depart = q === '' && etiquette === '' && lie === '';
  // Wait for what turns the address into a request (types, labels) before sending it.
  const attend = avancee.attend || etatTypes === 'chargement' || (etiquetteUrl !== '' && etiquettesLues.etat === 'chargement');
  const [resultats, setResultats] = useState<Resultats>({ etat: 'depart' });
  const [essai, setEssai] = useState(0);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const vol = useRef(0);

  const chemin = useMemo(() => {
    const p = new URLSearchParams();
    if (q !== '') p.set('q', q);
    if (type !== '') p.set('type', type);
    if (etiquette !== '') p.set('etiquette', etiquette);
    if (etat !== '') p.set('etat', etat);
    if (lie !== '') {
      p.set('lie', lie);
      if (nature) p.set('nature', nature);
      if (descendants) p.set('descendants', '1');
    }
    if (joueur) p.set('mode', 'joueur');
    return `/api/univers/${universId}/fiches?${p.toString()}`;
  }, [universId, q, type, etat, etiquette, joueur, lie, nature, descendants]);

  const parti = !depart && !trop && !attend && !perdue;
  useEffect(() => {
    if (depart || trop) {
      vol.current++;
      setResultats({ etat: 'depart' });
      return;
    }
    if (perdue) {
      vol.current++;
      setResultats((r) => r.etat === 'depart' ? r : { ...r, etat: 'ok' });
      return;
    }
    if (attend) {
      vol.current++;
      setResultats((r) => r.etat === 'depart' ? r : { ...r, etat: 'chargement' });
      return;
    }
    const n = ++vol.current;
    setSuiteEchec(false);
    setResultats((r) => (r.etat === 'depart' ? { etat: 'chargement', fiches: [], suivant: null } : { ...r, etat: 'chargement' }));
    lire<PageFiches>(chemin).then(
      (page) => n === vol.current && setResultats({ etat: 'ok', fiches: page.fiches, suivant: page.suivant }),
      (e: unknown) => {
        if (n !== vol.current) return;
        // A lost connection speaks through the frame's banner, the results stay readable.
        if (e instanceof ErreurApi && e.statut === 0) setResultats((r) => (r.etat === 'depart' ? r : { ...r, etat: 'ok' }));
        else setResultats((r) => ({ etat: 'erreur', fiches: r.etat === 'depart' ? [] : r.fiches, suivant: null }));
      },
    );
  }, [chemin, depart, trop, attend, perdue, essai]);

  // The field commits to the address 300 ms after the last keystroke (replace, no history stack).
  const commit = (valeur: string) => setParams((p) => majParam(p, 'q', valeur.trim() === '' ? '' : valeur), { replace: true });
  useEffect(() => {
    if (saisie === (params.get('q') ?? '')) return;
    const t = setTimeout(() => commit(saisie), DELAI);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);
  // The address changed from outside (back button, a label elsewhere): the field follows.
  useEffect(() => {
    setSaisie((s) => (s.trim() === (params.get('q') ?? '').trim() ? s : (params.get('q') ?? '')));
  }, [params]);

  function touche(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(saisie);
      if (saisie.trim() === q && parti) setEssai((n) => n + 1);
    }
  }

  async function chargerSuite() {
    if (resultats.etat === 'depart' || resultats.suivant === null || suiteEnCours) return;
    const n = vol.current;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(`${chemin}&curseur=${encodeURIComponent(resultats.suivant)}`);
      if (n === vol.current) setResultats((r) => (r.etat === 'depart' ? r : { etat: 'ok', fiches: [...r.fiches, ...p.fiches], suivant: p.suivant }));
    } catch {
      if (n === vol.current) setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  const choisir = (cle: 'type' | 'etiquette', valeur: string) =>
    setParams((p) => {
      const n = majParam(p, cle, valeur);
      if (cle === 'type') n.delete('etat');
      return n;
    }, { replace: true });

  return (
    <div className="page-recherche">
      <h1>Recherche</h1>
      <div className="saisie-recherche" role="search">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <Champ
          etiquette="Rechercher"
          type="text"
          autoFocus
          autoComplete="off"
          data-champ-recherche=""
          placeholder={lie ? 'Cherchez un nom, un alias ou un mot — facultatif avec « Lié à ».' : 'Cherchez un nom, un alias ou un mot.'}
          value={saisie}
          erreur={saisie.trim().length > LONGUEUR_RECHERCHE ? `${LONGUEUR_RECHERCHE} caractères au plus.` : undefined}
          onChange={(e: { target: { value: string } }) => setSaisie(e.target.value)}
          onKeyDown={touche}
        />
      </div>
      <div className="filtres-recherche" role="group" aria-label="Types">
        <Pastille actif={type === ''} onClick={() => choisir('type', '')}>
          Tous
        </Pastille>
        {proposes.map((t) => (
          <Pastille key={t.type} actif={type === t.type} onClick={() => choisir('type', type === t.type ? '' : t.type)} icone={iconeDuType(types, t.type)}>
            {t.pluriel}
          </Pastille>
        ))}
      </div>
      {noms.length > 0 && (
        <div className="filtres-recherche etiquettes" role="group" aria-label="Étiquettes">
          {noms.map((nom) => (
            <Pastille key={nom} tirets actif={etiquette === nom} onClick={() => choisir('etiquette', etiquette === nom ? '' : nom)}>
              {nom}
            </Pastille>
          ))}
        </div>
      )}
      <Avancee universId={universId} suffixeMode={suffixeMode} params={params} setParams={setParams} avancee={avancee} mots={mots} etat={etat} />
      <Corps2
        lie={lie !== ''}
        cible={avancee.cible.etat === 'ok' ? avancee.cible.fiche.titre : undefined}
        attend={attend}
        resultats={resultats}
        depart={depart}
        trop={trop}
        universId={universId}
        suiteEnCours={suiteEnCours}
        suiteEchec={suiteEchec}
        perdue={perdue}
        onSuite={chargerSuite}
        onReessayer={() => setEssai((n) => n + 1)}
        onEtiquette={(nom) => choisir('etiquette', nom)}
      />
    </div>
  );
}

function Corps2({
  lie,
  cible,
  attend,
  resultats,
  depart,
  trop,
  universId,
  suiteEnCours,
  suiteEchec,
  perdue,
  onSuite,
  onReessayer,
  onEtiquette,
}: {
  lie: boolean;
  cible?: string;
  attend: boolean;
  resultats: Resultats;
  depart: boolean;
  trop: boolean;
  universId: string;
  suiteEnCours: boolean;
  suiteEchec: boolean;
  perdue: boolean;
  onSuite: () => void;
  onReessayer: () => void;
  onEtiquette: (nom: string) => void;
}) {
  if (trop) return null;
  if (!depart && attend && resultats.etat === 'depart') return <p className="note-recherche" role="status">Recherche…</p>;
  if (depart || resultats.etat === 'depart') return <div className="vide-recherche">Cherchez un nom, un alias ou un mot.</div>;
  const grise = resultats.etat === 'chargement';
  return (
    <>
      {grise && (
        <p className="note-recherche" role="status">
          Recherche…
        </p>
      )}
      {resultats.etat === 'erreur' && (
        <div className="echec" role="alert">
          La recherche n’a pas abouti. Réessayez. <Bouton petit onClick={onReessayer}>Réessayer</Bouton>
        </div>
      )}
      {resultats.etat === 'ok' && resultats.fiches.length === 0 && <div className="vide-recherche">{lie ? cible ? <>Aucune fiche liée à « <span className="cible-vide" title={cible}>{cible}</span> » pour ces critères.</> : 'Aucune fiche liée pour ces critères.' : 'Aucune fiche ne correspond.'}</div>}
      {resultats.fiches.length > 0 && (
        <ul className={`resultats-recherche${grise ? ' grise' : ''}`}>
          {resultats.fiches.map((f) => (
            <Ligne key={f.id} universId={universId} fiche={f} onEtiquette={onEtiquette} />
          ))}
        </ul>
      )}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {resultats.etat !== 'erreur' && resultats.suivant !== null && (
        <div className="suite-recherche">
          <Bouton ecrit={false} enCours={suiteEnCours} onClick={onSuite} disabled={perdue}>
            Charger la suite
          </Bouton>
        </div>
      )}
    </>
  );
}

function Ligne({ universId, fiche, onEtiquette }: { universId: string; fiche: Fiche; onEtiquette: (nom: string) => void }) {
  const { types } = useTypes();
  const Icone = iconeDuType(types, fiche.type);
  const [ko, setKo] = useState(false);
  const jeton = fiche.illustration && 'jeton' in fiche.illustration ? fiche.illustration.jeton : undefined;
  const etiquettes = fiche.etiquettes ?? [];
  const marque = marqueDe(types, fiche);
  const mjSeul = useMJSeul(fiche);
  const badge = fiche.sousType ? `${badgeFiche(types, fiche)} · ${fiche.sousType}` : badgeFiche(types, fiche);
  return (
    <li className={mjSeul.badge ? "ligne-recherche avec-pastille" : "ligne-recherche"}>
      <Link className="lien-recherche" to={`/univers/${universId}/fiche/${fiche.id}`}>
        <span className={`vignette-recherche${classeDisparu(marque)}`} aria-hidden={marque ? undefined : 'true'}>
          {jeton !== undefined && !ko ? (
            <img src={adresseIllustration(universId, fiche.id, jeton)} alt="" width={40} height={40} loading="lazy" onError={() => setKo(true)} />
          ) : (
            <Icone size={16} strokeWidth={1.75} />
          )}
          {marque && <MarqueDisparu mot={marque.mot} Icone={marque.Icone} />}
        </span>
        <span className="texte-recherche">
          <span className="titre-recherche" title={fiche.titre}>
            <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
            {fiche.titre}
          </span>
          {fiche.via && <small className="via-recherche" title={fiche.via.titre}>{fiche.via.titre}</small>}
          {(fiche.aliasTrouve !== undefined || etiquettes.length > 0) && (
            <small className="sous-titre-recherche">
              {fiche.aliasTrouve !== undefined && (
                <span className="alias-recherche" title={fiche.aliasTrouve}>
                  alias : {fiche.aliasTrouve}
                </span>
              )}
              {fiche.aliasTrouve !== undefined && etiquettes.length > 0 && <span aria-hidden="true">·</span>}
              {etiquettes.slice(0, MAX_ETIQUETTES_LIGNE).map((nom) => (
                <button key={nom} type="button" className="etiquette-ligne" title={nom} onClick={() => onEtiquette(nom)}>
                  {nom}
                </button>
              ))}
              {etiquettes.length > MAX_ETIQUETTES_LIGNE && <span className="plus-etiquettes">+{etiquettes.length - MAX_ETIQUETTES_LIGNE}</span>}
            </small>
          )}
        </span>
        <span className="badge-type" title={badge}>
          {badge}
        </span>
        {fiche.type === 'aventure' && <StatutAventure universId={universId} fiche={fiche} />}
      </Link>
      {mjSeul.badge}
      {mjSeul.aide}
    </li>
  );
}

function Pastille({
  actif,
  tirets,
  icone: Icone,
  onClick,
  children,
}: {
  actif: boolean;
  tirets?: boolean;
  icone?: ReturnType<typeof iconeDuType>;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" className={`pastille-filtre${actif ? ' actif' : ''}${tirets ? ' tirets' : ''}`} aria-pressed={actif} onClick={onClick} title={children}>
      {Icone && <Icone size={14} strokeWidth={1.75} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

function majParam(p: URLSearchParams, cle: string, valeur: string) {
  const n = new URLSearchParams(p);
  if (valeur === '') n.delete(cle);
  else n.set(cle, valeur);
  return n;
}


export default { chemin: '/univers/:id/recherche', composant: Recherche } satisfies Ecran;
