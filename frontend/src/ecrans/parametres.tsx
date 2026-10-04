import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErreurApi, appeler } from '../api';
import { useCharge, useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ErreurChargement, PageIntrouvable, Panneau } from '../ui';
import './ecrans.css';

const NOM_MAX = 80;
const DESCRIPTION_MAX = 500;
const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_MJ = 'Vous ne pouvez plus modifier ces paramètres.';
const AUCUN = 'aucun';

interface SystemeCatalogue {
  id: number;
  nom: string;
}

interface SystemeUnivers extends SystemeCatalogue {
  universUtilisateurs: number;
}

/** A role removed while the page is open answers 403 on the next write; anything else is generic. */
function messageEchec(e: unknown): string {
  return e instanceof ErreurApi && (e.statut === 403 || e.statut === 404) ? PLUS_MJ : ECHEC;
}

/** E-14 Paramètres de l'univers (GM only): identity, game system attach/detach, create a system. */
function Parametres() {
  const { id } = useParams();
  const { recharger: rechargerUnivers } = useUnivers();
  const [univers, rechargerUniv] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [catalogue, rechargerCat] = useCharge<SystemeCatalogue[]>('/api/systemes');
  const [courant, rechargerCourant] = useCharge<SystemeUnivers>(`/api/univers/${id}/systeme`);

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [nomVide, setNomVide] = useState(false);
  const [liste, setListe] = useState<SystemeCatalogue[]>([]);
  const [systeme, setSysteme] = useState<SystemeUnivers | null>(null);
  const [choix, setChoix] = useState(AUCUN);
  const [nomSysteme, setNomSysteme] = useState('');
  const [nomSystemeVide, setNomSystemeVide] = useState(false);
  const [nomPris, setNomPris] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [echecIdentite, setEchecIdentite] = useState<string>();
  const [echecRattache, setEchecRattache] = useState<string>();
  const [echecCreation, setEchecCreation] = useState<string>();
  const [enCours, setEnCours] = useState<string>();

  useEffect(() => {
    if (univers.etat === 'ok') {
      setNom(univers.valeur.nom);
      setDescription(univers.valeur.description);
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
  if (etats.some((e) => e.etat === 'chargement')) return <Chargement texte="Chargement des paramètres…" />;
  // A player, no role, or an unknown universe: the same answer. (No system is a 404 of its own.)
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
      setSysteme(await appeler<SystemeUnivers>('GET', `${base}/systeme`));
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setSysteme(null);
      else throw e;
    }
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnregistre(false);
    setEchecIdentite(undefined);
    if (nom.trim() === '') return setNomVide(true);
    if (nom.length > NOM_MAX || description.length > DESCRIPTION_MAX) return;
    const ok = await ecrire(
      'identite',
      async () => {
        await appeler('PATCH', base, { nom, description });
        rechargerUnivers();
      },
      setEchecIdentite,
    );
    if (ok) {
      setNomVide(false);
      setEnregistre(true);
    }
  }

  async function rattacher() {
    setEchecRattache(undefined);
    await ecrire(
      'rattache',
      async () => {
        await appeler('PUT', `${base}/systeme`, { systemeId: choix === AUCUN ? null : Number(choix) });
        await relire();
      },
      setEchecRattache,
    );
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    setEchecCreation(undefined);
    setNomPris(false);
    if (nomSysteme.trim() === '') return setNomSystemeVide(true);
    if (nomSysteme.length > NOM_MAX) return;
    let pris = false;
    const ok = await ecrire(
      'creation',
      async () => {
        try {
          const s = await appeler<SystemeCatalogue>('POST', `${base}/systeme-nouveau`, { nom: nomSysteme });
          setListe((l) => [...l, s].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })));
          setChoix(String(s.id));
          await relire();
        } catch (err) {
          if (err instanceof ErreurApi && err.statut === 409) {
            pris = true;
            setNomPris(true);
            return;
          }
          throw err;
        }
      },
      setEchecCreation,
    );
    if (ok && !pris) {
      setNomSysteme('');
      setNomSystemeVide(false);
    }
  }

  const erreurNom = nom.length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : nomVide && nom.trim() === '' ? 'le nom est obligatoire.' : undefined;
  const erreurDescription = description.length > DESCRIPTION_MAX ? `${DESCRIPTION_MAX} caractères au plus.` : undefined;
  const erreurNomSysteme =
    nomSysteme.length > NOM_MAX
      ? `${NOM_MAX} caractères au plus.`
      : nomSystemeVide && nomSysteme.trim() === ''
        ? 'le nom est obligatoire.'
        : undefined;
  const saisie = (set: (v: string) => void, avant?: () => void) => (e: { target: { value: string } }) => {
    avant?.();
    set(e.target.value);
  };

  return (
    <>
      <h1>Paramètres de l’univers</h1>
      {enregistre && (
        <div className="enregistre" role="status">
          Enregistré.
        </div>
      )}
      <Panneau titre="Identité" reserveMj>
        {echecIdentite && (
          <div className="echec" role="alert">
            {echecIdentite}
          </div>
        )}
        <form onSubmit={enregistrer} noValidate>
          <Champ etiquette="Nom" value={nom} erreur={erreurNom} onChange={saisie(setNom, () => setEnregistre(false))} />
          <Champ
            etiquette="Description"
            zone
            rows={4}
            value={description}
            erreur={erreurDescription}
            onChange={saisie(setDescription, () => setEnregistre(false))}
          />
          <div className="actions">
            <Bouton type="submit" variante="principal" ecrit enCours={enCours === 'identite'}>
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
        <label className="champ">
          <span>Système du catalogue</span>
          <select value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value={AUCUN}>Aucun système</option>
            {liste.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <Bouton variante="principal" ecrit enCours={enCours === 'rattache'} onClick={rattacher}>
            Rattacher
          </Bouton>
        </div>
        {systeme ? (
          <div className="systeme-courant">
            <strong className="nom-systeme" title={systeme.nom}>
              {systeme.nom}
            </strong>
            <span>
              Utilisé par {systeme.universUtilisateurs} univers
            </span>
            <Link className="bouton neutre" to={`/univers/${id}/systeme`}>
              Ouvrir le système
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
          <Champ
            etiquette="Nom du système"
            value={nomSysteme}
            erreur={erreurNomSysteme}
            onChange={saisie(setNomSysteme, () => setNomPris(false))}
          />
          {nomPris && <div className="erreur-champ">Un système porte déjà ce nom.</div>}
          <div className="actions">
            <Bouton type="submit" ecrit enCours={enCours === 'creation'}>
              Créer et rattacher
            </Bouton>
          </div>
        </form>
      </Panneau>
    </>
  );
}

export default { chemin: '/univers/:id/parametres', composant: Parametres } satisfies Ecran;
