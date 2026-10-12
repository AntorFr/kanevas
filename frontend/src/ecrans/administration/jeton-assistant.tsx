import { Copy, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { appeler, ErreurApi, lire } from '../../api';
import { Alerte, Bouton, Chargement, ErreurChargement } from '../../ui';

/** State of the token as the server reads it — never its value (AD-112). */
interface EtatJeton {
  pose: boolean;
  poseLe: string | null;
  source: 'instance' | 'deploiement' | null;
  assistant: string;
}

interface Connexion {
  adresse: string;
  expireLe: string;
}

type Phase = 'repos' | 'demarrage' | 'connexion' | 'validation';
type Message = { sorte: 'echec' | 'expiree' | 'demarrage' | 'autre' } | { sorte: 'pose'; poseLe: string | null };

const MAX_CODE = 500;
const BASE = '/api/instance/assistant/jeton';

const TEXTES = {
  echec: 'La connexion n’a pas abouti. Recommencez.',
  expiree: 'La connexion a expiré. Recommencez.',
  demarrage: 'La connexion n’a pas pu démarrer. Réessayez.',
  autre: 'L’action n’a pas abouti. Réessayez.',
} as const;

function dateLongue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whole minutes rounded up; under a minute, a sentence of its own. */
function resteTexte(ms: number): string {
  if (ms < 60_000) return 'Reste moins d’une minute.';
  return `Reste ${Math.ceil(ms / 60_000)} min.`;
}

/** Re-renders every second while a connection is open; returns the milliseconds left. */
function useReste(expireLe: string | undefined): number | null {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!expireLe) return;
    setMaintenant(Date.now());
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expireLe]);
  return expireLe ? Date.parse(expireLe) - maintenant : null;
}

