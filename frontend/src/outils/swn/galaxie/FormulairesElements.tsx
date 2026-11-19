import { Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { BoiteDialogue, Champ, Segments } from '../../../ui';
import { DESCRIPTION_COMPTEUR, DESCRIPTION_MAX, NOM_MAX } from './edition-logique';
import { EchecForm, CadreForm, ChampsPlace, cleNouvelle, useCoeurPret, useEnvoi, usePlace } from './FormulairesEdition';
import {
  ajouterElementSysteme, deplacerElementSysteme, lireCatalogueElements, modifierElementSysteme, type CatalogueElements,
} from './ecriture';
import { lireEchecElement, MESSAGES_ELEMENT } from './echec-element';
import { useEdition } from './Edition';
import { SelecteurAspect } from './SelecteurAspect';
import { GENRES_ELEMENT, nomAstre, nomElement, typeAstre } from './systeme-libelles';
import type { ElementSysteme } from './types';

/** The icons and colours of the server, read once per form (`null` while they load, or if they cannot be read). */
function useCatalogue(): CatalogueElements | null {
  const { place } = useEdition();
  const [c, setC] = useState<CatalogueElements | null>(null);
  useEffect(() => {
    let vivant = true;
    lireCatalogueElements(place.universId, place.galaxieId).then((r) => vivant && setC(r), () => undefined);
    return () => { vivant = false; };
  }, [place.universId, place.galaxieId]);
  return c;
}

interface EtatElement { nom: string; genre: string; description: string; icone: string; couleur: string; iconeChoisie: boolean; touche: boolean }

const etatDe = (e: ElementSysteme): EtatElement => ({
  nom: e.nom, genre: e.genre, description: e.description ?? '', icone: e.aspect.icone, couleur: e.aspect.couleur, iconeChoisie: true, touche: false,
});
/** « Ajouter »: the icon of the kind and the first colour of the server's list (docs/ecrans.md, Picker defaults). */
const etatNeuf = (premiereCouleur: string): EtatElement => ({
  nom: '', genre: 'vaisseau', description: '', icone: 'vaisseau', couleur: premiereCouleur, iconeChoisie: false, touche: false,
});

function lire(e: EtatElement) {
  const nd = [...e.description].length;
  const erreurs = {
    nom: e.nom.trim() === '' ? (e.touche ? MESSAGES_ELEMENT.nom : undefined) : [...e.nom.trim()].length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : undefined,
    description: nd > DESCRIPTION_MAX ? MESSAGES_ELEMENT.description : undefined,
  };
  const ok = e.nom.trim() !== '' && [...e.nom.trim()].length <= NOM_MAX && nd <= DESCRIPTION_MAX;
  return {
    erreurs, ok,
    corps: { nom: e.nom.trim(), genre: e.genre, description: e.description, aspect: { icone: e.icone, couleur: e.couleur } },
  };
}

/** « Nom », « Genre », « Description » and the icon and colour picker. */
function ChampsElement({ etat, onChange, catalogue }: { etat: EtatElement; onChange: (e: EtatElement) => void; catalogue: CatalogueElements | null }) {
  const l = lire(etat);
  const nd = [...etat.description].length;
  const genre = (g: string) => onChange({ ...etat, genre: g, icone: etat.iconeChoisie ? etat.icone : g });
  return (
    <>
      <Champ etiquette="Nom" value={etat.nom} autoComplete="off" erreur={l.erreurs.nom}
        compteur={`${[...etat.nom].length} / ${NOM_MAX}`} trop={[...etat.nom.trim()].length > NOM_MAX}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...etat, nom: e.target.value, touche: true })} />
      <Segments legende="Genre" variante="mj" options={GENRES_ELEMENT} valeur={etat.genre as typeof GENRES_ELEMENT[number]['valeur']} onChange={genre} />
      <Champ etiquette="Description" facultatif zone rows={3} value={etat.description} erreur={l.erreurs.description}
        compteur={nd >= DESCRIPTION_COMPTEUR ? `${nd} / ${DESCRIPTION_MAX.toLocaleString('fr-FR')}` : undefined} trop={nd > DESCRIPTION_MAX}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...etat, description: e.target.value })} />
      {catalogue && (
        <SelecteurAspect icones={catalogue.icones} couleurs={catalogue.couleurs} icone={etat.icone} couleur={etat.couleur}
          onIcone={(v) => onChange({ ...etat, icone: v, iconeChoisie: true })} onCouleur={(v) => onChange({ ...etat, couleur: v })} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Modifier… »

export function FormulaireModifierElement({ element, onFermer }: { element: ElementSysteme; onFermer: () => void }) {
  const { place, adopter } = useEdition();
  const [etat, setEtat] = useState(() => etatDe(element));
  const catalogue = useCatalogue();
  const envoi = useEnvoi(onFermer, (e) => lireEchecElement(e));
  const l = lire({ ...etat, touche: true });
  const inchange = etat.nom.trim() === element.nom && etat.genre === element.genre && etat.description === (element.description ?? '')
    && etat.icone === element.aspect.icone && etat.couleur === element.aspect.couleur;
  const enregistrer = () => {
    if (inchange) { onFermer(); return; }
    void envoi.envoyer(
      (jeton) => modifierElementSysteme(place, element.cle, { ...jeton, version: element.version ?? 1, ...l.corps }),
      (i) => { adopter(i); onFermer(); }, 'Enregistré.',
    );
  };
  return (
    <CadreForm titre={`Modifier ${nomElement(element)}`} ouvreur="modifier" envoi={envoi} pret={l.ok} onEnvoyer={enregistrer} onFermer={onFermer}>
      <ChampsElement etat={etat} onChange={setEtat} catalogue={catalogue} />
    </CadreForm>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Déplacer » (orbit and hour) and « Poser sur un astre »

export function FormulaireDeplacerElement({ element, onFermer }: { element: ElementSysteme; onFermer: () => void }) {
  const { place, adopter } = useEdition();
  const coeurPret = useCoeurPret();
  const p = usePlace(element.orbite ?? 0, element.heure, coeurPret);
  const envoi = useEnvoi(onFermer, (e) => lireEchecElement(e));
  const idLigne = useId();
  const enregistrer = () => void envoi.envoyer(
    (jeton) => deplacerElementSysteme(place, element.cle, { ...jeton, version: element.version ?? 1, ...p.corps() }),
    (i) => { adopter(i); onFermer(); }, `${nomElement(element)} déplacé.`,
  );
  return (
    <CadreForm titre={`Déplacer ${nomElement(element)}`} ouvreur="deplacer" envoi={envoi} pret={p.pret} onEnvoyer={enregistrer} onFermer={onFermer}>
      <ChampsPlace place={p} lune={false} coeurPret={coeurPret} idLigne={idLigne} />
    </CadreForm>
  );
}

export function FormulairePoserSurAstre({ element, onFermer }: { element: ElementSysteme; onFermer: () => void }) {
  const { place, adopter, interieur } = useEdition();
  const astres = interieur.astres;
  const [cle, setCle] = useState(() => (astres.find((a) => a.cle !== element.sur) ?? astres[0])?.cle ?? '');
  const envoi = useEnvoi(onFermer, (e) => lireEchecElement(e, true));
  const enregistrer = () => void envoi.envoyer(
    (jeton) => deplacerElementSysteme(place, element.cle, { ...jeton, version: element.version ?? 1, sur: cle }),
    (i) => { adopter(i); onFermer(); }, `${nomElement(element)} posé.`,
  );
  return (
    <CadreForm titre={`Poser ${nomElement(element)} sur un astre`} ouvreur="poser" envoi={envoi} pret={cle !== ''} onEnvoyer={enregistrer} onFermer={onFermer}>
      <Champ etiquette="Astre" liste value={cle} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCle(e.target.value)}>
        {astres.map((a) => <option key={a.cle} value={a.cle}>{nomAstre(a)} — {typeAstre(a)}</option>)}
      </Champ>
    </CadreForm>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// « Ajouter un élément » (dialog; the anchoring dialog of a drawn system comes first, at « Ajouter »)

export function DialogueAjouterElement({ onFermer, onAjoute }: { onFermer: () => void; onAjoute: (cle: string | undefined) => void }) {
  const { interieur, place, adopter, ancrageOuvert } = useEdition();
  const catalogue = useCatalogue();
  const [etat, setEtat] = useState<EtatElement>(() => etatNeuf('accent'));
  const [lieu, setLieu] = useState<'orbite' | 'astre'>('orbite');
  const [sur, setSur] = useState(interieur.astres[0]?.cle ?? '');
  const coeurPret = useCoeurPret();
  const p = usePlace(1, 0, coeurPret);
  const idLigne = useId();
  const envoi = useEnvoi(onFermer, (e) => lireEchecElement(e, lieu === 'astre'));
  // The first colour of the server's list, once it is read (and while the GM has not chosen one).
  const premiere = catalogue?.couleurs[0];
  const [couleurChoisie, setCouleurChoisie] = useState(false);
  useEffect(() => { if (premiere && !couleurChoisie) setEtat((e) => ({ ...e, couleur: premiere })); }, [premiere, couleurChoisie]);
  const l = lire({ ...etat, touche: true });
  const avecAstres = interieur.astres.length > 0;
  const pret = l.ok && (lieu === 'astre' ? sur !== '' : p.pret);
  const ajouter = () => void envoi.envoyer(
    (jeton) => ajouterElementSysteme(place, { ...jeton, ...l.corps, ...(lieu === 'astre' ? { sur } : p.corps()) }),
    (i) => { adopter(i); onAjoute(cleNouvelle(interieur, i, 'elements')); onFermer(); },
    `${l.corps.nom} ajouté.`,
  );
  if (ancrageOuvert) return null;
  return (
    <BoiteDialogue
      variante="neutre" icone={Plus} formulaire focusChamp
      titre="Ajouter un élément"
      texte="Le nouvel élément est posé sur la carte et sélectionné."
      action="Ajouter" libelleEnCours="Enregistrement…"
      enCours={envoi.enCours} desactive={!pret || envoi.bloque}
      onConfirmer={ajouter}
      onFermer={() => { if (!envoi.enCours) onFermer(); }}
    >
      <div className="ed-defile">
        <ChampsElement etat={etat} onChange={(e) => { if (e.couleur !== etat.couleur) setCouleurChoisie(true); setEtat(e); }} catalogue={catalogue} />
        {avecAstres && (
          <Segments legende="Lieu" variante="mj" options={[{ valeur: 'orbite', libelle: 'Orbite et heure' }, { valeur: 'astre', libelle: 'Sur un astre' }]}
            valeur={lieu} onChange={setLieu} />
        )}
        {lieu === 'astre' ? (
          <Champ etiquette="Astre" liste value={sur} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSur(e.target.value)}>
            {interieur.astres.map((a) => <option key={a.cle} value={a.cle}>{nomAstre(a)} — {typeAstre(a)}</option>)}
          </Champ>
        ) : (
          <ChampsPlace place={p} lune={false} coeurPret={coeurPret} idLigne={idLigne} />
        )}
      </div>
      <EchecForm envoi={envoi} onReessayer={ajouter} onFermer={onFermer} />
    </BoiteDialogue>
  );
}
