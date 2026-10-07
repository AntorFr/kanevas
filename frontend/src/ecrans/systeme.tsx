import { BookOpen, Check, ChevronDown, Dices, Eye, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler } from '../api';
import { useTitreAriane } from '../cadre-contexte';
import type { SystemeCompte } from '../types';
import type { Ecran } from '../registre';
import { Bouton, Champ, ChargementListe, ErreurChargement, PageIntrouvable, Pastille, VideIcone, useToasts } from '../ui';
import { PucesUnivers } from './systeme/puces';
import './ecrans.css';
import './liste.css';
import './reglages.css';
import './cartes.css';

type Type = 'regle' | 'creature' | 'objet';

interface Gabarit {
  id: number;
  type: Type;
  nom: string;
  contenu: string;
  version: number;
}

interface Page extends SystemeCompte {
  gabarits: Gabarit[];
  suivant: string | null;
}

const NOM_MAX = 120;
const CONTENU_MAX = 20000;
const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_DROIT = 'Vous ne pouvez plus modifier ce système.';
const PERIME =
  'Cette entrée a changé depuis que vous l’avez ouverte. Rechargez-la pour voir la nouvelle version ; votre texte reste ci-dessous.';

const ONGLETS: { type: Type; titre: string; ajout: string; vide: string; videJoueur: string; pris: string }[] = [
  { type: 'regle', titre: 'Règles', ajout: 'Ajouter une règle', vide: 'Aucune règle pour l’instant.', videJoueur: 'Aucune règle à voir pour l’instant.', pris: 'Une règle porte déjà ce nom.' },
  { type: 'creature', titre: 'Créatures', ajout: 'Ajouter une créature', vide: 'Aucune créature pour l’instant.', videJoueur: 'Aucune créature à voir pour l’instant.', pris: 'Une créature porte déjà ce nom.' },
  { type: 'objet', titre: 'Objets', ajout: 'Ajouter un objet', vide: 'Aucun objet pour l’instant.', videJoueur: 'Aucun objet à voir pour l’instant.', pris: 'Un objet porte déjà ce nom.' },
];

const premiereLigne = (c: string) => c.split('\n').find((l) => l.trim() !== '') ?? '';
const alpha = (a: Gabarit, b: Gabarit) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });

type Retour = { perime?: true; perdu?: true; texte: string };

/** Message under a failed write: stale version, name taken, right removed, or generic. */
function messageEcriture(e: unknown): { perime?: true; perdu?: true; texte: string } {
  if (e instanceof ErreurApi) {
    if (e.statut === 409 && e.code === 'gabarit_modifie') return { perime: true, texte: PERIME };
    if (e.statut === 409) return { texte: e.message };
    if (e.statut === 403 || e.statut === 404) return { texte: PLUS_DROIT, perdu: true };
  }
  return { texte: ECHEC };
}

/** Form of an entry (add or edit): name and content, kept on failure. */
function Formulaire({
  initial,
  libelle,
  onEnvoi,
  onAnnuler,
}: {
  initial: { nom: string; contenu: string };
  libelle: string;
  onEnvoi: (v: { nom: string; contenu: string }) => Promise<Retour | undefined>;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(initial.nom);
  const [contenu, setContenu] = useState(initial.contenu);
  const [nomVide, setNomVide] = useState(false);
  const [echec, setEchec] = useState<Retour>();
  const [enCours, setEnCours] = useState(false);

  const erreurNom =
    nom.length > NOM_MAX ? `${NOM_MAX} caractères au plus.` : nomVide && nom.trim() === '' ? 'le nom est obligatoire.' : undefined;
  const erreurContenu = contenu.length > CONTENU_MAX ? '20 000 caractères au plus.' : undefined;

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    if (nom.trim() === '') return setNomVide(true);
    if (erreurNom || erreurContenu) return;
    setEnCours(true);
    setEchec(undefined);
    const r = await onEnvoi({ nom, contenu });
    setEnCours(false);
    if (r) setEchec(r);
  }

  return (
    <form className="entree-formulaire" onSubmit={envoyer} noValidate>
      {echec && (
        <div className="echec" role="alert">
          {echec.texte}
        </div>
      )}
      <Champ etiquette="Nom" value={nom} erreur={erreurNom} onChange={(e: { target: { value: string } }) => setNom(e.target.value)} />
      <Champ
        etiquette="Contenu"
        zone
        rows={8}
        value={contenu}
        erreur={erreurContenu}
        onChange={(e: { target: { value: string } }) => setContenu(e.target.value)}
      />
      <div className="actions">
        <Bouton type="submit" variante="principal" ecrit icone={Check} enCours={enCours}>
          {libelle}
        </Bouton>
        <Bouton onClick={onAnnuler}>Annuler</Bouton>
      </div>
    </form>
  );
}

