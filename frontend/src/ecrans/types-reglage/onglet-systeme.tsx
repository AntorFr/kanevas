import { useEffect, useState } from 'react';

import { ErreurApi, appeler } from '../../api';
import { Interrupteur, ChargementListe, ErreurChargement, useToasts } from '../../ui';
import { iconeDeNom, type TypeVue } from '../../types-contexte';
import './types-reglage.css';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_DROIT = 'Vous ne pouvez plus modifier ce système.';

/**
 * E-15, tab « Types de fiche »: one switch per settable type. The labels come from the list of one
 * of the caller's universes (the server owns the list, AD-113); the on/off state from the system.
 */
export function OngletTypesSysteme({
  systemeId,
  systemeNom,
  universId,
  actifs,
  nbUnivers,
  peutEcrire,
  onChange,
  onDroitPerdu,
}: {
  systemeId: string;
  systemeNom: string;
  universId: number | undefined;
  actifs: { type: string; active: boolean }[];
  nbUnivers: number;
  peutEcrire: boolean;
  onChange: (type: string, active: boolean) => void;
  onDroitPerdu: () => void;
}) {
  const { toast } = useToasts();
  const [liste, setListe] = useState<TypeVue[]>();
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [attente, setAttente] = useState<string>();
  const [echec, setEchec] = useState<string>();

  useEffect(() => {
    if (universId === undefined) return;
    let actif = true;
    setErreur(false);
    appeler<TypeVue[]>('GET', `/api/univers/${universId}/types`).then(
      (l) => actif && setListe(l.filter((t) => t.reglable)),
      () => actif && setErreur(true),
    );
    return () => {
      actif = false;
    };
  }, [universId, essai]);

  async function basculer(t: TypeVue, active: boolean) {
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

  if (erreur) return <ErreurChargement texte="Impossible de charger les types." onReessayer={() => setEssai((n) => n + 1)} />;
  if (!liste) return <ChargementListe texte="Chargement des types…" />;
  const etat = new Map(actifs.map((a) => [a.type, a.active]));

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
        {liste.map((t) => (
          <li key={t.type}>
            <Interrupteur
              etiquette={t.singulier}
              icone={iconeDeNom(t.icone)}
              coche={etat.get(t.type) ?? true}
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
