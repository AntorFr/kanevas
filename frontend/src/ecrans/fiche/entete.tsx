import { ArrowRightLeft, Ellipsis, FolderInput, Info, ImageOff, ImagePlus, ImageUp, Lock, Tags, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, appeler, envoyerFichier, lire } from '../../api';
import { Alerte, Bouton, BoutonIcone, Menu, useToasts } from '../../ui';
import type { FicheVue } from './types';
import { ChangerType } from './changer-type';
import { BoiteEtiquetage } from './etiquetage';
import { DeplacerSous } from './deplacer';
import { SousTypeBadge } from './sous-type';
import { adresseIllustration } from './vignette';
import type { Detail } from '../mediatheque/commun';
import { MESSAGE_RESERVE, useAjoutFichier } from './fichiers';
import { MESSAGES_PIECES } from './pieces';
import { libelleDuType, useTypes } from '../../types-contexte';
import { TitreFiche } from './titre';
import { SupprimerFiche } from './supprimer';

const AIDE = 'Visible de tous ceux qui voient la fiche.';
const ECHEC = 'L’action n’a pas abouti. Réessayez.';
/** « 3 mars 2021 » (the creation date of the sheet; empty if the server gave none). */
function dateLongue(iso?: string): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/** An inline failure under the header (never a toast); `reessayer` adds « Réessayer ». */
export interface MessageIllustration {
  texte: string;
  reessayer?: () => void;
}

interface Props {
  universId: string;
  fiche: FicheVue;
  /** The GM in GM mode: the gestures exist (absent, never greyed, for anyone else). */
  gestion: boolean;
  /** The GM views as a player: the label links keep the mode. */
  modeJoueur?: boolean;
  badge: string;
  Icone: LucideIcon;
  message: MessageIllustration | undefined;
  setMessage: (m: MessageIllustration | undefined) => void;
  /** Silent refetch of the sheet after a write. */
  rafraichir: () => Promise<void>;
  /** The server said 403: the account is no longer GM. */
  onDroitPerdu: () => void;
  onIntrouvable: () => void;
}

