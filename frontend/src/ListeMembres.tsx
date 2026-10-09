import { ChevronDown, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from './api';
import type { Role } from './types';
import { Avatar, Bouton, BoiteDialogue, Champ, useToasts } from './ui';
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
  entetes,
  formulaireApres,
}: {
  base: string;
  nomUnivers: string;
  membres: Membre[];
  apres?: (m: Membre, evenement: Evenement) => void;
  note?: ReactNode;
  /** Column headers (« Identifiant », « Rôle ») over the rows, as E-5 shows them. */
  entetes?: boolean;
  /** E-5 order: the list first, then the add form (with its note and failure message). E-4 keeps the form on top. */
  formulaireApres?: boolean;
}) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
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
      if (ajoute) {
        toast(`« ${ajoute.username} » ajouté`);
        apres?.(ajoute, 'ajout');
      }
    }
  }

  async function changer(m: Membre, role: Role) {
    const ok = await ecrire(`role-${m.compteId}`, async () => {
      await appeler('PATCH', `${base}/${m.compteId}`, { role });
      setListe((l) => l.map((x) => (x.compteId === m.compteId ? { ...x, role } : x)));
    });
    if (ok) {
      toast(`« ${m.username} » enregistré`);
      apres?.({ ...m, role }, 'role');
    }
  }

  async function retirer(m: Membre) {
    const ok = await ecrire(`retrait-${m.compteId}`, async () => {
      await appeler('DELETE', `${base}/${m.compteId}`);
      setListe((l) => l.filter((x) => x.compteId !== m.compteId));
    });
    setARetirer(undefined);
    if (ok) {
      toast(`« ${m.username} » retiré`);
      apres?.(m, 'retrait');
    }
  }

  const ajout = (
    <>
      <form className="formulaire-ligne" onSubmit={ajouter} noValidate aria-label="Ajouter un membre">
        <Champ
          etiquette="Identifiant du compte"
          placeholder="Identifiant du compte"
          value={identifiant}
          onChange={(e: { target: { value: string } }) => setIdentifiant(e.target.value)}
        />
        <Champ
          etiquette="Rôle"
          aria-label="Rôle"
          liste
          value={roleAjout}
          onChange={(e: { target: { value: string } }) => setRoleAjout(e.target.value as Role)}
        >
          <option value="joueur">Joueur</option>
          <option value="mj">MJ</option>
        </Champ>
        <Bouton type="submit" variante="principal" ecrit icone={UserPlus} enCours={enCours === 'ajout'}>
          Ajouter
        </Bouton>
      </form>
      {note}
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
    </>
  );

  return (
    <>
      {!formulaireApres && ajout}
      <div className={entetes ? 'table-membres' : undefined}>
      {entetes && (
        <div className="entetes-membres" aria-hidden="true">
          <span>Identifiant</span>
          <span>Rôle</span>
        </div>
      )}
      <ul className="suivi-liste liste-membres">
        {liste.map((m) => (
          <li key={m.compteId} className="ligne-suivi">
            <span className="grand">
              <Avatar nom={m.username} joueur={m.role !== 'mj'} />
              <span className="texte-ligne identifiant-membre" title={m.username}>
                {m.username}
              </span>
            </span>
            <span className={`champ-liste liste-statut-champ ${m.role === 'mj' ? 'mj' : 'table'}`}>
              <select
                className="liste-statut"
                aria-label={`Rôle de ${m.username}`}
                value={m.role}
                disabled={enCours === `role-${m.compteId}` || perdue}
                onChange={(e) => changer(m, e.target.value as Role)}
              >
                <option value="joueur">Joueur</option>
                <option value="mj">MJ</option>
              </select>
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <Bouton petit variante="fantome" className="retirer-membre" ecrit icone={Trash2} enCours={enCours === `retrait-${m.compteId}` && !aRetirer} onClick={() => setARetirer(m)} aria-label={`Retirer ${m.username}`}>
              Retirer
            </Bouton>
          </li>
        ))}
      </ul>
      </div>
      {formulaireApres && ajout}
      {aRetirer && (
        <BoiteDialogue
          titre={`Retirer ${aRetirer.username} de ${nomUnivers} ?`}
          texte="Elle ne verra plus l’univers."
          action={`Retirer ${aRetirer.username}`}
          enCours={enCours === `retrait-${aRetirer.compteId}`}
          onConfirmer={() => retirer(aRetirer)}
          onFermer={() => setARetirer(undefined)}
        />
      )}
    </>
  );
}
