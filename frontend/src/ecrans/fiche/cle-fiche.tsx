import { Check, Copy, Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { Bouton, Champ, useToasts } from '../../ui';
import type { FicheVue } from './types';

const FORME = 'Lettres minuscules, chiffres, - et _, un « : » au plus, avec au moins une lettre.';
const PRISE = 'Cette clé existe déjà dans l’univers.';
const ECHEC = 'Impossible d’enregistrer la clé. Réessayez.';
const PLUS_MJ = 'Vous ne pouvez plus modifier cette fiche.';

/** E-9: the readable key of the sheet, under the title; only a GM outside player mode gets it (B-99, AD-146). */
export function CleFiche({ universId, fiche, gestion, rafraichir, onDroitPerdu }: {
  universId: string;
  fiche: FicheVue;
  gestion: boolean;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
}) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const [copiee, setCopiee] = useState(false);
  const verrou = useRef(false);
  const champ = useRef<HTMLDivElement>(null);
  const lecture = useRef<HTMLDivElement>(null);
  const cle = fiche.cle;

  useEffect(() => {
    if (edition) champ.current?.querySelector('input')?.focus();
  }, [edition]);
  useEffect(() => {
    if (!copiee) return;
    const t = setTimeout(() => setCopiee(false), 2000);
    return () => clearTimeout(t);
  }, [copiee]);

  if (!gestion || cle === undefined) return null;

  async function copier() {
    try {
      await navigator.clipboard.writeText(cle!);
      setCopiee(true);
    } catch {
      toast('Impossible de copier. Sélectionnez la clé à la main.');
    }
  }

  function fermer() {
    setEdition(false);
    setErreur(undefined);
    requestAnimationFrame(() => lecture.current?.querySelectorAll('button')[1]?.focus());
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const nouvelle = valeur.trim();
    if (verrou.current || perdue || nouvelle === cle) return;
    verrou.current = true;
    setEnCours(true);
    setErreur(undefined);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { cle: nouvelle });
      // The sheet screen replaces the address when the new key comes back.
      await rafraichir();
      setEdition(false);
      toast('Enregistré.');
    } catch (err) {
      if (err instanceof ErreurApi && err.statut === 409 && err.code === 'cle_prise') setErreur(PRISE);
      else if (err instanceof ErreurApi && err.statut === 400) setErreur(FORME);
      else if (err instanceof ErreurApi && (err.statut === 403 || err.statut === 404)) {
        setEdition(false);
        onDroitPerdu();
        toast(PLUS_MJ);
      } else setErreur(ECHEC);
    } finally {
      verrou.current = false;
      setEnCours(false);
      requestAnimationFrame(() => champ.current?.querySelector('input')?.focus());
    }
  }

  if (!edition) {
    return (
      <div className="cle-fiche">
        <code className="cle-fiche-valeur">{cle}</code>
        <div className="cle-fiche-actions" ref={lecture}>
          <Bouton petit variante="fantome" icone={copiee ? Check : Copy} onClick={() => void copier()}>
            {copiee ? 'Copiée.' : 'Copier'}
          </Bouton>
          <Bouton
            petit
            variante="fantome"
            icone={Pencil}
            disabled={perdue}
            onClick={() => { setValeur(cle); setErreur(undefined); setEdition(true); }}
          >
            Modifier la clé…
          </Bouton>
        </div>
      </div>
    );
  }

  return (
    <form className="cle-fiche edition" onSubmit={enregistrer} noValidate onKeyDown={(e) => e.key === 'Escape' && !enCours && fermer()}>
      <div ref={champ}>
        <Champ
          etiquette="Clé de la fiche"
          value={valeur}
          erreur={erreur}
          readOnly={enCours}
          autoComplete="off"
          spellCheck={false}
          onChange={(e: { target: { value: string } }) => { setValeur(e.target.value); setErreur(undefined); }}
        />
      </div>
      <p className="cle-fiche-avertissement">
        Les liens et outils qui citent {cle} ne la retrouveront plus par cette clé ; l’ancienne clé continuera de mener ici.
      </p>
      <div className="boutons">
        <Bouton onClick={fermer} disabled={enCours}>Annuler</Bouton>
        <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={perdue || valeur.trim() === cle}>
          Enregistrer
        </Bouton>
      </div>
    </form>
  );
}
