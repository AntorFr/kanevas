import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { Role, UniversListe } from '../types';
import { BasculeMjJoueur, Bouton, Champ, Chargement, ErreurChargement, PageIntrouvable, Pastille } from '../ui';
import './ecrans.css';
import './fiche/fiche.css';
import { PanneauSection, type Joueur } from './fiche/section';
import type { FicheVue } from './fiche/types';
import { lignesDuType } from './fiche/lignes/registre';
import { badgeFiche, typeParType } from './fiche/types-fiche';

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
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [mode, setMode] = useState<'mj' | 'joueur'>('mj');
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [echec, setEchec] = useState<string>();
  const [titreSection, setTitreSection] = useState('');
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const role: Role | undefined = univers.etat === 'ok' ? univers.valeur.role : undefined;
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

  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (etat.k === 'introuvable') return <PageIntrouvable />;
  if (etat.k === 'chargement' || univers.etat === 'chargement') return <Chargement texte="Chargement de la fiche…" />;
  if (etat.k === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger cette fiche." onReessayer={() => setEssai((n) => n + 1)} />;
  }

  const mj = univers.valeur.role === 'mj';
  const fiche = etat.fiche;
  const typeLore = typeParType(fiche.type);
  const sections = etat.k === 'ok' ? fiche.sections : [];
  const gestion = mj && modeEffectif === 'mj';

  async function ordonner(index: number, delta: number) {
    const ids = sections.map((s) => s.id);
    const autre = index + delta;
    [ids[index], ids[autre]] = [ids[autre]!, ids[index]!];
    await appeler('PUT', `${base}/ordre`, { ids });
    await rafraichir();
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
      setTitreSection('');
      await rafraichir();
    } catch {
      setEchec(ECHEC);
    } finally {
      setAjoutEnCours(false);
    }
  }

  return (
    <>
      {typeLore && (
        <p>
          <Link to={`/univers/${id}/fiches/${typeLore.slug}`}>← {typeLore.pluriel}</Link>
        </p>
      )}
      <div className="titre-fiche-page">
        <h1>{fiche.titre}</h1>
        <span className="badge-type">{badgeFiche(fiche)}</span>
      </div>
      {lignesDuType(fiche.type).map((l, i) => (
        <l.composant key={i} universId={id!} fiche={fiche} />
      ))}
      {mj && (
        <div className="outils-fiche">
          <BasculeMjJoueur mode={mode} onChange={setMode} />
          {mode === 'joueur' && <Pastille sens="table">Vue d’un joueur</Pastille>}
        </div>
      )}
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
      {etat.k === 'aucune-visible' ? (
        <div className="etat">Aucune section n’est visible des joueurs.</div>
      ) : sections.length === 0 ? (
        <div className="etat">{gestion ? 'Cette fiche n’a pas encore de section.' : 'Aucune section.'}</div>
      ) : (
        sections.map((s, i) => (
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
        ))
      )}
      {gestion && etat.k === 'ok' && (
        <form className="ajout-section" onSubmit={ajouter} noValidate>
          <Champ
            etiquette="Titre de la section"
            value={titreSection}
            erreur={erreurTitre}
            onChange={(e: { target: { value: string } }) => setTitreSection(e.target.value)}
          />
          <Bouton type="submit" variante="principal" ecrit enCours={ajoutEnCours} disabled={perdue}>
            Ajouter une section
          </Bouton>
        </form>
      )}
    </>
  );
}

export default { chemin: '/univers/:id/fiche/:fid', composant: PageFiche } satisfies Ecran;
