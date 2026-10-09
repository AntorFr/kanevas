import { useState, type FormEvent } from 'react';

import { lire, useConnexionPerdue } from '../../api';
import { useCharge } from '../../cadre-contexte';
import { Bouton, Champ, Chargement, ErreurChargement, Fenetre } from '../../ui';
import type { PageFiches } from '../fiche/types';
import { libelleType, TYPES_CHOIX } from './types';

/**
 * « Ajouter une fiche » (E-11), shared by both shapes of map: a type, a search, the sheets of that
 * type with « Ajouter » — or « Déjà sur la carte ». It exists for the GM outside player mode only.
 */
export function AjoutFiche({
  universId,
  dejaPlacees,
  erreur,
  onAjouter,
  onFermer,
  rechargeur,
}: {
  universId: string;
  dejaPlacees: Set<number>;
  /** Refusal or failure of the last addition, shown in the window. */
  erreur?: string;
  onAjouter: (ficheId: number) => Promise<void>;
  onFermer: () => void;
  /** Changes when the list must be fetched again (a sheet that no longer exists). */
  rechargeur: number;
}) {
  const [type, setType] = useState(TYPES_CHOIX[0]!.type);
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [erreurRecherche, setErreurRecherche] = useState<string>();

  function chercher(e: FormEvent) {
    e.preventDefault();
    const t = saisie.trim();
    if (t.length > 100) return setErreurRecherche('100 caractères au plus.');
    setErreurRecherche(undefined);
    setRecherche(t);
  }

  return (
    <Fenetre titre="Ajouter une fiche" onFermer={onFermer}>
      <div className="carte-ajout">
        <Champ
          etiquette="Type de fiche"
          liste
          value={type}
          onChange={(e: { target: { value: string } }) => setType(e.target.value)}
        >
          {TYPES_CHOIX.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </Champ>
        <form onSubmit={chercher} noValidate role="search">
          <Champ
            etiquette="Chercher une fiche"
            value={saisie}
            erreur={erreurRecherche}
            onChange={(e: { target: { value: string } }) => setSaisie(e.target.value)}
          />
          <Bouton type="submit">Chercher</Bouton>
        </form>
        {erreur && (
          <div className="echec" role="alert">
            {erreur}
          </div>
        )}
        <Liste
          key={`${type}|${recherche}|${rechargeur}`}
          universId={universId}
          type={type}
          recherche={recherche}
          dejaPlacees={dejaPlacees}
          onAjouter={onAjouter}
        />
        <div className="actions">
          <Bouton onClick={onFermer}>Fermer</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}

function Liste({
  universId,
  type,
  recherche,
  dejaPlacees,
  onAjouter,
}: {
  universId: string;
  type: string;
  recherche: string;
  dejaPlacees: Set<number>;
  onAjouter: (ficheId: number) => Promise<void>;
}) {
  const perdue = useConnexionPerdue();
  const base = `/api/univers/${universId}/fiches?type=${type}${recherche === '' ? '' : `&q=${encodeURIComponent(recherche)}`}`;
  const [page, recharger] = useCharge<PageFiches>(base);
  const [suite, setSuite] = useState<{ fiches: PageFiches['fiches']; suivant: string | null } | null>(null);
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [suiteEchec, setSuiteEchec] = useState(false);
  const [enCours, setEnCours] = useState<number>();

  if (page.etat === 'chargement') return <Chargement />;
  if (page.etat === 'erreur') return <ErreurChargement texte="Impossible de charger les fiches." onReessayer={recharger} />;
  const fiches = [...page.valeur.fiches, ...(suite?.fiches ?? [])];
  const suivant = suite ? suite.suivant : page.valeur.suivant;

  async function chargerSuite() {
    if (suiteEnCours || suivant === null) return;
    setSuiteEnCours(true);
    setSuiteEchec(false);
    try {
      const p = await lire<PageFiches>(`${base}&curseur=${encodeURIComponent(suivant)}`);
      setSuite((s) => ({ fiches: [...(s?.fiches ?? []), ...p.fiches], suivant: p.suivant }));
    } catch {
      setSuiteEchec(true);
    } finally {
      setSuiteEnCours(false);
    }
  }

  async function ajouter(id: number) {
    if (enCours !== undefined) return;
    setEnCours(id);
    try {
      await onAjouter(id);
    } finally {
      setEnCours(undefined);
    }
  }

  return (
    <>
      {fiches.length === 0 ? (
        <div className="etat">
          <p>{recherche === '' ? 'Aucune fiche de ce type.' : 'Aucune fiche ne correspond.'}</p>
        </div>
      ) : (
        <ul className="carte-ajout-liste">
          {fiches.map((f) => (
            <li key={f.id}>
              <span className="carte-ajout-titre">
                {f.titre} <small>{libelleType(f.type)}</small>
              </span>
              {dejaPlacees.has(f.id) ? (
                <span className="carte-deja">Déjà sur la carte</span>
              ) : (
                <Bouton petit ecrit enCours={enCours === f.id} onClick={() => void ajouter(f.id)}>
                  Ajouter
                </Bouton>
              )}
            </li>
          ))}
        </ul>
      )}
      {suiteEchec && (
        <div className="echec" role="alert">
          Impossible de charger la suite.
        </div>
      )}
      {suivant !== null && (
        <Bouton enCours={suiteEnCours} onClick={() => void chargerSuite()} disabled={perdue}>
          Charger la suite
        </Bouton>
      )}
    </>
  );
}
