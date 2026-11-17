import { KeyRound, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { ErreurApi, appeler } from '../../api';
import './jetons.css';
import { Alerte, Bouton, ChoixSegmente, Champ, Fenetre, ListeAcces, ValeurCopiable, type ChoixAcces } from '../../ui';
import {
  corpsAcces,
  formeDe,
  formeVide,
  lignesDe,
  listeVide,
  type FormeAcces,
  type JetonVue,
  type UniversChoix,
} from './format';

const NOM_MAX = 80;
const DUREES = [
  { valeur: '7', libelle: '7 jours' },
  { valeur: '30', libelle: '30 jours' },
  { valeur: '90', libelle: '90 jours' },
  { valeur: '365', libelle: '1 an' },
] as const;
const NIVEAUX = [
  { valeur: 'lecture', libelle: 'Lecture' },
  { valeur: 'ecriture', libelle: 'Lecture + écriture' },
] as const;
const MODES = [
  { valeur: 'tous', libelle: 'Tous mes univers' },
  { valeur: 'liste', libelle: 'Une liste d’univers' },
] as const;

/**
 * The box of E-23 (and of E-5 for the admin): « Créer un jeton » then the value shown once, or « Modifier les accès ».
 * The accesses part is the same for both; `url` is where it writes (`/api/compte/jetons[/id]`, or the instance's),
 * `univers` the universes the OWNER may choose. `proprietaireDuJeton` words the admin's variant.
 */
export function FormulaireJeton({
  jeton,
  univers,
  url,
  titreModifier = 'Modifier les accès',
  lireJeton,
  onFermer,
  onChange,
}: {
  /** Absent: a creation. */
  jeton?: JetonVue;
  univers: UniversChoix[];
  url: string;
  titreModifier?: string;
  /** The current state of the token, read again on saving to notice a change made meanwhile. */
  lireJeton?: () => Promise<JetonVue | undefined>;
  onFermer: () => void;
  /** The list must be reloaded (something was written or found stale). */
  onChange: (message?: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [nomVide, setNomVide] = useState(false);
  const [duree, setDuree] = useState<'7' | '30' | '90' | '365'>('30');
  const [forme, setForme] = useState<FormeAcces>(() => (jeton ? formeDe(jeton) : formeVide()));
  const [ouvertLe, setOuvertLe] = useState(jeton?.modifieParAdmin?.le ?? null);
  const [courant, setCourant] = useState<JetonVue | undefined>(jeton);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const [changes, setChanges] = useState(false);
  const [revoque, setRevoque] = useState(false);
  const [montre, setMontre] = useState<{ nom: string; valeur: string } | null>(null);
  const [sansListe, setSansListe] = useState(false);

  const creation = !jeton;
  const lignes = lignesDe(univers, forme, courant);

  function poser(id: number, v: ChoixAcces) {
    setSansListe(false);
    setForme((f) => (f.tous ? { ...f, exceptions: { ...f.exceptions, [id]: v } } : { ...f, liste: { ...f.liste, [id]: v } }));
  }

  async function soumettre(e?: FormEvent) {
    e?.preventDefault();
    if (enCours) return;
    if (creation && nom.trim() === '') return setNomVide(true);
    if (listeVide(forme)) return setSansListe(true);
    setEnCours(true);
    setEchec(null);
    setChanges(false);
    try {
      if (creation) {
        const r = await appeler<{ valeur: string }>('POST', url, { nom: nom.trim(), dureeJours: Number(duree), acces: corpsAcces(forme) });
        setMontre({ nom: nom.trim(), valeur: r.valeur });
        onChange();
      } else {
        // The admin may have changed the accesses while the box was open: read again, never overwrite.
        const frais = await lireJeton?.();
        if (frais && (frais.etat !== 'actif' || (frais.modifieParAdmin?.le ?? null) !== ouvertLe)) {
          onChange();
          if (frais.etat !== 'actif') setRevoque(true);
          else {
            setCourant(frais);
            setOuvertLe(frais.modifieParAdmin?.le ?? null);
            setForme(formeDe(frais));
            setChanges(true);
          }
          return;
        }
        await appeler('PATCH', url, { acces: corpsAcces(forme) });
        onChange('Accès enregistrés.');
        onFermer();
      }
    } catch (err) {
      if (err instanceof ErreurApi && err.code === 'jeton_revoque') {
        setRevoque(true);
        onChange();
      } else if (err instanceof ErreurApi && err.statut === 400 && err.details?.champ === 'nom') setNomVide(true);
      else setEchec('Impossible d’enregistrer.');
    } finally {
      setEnCours(false);
    }
  }

  if (montre) {
    return (
      <Fenetre titre="Votre nouveau jeton" icone={KeyRound} large verrouillee onFermer={onFermer}>
        <p className="jeton-montre-nom">{montre.nom}</p>
        <ValeurCopiable etiquette={`Valeur du jeton ${montre.nom}`} valeur={montre.valeur} secret messageCopie="Jeton copié." />
        <div className="fenetre-actions">
          <Bouton variante="principal" onClick={onFermer}>
            J’ai copié le jeton
          </Bouton>
        </div>
      </Fenetre>
    );
  }

  return (
    <Fenetre titre={creation ? 'Créer un jeton' : titreModifier} icone={creation ? KeyRound : SlidersHorizontal} large onFermer={onFermer}>
      {revoque ? (
        <>
          <Alerte>Ce jeton est révoqué.</Alerte>
          <div className="fenetre-actions">
            <Bouton onClick={onFermer}>Fermer</Bouton>
          </div>
        </>
      ) : (
        <form className="form-jeton" onSubmit={soumettre} noValidate>
          {creation && (
            <>
              <Champ
                etiquette="Nom"
                value={nom}
                maxLength={NOM_MAX}
                erreur={nomVide && nom.trim() === '' ? 'le nom est obligatoire.' : undefined}
                onChange={(e: { target: { value: string } }) => setNom(e.target.value)}
              />
              <ChoixSegmente legende="Durée" options={DUREES} valeur={duree} onChange={setDuree} />
            </>
          )}
          <ChoixSegmente
            legende="Univers atteints"
            options={MODES}
            valeur={forme.tous ? 'tous' : 'liste'}
            onChange={(v) => {
              setSansListe(false);
              setForme((f) => ({ ...f, tous: v === 'tous' }));
            }}
          />
          {forme.tous ? (
            <>
              <p className="note-jeton">Tous mes univers couvre aussi ceux que vous rejoindrez plus tard.</p>
              <ChoixSegmente legende="Niveau" options={NIVEAUX} valeur={forme.niveauTous} onChange={(v) => setForme((f) => ({ ...f, niveauTous: v }))} />
              <span className="titre-liste-acces">Exceptions</span>
            </>
          ) : (
            <span className="titre-liste-acces">Univers</span>
          )}
          {lignes.length === 0 ? (
            <p className="note-jeton">Vous n’appartenez à aucun univers.</p>
          ) : (
            <ListeAcces
              etiquette={forme.tous ? 'Exceptions par univers' : 'Accès par univers'}
              lignes={lignes}
              avecComme={forme.tous}
              onChange={poser}
              erreur={sansListe ? 'Choisissez au moins un univers.' : undefined}
            />
          )}
          <p className="note-jeton">Un jeton n’a jamais plus de droits que votre compte : là où vous êtes joueur, il agit en joueur.</p>
          {changes && <Alerte>Les accès ont changé.</Alerte>}
          {echec && <Alerte>{echec}</Alerte>}
          <div className="fenetre-actions">
            <Bouton onClick={onFermer}>Annuler</Bouton>
            <Bouton variante="principal" type="submit" ecrit enCours={enCours}>
              {enCours ? (creation ? 'Création…' : 'Enregistrement…') : echec ? 'Réessayer' : creation ? 'Créer le jeton' : 'Enregistrer'}
            </Bouton>
          </div>
        </form>
      )}
    </Fenetre>
  );
}