/** E-9 header: type badge and title, with the illustration at the left when there is one (AD-93). */
export function EnteteFiche({ universId, fiche, gestion, modeJoueur, badge, Icone, message, setMessage, rafraichir, onDroitPerdu, onIntrouvable }: Props) {
  const { toast } = useToasts();
  const [confirmer, setConfirmer] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [ko, setKo] = useState<string>();
  const [changement, setChangement] = useState(false);
  const [visibilite, setVisibilite] = useState<{ id: number; v: 'joueurs' | 'mj' }>();
  const [etiquetage, setEtiquetage] = useState(false);
  const [deplacement, setDeplacement] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const alias = fiche.alias ?? [];
  const etiquettes = fiche.etiquettes ?? [];
  const { types } = useTypes();

  const ill = fiche.illustration && 'jeton' in fiche.illustration ? fiche.illustration : null;
  const fermee = fiche.illustration && 'fermee' in fiche.illustration ? fiche.illustration : null;
  const jeton = ill?.jeton;
  const base = `/api/univers/${universId}/fiches/${fiche.id}/illustration`;
  const indisponible = jeton !== undefined && ko === jeton;

  function droitPerdu() {
    setConfirmer(false);
    setMessage({ texte: 'Vous ne pouvez plus modifier l’illustration de cette fiche.' });
    onDroitPerdu();
  }

  function droitFichePerdu() {
    setMessage({ texte: 'Vous ne pouvez plus modifier cette fiche.' });
    onDroitPerdu();
  }

  // The two ways to set the illustration (B-55): an image from the device, or one picked in the library.
  const remplace = jeton !== undefined;
  const ajout = useAjoutFichier<unknown>({
    universId,
    images: true,
    peutAjouter: true,
    mj: true,
    etiquette: remplace ? 'Remplacer l’illustration' : 'Ajouter une illustration',
    icone: remplace ? ImageUp : undefined,
    declencheur: remplace ? undefined : (
      <>
        <ImagePlus size={14} strokeWidth={1.75} aria-hidden="true" />
        Ajouter une illustration
      </>
    ),
    envoyer: (fichier, progres) => envoyerFichier(base, fichier, progres),
    apres: async () => {
      await rafraichir();
      toast(`Illustration de « ${fiche.titre} » ${remplace ? 'remplacée' : 'ajoutée'}`);
    },
    choisir: async (f) => {
      await appeler('PUT', base, { fichierId: f.id });
      setVisibilite({ id: f.id, v: f.visibilite });
      await rafraichir();
      toast(`Illustration de « ${fiche.titre} » ${remplace ? 'remplacée' : 'ajoutée'}`);
    },
    surMessage: (texte, reessayer) => {
      // A 403 already said « Vous ne pouvez plus modifier… » through droitPerdu: keep that one.
      if (texte === MESSAGES_PIECES.droit) return;
      setMessage(undefined);
      setMessage({ texte, reessayer });
    },
    surDroitPerdu: droitPerdu,
  });
  const envoi = ajout.envois[0] ?? null;
  const illustree = jeton !== undefined || envoi !== null || fermee !== null;

  // B-55: a file reserved to the GM as the illustration of a sheet the players see.
  const idIll = ill?.id;
  useEffect(() => {
    if (!gestion || idIll === undefined) return;
    let actif = true;
    lire<Detail>(`/api/univers/${universId}/fichiers/${idIll}/detail`).then(
      (d) => actif && setVisibilite({ id: idIll, v: d.fichier.visibilite }),
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [gestion, universId, idIll, jeton]);
  const reservee = gestion && idIll !== undefined && visibilite?.id === idIll && visibilite.v === 'mj';

  async function retirer() {
    if (retraitEnCours) return;
    setRetraitEnCours(true);
    setMessage(undefined);
    try {
      await appeler('DELETE', base);
      setConfirmer(false);
      await rafraichir();
      toast(`Illustration de « ${fiche.titre} » retirée`);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 403) droitPerdu();
      else {
        setConfirmer(false);
        setMessage({ texte: ECHEC, reessayer: () => void retirer() });
      }
    } finally {
      setRetraitEnCours(false);
    }
  }

  return (
    <>
      <header className={`entete${illustree ? ' illustree' : ''}`}>
        {illustree && (
          <figure className={`illustration${envoi ? ' en-envoi' : ''}`}>
            <div className="boite-ill">
              {jeton !== undefined && !indisponible ? (
                <a className="cadre-ill" href={adresseIllustration(universId, ill!.id, jeton)} target="_blank" rel="noopener" title="Ouvrir l’image entière">
                  <img
                    src={adresseIllustration(universId, ill!.id, jeton)}
                    alt={`Illustration de « ${fiche.titre} »`}
                    width={600}
                    height={750}
                    decoding="async"
                    onError={() => setKo(jeton)}
                  />
                </a>
              ) : (
                <div className="cadre-ill">
                  {fermee && (
                    <span className="ko-ill ill-fermee">
                      <Lock size={22} strokeWidth={1.75} aria-hidden="true" />
                      {fermee.message}
                    </span>
                  )}
                  {indisponible && (
                    <span className="ko-ill">
                      <ImageOff size={22} strokeWidth={1.75} aria-hidden="true" />
                      Image indisponible.
                    </span>
                  )}
                </div>
              )}
              {gestion && !envoi && jeton !== undefined && (
                <div className="gestes-ill">
                  {ajout.menu}
                  <BoutonIcone etiquette="Retirer l’illustration" infobulle="Retirer" icone={Trash2} danger ecrit onClick={() => setConfirmer(true)} />
                </div>
              )}
              {envoi && (
                <div className="envoi-ill" role="status" style={{ ['--progres' as string]: `${envoi.pct}%` }}>
                  <span>Envoi… {envoi.pct} %</span>
                  <Bouton variante="fantome" petit onClick={() => ajout.annulerEnvoi(envoi.cle)}>
                    Annuler
                  </Bouton>
                </div>
              )}
            </div>
            {envoi && <figcaption className="aide-ill">{AIDE}</figcaption>}
          </figure>
        )}
        <div className="tete-texte">
          {gestion && !illustree && (
            <div className="ajout-ill">
              {ajout.menu}
              <span className="aide">{AIDE}</span>
            </div>
          )}
          <div className="tete-ligne">
            <span className="type">
              <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
              {badge}
            <SousTypeBadge
              universId={universId}
              ficheId={fiche.id}
              type={fiche.type}
              libelleType={libelleDuType(types, fiche.type)}
              sousType={fiche.sousType}
              gestion={gestion}
              rafraichir={rafraichir}
              onDroitPerdu={onDroitPerdu}
            />
            </span>
            {/* « ⋯ » (E-9): « Changer le type… » (not for a report) and, for an imported sheet, its origin. */}
            {gestion && (

              <Menu
                etiquette={`Autres actions sur « ${fiche.titre} »`}
                icone={Ellipsis}
                aligne="fin"
                entrees={[
                  ...(fiche.type !== 'compte_rendu'
                    ? [{ libelle: 'Changer le type…', icone: ArrowRightLeft, onChoisir: () => setChangement(true) }]
                    : []),
                  { libelle: 'Déplacer sous…', icone: FolderInput, onChoisir: () => setDeplacement(true) },
                  { libelle: 'Alias et étiquettes…', icone: Tags, onChoisir: () => setEtiquetage(true) },
                  ...(fiche.cleOrigine ? [{ separateur: true as const }] : []),
                  ...(fiche.cleOrigine
                    ? [
                        {
                          contenu: (
                            <div className="info-fiche">
                              <Info size={14} strokeWidth={1.75} aria-hidden="true" />
                              <span>
                                Importée · clé <code>{fiche.cleOrigine}</code> · créée le {dateLongue(fiche.creeLe)}
                              </span>
                            </div>
                          ),
                        },
                      ]
                    : []),
                  { separateur: true },
                  { libelle: 'Supprimer la fiche…', icone: Trash2, danger: true, onChoisir: () => setSuppression(true) },
                ]}
              />
            )}
          </div>
          <TitreFiche universId={universId} fiche={fiche} gestion={gestion} rafraichir={rafraichir}
            onDroitPerdu={droitFichePerdu} onIntrouvable={onIntrouvable} />
          {alias.length > 0 && <p className="alias-fiche">Aussi appelée {alias.join(', ')}</p>}
          {etiquettes.length > 0 && (
            <ul className="etiquettes-fiche" aria-label="Étiquettes">
              {etiquettes.map((nom) => (
                <li key={nom}>
                  <Link
                    className="pastille neutre cliquable"
                    title={nom}
                    to={`/univers/${universId}/recherche?etiquette=${encodeURIComponent(nom)}${modeJoueur ? '&mode=joueur' : ''}`}
                  >
                    {nom}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
      {gestion && ajout.etat}
      {reservee && (
        <div className="avert-mj" role="status">
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{MESSAGE_RESERVE}</span>
        </div>
      )}
      {gestion && changement && (
        <ChangerType universId={universId} fiche={fiche} onFermer={() => setChangement(false)} rafraichir={rafraichir} onDroitPerdu={onDroitPerdu} />
      )}
      {gestion && suppression && (
        <SupprimerFiche universId={universId} fiche={fiche} onFermer={() => setSuppression(false)}
          onDroitPerdu={droitFichePerdu} onIntrouvable={onIntrouvable} />
      )}
      {gestion && deplacement && (
        <DeplacerSous universId={universId} fiche={fiche} onFermer={() => setDeplacement(false)} rafraichir={rafraichir} onDroitPerdu={onDroitPerdu} />
      )}
      {gestion && etiquetage && (
        <BoiteEtiquetage universId={universId} fiche={fiche} onFermer={() => setEtiquetage(false)} rafraichir={rafraichir} onDroitPerdu={onDroitPerdu} />
      )}
      {gestion && confirmer && (
        <div className="confirmation-ill" role="group" aria-label="Retirer l’illustration">
          <span>Retirer l’illustration de « {fiche.titre} » ? L’image sera perdue.</span>
          <span className="actions-ill">
            <Bouton petit onClick={() => setConfirmer(false)}>
              Annuler
            </Bouton>
            <Bouton petit variante="danger" ecrit icone={Trash2} enCours={retraitEnCours} onClick={() => void retirer()}>
              Retirer l’illustration
            </Bouton>
          </span>
        </div>
      )}
      {message && (
        <div className="message-ill">
          <Alerte
            action={
              <span className="actions-ill">
                {message.reessayer && (
                  <Bouton petit ecrit onClick={message.reessayer}>
                    Réessayer
                  </Bouton>
                )}
                <Bouton petit variante="fantome" onClick={() => setMessage(undefined)}>
                  Ignorer
                </Bouton>
              </span>
            }
          >
            {message.texte}
          </Alerte>
        </div>
      )}
    </>
  );
}
