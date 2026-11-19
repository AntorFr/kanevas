import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { BoiteDialogue, Bouton, useToasts } from '../../../ui';
import { compterElementsDuCorps, retirerAstreSysteme, retirerZoneSysteme } from './ecriture';
import { MessageEchec, lireEchecEdition, useEdition, type EchecEdition } from './Edition';
import { consequenceElements, nomAstre } from './systeme-libelles';
import type { AstreSysteme, FormationSysteme, InterieurSysteme } from './types';

type Cible = { k: 'astre'; astre: AstreSysteme } | { k: 'zone'; zone: FormationSysteme };

/** The consequence of removing a planet, counted from the interior the dialog opens on (the service returns the same number). */
export function consequenceRetrait(i: InterieurSysteme, a: AstreSysteme, elements = 0): string {
  const n = i.astres.filter((x) => x.parent_cle === a.cle).length;
  const suite = consequenceElements(elements);
  if (n === 0) return suite === '' ? 'Cet astre sera retiré du système.' : suite;
  const lunes = n === 1 ? 'Sa lune sera retirée.' : `Ses ${n} lunes seront retirées.`;
  return suite === '' ? lunes : `${lunes} ${suite}`;
}

/**
 * « Retirer l'astre » / « Retirer la zone » (E-23). On a drawn system the anchoring dialog comes first and the
 * confirmation reads the frozen interior (so the count of moons is the one that will go); « Annuler » in the confirmation
 * leaves the system anchored. Not drawn for a star (the one of rank 0 is never removed) nor for who may not write.
 */
export default function BoutonRetirer({ cible, onRetire }: { cible: Cible; onRetire: () => void }) {
  const { peutEcrire, ancrer, avecAncrage, recharger, place } = useEdition();
  const { toast } = useToasts();
  const [fige, setFige] = useState<InterieurSysteme | null>(null);
  /** The elements the removal takes with the body (the server counts them, the reserved ones included). */
  const [nbElements, setNbElements] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  if (!peutEcrire || (cible.k === 'astre' && cible.astre.genre === 'etoile')) return null;

  const nom = cible.k === 'astre' ? nomAstre(cible.astre) : cible.zone.nom ?? '';
  const cle = cible.k === 'astre' ? cible.astre.cle : cible.zone.cle;
  const libelle = cible.k === 'astre' ? 'Retirer l’astre' : 'Retirer la zone';

  async function ouvrir() {
    setEchec(undefined);
    const i = await ancrer();
    if (!i) return;
    let n = 0;
    if (cible.k === 'astre') {
      try { n = await compterElementsDuCorps(place, cible.astre.cle); } catch { toast('Impossible de compter les éléments de cet astre.'); return; }
    }
    setNbElements(n);
    setFige(i);
  }
  async function retirer() {
    if (enCours || !fige) return;
    setEnCours(true);
    setEchec(undefined);
    const version = (cible.k === 'astre' ? fige.astres.find((a) => a.cle === cle) : fige.formations.find((f) => f.cle === cle))?.version ?? 1;
    try {
      const r = await avecAncrage((jeton) => {
        const j = { version, versionSysteme: jeton.versionSysteme };
        return cible.k === 'astre' ? retirerAstreSysteme(place, cle, j) : retirerZoneSysteme(place, cle, j);
      });
      if (r) {
        toast(cible.k === 'zone' && nom === '' ? 'Zone retirée.' : `${nom} retiré.`);
        setFige(null);
        onRetire();
      }
    } catch (e) {
      const f = lireEchecEdition(e);
      setEchec(f);
      if (f.sorte === 'refus') { toast(f.message); setFige(null); void recharger(); }
    } finally {
      setEnCours(false);
    }
  }
  return (
    <>
      <Bouton icone={Trash2} variante="danger" ecrit onClick={() => void ouvrir()}>{libelle}</Bouton>
      {fige && (
        <BoiteDialogue
          titre={cible.k === 'astre' ? `Retirer ${nom} ?` : nom === '' ? 'Retirer cette zone ?' : `Retirer ${nom} ?`}
          texte={cible.k === 'astre' ? consequenceRetrait(fige, cible.astre, nbElements) : 'Cette zone sera retirée du système.'}
          action={libelle}
          enCours={enCours}
          onConfirmer={() => void retirer()}
          onFermer={() => { if (!enCours) { setFige(null); setEchec(undefined); } }}
        >
          {echec && (
            <MessageEchec echec={echec} onReessayer={() => void retirer()}
              onRecharger={() => { void recharger().finally(() => { setFige(null); setEchec(undefined); }); }} />
          )}
        </BoiteDialogue>
      )}
    </>
  );
}
