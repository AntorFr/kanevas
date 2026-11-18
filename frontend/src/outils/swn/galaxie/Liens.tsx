import { Link2, Link2Off, ImagePlus } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi } from '../../../api';
import { Alerte, Bouton, Champ, Fenetre, useToasts } from '../../../ui';
import { ListeLiens, useRechercheLiens, type FicheLien } from '../../../ui/liste-liens';
import { delierAstreFiche, delierZoneFiche, illustrerFicheAstre, lierAstreFiche, lierZoneFiche } from './ecriture';
import { MessageEchec, lireEchecEdition, useEdition, type EchecEdition } from './Edition';
import { nomAstre, nomFormation } from './systeme-libelles';
import type { AstreSysteme, FicheLiee, FormationSysteme } from './types';

/** The address of a sheet (E-9). */
export const adresseFiche = (universId: number, ficheId: number) => `/univers/${universId}/fiche/${ficheId}`;

/** « Fiche : <titre> », from the `fiche` of the answer and nowhere else; nothing for a body without a readable link. */
export function LigneFiche({ fiche }: { fiche?: FicheLiee | null }) {
  const { place } = useEdition();
  if (!fiche) return null;
  return <p className="gx-note cs-fiche">Fiche : <Link to={adresseFiche(place.universId, fiche.id)}>{fiche.titre}</Link></p>;
}

type Cible = { k: 'astre'; astre: AstreSysteme } | { k: 'zone'; zone: FormationSysteme };
const nomCible = (c: Cible) => (c.k === 'astre' ? nomAstre(c.astre) : nomFormation(c.zone));

/** « Lier à une fiche… » / « Changer la fiche liée… » and « Délier » (GM, E-23), plus « Illustrer la fiche » for a body. */
export function ActionsLien({ cible }: { cible: Cible }) {
  const { peutEcrire, avecAncrage, place, recharger } = useEdition();
  const { toast } = useToasts();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const [illustration, setIllustration] = useState<'repos' | 'cours' | 'echec'>('repos');
  if (!peutEcrire) return null;
  const el = cible.k === 'astre' ? cible.astre : cible.zone;
  const fiche = el.fiche ?? null;
  const cle = el.cle;

  async function delier() {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      const version = el.version ?? 1;
      const r = await avecAncrage((jeton) => (cible.k === 'astre'
        ? delierAstreFiche(place, cle, { version, ...jeton }) : delierZoneFiche(place, cle, { version, ...jeton })));
      if (r) toast('Lien retiré.');
    } catch (e) {
      const f = lireEchecEdition(e);
      setEchec(f);
      if (f.sorte === 'refus') toast(f.message);
    } finally {
      setEnCours(false);
    }
  }

  async function illustrer() {
    if (cible.k !== 'astre' || illustration === 'cours') return;
    setIllustration('cours');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cote = Math.max(64, Math.min(2048, Math.round(Math.min(window.innerWidth * 0.9, window.innerHeight * 0.65) * dpr)));
    try {
      const r = await illustrerFicheAstre(place, cle, cote);
      setIllustration('repos');
      toast(`Illustration ajoutée à ${r.titre}.`, { libelle: 'Ouvrir la fiche', href: adresseFiche(place.universId, r.ficheId) });
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'non_liee') void recharger();
      setIllustration('echec');
    }
  }

  return (
    <>
      <Bouton variante="mj" ecrit icone={Link2} onClick={() => setOuvert(true)}>{fiche ? 'Changer la fiche liée…' : 'Lier à une fiche…'}</Bouton>
      {fiche && <Bouton variante="mj" ecrit icone={Link2Off} enCours={enCours} onClick={() => void delier()}>Délier</Bouton>}
      {fiche && cible.k === 'astre' && (
        <Bouton variante="mj" ecrit icone={ImagePlus} enCours={illustration === 'cours'} onClick={() => void illustrer()}>
          {illustration === 'cours' ? 'Illustration en cours…' : 'Illustrer la fiche'}
        </Bouton>
      )}
      {illustration === 'echec' && (
        <Alerte action={<Bouton petit onClick={() => void illustrer()}>Réessayer</Bouton>}>L’illustration n’a pas pu être ajoutée.</Alerte>
      )}
      {echec && <MessageEchec echec={echec} onRecharger={() => void recharger()} onReessayer={() => void delier()} />}
      {ouvert && <DialogueLier cible={cible} onFermer={() => setOuvert(false)} />}
    </>
  );
}

