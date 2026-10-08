import { ArrowDown, FileText, Flag, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { appeler, lire, useConnexionPerdue } from '../api';
import { useCharge, useTitreAriane } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ChargementListe, ErreurChargement, Fenetre, PageIntrouvable, Panneau, useToasts } from '../ui';
import './ecrans.css';
import {
  BadgeStatut,
  CATEGORIES,
  ECHEC,
  LigneCompteRendu,
  ListeStatut,
  libelleCategorie,
  type Campagne,
  type Categorie,
  type CompteRendu,
  type PageComptesRendus,
  type Scenario,
  type Statut,
  type Tache,
} from './suivi/commun';

function PageCampagne() {
  const { id, campagne } = useParams();
  return <Page key={`${id}/${campagne}`} universId={id!} campagneId={campagne!} />;
}

function Page({ universId, campagneId }: { universId: string; campagneId: string }) {
  const perdue = useConnexionPerdue();
  const [univers] = useCharge<UniversListe>(`/api/univers/${universId}`);
  const [donnees, recharger] = useCharge<Campagne>(`/api/univers/${universId}/campagnes/${campagneId}`);
  const [camp, setCamp] = useState<Campagne>();
  const [echec, setEchec] = useState(false);
  const { toast } = useToasts();
  useTitreAriane(donnees.etat === 'ok' ? (camp ?? donnees.valeur).nom : undefined);

  useEffect(() => {
    if (donnees.etat === 'ok') setCamp(donnees.valeur);
  }, [donnees]);

  if (donnees.etat === 'chargement' || univers.etat === 'chargement') {
    return <Chargement texte="Chargement de la campagne…" />;
  }
  if ((donnees.etat === 'erreur' && donnees.statut === 404) || (univers.etat === 'erreur' && univers.statut === 404)) {
    return <PageIntrouvable />;
  }
  if (donnees.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement texte="Impossible de charger cette campagne." onReessayer={recharger} />;
  }
  const c = camp ?? donnees.valeur;
  const mj = univers.valeur.role === 'mj';

  async function changer(statut: Statut) {
    setEchec(false);
    const avant = c.statut;
    setCamp({ ...c, statut });
    try {
      setCamp(await appeler<Campagne>('PATCH', `/api/campagnes/${c.id}`, { statut }));
      toast(`« ${c.nom} » enregistrée`);
    } catch {
      setCamp({ ...c, statut: avant });
      setEchec(true);
    }
  }

  return (
    <div className="page-liste">
      <header className="entete-suivi">
        <span className="type-campagne">
          <Flag size={14} strokeWidth={1.75} aria-hidden="true" />
          Campagne
        </span>
        <h1>{c.nom}</h1>
        <div className="proprietes">
          <span className="lib-prop">Statut</span>
          {mj ? (
            <ListeStatut statut={c.statut} nom={c.nom} desactive={perdue} onChange={(s) => void changer(s)} />
          ) : (
            <BadgeStatut statut={c.statut} />
          )}
        </div>
      </header>
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      <div className="panneaux-suivi">
        {mj && <PanneauScenarios universId={universId} campagneId={c.id} />}
        {mj && <PanneauPreparation campagneId={c.id} />}
        <PanneauComptesRendus universId={universId} campagneId={c.id} mj={mj} />
      </div>
    </div>
  );
}

function ErreurPanneau({ onReessayer }: { onReessayer: () => void }) {
  return <ErreurChargement texte="Impossible de charger ce panneau." onReessayer={onReessayer} />;
}

