import { Ban, Check, ChevronRight, CircleAlert, CircleX, Copy, Hourglass, KeyRound, Loader, Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler, useConnexionPerdue } from '../api';
import { useCharge, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Alerte, BoiteDialogue, Bouton, Case, Champ, ChargementListe, ErreurChargement, PageIntrouvable, Pastille, useToasts } from '../ui';
import {
  ETAT_LOT,
  dateCourte,
  dateHeure,
  dernierUsage,
  etatJeton,
  morceauxLot,
  titreGroupe,
  type EntreeRapport,
  type JetonVue,
  type LotVue,
  type OutilProposable,
} from './acces-api/format';
import './acces-api/acces-api.css';
import './ecrans.css';
import './liste.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_MJ = 'Vous ne pouvez plus gérer l’accès par API de cet univers.';
const DUREES = [
  { jours: 7, libelle: '7 jours' },
  { jours: 30, libelle: '30 jours' },
  { jours: 90, libelle: '90 jours' },
  { jours: 365, libelle: '1 an' },
];
const FOCALISABLES = 'a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])';

const messageEchec = (e: unknown) => (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404) ? PLUS_MJ : ECHEC);

/** The last loaded value stays on screen while a reload runs (no skeleton flash after a gesture). */
function useGarde<T>(charge: ReturnType<typeof useCharge<T>>[0]) {
  const dernier = useRef<T | undefined>(undefined);
  if (charge.etat === 'ok') dernier.current = charge.valeur;
  return charge.etat === 'chargement' && dernier.current !== undefined
    ? ({ etat: 'ok', valeur: dernier.current } as const)
    : charge;
}

/** Copies a text; returns whether the clipboard accepted it. */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

/**
 * « Nouveau jeton » (E-18): the form, then — same box — the token shown once. While it is shown only
 * « J'ai copié le jeton » closes the box (no Escape, no veil); during a request nothing closes it.
 */