const TYPES: Type[] = ['regle', 'creature', 'objet'];

/** E-15 Système de jeu: the shared reference of a system, at its own address (AD-94). */
function Systeme() {
  const { sid } = useParams();
  const [params, setParams] = useSearchParams();
  const demande = params.get('type');
  const type: Type = TYPES.find((t) => t === demande) ?? 'creature';
  const [entete, setEntete] = useState<Omit<Page, 'gabarits' | 'suivant'>>();
  const [entrees, setEntrees] = useState<Gabarit[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur' | 'introuvable'>('chargement');
  const [essai, setEssai] = useState(0);
  const [ouverte, setOuverte] = useState<number>();
  const [edition, setEdition] = useState<number>();
  const [ajout, setAjout] = useState(false);
  const { toast } = useToasts();
  const [echecSuite, setEchecSuite] = useState(false);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [plusDroit, setPlusDroit] = useState(false);
  useTitreAriane(entete?.nom);

  const base = `/api/systemes/${sid}`;
  const onglet = ONGLETS.find((o) => o.type === type)!;
  const choisir = (t: Type) => setParams(t === 'creature' ? {} : { type: t }, { replace: true });

  const charger = useCallback((t: Type) => appeler<Page>('GET', `${base}?type=${t}`), [base]);

  // Another system's address: nothing of the previous one stays.
  useEffect(() => {
    setEntete(undefined);
    setPlusDroit(false);
  }, [sid]);

  useEffect(() => {
    let actif = true;
    setEtat('chargement');
    setOuverte(undefined);
    setEdition(undefined);
    setAjout(false);
    setEchecSuite(false);
    charger(type).then(
      (p) => {
        if (!actif) return;
        const { gabarits, suivant: s, ...tete } = p;
        setEntete(tete);
        setEntrees(gabarits);
        setSuivant(s);
        setEtat('ok');
      },
      (e: unknown) => {
        if (actif) setEtat(e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur');
      },
    );
    return () => {
      actif = false;
    };
  }, [charger, type, essai]);

  // Tabs stay visible while an other tab loads, but the very first load shows the loading state alone.
  if (etat === 'introuvable') return <PageIntrouvable retour="systemes" />;
  if (!entete) {
    if (etat === 'erreur') return <ErreurChargement texte="Impossible de charger ce système." onReessayer={() => setEssai((n) => n + 1)} />;
    return <ChargementListe texte="Chargement du système…" />;
  }
  const peutEcrire = entete.peutEcrire;

  async function suite() {
    if (!suivant || suiteEnCours) return;
    setSuiteEnCours(true);
    setEchecSuite(false);
    try {
      const p = await appeler<Page>('GET', `${base}?type=${type}&curseur=${encodeURIComponent(suivant)}`);
      setEntrees((l) => [...l, ...p.gabarits]);
      setSuivant(p.suivant);
    } catch {
      setEchecSuite(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  /** A right withdrawn during a write: say so, and reload the page (read-only, or « Page introuvable. »). */
  function echecEcriture(e: unknown) {
    const m = messageEcriture(e);
    if (m.perdu) {
      setPlusDroit(true);
      setEssai((n) => n + 1);
      return undefined;
    }
    return m;
  }

  async function ajouter(v: { nom: string; contenu: string }) {
    try {
      const g = await appeler<Gabarit>('POST', `${base}/gabarits`, { type, nom: v.nom, contenu: v.contenu });
      setEntrees((l) => [...l, g].sort(alpha));
      setAjout(false);
      toast(`« ${g.nom} » ajouté`);
    } catch (e) {
      return echecEcriture(e);
    }
  }

  async function enregistrer(g: Gabarit, v: { nom: string; contenu: string }) {
    try {
      const m = await appeler<Gabarit>('PUT', `${base}/gabarits/${g.id}`, { nom: v.nom, contenu: v.contenu, version: g.version });
      setEntrees((l) => l.map((x) => (x.id === g.id ? m : x)).sort(alpha));
      setEdition(undefined);
      toast(`« ${m.nom} » enregistré`);
    } catch (e) {
      return echecEcriture(e);
    }
  }

  /** « Recharger » on a stale entry: take the new version from the server, drop the edit form. */
  async function recharger(g: Gabarit): Promise<void> {
    try {
      const p = await charger(type);
      const frais = p.gabarits.find((x) => x.id === g.id);
      if (frais) setEntrees((l) => l.map((x) => (x.id === g.id ? frais : x)));
    } catch {
      setEtat('erreur');
    }
  }

  return (
    <div className="page-liste">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <Dices size={20} strokeWidth={1.75} />
        </span>
        <h1 title={entete.nom}>{entete.nom}</h1>
      </header>
      <p className="sous-sys">
        <span>Référentiel commun · utilisé par {entete.nbUnivers} univers</span>
        {!peutEcrire && (
          <Pastille sens="neutre" icone={Eye}>
            Lecture seule
          </Pastille>
        )}
      </p>
      <div className="vos-univers">
        <span>Dans vos univers</span>
        <PucesUnivers univers={entete.mesUnivers} lien />
      </div>
      {plusDroit && (
        <div className="echec" role="alert">
          {PLUS_DROIT}
        </div>
      )}
      <div role="tablist" className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.type}
            type="button"
            role="tab"
            aria-selected={o.type === type}
            className={o.type === type ? 'actif' : undefined}
            onClick={() => choisir(o.type)}
          >
            {o.titre}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {etat === 'chargement' && <ChargementListe texte="Chargement du système…" />}
        {etat === 'erreur' && (
          <ErreurChargement texte="Impossible de charger ce système." onReessayer={() => setEssai((n) => n + 1)} />
        )}
        {etat === 'ok' && (
          <>
            {peutEcrire && !ajout && (
              <div className="actions">
                <Bouton variante="principal" ecrit icone={Plus} onClick={() => setAjout(true)}>
                  {onglet.ajout}
                </Bouton>
              </div>
            )}
            {ajout && (
              <Formulaire initial={{ nom: '', contenu: '' }} libelle="Ajouter" onEnvoi={ajouter} onAnnuler={() => setAjout(false)} />
            )}
            {entrees.length === 0 && !ajout && (
              <VideIcone icone={BookOpen}>
                <p>{peutEcrire ? onglet.vide : onglet.videJoueur}</p>
              </VideIcone>
            )}
            <ul className="lignes liste-entrees">
              {entrees.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="entree-ligne"
                    aria-expanded={ouverte === g.id}
                    onClick={() => {
                      setOuverte(ouverte === g.id ? undefined : g.id);
                      setEdition(undefined);
                    }}
                  >
                    <strong className="entree-nom" title={g.nom}>
                      {g.nom}
                    </strong>
                    <span className="entree-apercu">{premiereLigne(g.contenu)}</span>
                    <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="entree-chevron" />
                  </button>
                  {ouverte === g.id &&
                    (edition === g.id ? (
                      <EditionEntree g={g} onEnregistrer={(v) => enregistrer(g, v)} onAnnuler={() => setEdition(undefined)} onRecharger={() => recharger(g)} />
                    ) : (
                      <div className="entree-detail">
                        <h2>{g.nom}</h2>
                        <p className="entree-contenu">{g.contenu}</p>
                        {peutEcrire && (
                          <div className="actions">
                            <Bouton ecrit icone={Pencil} onClick={() => setEdition(g.id)}>
                              Modifier
                            </Bouton>
                          </div>
                        )}
                      </div>
                    ))}
                </li>
              ))}
            </ul>
            {echecSuite && (
              <div className="echec" role="alert">
                Impossible de charger la suite.
              </div>
            )}
            {suivant && (
              <div className="actions">
                <Bouton ecrit enCours={suiteEnCours} onClick={suite}>
                  Charger la suite
                </Bouton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Edit form of an open entry; on a stale write the typed text stays and « Recharger » is offered. */
function EditionEntree({
  g,
  onEnregistrer,
  onAnnuler,
  onRecharger,
}: {
  g: Gabarit;
  onEnregistrer: (v: { nom: string; contenu: string }) => Promise<Retour | undefined>;
  onAnnuler: () => void;
  onRecharger: () => Promise<void>;
}) {
  const [perime, setPerime] = useState(false);
  return (
    <div className="entree-detail">
      <h2>{g.nom}</h2>
      <p className="entree-contenu">{g.contenu}</p>
      <Formulaire
        initial={{ nom: g.nom, contenu: g.contenu }}
        libelle="Enregistrer"
        onAnnuler={onAnnuler}
        onEnvoi={async (v) => {
          const r = await onEnregistrer(v);
          setPerime(Boolean(r?.perime));
          return r && !r.perime ? r : undefined;
        }}
      />
      {perime && (
        <div className="echec" role="alert">
          {PERIME}{' '}
          <Bouton
            petit
            onClick={async () => {
              await onRecharger();
              setPerime(false);
            }}
          >
            Recharger
          </Bouton>
        </div>
      )}
    </div>
  );
}

export default { chemin: '/systemes/:sid', composant: Systeme } satisfies Ecran;
