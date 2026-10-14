import { ArrowRightLeft, Ellipsis, Info, ImageOff, ImagePlus, ImageUp, Tags, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, appeler, envoyerFichier, useConnexionPerdue } from '../../api';
import { Alerte, Bouton, BoutonIcone, Menu, useToasts } from '../../ui';
import type { FicheVue } from './types';
import { ChangerType } from './changer-type';
import { BoiteEtiquetage } from './etiquetage';
import { SousTypeBadge } from './sous-type';
import { adresseIllustration } from './vignette';
import { libelleDuType, useTypes } from '../../types-contexte';

const AIDE = 'Visible de tous ceux qui voient la fiche.';
const ECHEC = 'L’action n’a pas abouti. Réessayez.';
/** « 3 mars 2021 » (the creation date of the sheet; empty if the server gave none). */
function dateLongue(iso?: string): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

const TYPES_IMAGE = 'image/png, image/jpeg, image/gif, image/webp';

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
}

/** E-9 header: type badge and title, with the illustration at the left when there is one (AD-93). */
export function EnteteFiche({ universId, fiche, gestion, modeJoueur, badge, Icone, message, setMessage, rafraichir, onDroitPerdu }: Props) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const saisie = useRef<HTMLInputElement>(null);
  const annulation = useRef<{ annuler: () => void; raison?: 'utilisateur' | 'perdue' } | null>(null);
  const [envoi, setEnvoi] = useState<{ nom: string; pct: number } | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [ko, setKo] = useState<string>();
  const [changement, setChangement] = useState(false);
  const [etiquetage, setEtiquetage] = useState(false);
  const alias = fiche.alias ?? [];
  const etiquettes = fiche.etiquettes ?? [];
  const { types } = useTypes();

  const jeton = fiche.illustration?.jeton;
  const base = `/api/univers/${universId}/fiches/${fiche.id}/illustration`;
  const illustree = jeton !== undefined || envoi !== null;
  const indisponible = jeton !== undefined && ko === jeton;

  // The connection fell while sending: the upload is cut and says so.
  useEffect(() => {
    if (perdue && annulation.current && !annulation.current.raison) {
      annulation.current.raison = 'perdue';
      annulation.current.annuler();
    }
  }, [perdue]);

  function droitPerdu() {
    setConfirmer(false);
    setMessage({ texte: 'Vous ne pouvez plus modifier l’illustration de cette fiche.' });
    onDroitPerdu();
  }

  async function envoyer(fichier: File) {
    if (envoi) return;
    const remplace = jeton !== undefined;
    setMessage(undefined);
    setConfirmer(false);
    setEnvoi({ nom: fichier.name, pct: 0 });
    const { promesse, annuler } = envoyerFichier(base, fichier, (pct) => setEnvoi({ nom: fichier.name, pct }));
    const etat: { annuler: () => void; raison?: 'utilisateur' | 'perdue' } = { annuler };
    annulation.current = etat;
    try {
      await promesse;
      annulation.current = null;
      await rafraichir();
      setEnvoi(null);
      toast(`Illustration de « ${fiche.titre} » ${remplace ? 'remplacée' : 'ajoutée'}`);
    } catch (e) {
      annulation.current = null;
      setEnvoi(null);
      const nom = fichier.name;
      if (e instanceof ErreurApi && e.statut === -1 && etat.raison === 'utilisateur') {
        toast(`Envoi de « ${nom} » annulé`);
      } else if (e instanceof ErreurApi && e.statut === 403) {
        droitPerdu();
      } else if (e instanceof ErreurApi && e.statut === 400 && e.code === 'pas_une_image') {
        setMessage({ texte: `« ${nom} » n’est pas une image. Choisissez un PNG, un JPEG, un GIF ou un WebP.` });
      } else if (e instanceof ErreurApi && e.statut === 400 && e.code === 'fichier_vide') {
        setMessage({ texte: `« ${nom} » est vide.` });
      } else {
        setMessage({ texte: `« ${nom} » : l’envoi n’a pas abouti.`, reessayer: () => void envoyer(fichier) });
      }
    }
  }

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

  function choisi(fichier: File | undefined) {
    if (saisie.current) saisie.current.value = '';
    if (fichier) void envoyer(fichier);
  }

  function annulerEnvoi() {
    if (!annulation.current) return;
    annulation.current.raison = 'utilisateur';
    annulation.current.annuler();
  }

  const entrees = (
    <input
      ref={saisie}
      type="file"
      accept={TYPES_IMAGE}
      hidden
      tabIndex={-1}
      onChange={(e) => choisi(e.target.files?.[0])}
    />
  );

  return (
    <>
      <header className={`entete${illustree ? ' illustree' : ''}`}>
        {illustree && (
          <figure className={`illustration${envoi ? ' en-envoi' : ''}`}>
            <div className="boite-ill">
              {jeton !== undefined && !indisponible ? (
                <a className="cadre-ill" href={adresseIllustration(universId, fiche.id, jeton)} target="_blank" rel="noopener" title="Ouvrir l’image entière">
                  <img
                    src={adresseIllustration(universId, fiche.id, jeton)}
                    alt={`Illustration de « ${fiche.titre} »`}
                    width={600}
                    height={750}
                    decoding="async"
                    onError={() => setKo(jeton)}
                  />
                </a>
              ) : (
                <div className="cadre-ill">
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
                  <BoutonIcone
                    etiquette="Remplacer l’illustration"
                    infobulle={AIDE}
                    icone={ImageUp}
                    ecrit
                    onClick={() => saisie.current?.click()}
                  />
                  <BoutonIcone etiquette="Retirer l’illustration" infobulle="Retirer" icone={Trash2} danger ecrit onClick={() => setConfirmer(true)} />
                </div>
              )}
              {envoi && (
                <div className="envoi-ill" role="status" style={{ ['--progres' as string]: `${envoi.pct}%` }}>
                  <span>Envoi… {envoi.pct} %</span>
                  <Bouton variante="fantome" petit onClick={annulerEnvoi}>
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
              <Bouton variante="fantome" petit ecrit icone={ImagePlus} onClick={() => saisie.current?.click()}>
                Ajouter une illustration
              </Bouton>
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
                ]}
              />
            )}
          </div>
          <h1 id="titre-fiche" tabIndex={-1}>
            {fiche.titre}
          </h1>
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
        {gestion && entrees}
      </header>
      {gestion && changement && (
        <ChangerType universId={universId} fiche={fiche} onFermer={() => setChangement(false)} rafraichir={rafraichir} onDroitPerdu={onDroitPerdu} />
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