/** « Lier <nom> à une fiche » (E-23): search over the sheets the GM reads, pick one, « Lier ». The anchoring dialog, if the system is drawn, comes at « Lier ». */
function DialogueLier({ cible, onFermer }: { cible: Cible; onFermer: () => void }) {
  const { avecAncrage, ancrageOuvert, place, recharger } = useEdition();
  const { toast } = useToasts();
  const [texte, setTexte] = useState('');
  const [choisie, setChoisie] = useState<FicheLien | null>(null);
  const [courant, setCourant] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const [disparue, setDisparue] = useState(false);
  const [recherche, reessayer] = useRechercheLiens(String(place.universId), texte, true);
  const el = cible.k === 'astre' ? cible.astre : cible.zone;
  const nom = nomCible(cible);

  async function lier() {
    if (!choisie || enCours) return;
    setEnCours(true);
    setEchec(undefined);
    setDisparue(false);
    try {
      const version = el.version ?? 1;
      const ficheId = choisie.id;
      const r = await avecAncrage((jeton) => (cible.k === 'astre'
        ? lierAstreFiche(place, el.cle, { ficheId, version, ...jeton }) : lierZoneFiche(place, el.cle, { ficheId, version, ...jeton })));
      if (r) { toast(`${nom} lié à ${choisie.titre}.`); onFermer(); }
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 400 && e.details?.champ === 'ficheId') { setDisparue(true); setChoisie(null); }
      else {
        const f = lireEchecEdition(e);
        setEchec(f);
        if (f.sorte === 'refus') { toast(f.message); onFermer(); }
      }
    } finally {
      setEnCours(false);
    }
  }

  const touche = (e: KeyboardEvent) => {
    if (recherche.etat !== 'ok' || recherche.fiches.length === 0) return;
    const n = recherche.fiches.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCourant((c) => (c + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCourant((c) => (c + n - 1) % n); }
    else if (e.key === 'Enter') { e.preventDefault(); const f = recherche.fiches[courant]; if (f) { setChoisie(f); setDisparue(false); } }
  };

  // The anchoring dialog stands over this one (one focus trap at a time); this one is shown again, as typed, if « Annuler ».
  if (ancrageOuvert) return null;
  return (
    <Fenetre titre={`Lier ${nom} à une fiche`} onFermer={() => { if (!enCours) onFermer(); }}>
      <Champ
        etiquette="Rechercher une fiche"
        value={texte}
        autoComplete="off"
        erreur={disparue ? 'Cette fiche n’existe plus.' : undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setTexte(e.target.value); setCourant(0); setDisparue(false); }}
        onKeyDown={touche}
      />
      <ListeLiens id="gx-liste-fiches" recherche={recherche} courant={courant} onCourant={setCourant}
        onChoisir={(f) => { setChoisie(f); setDisparue(false); }} onReessayer={reessayer} />
      {choisie && <p className="gx-note">Fiche choisie : {choisie.titre}</p>}
      {echec && <MessageEchec echec={echec} onRecharger={() => { void recharger().finally(onFermer); }} onReessayer={() => void lier()} />}
      <div className="boite-actions">
        <Bouton onClick={onFermer} disabled={enCours}>Annuler</Bouton>
        <Bouton variante="mj" ecrit enCours={enCours} disabled={!choisie} onClick={() => void lier()}>Lier</Bouton>
      </div>
    </Fenetre>
  );
}
