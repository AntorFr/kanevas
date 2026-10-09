import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FileText, Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../api';
import { useBasculeMode, useCharge, useTitreAriane } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { Role, UniversListe } from '../types';
import { Bouton, Champ, ErreurChargement, PageIntrouvable, SqueletteFiche, useToasts } from '../ui';
import './ecrans.css';
import './fiche/fiche.css';
import { PanneauSection, type Joueur } from './fiche/section';
import type { FicheVue } from './fiche/types';
import { lignesDuType } from './fiche/lignes/registre';
import { badgeFiche, iconeDuType, typeParType } from './fiche/types-fiche';
import { EnteteFiche, type MessageIllustration } from './fiche/entete';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

type Etat =
  | { k: 'chargement' }
  | { k: 'erreur' }
  | { k: 'introuvable' }
  | { k: 'aucune-visible'; fiche: FicheVue }
  | { k: 'ok'; fiche: FicheVue };

/** E-9 Fiche: title, type badge, then the sections the caller may read (AD-39, AD-58, AD-59). */
function PageFiche() {
  const { id, fid } = useParams();
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [echec, setEchec] = useState<string>();
  const [titreSection, setTitreSection] = useState('');
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [messageIll, setMessageIll] = useState<MessageIllustration>();
  // The server refused an illustration write (403): the account is no longer GM of this universe.
  const [roleRetire, setRoleRetire] = useState(false);

  useEffect(() => {
    setMessageIll(undefined);
    setRoleRetire(false);
  }, [id, fid]);

  const role: Role | undefined = univers.etat === 'ok' ? (roleRetire ? 'joueur' : univers.valeur.role) : undefined;
  // The GM / player toggle lives in the frame's top bar; it is offered unless the sheet does not exist.
  const mode = useBasculeMode(role === 'mj' && etat.k !== 'introuvable');
  const ficheVue = etat.k === 'ok' || etat.k === 'aucune-visible' ? etat.fiche : undefined;
  useTitreAriane(ficheVue?.titre, ficheVue && typeParType(ficheVue.type)?.pluriel);
  const modeEffectif: 'mj' | 'joueur' = role === 'mj' ? mode : 'joueur';
  const suffixe = role === 'mj' && mode === 'joueur' ? '?mode=joueur' : '';
  const base = `/api/univers/${id}/fiches/${fid}`;

  const charger = useCallback(async (): Promise<Etat> => {
    try {
      return { k: 'ok', fiche: await lire<FicheVue>(`${base}${suffixe}`) };
    } catch (e) {
      if (!(e instanceof ErreurApi) || e.statut !== 404) return { k: 'erreur' };
      if (suffixe === '') return { k: 'introuvable' };
      // Player mode: nothing readable by players, or no such sheet? Ask in GM mode.
      try {
        return { k: 'aucune-visible', fiche: await lire<FicheVue>(base) };
      } catch (e2) {
        return e2 instanceof ErreurApi && e2.statut === 404 ? { k: 'introuvable' } : { k: 'erreur' };
      }
    }
  }, [base, suffixe]);

  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    charger().then((e) => actif && setEtat(e));
    return () => {
      actif = false;
    };
  }, [charger, essai]);

  // The authors a GM may pick: the players of the universe.
  useEffect(() => {
    if (role !== 'mj') return;
    let actif = true;
    lire<(Joueur & { role: Role })[]>(`/api/univers/${id}/membres`).then(
      (m) => actif && setJoueurs(m.filter((x) => x.role === 'joueur')),
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [id, role]);

  /** Silent refetch after a write: the sections stay mounted, edits in progress are kept. */
  const rafraichir = useCallback(async () => {
    const e = await charger();
    if (e.k === 'ok' || e.k === 'aucune-visible') setEtat(e);
  }, [charger]);

  // The assistant wrote into this sheet (« Ouvrir la section » from its panel): read it again.
  useEffect(() => {
    const relire = () => void rafraichir();
    window.addEventListener('kanevas:fiche-ecrite', relire);
    return () => window.removeEventListener('kanevas:fiche-ecrite', relire);
  }, [rafraichir]);

  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (etat.k === 'introuvable') return <PageIntrouvable />;
  if (etat.k === 'chargement' || univers.etat === 'chargement') return <SqueletteFiche cadre />;
  if (etat.k === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger cette fiche." onReessayer={() => setEssai((n) => n + 1)} />;
  }

  const mj = role === 'mj';
  const fiche = etat.fiche;
  const sections = etat.k === 'ok' ? fiche.sections : [];
  const gestion = mj && modeEffectif === 'mj';

  async function ordonner(index: number, delta: number) {
    const ids = sections.map((s) => s.id);
    const autre = index + delta;
    [ids[index], ids[autre]] = [ids[autre]!, ids[index]!];
    await appeler('PUT', `${base}/ordre`, { ids });
    await rafraichir();
  }

  function fermerAjout() {
    setAjoutOuvert(false);
    setTitreSection('');
    setErreurTitre(undefined);
  }

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (ajoutEnCours) return;
    const t = titreSection.trim();
    if (t === '') return setErreurTitre('le titre est obligatoire.');
    if (t.length > 80) return setErreurTitre('80 caractères au plus.');
    setErreurTitre(undefined);
    setEchec(undefined);
    setAjoutEnCours(true);
    try {
      await appeler('POST', `${base}/sections`, { titre: t });
      fermerAjout();
      await rafraichir();
      toast(`Section « ${t} » ajoutée — fermée aux joueurs`);
    } catch {
      setEchec(ECHEC);
    } finally {
      setAjoutEnCours(false);
    }
  }

  const Icone = iconeDuType(fiche.type);
  const formulaire = gestion && etat.k === 'ok' && ajoutOuvert;
  return (
    <article className="fiche" aria-labelledby="titre-fiche">
      <EnteteFiche
        universId={id!}
        fiche={fiche}
        gestion={gestion && etat.k === 'ok'}
        badge={badgeFiche(fiche)}
        Icone={Icone}
        message={messageIll}
        setMessage={setMessageIll}
        rafraichir={rafraichir}
        onDroitPerdu={() => {
          setRoleRetire(true);
          void rafraichir();
        }}
      />
      {lignesDuType(fiche.type).map((l, i) => (
        <l.composant key={i} universId={id!} fiche={fiche} />
      ))}
      {echec && (
        <div className="alerte echec" role="alert">
          <span>{echec}</span>
        </div>
      )}
      {etat.k === 'aucune-visible' ? (
        <div className="etat">Aucune section n’est visible des joueurs.</div>
      ) : sections.length === 0 ? (
        <div className="etat vide-fiche">
          <FileText size={24} strokeWidth={1.5} aria-hidden="true" />
          <p>{gestion ? 'Cette fiche n’a pas encore de section.' : 'Aucune section.'}</p>
          {gestion && !ajoutOuvert && (
            <Bouton variante="principal" ecrit icone={Plus} onClick={() => setAjoutOuvert(true)}>
              Ajouter une section
            </Bouton>
          )}
        </div>
      ) : (
        <div className="sections">
          {sections.map((s, i) => (
            <PanneauSection
              key={s.id}
              universId={id!}
              fiche={fiche}
              section={s}
              role={modeEffectif}
              suffixeMode={suffixe}
              joueurs={joueurs}
              premiere={i === 0}
              derniere={i === sections.length - 1}
              rafraichir={rafraichir}
              onMonter={() => ordonner(i, -1)}
              onDescendre={() => ordonner(i, 1)}
            />
          ))}
        </div>
      )}
      {gestion && etat.k === 'ok' && (
        <div className={`ajout-section${formulaire ? ' ouvert' : ''}`}>
          {!formulaire && sections.length > 0 && (
            <button type="button" aria-disabled={perdue || undefined} onClick={() => !perdue && setAjoutOuvert(true)}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Ajouter une section
              <small>Elle naît vide et fermée aux joueurs.</small>
            </button>
          )}
          {formulaire && (
            <form onSubmit={ajouter} noValidate onKeyDown={(e) => e.key === 'Escape' && fermerAjout()}>
              <Champ
                etiquette="Titre de la section"
                value={titreSection}
                autoFocus
                placeholder="Par exemple : Ce qu’il sait du sceau"
                autoComplete="off"
                erreur={erreurTitre}
                onChange={(e: { target: { value: string } }) => setTitreSection(e.target.value)}
              />
              <div className="boutons">
                <Bouton onClick={fermerAjout}>Annuler</Bouton>
                <Bouton type="submit" variante="principal" ecrit enCours={ajoutEnCours}>
                  Ajouter la section
                </Bouton>
              </div>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

export default { chemin: '/univers/:id/fiche/:fid', composant: PageFiche } satisfies Ecran;
