import { Dices, Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler } from '../api';
import { useMoi, useTitreAriane } from '../cadre-contexte';
import type { SystemeCompte } from '../types';
import type { Ecran } from '../registre';
import { ChargementListe, ErreurChargement, PageIntrouvable, Pastille } from '../ui';
import { GROUPE_ADMIN } from '../items';
import { OngletMJSysteme } from './systeme/onglet-mj';
import { OngletElements, type TypeSysteme } from './systeme/onglet-elements';
import type { Fiche } from './fiche/types';
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
  mots: Omit<TypeSysteme, 'active'>[];
  /** The elements, for who reads them; absent for the instance admin who reads nothing of the system. */
  fiches?: Fiche[];
  suivant?: string | null;
}

const PLUS_DROIT = 'Vous ne pouvez plus modifier ce système.';

/**
 * E-15 Système de jeu, at its own address (AD-94): the tabs « Éléments » (the system's sheets and, for its GMs, the
 * switches of its types), « Outils » and « MJ du système » (instance admin). Each tab shows only to who may use it.
 */
function Systeme() {
  const { sid } = useParams();
  const [params, setParams] = useSearchParams();
  const moi = useMoi();
  const estAdmin = moi.etat === 'ok' && moi.valeur.groups.includes(GROUPE_ADMIN);
  const onglet = params.get('type');
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
  const types: TypeSysteme[] = entete.types.flatMap((t) => {
    const m = entete.mots.find((x) => x.type === t.type);
    return m ? [{ ...m, active: t.active }] : [];
  });
  const peutLireOutils = params.get('mode') !== 'joueur' && entete.mesUnivers.some((u) => u.role === 'mj');
  const voitElements = entete.fiches !== undefined;
  // The first tab the account may use, when the address names none (the admin with no link sees the sole « MJ du système »).
  const surOutils = onglet === 'outils';
  const surMJ = onglet === 'mj' || (!voitElements && !surOutils);
  const surElements = !surOutils && !surMJ;
  if (surMJ && moi.etat === 'chargement') return <ChargementListe texte="Chargement du système…" />;
  if (surMJ && !estAdmin) return <PageIntrouvable retour="systemes" />;
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
          {voitElements && (
            <button type="button" role="tab" aria-selected={surElements} className={surElements ? 'actif' : undefined}
              onClick={() => setParams({}, { replace: true })}>Éléments</button>
          )}
          {peutLireOutils && <button type="button" role="tab" aria-selected={surOutils} className={surOutils ? 'actif' : undefined}
            onClick={() => setParams({ type: 'outils' }, { replace: true })}>Outils</button>}
          {estAdmin && <button type="button" role="tab" aria-selected={surMJ} className={surMJ ? 'actif' : undefined}
            onClick={() => setParams({ type: 'mj' }, { replace: true })}>MJ du système</button>}
        </div>
      </div>
      {surElements && (
        <div role="tabpanel">
          {peutEcrire && (
            <OngletTypesSysteme
              systemeId={sid!}
              systemeNom={entete.nom}
              actifs={types}
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
          )}
          <OngletElements systemeId={sid!} types={types} fiches={entete.fiches ?? []} suite={Boolean(entete.suivant)} peutEcrire={peutEcrire} />
        </div>
      )}
      {surMJ && <div role="tabpanel"><OngletMJSysteme key={sid} id={sid!} nom={entete.nom} /></div>}
      {surOutils && <div role="tabpanel"><PanneauOutils key={sid} id={sid!} niveau="systeme" /></div>}
    </div>
  );
}

export default { chemin: '/systemes/:sid', composant: Systeme } satisfies Ecran;
