import { ArrowRight, Check, Link2, Plus, Settings2, Trash2, Unlink } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler, lire } from '../api';
import { useCharge, useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Alerte, BoiteDialogue, Bouton, Champ, ChargementListe, ErreurChargement, Onglets, PageIntrouvable, Panneau, useToasts } from '../ui';
import { PanneauTypesUnivers } from './types-reglage/panneau-univers';
import { PanneauOutils } from './outils/panneau';
import { phraseFiches } from './fiche/fenetre-copies';
import './ecrans.css';
import './liste.css';
import './reglages.css';

const NOM_MAX = 80;
const DESCRIPTION_MAX = 500;
const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_MJ = 'Vous ne pouvez plus modifier ces paramètres.';
const AUCUN = 'aucun';
const IDENT_FORME = 'Lettres minuscules, chiffres et tirets, 2 à 40, avec au moins une lettre.';
const IDENT_PRIS = 'Cet identifiant est déjà pris.';
const ECHEC_PARAMETRES = 'Impossible d’enregistrer les paramètres. Réessayez.';

interface SystemeCatalogue {
  id: number;
  nom: string;
}

interface SystemeUnivers extends SystemeCatalogue {
  nbUnivers: number;
}

/** A role removed while the page is open answers 403 on the next write; anything else is generic. */
function messageEchec(e: unknown): string {
  return e instanceof ErreurApi && (e.statut === 403 || e.statut === 404) ? PLUS_MJ : ECHEC;
}

