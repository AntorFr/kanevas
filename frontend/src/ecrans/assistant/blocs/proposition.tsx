import { CircleAlert, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { aller } from '../adresse';
import type { PropsBloc } from './registre';

/** What `GET /api/univers/:id/propositions/:pid` answers (AD-81). */
interface PropositionLue {
  id: number;
  ficheId: number;
  crId: number;
  sectionId: number;
  contenuActuel: string;
  contenuPropose: string;
  etat: 'en_attente' | 'perimee' | 'appliquee';
}

interface Titres {
  section: string;
  fiche: string;
  source: string;
}

type Phase = 'chargement' | 'ok' | 'erreur' | 'introuvable' | 'abandonnee';

const TEXTE_PERDUE =
  'Connexion perdue. Ce que vous voyez peut être dépassé ; rien n’est enregistré tant qu’elle ne revient pas.';

/**
 * « Mise à jour proposée » (E-12, AD-58, AD-82): the proposal is read from the server at display and
 * after each gesture — the block says what the database says, never what it remembers. The text
 * is shown raw (React text nodes, never HTML).
 */
export function Proposition({ evenement, universId, surOuverture }: PropsBloc) {
  const propositionId = Number(evenement.cible.propositionId);
  const base = `/api/univers/${universId}/propositions/${propositionId}`;
  const perdue = useConnexionPerdue();

  const [phase, setPhase] = useState<Phase>('chargement');
  const [prop, setProp] = useState<PropositionLue | null>(null);
  const [titres, setTitres] = useState<Titres | null>(null);
  const [relecture, setRelecture] = useState(false);
  const [geste, setGeste] = useState<'appliquer' | 'abandonner' | null>(null);
  const [erreurGeste, setErreurGeste] = useState(false);
  const aRelire = useRef(false);
  const [inconnu, setInconnu] = useState(false);
  const apresGeste = useRef(false);
  const resultat = useRef<HTMLParagraphElement>(null);
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const lireTout = useCallback(async () => {
    try {
      const p = await lire<PropositionLue>(base);
      let t: Titres | null = null;
      try {
        const [fiche, cr] = await Promise.all([
          lire<{ titre: string; sections: { id: number; titre: string }[] }>(`/api/univers/${universId}/fiches/${p.ficheId}`),
          lire<{ titre: string }>(`/api/univers/${universId}/fiches/${p.crId}`),
        ]);
        t = {
          section: fiche.sections.find((s) => s.id === p.sectionId)?.titre ?? '',
          fiche: fiche.titre,
          source: cr.titre,
        };
      } catch (e) {
        if (!(e instanceof ErreurApi) || e.statut === 0) throw e;
        // the sheet or the source is gone from our view: the proposal is of no use any more
        if (e.statut === 404) throw new ErreurApi(404, 'Introuvable.');
        throw e;
      }
      if (!vivant.current) return;
      aRelire.current = false;
      setInconnu(false);
      setProp(p);
      setTitres(t);
      setPhase('ok');
    } catch (e) {
      if (!vivant.current) return;
      if (e instanceof ErreurApi && e.statut === 404) setPhase('introuvable');
      else if (e instanceof ErreurApi && e.statut === 0) {
        aRelire.current = true;
        setInconnu(true);
        setPhase((p) => (p === 'chargement' ? 'erreur' : p));
      } else setPhase((p) => (p === 'chargement' ? 'erreur' : p));
    } finally {
      if (vivant.current) setRelecture(false);
    }
  }, [base, universId]);

  useEffect(() => {
    void lireTout();
  }, [lireTout]);

  // The connection came back: read again what the database says.
  useEffect(() => {
    if (!perdue && aRelire.current) {
      setRelecture(true);
      void lireTout();
    }
  }, [perdue, lireTout]);

  // After a gesture the focus goes to its result.
  useEffect(() => {
    if (apresGeste.current && resultat.current && (phase === 'abandonnee' || prop?.etat === 'appliquee')) {
      apresGeste.current = false;
      resultat.current.focus();
    }
  });

  async function relire() {
    setRelecture(true);
    await lireTout();
  }

  async function faire(quoi: 'appliquer' | 'abandonner') {
    setGeste(quoi);
    setErreurGeste(false);
    try {
      await appeler('POST', `${base}/${quoi}`);
      if (!vivant.current) return;
      apresGeste.current = true;
      if (quoi === 'abandonner') {
        setPhase('abandonnee');
        return;
      }
      await relire();
    } catch (e) {
      if (!vivant.current) return;
      if (e instanceof ErreurApi && e.statut === 404) setPhase('introuvable');
      else if (e instanceof ErreurApi && e.statut === 409) {
        // `section_modifiee` or `proposition_appliquee`: nothing was written, say what the base says
        await relire();
      } else if (e instanceof ErreurApi && e.statut === 0) {
        aRelire.current = true; // the answer is lost: read again when the connection returns
        setInconnu(true);
      } else setErreurGeste(true);
    } finally {
      if (vivant.current) setGeste(null);
    }
  }

  const lienFiche = prop ? `/univers/${universId}/fiche/${prop.ficheId}` : null;
  const ouvrir = lienFiche && (
    <a
      className="asst-prop-ouvrir"
      href={lienFiche}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        surOuverture();
        aller(lienFiche);
      }}
    >
      Ouvrir <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
    </a>
  );

  if (phase === 'chargement') {
    return (
      <div className="asst-prop">
        <p className="asst-prop-etat" role="status">
          Chargement de la proposition…
        </p>
      </div>
    );
  }
  if (phase === 'erreur') {
    return (
      <div className="asst-prop">
        <p className="asst-prop-alerte" role="alert">
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> Je n’ai pas pu afficher la proposition — réessayer
        </p>
        <div className="asst-prop-gestes">
          <Bouton
            onClick={() => {
              setPhase('chargement');
              void lireTout();
            }}
          >
            Réessayer
          </Bouton>
        </div>
      </div>
    );
  }
  if (phase === 'introuvable') {
    return (
      <div className="asst-prop">
        <p className="asst-prop-etat">Cette proposition n’existe plus.</p>
      </div>
    );
  }
  if (!prop || !titres) return null;

  const entete = (
    <>
      <h3 className="asst-prop-titre">Mise à jour proposée</h3>
      <p className="asst-prop-source">
        Section « {titres.section} » de « {titres.fiche} » · d’après « {titres.source} »
      </p>
    </>
  );

  if (phase === 'abandonnee') {
    return (
      <div className="asst-prop">
        {entete}
        <p className="asst-prop-etat" role="status" tabIndex={-1} ref={resultat}>
          Proposition abandonnée.
        </p>
      </div>
    );
  }

  const appliquee = prop.etat === 'appliquee';
  const perimee = prop.etat === 'perimee';
  const occupe = geste !== null || relecture;
  const vide = '(section vide)';

  return (
    <div className="asst-prop" aria-busy={occupe || undefined}>
      {perdue && <p className="asst-prop-perdue" role="status">{TEXTE_PERDUE}</p>}
      {entete}
      {appliquee && (
        <p className="asst-prop-etat" role="status" tabIndex={-1} ref={resultat}>
          Appliquée : la section « {titres.section} » est à jour.
        </p>
      )}
      {perimee && (
        <p className="asst-prop-alerte" role="alert">
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> La section a changé depuis la proposition. Demandez-en une nouvelle.
        </p>
      )}
      <div className="asst-prop-zones">
        <div className="asst-prop-zone" role="region" aria-label="Actuel" tabIndex={0}>
          <b>Actuel</b>
          <div className="asst-prop-texte">{prop.contenuActuel === '' ? vide : prop.contenuActuel}</div>
        </div>
        {!appliquee && (
          <div className="asst-prop-zone propose" role="region" aria-label="Proposé" tabIndex={0}>
            <b>Proposé</b>
            <div className="asst-prop-texte">{prop.contenuPropose}</div>
          </div>
        )}
      </div>
      {erreurGeste && (
        <p className="asst-prop-alerte" role="alert">
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> L’action n’a pas abouti. Réessayez.
        </p>
      )}
      <div className="asst-prop-gestes">
        {!appliquee && (
          <>
            <Bouton
              variante="principal"
              ecrit
              enCours={geste === 'appliquer'}
              disabled={perimee || occupe || inconnu}
              onClick={() => void faire('appliquer')}
            >
              Appliquer
            </Bouton>
            <Bouton ecrit enCours={geste === 'abandonner'} disabled={occupe || inconnu} onClick={() => void faire('abandonner')}>
              Abandonner
            </Bouton>
          </>
        )}
        {ouvrir}
      </div>
    </div>
  );
}
