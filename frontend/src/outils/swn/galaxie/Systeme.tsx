import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useCharge, useTitreAriane } from '../../../cadre-contexte';
import type { UniversListe } from '../../../types';
import { Pencil, Move } from 'lucide-react';
import { Bouton, EtatVide, Pastille } from '../../../ui';
import type { PropsOutil } from '../../types';
import CarteSysteme from './CarteSysteme';
import { FournisseurEdition, useEdition } from './Edition';
import { lireEtatMasque } from './ecriture';
import MenuSysteme from './MenuSysteme';
import PanneauCorps from './PanneauCorps';
import PanneauFormation from './PanneauFormation';
import { DialogueAjouterAstre, DialogueAjouterZone, FormulaireDeplacer, FormulaireModifierAstre, FormulaireModifierZone } from './FormulairesEdition';
import BoutonRetirer from './Retrait';
import { nomAstre, nomFormation, placeAstre, placeFormation, typeAstre, typeFormation } from './systeme-libelles';
import type { InterieurSysteme } from './types';
import './galaxie.css';

/**
 * E-23, text version (AD-systeme-5): the bodies and zones of a system as rows. Read by the tool's `verifier` before
 * this code is requested, so loading, error with « Réessayer » and « Page introuvable. » are the tool screen's own.
 * « Connexion perdue. » is the shared frame's banner alone. The counts are those of the answer, never of what is hidden.
 */
export default function Systeme({ universId, cible, prealable, suffixeMode }: PropsOutil) {
  const base = `/api/univers/${universId}/outils/swn/galaxie/galaxies/${cible ?? ''}`;
  return (
    <FournisseurEdition initial={prealable as InterieurSysteme} base={base} suffixe={suffixeMode ?? ''}>
      <Page universId={universId} cible={cible} base={base} suffixeMode={suffixeMode} />
    </FournisseurEdition>
  );
}

