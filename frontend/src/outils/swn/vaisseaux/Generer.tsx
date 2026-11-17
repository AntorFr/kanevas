import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { appeler, lire, useConnexionPerdue } from '../../../api';
import { montrerProposition } from '../../../ecrans/assistant/fil';
import { Bouton, Fenetre, Pastille } from '../../../ui';
import { requete } from './format';
import type { EtatFiche, Rapport } from './types';

const ETATS = { absente: 'À créer', a_jour: 'À jour', perimee: 'À mettre à jour' } as const;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
/** « 7 fiches créées. » / « 3 fiches mises à jour, 4 inchangées. » (R-6): only the non-zero parts. */
export function phraseRapport(r: Rapport): string {
  const parts: string[] = [];
  if (r.creees > 0) parts.push(`${pluriel(r.creees, 'fiche')} ${r.creees > 1 ? 'créées' : 'créée'}`);
  if (r.misesAJour > 0) parts.push(`${pluriel(r.misesAJour, 'fiche')} ${r.misesAJour > 1 ? 'mises' : 'mise'} à jour`);
  if (r.inchangees > 0) parts.push(`${r.inchangees} ${r.inchangees > 1 ? 'inchangées' : 'inchangée'}`);
  return `${parts.join(', ')}.`;
}

/** « Générer les fiches de règles… » (GM, E-22): the seven sheets and their state, read at each opening. */
export function Generer({ universId, suffixe, onFermer }: { universId: number; suffixe: string; onFermer: () => void }) {
  const base = `/api/univers/${universId}/outils/swn/vaisseaux/fiches-regles${requete(suffixe)}`;
  const perdue = useConnexionPerdue();
  const [fiches, setFiches] = useState<EtatFiche[] | null>(null);
  const [lecture, setLecture] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLecture(false);
    try {
      setFiches(await lire<EtatFiche[]>(base));
    } catch {
      setLecture(true);
    }
  }, [base]);
  useEffect(() => { void charger(); }, [charger]);

  async function generer() {
    if (enCours || perdue || !fiches) return;
    setEnCours(true);
    setEchec(false);
    setSucces(null);
    try {
      const r = await appeler<Rapport>('POST', base);
      setSucces(phraseRapport(r));
      await charger();
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  const existe = (fiches ?? []).some((f) => f.ficheId !== null);
  const toutAJour = fiches !== null && fiches.every((f) => f.etat === 'a_jour');
  const inactif = !fiches || perdue || enCours || toutAJour;

  return (
    <Fenetre titre="Générer les fiches de règles" onFermer={onFermer}>
      <div className="vx-dialogue vx-generer">
        <p className="vx-note">Les fiches montrent le catalogue tel que les joueurs le voient : les éléments masqués n’y figurent pas.</p>
        {existe && <p className="vx-note">Les fiches existantes seront réécrites.</p>}
        {lecture && (
          <p className="echec" role="alert">
            Impossible de charger les fiches. <Bouton petit onClick={() => void charger()}>Réessayer</Bouton>
          </p>
        )}
        {!fiches && !lecture && <p role="status">Chargement…</p>}
        {fiches && (
          <ul className="vx-generer-liste">
            {fiches.map((f) => (
              <li key={f.cle} className="vx-generer-ligne">
                <span className="vx-generer-nom">
                  {f.ficheId !== null ? <Link to={`/univers/${universId}/fiche/${f.ficheId}`} onClick={onFermer}>{f.libelle}</Link> : f.libelle}
                </span>
                {f.etat === 'perimee' && f.propositionId !== null ? (
                  <>
                    <Pastille sens="mj">Mise à jour proposée</Pastille>
                    <Bouton petit onClick={() => { onFermer(); montrerProposition(universId, f.propositionId!); }}>Voir la proposition</Bouton>
                  </>
                ) : (
                  <Pastille sens={f.etat === 'a_jour' ? 'table' : f.etat === 'perimee' ? 'mj' : 'neutre'}>{ETATS[f.etat]}</Pastille>
                )}
              </li>
            ))}
          </ul>
        )}
        {perdue && <p className="echec" role="status">Connexion perdue.</p>}
        {enCours && <p className="vx-note" role="status">Génération…</p>}
        {succes && <p className="vx-succes" role="status">{succes}</p>}
        {echec && <p className="echec" role="alert">Impossible de générer les fiches. <Bouton petit onClick={() => void generer()}>Réessayer</Bouton></p>}
        {toutAJour && !perdue && <p className="vx-note">Les fiches sont à jour.</p>}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" ecrit disabled={inactif} enCours={enCours} onClick={() => void generer()}>Générer</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}
