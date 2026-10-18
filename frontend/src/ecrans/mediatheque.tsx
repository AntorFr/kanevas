import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Download, Eye, FileText, ImageOff, Images, LayoutGrid, Lock, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { appeler, envoyerFichier, ErreurApi, lire, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { iconeDuType, useTypes } from '../types-contexte';
import { Bouton, BoiteDialogue, Champ, ErreurChargement, Pastille, PageIntrouvable, useToasts, VideIcone } from '../ui';
import './ecrans.css';
import './mediatheque/mediatheque.css';
import {
  Apercu,
  extension,
  iconeDe,
  octets,
  tailleLisible,
  typeLisible,
  type Detail,
  type Fichier,
  type PageFichiers,
  type Usage,
} from './mediatheque/commun';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const MAX_NOM = 200;

type Nature = '' | 'images' | 'documents';

interface Envoi {
  cle: number;
  fichier: File;
  pct: number;
  echec: boolean;
}

/** The sentence of the « Supprimer » box: the sheets that lose the file, one entry per sheet. */
function fichesPerdues(usages: Usage[]): string[] {
  const parFiche = new Map<number, { titre: string; parts: string[] }>();
  for (const u of usages) {
    const e = parFiche.get(u.ficheId) ?? { titre: u.ficheTitre, parts: [] };
    if (u.illustration) e.parts.push('illustration');
    else if (u.dansTexte) e.parts.push(`« ${u.sectionTitre} »`);
    else e.parts.push(`pièces jointes de « ${u.sectionTitre} »`);
    parFiche.set(u.ficheId, e);
  }
  return [...parFiche.values()].map((e) => `${e.titre} (${e.parts.join(', ')})`);
}

/** E-19 Médiathèque: every file of the universe the account reads; the GM adds, renames, sets rights, deletes. */
function Mediatheque() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const perdue = useConnexionPerdue();
  const { types } = useTypes();
  const titreEditable = useRef<HTMLHeadingElement>(null);
  const { toast } = useToasts();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);

  const [nature, setNature] = useState<Nature>('');
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [visibilite, setVisibilite] = useState('');
  const [usage, setUsage] = useState('');
  const [tri, setTri] = useState('recent');
  const [rev, setRev] = useState(0);

  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  // Server count of all files the reader can read in the library, independent of the filters.
  const [total, setTotal] = useState(0);
  const [suite, setSuite] = useState<number | string | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);

  const [envois, setEnvois] = useState<Envoi[]>([]);
  const annulations = useRef(new Map<number, () => void>());
  const prochain = useRef(1);
  const [vides, setVides] = useState<string[]>([]);
  const [echec, setEchec] = useState<string>();
  const [survol, setSurvol] = useState(false);
  const compteurSurvol = useRef(0);
  const saisie = useRef<HTMLInputElement>(null);

  const fid = params.get('fichier');
  const [detail, setDetail] = useState<Detail>();
  const [detailEtat, setDetailEtat] = useState<'chargement' | 'ok' | 'erreur' | 'introuvable'>('chargement');
  const [usagesEnCours, setUsagesEnCours] = useState(false);
  const [nom, setNom] = useState('');
  const [erreurNom, setErreurNom] = useState<string>();
  const [boite, setBoite] = useState<{ action: 'reserver' | 'supprimer'; usages: Usage[] }>();
  const [enCours, setEnCours] = useState(false);
  const [imageCassee, setImageCassee] = useState(false);

  // Reflect the accepted server name (including trimmed whitespace) in the editable title.
  useEffect(() => {
    if (detailEtat === 'ok' && detail && titreEditable.current) {
      titreEditable.current.textContent = detail.fichier.nom;
    }
  }, [detail?.fichier.id, detail?.fichier.nom, detailEtat]);

  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj';
  const filtre = nature !== '' || q !== '' || visibilite !== '' || usage !== '';

  // The search box waits for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQ(recherche.trim()), 250);
    return () => clearTimeout(t);
  }, [recherche]);

  const requete = useMemo(() => {
    const p = new URLSearchParams();
    if (nature) p.set('nature', nature);
    if (q) p.set('q', q);
    if (visibilite) p.set('visibilite', visibilite);
    if (usage) p.set('usage', usage);
    if (tri !== 'recent') p.set('tri', tri);
    return p;
  }, [nature, q, visibilite, usage, tri]);

  useEffect(() => {
    if (univers.etat !== 'ok') return;
    let actif = true;
    setEtat('chargement');
    lire<PageFichiers>(`/api/univers/${id}/fichiers?${requete}`).then(
      (p) => {
        if (!actif) return;
        setFichiers(p.fichiers);
        setTotal(p.total);
        setSuite(p.suite);
        setSuiteEchec(false);
        setEtat('ok');
      },
      () => actif && setEtat('erreur'),
    );
    return () => {
      actif = false;
    };
  }, [id, requete, rev, univers.etat]);

  // The panel of the opened file: what the server says the reader may see, nothing filtered here.
  useEffect(() => {
    if (!fid || univers.etat !== 'ok') return;
    let actif = true;
    setDetailEtat('chargement');
    setImageCassee(false);
    setErreurNom(undefined);
    lire<Detail>(`/api/univers/${id}/fichiers/${fid}/detail`).then(
      (d) => {
        if (!actif) return;
        setDetail(d);
        setNom(d.fichier.nom);
        setDetailEtat('ok');
      },
      (e: unknown) => actif && setDetailEtat(e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur'),
    );
    return () => {
      actif = false;
    };
  }, [id, fid, univers.etat, rev]);

  const ouvrir = (f: number | null) =>
    setParams(f === null ? {} : { fichier: String(f) }, { replace: f === null });

  const recharger = () => setRev((n) => n + 1);

  // --- sending -----------------------------------------------------------------------------------
  const envoyer = useCallback(
    async (fichier: File, cle: number) => {
      if (fichier.size === 0) {
        setEnvois((l) => l.filter((e) => e.cle !== cle));
        setVides((l) => [...l, `« ${fichier.name} » est vide.`]);
        return;
      }
      setEnvois((l) => l.map((e) => (e.cle === cle ? { ...e, echec: false, pct: 0 } : e)));
      const { promesse, annuler } = envoyerFichier<unknown>(
        `/api/univers/${id}/fichiers`,
        fichier,
        (pct) => setEnvois((l) => l.map((e) => (e.cle === cle ? { ...e, pct } : e))),
        'POST',
      );
      annulations.current.set(cle, annuler);
      try {
        await promesse;
        setEnvois((l) => l.filter((e) => e.cle !== cle));
        setRev((n) => n + 1);
      } catch (e) {
        if (e instanceof ErreurApi && e.statut === -1) return setEnvois((l) => l.filter((x) => x.cle !== cle));
        if (e instanceof ErreurApi && e.code === 'fichier_vide') {
          setEnvois((l) => l.filter((x) => x.cle !== cle));
          return setVides((l) => [...l, `« ${fichier.name} » est vide.`]);
        }
        setEnvois((l) => l.map((x) => (x.cle === cle ? { ...x, echec: true } : x)));
      } finally {
        annulations.current.delete(cle);
      }
    },
    [id],
  );

  function ajouter(liste: FileList | File[] | null) {
    if (!mj || !liste || liste.length === 0) return;
    setVides([]);
    const nouveaux: Envoi[] = Array.from(liste).map((fichier) => ({ cle: prochain.current++, fichier, pct: 0, echec: false }));
    setEnvois((l) => [...l, ...nouveaux]);
    for (const n of nouveaux) void envoyer(n.fichier, n.cle);
  }

  useEffect(() => {
    const a = annulations.current;
    return () => a.forEach((f) => f());
  }, []);

  const glisse = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  // --- changes of the panel ----------------------------------------------------------------------
  function refus(e: unknown) {
    if (e instanceof ErreurApi && e.statut === 403) setEchec('Vous ne pouvez plus modifier ce fichier.');
    else if (e instanceof ErreurApi && e.statut === 404) {
      setEchec('Ce fichier n’existe plus.');
      ouvrir(null);
      recharger();
    } else setEchec(ECHEC);
  }

  function appliquer(maj: Fichier) {
    setFichiers((l) => l.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)));
    setDetail((d) => (d && d.fichier.id === maj.id ? { ...d, fichier: { ...d.fichier, ...maj } } : d));
  }

  async function renommer() {
    if (!detail || nom === detail.fichier.nom) return setErreurNom(undefined);
    const t = nom.trim();
    if (t === '') return setErreurNom('le nom est obligatoire.');
    if (t.length > MAX_NOM) return setErreurNom(`${MAX_NOM} caractères au plus.`);
    setErreurNom(undefined);
    setEchec(undefined);
    try {
      const maj = await appeler<Fichier>('PATCH', `/api/univers/${id}/fichiers/${detail.fichier.id}`, { nom: t });
      appliquer(maj);
      setNom(maj.nom);
    } catch (e) {
      refus(e);
    }
  }

  async function reglerVisibilite(v: 'joueurs' | 'mj') {
    if (!detail || enCours || v === detail.fichier.visibilite) return;
    setEchec(undefined);
    if (v === 'joueurs') {
      try {
        appliquer(await appeler<Fichier>('PATCH', `/api/univers/${id}/fichiers/${detail.fichier.id}`, { visibilite: v }));
      } catch (e) {
        refus(e);
      }
      return;
    }
    setEnCours(true);
    try {
      const { usages } = await lire<{ usages: Usage[] }>(`/api/univers/${id}/fichiers/${detail.fichier.id}/impact?action=reserver`);
      if (usages.length > 0) return setBoite({ action: 'reserver', usages });
      await confirmerReserver();
    } catch (e) {
      refus(e);
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerReserver() {
    if (!detail) return;
    appliquer(await appeler<Fichier>('PATCH', `/api/univers/${id}/fichiers/${detail.fichier.id}`, { visibilite: 'mj' }));
    toast('Fichier réservé au MJ.');
  }

  async function demanderSuppression() {
    if (!detail || enCours) return;
    setEchec(undefined);
    setEnCours(true);
    try {
      const { usages } = await lire<{ usages: Usage[] }>(`/api/univers/${id}/fichiers/${detail.fichier.id}/impact?action=supprimer`);
      setBoite({ action: 'supprimer', usages });
    } catch (e) {
      refus(e);
    } finally {
      setEnCours(false);
    }
  }

  async function confirmer() {
    if (!boite || !detail || enCours) return;
    setEnCours(true);
    try {
      if (boite.action === 'reserver') {
        await confirmerReserver();
      } else {
        await appeler('DELETE', `/api/univers/${id}/fichiers/${detail.fichier.id}`);
        setFichiers((l) => l.filter((x) => x.id !== detail.fichier.id));
        setTotal((t) => Math.max(0, t - 1));
        ouvrir(null);
        toast('Fichier supprimé.');
      }
      setBoite(undefined);
    } catch (e) {
      setBoite(undefined);
      refus(e);
    } finally {
      setEnCours(false);
    }
  }

  async function chargerSuite() {
    if (suiteEnCours || suite === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = new URLSearchParams(requete);
      p.set('apres', String(suite));
      const page = await lire<PageFichiers>(`/api/univers/${id}/fichiers?${p}`);
      setFichiers((l) => [...l, ...page.fichiers]);
      setSuite(page.suite);
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function plusDUsages() {
    if (!detail || usagesEnCours) return;
    setUsagesEnCours(true);
    try {
      const d = await lire<Detail>(`/api/univers/${id}/fichiers/${detail.fichier.id}/detail?apresUsage=${detail.usages.length}`);
      setDetail((x) => (x ? { ...x, usages: [...x.usages, ...d.usages], restantes: d.restantes } : x));
    } catch {
      setEchec(ECHEC);
    } finally {
      setUsagesEnCours(false);
    }
  }

  // --- rendering -----------------------------------------------------------------------------------
  if (univers.etat === 'chargement') return <div className="etat" role="status">Chargement…</div>;
  if (univers.etat === 'erreur') {
    return univers.statut === 404 ? <PageIntrouvable /> : <ErreurChargement page onReessayer={recharger} />;
  }
  if (fid && detailEtat === 'introuvable') return <PageIntrouvable />;

  const f = detail?.fichier;
  const feminin = f?.image ?? false;
  const compte = `${total} fichier${total > 1 ? 's' : ''}`;

  return (
    <div
      className={`mediatheque${fid ? ' med-panneau-ouvert' : ''}`}
      onDragEnter={(e) => {
        if (!mj || !glisse(e)) return;
        compteurSurvol.current += 1;
        setSurvol(true);
      }}
      onDragOver={(e) => {
        if (mj && glisse(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!mj || !glisse(e)) return;
        compteurSurvol.current = Math.max(0, compteurSurvol.current - 1);
        if (compteurSurvol.current === 0) setSurvol(false);
      }}
      onDrop={(e) => {
        if (!mj || !glisse(e)) return;
        e.preventDefault();
        compteurSurvol.current = 0;
        setSurvol(false);
        ajouter(e.dataTransfer.files);
      }}
    >
      {survol && (
        <div className="med-depot" role="status">
          <Upload size={24} strokeWidth={1.75} aria-hidden="true" />
          Déposez les fichiers pour les ajouter.
        </div>
      )}
      <div className="med-tete">
        <span className="med-glyphe" aria-hidden="true"><Images size={20} strokeWidth={1.75} /></span>
        <h1>Médiathèque</h1>
        {etat === 'ok' && <span className="med-compte">{compte}</span>}
        {mj && (
          <>
            <input
              ref={saisie}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                ajouter(e.target.files);
                e.target.value = '';
              }}
            />
            <Bouton variante="principal" icone={Upload} ecrit onClick={() => saisie.current?.click()}>
              Ajouter des fichiers
            </Bouton>
          </>
        )}
      </div>

      <div className="bascule med-bascule" role="radiogroup" aria-label="Nature">
        {([['', 'Tout', LayoutGrid], ['images', 'Images', Images], ['documents', 'Documents', FileText]] as const).map(([v, l, Ic]) => (
          <label key={v}>
            <input type="radio" name="nature" checked={nature === v} onChange={() => setNature(v)} />
            <Ic size={14} strokeWidth={1.75} aria-hidden="true" />
            {l}
          </label>
        ))}
      </div>

      <div className="med-filtres">
        <label className="med-recherche">
          <Search size={14} strokeWidth={1.75} aria-hidden="true" />
          <input type="search" aria-label="Chercher par nom" placeholder="Chercher par nom" value={recherche} maxLength={200}
            onChange={(e) => setRecherche(e.target.value)} />
        </label>
        {mj && (
          <Champ liste etiquette="Visibilité" value={visibilite}
            onChange={(e: { target: { value: string } }) => setVisibilite(e.target.value)}>
            <option value="">Toutes</option>
            <option value="joueurs">Visibles des joueurs</option>
            <option value="mj">Réservées au MJ</option>
          </Champ>
        )}
        <Champ liste etiquette="Usage" value={usage} onChange={(e: { target: { value: string } }) => setUsage(e.target.value)}>
          <option value="">Tous</option>
          <option value="utilises">Utilisés</option>
          <option value="non_utilises">Non utilisés</option>
        </Champ>
        <span className="med-ordre">
          <ArrowDownWideNarrow size={14} strokeWidth={1.75} aria-hidden="true" />
          <Champ liste etiquette="Ordre" value={tri} onChange={(e: { target: { value: string } }) => setTri(e.target.value)}>
            <option value="recent">Plus récents</option>
            <option value="nom">Nom</option>
          </Champ>
        </span>
      </div>

      {echec && <div className="echec" role="alert">{echec}</div>}

      {envois.length > 0 && (
        <ul className="med-envois">
          {envois.map((e) => (
            <li key={e.cle} role="status">
              <span className="med-envoi-nom">{e.fichier.name}</span>
              {e.echec ? (
                <>
                  <span role="alert"> — L’envoi n’a pas abouti.</span>
                  <Bouton petit ecrit onClick={() => void envoyer(e.fichier, e.cle)}>Réessayer</Bouton>
                  <Bouton petit icone={X} onClick={() => setEnvois((l) => l.filter((x) => x.cle !== e.cle))}>Abandonner</Bouton>
                </>
              ) : (
                <>
                  <span> — Envoi… {e.pct} %</span>
                  <Bouton petit icone={X} onClick={() => annulations.current.get(e.cle)?.()}>Annuler</Bouton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {etat === 'chargement' && (
        <div className="med-grille" role="status" aria-label="Chargement des fichiers…">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="med-tuile squelette" aria-hidden="true" />
          ))}
        </div>
      )}
      {etat === 'erreur' && <ErreurChargement texte="Impossible de charger la médiathèque." onReessayer={recharger} />}
      {etat === 'ok' && fichiers.length === 0 && (
        <VideIcone icone={Images}>
          {filtre ? (
            <p>Aucun fichier ne correspond.</p>
          ) : mj ? (
            <>
              <p>Aucun fichier pour l’instant. Ajoutez-en, ou posez-en un dans une fiche.</p>
              <Bouton variante="principal" icone={Upload} ecrit onClick={() => saisie.current?.click()}>
                Ajouter des fichiers
              </Bouton>
            </>
          ) : (
            <p>Aucun fichier à voir pour l’instant.</p>
          )}
        </VideIcone>
      )}
      {etat === 'ok' && fichiers.length > 0 && (
        <ul className="med-grille">
          {fichiers.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className={`med-tuile${String(x.id) === fid ? ' choisie' : ''}`}
                onClick={() => ouvrir(x.id)}
                aria-label={x.nom}
                aria-pressed={String(x.id) === fid}
              >
                <span className="med-cadre">
                  <Apercu universId={id!} f={x} />
                  {mj && x.visibilite === 'mj' && (
                    <span className="med-pastille"><Pastille sens="secrete" icone={Lock}>MJ seul</Pastille></span>
                  )}
                </span>
                <span className="med-nom" title={x.nom}>{x.nom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {vides.map((v, i) => (
        <p key={i} className="med-vide" role="alert">{v}</p>
      ))}
      {suiteEchec && <div className="echec" role="alert">Impossible de charger la suite.</div>}
      {etat === 'ok' && suite !== null && (
        <Bouton icone={ChevronDown} enCours={suiteEnCours} disabled={perdue} onClick={() => void chargerSuite()}>
          Charger la suite
        </Bouton>
      )}

      {fid && (
        <aside className="med-panneau" aria-label="Fichier" onKeyDown={(e) => e.key === 'Escape' && !boite && ouvrir(null)}>
          <div className="med-panneau-tete">
            <span className="med-panneau-libelle"><Images size={14} strokeWidth={1.75} aria-hidden="true" />Fichier</span>
            <button type="button" className="bouton-icone" aria-label="Fermer" title="Fermer" onClick={() => ouvrir(null)}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {detailEtat === 'chargement' && <div className="etat" role="status">Chargement…</div>}
          {detailEtat === 'erreur' && <ErreurChargement texte="Impossible de charger la médiathèque." onReessayer={recharger} />}
          {detailEtat === 'ok' && f && (
            <div className="med-corps">
              {f.image && imageCassee ? (
                <div className="med-grand med-doc">
                  <ImageOff size={40} strokeWidth={1.75} aria-hidden="true" />
                  <span>Image indisponible.</span>
                </div>
              ) : f.image ? (
                <img className="med-grand" src={octets(id!, f)} alt={f.nom} onError={() => setImageCassee(true)} />
              ) : (
                <div className="med-grand med-doc">
                  {(() => {
                    const Icone = iconeDe(f);
                    return <Icone size={56} strokeWidth={1.75} aria-hidden="true" />;
                  })()}
                  <b>{typeLisible(f)}</b>
                </div>
              )}
              <a className="bouton neutre" href={octets(id!, f)} download={f.nom}>
                <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                Télécharger
              </a>

              <div className="med-titre-fichier">
                <h2
                  key={f.id}
                  ref={titreEditable}
                  className="med-nom-en-place"
                  contentEditable={mj && !perdue ? 'plaintext-only' : false}
                  suppressContentEditableWarning
                  role={mj ? 'textbox' : undefined}
                  aria-label={mj ? 'Nom' : undefined}
                  aria-readonly={mj ? perdue : undefined}
                  aria-invalid={erreurNom ? true : undefined}
                  aria-describedby={erreurNom ? 'med-erreur-nom' : undefined}
                  tabIndex={mj ? 0 : undefined}
                  onInput={(e) => setNom(e.currentTarget.textContent ?? '')}
                  onBlur={() => mj && !perdue && void renommer()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      e.currentTarget.textContent = f.nom;
                      setNom(f.nom);
                      setErreurNom(undefined);
                    }
                  }}
                >{f.nom}</h2>
                {mj && <Bouton petit icone={Pencil} ecrit aria-label="Renommer le fichier"
                  onClick={() => titreEditable.current?.focus()} />}
                {erreurNom && <p id="med-erreur-nom" className="erreur-champ" role="alert">Erreur : {erreurNom}</p>}
              </div>

              {mj && (
                <fieldset className="med-visibilite" disabled={perdue}>
                  <legend>Visibilité</legend>
                  <div className="bascule" role="radiogroup" aria-label="Visibilité">
                    <label>
                      <input type="radio" name="visibilite" value="joueurs" checked={f.visibilite === 'joueurs'} onChange={() => void reglerVisibilite('joueurs')} />
                      <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                      Visible des joueurs
                    </label>
                    <label>
                      <input type="radio" name="visibilite" value="mj" checked={f.visibilite === 'mj'} onChange={() => void reglerVisibilite('mj')} />
                      <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                      Réservé au MJ
                    </label>
                  </div>
                </fieldset>
              )}

              <div className="med-infos">
                <div className="med-meta-ligne"><span>{f.type.split('/')[1]?.toUpperCase() || extension(f.nom) || typeLisible(f)}</span><span>{tailleLisible(f.taille)}</span></div>
                <div>ajouté par {f.ajouteParNom} le {new Date(f.ajouteLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                {mj && f.cleOrigine && <div className="med-cle">Clé d’origine <code>{f.cleOrigine}</code></div>}
              </div>

              {detail!.usages.length > 0 && (
                <section className="med-utilisations" aria-labelledby="med-utilise">
                  <h3 id="med-utilise">Utilisé dans</h3>
                  <ul className="med-usages">
                    {detail!.usages.map((u, i) => {
                      const Icone = iconeDuType(types, u.ficheType);
                      return (
                        <li key={i}>
                          <Link className="med-usage" to={`/univers/${id}/fiche/${u.ficheId}`}>
                            <span className="med-mono" aria-hidden="true">
                              <Icone size={14} strokeWidth={1.75} />
                            </span>
                            <span className="med-usage-texte">
                              <span>{u.ficheTitre}</span>{' '}
                              <span className="med-usage-ou">{u.illustration ? '(illustration)' : `— « ${u.sectionTitre} »${u.joint && !u.dansTexte ? ' (jointe)' : ''}`}</span>
                            </span>
                            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {detail!.restantes > 0 && (
                    <Bouton petit icone={ChevronDown} enCours={usagesEnCours} onClick={() => void plusDUsages()}>
                      Afficher les {detail!.restantes} autres
                    </Bouton>
                  )}
                </section>
              )}

              {mj && (
                <Bouton variante="fantome" className="med-supprimer" icone={Trash2} ecrit enCours={enCours && !boite} onClick={() => void demanderSuppression()}>
                  Supprimer le fichier
                </Bouton>
              )}
            </div>
          )}
        </aside>
      )}

      {boite && f && (
        <BoiteDialogue
          titre={boite.action === 'reserver' ? `Réserver « ${f.nom} » au MJ ?` : `Supprimer « ${f.nom} » ?`}
          texte={
            boite.action === 'reserver'
              ? `Les joueurs ne le verront plus dans : ${boite.usages.map((u) => u.libelle.replace(/« /g, '«\u202f').replace(/ »/g, '\u202f»')).join(' ; ')}.`
              : boite.usages.length === 0
                ? ''
                : (() => {
                    const l = fichesPerdues(boite.usages);
                    return `${feminin ? 'Elle est utilisée' : 'Il est utilisé'} dans ${l.length} fiche${l.length > 1 ? 's' : ''} : ${l.join(', ')}. ${feminin ? 'Elle disparaîtra' : 'Il disparaîtra'} de ${l.length > 1 ? 'ces fiches' : 'cette fiche'}.`;
                  })()
          }
          action={boite.action === 'reserver' ? 'Réserver au MJ' : 'Supprimer le fichier'}
          icone={boite.action === 'reserver' ? Lock : Trash2}
          variante={boite.action === 'reserver' ? 'mj' : 'danger'}
          enCours={enCours}
          onConfirmer={() => void confirmer()}
          onFermer={() => setBoite(undefined)}
        />
      )}
    </div>
  );
}

export default { chemin: '/univers/:id/mediatheque', composant: Mediatheque } satisfies Ecran;