function Page({ universId, cible, base, suffixeMode }: { universId: number; cible?: string; base: string; suffixeMode?: string }) {
  // The GM outside Player mode reads as a GM (the answer carries `peutEcrire` for him only); in Player mode he reads what a player reads.
  const { interieur: s, peutEcrire: mj, place } = useEdition();
  // The flag is the GM's own read (B-97): a player's answer never carries it, and a player never reaches a hidden system.
  const [secret, setSecret] = useState(false);
  useEffect(() => {
    if (!mj) { setSecret(false); return; }
    let actif = true;
    lireEtatMasque(place).then((e) => actif && setSecret(e.secret), () => undefined);
    return () => { actif = false; };
  }, [mj, place, s.etat, s.versionSysteme]);
  const titre = s.nom !== null && s.nom !== '' ? s.nom : `Système sans nom (${s.q}, ${s.r})`;
  useTitreAriane(titre, 'Cartes');
  const vide = s.astres.length === 0 && s.formations.length === 0;
  // The selected body (a key of the answer): set by the canvas, a list row or the keyboard; the panel (next task) reads it.
  const [selection, setSelection] = useState<string | null>(null);
  const choisi = selection === null ? null : s.astres.find((a) => a.cle === selection) ?? null;
  const [selectionZone, setSelectionZone] = useState<string | null>(null);
  const zoneChoisie = selectionZone === null ? null : s.formations.find((f) => f.cle === selectionZone) ?? null;
  const choisirCorps = (cle: string | null) => { setSelection(cle); setFormulaire(null); if (cle !== null) setSelectionZone(null); };
  // The form that replaces the panel (« Déplacer », « Modifier… ») and the dialog of « Ajouter » on show; a change of selection closes the form.
  const [formulaire, setFormulaire] = useState<'deplacer' | 'modifier' | null>(null);
  const [ajout, setAjout] = useState<'astre' | 'zone' | null>(null);
  const fermerFormulaire = () => setFormulaire(null);
  const apresAjout = (genre: 'astre' | 'zone') => (cle: string | undefined) => {
    if (cle === undefined) return;
    if (genre === 'astre') { setSelection(cle); setSelectionZone(null); } else { setSelectionZone(cle); setSelection(null); }
    setFormulaire(null);
  };
  const adresseVoisin = `/univers/${universId}/outils/swn/galaxie/${cible ?? ''}/interieur/`;

  return (
    <div className="gx-systeme-page">
      <header className="gx-entete">
        <h1>{titre}</h1>
        <Pastille sens="neutre">{s.etat === 'tire' ? 'Tiré' : 'Défini'}</Pastille>
        {mj && secret && <Pastille sens="mj">MJ seul</Pastille>}
        <Pastille sens="neutre">Hexagone {s.q}, {s.r}</Pastille>
        <MenuSysteme onAjouterAstre={() => setAjout('astre')} onAjouterZone={() => setAjout('zone')} />
        <Link className="gx-retour" to={`/univers/${universId}/outils/swn/galaxie/${cible ?? ''}`}>← Galaxie</Link>
      </header>
      {vide ? (
        <EtatVide titre={mj ? 'Ce système est vide.' : 'Rien à voir dans ce système pour l’instant.'}>
          {mj && <Bouton variante="mj" ecrit onClick={() => setAjout('astre')}>Ajouter un astre…</Bouton>}
        </EtatVide>
      ) : (
        <>
          <div className={`cs-zone${choisi || zoneChoisie ? ' avec-panneau' : ''}`}>
            <CarteSysteme
              interieur={s}
              base={base}
              adresseVoisin={adresseVoisin}
              suffixe={suffixeMode ?? ''}
              selection={selection}
              onSelection={choisirCorps}
            />
            {choisi && mj && formulaire === 'deplacer' && <FormulaireDeplacer key={`d-${choisi.cle}`} astre={choisi} onFermer={fermerFormulaire} />}
            {choisi && mj && formulaire === 'modifier' && <FormulaireModifierAstre key={`m-${choisi.cle}`} astre={choisi} onFermer={fermerFormulaire} />}
            {choisi && !(mj && formulaire) && (
              <PanneauCorps key={choisi.cle} astre={choisi} q={s.q} r={s.r} base={base} suffixe={suffixeMode ?? ''}
                actions={mj && (
                  <>
                    <Bouton variante="mj" ecrit icone={Move} data-ouvreur="deplacer" onClick={() => setFormulaire('deplacer')}>Déplacer</Bouton>
                    <Bouton variante="mj" ecrit icone={Pencil} data-ouvreur="modifier" onClick={() => setFormulaire('modifier')}>Modifier…</Bouton>
                    <BoutonRetirer cible={{ k: 'astre', astre: choisi }} onRetire={() => setSelection(null)} />
                  </>
                )} />
            )}
            {!choisi && zoneChoisie && mj && formulaire === 'modifier' && <FormulaireModifierZone key={`z-${zoneChoisie.cle}`} zone={zoneChoisie} onFermer={fermerFormulaire} />}
            {!choisi && zoneChoisie && !(mj && formulaire) && (
              <PanneauFormation key={zoneChoisie.cle} zone={zoneChoisie} q={s.q} r={s.r}
                actions={mj && (
                  <>
                    <Bouton variante="mj" ecrit icone={Pencil} data-ouvreur="modifier" onClick={() => setFormulaire('modifier')}>Modifier…</Bouton>
                    <BoutonRetirer cible={{ k: 'zone', zone: zoneChoisie }} onRetire={() => setSelectionZone(null)} />
                  </>
                )} />
            )}
          </div>
          {s.astres.length > 0 && (
            <section>
              <h2>Corps ({s.astres.length})</h2>
              <ul className="gx-lignes" id="gx-liste-corps" aria-label="Corps du système">
                {s.astres.map((a) => (
                  <li key={a.cle} title={nomAstre(a)} className={`cliquable${a.genre === 'lune' ? ' lune' : ''}${selection === a.cle ? ' choisi' : ''}`}>
                    <button type="button" className="ligne-corps" aria-pressed={selection === a.cle} onClick={() => choisirCorps(a.cle)}>
                      <span className={a.nom ? 'nom' : 'nom vide'}>{nomAstre(a)}</span>
                      <span className="place">{placeAstre(a)}</span>
                      <span className="meta">{typeAstre(a)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {s.formations.length > 0 && (
            <section>
              <h2>Zones ({s.formations.length})</h2>
              <ul className="gx-lignes" aria-label="Zones du système">
                {s.formations.map((f) => (
                  <li key={f.cle} title={nomFormation(f)} className={`cliquable${selectionZone === f.cle ? ' choisi' : ''}`}>
                    <button type="button" className="ligne-corps" aria-pressed={selectionZone === f.cle}
                      onClick={() => { setSelectionZone(f.cle); setSelection(null); }}>
                      <span className={f.nom ? 'nom' : 'nom vide'}>{nomFormation(f)}</span>
                      <span className="place">{placeFormation(f)}</span>
                      <span className="meta">{typeFormation(f)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {mj && ajout === 'astre' && <DialogueAjouterAstre onFermer={() => setAjout(null)} onAjoute={apresAjout('astre')} />}
      {mj && ajout === 'zone' && <DialogueAjouterZone onFermer={() => setAjout(null)} onAjoute={apresAjout('zone')} />}
    </div>
  );
}
