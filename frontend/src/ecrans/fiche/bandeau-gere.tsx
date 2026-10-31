import { ExternalLink, Eye, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { composantSection } from '../../outils/registre';
import type { PropsSection } from '../../outils/types';
import { Alerte, Bouton, Markdown } from '../../ui';
import { montrerProposition } from '../assistant/fil';
import type { SectionVue } from './types';

interface Props {
  universId: string;
  ficheId: number;
  section: SectionVue;
  /** Refetches the sheet. */
  rafraichir: () => Promise<void>;
}

const ECHEC = 'Le recalcul n’a pas abouti. Réessayez.';

/**
 * The banner of a managed section (S-7, B-66): the tool's name, its state and the actions the server says are
 * the reader's. Never an editor. Hidden is absent from the DOM; the server refuses anyway.
 */
export function BandeauGere({ universId, ficheId, section, rafraichir }: Props) {
  const g = section.geree!;
  const perdue = useConnexionPerdue();
  const [enCours, setEnCours] = useState<'recalcul' | 'proposition' | 'recharger'>();
  const [erreur, setErreur] = useState<string>();
  const [conflit, setConflit] = useState(false);
  const [perdu, setPerdu] = useState(false);
  const [annonce, setAnnonce] = useState('');
  const url = `/api/univers/${universId}/fiches/${ficheId}/sections/${section.id}`;
  const desactive = g.etat === 'desactive';
  const ouvert = !desactive && g.outil !== null;
  const perime = ouvert && g.etat === 'perime';

  // The text moved under the announcement: the next gesture starts clean.
  useEffect(() => {
    setConflit(false);
  }, [section.version]);

  async function geste(quoi: 'recalcul' | 'proposition') {
    if (enCours || perdue) return;
    setEnCours(quoi);
    setErreur(undefined);
    setConflit(false);
    setAnnonce('');
    try {
      await appeler('POST', quoi === 'recalcul' ? `${url}/recalcul` : `${url}/recalcul/proposition`, quoi === 'recalcul' ? { version: section.version } : undefined);
      await rafraichir();
      setAnnonce(quoi === 'recalcul' ? 'Section recalculée.' : 'Recalcul proposé.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) setConflit(true);
      else if (e instanceof ErreurApi && e.statut === 403) setPerdu(true);
      else setErreur(ECHEC);
    } finally {
      setEnCours(undefined);
    }
  }

  async function recharger() {
    setEnCours('recharger');
    try {
      await rafraichir();
      setConflit(false);
    } catch {
      setErreur(ECHEC);
    } finally {
      setEnCours(undefined);
    }
  }

  const geste_ = g.recalcul === 'geste';
  const recalculer = perime && g.peutRecalculer && geste_ && !perdu;
  const proposer = perime && g.peutRecalculer && g.recalcul === 'proposition' && g.propositionId === null && !perdu;
  const voir = ouvert && g.recalcul === 'proposition' && g.propositionId !== null;

  return (
    <>
      <div className={`bandeau-gere${desactive ? ' desactive' : ''}`} role="group" aria-label="Section gérée par un outil">
        {desactive ? (
          <span className="bg-nom">Outil désactivé</span>
        ) : g.lien && g.libelle ? (
          <Link className="bg-nom lien" to={g.lien}>
            Générée par {g.libelle}
          </Link>
        ) : (
          <span className="bg-nom">{g.libelle ? `Générée par ${g.libelle}` : 'Générée par un outil'}</span>
        )}
        {ouvert && g.libelle !== null && perime && (
          <span className="bg-etat" role="status">
            Calculée avec d’anciens réglages.
          </span>
        )}
        {(g.peutOuvrir && g.lien && !desactive || recalculer || proposer || voir) && (
          <span className="bg-actions">
            {g.peutOuvrir && g.lien && !desactive && (
              <Link className="bouton" to={g.lien}>
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                Ouvrir dans l’outil
              </Link>
            )}
            {recalculer && (
              <Bouton variante="principal" ecrit icone={RefreshCw} disabled={perdue || enCours === 'recalcul'} onClick={() => void geste('recalcul')}>
                {enCours === 'recalcul' ? 'Recalcul…' : 'Recalculer'}
              </Bouton>
            )}
            {proposer && (
              <Bouton ecrit icone={Send} disabled={perdue || enCours === 'proposition'} onClick={() => void geste('proposition')}>
                Proposer un recalcul
              </Bouton>
            )}
            {voir && (
              <Bouton icone={Eye} onClick={() => montrerProposition(Number(universId), g.propositionId!)}>Voir la proposition</Bouton>
            )}
          </span>
        )}
      </div>
      {perdue && (recalculer || proposer) && <p className="bg-note" role="status">Connexion perdue.</p>}
      {perdu && (
        <p className="bg-note" role="status">
          Vous ne pouvez plus recalculer cette section.
        </p>
      )}
      {erreur && <Alerte>{erreur}</Alerte>}
      {conflit && (
        <Alerte
          action={
            <Bouton petit icone={RotateCcw} enCours={enCours === 'recharger'} onClick={() => void recharger()}>
              Recharger la section
            </Bouton>
          }
        >
          La section a changé depuis que vous l’avez ouverte. Rechargez-la pour voir la nouvelle version.
        </Alerte>
      )}
      <div className="bg-annonce" role="status" aria-live="polite">
        {annonce}
      </div>
    </>
  );
}

type Charge = ComponentType<PropsSection> | 'texte' | 'echec';

/**
 * The text version at once; the tool's display component replaces it once loaded — and only when the sheet shows a
 * section that has one and whose tool is open to the reader. A failed load keeps the text, and says so (S-7).
 */
export function ContenuGere({ section }: { section: SectionVue }) {
  const g = section.geree!;
  const charger = g.composant && g.outil !== null && g.etat !== 'desactive' ? composantSection(g.outil, g.type) : undefined;
  const [charge, setCharge] = useState<Charge>('texte');
  useEffect(() => {
    let vivant = true;
    setCharge('texte');
    if (!charger) return;
    charger().then(
      (m) => vivant && setCharge(() => m.default),
      () => vivant && setCharge('echec'),
    );
    return () => {
      vivant = false;
    };
  }, [charger]);

  if (typeof charge === 'function') {
    const C = charge;
    return <C html={section.html} />;
  }
  return (
    <>
      {charge === 'echec' && <p className="bg-note" role="status">Mise en forme indisponible — version texte affichée.</p>}
      <Markdown className="texte" html={section.html} />
    </>
  );
}
