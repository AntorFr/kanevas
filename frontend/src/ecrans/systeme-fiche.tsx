import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ErreurApi, appeler, lire } from '../api';
import { useTitreAriane } from '../cadre-contexte';
import type { Ecran } from '../registre';
import { Bouton, BoiteDialogue, Champ, ErreurChargement, PageIntrouvable, Pastille, SqueletteFiche, useToasts } from '../ui';
import { Eye } from 'lucide-react';
import { iconeDeNom } from '../types-contexte';
import type { FicheVue } from './fiche/types';
import { SectionEspace } from './systeme/section-espace';
import './ecrans.css';
import './fiche/fiche.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

interface Entete {
  nom: string;
  peutEcrire: boolean;
  mots: { type: string; singulier: string; icone: string }[];
}

type Etat = { k: 'chargement' } | { k: 'erreur' } | { k: 'introuvable' } | { k: 'ok'; fiche: FicheVue; entete: Entete };

/**
 * E-9 of a system's space (`/systemes/:sid/fiches/:fid`, AD-157): an element is read by who reads the system and written
 * only by a GM of it — title, sections, removal. A section reserved to the GMs of the system is absent for a reader.
 */
function FicheEspace() {
  const { sid, fid } = useParams();
  const navigate = useNavigate();
  const { toast } = useToasts();
  const base = `/api/systemes/${sid}/fiches/${fid}`;
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [titre, setTitre] = useState<string>();
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [titreSection, setTitreSection] = useState<string>();
  const [erreurSection, setErreurSection] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [supprimer, setSupprimer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const fiche = etat.k === 'ok' ? etat.fiche : undefined;
  useTitreAriane(fiche?.titre, etat.k === 'ok' ? etat.entete.nom : undefined);

  const lireTout = useCallback(async (): Promise<Etat> => {
    try {
      const [f, s] = await Promise.all([lire<FicheVue>(base), lire<Entete>(`/api/systemes/${sid}`)]);
      return { k: 'ok', fiche: f, entete: s };
    } catch (e) {
      return e instanceof ErreurApi && e.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' };
    }
  }, [base, sid]);

  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    void lireTout().then((e) => actif && setEtat(e));
    return () => {
      actif = false;
    };
  }, [lireTout, essai]);

  const rafraichir = useCallback(async () => {
    const e = await lireTout();
    if (e.k === 'ok') setEtat(e);
  }, [lireTout]);

  if (etat.k === 'introuvable') return <PageIntrouvable retour="systemes" />;
  if (etat.k === 'erreur') return <ErreurChargement texte="Impossible de charger cet élément." onReessayer={() => setEssai((n) => n + 1)} />;
  if (etat.k === 'chargement' || !fiche) return <SqueletteFiche cadre />;

  const { entete } = etat;
  const ecrit = entete.peutEcrire;
  const type = entete.mots.find((t) => t.type === fiche.type);
  const Icone = iconeDeNom(type?.icone);

  async function ecrire(action: () => Promise<void>) {
    if (enCours) return false;
    setEnCours(true);
    setEchec(undefined);
    try {
      await action();
      return true;
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) setEtat({ k: 'introuvable' });
      else setEchec(e instanceof ErreurApi && e.statut === 403 ? 'Vous ne pouvez plus modifier ce système.' : ECHEC);
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function renommer(e: FormEvent) {
    e.preventDefault();
    const t = (titre ?? '').trim();
    if (t === '') return setErreurTitre('le titre est obligatoire.');
    if (t.length > 120) return setErreurTitre('120 caractères au plus.');
    if (await ecrire(async () => { await appeler('PATCH', base, { titre: t }); await rafraichir(); })) {
      setTitre(undefined);
      setErreurTitre(undefined);
      toast('Élément renommé.');
    }
  }

  async function ajouterSection(e: FormEvent) {
    e.preventDefault();
    const t = (titreSection ?? '').trim();
    if (t === '') return setErreurSection('le titre est obligatoire.');
    if (t.length > 80) return setErreurSection('80 caractères au plus.');
    if (await ecrire(async () => { await appeler('POST', `${base}/sections`, { titre: t }); await rafraichir(); })) {
      setTitreSection(undefined);
      setErreurSection(undefined);
      toast(`Section « ${t} » ajoutée — fermée aux joueurs`);
    }
  }

  async function retirer() {
    await ecrire(async () => {
      await appeler('DELETE', base);
      navigate(`/systemes/${sid}`);
      toast('Élément supprimé.');
    });
  }

  return (
    <article className="fiche" aria-labelledby="titre-fiche">
      <p className="sous-sys">
        <Link to={`/systemes/${sid}`}>{entete.nom}</Link>
        {type && <Pastille sens="neutre" icone={Icone}>{type.singulier}</Pastille>}
        {!ecrit && <Pastille sens="neutre" icone={Eye}>Lecture seule</Pastille>}
      </p>
      <h1 id="titre-fiche" tabIndex={-1}>{fiche.titre}</h1>
      {ecrit && (
        <div className="boutons">
          {titre === undefined ? (
            <Bouton ecrit onClick={() => setTitre(fiche.titre)}>Renommer</Bouton>
          ) : (
            <form onSubmit={renommer} noValidate onKeyDown={(e) => e.key === 'Escape' && setTitre(undefined)}>
              <Champ etiquette="Titre de l’élément" value={titre} autoFocus autoComplete="off" erreur={erreurTitre}
                onChange={(e: { target: { value: string } }) => setTitre(e.target.value)} />
              <div className="boutons">
                <Bouton onClick={() => { setTitre(undefined); setErreurTitre(undefined); }}>Annuler</Bouton>
                <Bouton type="submit" variante="principal" ecrit enCours={enCours}>Renommer</Bouton>
              </div>
            </form>
          )}
          <Bouton ecrit icone={Trash2} onClick={() => setSupprimer(true)}>Supprimer l’élément</Bouton>
        </div>
      )}
      {echec && <div className="alerte echec" role="alert"><span>{echec}</span></div>}
      {fiche.sections.length === 0 ? (
        <div className="etat vide-fiche"><p>{ecrit ? 'Cet élément n’a pas encore de section.' : 'Aucune section.'}</p></div>
      ) : (
        <div className="sections">
          {fiche.sections.map((s) => (
            <SectionEspace key={s.id} base={base} section={s} ecrit={ecrit} rafraichir={rafraichir} />
          ))}
        </div>
      )}
      {ecrit && (
        <div className={`ajout-section${titreSection !== undefined ? ' ouvert' : ''}`}>
          {titreSection === undefined ? (
            <button type="button" onClick={() => setTitreSection('')}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Ajouter une section
              <small>Elle naît vide et fermée aux joueurs.</small>
            </button>
          ) : (
            <form onSubmit={ajouterSection} noValidate onKeyDown={(e) => e.key === 'Escape' && setTitreSection(undefined)}>
              <Champ etiquette="Titre de la section" value={titreSection} autoFocus autoComplete="off" erreur={erreurSection}
                onChange={(e: { target: { value: string } }) => setTitreSection(e.target.value)} />
              <div className="boutons">
                <Bouton onClick={() => { setTitreSection(undefined); setErreurSection(undefined); }}>Annuler</Bouton>
                <Bouton type="submit" variante="principal" ecrit enCours={enCours}>Ajouter la section</Bouton>
              </div>
            </form>
          )}
        </div>
      )}
      {supprimer && (
        <BoiteDialogue
          titre={`Supprimer « ${fiche.titre} » ?`}
          texte="L’élément et ses sections disparaîtront de ce système et de tous les univers qui l’utilisent."
          action="Supprimer l’élément"
          enCours={enCours}
          onConfirmer={() => void retirer()}
          onFermer={() => setSupprimer(false)}
          reperage={() => document.querySelector<HTMLElement>('main h1')}
        />
      )}
    </article>
  );
}

export default { chemin: '/systemes/:sid/fiches/:fid', composant: FicheEspace } satisfies Ecran;
