import { Check, Pencil, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

import { ErreurApi, useConnexionPerdue } from '../../api';
import { Bouton, Champ } from '../../ui';
import { afficher, origine, type Niveau, type Reglage, type Resolue, type Valeur } from './types';

/** Keep the opening version, even when another card refreshes: stale edits must be refused. */
export function LigneReglage({ reglage, valeur, niveau, version, ecriture, occupe, enregistrer, recharger }: {
  reglage: Reglage; valeur: Resolue; niveau: Niveau; version: number; ecriture: boolean; occupe: boolean;
  enregistrer: (valeurs: Record<string, Valeur | null>, version: number) => Promise<void>;
  recharger: () => Promise<void>;
}) {
  const perdue = useConnexionPerdue();
  const [edition, setEdition] = useState<{ valeur: Valeur; version: number }>();
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [invalide, setInvalide] = useState(false);
  const [perime, setPerime] = useState(false);
  const [reprise, setReprise] = useState<() => void>();
  const disabled = perdue || occupe || attente;
  const forme = reglage.forme;

  async function sauver(v: Valeur | null, vOrigine: number) {
    if (disabled) return;
    setAttente(true);
    setErreur(undefined);
    setInvalide(false);
    setPerime(false);
    setReprise(undefined);
    try {
      await enregistrer({ [reglage.nom]: v }, vOrigine);
      setEdition(undefined);
    } catch (e) {
      const stale = e instanceof ErreurApi && e.code === 'version';
      setInvalide(e instanceof ErreurApi && e.statut === 400);
      setPerime(stale);
      setErreur(stale ? 'Ce réglage a changé depuis que vous l’avez ouvert.'
        : e instanceof ErreurApi && e.statut === 400 ? e.message
        : e instanceof ErreurApi && (e.statut === 403 || e.statut === 404) ? 'Vous ne pouvez plus modifier ces valeurs.'
        : 'Enregistrement impossible.');
      if (!(e instanceof ErreurApi) || e.statut === 0 || e.statut >= 500) setReprise(() => () => void sauver(v, vOrigine));
    } finally { setAttente(false); }
  }

  return <div className="outil-reglage">
    <div className="outil-valeur">
      <div><strong>{reglage.libelle}</strong>{reglage.aide && <p>{reglage.aide}</p>}</div>
      <span className="outil-origine">{origine(valeur)}</span>
      {ecriture && !reglage.protege && !edition && <Bouton petit ecrit icone={Pencil} disabled={disabled} onClick={() => {
        setEdition({ valeur: valeur.valeur, version }); setErreur(undefined); setPerime(false); setReprise(undefined);
      }}>{niveau === 'univers' ? 'Remplacer pour l’univers' : 'Remplacer'}</Bouton>}
    </div>
    {ecriture && edition && <form className="outil-edition" noValidate onSubmit={(e) => { e.preventDefault(); void sauver(edition.valeur, edition.version); }}>
      {forme.type === 'booleen' || forme.type === 'choix' ? <Champ etiquette={reglage.libelle} erreur={invalide ? erreur : undefined} liste disabled={disabled}
        value={String(edition.valeur)} onChange={(e: { target: { value: string } }) => setEdition({ ...edition, valeur: forme.type === 'booleen' ? e.target.value === 'true' : e.target.value })}>
        {forme.type === 'booleen' ? <><option value="true">Oui</option><option value="false">Non</option></>
          : forme.valeurs.map((v) => <option key={v}>{v}</option>)}
      </Champ> : <Champ etiquette={reglage.libelle} erreur={invalide ? erreur : undefined} disabled={disabled} required value={edition.valeur}
        type={forme.type === 'nombre' ? 'number' : 'text'} min={forme.type === 'nombre' ? forme.min : undefined}
        max={forme.type === 'nombre' ? forme.max : undefined} step={forme.type === 'nombre' ? (forme.entier ? 1 : 'any') : undefined}
        maxLength={forme.type === 'texte' ? forme.max : undefined}
        onChange={(e: { target: { value: string } }) => setEdition({ ...edition, valeur: forme.type === 'nombre' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />}
      <div className="actions"><Bouton type="submit" variante="principal" icone={Check} ecrit disabled={disabled}>Enregistrer</Bouton>
        <Bouton icone={X} disabled={attente} onClick={() => { setEdition(undefined); setErreur(undefined); setPerime(false); setReprise(undefined); }}>Annuler</Bouton></div>
    </form>}
    {ecriture && niveau === 'univers' && valeur.origine === 'univers' && !reglage.protege && <Bouton petit ecrit icone={RotateCcw} disabled={disabled}
      onClick={() => void sauver(null, edition?.version ?? version)}>Revenir à la valeur du système</Bouton>}
    {attente && <p role="status">Enregistrement… {edition ? afficher(edition.valeur) : ''}</p>}
    {erreur && !invalide && <div className="echec" role="alert">{erreur} {perime && <Bouton petit icone={RotateCcw} onClick={async () => {
      await recharger(); setEdition(undefined); setErreur(undefined); setPerime(false);
    }}>Recharger</Bouton>}{reprise && <Bouton petit ecrit disabled={disabled} onClick={reprise}>Réessayer</Bouton>}</div>}
  </div>;
}
