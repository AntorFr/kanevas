import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErreurApi, appeler, envoyerFichier, lire, useConnexionPerdue } from '../api';
import { useBasculeMode, useCharge, useTitreAriane, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, Champ, Chargement, ErreurChargement, PageIntrouvable, Pastille } from '../ui';
import './ecrans.css';
import './cartes/cartes.css';
import './carte/carte.css';
import { adresseFond, FORMES } from './cartes/commun';
import { AjoutFiche } from './carte/ajout-fiche';
import { CadreGraphe } from './carte/cadre-graphe';
import { CadreIllustre } from './carte/cadre-illustre';
import { adresseFiche, ECHEC, libelleType, type CarteLue, type Element } from './carte/types';

const NON_IMAGE = 'Erreur : ce fichier n’est pas une image (PNG, JPEG, GIF ou WebP).';
const TROP_LOURD = 'Erreur : l’image dépasse 25 Mo.';

type Etat =
  | { k: 'chargement' }
  | { k: 'erreur' }
  | { k: 'introuvable' }
  | { k: 'mode-joueur' }
  | { k: 'ok'; lue: CarteLue };

/** E-11 Carte: the frame, the list « Sur la carte », the GM's gestures; player mode shows what a player sees (AD-39). */
function PageCarte() {
  const { id, cid } = useParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj';
  const mode = useBasculeMode(mj);
  const suffixe = mj && mode === 'joueur' ? '?mode=joueur' : '';
  const [etat, setEtat] = useState<Etat>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const base = `/api/univers/${id}/cartes/${cid}`;

  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    lire<CarteLue>(`${base}${suffixe}`).then(
      (lue) => actif && setEtat({ k: 'ok', lue }),
      (e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) return setEtat({ k: 'introuvable' });
        if (e instanceof ErreurApi && e.statut === 403 && e.code === 'mode_joueur') return setEtat({ k: 'mode-joueur' });
        setEtat({ k: 'erreur' });
      },
    );
    return () => {
      actif = false;
    };
  }, [base, suffixe, essai]);

  const titre = etat.k === 'ok' ? etat.lue.carte.titre : undefined;
  useTitreAriane(titre, 'Cartes');

  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (etat.k === 'introuvable') return <PageIntrouvable />;
  if (etat.k === 'chargement' || univers.etat === 'chargement') return <Chargement />;
  if (etat.k === 'erreur' || univers.etat === 'erreur') {
    return <ErreurChargement page onReessayer={() => setEssai((n) => n + 1)} />;
  }
  if (etat.k === 'mode-joueur') return <CarteCachee />;
  return <Corps key={`${id}/${cid}`} universId={id!} base={base} lue={etat.lue} onLue={(lue) => setEtat({ k: 'ok', lue })} />;
}

/** Player mode on a map the players cannot see: the GM's own sentence, and the way out. */
function CarteCachee() {
  const { setMode } = useVue();
  return (
    <div className="page-message" role="alert">
      <h1>Les joueurs ne voient pas cette carte : elle n’est pas visible.</h1>
      <div className="actions">
        <Bouton onClick={() => setMode('mj')}>Quitter le mode Joueur</Bouton>
        <Link className="bouton neutre" to="/">
          Mes univers
        </Link>
      </div>
    </div>
  );
}

