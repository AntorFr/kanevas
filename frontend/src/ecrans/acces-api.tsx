import { Ban, Check, ChevronRight, Copy, CircleX, KeyRound, Loader, TriangleAlert } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { useCharge, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import { Bouton, ChargementListe, ErreurChargement, PageIntrouvable, Pastille, useToasts } from '../ui';
import {
  ETAT_LOT,
  dateHeure,
  morceauxLot,
  titreGroupe,
  type EntreeRapport,
  type LotVue,
} from './acces-api/format';
import './acces-api/acces-api.css';
import './ecrans.css';
import './liste.css';

/** The last loaded value stays on screen while a reload runs (no skeleton flash after a gesture). */
function useGarde<T>(charge: ReturnType<typeof useCharge<T>>[0]) {
  const dernier = useRef<T | undefined>(undefined);
  if (charge.etat === 'ok') dernier.current = charge.valeur;
  return charge.etat === 'chargement' && dernier.current !== undefined
    ? ({ etat: 'ok', valeur: dernier.current } as const)
    : charge;
}

/** Copies a text; returns whether the clipboard accepted it. */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

const ICONE_LOT = { en_cours: Loader, clos: Check, abandonne: Ban } as const;

/** Counters of a batch line: the « N refusée(s) » pieces read in the danger colour. */
function colorerRefus(m: string) {
  return m.split(/( · |, )/).map((part, i) => (
    <span key={i} className={/refusé/.test(part) ? 'refus-n' : undefined}>
      {part}
    </span>
  ));
}

function GroupeProbleme({ titre, entrees, autres, sorte, outil }: { titre: string; entrees: EntreeRapport[]; autres: number; sorte: 'refus' | 'avert'; outil?: boolean }) {
  const Icone = sorte === 'refus' ? CircleX : TriangleAlert;
  return (
    <div className="groupe-pb">
      <h3>{titre}</h3>
      <ul>
        {entrees.map((e, i) => (
          <li key={i} className={`probleme ${sorte}`}>
            <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="cle chasse" title={e.cle}>
              {outil && `${e.objet} · `}{e.cle}
            </span>
            <span className="raison">{e.raison}</span>
          </li>
        ))}
        {autres > 0 && <li className="autres">… et {autres.toLocaleString('fr-FR')} autres</li>}
      </ul>
    </div>
  );
}

function LigneLot({ lot }: { lot: LotVue }) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const morceaux = morceauxLot(lot);
  const nbRefus = lot.refus.length + lot.refusAutres;
  const nbAlertes = lot.alertes.length + lot.alertesAutres;
  const depliable = nbRefus > 0 || nbAlertes > 0;
  const contenu = (
    <>
      <span className="chev" aria-hidden="true">
        {depliable && <ChevronRight size={16} strokeWidth={1.75} />}
      </span>
      <span className="corps">
        <span className="lot-ligne1">
          <span className="lot-date">{lot.outil?.libelle ?? dateHeure(lot.ouvertLe)}</span>
          {lot.outil && <span className="lot-ouverture">{dateHeure(lot.ouvertLe)}</span>}
          <span className="lot-jeton">
            <KeyRound size={12} strokeWidth={1.75} aria-hidden="true" />
            {lot.jeton}
          </span>
        </span>
        <span className="compteurs">
          {morceaux.length === 0
            ? 'Rien d’écrit'
            : morceaux.map((m, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {colorerRefus(m)}
                </span>
              ))}
        </span>
      </span>
      <Pastille sens="neutre" icone={ICONE_LOT[lot.etat]}>
        {ETAT_LOT[lot.etat]}
      </Pastille>
    </>
  );
  return (
    <li className={ouvert ? 'ouvert' : undefined}>
      {depliable ? (
        <button type="button" className="lot-tete" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert(!ouvert)}>
          {contenu}
        </button>
      ) : (
        <div className="lot-tete">{contenu}</div>
      )}
      {depliable && ouvert && (
        <div className="lot-detail" id={id}>
          {nbRefus > 0 && <GroupeProbleme titre={lot.outil ? `${nbRefus.toLocaleString('fr-FR')} ${nbRefus > 1 ? 'refusés' : 'refusé'}` : titreGroupe(nbRefus, 'refus')} entrees={lot.refus} autres={lot.refusAutres} sorte="refus" outil={!!lot.outil} />}
          {nbAlertes > 0 && (
            <GroupeProbleme titre={titreGroupe(nbAlertes, 'avertissement')} entrees={lot.alertes} autres={lot.alertesAutres} sorte="avert" outil={!!lot.outil} />
          )}
        </div>
      )}
    </li>
  );
}

