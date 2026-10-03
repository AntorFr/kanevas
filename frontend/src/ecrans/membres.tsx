import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErreurApi, appeler, useConnexionPerdue } from '../api';
import { useCharge, useMoi, useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { Role, UniversListe } from '../types';
import { Bouton, Chargement, ErreurChargement, PageIntrouvable } from '../ui';
import './ecrans.css';

interface Membre {
  compteId: number;
  username: string;
  role: Role;
}

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** A refusal of the rules (400) carries its exact text; anything else is a generic failure. */
function messageEchec(e: unknown): string {
  return e instanceof ErreurApi && e.statut === 400 ? e.message : ECHEC;
}

/** E-4 Membres (GM only): list, add by identifier, change a role, remove after confirmation. */
function Membres() {
  const { id } = useParams();
  const navigate = useNavigate();
  const perdue = useConnexionPerdue();
  const moi = useMoi();
  const { recharger: rechargerUnivers } = useUnivers();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [membres, recharger] = useCharge<Membre[]>(`/api/univers/${id}/membres`);
  const [liste, setListe] = useState<Membre[]>([]);
  const [identifiant, setIdentifiant] = useState('');
  const [roleAjout, setRoleAjout] = useState<Role>('joueur');
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState<string>();
  const [aRetirer, setARetirer] = useState<Membre>();

  useEffect(() => {
    if (membres.etat === 'ok') setListe(membres.valeur);
  }, [membres]);

  if (membres.etat === 'chargement' || univers.etat === 'chargement') return <Chargement texte="Chargement des membres…" />;
  // A player, or an unknown universe: the same answer.
  if (membres.etat === 'erreur' && membres.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (membres.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger les membres." onReessayer={recharger} />;
  }
  const nomUnivers = univers.valeur.nom;
  const monIdentifiant = moi.etat === 'ok' ? moi.valeur.username : undefined;
  const base = `/api/univers/${id}/membres`;

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
    const ok = await ecrire('ajout', async () => {
      const m = await appeler<Membre>('POST', base, { username: identifiant.trim(), role: roleAjout });
      setListe((l) => [...l, m].sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })));
    });
    if (ok) setIdentifiant(''); // on failure the input is kept
  }

  async function changer(m: Membre, role: Role) {
    const ok = await ecrire(`role-${m.compteId}`, async () => {
      await appeler('PATCH', `${base}/${m.compteId}`, { role });
      setListe((l) => l.map((x) => (x.compteId === m.compteId ? { ...x, role } : x)));
    });
    if (ok && m.username === monIdentifiant && role !== 'mj') {
      rechargerUnivers();
      navigate('/'); // no longer a GM: this screen is not ours any more
    }
  }

  async function retirer(m: Membre) {
    const ok = await ecrire(`retrait-${m.compteId}`, async () => {
      await appeler('DELETE', `${base}/${m.compteId}`);
      setListe((l) => l.filter((x) => x.compteId !== m.compteId));
    });
    setARetirer(undefined);
    if (ok && m.username === monIdentifiant) {
      rechargerUnivers();
      navigate('/');
    }
  }

  return (
    <>
      <h1>Membres</h1>
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
            <Bouton petit variante="danger" ecrit enCours={enCours === `retrait-${m.compteId}` && !aRetirer} onClick={() => setARetirer(m)}>
              {`Retirer ${m.username}`}
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
            <Bouton variante="danger" ecrit onClick={() => retirer(aRetirer)}>
              {`Retirer ${aRetirer.username}`}
            </Bouton>
            <Bouton onClick={() => setARetirer(undefined)}>Annuler</Bouton>
          </div>
        </div>
      )}
    </>
  );
}

export default { chemin: '/univers/:id/membres', composant: Membres } satisfies Ecran;
