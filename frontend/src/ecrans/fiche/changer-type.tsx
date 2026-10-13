import { useId, useState, type FormEvent } from 'react';

import { ErreurApi, appeler } from '../../api';
import { typeParType, useTypes, type TypeVue } from '../../types-contexte';
import { Bouton, Champ, Fenetre, useToasts } from '../../ui';
import { MAX_SOUS_TYPE, useSousTypesEmployes } from './sous-type';
import type { FicheVue } from './types';

/**
 * E-9 « Changer le type… »: the same row moves to another type (AD-113 (4)). Enabled types first, then
 * « Autres types » (still choosable); a character asks PJ / PNJ; the old sub-type goes, a new one may be given.
 */
export function ChangerType({
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
  const { etat, types, recharger } = useTypes();
  const { toast } = useToasts();
  const [choisi, setChoisi] = useState<string>();
  const [pj, setPj] = useState(false);
  const [sousType, setSousType] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const idListe = useId();
  const deja = useSousTypesEmployes(universId, choisi ?? '', choisi !== undefined);

  const proposes = types.filter((t) => t.reglable && t.type !== fiche.type);
  const actifs = proposes.filter((t) => t.active);
  const autres = proposes.filter((t) => !t.active);
  const cible = choisi ? typeParType(types, choisi) : undefined;
  const actuel = typeParType(types, fiche.type)?.singulier ?? fiche.type;

  async function changer(e: FormEvent) {
    e.preventDefault();
    if (enCours || !cible) return;
    const st = sousType.trim();
    if (Array.from(st).length > MAX_SOUS_TYPE) return setErreur(`${MAX_SOUS_TYPE} caractères au plus.`);
    setErreur(undefined);
    setEchec(undefined);
    setEnCours(true);
    try {
      await appeler('POST', `/api/univers/${universId}/fiches/${fiche.id}/type`, {
        type: cible.type,
        ...(cible.type === 'personnage' ? { charge: { pj } } : {}),
        ...(st === '' ? {} : { sousType: st }),
      });
      await rafraichir();
      toast(`Type changé : ${actuel} → ${cible.singulier}.`);
      onFermer();
    } catch (err) {
      setEnCours(false);
      if (err instanceof ErreurApi && err.statut === 403) {
        onFermer();
        onDroitPerdu();
      } else {
        setEchec('Le type n’a pas changé. Réessayez.');
      }
    }
  }

  const choix = (t: TypeVue) => (
    <label key={t.type} className="choix-type">
      <input type="radio" name="type-cible" checked={choisi === t.type} onChange={() => { setChoisi(t.type); setSousType(''); setErreur(undefined); }} />
      {t.singulier}
    </label>
  );

  return (
    <Fenetre titre={`Changer le type de « ${fiche.titre} »`} onFermer={onFermer}>
      <form className="changer-type" onSubmit={changer} noValidate>
        {echec && (
          <div className="echec" role="alert">
            {echec}
          </div>
        )}
        {etat === 'chargement' && <p role="status">Chargement des types…</p>}
        {etat === 'erreur' && (
          <p role="alert">
            Impossible de charger les types. <Bouton petit onClick={recharger}>Réessayer</Bouton>
          </p>
        )}
        {etat === 'ok' && proposes.length === 0 && <p>Aucun autre type n’est disponible.</p>}
        {etat === 'ok' && proposes.length > 0 && (
          <>
            <div role="radiogroup" aria-label="Nouveau type">
              {actifs.map(choix)}
              {autres.length > 0 && (
                <>
                  <p className="titre-groupe">Autres types</p>
                  {autres.map(choix)}
                </>
              )}
            </div>
            {cible?.type === 'personnage' && (
              <div className="choix" role="radiogroup" aria-label="Nature du personnage">
                <label>
                  <input type="radio" name="nature" checked={pj} onChange={() => setPj(true)} /> PJ
                </label>
                <label>
                  <input type="radio" name="nature" checked={!pj} onChange={() => setPj(false)} /> PNJ
                </label>
              </div>
            )}
            {fiche.sousType && <p className="retrait">Le sous-type « {fiche.sousType} » sera retiré.</p>}
            {cible && (
              <>
                <Champ
                  etiquette="Sous-type"
                  facultatif
                  value={sousType}
                  list={deja.length > 0 ? idListe : undefined}
                  autoComplete="off"
                  erreur={erreur}
                  onChange={(e: { target: { value: string } }) => {
                    setSousType(e.target.value);
                    setErreur(undefined);
                  }}
                />
                {deja.length > 0 && (
                  <datalist id={idListe} title={`Sous-types de ${cible.singulier.toLowerCase()} déjà employés`}>
                    {deja.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </>
        )}
        <div className="actions">
          <Bouton type="submit" variante="principal" ecrit enCours={enCours} disabled={!cible}>
            Changer le type
          </Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </form>
    </Fenetre>
  );
}
