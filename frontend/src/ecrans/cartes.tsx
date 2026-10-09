import { Eye, EyeOff, ImagePlus, Plus, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { appeler, lire, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ErreurChargement, Pastille, PageIntrouvable } from '../ui';
import './ecrans.css';
import './cartes/cartes.css';
import { Vignette } from './cartes/vignette';
import { adresseCarte, FORMES, type Carte, type PageCartes } from './cartes/commun';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const NON_IMAGE = 'ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).';
const TROP_LOURD = 'l’image dépasse 25 Mo.';

/** E-10 Cartes: the maps the account reads; the GM creates one and flips its visibility in place. */
function Cartes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const perdue = useConnexionPerdue();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [page, recharger] = useCharge<PageCartes>(`/api/univers/${id}/cartes`);
  const [cartes, setCartes] = useState<Carte[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const [echec, setEchec] = useState(false);

  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState('');
  const [forme, setForme] = useState<Carte['forme']>('illustree');
  const [fond, setFond] = useState<File | null>(null);
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [erreurFond, setErreurFond] = useState<string>();
  const [echecCreation, setEchecCreation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [enCoursVisible, setEnCoursVisible] = useState<number>();
  const saisieFichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (page.etat === 'ok') {
      setCartes(page.valeur.cartes);
      setSuivant(page.valeur.suivant);
    }
  }, [page]);

  if (page.etat === 'chargement' || univers.etat === 'chargement') {
    return <Chargement />;
  }
  if ((page.etat === 'erreur' && page.statut === 404) || (univers.etat === 'erreur' && univers.statut === 404)) {
    return <PageIntrouvable />;
  }
  if (page.etat === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement onReessayer={recharger} />;
  }
  const mj = univers.valeur.role === 'mj';

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageCartes>(`/api/univers/${id}/cartes?curseur=${encodeURIComponent(suivant)}`);
      setCartes((l) => [...l, ...p.cartes]);
      setSuivant(p.suivant);
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function basculer(c: Carte) {
    if (enCoursVisible !== undefined) return;
    setEchec(false);
    setEnCoursVisible(c.id);
    try {
      const maj = await appeler<Carte>('PATCH', `/api/univers/${id}/cartes/${c.id}`, { visible: !c.visible });
      setCartes((l) => l.map((x) => (x.id === c.id ? { ...x, visible: maj.visible } : x)));
    } catch {
      setEchec(true);
    } finally {
      setEnCoursVisible(undefined);
    }
  }

  function fermer() {
    setOuvert(false);
    setTitre('');
    setForme('illustree');
    setFond(null);
    setErreurTitre(undefined);
    setErreurFond(undefined);
    setEchecCreation(false);
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    setErreurFond(undefined);
    setEchecCreation(false);
    if (t === '') return setErreurTitre('le titre est obligatoire.');
    if (t.length > 80) return setErreurTitre('80 caractères au plus.');
    setErreurTitre(undefined);
    setEnCours(true);
    try {
      let carte: Carte;
      if (forme === 'illustree' && fond) {
        // Order matters: the server reads `titre` and `forme` before the file part.
        const corps = new FormData();
        corps.append('titre', t);
        corps.append('forme', forme);
        corps.append('fichier', fond);
        let reponse: Response;
        try {
          reponse = await fetch(`/api/univers/${id}/cartes`, { method: 'POST', body: corps, credentials: 'same-origin' });
        } catch {
          throw new Error('reseau');
        }
        if (reponse.status === 401) {
          window.location.assign('/');
          return;
        }
        const json = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (!reponse.ok) {
          if (json.code === 'fond_trop_lourd' || reponse.status === 413) return setErreurFond(TROP_LOURD);
          if (json.code === 'fond_invalide') return setErreurFond(NON_IMAGE);
          throw new Error('echec');
        }
        carte = json as unknown as Carte;
      } else {
        carte = await appeler<Carte>('POST', `/api/univers/${id}/cartes`, { titre: t, forme });
      }
      navigate(adresseCarte(id!, carte.id));
    } catch {
      setEchecCreation(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <h1>Cartes</h1>
      {mj && <p>Les cartes de l’univers. Les joueurs ne voient que celles que vous rendez visibles.</p>}
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      {mj && !ouvert && (
        <Bouton variante="principal" icone={Plus} ecrit onClick={() => setOuvert(true)}>
          Nouvelle carte
        </Bouton>
      )}
      {mj && ouvert && (
        <form className="carte-formulaire" onSubmit={creer} noValidate aria-label="Nouvelle carte">
          {echecCreation && (
            <div className="echec" role="alert">
              La carte n’a pas pu être créée. Réessayez.
            </div>
          )}
          <Champ
            etiquette="Titre"
            value={titre}
            erreur={erreurTitre}
            onChange={(e: { target: { value: string } }) => setTitre(e.target.value)}
          />
          <label className="champ">
            <span>Forme</span>
            <select value={forme} onChange={(e) => setForme(e.target.value as Carte['forme'])}>
              <option value="illustree">Carte illustrée</option>
              <option value="graphe">Graphe</option>
            </select>
          </label>
          {forme === 'illustree' && (
            <div>
              <div className="carte-fichier">
                <input
                  ref={saisieFichier}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  aria-label="Image de fond"
                  tabIndex={-1}
                  onChange={(e) => {
                    setFond(e.target.files?.[0] ?? null);
                    setErreurFond(undefined);
                  }}
                />
                <Bouton icone={ImagePlus} onClick={() => saisieFichier.current?.click()}>Choisir une image</Bouton>
                <span>{fond ? fond.name : 'Image de fond (facultative)'}</span>
              </div>
              {erreurFond && <div className="champ"><div className="erreur" role="alert">Erreur : {erreurFond}</div></div>}
            </div>
          )}
          <div className="actions">
            <Bouton type="submit" variante="principal" icone={Plus} ecrit enCours={enCours}>
              Créer
            </Bouton>
            <Bouton icone={X} onClick={fermer}>Annuler</Bouton>
          </div>
        </form>
      )}
      {cartes.length === 0 ? (
        <div className="etat">
          <p>{mj ? 'Aucune carte pour l’instant. Créez-en une pour commencer.' : 'Aucune carte n’est visible pour l’instant.'}</p>
        </div>
      ) : (
        <ul className="cartes-liste">
          {cartes.map((c) => (
            <li key={c.id} className="carte-ligne">
              <Vignette universId={id!} carte={c} classe="carte-vignette" />
              <div className="carte-corps">
                <Link to={adresseCarte(id!, c.id)}>{c.titre}</Link>
                <small>{FORMES[c.forme]}</small>
              </div>
              {mj && c.visible !== undefined && (
                <div className="carte-etat">
                  {c.visible ? <Pastille sens="table">Visible des joueurs</Pastille> : <Pastille sens="mj">MJ seul</Pastille>}
                  <Bouton petit icone={c.visible ? EyeOff : Eye} ecrit enCours={enCoursVisible === c.id} onClick={() => void basculer(c)}>
                    {c.visible ? 'Cacher aux joueurs' : 'Rendre visible'}
                  </Bouton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {suivant !== null && (
        <Bouton icone={ChevronDown} enCours={suiteEnCours} onClick={() => void chargerSuite()} disabled={perdue}>
          Charger la suite
        </Bouton>
      )}
    </>
  );
}

export default { chemin: '/univers/:id/cartes', composant: Cartes } satisfies Ecran;