function BoiteNouveauJeton({ base, onFini }: { base: string; onFini: (cree: boolean) => void }) {
  const [nom, setNom] = useState('');
  const [duree, setDuree] = useState(30);
  const [portee, setPortee] = useState<'contenu' | 'outils'>('contenu');
  const [choisis, setChoisis] = useState<string[]>([]);
  const [outils, rechargerOutils] = useCharge<OutilProposable[]>(`${base}/jetons/outils`);
  const [erreurPortee, setErreurPortee] = useState<string>();
  const perdue = useConnexionPerdue();
  const [erreurNom, setErreurNom] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [envoi, setEnvoi] = useState(false);
  const [valeur, setValeur] = useState<string>();
  const [nomCree, setNomCree] = useState('');
  const { toast } = useToasts();
  const ref = useRef<HTMLDivElement>(null);
  const idTitre = useId();
  const nomDuree = useId();
  const nomPortee = useId();
  const aidePortee = useId();
  const sansOutil = outils.etat === 'ok' && outils.valeur.length === 0;
  const porteeInvalide = portee === 'outils' && (outils.etat !== 'ok' || sansOutil || choisis.length === 0);
  const etat = useRef({ envoi, valeur });
  etat.current = { envoi, valeur };
  const fini = useRef(onFini);
  fini.current = onFini;

  useEffect(() => {
    const ouvrant = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input[type="text"]')?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!etat.current.envoi && etat.current.valeur === undefined) fini.current(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const f = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? []).filter(
        (x) => x.getAttribute('aria-disabled') !== 'true' && !(x as HTMLButtonElement).disabled,
      );
      if (f.length === 0) return e.preventDefault();
      const premier = f[0]!;
      const dernier = f[f.length - 1]!;
      if (!ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        premier.focus();
      } else if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('keydown', touche);
      queueMicrotask(() => (ouvrant?.isConnected ? ouvrant : document.querySelector<HTMLElement>('main h1'))?.focus());
    };
  }, []);

  // The token appears: the focus goes to the one button that can close the box.
  useEffect(() => {
    if (valeur !== undefined) ref.current?.querySelector<HTMLElement>('[data-fermer-jeton]')?.focus();
  }, [valeur]);

  async function creer() {
    if (envoi || perdue || porteeInvalide) return;
    const net = nom.trim();
    if (net.length < 1) return setErreurNom('le nom est obligatoire.');
    if (net.length > 80) return setErreurNom('80 caractères au plus.');
    setErreurNom(undefined);
    setEchec(undefined);
    setEnvoi(true);
    try {
      const r = await appeler<{ valeur: string }>('POST', `${base}/jetons`, {
        nom: net, dureeJours: duree, ...(portee === 'outils' ? { outils: choisis } : {}),
      });
      setNomCree(net);
      setValeur(r.valeur);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 0) setEchec('Connexion perdue. Réessayez.');
      else if (e instanceof ErreurApi && e.statut === 400 && portee === 'outils') setErreurPortee(e.message.replace(/^Erreur : /, ''));
      else if (e instanceof ErreurApi && e.statut === 400) setErreurNom(e.message.replace(/^Erreur : /, ''));
      else setEchec(messageEchec(e));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div
      className="voile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !envoi && valeur === undefined) onFini(false);
      }}
    >
      <div className="boite boite-jeton" role="dialog" aria-modal="true" aria-labelledby={idTitre} ref={ref}>
        <span className="tuile-jeton" aria-hidden="true">
          <KeyRound size={18} strokeWidth={1.75} />
        </span>
        <div className="boite-corps">
          <h2 id={idTitre}>Nouveau jeton</h2>
          {valeur === undefined ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void creer();
              }}
            >
              <Champ
                etiquette="Nom"
                type="text"
                value={nom}
                maxLength={200}
                autoComplete="off"
                erreur={erreurNom}
                onChange={(e: { target: { value: string } }) => setNom(e.target.value)}
              />
              <div className="champ">
                <span className="lib-champ" id={nomDuree}>
                  Durée
                </span>
                <div className="segments" role="radiogroup" aria-labelledby={nomDuree}>
                  {DUREES.map((d) => (
                    <label key={d.jours}>
                      <input type="radio" name="duree" checked={duree === d.jours} onChange={() => setDuree(d.jours)} />
                      {d.libelle}
                    </label>
                  ))}
                </div>
              </div>
              <div className="portee-jeton">
                <span className="lib-champ" id={nomPortee}>Portée</span>
                <div className="segments" role="radiogroup" aria-labelledby={nomPortee} aria-describedby={aidePortee}>
                  <label>
                    <input type="radio" name="portee" checked={portee === 'contenu'} disabled={envoi}
                      onChange={() => { setPortee('contenu'); setErreurPortee(undefined); }} />
                    Contenu de l’univers
                  </label>
                  <label>
                    <input type="radio" name="portee" checked={portee === 'outils'} disabled={sansOutil || envoi}
                      onChange={() => { setPortee('outils'); setErreurPortee(undefined); }} />
                    Outils
                  </label>
                </div>
                <div id={aidePortee} className="aide-portee" aria-live="polite">
                  {sansOutil ? <p>Aucun outil de ce système ne reçoit de catalogue par l’API.</p> : (
                    <>
                      {outils.etat === 'chargement' && <p role="status">Chargement…</p>}
                      {outils.etat === 'erreur' && <div>
                        <p role="alert">Impossible de charger les outils.</p>
                        <Bouton petit disabled={envoi} onClick={rechargerOutils}>Réessayer</Bouton>
                      </div>}
                      {portee === 'outils' && <>
                        <p>Un jeton d’outil n’écrit que le catalogue des outils cochés. Il n’ouvre ni fiches ni fichiers.</p>
                        {outils.etat === 'ok' && <div className="outils-portee">
                          {outils.valeur.map((outil) => <Case key={outil.cle}
                            etiquette={`${outil.libelle} · ${outil.module}`} checked={choisis.includes(outil.cle)} disabled={envoi}
                            onChange={(e) => {
                              setChoisis((actuels) => e.target.checked ? [...actuels, outil.cle] : actuels.filter((cle) => cle !== outil.cle));
                              setErreurPortee(undefined);
                            }} />)}
                        </div>}
                        {outils.etat === 'ok' && choisis.length === 0 && <p className="erreur-portee">Cochez au moins un outil.</p>}
                      </>}
                    </>
                  )}
                </div>
                {erreurPortee && <Alerte>{erreurPortee}</Alerte>}
              </div>
              {echec && <Alerte action={echec === 'Connexion perdue. Réessayez.' && (
                <Bouton petit ecrit disabled={envoi || porteeInvalide} onClick={() => void creer()}>Réessayer</Bouton>
              )}>{echec}</Alerte>}
              <div className="boite-actions">
                <Bouton disabled={envoi} onClick={() => onFini(false)}>
                  Annuler
                </Bouton>
                <Bouton variante="principal" type="submit" ecrit disabled={envoi || porteeInvalide}>
                  {envoi ? 'Création…' : 'Créer le jeton'}
                </Bouton>
              </div>
            </form>
          ) : (
            <div className="face-jeton">
              <div>
                <span className="lib">{nomCree}</span>
                <code className="valeur chasse" aria-label="Jeton">
                  {valeur}
                </code>
              </div>
              <p className="unefois">
                <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Il ne sera plus jamais affiché. Rangez-le dans la configuration de votre script.</span>
              </p>
              <div className="boite-actions">
                <Bouton
                  icone={Copy}
                  onClick={() => void copier(valeur).then((ok) => ok && toast('Jeton copié.'))}
                  aria-label="Copier le jeton"
                >
                  Copier
                </Bouton>
                <Bouton variante="principal" data-fermer-jeton onClick={() => onFini(true)}>
                  J’ai copié le jeton
                </Bouton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LigneJeton({ jeton, maintenant, onRevoquer }: { jeton: JetonVue; maintenant: number; onRevoquer: () => void }) {
  const etat = etatJeton(jeton, maintenant);
  const vivant = etat === 'actif' || etat === 'inactif';
  return (
    <li data-jeton={jeton.nom}>
      <div className={`jeton ${vivant ? 'actif' : 'inactif'}`}>
        <span className="ic-ligne" aria-hidden="true">
          <KeyRound size={16} strokeWidth={1.75} />
        </span>
        <span className="corps">
          <span className="nom" title={jeton.nom}>
            {jeton.nom}
          </span>
          <span className="meta">
            <span>
              créé par {jeton.createur} le {dateCourte(jeton.creeLe)}
            </span>
            <span>{dernierUsage(jeton.dernierUsageLe, maintenant)}</span>
            {vivant && <span>expire le {dateCourte(jeton.expireLe)}</span>}
          </span>
          <span className="portee-ligne">Portée : {jeton.outils.length ? jeton.outils.map((outil) => outil.libelle).join(', ') : 'contenu'}</span>
          {etat === 'inactif' && <span className="note-inactif">Son créateur n’est plus MJ de cet univers.</span>}
        </span>
        {etat === 'inactif' && (
          <span title="Son créateur n’est plus MJ de cet univers.">
            <Pastille sens="neutre">Inactif</Pastille>
          </span>
        )}
        {etat === 'revoque' && (
          <Pastille sens="danger" icone={Ban}>
            Révoqué
          </Pastille>
        )}
        {etat === 'expire' && (
          <Pastille sens="neutre" icone={Hourglass}>
            Expiré
          </Pastille>
        )}
        {vivant && (
          <Bouton petit variante="fantome" icone={Ban} ecrit className="revoquer" aria-label={`Révoquer « ${jeton.nom} »`} onClick={onRevoquer}>
            Révoquer
          </Bouton>
        )}
      </div>
    </li>
  );
}

const ICONE_LOT = { en_cours: Loader, clos: Check, abandonne: Ban } as const;

/** Counters of a batch line: the « N refusée(s) » pieces read in the danger colour. */
function colorerRefus(m: string) {
  return m.split(/( · |, )/).map((part, i) => (
    <span key={i} className={/refusé/.test(part) ? 'refus-n' : undefined}>
      {part}
    </span>
  ));
}

function GroupeProbleme({ titre, entrees, autres, sorte, outil }: { titre: string; entrees: EntreeRapport[]; autres: number; sorte: 'refus' | 'avert'; outil?: boolean }) {
  const Icone = sorte === 'refus' ? CircleX : TriangleAlert;
  return (
    <div className="groupe-pb">
      <h3>{titre}</h3>
      <ul>
        {entrees.map((e, i) => (
          <li key={i} className={`probleme ${sorte}`}>
            <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="cle chasse" title={e.cle}>
              {outil && `${e.objet} · `}{e.cle}
            </span>
            <span className="raison">{e.raison}</span>
          </li>
        ))}
        {autres > 0 && <li className="autres">… et {autres.toLocaleString('fr-FR')} autres</li>}
      </ul>
    </div>
  );
}

function LigneLot({ lot }: { lot: LotVue }) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const morceaux = morceauxLot(lot);
  const nbRefus = lot.refus.length + lot.refusAutres;
  const nbAlertes = lot.alertes.length + lot.alertesAutres;
  const depliable = nbRefus > 0 || nbAlertes > 0;
  const contenu = (
    <>
      <span className="chev" aria-hidden="true">
        {depliable && <ChevronRight size={16} strokeWidth={1.75} />}
      </span>
      <span className="corps">
        <span className="lot-ligne1">
          <span className="lot-date">{lot.outil?.libelle ?? dateHeure(lot.ouvertLe)}</span>
          {lot.outil && <span className="lot-ouverture">{dateHeure(lot.ouvertLe)}</span>}
          <span className="lot-jeton">
            <KeyRound size={12} strokeWidth={1.75} aria-hidden="true" />
            {lot.jeton}
          </span>
        </span>
        <span className="compteurs">
          {morceaux.length === 0
            ? 'Rien d’écrit'
            : morceaux.map((m, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {colorerRefus(m)}
                </span>
              ))}
        </span>
      </span>
      <Pastille sens="neutre" icone={ICONE_LOT[lot.etat]}>
        {ETAT_LOT[lot.etat]}
      </Pastille>
    </>
  );
  return (
    <li className={ouvert ? 'ouvert' : undefined}>
      {depliable ? (
        <button type="button" className="lot-tete" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert(!ouvert)}>
          {contenu}
        </button>
      ) : (
        <div className="lot-tete">{contenu}</div>
      )}
      {depliable && ouvert && (
        <div className="lot-detail" id={id}>
          {nbRefus > 0 && <GroupeProbleme titre={lot.outil ? `${nbRefus.toLocaleString('fr-FR')} ${nbRefus > 1 ? 'refusés' : 'refusé'}` : titreGroupe(nbRefus, 'refus')} entrees={lot.refus} autres={lot.refusAutres} sorte="refus" outil={!!lot.outil} />}
          {nbAlertes > 0 && (
            <GroupeProbleme titre={titreGroupe(nbAlertes, 'avertissement')} entrees={lot.alertes} autres={lot.alertesAutres} sorte="avert" outil={!!lot.outil} />
          )}
        </div>
      )}
    </li>
  );
}

