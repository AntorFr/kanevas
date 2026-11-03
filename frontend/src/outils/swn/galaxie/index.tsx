import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import { PageIntrouvable, Pastille } from '../../../ui';
import type { PropsOutil } from '../../types';
import { CarteHex } from './Carte';
import { PanneauSystemeVue, Recherche, Trajet, type EtatPanneau } from './Panneaux';
import type { PanneauSysteme, Reference, Resultat, Selection, VueGalaxie, VueTrajet } from './types';
import './galaxie.css';

/** E-21 in reading (P-18 steps 1–3): the screen of the tool `swn/galaxie`, loaded by dynamic import. */
export default function Galaxie({ universId, cible, prealable, suffixeMode }: PropsOutil) {
  const galaxie = prealable as VueGalaxie;
  const suffixe = suffixeMode ?? '';
  const base = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${galaxie.id}`;
  const perdue = useConnexionPerdue();
  const [params, setParams] = useSearchParams();
  const lien = params.get('systeme');
  const [selection, setSelection] = useState<Selection | null>(lien ? { k: 'systeme', cle: lien } : null);
  const [panneau, setPanneau] = useState<EtatPanneau>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [centrer, setCentrer] = useState<{ q: number; r: number; n: number } | null>(null);
  const [depart, setDepart] = useState<Resultat | null>(null);
  const [arrivee, setArrivee] = useState<Resultat | null>(null);
  const [resultat, setResultat] = useState<VueTrajet | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [vide, setVide] = useState(false);
  const panneauRef = useRef<HTMLDivElement>(null);
  const premiereLecture = useRef(true);

  useTitreAriane(galaxie.titre, 'Cartes');

  // The panel of a defined system; the first one comes from the address (`?systeme=`).
  const cleSysteme = selection?.k === 'systeme' ? selection.cle : null;
  useEffect(() => {
    if (cleSysteme === null) return;
    let actif = true;
    setPanneau({ k: 'chargement' });
    lire<PanneauSysteme>(`${base}/systemes/${encodeURIComponent(cleSysteme)}${suffixe}`).then(
      (s) => {
        if (!actif) return;
        setPanneau({ k: 'ok', s });
        if (premiereLecture.current) setCentrer({ q: s.q, r: s.r, n: 1 });
        premiereLecture.current = false;
      },
      (e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
        setPanneau({ k: 'erreur' });
      },
    );
    return () => { actif = false; };
  }, [cleSysteme, base, suffixe, essai]);

  // The address always holds a link to read (G-7).
  useEffect(() => {
    const voulu = cleSysteme;
    if ((params.get('systeme') ?? null) === voulu) return;
    const p = new URLSearchParams(params);
    if (voulu === null) p.delete('systeme'); else p.set('systeme', voulu);
    setParams(p, { replace: true });
  }, [cleSysteme]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = useCallback((s: Selection | null) => {
    setSelection(s);
    if (s && window.matchMedia?.('(max-width: 759px)').matches) {
      setTimeout(() => panneauRef.current?.scrollIntoView({ block: 'nearest' }), 0);
    }
  }, []);

  const surIntrouvable = useCallback(() => setIntrouvable(true), []);
  const mesure: Reference | null = depart ?? galaxie.reference;
  const chemin = useMemo(() => (resultat?.trouve ? resultat.etapes : []), [resultat]);
  const mj = galaxie.niveau === 'mj';

  if (introuvable) return <PageIntrouvable />;
  return (
    <div className="gx">
      <div className="gx-entete">
        <h1>{galaxie.titre}</h1>
        <p className="gx-sous">Carte de la galaxie</p>
        {mj && galaxie.visible === false && <Pastille sens="mj">MJ seul</Pastille>}
      </div>
      {perdue && <p className="echec" role="status">Connexion perdue.</p>}
      {vide && <p className="gx-note" role="status">{mj ? 'Aucun système défini. Placez-en un ou promouvez un système généré.' : 'Rien à voir sur cette carte pour l’instant.'}</p>}
      <div className="gx-corps">
        <CarteHex
          base={base} suffixe={suffixe} galaxie={galaxie} selection={selection} onSelection={choisir} mesure={mesure}
          chemin={chemin} centrer={centrer} onIntrouvable={surIntrouvable} onVide={setVide}
        />
        <div className="gx-colonne">
          <Recherche base={base} suffixe={suffixe} onChoisir={(r) => { setCentrer({ q: r.q, r: r.r, n: Date.now() }); choisir({ k: 'systeme', cle: r.cle }); }} />
          <div ref={panneauRef}>
            {selection && (
              <PanneauSystemeVue
                selection={selection} etat={panneau} secret={selection.k === 'systeme' ? selection.secret : undefined} mesure={mesure}
                onDepuis={(r) => { setDepart(r); setResultat(null); }} onVers={(r) => { setArrivee(r); setResultat(null); }}
                onReessayer={() => setEssai((n) => n + 1)}
              />
            )}
          </div>
          <Trajet
            base={base} suffixe={suffixe} mj={mj} depart={depart} arrivee={arrivee}
            onDepart={(r) => { setDepart(r); setResultat(null); }} onArrivee={(r) => { setArrivee(r); setResultat(null); }}
            resultat={resultat} onResultat={setResultat}
          />
        </div>
      </div>
    </div>
  );
}
