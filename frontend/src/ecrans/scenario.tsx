import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { appeler, ErreurApi } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import { Bouton, Champ, Chargement, ErreurChargement, PageIntrouvable, useToasts } from '../ui';
import './ecrans.css';
import { ECHEC, type Campagne, type Scenario } from './suivi/commun';

const MAX_CONTENU = 20000;

function PageScenario() {
  const { id, scenario } = useParams();
  return <Page key={`${id}/${scenario}`} universId={id!} scenarioId={scenario!} />;
}

function Page({ universId, scenarioId }: { universId: string; scenarioId: string }) {
  const [donnees, recharger] = useCharge<Scenario>(`/api/scenarios/${scenarioId}`);
  if (donnees.etat === 'chargement') return <Chargement texte="Chargement du scénario…" />;
  if (donnees.etat === 'erreur' && donnees.statut === 404) return <PageIntrouvable />;
  if (donnees.etat === 'erreur') return <ErreurChargement texte="Impossible de charger ce scénario." onReessayer={recharger} />;
  return <Avec universId={universId} initial={donnees.valeur} />;
}

/** The campaign gives the « ← nom » link and checks the scenario belongs to this universe. */
function Avec({ universId, initial }: { universId: string; initial: Scenario }) {
  const [camp, recharger] = useCharge<Campagne>(`/api/univers/${universId}/campagnes/${initial.campagneId}`);
  if (camp.etat === 'chargement') return <Chargement texte="Chargement du scénario…" />;
  if (camp.etat === 'erreur' && camp.statut === 404) return <PageIntrouvable />;
  if (camp.etat === 'erreur') return <ErreurChargement texte="Impossible de charger ce scénario." onReessayer={recharger} />;
  return <Vue universId={universId} campagne={camp.valeur} initial={initial} />;
}

const cleBrouillon = (id: number) => `kanevas:brouillon-scenario:${id}`;

function lireBrouillon(id: number): { titre: string; contenu: string; version: number } | undefined {
  try {
    const b = sessionStorage.getItem(cleBrouillon(id));
    if (b === null) return undefined;
    const j = JSON.parse(b) as { titre?: unknown; contenu?: unknown; version?: unknown };
    return typeof j.titre === 'string' && typeof j.contenu === 'string' && typeof j.version === 'number'
      ? { titre: j.titre, contenu: j.contenu, version: j.version }
      : undefined;
  } catch {
    return undefined;
  }
}

function Vue({ universId, campagne, initial }: { universId: string; campagne: Campagne; initial: Scenario }) {
  const brouillon = lireBrouillon(initial.id);
  const { toast } = useToasts();
  const [scenario, setScenario] = useState(initial);
  const [edition, setEdition] = useState(brouillon !== undefined);
  const [titre, setTitre] = useState(brouillon?.titre ?? initial.titre);
  const [contenu, setContenu] = useState(brouillon?.contenu ?? initial.contenu);
  const [versionLue, setVersionLue] = useState(brouillon?.version ?? initial.version);
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [erreurContenu, setErreurContenu] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [perime, setPerime] = useState(false);
  const [enCours, setEnCours] = useState(false);

  function garder(t: string, c: string) {
    try {
      sessionStorage.setItem(cleBrouillon(scenario.id), JSON.stringify({ titre: t, contenu: c, version: versionLue }));
    } catch {
      /* storage unavailable */
    }
  }

  function modifier() {
    setTitre(scenario.titre);
    setContenu(scenario.contenu);
    setVersionLue(scenario.version);
    setPerime(false);
    setEchec(false);
    setErreurTitre(undefined);
    setErreurContenu(undefined);
    setEdition(true);
  }

  function annuler() {
    sessionStorage.removeItem(cleBrouillon(scenario.id));
    setEdition(false);
    setPerime(false);
    setEchec(false);
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    let ok = true;
    if (t === '') {
      setErreurTitre('le titre est obligatoire.');
      ok = false;
    } else if (t.length > 120) {
      setErreurTitre('120 caractères au plus.');
      ok = false;
    } else setErreurTitre(undefined);
    if (contenu.length > MAX_CONTENU) {
      setErreurContenu('20 000 caractères au plus.');
      ok = false;
    } else setErreurContenu(undefined);
    if (!ok) return;
    setEchec(false);
    setPerime(false);
    setEnCours(true);
    try {
      const maj = await appeler<Scenario>('PUT', `/api/scenarios/${scenario.id}`, {
        titre: t,
        contenu,
        version: versionLue,
      });
      sessionStorage.removeItem(cleBrouillon(scenario.id));
      setScenario(maj);
      setEdition(false);
      toast(`« ${maj.titre} » enregistré`);
    } catch (err) {
      if (err instanceof ErreurApi && err.statut === 409 && err.code === 'scenario_modifie') setPerime(true);
      else setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  /** Reads the current version; the text being written stays, and is now saved against the new version. */
  async function recharger() {
    setEchec(false);
    try {
      const maj = await appeler<Scenario>('GET', `/api/scenarios/${scenario.id}`);
      setScenario(maj);
      setVersionLue(maj.version);
      setPerime(false);
      try {
        sessionStorage.setItem(cleBrouillon(scenario.id), JSON.stringify({ titre, contenu, version: maj.version }));
      } catch {
        /* storage unavailable */
      }
    } catch {
      setEchec(true);
    }
  }

  return (
    <div className="page-liste">
      <Link className="lien-retour" to={`/univers/${universId}/campagnes/${campagne.id}`}>
        ← {campagne.nom}
      </Link>
      <header className="tete-liste">
        <h1 className="titre-long">{scenario.titre}</h1>
        {!edition && (
          <Bouton variante="principal" icone={Pencil} onClick={modifier}>
            Modifier
          </Bouton>
        )}
      </header>
      {!edition ? (
        <>
          {scenario.contenu === '' ? (
            <p className="texte-vide-page">Rien d’écrit pour l’instant.</p>
          ) : (
            <div className="contenu-scenario">{scenario.contenu}</div>
          )}
        </>
      ) : (
        <form onSubmit={enregistrer} noValidate>
          {perime && (
            <div className="echec" role="alert">
              Ce scénario a changé depuis que vous l’avez ouvert. Rechargez-le pour voir la nouvelle version ; votre texte reste ci-dessous.{' '}
              <Bouton petit onClick={() => void recharger()}>
                Recharger le scénario
              </Bouton>
            </div>
          )}
          {echec && (
            <div className="echec" role="alert">
              {ECHEC}
            </div>
          )}
          <Champ
            etiquette="Titre"
            value={titre}
            erreur={erreurTitre}
            onChange={(e: { target: { value: string } }) => {
              setTitre(e.target.value);
              garder(e.target.value, contenu);
            }}
          />
          <Champ
            etiquette="Contenu"
            zone
            rows={16}
            value={contenu}
            erreur={erreurContenu}
            onChange={(e: { target: { value: string } }) => {
              setContenu(e.target.value);
              garder(titre, e.target.value);
            }}
          />
          <div className="actions">
            <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
              Enregistrer
            </Bouton>
            <Bouton onClick={annuler}>Annuler</Bouton>
          </div>
        </form>
      )}
    </div>
  );
}

export default { chemin: '/univers/:id/scenarios/:scenario', composant: PageScenario } satisfies Ecran;
