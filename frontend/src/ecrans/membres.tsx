import { ChevronDown, Trash2, UserPlus, ContactRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErreurApi, appeler, useConnexionPerdue } from '../api';
import { useCharge, useMoi, useUnivers } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { Role, UniversListe } from '../types';
import { Avatar, Bouton, BoiteDialogue, Champ, ChargementListe, ErreurChargement, PageIntrouvable, useToasts } from '../ui';
import './ecrans.css';
import './liste.css';
import './reglages.css';

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
  const { toast } = useToasts();
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

  if (membres.etat === 'chargement' || univers.etat === 'chargement') return <ChargementListe texte="Chargement des membres…" />;
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
    let nomAjoute = '';
    const ok = await ecrire('ajout', async () => {
      const m = await appeler<Membre>('POST', base, { username: identifiant.trim(), role: roleAjout });
      nomAjoute = m.username;
      setListe((l) => [...l, m].sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })));
    });
    if (ok) {
      setIdentifiant(''); // on failure the input is kept
      toast(`« ${nomAjoute} » ajouté`);
    }
  }

  async function changer(m: Membre, role: Role) {
    const ok = await ecrire(`role-${m.compteId}`, async () => {
      await appeler('PATCH', `${base}/${m.compteId}`, { role });
      setListe((l) => l.map((x) => (x.compteId === m.compteId ? { ...x, role } : x)));
    });
    if (ok) toast(`« ${m.username} » enregistré`);
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
    if (ok) toast(`« ${m.username} » retiré`);
    if (ok && m.username === monIdentifiant) {
      rechargerUnivers();
      navigate('/');
    }
  }

  return (
    <div className="page-liste">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <ContactRound size={20} strokeWidth={1.75} />
        </span>
        <h1>Membres</h1>
      </header>
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
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
      <ul className="suivi-liste liste-membres">
        {liste.map((m) => (
          <li key={m.compteId} className="ligne-suivi">
            <span className="grand">
              <Avatar nom={m.username} joueur={m.role !== 'mj'} />
              <span className="texte-ligne membre-nom" title={m.username}>
                {m.username}
              </span>
            </span>
            <span className={`champ-liste liste-statut-champ role-pastille ${m.role === 'mj' ? 'mj' : 'joueur'}`}>
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
            <span className="actions-revelees">
              <Bouton petit variante="danger" ecrit icone={Trash2} enCours={enCours === `retrait-${m.compteId}` && !aRetirer} onClick={() => setARetirer(m)} aria-label={`Retirer ${m.username}`}>
                Retirer
              </Bouton>
            </span>
          </li>
        ))}
      </ul>
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
    </div>
  );
}

export default { chemin: '/univers/:id/membres', composant: Membres } satisfies Ecran;
