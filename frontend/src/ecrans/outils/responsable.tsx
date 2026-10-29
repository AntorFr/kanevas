import { ArrowRightLeft, RotateCcw, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { appeler, ErreurApi, useConnexionPerdue } from '../../api';
import { BoiteDialogue, Bouton, ChargementListe, ErreurChargement, useToasts } from '../../ui';
import type { Responsable } from './types';
import './outils.css';

/** E-15's heading remains available on every tab, without loading the tools. */
export function ResponsableSysteme({ id }: { id: string }) {
  const [vue, setVue] = useState<Responsable>();
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [dialogue, setDialogue] = useState(false);
  const perdue = useConnexionPerdue();
  useEffect(() => {
    let actif = true;
    setErreur(false);
    appeler<Responsable>('GET', `/api/systemes/${id}/responsable`).then(
      (v) => { if (actif) setVue(v); },
      (e) => { if (actif && (!(e instanceof ErreurApi) || e.statut !== 404)) setErreur(true); },
    );
    return () => { actif = false; };
  }, [id, essai]);
  useEffect(() => {
    const frais = () => setEssai((n) => n + 1);
    window.addEventListener('kanevas:outils-modifies', frais);
    return () => window.removeEventListener('kanevas:outils-modifies', frais);
  }, []);
  if (erreur) return <ErreurChargement texte="Impossible de charger le responsable." onReessayer={() => setEssai((n) => n + 1)} />;
  if (!vue) return <p role="status">Chargement du responsable…</p>;
  return <div className="responsable-systeme">
    <span>{vue.responsable ? `Responsable : ${vue.responsable.vousEtes ? 'vous' : vue.responsable.nom}` : 'Aucun responsable : tout MJ d’un univers rattaché agit'}</span>
    {vue.ecriture && <Bouton petit icone={ArrowRightLeft} ecrit disabled={perdue} aria-haspopup="dialog" onClick={() => setDialogue(true)}>Transférer la responsabilité</Bouton>}
    {dialogue && <Transfert id={id} fermer={() => setDialogue(false)} termine={() => {
      setDialogue(false); setEssai((n) => n + 1);
    }} />}
  </div>;
}

function Transfert({ id, fermer, termine }: { id: string; fermer: () => void; termine: () => void }) {
  const [candidats, setCandidats] = useState<{ id: number; nom: string }[]>();
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [choix, setChoix] = useState<number>();
  const [attente, setAttente] = useState(false);
  const [echec, setEchec] = useState<string>();
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  useEffect(() => {
    let actif = true;
    setErreur(false); setCandidats(undefined);
    appeler<{ id: number; nom: string }[]>('GET', `/api/systemes/${id}/responsable/candidats`).then(
      (v) => { if (actif) { setCandidats(v); setChoix(v[0]?.id); } },
      () => { if (actif) setErreur(true); },
    );
    return () => { actif = false; };
  }, [id, essai]);
  const nom = candidats?.find((c) => c.id === choix)?.nom;
  async function transferer() {
    if (attente || perdue || choix === undefined || !nom) return;
    setAttente(true); setEchec(undefined);
    try {
      await appeler('POST', `/api/systemes/${id}/responsable`, { compteId: choix });
      window.dispatchEvent(new Event('kanevas:outils-modifies'));
      toast(`Responsabilité transférée à ${nom}.`);
      termine();
    } catch (e) {
      setEchec(e instanceof ErreurApi && [400, 403, 404].includes(e.statut) ? e.message : 'Enregistrement impossible.');
    } finally { setAttente(false); }
  }
  const vide = candidats?.length === 0;
  return <BoiteDialogue titre="Transférer la responsabilité" icone={Users} iconeAction={ArrowRightLeft} variante="mj"
    texte={nom ? `${nom} pourra activer les outils et régler le système ; vous gardez vos droits de MJ.` : 'Choisissez un MJ d’un univers rattaché.'}
    action={vide ? undefined : 'Transférer'} enCours={attente} desactive={!nom || perdue} onConfirmer={() => void transferer()} onFermer={() => { if (!attente) fermer(); }}>
    <div className={vide ? 'transfert-vide' : undefined}>
      {perdue && <p role="status" className="echec">Connexion perdue.</p>}
      {erreur ? <ErreurChargement texte="Impossible de charger les MJ." onReessayer={() => setEssai((n) => n + 1)} />
        : !candidats ? <ChargementListe texte="Chargement…" />
        : vide ? <p>Aucun autre MJ d’un univers de ce système.</p>
        : <div className="responsable-candidats" role="radiogroup" aria-label="Nouveau responsable">{candidats.map((c) => <label key={c.id}>
          <input type="radio" name="responsable" value={c.id} checked={choix === c.id} disabled={attente || perdue} onChange={() => setChoix(c.id)} />{c.nom}
        </label>)}</div>}
      {echec && <div role="alert" className="echec">{echec} <Bouton petit ecrit icone={RotateCcw} disabled={attente || perdue} onClick={() => void transferer()}>Réessayer</Bouton></div>}
    </div>
  </BoiteDialogue>;
}