/** E-18 Accès par API (GM only): the universe's API tokens and the report of its import batches. */
function AccesApi() {
  const { id } = useParams();
  const [query] = useSearchParams();
  const { mode } = useVue();
  const { toast } = useToasts();
  const base = `/api/univers/${id}`;
  const [univers] = useCharge<UniversListe>(base);
  const [jetonsBrut, rechargerJetons] = useCharge<JetonVue[]>(`${base}/jetons`);
  const [lotsBrut, rechargerLots] = useCharge<LotVue[]>(`${base}/lots`);
  const jetons = useGarde(jetonsBrut);
  const lots = useGarde(lotsBrut);
  const [nouveau, setNouveau] = useState(false);
  const [aRevoquer, setARevoquer] = useState<JetonVue>();
  const [revocation, setRevocation] = useState(false);
  const [echecRevocation, setEchecRevocation] = useState<string>();
  const [maintenant] = useState(() => Date.now());

  const adresse = `${window.location.origin}/api/import/v1/univers/${id}`;

  if (mode === 'joueur' || query.get('mode') === 'joueur') return <PageIntrouvable />;
  if ([univers, jetons, lots].some((c) => c.etat === 'chargement')) return <ChargementListe texte="Chargement de l’accès par API…" />;
  // A player, no role, an unknown universe: the same answer.
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'ok' && univers.valeur.role !== 'mj') return <PageIntrouvable />;
  if (jetons.etat === 'erreur' && jetons.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'erreur' || jetons.etat === 'erreur' || lots.etat === 'erreur') {
    return (
      <ErreurChargement
        page
        onReessayer={() => {
          rechargerJetons();
          rechargerLots();
        }}
      />
    );
  }
  if (univers.etat !== 'ok' || jetons.etat !== 'ok' || lots.etat !== 'ok') return null;

  async function revoquer() {
    if (!aRevoquer || revocation) return;
    setRevocation(true);
    setEchecRevocation(undefined);
    try {
      await appeler('POST', `${base}/jetons/${aRevoquer.id}/revoquer`);
      setARevoquer(undefined);
      rechargerJetons();
      toast('Jeton révoqué.');
    } catch (e) {
      setEchecRevocation(messageEchec(e));
    } finally {
      setRevocation(false);
    }
  }

  return (
    <div className="page-liste page-acces-api">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <KeyRound size={20} strokeWidth={1.75} />
        </span>
        <h1>Accès par API</h1>
      </header>
      <p className="intro">Un jeton permet à un script d’écrire dans cet univers avec vos droits, par l’API d’import.</p>
      <div className="adresse">
        <span className="lib" id="lib-adresse">
          Adresse de base
        </span>
        <div className="copie">
          <code className="valeur chasse" aria-labelledby="lib-adresse">
            {adresse}
          </code>
          <Bouton icone={Copy} aria-label="Copier l’adresse de base" onClick={() => void copier(adresse).then((ok) => ok && toast('Adresse copiée.'))}>
            Copier
          </Bouton>
        </div>
      </div>

      <section className="bloc-api" aria-labelledby="h-jetons">
        <div className="tete-panneau">
          <h2 id="h-jetons">Jetons</h2>
          <Bouton variante="principal" icone={Plus} ecrit aria-haspopup="dialog" onClick={() => setNouveau(true)}>
            Nouveau jeton
          </Bouton>
        </div>
        {jetons.valeur.length > 0 ? (
          <ul className="cadre-liste">
            {jetons.valeur.map((j) => (
              <LigneJeton
                key={j.id}
                jeton={j}
                maintenant={maintenant}
                onRevoquer={() => {
                  setEchecRevocation(undefined);
                  setARevoquer(j);
                }}
              />
            ))}
          </ul>
        ) : (
          <div className="cadre-liste">
            <div className="vide-panneau-api">
              <span className="rond" aria-hidden="true">
                <KeyRound size={20} strokeWidth={1.75} />
              </span>
              <p>Aucun jeton. Créez-en un pour qu’un script écrive dans cet univers.</p>
            </div>
          </div>
        )}
      </section>

      <section className="bloc-api" aria-labelledby="h-lots">
        <div className="tete-panneau">
          <h2 id="h-lots">Lots d’import</h2>
        </div>
        {lots.valeur.length > 0 ? (
          <ul className="cadre-liste">
            {lots.valeur.map((l) => (
              <LigneLot key={l.lotId} lot={l} />
            ))}
          </ul>
        ) : (
          <div className="cadre-liste">
            <div className="vide-panneau-api">
              <p>Aucun lot d’import pour l’instant.</p>
            </div>
          </div>
        )}
      </section>

      {nouveau && (
        <BoiteNouveauJeton
          base={base}
          onFini={(cree) => {
            setNouveau(false);
            if (cree) rechargerJetons();
          }}
        />
      )}
      {aRevoquer && (
        <BoiteDialogue
          titre={`Révoquer « ${aRevoquer.nom} » ?`}
          texte="Le script qui l’utilise ne pourra plus rien écrire."
          action={revocation ? 'Révocation…' : 'Révoquer le jeton'}
          enCours={revocation}
          onConfirmer={() => void revoquer()}
          onFermer={() => {
            if (!revocation) setARevoquer(undefined);
          }}
          reperage={() => document.querySelector<HTMLElement>('main h1')}
        >
          {echecRevocation && <Alerte>{echecRevocation}</Alerte>}
        </BoiteDialogue>
      )}
    </div>
  );
}

export default { chemin: '/univers/:id/acces-api', composant: AccesApi } satisfies Ecran;
