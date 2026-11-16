import { Ban, KeyRound, Plus, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../api';
import { useCharge } from '../cadre-contexte';
import type { Ecran } from '../registre';
import { BoiteDialogue, Bouton, ChargementListe, ErreurChargement, LigneJeton, ListeJetons, Pastille, useToasts } from '../ui';
import { FormulaireJeton } from './jetons/formulaire';
import { MOT_NIVEAU, metaJeton, type JetonVue, type UniversChoix } from './jetons/format';
import './ecrans.css';
import './liste.css';

interface Reponse {
  jetons: JetonVue[];
  univers: UniversChoix[];
}

/** The accesses of a line: « Tous mes univers — lecture + écriture · Éneria : lecture », or the list. */
function AccesLigne({ j, univers }: { j: JetonVue; univers: UniversChoix[] }) {
  const connus = new Set(univers.map((u) => u.id));
  const plus = (id: number) => (connus.has(id) ? null : <small> (plus membre)</small>);
  const morceaux = j.univers.map((u) => (
    <span key={u.universId}>
      {u.nom} : {MOT_NIVEAU[u.niveau]}
      {plus(u.universId)}
    </span>
  ));
  const avec = (liste: React.ReactNode[]) => liste.flatMap((x, i) => (i === 0 ? [x] : [' · ', x]));
  if (j.tous) {
    return (
      <>
        <strong>Tous mes univers</strong> — {MOT_NIVEAU[j.niveauTous ?? 'lecture']}
        {morceaux.length > 0 && <> · {avec(morceaux)}</>}
      </>
    );
  }
  return <>{morceaux.length > 0 ? avec(morceaux) : '—'}</>;
}

function PastillesJeton({ j }: { j: JetonVue }) {
  if (j.etat === 'revoque') {
    const parAdmin = j.revoquePar !== null && j.revoquePar !== j.compteId;
    return (
      <Pastille sens="danger" icone={Ban}>
        {parAdmin ? 'Révoqué par l’admin' : 'Révoqué'}
      </Pastille>
    );
  }
  if (j.etat === 'expire') return <Pastille sens="neutre">Expiré</Pastille>;
  if (j.modifieParAdmin) {
    return (
      <Pastille sens="accent" icone={ShieldAlert}>
        Modifié par l’admin
      </Pastille>
    );
  }
  return null;
}

/** E-23 Mes jetons d'API: every account's own tokens (B-94), outside any universe. */
function MesJetons() {
  const [charge, recharger] = useCharge<Reponse>('/api/compte/jetons');
  const derniere = useRef<Reponse | undefined>(undefined);
  if (charge.etat === 'ok') derniere.current = charge.valeur;
  const donnees = charge.etat === 'ok' ? charge.valeur : charge.etat === 'chargement' ? derniere.current : undefined;
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [creation, setCreation] = useState(false);
  const [modif, setModif] = useState<JetonVue | null>(null);
  const [aRevoquer, setARevoquer] = useState<JetonVue | null>(null);
  const [revocation, setRevocation] = useState<{ enCours: boolean; echec: boolean }>({ enCours: false, echec: false });
  const maintenant = Date.now();

  async function revoquer(j: JetonVue) {
    setRevocation({ enCours: true, echec: false });
    try {
      await appeler('DELETE', `/api/compte/jetons/${j.id}`);
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

  if (!donnees && charge.etat === 'erreur') {
    return (
      <div className="page-liste page-jetons">
        <ErreurChargement page texte="Impossible de charger vos jetons." onReessayer={recharger} />
      </div>
    );
  }
  if (!donnees) return <ChargementListe texte="Chargement de vos jetons…" />;

  const { jetons, univers } = donnees;
  return (
    <div className="page-liste page-jetons">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <KeyRound size={20} strokeWidth={1.75} />
        </span>
        <h1>Mes jetons d’API</h1>
      </header>
      <p className="intro">
        Un jeton permet à un script ou à un agent d’agir avec vos droits, par l’API ou par le serveur MCP, dans les univers que vous choisissez.
      </p>
      <section className="bloc-jetons" aria-labelledby="h-jetons">
        <div className="tete-panneau">
          <h2 id="h-jetons">Jetons</h2>
          <Bouton variante="principal" icone={Plus} ecrit onClick={() => setCreation(true)}>
            Créer un jeton
          </Bouton>
        </div>
        {charge.etat === 'erreur' && (
          <ErreurChargement texte="Impossible de charger vos jetons." onReessayer={recharger} />
        )}
        {jetons.length === 0 ? (
          <div className="liste-jetons-vide">
            <p>Aucun jeton.</p>
          </div>
        ) : (
          <ListeJetons etiquette="Vos jetons">
            {jetons.map((j) => (
              <LigneJeton
                key={j.id}
                nom={j.nom}
                pastilles={<PastillesJeton j={j} />}
                acces={<AccesLigne j={j} univers={univers} />}
                meta={metaJeton(j, maintenant)}
                inactif={j.etat !== 'actif'}
                hors={perdue}
                actions={
                  j.etat === 'actif' ? (
                    <>
                      <Bouton petit variante="fantome" icone={SlidersHorizontal} ecrit aria-label={`Modifier les accès de ${j.nom}`} onClick={() => setModif(j)}>
                        Modifier les accès
                      </Bouton>
                      <Bouton petit variante="fantome" icone={Ban} ecrit aria-label={`Révoquer ${j.nom}`} onClick={() => setARevoquer(j)}>
                        Révoquer
                      </Bouton>
                    </>
                  ) : undefined
                }
              />
            ))}
          </ListeJetons>
        )}
      </section>

      {creation && (
        <FormulaireJeton
          univers={univers}
          url="/api/compte/jetons"
          onFermer={() => setCreation(false)}
          onChange={(m) => {
            if (m) toast(m);
            recharger();
          }}
        />
      )}
      {modif && (
        <FormulaireJeton
          jeton={modif}
          univers={univers}
          url={`/api/compte/jetons/${modif.id}`}
          lireJeton={async () => (await appeler<Reponse>('GET', '/api/compte/jetons')).jetons.find((x) => x.id === modif.id)}
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
          texte={`Révoquer « ${aRevoquer.nom} » ? Le script ou l’agent qui l’utilise ne pourra plus rien lire ni écrire.`}
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
    </div>
  );
}

export default { chemin: '/compte/jetons', composant: MesJetons } satisfies Ecran;