function PanneauScenarios({ universId, campagneId }: { universId: string; campagneId: number }) {
  const navigate = useNavigate();
  const [donnees, recharger] = useCharge<{ scenarios: Scenario[] }>(`/api/campagnes/${campagneId}/scenarios`);
  const [titre, setTitre] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const { toast } = useToasts();

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    if (t === '') return setErreur('le titre est obligatoire.');
    if (t.length > 120) return setErreur('120 caractères au plus.');
    setErreur(undefined);
    setEchec(false);
    setEnCours(true);
    try {
      const s = await appeler<Scenario>('POST', `/api/campagnes/${campagneId}/scenarios`, { titre: t });
      toast(`« ${s.titre} » créé`);
      navigate(`/univers/${universId}/scenarios/${s.id}`);
    } catch {
      setEchec(true);
      setEnCours(false);
    }
  }

  return (
    <Panneau titre="Scénarios" reserveMj>
      {!ouvert && (
        <Bouton className="lien-action action-sec" variante="fantome" petit ecrit icone={Plus} onClick={() => setOuvert(true)}>
          Nouveau scénario
        </Bouton>
      )}
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      {donnees.etat === 'chargement' && <ChargementListe texte="Chargement…" />}
      {donnees.etat === 'erreur' && <ErreurPanneau onReessayer={recharger} />}
      {donnees.etat === 'ok' &&
        (donnees.valeur.scenarios.length === 0 ? (
          !ouvert && <p>Aucun scénario pour l’instant.</p>
        ) : (
          <ul className="suivi-liste">
            {[...donnees.valeur.scenarios]
              .sort((a, b) => a.id - b.id)
              .map((s) => (
                <li key={s.id} className="ligne-suivi">
                  <Link className="grand" to={`/univers/${universId}/scenarios/${s.id}`}>
                    <FileText size={14} strokeWidth={1.75} aria-hidden="true" style={{ flex: "none", color: "var(--texte-3)" }} />
                    <span className="texte-ligne">{s.titre}</span>
                  </Link>
                </li>
              ))}
          </ul>
        ))}
      {ouvert && (
        <form className="formulaire-ligne ouvert" onSubmit={creer} noValidate aria-label="Nouveau scénario">
          <Champ
            etiquette="Titre"
            placeholder="1 à 120 caractères"
            autoFocus
            value={titre}
            erreur={erreur}
            onChange={(e: { target: { value: string } }) => setTitre(e.target.value)}
          />
          <div className="actions">
            <Bouton variante="fantome" onClick={() => { setOuvert(false); setTitre(''); setErreur(undefined); }}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
              Créer le scénario
            </Bouton>
          </div>
        </form>
      )}
    </Panneau>
  );
}

