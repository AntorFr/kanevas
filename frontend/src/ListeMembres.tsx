import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from './api';
import type { Role } from './types';
import { Bouton } from './ui';
import './ecrans/ecrans.css';

export interface Membre {
  compteId: number;
  username: string;
  role: Role;
}

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** A refusal of the rules (400) carries its exact text; anything else is a generic failure. */
function messageEchec(e: unknown): string {
  return e instanceof ErreurApi && e.statut === 400 ? e.message : ECHEC;
}

export type Evenement = 'ajout' | 'role' | 'retrait';

/**
 * Member list shared by E-4 (GM, `/api/univers/:id/membres`) and E-5 (instance admin,
 * `/api/instance/univers/:id/membres`): list, add by identifier, change a role, remove after
 * confirmation. `apres` runs after a successful write, so each screen decides what a change
 * of the viewer's own membership means.
 */
export function ListeMembres({
  base,
  nomUnivers,
  membres,
  apres,
  note,
}: {
  base: string;
  nomUnivers: string;
  membres: Membre[];
  apres?: (m: Membre, evenement: Evenement) => void;
  note?: ReactNode;
}) {
  const perdue = useConnexionPerdue();
  const [liste, setListe] = useState<Membre[]>(membres);
  const [identifiant, setIdentifiant] = useState('');
  const [roleAjout, setRoleAjout] = useState<Role>('joueur');
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState<string>();
  const [aRetirer, setARetirer] = useState<Membre>();

  useEffect(() => setListe(membres), [membres]);

  async function ecrire(cle: string, action: () => Promise<void>): Promise<boolean> {
    if (enCours) return false;
    setEnCours(cle);
    setEchec(undefined);
    try {
      await action();
      return true;
    } catch (e) {
      setEchec(messageEchec(e));
      return false;
    } finally {
      setEnCours(undefined);
    }
  }

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (identifiant.trim() === '') return;
    let ajoute: Membre | undefined;
    const ok = await ecrire('ajout', async () => {
      const m = await appeler<Membre>('POST', base, { username: identifiant.trim(), role: roleAjout });
      ajoute = m;
      setListe((l) => [...l, m].sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })));
    });
    if (ok) {
      setIdentifiant(''); // on failure the input is kept
      if (ajoute) apres?.(ajoute, 'ajout');
    }
  }

  async function changer(m: Membre, role: Role) {
    const ok = await ecrire(`role-${m.compteId}`, async () => {
      await appeler('PATCH', `${base}/${m.compteId}`, { role });
      setListe((l) => l.map((x) => (x.compteId === m.compteId ? { ...x, role } : x)));
    });
    if (ok) apres?.({ ...m, role }, 'role');
  }

  async function retirer(m: Membre) {
    const ok = await ecrire(`retrait-${m.compteId}`, async () => {
      await appeler('DELETE', `${base}/${m.compteId}`);
      setListe((l) => l.filter((x) => x.compteId !== m.compteId));
    });
    setARetirer(undefined);
    if (ok) apres?.(m, 'retrait');
  }

  return (
    <>
      <form className="ajout-membre" onSubmit={ajouter} noValidate>
        <input
          aria-label="Identifiant du compte"
          placeholder="Identifiant du compte"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
        />
        <select aria-label="Rôle" value={roleAjout} onChange={(e) => setRoleAjout(e.target.value as Role)}>
          <option value="joueur">Joueur</option>
          <option value="mj">MJ</option>
        </select>
        <Bouton type="submit" variante="principal" ecrit enCours={enCours === 'ajout'}>
          Ajouter
        </Bouton>
      </form>
      {note}
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
      <ul className="liste-membres">
        {liste.map((m) => (
          <li key={m.compteId}>
            <span className="identifiant" title={m.username}>
              {m.username}
            </span>
            <select
              aria-label={`Rôle de ${m.username}`}
              value={m.role}
              disabled={enCours === `role-${m.compteId}` || perdue}
              onChange={(e) => changer(m, e.target.value as Role)}
            >
              <option value="joueur">Joueur</option>
              <option value="mj">MJ</option>
            </select>
            <Bouton petit variante="danger" ecrit enCours={enCours === `retrait-${m.compteId}` && !aRetirer} onClick={() => setARetirer(m)} aria-label={`Retirer ${m.username}`}>
              Retirer
            </Bouton>
          </li>
        ))}
      </ul>
      {aRetirer && (
        <div className="confirmation" role="alertdialog" aria-label="Confirmer le retrait">
          <p>
            <strong>
              Retirer {aRetirer.username} de {nomUnivers} ?
            </strong>{' '}
            Elle ne verra plus l’univers.
          </p>
          <div className="actions">
            <Bouton variante="danger" ecrit onClick={() => retirer(aRetirer)} aria-label={`Retirer ${aRetirer.username}`}>
              Retirer
            </Bouton>
            <Bouton onClick={() => setARetirer(undefined)}>Annuler</Bouton>
          </div>
        </div>
      )}
    </>
  );
}
