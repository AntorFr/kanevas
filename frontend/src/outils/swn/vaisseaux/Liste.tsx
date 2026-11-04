import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import { Bouton, Chargement, ErreurChargement, PageIntrouvable, Pastille } from '../../../ui';
import { Creation } from './Creation';
import { credits, requete } from './format';
import type { ListeConceptions, PageCatalogue } from './types';

const PAGE = 50;

/** E-22, the list: one row per readable design, « Nouvelle conception » for a GM. */
export function Liste({ universId, suffixe, ouvrir }: { universId: number; suffixe: string; ouvrir: (ficheId: number) => void }) {
  const base = `/api/univers/${universId}/outils/swn/vaisseaux`;
  const perdue = useConnexionPerdue();
  const [liste, setListe] = useState<ListeConceptions | null>(null);
  const [erreur, setErreur] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [essai, setEssai] = useState(0);
  const [catalogueVide, setCatalogueVide] = useState(false);
  const [affiches, setAffiches] = useState(PAGE);
  const [creation, setCreation] = useState(false);
  useTitreAriane('Concepteur de vaisseaux', 'Outils');

  const charger = useCallback(() => {
    let actif = true;
    setErreur(false);
    Promise.all([
      lire<ListeConceptions>(`${base}/conceptions${requete(suffixe)}`),
      lire<PageCatalogue>(`/api/univers/${universId}/outils/swn/vaisseaux/catalogue${requete(suffixe, { nature: 'coques' })}`),
    ]).then(
      ([l, c]) => {
        if (!actif) return;
        setListe(l);
        setCatalogueVide(c.elements.length === 0);
      },
      (e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) return setIntrouvable(true);
        // A lost connection keeps the last list on screen.
        if (!(e instanceof ErreurApi && e.statut === 0 && liste)) setErreur(true);
      },
    );
    return () => { actif = false; };
  }, [base, suffixe, universId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => charger(), [charger, essai]);

  if (introuvable) return <PageIntrouvable />;
  if (erreur && !liste) return <ErreurChargement texte="Impossible de charger les conceptions." onReessayer={() => setEssai((n) => n + 1)} />;
  if (!liste) return <Chargement texte="Chargement du concepteur…" />;

  const mj = liste.peutCreer;
  return (
    <div className="vx">
      <div className="vx-entete">
        <h1>Concepteur de vaisseaux</h1>
        {mj && (
          <Bouton variante="principal" ecrit onClick={() => setCreation(true)}>
            Nouvelle conception
          </Bouton>
        )}
      </div>
      {perdue && <p className="echec" role="status">Connexion perdue.</p>}
      {erreur && <ErreurChargement texte="Impossible de charger les conceptions." onReessayer={() => setEssai((n) => n + 1)} />}
      {catalogueVide && (
        <p className="vx-note" role="status">
          Le catalogue du système est vide. {mj ? <>Importez-en un (<Link to={`/univers/${universId}/parametres`}>Outils</Link>).</> : 'Importez-en un (Outils).'}
        </p>
      )}
      {liste.conceptions.length === 0 ? (
        <div className="vx-vide">
          <p><strong>Aucune conception.</strong></p>
          {mj && <p>Créez une fiche de vaisseau, puis ouvrez-la ici.</p>}
        </div>
      ) : (
        <ul className="vx-liste">
          {liste.conceptions.slice(0, affiches).map((c) => (
            <li key={c.ficheId} className="vx-ligne">
              <div className="vx-titre-ligne">
                <Link
                  to={{ search: `?fiche=${c.ficheId}` }}
                  title={c.titre}
                  onClick={(e) => { e.preventDefault(); ouvrir(c.ficheId); }}
                >
                  {c.titre}
                </Link>
                <span className="vx-sous">{c.coque.nom} · classe {c.coque.classe}</span>
              </div>
              <span className="vx-prix">{credits(c.prix)}</span>
              {c.bloquantes > 0 && <Pastille sens="danger">{c.bloquantes} {c.bloquantes > 1 ? 'bloquantes' : 'bloquante'}</Pastille>}
              {c.aSurveiller > 0 && <Pastille sens="mj">{c.aSurveiller} à surveiller</Pastille>}
              <span className="vx-auteur">{c.auteur?.nom ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      {liste.conceptions.length > affiches && <Bouton onClick={() => setAffiches((n) => n + PAGE)}>Afficher la suite</Bouton>}
      {creation && (
        <Creation
          universId={universId}
          suffixe={suffixe}
          fiches={liste.fichesSansConception ?? []}
          onFermer={() => setCreation(false)}
          onCree={(id) => { setCreation(false); ouvrir(id); }}
        />
      )}
    </div>
  );
}
