import { BookOpen, Check, ChevronDown, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { ErreurApi, appeler } from '../api';
import type { Ecran } from '../registre';
import { Bouton, Champ, ChargementListe, ErreurChargement, PageIntrouvable, VideIcone, useToasts } from '../ui';
import './ecrans.css';
import './liste.css';
import './reglages.css';

type Type = 'regle' | 'creature' | 'objet';

interface Gabarit {
  id: number;
  type: Type;
  nom: string;
  contenu: string;
  version: number;
}

interface Page {
  id: number;
  nom: string;
  nbUnivers: number;
  peutEcrire: boolean;
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

/** Message under a failed write: stale version, name taken, right removed, or generic. */
function messageEcriture(e: unknown): { perime?: true; texte: string } {
  if (e instanceof ErreurApi) {
    if (e.statut === 409 && e.code === 'gabarit_modifie') return { perime: true, texte: PERIME };
    if (e.statut === 409) return { texte: e.message };
    if (e.statut === 403 || e.statut === 404) return { texte: PLUS_DROIT };
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
  onEnvoi: (v: { nom: string; contenu: string }) => Promise<{ perime?: true; texte: string } | undefined>;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(initial.nom);
  const [contenu, setContenu] = useState(initial.contenu);
  const [nomVide, setNomVide] = useState(false);
  const [echec, setEchec] = useState<{ perime?: true; texte: string }>();
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

/** E-15 Système de jeu: the shared reference of the universe's system (rules, creatures, objects). */
function Systeme() {
  const { id } = useParams();
  const [type, setType] = useState<Type>('creature');
  const [entete, setEntete] = useState<Pick<Page, 'nom' | 'nbUnivers' | 'peutEcrire'>>();
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

  // The system has its own address (AD-94): resolved from the universe of the screen's address.
  const baseRef = useRef('');
  const onglet = ONGLETS.find((o) => o.type === type)!;

  const charger = useCallback(async (t: Type) => {
    const u = await appeler<{ systeme: { id: number } | null }>('GET', `/api/univers/${id}`);
    if (!u.systeme) throw new ErreurApi(404, 'Introuvable');
    baseRef.current = `/api/systemes/${u.systeme.id}`;
    return appeler<Page>('GET', `${baseRef.current}?type=${t}`);
  }, [id]);

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
        setEntete({ nom: p.nom, nbUnivers: p.nbUnivers, peutEcrire: p.peutEcrire });
        setEntrees(p.gabarits);
        setSuivant(p.suivant);
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
  if (etat === 'introuvable') return <PageIntrouvable />;
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
      const p = await appeler<Page>('GET', `${baseRef.current}?type=${type}&curseur=${encodeURIComponent(suivant)}`);
      setEntrees((l) => [...l, ...p.gabarits]);
      setSuivant(p.suivant);
    } catch {
      setEchecSuite(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function ajouter(v: { nom: string; contenu: string }) {
    try {
      const g = await appeler<Gabarit>('POST', `${baseRef.current}/gabarits`, { type, nom: v.nom, contenu: v.contenu });
      setEntrees((l) => [...l, g].sort(alpha));
      setAjout(false);
      toast(`« ${g.nom} » ajouté`);
    } catch (e) {
      return messageEcriture(e);
    }
  }

  async function enregistrer(g: Gabarit, v: { nom: string; contenu: string }) {
    try {
      const m = await appeler<Gabarit>('PUT', `${baseRef.current}/gabarits/${g.id}`, { nom: v.nom, contenu: v.contenu, version: g.version });
      setEntrees((l) => l.map((x) => (x.id === g.id ? m : x)).sort(alpha));
      setEdition(undefined);
      toast(`« ${m.nom} » enregistré`);
    } catch (e) {
      return messageEcriture(e);
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
          <BookOpen size={20} strokeWidth={1.75} />
        </span>
        <h1 title={entete.nom}>{entete.nom}</h1>
      </header>
      <p className="sous-titre-page">Référentiel commun · utilisé par {entete.nbUnivers} univers</p>
      <div role="tablist" className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.type}
            type="button"
            role="tab"
            aria-selected={o.type === type}
            className={o.type === type ? 'actif' : undefined}
            onClick={() => setType(o.type)}
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
  onEnregistrer: (v: { nom: string; contenu: string }) => Promise<{ perime?: true; texte: string } | undefined>;
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

export default { chemin: '/univers/:id/systeme', composant: Systeme } satisfies Ecran;
