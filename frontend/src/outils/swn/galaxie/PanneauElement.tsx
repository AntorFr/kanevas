import { Move, Pencil, Trash2, Orbit } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { BoiteDialogue, Bouton, Interrupteur, Pastille, useToasts } from '../../../ui';
import { retirerElementSysteme, reserverElementSysteme } from './ecriture';
import { lireEchecElement } from './echec-element';
import { MessageEchec, useEdition, type EchecEdition } from './Edition';
import { LigneFiche } from './Liens';
import { IconeElement } from './MarqueElement';
import { libelleGenreElement, nomElement, placeElement } from './systeme-libelles';
import type { ElementSysteme, InterieurSysteme } from './types';

/** E-23, the panel of an element: the same for a GM and a player (who never gets `reserve` nor `version`), plus the GM's `actions`. */
export default function PanneauElement({ element, interieur, actions }: { element: ElementSysteme; interieur: InterieurSysteme; actions?: ReactNode }) {
  const nom = nomElement(element);
  return (
    <section className="gx-bloc gx-panneau cs-panneau" aria-label="Élément sélectionné">
      <div className="gx-tete">
        <span className="cs-pastille-element" data-couleur={element.aspect.couleur}><IconeElement icone={element.aspect.icone} taille={16} /></span>
        <h2 title={nom} className="cs-nom">{nom}</h2>
        {element.reserve && <Pastille sens="mj">MJ seul</Pastille>}
      </div>
      <dl className="gx-kv">
        <dt>Genre</dt><dd>{libelleGenreElement(element.genre)}</dd>
        <dt>Lieu</dt><dd>{placeElement(element, interieur.astres)}</dd>
        {element.description && <><dt>Description</dt><dd className="gx-notes">{element.description}</dd></>}
      </dl>
      <p className="gx-note">Hexagone {interieur.q}, {interieur.r}</p>
      <LigneFiche fiche={element.fiche} />
      {actions && <div className="gx-actions">{actions}</div>}
    </section>
  );
}

/** The GM's gestures on an element: the forms are opened by the page (`onOuvrir`), the switch and the removal are here. */
export function ActionsElement({ element, onOuvrir, onRetire, children }: {
  element: ElementSysteme; onOuvrir: (f: 'deplacer' | 'poser' | 'modifier') => void; onRetire: () => void; children?: ReactNode;
}) {
  const { interieur } = useEdition();
  return (
    <>
      <Bouton variante="mj" ecrit icone={Move} data-ouvreur="deplacer" onClick={() => onOuvrir('deplacer')}>Déplacer</Bouton>
      {interieur.astres.length > 0 && <Bouton variante="mj" ecrit icone={Orbit} data-ouvreur="poser" onClick={() => onOuvrir('poser')}>Poser sur un astre</Bouton>}
      <Bouton variante="mj" ecrit icone={Pencil} data-ouvreur="modifier" onClick={() => onOuvrir('modifier')}>Modifier…</Bouton>
      {children}
      <CommutateurReserve element={element} />
      <BoutonRetirerElement element={element} onRetire={onRetire} />
    </>
  );
}

/** « Réservé au MJ »: the only switch of this screen; it writes at once and goes back to the stored state on a failure. */
function CommutateurReserve({ element }: { element: ElementSysteme }) {
  const { avecAncrage, place, recharger } = useEdition();
  const [coche, setCoche] = useState(element.reserve === true);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const [voulu, setVoulu] = useState(true);
  useEffect(() => { setCoche(element.reserve === true); }, [element.reserve, element.version]);

  async function ecrire(valeur: boolean) {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    setVoulu(valeur);
    setCoche(valeur);
    try {
      await avecAncrage((jeton) => reserverElementSysteme(place, element.cle, { ...jeton, version: element.version ?? 1, secret: valeur }));
    } catch (e) {
      setCoche(element.reserve === true);
      setEchec(lireEchecElement(e));
    } finally {
      setEnCours(false);
    }
  }
  return (
    <div className="gx-masque">
      <Interrupteur etiquette="Réservé au MJ" coche={coche} ecrit disabled={enCours} onChange={(v) => void ecrire(v)} />
      {enCours && <p className="gx-note" role="status">Enregistrement…</p>}
      {echec && <MessageEchec echec={echec} onRecharger={() => { void recharger().then(() => setEchec(undefined), () => undefined); }} onReessayer={() => void ecrire(voulu)} />}
    </div>
  );
}

/** « Retirer » an element: « Retirer Aube-Brisée ? », then the removal; a stale version or a vanished element reads its words. */
function BoutonRetirerElement({ element, onRetire }: { element: ElementSysteme; onRetire: () => void }) {
  const { avecAncrage, place, recharger } = useEdition();
  const { toast } = useToasts();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecEdition>();
  const nom = nomElement(element);

  async function retirer() {
    if (enCours) return;
    setEnCours(true);
    setEchec(undefined);
    try {
      const r = await avecAncrage((jeton) => retirerElementSysteme(place, element.cle, { version: element.version ?? 1, versionSysteme: jeton.versionSysteme }));
      if (r) { toast(`${nom} retiré.`); setOuvert(false); onRetire(); }
    } catch (e) {
      const f = lireEchecElement(e);
      setEchec(f);
      if (f.sorte === 'refus') { toast(f.message); setOuvert(false); void recharger().catch(() => undefined); }
    } finally {
      setEnCours(false);
    }
  }
  return (
    <>
      <Bouton icone={Trash2} variante="danger" ecrit onClick={() => { setEchec(undefined); setOuvert(true); }}>Retirer</Bouton>
      {ouvert && (
        <BoiteDialogue
          titre={`Retirer ${nom} ?`}
          texte="Cet élément sera retiré de la carte."
          action="Retirer l’élément"
          enCours={enCours}
          onConfirmer={() => void retirer()}
          onFermer={() => { if (!enCours) { setOuvert(false); setEchec(undefined); } }}
        >
          {echec && (
            <MessageEchec echec={echec} onReessayer={() => void retirer()}
              onRecharger={() => { void recharger().then(() => { setOuvert(false); setEchec(undefined); }, () => undefined); }} />
          )}
        </BoiteDialogue>
      )}
    </>
  );
}
