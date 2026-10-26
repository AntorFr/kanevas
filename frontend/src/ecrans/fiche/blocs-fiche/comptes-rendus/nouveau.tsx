import { useCallback, useState, type FormEvent } from 'react';
import { NotebookPen, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { appeler, useConnexionPerdue } from '../../../../api';
import { Bouton, Champ, Fenetre, useToasts } from '../../../../ui';
import type { Fiche } from '../../types';

interface Brouillon { titre: string; texte: string }

/** Like a section draft, a report survives session expiry; storage can be unavailable. */
export function lireBrouillon(cle: string | undefined): Brouillon | undefined {
  if (!cle) return undefined;
  try {
    const b: unknown = JSON.parse(sessionStorage.getItem(cle) ?? 'null');
    if (b && typeof b === 'object' && 'titre' in b && typeof b.titre === 'string' && 'texte' in b && typeof b.texte === 'string') {
      return { titre: b.titre, texte: b.texte };
    }
  } catch { /* Storage unavailable: keep the draft in memory. */ }
  return undefined;
}

export function NouveauCompteRendu({ universId, ficheId, cleBrouillon, onFermer }: {
  universId: string;
  ficheId: number;
  cleBrouillon?: string;
  onFermer: () => void;
}) {
  const [brouillon] = useState(() => lireBrouillon(cleBrouillon));
  const [titre, setTitre] = useState(brouillon?.titre ?? '');
  const [texte, setTexte] = useState(brouillon?.texte ?? '');
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [erreurTexte, setErreurTexte] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const perdue = useConnexionPerdue();
  const naviguer = useNavigate();
  const { toast } = useToasts();

  function garder(titre: string, texte: string) {
    if (!cleBrouillon) return;
    try { sessionStorage.setItem(cleBrouillon, JSON.stringify({ titre, texte })); }
    catch { /* The current fields still keep the draft. */ }
  }

  function effacer() {
    if (!cleBrouillon) return;
    try { sessionStorage.removeItem(cleBrouillon); }
    catch { /* Storage unavailable. */ }
  }

  const annuler = useCallback(() => {
    if (enCours) return;
    try { if (cleBrouillon) sessionStorage.removeItem(cleBrouillon); }
    catch { /* Storage unavailable. */ }
    onFermer();
  }, [enCours, cleBrouillon, onFermer]);

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours || perdue) return;
    const nom = titre.trim();
    const et = !nom ? 'Donnez un titre.' : nom.length > 120 ? '120 caractères au plus.' : undefined;
    const ex = texte.length > 100000 ? '100 000 caractères au plus.' : undefined;
    setErreurTitre(et);
    setErreurTexte(ex);
    if (et || ex) return;
    garder(titre, texte);
    setEchec(false);
    setEnCours(true);
    try {
      const cr = await appeler<Fiche>('POST', `/api/univers/${universId}/comptes-rendus`, { campagneId: ficheId, titre: nom, texte });
      effacer();
      toast(`« ${nom} » créé`);
      naviguer(`/univers/${universId}/fiche/${cr.id}`);
    } catch { setEchec(true); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre titre="Nouveau compte-rendu" icone={NotebookPen} onFermer={annuler}>
      <form onSubmit={creer} noValidate>
        <Champ etiquette="Titre" value={titre} disabled={enCours} erreur={erreurTitre} onChange={(e: { target: { value: string } }) => {
          setTitre(e.target.value); garder(e.target.value, texte);
        }} />
        <Champ etiquette="Texte" zone facultatif value={texte} rows={10} disabled={enCours} erreur={erreurTexte}
          compteur={`${texte.length.toLocaleString('fr-FR')} / 100 000`} trop={texte.length > 100000}
          onChange={(e: { target: { value: string } }) => { setTexte(e.target.value); garder(titre, e.target.value); }} />
        {echec && <div className="echec" role="alert">Le compte-rendu n'a pas pu être créé. Réessayez.</div>}
        <div className="boutons">
          <Bouton icone={X} disabled={enCours} onClick={annuler}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" icone={Plus} ecrit enCours={enCours}>Créer</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