/** E-18 Accès par API (GM only): the universe's API tokens and the report of its import batches. */
function AccesApi() {
  const { id } = useParams();
  const [query] = useSearchParams();
  const { mode } = useVue();
  const { toast } = useToasts();
  const base = `/api/univers/${id}`;
  const [univers] = useCharge<UniversListe>(base);
  const [lotsBrut, rechargerLots] = useCharge<LotVue[]>(`${base}/lots`);
  const lots = useGarde(lotsBrut);

  const adresse = `${window.location.origin}/api/v1/univers/${univers.etat === 'ok' ? univers.valeur.cle : id}`;

  if (mode === 'joueur' || query.get('mode') === 'joueur') return <PageIntrouvable />;
  if ([univers, lots].some((c) => c.etat === 'chargement')) return <ChargementListe texte="Chargement de l’accès par API…" />;
  // A player, no role, an unknown universe: the same answer.
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'ok' && univers.valeur.role !== 'mj') return <PageIntrouvable />;
  if (univers.etat === 'erreur' || lots.etat === 'erreur') {
    return (
      <ErreurChargement
        page
        onReessayer={() => {
          rechargerLots();
        }}
      />
    );
  }
  if (univers.etat !== 'ok' || lots.etat !== 'ok') return null;

  return (
    <div className="page-liste page-acces-api">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <KeyRound size={20} strokeWidth={1.75} />
        </span>
        <h1>Accès par API</h1>
      </header>
      <p className="intro">
        Un script écrit dans cet univers avec vos droits, par l’API d’import. Ses jetons se gèrent dans{' '}
        <Link to="/compte/jetons">Mes jetons d’API</Link>.
      </p>
      <div className="adresse">
        <span className="lib" id="lib-adresse">
          Adresse de base
        </span>
        <div className="copie">
          <code className="valeur chasse" aria-labelledby="lib-adresse">
            {adresse}
          </code>
          <Bouton icone={Copy} aria-label="Copier l’adresse de base" onClick={() => void copier(adresse).then((ok) => ok && toast('Adresse copiée.'))}>
            Copier
          </Bouton>
        </div>
      </div>

      <section className="bloc-api" aria-labelledby="h-lots">
        <div className="tete-panneau">
          <h2 id="h-lots">Lots d’import</h2>
        </div>
        {lots.valeur.length > 0 ? (
          <ul className="cadre-liste">
            {lots.valeur.map((l) => (
              <LigneLot key={l.lotId} lot={l} />
            ))}
          </ul>
        ) : (
          <div className="cadre-liste">
            <div className="vide-panneau-api">
              <p>Aucun lot d’import pour l’instant.</p>
            </div>
          </div>
        )}
      </section>

      <section className="bloc-api" aria-labelledby="h-relations-api">
        <div className="tete-panneau">
          <h2 id="h-relations-api">Relier deux fiches</h2>
        </div>
        <p className="intro">
          <code className="chasse">POST /fiches/:cle/relations</code> lit une liste d’entrées ; « nature » (se_situe, membre, detient, allie, ennemi) est facultative, « qualificatif »
          est obligatoire sans nature. « type » est déprécié : lu comme « qualificatif », avec un avertissement.
        </p>
        <code className="valeur chasse" aria-label="Exemple de relation">
          {'{ "section": "apparence", "cible": "lieu:port-sel", "nature": "se_situe", "qualificatif": "habite" }'}
        </code>
      </section>

    </div>
  );
}

export default { chemin: '/univers/:id/acces-api', composant: AccesApi } satisfies Ecran;
