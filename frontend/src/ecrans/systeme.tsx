import { Dices, Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler } from '../api';
import { useTitreAriane } from '../cadre-contexte';
import type { SystemeCompte } from '../types';
import type { Ecran } from '../registre';
import { ChargementListe, ErreurChargement, PageIntrouvable, Pastille } from '../ui';
import { PucesUnivers } from './systeme/puces';
import { OngletTypesSysteme } from './types-reglage/onglet-systeme';
import { PanneauOutils } from './outils/panneau';
import { ResponsableSysteme } from './outils/responsable';
import './ecrans.css';
import './liste.css';
import './reglages.css';
import './cartes.css';

interface Page extends SystemeCompte {
  types: { type: string; active: boolean }[];
}

const PLUS_DROIT = 'Vous ne pouvez plus modifier ce système.';

/**
 * E-15 Système de jeu: header, the types of sheet and the tools of a system, at its own address (AD-94). The system's
 * elements are sheets of its space, read and written by the screens of `kanevas-systemes-jeu-elements-ecrans`.
 */
function Systeme() {
  const { sid } = useParams();
  const [params, setParams] = useSearchParams();
  const surOutils = params.get('type') === 'outils';
  const [entete, setEntete] = useState<Page>();
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur' | 'introuvable'>('chargement');
  const [essai, setEssai] = useState(0);
  const [plusDroit, setPlusDroit] = useState(false);
  useTitreAriane(entete?.nom);

  const base = `/api/systemes/${sid}`;
  const charger = useCallback(() => appeler<Page>('GET', base), [base]);

  // Another system's address: nothing of the previous one stays.
  useEffect(() => {
    setEntete(undefined);
    setPlusDroit(false);
  }, [sid]);

  useEffect(() => {
    let actif = true;
    setEtat('chargement');
    charger().then(
      (p) => {
        if (!actif) return;
        setEntete(p);
        setEtat('ok');
      },
      (e: unknown) => {
        if (actif) setEtat(e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur');
      },
    );
    return () => {
      actif = false;
    };
  }, [charger, essai]);

  if (etat === 'introuvable') return <PageIntrouvable retour="systemes" />;
  if (!entete) {
    if (etat === 'erreur') return <ErreurChargement texte="Impossible de charger ce système." onReessayer={() => setEssai((n) => n + 1)} />;
    return <ChargementListe texte="Chargement du système…" />;
  }
  const peutEcrire = entete.peutEcrire;
  const peutLireOutils = params.get('mode') !== 'joueur' && entete.mesUnivers.some((u) => u.role === 'mj');
  if (surOutils && !peutLireOutils) return <PageIntrouvable retour="systemes" />;

  return (
    <div className="page-liste page-systeme">
      <div className="entete-sys">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Dices size={20} strokeWidth={1.75} />
        </span>
        <h1 title={entete.nom}>{entete.nom}</h1>
      </header>
      <p className="sous-sys">
        <span>Référentiel commun · utilisé par {entete.nbUnivers} univers</span>
        {!peutEcrire && (
          <Pastille sens="neutre" icone={Eye}>
            Lecture seule
          </Pastille>
        )}
      </p>
      <div className="vos-univers">
        <span>Dans vos univers</span>
        <PucesUnivers univers={entete.mesUnivers} lien />
      </div>
      {peutLireOutils && <ResponsableSysteme key={sid} id={sid!} />}
      </div>
      {plusDroit && (
        <div className="echec" role="alert">
          {PLUS_DROIT}
        </div>
      )}
      <div className="barre-outils">
        <div role="tablist" className="onglets">
          <button
            type="button"
            role="tab"
            aria-selected={!surOutils}
            className={!surOutils ? 'actif' : undefined}
            onClick={() => setParams({}, { replace: true })}
          >
            Types de fiche
          </button>
          {peutLireOutils && <button type="button" role="tab" aria-selected={surOutils} className={surOutils ? 'actif' : undefined}
            onClick={() => setParams({ type: 'outils' }, { replace: true })}>Outils</button>}
        </div>
      </div>
      {!surOutils && (
        <div role="tabpanel">
          <OngletTypesSysteme
            systemeId={sid!}
            systemeNom={entete.nom}
            universId={entete.mesUnivers[0]?.id}
            actifs={entete.types}
            nbUnivers={entete.nbUnivers}
            peutEcrire={peutEcrire}
            onChange={(t, active) =>
              setEntete((h) => (h ? { ...h, types: h.types.map((x) => (x.type === t ? { ...x, active } : x)) } : h))
            }
            onDroitPerdu={() => {
              setPlusDroit(true);
              setEssai((n) => n + 1);
            }}
          />
        </div>
      )}
      {surOutils && <div role="tabpanel"><PanneauOutils key={sid} id={sid!} niveau="systeme" /></div>}
    </div>
  );
}

export default { chemin: '/systemes/:sid', composant: Systeme } satisfies Ecran;