function PanneauPreparation({ campagneId }: { campagneId: number }) {
  const [donnees, recharger] = useCharge<{ taches: Tache[] }>(`/api/campagnes/${campagneId}/taches`);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [libelle, setLibelle] = useState('');
  const [categorie, setCategorie] = useState<Categorie>('autre');
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const { toast } = useToasts();

  useEffect(() => {
    if (donnees.etat === 'ok') setTaches(donnees.valeur.taches);
  }, [donnees]);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const l = libelle.trim();
    if (l === '') return setErreur('le libellé est obligatoire.');
    if (l.length > 200) return setErreur('200 caractères au plus.');
    setErreur(undefined);
    setEchec(false);
    setEnCours(true);
    try {
      const t = await appeler<Tache>('POST', `/api/campagnes/${campagneId}/taches`, { categorie, libelle: l });
      setTaches((x) => [...x, t]);
      setLibelle('');
      toast(`« ${t.libelle} » ajoutée`);
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  async function cocher(t: Tache, faite: boolean) {
    setEchec(false);
    try {
      const maj = await appeler<Tache>('PUT', `/api/taches/${t.id}`, { faite });
      setTaches((x) => x.map((y) => (y.id === t.id ? maj : y)));
      toast(`« ${t.libelle} » ${faite ? 'cochée' : 'décochée'}`);
    } catch {
      setEchec(true);
    }
  }

  const aFaire = taches.filter((t) => !t.faite).sort((a, b) => a.id - b.id);
  const faites = taches.filter((t) => t.faite).sort((a, b) => (b.faiteLe ?? '').localeCompare(a.faiteLe ?? '') || b.id - a.id);

  return (
    <Panneau titre="Préparation" reserveMj>
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      {donnees.etat === 'chargement' && <ChargementListe texte="Chargement…" />}
      {donnees.etat === 'erreur' && <ErreurPanneau onReessayer={recharger} />}
      {donnees.etat === 'ok' && (
        <>
          {aFaire.length === 0 ? (
            <p>Rien à préparer pour l’instant.</p>
          ) : (
            CATEGORIES.map((cat) => {
              const l = aFaire.filter((t) => t.categorie === cat.valeur);
              if (l.length === 0) return null;
              return (
                <div key={cat.valeur}>
                  <h3 className="categorie-prepa">{cat.libelle}</h3>
                  <ul className="suivi-liste">
                    {l.map((t) => (
                      <li key={t.id} className="ligne-suivi">
                        <span className="case">
                          <input
                            type="checkbox"
                            checked={false}
                            aria-label={t.libelle}
                            onChange={() => void cocher(t, true)}
                          />
                        </span>
                        <span className="libelle">{t.libelle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
          {faites.length > 0 && (
            <div>
              <h3 className="categorie-prepa">Cochées ({faites.length})</h3>
              <ul className="suivi-liste">
                {faites.map((t) => (
                  <li key={t.id} className="ligne-suivi tache-faite">
                    <span className="libelle">
                      {t.libelle}
                    </span>
                    <span className="badge-statut">{libelleCategorie(t.categorie)}</span>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void cocher(t, false);
                      }}
                    >
                      Décocher
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <form className="formulaire-ligne ajout-tache" onSubmit={ajouter} noValidate aria-label="Nouvelle tâche">
        <div className="titre-form" aria-hidden="true">
          <Plus size={14} strokeWidth={1.75} />
          Nouvelle tâche
        </div>
        <Champ etiquette="Nouvelle tâche" placeholder="1 à 200 caractères" value={libelle} erreur={erreur} onChange={(e: { target: { value: string } }) => setLibelle(e.target.value)} />
        <Champ etiquette="Catégorie" liste value={categorie} onChange={(e: { target: { value: string } }) => setCategorie(e.target.value as Categorie)}>
          {CATEGORIES.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </Champ>
        <Bouton type="submit" ecrit icone={Plus} enCours={enCours}>
          Ajouter
        </Bouton>
      </form>
    </Panneau>
  );
}

function PanneauComptesRendus({ universId, campagneId, mj }: { universId: string; campagneId: number; mj: boolean }) {
  const base = `/api/univers/${universId}/campagnes/${campagneId}/comptes-rendus`;
  const perdue = useConnexionPerdue();
  const [page, recharger] = useCharge<PageComptesRendus>(base);
  const [liste, setListe] = useState<CompteRendu[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const [creation, setCreation] = useState(() => lireBrouillonCr(campagneId) !== undefined);

  useEffect(() => {
    if (page.etat === 'ok') {
      setListe(page.valeur.comptesRendus);
      setSuivant(page.valeur.suivant);
    }
  }, [page]);

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageComptesRendus>(`${base}?curseur=${encodeURIComponent(suivant)}`);
      setListe((l) => [...l, ...p.comptesRendus]);
      setSuivant(p.suivant);
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  return (
    <Panneau titre="Comptes-rendus">
      <Bouton className="action-sec" variante="principal" ecrit icone={Plus} onClick={() => setCreation(true)}>
        Nouveau compte-rendu
      </Bouton>
      {page.etat === 'chargement' && <ChargementListe texte="Chargement…" />}
      {page.etat === 'erreur' && <ErreurPanneau onReessayer={recharger} />}
      {page.etat === 'ok' &&
        (liste.length === 0 ? (
          <p>{mj ? 'Aucun compte-rendu pour l’instant.' : 'Aucun compte-rendu à lire pour l’instant.'}</p>
        ) : (
          <ul className="suivi-liste">
            {liste.map((cr) => (
              <LigneCompteRendu key={cr.id} universId={universId} cr={cr} />
            ))}
          </ul>
        ))}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {suivant !== null && (
        <Bouton icone={ArrowDown} enCours={suiteEnCours} onClick={chargerSuite} disabled={perdue}>
          Charger la suite
        </Bouton>
      )}
      {creation && <FenetreCompteRendu universId={universId} campagneId={campagneId} onFermer={() => setCreation(false)} />}
    </Panneau>
  );
}

const cleBrouillonCr = (campagneId: number) => `kanevas:brouillon-cr:${campagneId}`;

function lireBrouillonCr(campagneId: number): { titre: string; texte: string } | undefined {
  try {
    const b = sessionStorage.getItem(cleBrouillonCr(campagneId));
    if (b === null) return undefined;
    const j = JSON.parse(b) as { titre?: unknown; texte?: unknown };
    return typeof j.titre === 'string' && typeof j.texte === 'string' ? { titre: j.titre, texte: j.texte } : undefined;
  } catch {
    return undefined;
  }
}

const MAX_TEXTE = 20000;

function FenetreCompteRendu({ universId, campagneId, onFermer }: { universId: string; campagneId: number; onFermer: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToasts();
  const brouillon = lireBrouillonCr(campagneId);
  const [titre, setTitre] = useState(brouillon?.titre ?? '');
  const [texte, setTexte] = useState(brouillon?.texte ?? '');
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [erreurTexte, setErreurTexte] = useState<string>();
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);

  function garder(t: string, x: string) {
    try {
      sessionStorage.setItem(cleBrouillonCr(campagneId), JSON.stringify({ titre: t, texte: x }));
    } catch {
      /* storage unavailable: the draft just stays in memory */
    }
  }

  function annuler() {
    sessionStorage.removeItem(cleBrouillonCr(campagneId));
    onFermer();
  }

  async function publier(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    let ok = true;
    if (t === '') {
      setErreurTitre('le titre est obligatoire.');
      ok = false;
    } else if (t.length > 120) {
      setErreurTitre('120 caractères au plus.');
      ok = false;
    } else setErreurTitre(undefined);
    if (texte.length > MAX_TEXTE) {
      setErreurTexte('20 000 caractères au plus.');
      ok = false;
    } else setErreurTexte(undefined);
    if (!ok) return;
    setEchec(false);
    setEnCours(true);
    try {
      const f = await appeler<{ id: number }>('POST', `/api/univers/${universId}/comptes-rendus`, {
        campagneId,
        titre: t,
        texte,
      });
      sessionStorage.removeItem(cleBrouillonCr(campagneId));
      toast(`« ${t} » publié`);
      navigate(`/univers/${universId}/fiche/${f.id}`);
    } catch {
      setEchec(true);
      setEnCours(false);
    }
  }

  return (
    <Fenetre titre="Nouveau compte-rendu" onFermer={annuler}>
      <form onSubmit={publier} noValidate>
        {echec && (
          <div className="echec" role="alert">
            {ECHEC}
          </div>
        )}
        <Champ
          etiquette="Titre"
          value={titre}
          erreur={erreurTitre}
          onChange={(e: { target: { value: string } }) => {
            setTitre(e.target.value);
            garder(e.target.value, texte);
          }}
        />
        <Champ
          etiquette="Texte"
          zone
          value={texte}
          erreur={erreurTexte}
          onChange={(e: { target: { value: string } }) => {
            setTexte(e.target.value);
            garder(titre, e.target.value);
          }}
        />
        <div className="actions">
          <Bouton type="submit" variante="principal" ecrit enCours={enCours}>
            Publier
          </Bouton>
          <Bouton onClick={annuler}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}

export default { chemin: '/univers/:id/campagnes/:campagne', composant: PageCampagne } satisfies Ecran;
