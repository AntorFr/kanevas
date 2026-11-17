import { Ban, SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { Alerte, BoiteDialogue, Bouton, Champ, Chargement, ErreurChargement, Pastille, useToasts } from '../../ui';
import { FormulaireJeton } from '../jetons/formulaire';
import { MOT_NIVEAU, dateCourte, dernierUsage, type JetonVue, type UniversChoix } from '../jetons/format';
import './jetons-api.css';

interface Reponse {
  jetons: JetonVue[];
  /** The universes each owner may choose, by owner id. */
  univers: Record<number, UniversChoix[]>;
}

/** E-5 accesses: « Tous les univers du compte — lecture · Éneria : — », or the list. */
function Acces({ j }: { j: JetonVue }) {
  const morceaux = j.univers.map((u) => `${u.nom} : ${MOT_NIVEAU[u.niveau]}`);
  const texte = morceaux.join(' · ');
  if (j.tous) {
    return (
      <span title={texte || undefined}>
        <strong>Tous les univers du compte</strong> — {MOT_NIVEAU[j.niveauTous ?? 'lecture']}
        {texte && <> · {texte}</>}
      </span>
    );
  }
  return <span title={texte}>{texte || '—'}</span>;
}

function Etat({ j }: { j: JetonVue }) {
  if (j.etat === 'revoque') {
    const parAdmin = j.revoquePar !== null && j.revoquePar !== j.compteId;
    return <Pastille sens="danger" icone={Ban}>{parAdmin ? 'Révoqué par l’admin' : 'Révoqué'}</Pastille>;
  }
  if (j.etat === 'expire') return <Pastille sens="neutre">Expiré</Pastille>;
  return null;
}

/** E-5, panel « Jetons d'API »: every token of the instance, for the admin; never a value. */
export function JetonsApi() {
  const [filtre, setFiltre] = useState('');
  const [charge, recharger] = useCharge<Reponse>(`/api/instance/jetons${filtre ? `?proprietaire=${filtre}` : ''}`);
  // The owners of the unfiltered list, kept while a filter narrows it.
  const proprietaires = useRef(new Map<number, string>());
  const derniere = useRef<Reponse | undefined>(undefined);
  if (charge.etat === 'ok') {
    derniere.current = charge.valeur;
    if (!filtre) {
      proprietaires.current = new Map(charge.valeur.jetons.map((j) => [j.compteId, j.proprietaire]));
    } else {
      for (const j of charge.valeur.jetons) if (!proprietaires.current.has(j.compteId)) proprietaires.current.set(j.compteId, j.proprietaire);
    }
  }
  const donnees = charge.etat === 'ok' ? charge.valeur : charge.etat === 'chargement' ? derniere.current : undefined;
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [modif, setModif] = useState<JetonVue | null>(null);
  const [aRevoquer, setARevoquer] = useState<JetonVue | null>(null);
  const [revocation, setRevocation] = useState<{ enCours: boolean; echec: boolean }>({ enCours: false, echec: false });
  const maintenant = Date.now();

  async function revoquer(j: JetonVue) {
    setRevocation({ enCours: true, echec: false });
    try {
      await appeler('DELETE', `/api/instance/jetons/${j.id}`);
      setARevoquer(null);
      setRevocation({ enCours: false, echec: false });
      toast('Jeton révoqué.');
      recharger();
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'jeton_revoque') {
        setARevoquer(null);
        setRevocation({ enCours: false, echec: false });
        toast('Ce jeton est révoqué.');
        recharger();
        return;
      }
      setRevocation({ enCours: false, echec: true });
    }
  }

  const liste = (
    <>
      <div className="jetons-admin-tete">
        <h2>Jetons d’API</h2>
        {(proprietaires.current.size > 0 || filtre) && (
          <Champ etiquette="Propriétaire" liste value={filtre} onChange={(e: { target: { value: string } }) => setFiltre(e.target.value)}>
            <option value="">Tous les comptes</option>
            {[...proprietaires.current].map(([id, nom]) => (
              <option key={id} value={String(id)}>{nom}</option>
            ))}
          </Champ>
        )}
      </div>
    </>
  );

  let corps;
  if (!donnees) {
    corps =
      charge.etat === 'erreur' ? (
        <ErreurChargement texte="Impossible de charger les jetons." onReessayer={recharger} />
      ) : (
        <Chargement texte="Chargement des jetons…" />
      );
  } else if (donnees.jetons.length === 0) {
    corps = (
      <div className="vide-pointille">
        <div className="etat"><h2>{filtre ? 'Aucun jeton pour ce compte.' : 'Aucun jeton sur cette instance.'}</h2></div>
      </div>
    );
  } else {
    corps = (
      <div className="table-jetons" role="table" aria-label="Jetons de l’instance">
        <div className="entetes-jetons" role="row">
          <span role="columnheader">Nom</span>
          <span role="columnheader">Propriétaire</span>
          <span role="columnheader">Accès</span>
          <span role="columnheader">Expiration</span>
          <span role="columnheader">Dernier usage</span>
          <span role="columnheader" className="vers-lecteurs">Actions</span>
        </div>
        {donnees.jetons.map((j) => (
          <div key={j.id} role="row" className={`ligne-table-jeton${j.etat !== 'actif' ? ' inactif' : ''}${perdue ? ' hors' : ''}`}>
            <span role="cell" className="cel-nom">
              <b className="tronque" title={j.nom}>{j.nom}</b>
              <Etat j={j} />
            </span>
            <span role="cell" className="cel-prop" title={j.proprietaire}>{j.proprietaire}</span>
            <span role="cell" className="cel-acces"><Acces j={j} /></span>
            <span role="cell" className="cel-exp">
              <em className="etiquette-bloc">Expiration</em>
              {j.etat === 'expire' ? `expiré le ${dateCourte(j.expireLe)}` : dateCourte(j.expireLe)}
            </span>
            <span role="cell" className="cel-usage">
              <em className="etiquette-bloc">Dernier usage</em>
              {dernierUsage(j.dernierUsageLe, maintenant).replace('dernier usage ', '')}
            </span>
            <span role="cell" className="cel-actions">
              {j.etat === 'actif' && (
                <>
                  <Bouton petit variante="fantome" icone={SlidersHorizontal} ecrit aria-label={`Modifier les accès de ${j.nom} (${j.proprietaire})`} onClick={() => setModif(j)}>
                    Modifier les accès
                  </Bouton>
                  <Bouton petit variante="fantome" icone={Ban} ecrit aria-label={`Révoquer ${j.nom} (${j.proprietaire})`} onClick={() => setARevoquer(j)}>
                    Révoquer
                  </Bouton>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="panneau jetons-admin">
      {liste}
      {donnees && charge.etat === 'erreur' && <Alerte>Impossible de charger les jetons.</Alerte>}
      {corps}
      {modif && (
        <FormulaireJeton
          admin
          jeton={modif}
          univers={donnees?.univers[modif.compteId] ?? []}
          url={`/api/instance/jetons/${modif.id}`}
          lireJeton={async () => (await appeler<Reponse>('GET', '/api/instance/jetons')).jetons.find((x) => x.id === modif.id)}
          onFermer={() => setModif(null)}
          onChange={(m) => {
            if (m) toast(m);
            recharger();
          }}
        />
      )}
      {aRevoquer && (
        <BoiteDialogue
          titre="Révoquer ce jeton ?"
          icone={Ban}
          texte={`Révoquer « ${aRevoquer.nom} » de ${aRevoquer.proprietaire} ? ${aRevoquer.proprietaire} verra « Révoqué par l’admin », et le script ou l’agent qui l’utilise ne pourra plus rien lire ni écrire.`}
          action="Révoquer le jeton"
          enCours={revocation.enCours}
          onConfirmer={() => void revoquer(aRevoquer)}
          onFermer={() => {
            setARevoquer(null);
            setRevocation({ enCours: false, echec: false });
          }}
        >
          {revocation.echec && <p role="alert" className="erreur-boite">Impossible d’enregistrer.</p>}
        </BoiteDialogue>
      )}
    </section>
  );
}
