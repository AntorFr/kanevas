import { FolderInput } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { iconeDuType, useTypes } from '../../types-contexte';
import { Alerte, Bouton, Champ, Fenetre } from '../../ui';
import { LigneChoix } from './ligne-choix';
import { LONGUEUR_RECHERCHE } from './liste-recherche';
import type { Fiche, PageFiches } from './types';

const DELAI = 300;
const ECHEC = 'L’action n’a pas abouti. Réessayez.';

type Choix = { id: number; titre: string };
type Liste = { k: 'chargement' } | { k: 'erreur' } | { k: 'ok'; fiches: Fiche[]; suivant: string | null };

/**
 * E-9 « Changer d'aventure… » (B-cr-aventure-1): the adventures the GM reads, one radio row each, the current one
 * shown and not choosable. The browser filters nothing: the list and the search are the server's.
 * `PATCH {campagne}` moves the report; the line under the title then updates in place.
 */
export function ChangerAventure({
  universId,
  fiche,
  onFermer,
  rafraichir,
}: {
  universId: string;
  fiche: Pick<Fiche, 'id' | 'titre' | 'campagneId'>;
  onFermer: () => void;
  rafraichir: () => Promise<void>;
}) {
  const { types } = useTypes();
  const perdue = useConnexionPerdue();
  const [saisie, setSaisie] = useState('');
  const [liste, setListe] = useState<Liste>({ k: 'chargement' });
  const [essai, setEssai] = useState(0);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const [choisi, setChoisi] = useState<Choix>();
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const mot = saisie.trim();
  const trop = mot.length > LONGUEUR_RECHERCHE;
  const base = `/api/univers/${universId}/fiches?type=aventure${mot ? `&q=${encodeURIComponent(mot)}` : ''}`;

  function droitPerdu(e: unknown): boolean {
    if (e instanceof ErreurApi && e.statut === 403) {
      onFermer();
      void rafraichir().catch(() => undefined);
      return true;
    }
    return false;
  }

  // Read at once when the box opens, 300 ms after the typing stops.
  useEffect(() => {
    setSuiteEchec(false);
    if (trop) return;
    setListe({ k: 'chargement' });
    let actif = true;
    const minuteur = setTimeout(() => {
      lire<PageFiches>(base).then(
        (p) => actif && setListe({ k: 'ok', fiches: p.fiches, suivant: p.suivant }),
        (e) => actif && !droitPerdu(e) && setListe({ k: 'erreur' }),
      );
    }, mot ? DELAI : 0);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, trop, essai]);

  async function suite() {
    if (liste.k !== 'ok' || liste.suivant === null || suiteEnCours) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(`${base}&curseur=${encodeURIComponent(liste.suivant)}`);
      setListe((l) => (l.k === 'ok' ? { k: 'ok', fiches: [...l.fiches, ...p.fiches], suivant: p.suivant } : l));
    } catch (e) {
      if (!droitPerdu(e)) setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function changer(e: FormEvent) {
    e.preventDefault();
    if (enCours || !choisi || choisi.id === fiche.campagneId || perdue) return;
    setRefus(undefined);
    setEnCours(true);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { campagne: choisi.id });
    } catch (err) {
      setEnCours(false);
      if (droitPerdu(err)) return;
      if (err instanceof ErreurApi && err.statut === 404) {
        setRefus('Introuvable.');
        setChoisi(undefined);
        setEssai((n) => n + 1);
      } else {
        setRefus(ECHEC);
      }
      return;
    }
    // The move is done; a failed refetch does not undo it.
    await rafraichir().catch(() => undefined);
    onFermer();
  }

  const fiches = liste.k === 'ok' && !trop ? liste.fiches : [];
  const seule = liste.k === 'ok' && !trop && mot === '' && liste.suivant === null && fiches.every((f) => f.id === fiche.campagneId);

  return (
    <Fenetre titre={`Changer l’aventure de « ${fiche.titre} »`} onFermer={onFermer} icone={FolderInput}>
      <form className="changer-type deplacer changer-aventure" onSubmit={changer} noValidate>
        <Champ
          etiquette="Chercher une aventure"
          value={saisie}
          autoComplete="off"
          erreur={trop ? `${LONGUEUR_RECHERCHE} caractères au plus.` : undefined}
          onChange={(e: { target: { value: string } }) => {
            setSaisie(e.target.value);
            setRefus(undefined);
          }}
        />
        <div className="resultats" role="radiogroup" aria-label="Nouvelle aventure">
          {!trop && liste.k === 'chargement' && (
            <p className="vide-res" role="status">
              {mot ? 'Recherche…' : 'Chargement…'}
            </p>
          )}
          {!trop && liste.k === 'erreur' && (
            <p className="vide-res" role="alert">
              Impossible de charger les aventures.{' '}
              <Bouton petit onClick={() => setEssai((n) => n + 1)}>
                Réessayer
              </Bouton>
            </p>
          )}
          {!trop && liste.k === 'ok' && fiches.length === 0 && liste.suivant === null && <p className="vide-res">Aucune aventure ne correspond.</p>}
          {fiches.map((f) => {
            const actuelle = f.id === fiche.campagneId;
            return (
              <div key={f.id} className="ligne-res">
                <LigneChoix
                  nom="nouvelle-aventure"
                  titre={f.titre}
                  Icone={iconeDuType(types, f.type)}
                  detail={f.sousType ?? ''}
                  note="(aventure actuelle)"
                  soi={actuelle}
                  choisi={choisi?.id === f.id}
                  onChoisir={() => {
                    setChoisi({ id: f.id, titre: f.titre });
                    setRefus(undefined);
                  }}
                />
              </div>
            );
          })}
          {seule && <p className="vide-res">Aucune autre aventure dans cet univers.</p>}
          {suiteEchec && (
            <p className="vide-res" role="alert">
              Impossible de charger la suite.
            </p>
          )}
          {!trop && liste.k === 'ok' && liste.suivant !== null && (
            <Bouton ecrit={false} disabled={perdue || suiteEnCours} onClick={() => void suite()}>
              {suiteEnCours ? 'Chargement…' : 'Charger la suite'}
            </Bouton>
          )}
        </div>
        <p className="cache-lecteur" role="status" aria-live="polite">
          {choisi ? `Nouvelle aventure : ${choisi.titre}` : ''}
        </p>
        {choisi && <p className="nouveau-parent" aria-hidden="true">Nouvelle aventure : {choisi.titre}</p>}
        {refus && <Alerte>{refus}</Alerte>}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={!choisi || perdue}>
            Changer d’aventure
          </Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