/** E-5 panel « Jeton de l'assistant » (P-15): connects the subscription, never shows or takes a token. */
export function JetonAssistant() {
  const [etat, setEtat] = useState<EtatJeton | null>(null);
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [phase, setPhase] = useState<Phase>('repos');
  const [connexion, setConnexion] = useState<Connexion | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [code, setCode] = useState('');
  const [copiee, setCopiee] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [rendreFocus, setRendreFocus] = useState(false);

  const charger = useCallback(() => {
    setLecture('chargement');
    lire<EtatJeton>(BASE).then(
      (e) => {
        setEtat(e);
        setLecture('ok');
      },
      () => setLecture('erreur'),
    );
  }, []);
  useEffect(charger, [charger]);

  const reste = useReste(connexion?.expireLe);
  // The deadline passed: the expiry sentence replaces the field.
  useEffect(() => {
    if (phase === 'connexion' && reste !== null && reste <= 0) {
      setConnexion(null);
      setPhase('repos');
      setMessage({ sorte: 'expiree' });
      setRendreFocus(true);
    }
  }, [phase, reste]);

  useEffect(() => {
    if (phase === 'connexion') champ.current?.focus();
  }, [phase, connexion?.adresse]);
  useEffect(() => {
    if (rendreFocus && phase === 'repos') {
      actions.current?.querySelector('button')?.focus();
      setRendreFocus(false);
    }
  }, [rendreFocus, phase]);
  useEffect(() => {
    if (!copiee) return;
    const t = setTimeout(() => setCopiee(false), 2000);
    return () => clearTimeout(t);
  }, [copiee]);

  const terminer = (m: Message) => {
    setConnexion(null);
    setCode('');
    setPhase('repos');
    setMessage(m);
    setRendreFocus(true);
  };

  const demarrer = async () => {
    setMessage(null);
    setCode('');
    setPhase('demarrage');
    try {
      setConnexion(await appeler<Connexion>('POST', `${BASE}/connexion`));
      setPhase('connexion');
    } catch (e) {
      // A lost network is the banner's business, not a start failure.
      terminer(e instanceof ErreurApi && e.statut === 0 ? { sorte: 'autre' } : { sorte: 'demarrage' });
    }
  };

  const valider = async () => {
    if (!code.trim() || phase !== 'connexion') return;
    const envoye = code;
    setPhase('validation');
    setCode('');
    try {
      const e = await appeler<EtatJeton>('POST', `${BASE}/code`, { code: envoye });
      setEtat(e);
      terminer({ sorte: 'pose', poseLe: e.poseLe });
    } catch (e) {
      const statut = e instanceof ErreurApi ? e.statut : 0;
      if (statut === 410) terminer({ sorte: 'expiree' });
      else if (statut === 400 && (e as ErreurApi).code === 'connexion_echouee') terminer({ sorte: 'echec' });
      else {
        // The connection stays open until it expires: paste again or cancel.
        setMessage({ sorte: 'autre' });
        setPhase('connexion');
      }
    }
  };

  const annuler = async () => {
    try {
      await appeler('DELETE', `${BASE}/connexion`);
    } catch {
      /* the server drops it at its own deadline */
    }
    setConnexion(null);
    setCode('');
    setMessage(null);
    setPhase('repos');
    setRendreFocus(true);
  };

  const copier = async () => {
    if (!connexion) return;
    try {
      await navigator.clipboard.writeText(connexion.adresse);
      setCopiee(true);
    } catch {
      champ.current?.focus();
    }
  };

  let corps;
  if (lecture === 'chargement' && !etat) {
    corps = <Chargement texte="Chargement de l’état du jeton…" />;
  } else if (lecture === 'erreur' && !etat) {
    corps = <ErreurChargement texte="Impossible de charger l’état du jeton." onReessayer={charger} />;
  } else if (etat) {
    const libelle = etat.pose ? 'Reconnecter l’abonnement' : 'Connecter l’abonnement';
    const ouverte = phase === 'connexion' || phase === 'validation';
    const pose =
      etat.source === 'deploiement'
        ? 'Jeton fourni par le déploiement.'
        : etat.pose
          ? `Jeton posé le ${dateLongue(etat.poseLe)}.`
          : 'Aucun jeton posé.';
    corps = (
      <>
        {message && message.sorte !== 'pose' && <Alerte>{TEXTES[message.sorte]}</Alerte>}
        <div aria-live="polite">
          {message?.sorte === 'pose' ? (
            <p role="status">Jeton posé le {dateLongue(message.poseLe)}.</p>
          ) : (
            <p>{pose}</p>
          )}
          {phase === 'validation' && <p>Validation…</p>}
        </div>
        {!etat.pose && etat.assistant === 'aucune' && (
          <p className="note-admin">L’assistant est indisponible tant qu’aucun jeton n’est posé.</p>
        )}
        {etat.pose && <p className="note-admin">L’assistant est disponible sur tous les univers.</p>}
        {!ouverte && (
          <div className="jeton-actions" ref={actions}>
            <Bouton
              variante={etat.pose ? 'neutre' : 'principal'}
              ecrit
              onClick={() => void demarrer()}
              disabled={phase === 'demarrage'}
              aria-busy={phase === 'demarrage' || undefined}
            >
              {libelle}
            </Bouton>
            {phase === 'demarrage' && <span role="status">Connexion en cours…</span>}
          </div>
        )}
        {ouverte && connexion && (
          <div className="jeton-connexion">
            <span className="jeton-etiquette" id="jeton-adresse-etiquette">Adresse d’autorisation</span>
            <div className="jeton-ligne">
              <div className="jeton-adresse" role="textbox" aria-readonly="true" aria-labelledby="jeton-adresse-etiquette" tabIndex={0}>
                {connexion.adresse}
              </div>
              <a className="bouton neutre petit" href={connexion.adresse} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                Ouvrir
              </a>
              <Bouton petit icone={Copy} onClick={() => void copier()}>
                Copier
              </Bouton>
              <span role="status" className="jeton-copiee">{copiee ? 'Copiée.' : ''}</span>
            </div>
            <label className="jeton-etiquette" htmlFor="jeton-code">Code</label>
            <div className="jeton-ligne">
              <input
                id="jeton-code"
                ref={champ}
                className="jeton-code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_CODE}
                value={code}
                disabled={phase === 'validation'}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void valider();
                  } else if (e.key === 'Escape') void annuler();
                }}
              />
              <Bouton variante="principal" ecrit disabled={!code.trim() || phase === 'validation'} onClick={() => void valider()}>
                Valider
              </Bouton>
              <Bouton ecrit disabled={phase === 'validation'} onClick={() => void annuler()}>
                Annuler
              </Bouton>
            </div>
            <p className="note-admin">
              Cette connexion expire dans 10 minutes. {reste !== null && reste > 0 ? resteTexte(reste) : ''}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="panneau jeton-assistant" aria-labelledby="jeton-titre" aria-busy={phase === 'demarrage' || undefined}>
      <h2 id="jeton-titre">Jeton de l’assistant</h2>
      {corps}
    </section>
  );
}
