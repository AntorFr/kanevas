// The dialogs and the sheet panel of E-29: « Ajouter un pion », « Propriétaire… », « Ouvrir la fiche ».
import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire } from '../../../api';
import { Alerte, Bouton, Champ, Fenetre, Markdown, PanneauLateral, Segments } from '../../../ui';
import { Bibliotheque } from '../cartes/bibliotheque';
import { ChoixFiche } from '../cartes/proprietes';
import type { AssetCarte } from '../cartes/types';

export interface Membre { compteId: number; username: string; role: string }
export interface SpecPion { nom: string; assetId: string | null; ficheId: string | null; proprietaire: number | null }

type Source = 'fiche' | 'asset' | 'disque';
const SOURCES: readonly { valeur: Source; libelle: string }[] = [
  { valeur: 'fiche', libelle: 'Fiche' },
  { valeur: 'asset', libelle: 'Asset' },
  { valeur: 'disque', libelle: 'Disque' },
];
export const NOM_PION_MAX = 40;

/** « Ajouter un pion »: a sheet, an asset or a plain disc, a name 1–40, an optional owner. The input is kept when the add fails. */
export function AjouterPion({
  universId, assets, membres, onFermer, onAjouter,
}: {
  universId: number;
  assets: readonly AssetCarte[] | null;
  membres: readonly Membre[];
  onFermer: () => void;
  /** Resolves to a sentence when the table refused (the dialog stays open), `null` when the token is placed. */
  onAjouter: (spec: SpecPion) => Promise<string | null>;
}) {
  const [source, setSource] = useState<Source>('disque');
  const [nom, setNom] = useState('');
  const [asset, setAsset] = useState<AssetCarte | null>(null);
  const [fiche, setFiche] = useState<{ id: number; titre: string } | null>(null);
  const [choixFiche, setChoixFiche] = useState(false);
  const [proprietaire, setProprietaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const propre = nom.trim();
  const valide = propre.length >= 1 && propre.length <= NOM_PION_MAX && (source !== 'asset' || asset !== null) && (source !== 'fiche' || fiche !== null);

  async function valider() {
    if (!valide || enCours) return;
    setEnCours(true);
    setErreur(null);
    const refus = await onAjouter({
      nom: propre,
      assetId: source === 'asset' && asset ? String(asset.id) : null,
      ficheId: source === 'fiche' && fiche ? String(fiche.id) : null,
      proprietaire: proprietaire === '' ? null : Number(proprietaire),
    });
    setEnCours(false);
    if (refus !== null) setErreur(refus);
  }

  if (choixFiche) {
    return (
      <ChoixFiche universId={universId} onFermer={() => setChoixFiche(false)}
        onChoisir={(f) => { setFiche(f); setChoixFiche(false); if (nom.trim() === '') setNom(f.titre.slice(0, NOM_PION_MAX)); }} />
    );
  }
  return (
    <Fenetre titre="Ajouter un pion" onFermer={onFermer}>
      <div className="jeu-ajout">
        <Segments legende="Origine du pion" options={SOURCES} valeur={source} onChange={setSource} />
        {source === 'fiche' && (
          <div className="jeu-ajout-choix">
            <p className="editeur-note">{fiche ? fiche.titre : 'Aucune fiche choisie.'}</p>
            <Bouton onClick={() => setChoixFiche(true)}>Choisir une fiche…</Bouton>
          </div>
        )}
        {source === 'asset' && (
          <div className="jeu-ajout-choix">
            <p className="editeur-note">{asset ? asset.nom : 'Aucun asset choisi.'}</p>
            <Bibliotheque universId={universId} assets={assets} arme={[asset ? String(asset.id) : null]}
              onChoisir={(a) => { setAsset(a); if (nom.trim() === '') setNom(a.nom.slice(0, NOM_PION_MAX)); }} />
          </div>
        )}
        <Champ etiquette="Nom du pion" value={nom} maxLength={NOM_PION_MAX} autoComplete="off"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNom(e.target.value)} />
        <label className="champ">
          <span className="">Propriétaire (facultatif)</span>
          <select value={proprietaire} onChange={(e) => setProprietaire(e.target.value)}>
            <option value="">Sans propriétaire</option>
            {membres.map((m) => <option key={m.compteId} value={m.compteId}>{m.username}</option>)}
          </select>
        </label>
        {erreur && <Alerte>{erreur}</Alerte>}
        <div className="editeur-actions">
          <Bouton variante="principal" disabled={!valide} enCours={enCours} onClick={() => void valider()}>Ajouter</Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}

/** « Propriétaire… »: one of the members, or none. */
export function ChoixProprietaire({
  nom, membres, courant, onFermer, onChoisir,
}: {
  nom: string; membres: readonly Membre[]; courant: number | null; onFermer: () => void;
  onChoisir: (compteId: number | null) => Promise<boolean>;
}) {
  const [valeur, setValeur] = useState(courant === null ? '' : String(courant));
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  return (
    <Fenetre titre={`Propriétaire de « ${nom} »`} onFermer={onFermer}>
      <div className="jeu-ajout">
        <label className="champ">
          <span className="">Propriétaire</span>
          <select value={valeur} onChange={(e) => setValeur(e.target.value)}>
            <option value="">Sans propriétaire</option>
            {membres.map((m) => <option key={m.compteId} value={m.compteId}>{m.username}</option>)}
          </select>
        </label>
        {echec && <Alerte>L’action n’a pas abouti.</Alerte>}
        <div className="editeur-actions">
          <Bouton variante="principal" enCours={enCours} onClick={async () => {
            setEnCours(true);
            setEchec(false);
            const ok = await onChoisir(valeur === '' ? null : Number(valeur));
            setEnCours(false);
            if (ok) onFermer(); else setEchec(true);
          }}>Enregistrer</Bouton>
          <Bouton onClick={onFermer}>Annuler</Bouton>
        </div>
      </div>
    </Fenetre>
  );
}

interface FicheLue { id: number; titre: string; sections: { id: number; titre?: string; html?: string }[] }

/** « Ouvrir la fiche »: the sheet as the reader gets it (the server filters), in a side panel. */
export function PanneauFiche({ universId, ficheId, onFermer }: { universId: number; ficheId: string; onFermer: () => void }) {
  const [etat, setEtat] = useState<{ k: 'chargement' } | { k: 'ok'; fiche: FicheLue } | { k: 'perdue' }>({ k: 'chargement' });
  useEffect(() => {
    let actif = true;
    setEtat({ k: 'chargement' });
    lire<FicheLue>(`/api/univers/${universId}/fiches/${ficheId}`).then(
      (fiche) => actif && setEtat({ k: 'ok', fiche }),
      () => actif && setEtat({ k: 'perdue' }),
    );
    return () => { actif = false; };
  }, [universId, ficheId]);
  return (
    <PanneauLateral nom="Fiche" libelle="Fiche" icone={BookOpen} onFermer={onFermer} classe="jeu-fiche">
      {etat.k === 'chargement' && <p className="editeur-note" role="status">Chargement…</p>}
      {etat.k === 'perdue' && <p className="editeur-note" role="status">Fiche introuvable.</p>}
      {etat.k === 'ok' && (
        <div className="jeu-fiche-corps">
          <h2 className="editeur-panneau-titre">{etat.fiche.titre}</h2>
          {etat.fiche.sections.map((s) => (
            <section key={s.id}>
              {s.titre && <h3>{s.titre}</h3>}
              {s.html && <Markdown html={s.html} />}
            </section>
          ))}
          <Link className="bouton" to={`/univers/${universId}/fiche/${etat.fiche.id}`}>Ouvrir la fiche complète</Link>
        </div>
      )}
    </PanneauLateral>
  );
}