/** E-14 Paramètres de l'univers (GM only): identity, game system attach/detach, create a system. */
function Parametres() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const surOutils = params.get('onglet') === 'outils';
  const surTypes = params.get('onglet') === 'types';
  const { recharger: rechargerUnivers } = useUnivers();
  const { toast } = useToasts();
  const navigate = useNavigate();
  const [univers, rechargerUniv] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [catalogue, rechargerCat] = useCharge<SystemeCatalogue[]>('/api/systemes/catalogue');
  const [mes, rechargerMes] = useCharge<SystemeUnivers[]>('/api/systemes');
  const rechargerCourant = rechargerMes;
  // The universe's own system (AD-94): its `systeme` ref, completed by the visible systems for the count.
  type Courant =
    | { etat: 'chargement' }
    | { etat: 'erreur'; statut?: number }
    | { etat: 'ok'; valeur: SystemeUnivers };
  const courant = useMemo<Courant>(
      () =>
        mes.etat !== 'ok' || univers.etat === 'chargement'
      ? mes.etat === 'erreur' ? mes : { etat: 'chargement' }
      : univers.etat === 'erreur'
        ? { etat: 'erreur', statut: univers.statut }
        : univers.valeur.systeme
          ? {
              etat: 'ok',
              valeur: mes.valeur.find((x) => x.id === univers.valeur.systeme!.id) ?? {
                ...univers.valeur.systeme,
                nbUnivers: 1,
              },
            }
          : { etat: 'erreur', statut: 404 },
      [mes, univers],
    );

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [erreurIdentifiant, setErreurIdentifiant] = useState<string>();
  const [nomVide, setNomVide] = useState(false);
  const [liste, setListe] = useState<SystemeCatalogue[]>([]);
  const [systeme, setSysteme] = useState<SystemeUnivers | null>(null);
  const [choix, setChoix] = useState(AUCUN);
  const [nomSysteme, setNomSysteme] = useState('');
  const [nomSystemeVide, setNomSystemeVide] = useState(false);
  const [nomPris, setNomPris] = useState(false);
  const [echecIdentite, setEchecIdentite] = useState<string>();
  const [echecRattache, setEchecRattache] = useState<string>();
  const [echecCreation, setEchecCreation] = useState<string>();
  // E-14: the window that announces what the detachment does to the copies (B-120); `n` copies, `geste` what it then sends.
  const [detachement, setDetachement] = useState<{ n: number; geste: 'rattacher' | 'creer'; autre: boolean }>();
  const [echecDetachement, setEchecDetachement] = useState<string>();
  const [verification, setVerification] = useState(false);
  const [enCours, setEnCours] = useState<string>();
  const [boiteSuppression, setBoiteSuppression] = useState(false);
  const [nomConfirme, setNomConfirme] = useState('');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [echecSuppression, setEchecSuppression] = useState<string>();

  useEffect(() => {
    if (univers.etat === 'ok') {
      setNom(univers.valeur.nom);
      setDescription(univers.valeur.description);
      setIdentifiant(univers.valeur.cle ?? '');
    }
  }, [univers]);
  useEffect(() => {
    if (catalogue.etat === 'ok') setListe(catalogue.valeur);
  }, [catalogue]);
  useEffect(() => {
    if (courant.etat === 'ok') {
      setSysteme(courant.valeur);
      setChoix(String(courant.valeur.id));
    } else if (courant.etat === 'erreur' && courant.statut === 404) {
      setSysteme(null);
      setChoix(AUCUN);
    }
  }, [courant]);

  const etats = [univers, catalogue, courant];
  if (etats.some((e) => e.etat === 'chargement')) return <ChargementListe texte="Chargement des paramètres…" />;
  // A player, no role, or an unknown universe: the same answer. (No system is a 404 of its own.)
  if (surOutils && params.get('mode') === 'joueur') return <PageIntrouvable />;
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'ok' && univers.valeur.role !== 'mj') return <PageIntrouvable />;
  if (catalogue.etat === 'erreur' && catalogue.statut === 403) return <PageIntrouvable />;
  const courantEnErreur = courant.etat === 'erreur' && courant.statut !== 404;
  if (univers.etat === 'erreur' || catalogue.etat === 'erreur' || courantEnErreur) {
    return (
      <ErreurChargement
        onReessayer={() => {
          rechargerUniv();
          rechargerCat();
          rechargerCourant();
        }}
      />
    );
  }

  const base = `/api/univers/${id}`;

  async function ecrire(cle: string, action: () => Promise<void>, enEchec: (m: string) => void): Promise<boolean> {
    if (enCours) return false;
    setEnCours(cle);
    try {
      await action();
      return true;
    } catch (e) {
      enEchec(messageEchec(e));
      return false;
    } finally {
      setEnCours(undefined);
    }
  }

  async function relire() {
    try {
      const u = await appeler<UniversListe>('GET', base);
      const l = await appeler<SystemeUnivers[]>('GET', '/api/systemes');
      const ref = u.systeme;
      setSysteme(ref ? (l.find((x) => x.id === ref.id) ?? { ...ref, nbUnivers: 1 }) : null);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setSysteme(null);
      else throw e;
    }
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEchecIdentite(undefined);
    setErreurIdentifiant(undefined);
    if (nom.trim() === '') return setNomVide(true);
    if (nom.length > NOM_MAX || description.length > DESCRIPTION_MAX) return;
    const cleActuelle = univers.etat === 'ok' ? univers.valeur.cle : undefined;
    const nouvelle = identifiant.trim();
    const changee = cleActuelle !== undefined && nouvelle !== cleActuelle;
    let refuse = false;
    let cleEcrite: string | undefined;
    const ok = await ecrire(
      'identite',
      async () => {
        try {
          // An unchanged identifier is not sent; a refused one saves nothing (the name stays unsaved).
          await appeler('PATCH', base, changee ? { nom, description, cle: nouvelle } : { nom, description });
          if (changee) cleEcrite = nouvelle;
        } catch (err) {
          if (changee && err instanceof ErreurApi && err.statut === 409 && err.code === 'cle_prise') {
            refuse = true;
            return setErreurIdentifiant(IDENT_PRIS);
          }
          if (changee && err instanceof ErreurApi && err.statut === 400 && err.details?.champ === 'cle') {
            refuse = true;
            return setErreurIdentifiant(IDENT_FORME);
          }
          throw err;
        }
        rechargerUnivers();
      },
      (m) => setEchecIdentite(m === ECHEC ? ECHEC_PARAMETRES : m),
    );
    if (refuse) {
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.parametres-univers input[aria-invalid="true"]')?.focus());
      return;
    }
    if (ok) {
      setNomVide(false);
      toast('Enregistré.');
      // The address of the whole screen is replaced; the former identifier keeps leading here.
      if (cleEcrite) navigate(`/univers/${cleEcrite}/parametres${window.location.search}`, { replace: true });
    }
  }

  /**
   * E-14: an attached universe that leaves its system, or takes another, asks first when it holds copies (B-120). The count is
   * read again here, never trusted from the first read of the page; if it cannot be read nothing is sent.
   */
  async function verifierCopies(geste: 'rattacher' | 'creer', enEchec: (m: string) => void, apres: () => Promise<void>) {
    if (verification) return;
    setVerification(true);
    try {
      const u = await lire<UniversListe>(base);
      const n = u.systeme?.personnalisees ?? 0;
      if (n > 0) {
        setEchecDetachement(undefined);
        setDetachement({ n, geste, autre: geste === 'creer' || choix !== AUCUN });
        return;
      }
    } catch {
      enEchec('Impossible de vérifier les copies. Rien n’a été envoyé.');
      return;
    } finally {
      setVerification(false);
    }
    await apres();
  }

  /** The attach itself: the PUT, the reread and the toast. */
  async function corpsRattacher() {
    const avant = systeme?.nom;
    await appeler('PUT', `${base}/systeme`, { systemeId: choix === AUCUN ? null : Number(choix) });
    await relire();
    toast(choix === AUCUN ? (avant ? `« ${avant} » détaché` : 'Aucun système rattaché') : `« ${liste.find((x) => String(x.id) === choix)?.nom ?? ''} » rattaché`);
  }

  async function envoyerRattacher() {
    setEchecRattache(undefined);
    await ecrire('rattache', corpsRattacher, setEchecRattache);
  }

  function rattacher() {
    setEchecRattache(undefined);
    // No window for an unattached universe, nor for the same system chosen again: the gesture of today.
    if (!systeme || choix === String(systeme.id)) return void envoyerRattacher();
    void verifierCopies('rattacher', setEchecRattache, envoyerRattacher);
  }

  /** The creation of a system and its attach; true when the name is already taken (nothing was created). */
  async function corpsCreer(): Promise<boolean> {
    try {
      const s = await appeler<SystemeCatalogue>('POST', `${base}/systeme-nouveau`, { nom: nomSysteme });
      setListe((l) => [...l, s].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })));
      setChoix(String(s.id));
      await relire();
      toast(`« ${nomSysteme} » créé et rattaché`);
      setNomSysteme('');
      setNomSystemeVide(false);
      return false;
    } catch (err) {
      if (err instanceof ErreurApi && err.statut === 409) {
        setNomPris(true);
        return true;
      }
      throw err;
    }
  }

  async function envoyerCreer() {
    setEchecCreation(undefined);
    await ecrire('creation', async () => void (await corpsCreer()), setEchecCreation);
  }

  function creer(e: FormEvent) {
    e.preventDefault();
    setEchecCreation(undefined);
    setNomPris(false);
    if (nomSysteme.trim() === '') return setNomSystemeVide(true);
    if (nomSysteme.length > NOM_MAX) return;
    if (!systeme) return void envoyerCreer();
    void verifierCopies('creer', setEchecCreation, envoyerCreer);
  }

  async function confirmerDetachement() {
    if (!detachement) return;
    setEchecDetachement(undefined);
    const geste = detachement.geste;
    // A name already taken on the creation: nothing was created, the window closes and the field says it.
    const ok = await ecrire(
      'detachement',
      async () => {
        if (geste === 'rattacher') await corpsRattacher();
        else await corpsCreer();
      },
      (m) => {
        if (m === PLUS_MJ) {
          setDetachement(undefined);
          setEchecRattache('Vous ne pouvez plus modifier cet univers.');
        } else setEchecDetachement(m);
      },
    );
    if (ok) setDetachement(undefined);
  }

  const nomUnivers = univers.etat === 'ok' ? univers.valeur.nom : '';

  function fermerSuppression() {
    if (suppressionEnCours) return;
    setBoiteSuppression(false);
    setNomConfirme('');
    setEchecSuppression(undefined);
  }

  // The server compares the name again (AD-119 (5)); the field only keeps the button inactive until it matches.
  async function supprimer() {
    if (suppressionEnCours || nomConfirme !== nomUnivers) return;
    setSuppressionEnCours(true);
    setEchecSuppression(undefined);
    try {
      await appeler('DELETE', base, { nom: nomConfirme });
    } catch (e) {
      setSuppressionEnCours(false);
      setEchecSuppression(
        e instanceof ErreurApi && e.code === 'nom_different' ? 'Le nom ne correspond pas.' : ECHEC,
      );
      return;
    }
    rechargerUnivers();
    navigate('/');
    toast('Univers supprimé.');
  }

  const erreurNom = nom.length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : nomVide && nom.trim() === '' ? 'le nom est obligatoire.' : undefined;
  const erreurDescription = description.length > DESCRIPTION_MAX ? `${DESCRIPTION_MAX} caractères au plus.` : undefined;
  const erreurNomSysteme =
    nomSysteme.length > NOM_MAX
      ? `${NOM_MAX} caractères au plus.`
      : nomSystemeVide && nomSysteme.trim() === ''
        ? 'le nom est obligatoire.'
        : undefined;
  const inchange =
    univers.etat === 'ok' &&
    nom === univers.valeur.nom &&
    description === univers.valeur.description &&
    identifiant.trim() === (univers.valeur.cle ?? '');
  const saisie = (set: (v: string) => void, avant?: () => void) => (e: { target: { value: string } }) => {
    avant?.();
    set(e.target.value);
  };

  return (
    <div className="page-liste page-parametres parametres-univers">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Settings2 size={20} strokeWidth={1.75} />
        </span>
        <h1>Paramètres de l’univers</h1>
      </header>
      <Onglets
        etiquette="Paramètres de l’univers"
        actif={surOutils ? 'outils' : surTypes ? 'types' : 'general'}
        onglets={[{ id: 'general', libelle: 'Général' }, { id: 'types', libelle: 'Types de fiche' }, { id: 'outils', libelle: 'Outils' }]}
        onChange={(v) => setParams(v === 'general' ? {} : { onglet: v }, { replace: true })}
      />
      {surOutils && <div role="tabpanel"><PanneauOutils key={`${id}-${systeme?.id ?? 'sans'}`} id={id!} niveau="univers" sansSysteme={systeme === null} /></div>}
      {surTypes && <div role="tabpanel"><PanneauTypesUnivers universId={id!} universNom={nomUnivers} avecSysteme={systeme !== null} /></div>}
      {!surOutils && !surTypes && <div className="panneaux-suivi">
        <Panneau titre="Identité" reserveMj>
          {echecIdentite && (
            <div className="echec" role="alert">
              {echecIdentite}
            </div>
          )}
          <form onSubmit={enregistrer} noValidate>
            <Champ etiquette="Nom" value={nom} erreur={erreurNom} onChange={saisie(setNom)} />
            <Champ
              etiquette="Identifiant"
              value={identifiant}
              erreur={erreurIdentifiant}
              readOnly={enCours === 'identite'}
              autoComplete="off"
              spellCheck={false}
              style={{ fontFamily: 'var(--police-code)' }}
              onChange={saisie(setIdentifiant, () => setErreurIdentifiant(undefined))}
            />
            <p className="aide-champ">
              Il sert d’adresse : /univers/{identifiant.trim() || (univers.etat === 'ok' ? univers.valeur.cle : '')}. L’ancien identifiant continue de mener à l’univers.
            </p>
            <Champ etiquette="Description" zone rows={4} value={description} erreur={erreurDescription} onChange={saisie(setDescription)} />
            <div className="actions">
              <Bouton type="submit" variante="principal" ecrit icone={Check} enCours={enCours === 'identite'} disabled={inchange}>
                Enregistrer
              </Bouton>
            </div>
          </form>
        </Panneau>

        <Panneau titre="Système de jeu" reserveMj>
          {echecRattache && (
            <div className="echec" role="alert">
              {echecRattache}
            </div>
          )}
          {liste.length === 0 && <p>Le catalogue est vide. Créez le premier système ci-dessous.</p>}
          <div className="formulaire-ligne">
            <Champ etiquette="Système du catalogue" liste value={choix} onChange={(e: { target: { value: string } }) => setChoix(e.target.value)}>
              <option value={AUCUN}>Aucun système</option>
              {liste.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </Champ>
            <Bouton variante="principal" ecrit icone={Link2} enCours={enCours === 'rattache' || verification} onClick={rattacher}>
              Rattacher
            </Bouton>
          </div>
          {systeme ? (
            <div className="systeme-courant">
              <strong className="nom-systeme" title={systeme.nom}>
                {systeme.nom}
              </strong>
              <span>Utilisé par {systeme.nbUnivers} univers</span>
              <Link className="bouton neutre" to={`/systemes/${systeme.id}`}>
                Ouvrir le système
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <p>Cet univers n’est rattaché à aucun système de jeu.</p>
          )}
        </Panneau>

        <Panneau titre="Créer un système" reserveMj>
          {echecCreation && (
            <div className="echec" role="alert">
              {echecCreation}
            </div>
          )}
          <form onSubmit={creer} noValidate>
            <Champ etiquette="Nom du système" value={nomSysteme} erreur={erreurNomSysteme} onChange={saisie(setNomSysteme, () => setNomPris(false))} />
            {nomPris && <div className="erreur-champ">Un système porte déjà ce nom.</div>}
            <div className="actions">
              <Bouton type="submit" icone={Plus} ecrit enCours={enCours === 'creation'}>
                Créer et rattacher
              </Bouton>
            </div>
          </form>
        </Panneau>

        <PanneauTypesUnivers universId={id!} universNom={nomUnivers} avecSysteme={systeme !== null} />

        <Panneau titre="Supprimer l’univers" reserveMj danger>
          <div className="actions">
            <Bouton variante="danger" icone={Trash2} aria-haspopup="dialog" onClick={() => setBoiteSuppression(true)}>
              Supprimer l’univers
            </Bouton>
          </div>
        </Panneau>
      </div>}
      {detachement && systeme && (
        <BoiteDialogue
          titre={detachement.autre ? 'Changer de système ?' : `Détacher cet univers de « ${systeme.nom} » ?`}
          texte={phraseFiches(detachement.n)}
          action={detachement.autre ? 'Changer de système' : 'Détacher'}
          libelleEnCours="Envoi…"
          icone={Unlink}
          enCours={enCours === 'detachement'}
          onConfirmer={() => void confirmerDetachement()}
          onFermer={() => { if (enCours !== 'detachement') setDetachement(undefined); }}
        >
          {echecDetachement && <Alerte>{echecDetachement}</Alerte>}
        </BoiteDialogue>
      )}
      {boiteSuppression && (
        <BoiteDialogue
          titre={`Supprimer « ${nomUnivers} » ?`}
          texte="Tout son contenu — fiches, sections, fichiers de la médiathèque, campagnes, cartes, jetons — sera effacé, pour tous ses membres. Le système de jeu reste."
          action="Supprimer l’univers"
          iconeAction={Trash2}
          libelleEnCours="Suppression…"
          enCours={suppressionEnCours}
          desactive={nomConfirme !== nomUnivers}
          onConfirmer={() => void supprimer()}
          onFermer={fermerSuppression}
        >
          {echecSuppression && (
            <div className="echec" role="alert">
              {echecSuppression}
            </div>
          )}
          <Champ
            etiquette="Tapez le nom de l’univers pour confirmer"
            value={nomConfirme}
            autoComplete="off"
            onChange={(e: { target: { value: string } }) => setNomConfirme(e.target.value)}
          />
        </BoiteDialogue>
      )}
    </div>
  );
}

export default { chemin: '/univers/:id/parametres', composant: Parametres } satisfies Ecran;
