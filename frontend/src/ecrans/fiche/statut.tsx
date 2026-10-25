import { Check, ChevronDown, CircleCheck, CircleDashed, CirclePlay, Flag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { appeler, useConnexionPerdue } from '../../api';
import { Menu, useToasts } from '../../ui';
import type { Fiche } from './types';
import './statut.css';

/** The four wire values of AD-123, with their public labels and icons. */
export const STATUTS_AVENTURE = {
  en_preparation: { libelle: 'En préparation', icone: CircleDashed },
  prete: { libelle: 'Prête', icone: Flag },
  en_cours: { libelle: 'En cours', icone: CirclePlay },
  terminee: { libelle: 'Terminée', icone: CircleCheck },
} as const;

export type Statut = keyof typeof STATUTS_AVENTURE;

/** Unknown address values mean « Tous », never an invalid request to the API. */
export function statutValide(valeur: string | null | undefined): Statut | '' {
  return valeur && Object.hasOwn(STATUTS_AVENTURE, valeur) ? valeur as Statut : '';
}

export function BadgeStatutAventure({ statut, chevron = false }: { statut: Statut; chevron?: boolean }) {
  const { libelle, icone: Icone } = STATUTS_AVENTURE[statut];
  return (
    <span className={`pastille statut-aventure ${statut}`}>
      <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
      {libelle}
      {chevron && <ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />}
    </span>
  );
}

/** E-8/E-9: read-only by default; the caller grants editing only to a GM outside player mode.
 * Keep the old badge until PATCH succeeds. The response also updates the carrying list/filter.
 */
export function StatutAventure({ universId, fiche, gestion = false, onChange }: {
  universId: string | number;
  fiche: Fiche;
  gestion?: boolean;
  onChange?: (fiche: Fiche) => void;
}) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const [statut, setStatut] = useState(statutValide(fiche.charge.statut));
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    setStatut(statutValide(fiche.charge.statut));
    setEchec(false);
  }, [fiche.id, fiche.charge.statut]);

  if (fiche.type !== 'aventure' || statut === '') return null;

  async function changer(s: Statut) {
    if (!gestion || perdue || enCours || s === statut) return;
    setEnCours(true);
    setEchec(false);
    try {
      const maj = await appeler<Fiche>('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { statut: s });
      setStatut(statutValide(maj.charge.statut));
      onChange?.(maj);
      toast(`Statut de « ${fiche.titre} » : ${STATUTS_AVENTURE[s].libelle}.`);
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  if (!gestion) return <BadgeStatutAventure statut={statut} />;
  return (
    <div className="statut-aventure-controle" aria-busy={enCours || undefined} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        etiquette={`Statut de ${fiche.titre}`}
        desactive={perdue || enCours}
        declencheur={<>
          <BadgeStatutAventure statut={statut} chevron />
          <span className="cache-lecteur"> — changer le statut de « {fiche.titre} »</span>
        </>}
        entrees={(Object.keys(STATUTS_AVENTURE) as Statut[]).map((s) => ({
          libelle: STATUTS_AVENTURE[s].libelle,
          icone: s === statut ? Check : STATUTS_AVENTURE[s].icone,
          impossible: perdue || enCours,
          onChoisir: () => void changer(s),
        }))}
      />
      {echec && <span className="echec-statut" role="alert">L'action n'a pas abouti. Réessayez.</span>}
    </div>
  );
}
