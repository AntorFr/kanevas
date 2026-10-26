import { useCallback, useRef, useState } from 'react';
import { ArrowDown, NotebookPen, Plus } from 'lucide-react';

import { lire, useConnexionPerdue } from '../../../api';
import { Bouton } from '../../../ui';
import { LigneCompteRendu, type PageComptesRendus } from '../../suivi/commun';
import { CadreBlocFiche } from '../bloc-fiche';
import type { BlocFiche, PropsBlocFiche } from '../registre-blocs-fiche';
import { useBlocFiche } from './charge';
import { NouveauCompteRendu, lireBrouillon } from './comptes-rendus/nouveau';

function ComptesRendus({ universId, fiche, suffixeMode }: PropsBlocFiche) {
  const base = `/api/univers/${universId}/comptes-rendus?campagne=${fiche.id}${suffixeMode ? '&mode=joueur' : ''}`;
  const [etat, setEtat, recharger] = useBlocFiche<PageComptesRendus>(base);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const verrou = useRef(false);
  const cleBrouillon = `kanevas:brouillon-cr:${universId}:${fiche.id}`;
  const [ouvert, setOuvert] = useState(() => lireBrouillon(cleBrouillon) !== undefined);
  const fermer = useCallback(() => setOuvert(false), []);
  const perdue = useConnexionPerdue();

  async function suite() {
    if (etat.k !== 'ok' || etat.valeur.suivant === null || verrou.current || perdue) return;
    verrou.current = true;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const page = await lire<PageComptesRendus>(`${base}&curseur=${encodeURIComponent(etat.valeur.suivant)}`);
      setEtat((e) => e.k === 'ok' ? { k: 'ok', valeur: { ...page, comptesRendus: [...e.valeur.comptesRendus, ...page.comptesRendus] } } : e);
    } catch { setSuiteEchec(true); }
    finally { verrou.current = false; setSuiteEnCours(false); }
  }

  return (
    <>
    <CadreBlocFiche titre="Comptes-rendus" icone={NotebookPen} chargement={etat.k === 'chargement'} erreur={etat.k === 'erreur'} recharger={recharger}
      action={<Bouton petit icone={Plus} ecrit onClick={() => setOuvert(true)}>Nouveau compte-rendu</Bouton>}>
      {etat.k === 'ok' && (etat.valeur.comptesRendus.length === 0 ? (
        <p className="bloc-fiche-vide">Aucun compte-rendu pour l'instant.</p>
      ) : (
        <ul className="suivi-liste">{etat.valeur.comptesRendus.map((cr) => <LigneCompteRendu key={cr.id} universId={universId} cr={cr} />)}</ul>
      ))}
      {suiteEchec && <div className="echec" role="alert">Impossible de charger la suite.</div>}
      {etat.k === 'ok' && etat.valeur.suivant !== null && <Bouton icone={ArrowDown} disabled={perdue} enCours={suiteEnCours} onClick={() => void suite()}>Charger la suite</Bouton>}
    </CadreBlocFiche>
    {ouvert && <NouveauCompteRendu universId={universId} ficheId={fiche.id} cleBrouillon={cleBrouillon} onFermer={fermer} />}
    </>
  );
}

export default { id: 'comptes-rendus', types: ['aventure'], roles: ['mj', 'joueur'], rang: 20, composant: ComptesRendus } satisfies BlocFiche;
