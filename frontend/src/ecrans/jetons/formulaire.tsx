import { KeyRound, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ErreurApi, appeler } from '../../api';
import './jetons.css';
import { BlocSystemes, lignesSystemes, type ListeSystemes } from './systemes';
import { Alerte, Bouton, Case, ChoixSegmente, Champ, Fenetre, ListeAcces, ValeurCopiable, type ChoixAcces } from '../../ui';
import {
  corpsAcces,
  corpsSystemes,
  formeDe,
  formeVide,
  lignesDe,
  listeVide,
  systemesDe,
  type FormeAcces,
  type NiveauSysteme,
  type SystemeChoix,
  type JetonVue,
  type OutilOffrable,
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
const modes = (admin: boolean) =>
  [
    { valeur: 'tous', libelle: admin ? 'Tous les univers du compte' : 'Tous mes univers' },
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
  outilsOffrables = [],
  url,
  titreModifier = 'Modifier les accès',
  admin = false,
  systemesFournis,
  lireJeton,
  onFermer,
  onChange,
}: {
  /** Absent: a creation. */
  jeton?: JetonVue;
  univers: UniversChoix[];
  /** The tools a creation may offer (E-23 only: a scope cannot be changed afterwards). */
  outilsOffrables?: OutilOffrable[];
  url: string;
  titreModifier?: string;
  /** E-5: the admin edits the accesses of someone else's token (wording in the third person). */
  admin?: boolean;
  /** E-5: the systems the OWNER reads, given by the list of tokens (else the box reads `GET /api/systemes`). */
  systemesFournis?: SystemeChoix[];
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
  const [contenu, setContenu] = useState(true);
  const [outils, setOutils] = useState<string[]>([]);
  const [sansPermission, setSansPermission] = useState(false);

  const creation = !jeton;
  const lignes = lignesDe(univers, forme, courant);
  const [sys, setSys] = useState<Record<number, NiveauSysteme>>(() => systemesDe(jeton));
  const [refus, setRefus] = useState<ReadonlySet<number>>(new Set());
  const [lus, setLus] = useState<ListeSystemes>(systemesFournis ? { etat: 'ok', liste: systemesFournis } : { etat: 'chargement' });
  const [essaiSys, setEssaiSys] = useState(0);
  const chargerSystemes = useCallback(async (): Promise<ListeSystemes> => {
    try {
      return { etat: 'ok', liste: await appeler<SystemeChoix[]>('GET', '/api/systemes') };
    } catch {
      return { etat: 'erreur' };
    }
  }, []);
  useEffect(() => {
    if (systemesFournis) return;
    let actif = true;
    setLus({ etat: 'chargement' });
    void chargerSystemes().then((r) => actif && setLus(r));
    return () => {
      actif = false;
    };
  }, [essaiSys, systemesFournis, chargerSystemes]);
  // « Contenu » unchecked (or a tool-only token): the block is hidden, its values kept, no `systemes` sent.
  const sansContenu = creation ? !contenu : jeton.contenu === false;
  const lignesSys = lus.etat === 'ok' ? lignesSystemes(lus.liste, sys, courant, refus) : [];
  const attendSystemes = !creation && lus.etat === 'chargement';

  function poserSysteme(id: number, v: NiveauSysteme) {
    setRefus((r) => {
      if (!r.has(id)) return r;
      const n = new Set(r);
      n.delete(id);
      return n;
    });
    setSys((m) => ({ ...m, [id]: v }));
  }

  function poser(id: number, v: ChoixAcces) {
    setSansListe(false);
    setForme((f) => (f.tous ? { ...f, exceptions: { ...f.exceptions, [id]: v } } : { ...f, liste: { ...f.liste, [id]: v } }));
  }

  async function soumettre(e?: FormEvent) {
    e?.preventDefault();
    if (enCours || attendSystemes) return;
    if (creation && nom.trim() === '') return setNomVide(true);
    if (creation && !contenu && outils.length === 0) return setSansPermission(true);
    if (listeVide(forme)) return setSansListe(true);
    setEnCours(true);
    setEchec(null);
    setChanges(false);
    // No `systemes` key unless the lines are known and « Contenu » is on: the rows of a token are never guessed.
    const systemes = lus.etat === 'ok' && !sansContenu ? { systemes: corpsSystemes(lignesSys, sys) } : {};
    try {
      if (creation) {
        const r = await appeler<{ valeur: string }>('POST', url, {
          nom: nom.trim(),
          dureeJours: Number(duree),
          acces: corpsAcces(forme),
          contenu,
          outils,
          ...systemes,
        });
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
            setSys(systemesDe(frais));
            setChanges(true);
          }
          return;
        }
        await appeler('PATCH', url, { acces: corpsAcces(forme), ...systemes });
        onChange('Accès enregistrés.');
        onFermer();
      }
    } catch (err) {
      if (err instanceof ErreurApi && err.code === 'jeton_revoque') {
        setRevoque(true);
        onChange();
      } else if (err instanceof ErreurApi && err.statut === 400 && err.details?.champ === 'nom') setNomVide(true);
      else if (err instanceof ErreurApi && err.statut === 400 && err.details?.champ === 'systemes' && !systemesFournis) {
        // The rights moved while the box was open: read the real choices again, keep everything typed.
        const r = await chargerSystemes();
        setLus(r);
        if (r.etat === 'ok') {
          const lisibles = new Map(r.liste.map((x) => [x.id, x]));
          setRefus(new Set(r.liste.filter((x) => !x.peutEcrire && sys[x.id] === 'ecriture' && jeton?.systemes?.find((a) => a.id === x.id)?.niveau !== 'ecriture').map((x) => x.id)));
          // A system no longer read and not carried by the token leaves the form.
          if (!r.liste.some((x) => !x.peutEcrire && sys[x.id] === 'ecriture')) setEchec('Impossible d’enregistrer.');
          setSys((m) => Object.fromEntries(Object.entries(m).filter(([id]) => lisibles.has(Number(id)) || jeton?.systemes?.some((a) => a.id === Number(id)))));
        } else setEchec('Impossible d’enregistrer.');
      }
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
              <span id="lib-permissions" className="titre-liste-acces">
                Ce que le jeton peut faire
              </span>
              <div className="cases-outils" role="group" aria-labelledby="lib-permissions">
                <Case
                  etiquette="Contenu"
                  detail="fiches, sections, relations, fichiers, cartes, export"
                  checked={contenu}
                  onChange={(e) => {
                    setSansPermission(false);
                    setContenu(e.target.checked);
                  }}
                />
                {outilsOffrables.map((o) => (
                  <Case
                    key={o.cle}
                    etiquette={o.libelle}
                    detail={o.libelleModule}
                    checked={outils.includes(o.cle)}
                    onChange={(e) => {
                      setSansPermission(false);
                      setOutils((l) => (e.target.checked ? [...l, o.cle] : l.filter((c) => c !== o.cle)));
                    }}
                  />
                ))}
                <p className="note-jeton">
                  Un seul jeton peut tout faire, ou créez-en un par script : les accès ci-dessous valent pour tout ce que vous cochez.
                </p>
                {outilsOffrables.length === 0 && <p className="note-jeton">Aucun outil de vos univers ne reçoit de catalogue par l’API.</p>}
                {sansPermission && (
                  <p role="alert" className="erreur-boite">
                    Cochez au moins une permission.
                  </p>
                )}
              </div>
            </>
          )}
          {!creation && <p className="note-jeton">Les permissions d’un jeton ne changent pas : créez-en un autre.</p>}
          <ChoixSegmente
            legende="Univers atteints"
            options={modes(admin)}
            valeur={forme.tous ? 'tous' : 'liste'}
            onChange={(v) => {
              setSansListe(false);
              setForme((f) => ({ ...f, tous: v === 'tous' }));
            }}
          />
          {forme.tous ? (
            <>
              <p className="note-jeton">
                {admin ? 'Tous les univers du compte couvre aussi ceux qu’il rejoindra plus tard.' : 'Tous mes univers couvre aussi ceux que vous rejoindrez plus tard.'}
              </p>
              <ChoixSegmente legende="Niveau" options={NIVEAUX} valeur={forme.niveauTous} onChange={(v) => setForme((f) => ({ ...f, niveauTous: v }))} />
              <span className="titre-liste-acces">Exceptions</span>
            </>
          ) : (
            <span className="titre-liste-acces">Univers</span>
          )}
          {lignes.length === 0 ? (
            <p className="note-jeton">{admin ? 'Ce compte n’appartient à aucun univers.' : 'Vous n’appartenez à aucun univers.'}</p>
          ) : (
            <ListeAcces
              etiquette={forme.tous ? 'Exceptions par univers' : 'Accès par univers'}
              lignes={lignes}
              avecComme={forme.tous}
              onChange={poser}
              erreur={sansListe ? 'Choisissez au moins un univers.' : undefined}
            />
          )}
          {!sansContenu && (
            <BlocSystemes
              systemes={lus}
              lignes={lignesSys}
              creation={creation}
              desactive={enCours}
              onChange={poserSysteme}
              onReessayer={() => setEssaiSys((n) => n + 1)}
            />
          )}
          <p className="note-jeton">
            {admin
              ? 'Un jeton n’a jamais plus de droits que son compte : là où il est joueur, le jeton agit en joueur.'
              : 'Un jeton n’a jamais plus de droits que votre compte : là où vous êtes joueur, il agit en joueur.'}
          </p>
          {changes && <Alerte>Les accès ont changé.</Alerte>}
          {echec && <Alerte>{echec}</Alerte>}
          <div className="fenetre-actions">
            <Bouton onClick={onFermer}>Annuler</Bouton>
            <Bouton variante="principal" type="submit" ecrit enCours={enCours} disabled={attendSystemes}>
              {enCours ? (creation ? 'Création…' : 'Enregistrement…') : echec ? 'Réessayer' : creation ? 'Créer le jeton' : 'Enregistrer'}
            </Bouton>
          </div>
        </form>
      )}
    </Fenetre>
  );
}
