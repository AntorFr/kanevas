import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { ErreurApi, appeler } from '../../api';
import { useCharge } from '../../cadre-contexte';
import type { Membre } from '../../ListeMembres';
import { Avatar, Bouton, BoiteDialogue, Champ, Chargement, ErreurChargement, useToasts } from '../../ui';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/** E-15 « MJ du système » (instance admin, AD-152, B-114): add a GM by identifier, remove one — the last included. */
export function OngletMJSysteme({ id, nom }: { id: string; nom: string }) {
  const base = `/api/instance/systemes/${id}/membres`;
  const [mj, recharger] = useCharge<Membre[]>(base);
  const { toast } = useToasts();
  const [identifiant, setIdentifiant] = useState('');
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState<string>();
  const [aRetirer, setARetirer] = useState<Membre>();

  async function ecrire(cle: string, action: () => Promise<void>): Promise<boolean> {
    if (enCours) return false;
    setEnCours(cle);
    setEchec(undefined);
    try {
      await action();
      return true;
    } catch (e) {
      setEchec(e instanceof ErreurApi && e.statut === 400 ? e.message : ECHEC);
      return false;
    } finally {
      setEnCours(undefined);
    }
  }

  if (mj.etat === 'chargement') return <Chargement texte="Chargement des MJ…" />;
  if (mj.etat === 'erreur') return <ErreurChargement texte="Impossible de charger les MJ du système." onReessayer={recharger} />;

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (identifiant.trim() === '') return;
    const ok = await ecrire('ajout', async () => {
      await appeler<Membre>('POST', base, { username: identifiant.trim() });
    });
    if (ok) {
      toast(`« ${identifiant.trim()} » ajouté`);
      setIdentifiant('');
      recharger();
    }
  }

  async function retirer(m: Membre) {
    const ok = await ecrire(`retrait-${m.compteId}`, async () => {
      await appeler('DELETE', `${base}/${m.compteId}`);
    });
    setARetirer(undefined);
    if (ok) {
      toast(`« ${m.username} » retiré`);
      recharger();
    }
  }

  return (
    <div className="mj-systeme">
      {mj.valeur.length === 0 ? (
        <p className="note-admin">Aucun MJ : personne ne peut modifier les éléments de ce système.</p>
      ) : (
        <ul className="suivi-liste liste-membres">
          {mj.valeur.map((m) => (
            <li key={m.compteId} className="ligne-suivi">
              <span className="grand">
                <Avatar nom={m.username} />
                <span className="texte-ligne membre-nom identifiant-membre" title={m.username}>{m.username}</span>
              </span>
              <span className="actions-revelees">
                <Bouton petit variante="fantome" className="retirer-membre" ecrit icone={Trash2} onClick={() => setARetirer(m)} aria-label={`Retirer ${m.username}`}>
                  Retirer
                </Bouton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="formulaire-ligne" onSubmit={ajouter} noValidate aria-label="Ajouter un MJ">
        <Champ
          etiquette="Identifiant du compte"
          placeholder="Identifiant du compte"
          value={identifiant}
          onChange={(e: { target: { value: string } }) => setIdentifiant(e.target.value)}
        />
        <Bouton type="submit" variante="principal" ecrit icone={UserPlus} enCours={enCours === 'ajout'}>
          Ajouter
        </Bouton>
      </form>
      {echec && <div className="echec" role="alert">{echec}</div>}
      {aRetirer && (
        <BoiteDialogue
          titre={`Retirer ${aRetirer.username} des MJ de ${nom} ?`}
          texte="Elle ne pourra plus modifier les éléments de ce système."
          action={`Retirer ${aRetirer.username}`}
          enCours={enCours === `retrait-${aRetirer.compteId}`}
          onConfirmer={() => retirer(aRetirer)}
          onFermer={() => setARetirer(undefined)}
        />
      )}
    </div>
  );
}
