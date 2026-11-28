import { useState } from 'react';

import { ErreurApi, appeler } from '../../api';
import { Interrupteur, useToasts } from '../../ui';
import { iconeDeNom } from '../../types-contexte';
import './types-reglage.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_DROIT = 'Vous ne pouvez plus modifier ce système.';

/**
 * E-15, tab « Types de fiche »: one switch per settable type. The server owns the list and its words (AD-120):
 * they come with the system's read (`GET /api/systemes/:sid`), so a GM with no universe sees them too.
 */
export function OngletTypesSysteme({
  systemeId,
  systemeNom,
  actifs,
  nbUnivers,
  peutEcrire,
  onChange,
  onDroitPerdu,
}: {
  systemeId: string;
  systemeNom: string;
  actifs: { type: string; active: boolean; singulier: string; icone: string }[];
  nbUnivers: number;
  peutEcrire: boolean;
  onChange: (type: string, active: boolean) => void;
  onDroitPerdu: () => void;
}) {
  const { toast } = useToasts();
  const [attente, setAttente] = useState<string>();
  const [echec, setEchec] = useState<string>();

  async function basculer(t: { type: string; singulier: string }, active: boolean) {
    if (attente) return;
    setEchec(undefined);
    setAttente(t.type);
    onChange(t.type, active);
    try {
      await appeler('PUT', `/api/systemes/${systemeId}/types/${t.type}`, { active });
      toast(`${t.singulier} ${active ? 'activé' : 'désactivé'} pour ${systemeNom}.`);
    } catch (e) {
      onChange(t.type, !active);
      if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) {
        setEchec(PLUS_DROIT);
        onDroitPerdu();
      } else setEchec(ECHEC);
    } finally {
      setAttente(undefined);
    }
  }

  
  return (
    <>
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
      <div className="tete-col" aria-hidden="true">
        <span>Type</span>
        <span>Activé</span>
      </div>
      <ul className="types-sys">
        {actifs.map((t) => (
          <li key={t.type}>
            <Interrupteur
              etiquette={t.singulier}
              icone={iconeDeNom(t.icone)}
              coche={t.active}
              disabled={!peutEcrire || Boolean(attente)}
              ecrit
              onChange={(v) => void basculer(t, v)}
            />
          </li>
        ))}
      </ul>
      <p className="note-sys">
        Utilisé par {nbUnivers} univers. Un univers peut forcer un type à activé ou désactivé dans ses
        paramètres.
      </p>
    </>
  );
}
