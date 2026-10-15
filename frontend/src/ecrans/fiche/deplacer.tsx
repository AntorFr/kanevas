import { FolderInput } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../../api';
import { badgeFiche, iconeDuType, useTypes } from '../../types-contexte';
import { Alerte, Bouton, Champ, Fenetre, useToasts } from '../../ui';
import { LONGUEUR_RECHERCHE } from './liste-recherche';
import type { Fiche, FicheVue, PageFiches } from './types';

const DELAI = 300;

type Resultats =
  | { k: 'attente' }
  | { k: 'recherche' }
  | { k: 'erreur' }
  | { k: 'ok'; fiches: Fiche[]; suivant: string | null };

/** The refusals of the move, in the interface's words; anything else is the generic failure. */
export function texteRefus(e: unknown): string {
  if (e instanceof ErreurApi) {
    if (e.code === 'cycle') return 'Une fiche ne peut pas être rangée sous l’un de ses descendants.';
    if (e.code === 'trop_profond') return 'La hiérarchie est trop profonde.';
    if (e.statut === 404) return 'Introuvable.';
  }
  return 'La fiche n’a pas été déplacée. Réessayez.';
}

/**
 * E-9 « Déplacer sous… » (P-14, AD-115): search a sheet of any type, or « Aucun parent », then move.
 * A cycle is refused by the server and said under the field; the box stays open.
 */
export function DeplacerSous({
  universId,
  fiche,
  onFermer,
  rafraichir,
  onDroitPerdu,
}: {
  universId: string;
  fiche: FicheVue;
  onFermer: () => void;
  rafraichir: () => Promise<void>;
  onDroitPerdu: () => void;
}) {
  const { types } = useTypes();
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [saisie, setSaisie] = useState('');
  const [essai, setEssai] = useState(0);
  const [resultats, setResultats] = useState<Resultats>({ k: 'attente' });
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  // `undefined`: nothing chosen yet; `null`: « Aucun parent ».
  const [choisi, setChoisi] = useState<number | null | undefined>();
  const [refus, setRefus] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  const mot = saisie.trim();
  const trop = mot.length > LONGUEUR_RECHERCHE;

  // Search 300 ms after the typing stops; one character at least, a hundred at most.
  useEffect(() => {
    setSuiteEchec(false);
    if (mot === '' || trop) {
      setResultats({ k: 'attente' });
      return;
    }
    setResultats({ k: 'recherche' });
    let actif = true;
    const minuteur = setTimeout(() => {
      lire<PageFiches>(`/api/univers/${universId}/fiches?q=${encodeURIComponent(mot)}`).then(
        (p) => actif && setResultats({ k: 'ok', fiches: p.fiches, suivant: p.suivant }),
        () => actif && setResultats({ k: 'erreur' }),
      );
    }, DELAI);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [mot, trop, universId, essai]);

  async function suite() {
    if (resultats.k !== 'ok' || resultats.suivant === null || suiteEnCours) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(
        `/api/univers/${universId}/fiches?q=${encodeURIComponent(mot)}&curseur=${encodeURIComponent(resultats.suivant)}`,
      );
      setResultats((r) => (r.k === 'ok' ? { k: 'ok', fiches: [...r.fiches, ...p.fiches], suivant: p.suivant } : r));
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function deplacer(e: FormEvent) {
    e.preventDefault();
    if (enCours || choisi === undefined || perdue) return;
    setRefus(undefined);
    setEnCours(true);
    try {
      await appeler('PATCH', `/api/univers/${universId}/fiches/${fiche.id}`, { parent: choisi });
    } catch (err) {
      setEnCours(false);
      if (err instanceof ErreurApi && err.statut === 403) {
        onFermer();
        onDroitPerdu();
      } else {
        setRefus(texteRefus(err));
      }
      return;
    }
    // The move is done; a failed refetch does not undo it.
    await rafraichir().catch(() => undefined);
    toast('Fiche déplacée.');
    onFermer();
  }

  const fiches = resultats.k === 'ok' ? resultats.fiches.filter((f) => f.id !== fiche.id) : [];

  return (
    <Fenetre titre={`Déplacer « ${fiche.titre} » sous…`} onFermer={onFermer} icone={FolderInput}>
      <form className="changer-type deplacer" onSubmit={deplacer} noValidate>
        <Champ
          etiquette="Chercher une fiche"
          value={saisie}
          autoFocus
          autoComplete="off"
          erreur={trop ? `${LONGUEUR_RECHERCHE} caractères au plus.` : undefined}
          onChange={(e: { target: { value: string } }) => {
            setSaisie(e.target.value);
            setRefus(undefined);
          }}
        />
        <div className="resultats" role="radiogroup" aria-label="Nouveau parent">
          <label className="resultat aucun">
            <input
              type="radio"
              name="nouveau-parent"
              checked={choisi === null}
              onChange={() => {
                setChoisi(null);
                setRefus(undefined);
              }}
            />
            <span className="puce" aria-hidden="true" />
            Aucun parent
          </label>
          <div className="sep-res" role="presentation" />
          {resultats.k === 'attente' && <p className="vide-res">Tapez le début d’un titre.</p>}
          {resultats.k === 'recherche' && (
            <p className="vide-res" role="status">
              Recherche…
            </p>
          )}
          {resultats.k === 'erreur' && (
            <p className="vide-res" role="alert">
              Impossible de chercher.{' '}
              <Bouton petit onClick={() => setEssai((n) => n + 1)}>
                Réessayer
              </Bouton>
            </p>
          )}
          {resultats.k === 'ok' && fiches.length === 0 && resultats.suivant === null && <p className="vide-res">Aucune fiche ne correspond.</p>}
          {fiches.map((f) => {
            const Icone = iconeDuType(types, f.type);
            const detail = [badgeFiche(types, f), f.sousType].filter(Boolean).join(' · ');
            return (
              <label key={f.id} className="resultat">
                <input
                  type="radio"
                  name="nouveau-parent"
                  checked={choisi === f.id}
                  onChange={() => {
                    setChoisi(f.id);
                    setRefus(undefined);
                  }}
                />
                <span className="puce" aria-hidden="true" />
                <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
                {f.titre}
                <span className="type-option">{detail}</span>
              </label>
            );
          })}
          {suiteEchec && (
            <p className="vide-res" role="alert">
              Impossible de charger la suite.
            </p>
          )}
          {resultats.k === 'ok' && resultats.suivant !== null && (
            <Bouton ecrit={false} enCours={suiteEnCours} disabled={perdue} onClick={() => void suite()}>
              Charger la suite
            </Bouton>
          )}
        </div>
        {refus && !trop && <Alerte>{refus}</Alerte>}
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={choisi === undefined || perdue}>
            Déplacer
          </Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
