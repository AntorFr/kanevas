import { MessageSquarePlus, RotateCcw, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ErreurApi, lire, useConnexionPerdue } from '../../api';
import { Bouton, Chargement, PastilleRole } from '../../ui';
import type { Role } from '../../types';
import { blocs } from './blocs/registre';
import { MAX_HISTORIQUE, MAX_MESSAGE, TEXTE_ERREUR, envoyer, nouvelleConversation, reessayer, useFil } from './fil';
import './assistant.css';

export type Disponibilite =
  | { k: 'chargement' }
  | { k: 'erreur' }
  | { k: 'absent' }
  | { k: 'ok'; disponible: boolean; catalogue: Role };

/** Availability of the assistant for a universe (AD-77); `absent`: no role there, so no button. */
export function useDisponibilite(universId: number | null): [Disponibilite, () => void] {
  const [etat, setEtat] = useState<Disponibilite>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (universId === null) return;
    let actif = true;
    setEtat({ k: 'chargement' });
    lire<{ disponible: boolean; catalogue: Role }>(`/api/univers/${universId}/assistant`).then(
      (r) => actif && setEtat({ k: 'ok', disponible: r.disponible, catalogue: r.catalogue }),
      (e: unknown) => actif && setEtat(e instanceof ErreurApi && e.statut === 404 ? { k: 'absent' } : { k: 'erreur' }),
    );
    return () => {
      actif = false;
    };
  }, [universId, essai]);
  return [etat, () => setEssai((n) => n + 1)];
}

const TEXTE_LONGUE = 'Kanevas travaille toujours… Une image peut prendre jusqu’à trois minutes.';
const SEUIL_LONG_MS = 20_000;

/** True once a pending answer has lasted 20 s, whatever the request (the client cannot know). */
function useAttenteLongue(attente: boolean): boolean {
  const [longue, setLongue] = useState(false);
  useEffect(() => {
    setLongue(false);
    if (!attente) return;
    const t = setTimeout(() => setLongue(true), SEUIL_LONG_MS);
    return () => clearTimeout(t);
  }, [attente]);
  return longue;
}

interface Props {
  universId: number;
  dispo: Disponibilite;
  relireDispo: () => void;
  fermer: () => void;
  /** Called before following a link: the panel closes on a phone. */
  surOuverture: () => void;
  champ: React.RefObject<HTMLTextAreaElement | null>;
}

/** E-12: the panel — header, thread, writes under an answer, input. */
export function Panneau({ universId, dispo, relireDispo, fermer, surOuverture, champ }: Props) {
  const fil = useFil();
  const perdue = useConnexionPerdue();
  const [texte, setTexte] = useState('');
  const idTitre = useId();
  const idAide = useId();
  const idErreur = useId();
  const defilement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = defilement.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fil.messages, fil.etat]);

  const attente = fil.etat === 'attente';
  const longue = useAttenteLongue(attente);
  const mj = dispo.k === 'ok' && dispo.catalogue === 'mj';
  const trop = texte.length > MAX_MESSAGE;
  const disponible = dispo.k === 'ok' && dispo.disponible;
  const champInactif = !disponible || perdue;
  const envoyable = !champInactif && !attente && !trop && texte.trim() !== '';

  const soumettre = () => {
    if (!envoyable) return;
    envoyer(texte);
    setTexte('');
  };

  return (
    <aside className="asst-panneau" aria-labelledby={idTitre}>
      <header className="asst-entete">
        <h2 id={idTitre}>
          <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" /> Kanevas — assistant
        </h2>
        {dispo.k === 'ok' && <PastilleRole role={dispo.catalogue} />}
        <Bouton petit variante="fantome" icone={MessageSquarePlus} disabled={attente} onClick={nouvelleConversation}>
          Nouvelle conversation
        </Bouton>
        <Bouton petit variante="fantome" icone={X} onClick={fermer}>
          Fermer
        </Bouton>
      </header>

      <div className="asst-fil" ref={defilement} role="log" aria-live="polite" aria-label="Conversation">
        {fil.messages.length === 0 && (
          <p className="asst-vide">
            Demandez-moi de chercher, de résumer ou d’écrire dans ce que vous pouvez lire et écrire. Exemple : « Que sait-on
            d’Aldric ? »
          </p>
        )}
        {fil.messages.length > MAX_HISTORIQUE && (
          <p className="asst-note">Seuls les {MAX_HISTORIQUE} derniers messages sont transmis à l’assistant.</p>
        )}
        {fil.messages.map((m, i) => (
          <div key={i} className={`asst-message ${m.role === 'user' ? 'personne' : 'assistant'}`}>
            <p className="asst-texte">{m.content}</p>
            {m.evenements?.map((ev, j) => {
              const Bloc = blocs[ev.type];
              return Bloc ? <Bloc key={j} evenement={ev} universId={universId} surOuverture={surOuverture} /> : null;
            })}
          </div>
        ))}
        {attente && (
          <p className="asst-attente" role="status">
            {longue && mj ? TEXTE_LONGUE : 'Kanevas réfléchit…'}
          </p>
        )}
        {fil.etat === 'erreur' && (
          <div className="asst-erreur">
            <p role="alert">{fil.erreur}</p>
            <Bouton petit icone={RotateCcw} disabled={perdue} onClick={reessayer}>
              Réessayer
            </Bouton>
          </div>
        )}
      </div>

      <div className="asst-saisie">
        {dispo.k === 'chargement' && <Chargement />}
        {dispo.k === 'erreur' && (
          <div className="asst-erreur">
            <p role="alert">{TEXTE_ERREUR}</p>
            <Bouton petit icone={RotateCcw} onClick={relireDispo}>
              Réessayer
            </Bouton>
          </div>
        )}
        {dispo.k === 'ok' && !dispo.disponible && (
          <p className="asst-indispo" id={idAide}>
            L’assistant n’est pas disponible pour le moment.
          </p>
        )}
        {dispo.k !== 'chargement' && (
          <>
            <label htmlFor={`${idTitre}-champ`} className="asst-etiquette">
              Demander à Kanevas
            </label>
            <textarea
              id={`${idTitre}-champ`}
              ref={champ}
              rows={1}
              placeholder="Votre question"
              value={texte}
              readOnly={champInactif}
              aria-disabled={champInactif || undefined}
              aria-invalid={trop || undefined}
              aria-describedby={trop ? idErreur : dispo.k === 'ok' && !dispo.disponible ? idAide : undefined}
              onChange={(e) => !champInactif && setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  soumettre();
                }
              }}
            />
            {trop && (
              <p className="asst-champ-erreur" id={idErreur}>
                Erreur : 2 000 caractères au plus.
              </p>
            )}
            <Bouton variante="principal" enCours={attente} disabled={!envoyable} onClick={soumettre}>
              Envoyer
            </Bouton>
          </>
        )}
      </div>
    </aside>
  );
}