function Corps({
  universId,
  base,
  lue,
  onLue,
}: {
  universId: string;
  base: string;
  lue: CarteLue;
  onLue: (l: CarteLue) => void;
}) {
  const perdue = useConnexionPerdue();
  const { mode } = useVue();
  const { carte, elements } = lue;
  // The server decides what the caller may write; player mode never writes.
  const gerer = lue.peutEcrire && mode === 'mj';
  const illustree = carte.forme === 'illustree';
  const [echec, setEchec] = useState(false);
  const [messageFond, setMessageFond] = useState<string>();
  const [selection, setSelection] = useState<number>();
  const [confirme, setConfirme] = useState<{ id: number; lieu: 'liste' | 'panneau' }>();
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [renommer, setRenommer] = useState(false);
  const [titre, setTitre] = useState(carte.titre);
  const [erreurTitre, setErreurTitre] = useState<string>();
  const [renommageEnCours, setRenommageEnCours] = useState(false);
  const [visibleEnCours, setVisibleEnCours] = useState(false);
  const [fondEnCours, setFondEnCours] = useState(false);
  const [jetonFond, setJetonFond] = useState(0);
  const [ajout, setAjout] = useState(false);
  const [erreurAjout, setErreurAjout] = useState<string>();
  const [rechargeur, setRechargeur] = useState(0);
  const saisieFichier = useRef<HTMLInputElement>(null);
  // Always the latest map, for writes that complete after others.
  const derniere = useRef(lue);
  derniere.current = lue;

  const maj = useCallback((f: (l: CarteLue) => CarteLue) => onLue(f(derniere.current)), [onLue]);
  const fermerAjout = useCallback(() => {
    setAjout(false);
    setErreurAjout(undefined);
  }, []);

  async function deplacer(elementId: number, x: number, y: number): Promise<boolean> {
    setEchec(false);
    try {
      const e = await appeler<Element>('PATCH', `${base}/elements/${elementId}`, { x, y });
      maj((l) => ({ ...l, elements: l.elements.map((o) => (o.id === elementId ? { ...o, x: e.x, y: e.y } : o)) }));
      return true;
    } catch {
      setEchec(true);
      return false;
    }
  }

  async function retirer(elementId: number) {
    if (retraitEnCours) return;
    setEchec(false);
    setRetraitEnCours(true);
    try {
      await appeler('DELETE', `${base}/elements/${elementId}`);
      maj((l) => ({ ...l, elements: l.elements.filter((o) => o.id !== elementId) }));
      setConfirme(undefined);
      setSelection((s) => (s === elementId ? undefined : s));
    } catch {
      setEchec(true);
    } finally {
      setRetraitEnCours(false);
    }
  }

  async function ajouter(ficheId: number) {
    setEchec(false);
    setErreurAjout(undefined);
    try {
      const e = await appeler<Element>('POST', `${base}/elements`, illustree ? { ficheId, x: 50, y: 50 } : { ficheId });
      maj((l) => ({ ...l, elements: [...l.elements, e] }));
      setSelection(illustree ? e.id : undefined);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'carte_pleine') setErreurAjout('Cette carte porte déjà 100 éléments.');
      else if (e instanceof ErreurApi && (e.code === 'fiche_inconnue' || e.statut === 404)) {
        setErreurAjout('Cette fiche n’existe plus.');
        setRechargeur((n) => n + 1);
      } else if (e instanceof ErreurApi && e.code === 'fiche_deja_placee') {
        setRechargeur((n) => n + 1);
        const tout = await lire<CarteLue>(base).catch(() => undefined);
        if (tout) onLue(tout);
      } else setErreurAjout(ECHEC);
    }
  }

  async function enregistrerTitre(e: FormEvent) {
    e.preventDefault();
    if (renommageEnCours) return;
    const t = titre.trim();
    if (t === '') return setErreurTitre('le titre est obligatoire.');
    if (t.length > 80) return setErreurTitre('80 caractères au plus.');
    setErreurTitre(undefined);
    setEchec(false);
    setRenommageEnCours(true);
    try {
      const c = await appeler<CarteLue['carte']>('PATCH', base, { titre: t });
      maj((l) => ({ ...l, carte: { ...l.carte, titre: c.titre } }));
      setRenommer(false);
    } catch {
      setEchec(true); // the typed title is kept
    } finally {
      setRenommageEnCours(false);
    }
  }

  async function basculerVisible() {
    if (visibleEnCours) return;
    setEchec(false);
    setVisibleEnCours(true);
    try {
      const c = await appeler<CarteLue['carte']>('PATCH', base, { visible: !carte.visible });
      maj((l) => ({ ...l, carte: { ...l.carte, visible: c.visible } }));
    } catch {
      setEchec(true);
    } finally {
      setVisibleEnCours(false);
    }
  }

  async function choisirFond(fichier: File | undefined) {
    if (!fichier || fondEnCours) return;
    setEchec(false);
    setMessageFond(undefined);
    setFondEnCours(true);
    try {
      const c = await envoyerFichier<CarteLue['carte']>(`${base}/fond`, fichier, () => undefined).promesse;
      maj((l) => ({ ...l, carte: { ...l.carte, fond: c.fond ?? true } }));
      setJetonFond((n) => n + 1);
    } catch (e) {
      if (e instanceof ErreurApi && (e.code === 'fond_trop_lourd' || e.statut === 413)) setMessageFond(TROP_LOURD);
      else if (e instanceof ErreurApi && e.code === 'fond_invalide') setMessageFond(NON_IMAGE);
      else setEchec(true);
    } finally {
      setFondEnCours(false);
      if (saisieFichier.current) saisieFichier.current.value = '';
    }
  }

  const choisi = elements.find((e) => e.id === selection);
  const retirerConfirme = (lieu: 'liste' | 'panneau', e: Element) =>
    confirme?.id === e.id && confirme.lieu === lieu ? (
      <div className="carte-confirme" role="alertdialog" aria-label={`Retirer « ${e.titre} »`}>
        <span>Retirer « {e.titre} » de cette carte ? La fiche reste.</span>
        <Bouton variante="danger" ecrit enCours={retraitEnCours} onClick={() => void retirer(e.id)}>
          Retirer de la carte
        </Bouton>
        <Bouton onClick={() => setConfirme(undefined)}>Annuler</Bouton>
      </div>
    ) : null;
  const videTexte = gerer
    ? illustree
      ? 'Aucun token. Ajoutez une fiche pour la placer sur la carte.'
      : 'Aucune fiche. Ajoutez des fiches pour voir leurs liens.'
    : illustree
      ? 'Rien à voir sur cette carte pour l’instant.'
      : 'Rien à voir sur ce graphe pour l’instant.';

  return (
    <div className="page-carte">
      <div className="carte-entete">
        {renommer && gerer ? (
          <form className="carte-renommer" onSubmit={enregistrerTitre} noValidate aria-label="Renommer la carte">
            <Champ
              etiquette="Titre"
              value={titre}
              erreur={erreurTitre}
              onChange={(e: { target: { value: string } }) => setTitre(e.target.value)}
            />
            <Bouton type="submit" variante="principal" ecrit enCours={renommageEnCours}>
              Enregistrer
            </Bouton>
            <Bouton
              onClick={() => {
                setRenommer(false);
                setTitre(carte.titre);
                setErreurTitre(undefined);
              }}
            >
              Annuler
            </Bouton>
          </form>
        ) : (
          <h1>{carte.titre}</h1>
        )}
        {gerer && !renommer && (
          <Bouton
            ecrit
            onClick={() => {
              setTitre(carte.titre);
              setRenommer(true);
            }}
          >
            Renommer
          </Bouton>
        )}
      </div>
      <div className="carte-sous">
        <span>{FORMES[carte.forme]}</span>
        {gerer && carte.visible !== undefined && (
          <>
            {carte.visible ? <Pastille sens="table">Visible des joueurs</Pastille> : <Pastille sens="mj">MJ seul</Pastille>}
            <Bouton petit ecrit enCours={visibleEnCours} onClick={() => void basculerVisible()}>
              {carte.visible ? 'Cacher aux joueurs' : 'Rendre visible'}
            </Bouton>
          </>
        )}
      </div>
      {echec && (
        <div className="echec" role="alert">
          {ECHEC}
        </div>
      )}
      {gerer && (
        <div className="carte-actions">
          <Bouton variante="principal" ecrit onClick={() => setAjout(true)}>
            Ajouter une fiche
          </Bouton>
          {illustree && (
            <>
              <input
                ref={saisieFichier}
                type="file"
                className="sr-seul"
                style={{ position: 'absolute', left: -9999 }}
                accept="image/png,image/jpeg,image/gif,image/webp"
                aria-label="Image de fond"
                tabIndex={-1}
                onChange={(e) => void choisirFond(e.target.files?.[0])}
              />
              <Bouton ecrit enCours={fondEnCours} onClick={() => saisieFichier.current?.click()}>
                {carte.fond ? 'Changer le fond' : 'Ajouter un fond'}
              </Bouton>
            </>
          )}
        </div>
      )}
      {messageFond && (
        <div className="champ">
          <div className="erreur" role="alert">
            {messageFond}
          </div>
        </div>
      )}

      {illustree ? (
        <>
          <CadreIllustre
            key={`${carte.fond}/${jetonFond}`}
            universId={universId}
            fond={carte.fond ? `${adresseFond(universId, carte.id)}?v=${jetonFond}` : undefined}
            elements={elements}
            gerer={gerer && !perdue}
            selection={selection}
            onSelection={setSelection}
            onDeplacer={deplacer}
            vide={videTexte}
          />
          {gerer && <p className="carte-aide">Flèches : déplacer de 1 % (Maj : 5 %)</p>}
        </>
      ) : (
        <CadreGraphe
          universId={universId}
          elements={elements}
          liens={lue.liens ?? []}
          gerer={gerer}
          selection={selection}
          onSelection={setSelection}
          vide={videTexte}
        />
      )}

      {gerer && choisi && (
        <div className="carte-panneau">
          <strong>
            {choisi.titre} · {libelleType(choisi.type)}
          </strong>
          <Link className="bouton neutre" to={adresseFiche(universId, choisi.ficheId)}>
            Ouvrir la fiche
          </Link>
          <Bouton ecrit onClick={() => setConfirme({ id: choisi.id, lieu: 'panneau' })}>
            Retirer de la carte
          </Bouton>
          {retirerConfirme('panneau', choisi)}
        </div>
      )}

      {elements.length > 0 && (
        <section className="carte-sur" aria-labelledby="sur-la-carte">
          <h2 id="sur-la-carte">Sur la carte</h2>
          <ul>
            {elements.map((e) => (
              <li key={e.id}>
                <Link to={adresseFiche(universId, e.ficheId)}>{e.titre}</Link>
                <small>{libelleType(e.type)}</small>
                {gerer && (
                  <Bouton petit ecrit onClick={() => setConfirme({ id: e.id, lieu: 'liste' })}>
                    Retirer de la carte
                  </Bouton>
                )}
                {gerer && retirerConfirme('liste', e)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!illustree && lue.liens && elements.length > 0 && (
        <section className="carte-sur" aria-labelledby="liens-carte">
          <h2 id="liens-carte">Liens</h2>
          {lue.liens.length === 0 ? (
            <p>Aucun lien entre ces fiches.</p>
          ) : (
            <ul>
              {lue.liens.map((l, i) => (
                <li key={i}>
                  {titreDe(elements, l.de)} — {l.type} → {titreDe(elements, l.vers)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ajout && gerer && (
        <AjoutFiche
          universId={universId}
          dejaPlacees={new Set(elements.map((e) => e.ficheId))}
          erreur={erreurAjout}
          onAjouter={ajouter}
          onFermer={fermerAjout}
          rechargeur={rechargeur}
        />
      )}
    </div>
  );
}

const titreDe = (elements: Element[], ficheId: number) => elements.find((e) => e.ficheId === ficheId)?.titre ?? '';

export default { chemin: '/univers/:id/cartes/:cid', composant: PageCarte } satisfies Ecran;
