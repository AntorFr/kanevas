import { Images, Library, Palette, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { appeler, envoyerFichier, ErreurApi, lire, useConnexionPerdue } from '../api';
import { useBasculeMode, useCharge, useTitreAriane } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import {
  Alerte, BarreSelection, Bouton, BoiteDialogue, CarteAsset, Champ, Chargement, ErreurChargement, Fenetre, Interrupteur, Menu, Onglets,
  PageIntrouvable, PanneauLateral, PuceFiltre, Segments, useSurvolPage, useToasts, VoileDepot, ZoneDepot,
} from '../ui';
import { DirectionArtistique } from './battlemap/direction';
import './ecrans.css';
import './battlemap-assets.css';

export type Categorie = 'objet' | 'vaisseau' | 'decor' | 'sol' | 'mur';
export const CATEGORIES: readonly { valeur: Categorie; libelle: string }[] = [
  { valeur: 'objet', libelle: 'Objets' },
  { valeur: 'vaisseau', libelle: 'Vaisseaux' },
  { valeur: 'decor', libelle: 'Décors' },
  { valeur: 'sol', libelle: 'Sols' },
  { valeur: 'mur', libelle: 'Murs' },
];
const MAX_ASSETS = 5000;
export const MESSAGE_PLEINE = 'Bibliothèque pleine (5 000 assets).';
const MESSAGE_SOL = 'Un sol ou un mur n’a pas d’empreinte.';
const EMPREINTES: readonly [number, number][] = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 3], [4, 4]];

export interface Asset {
  id: number;
  fichierId: number;
  nom: string;
  categorie: Categorie;
  largeur: number | null;
  hauteur: number | null;
  vueDessus: boolean;
  tags: string[];
  etat: 'valide' | 'brouillon';
  visible: boolean;
  jeton: string;
}
type Comptes = Record<Categorie, number> & { total: number };
interface Liste { assets: Asset[]; comptes: Comptes }
interface FichierDisponible { id: number; nom: string; jeton: string }

/** « 2×1 », or `null` for an asset with no footprint (a floor, a wall). */
export const empreinteDe = (a: Pick<Asset, 'largeur' | 'hauteur'>): string | null =>
  a.largeur === null || a.hauteur === null ? null : `${a.largeur}×${a.hauteur}`;

/** « Utilisé sur 0 carte » / « sur 3 cartes ». */
export const phraseUsage = (n: number) => `Utilisé sur ${n} carte${n > 1 ? 's' : ''}`;

const src = (universId: string, a: { fichierId?: number; id?: number; jeton: string }) =>
  `/api/univers/${universId}/fichiers/${a.fichierId ?? a.id}?v=${encodeURIComponent(a.jeton)}`;

type Echec = { texte: string; reessayer?: () => void };

function Bibliotheque({ id, ecriture, suffixe }: { id: string; ecriture: boolean; suffixe: string }) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [categorie, setCategorie] = useState<'' | Categorie>('');
  const [q, setQ] = useState('');
  const [qEffective, setQEffective] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [liste, setListe] = useState<Liste | null>(null);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [selection, setSelection] = useState<number[]>([]);
  const dernier = useRef<number | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [echec, setEchec] = useState<Echec | null>(null);
  const [refus, setRefus] = useState<string[]>([]);
  const [annonce, setAnnonce] = useState('');
  const [pleine, setPleine] = useState(false);
  const [aDeposer, setADeposer] = useState<File[] | null>(null);
  const [depot, setDepot] = useState(false);
  const [mediatheque, setMediatheque] = useState(false);
  const [retrait, setRetrait] = useState<{ ids: number[]; noms: string; cartes: number | null } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const recharger = useCallback(() => setEssai((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setQEffective(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let actif = true;
    const p = new URLSearchParams();
    if (categorie) p.set('categorie', categorie);
    if (qEffective) p.set('q', qEffective);
    if (tags.length) p.set('tags', tags.join(','));
    if (suffixe) p.set('mode', 'joueur');
    const chaine = p.toString();
    lire<Liste>(`/api/univers/${id}/outils/battlemap/assets${chaine ? `?${chaine}` : ''}`).then(
      (l) => {
        if (!actif) return;
        setListe(l);
        setErreur(false);
        const presents = new Set(l.assets.map((a) => a.id));
        setSelection((s) => s.filter((x) => presents.has(x)));
        setOuvert((o) => (o !== null && presents.has(o) ? o : null));
      },
      () => actif && setErreur(true),
    );
    return () => {
      actif = false;
    };
  }, [id, categorie, qEffective, tags, suffixe, essai]);

  const assets = liste?.assets ?? [];
  const total = liste?.comptes.total ?? 0;
  const bibliothequePleine = pleine || (liste !== null && !categorie && !qEffective && tags.length === 0 && total >= MAX_ASSETS);
  const filtres = qEffective !== '' || tags.length > 0;
  const etiquettes = useMemo(() => [...new Set([...tags, ...assets.flatMap((a) => a.tags)])].sort((a, b) => a.localeCompare(b, 'fr')), [assets, tags]);
  const choisis = assets.filter((a) => selection.includes(a.id));
  const ouvertAsset = assets.find((a) => a.id === ouvert) ?? null;

  const base = `/api/univers/${id}/outils/battlemap/assets`;

  // ---- drop
  function recevoir(fichiers: File[]) {
    if (!ecriture || fichiers.length === 0 || bibliothequePleine) return;
    setRefus([]);
    setADeposer(fichiers);
  }
  const survol = useSurvolPage(ecriture, recevoir);

  async function deposer(fichiers: File[], cat: Categorie) {
    setADeposer(null);
    setDepot(true);
    const refuses: string[] = [];
    let ajoutes = 0;
    let echecs: string | null = null;
    for (const f of fichiers) {
      try {
        await envoyerFichier(base, f, () => {}, 'POST', { categorie: cat }).promesse;
        ajoutes += 1;
      } catch (e) {
        if (e instanceof ErreurApi && e.code === 'bibliotheque_pleine') {
          setPleine(true);
          break;
        }
        if (e instanceof ErreurApi && e.statut === 413) refuses.push(`${f.name} : ${e.message}`);
        else if (e instanceof ErreurApi && e.statut === 400) refuses.push(`${f.name} n’est pas une image.`);
        else echecs = f.name;
      }
    }
    setDepot(false);
    setRefus(refuses);
    setAnnonce(ajoutes > 0 ? `${ajoutes} image${ajoutes > 1 ? 's' : ''} déposée${ajoutes > 1 ? 's' : ''}` : '');
    if (ajoutes > 0) toast(`${ajoutes} image${ajoutes > 1 ? 's' : ''} ajoutée${ajoutes > 1 ? 's' : ''}.`);
    if (echecs !== null) {
      const nom = echecs;
      setEchec({ texte: `Impossible d’ajouter ${nom}.`, reessayer: () => { setEchec(null); void deposer(fichiers.filter((f) => f.name === nom), cat); } });
    }
    recharger();
  }

  async function ajouterDepuisMediatheque(f: FichierDisponible) {
    try {
      await appeler('POST', `${base}/depuis-fichier`, { fichierId: f.id, categorie: categorie || 'objet' });
      toast(`« ${f.nom} » ajouté à la bibliothèque.`);
      recharger();
      return true;
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'bibliotheque_pleine') setPleine(true);
      else setEchec({ texte: `Impossible d’ajouter ${f.nom}.` });
      return false;
    }
  }

  // ---- selection
  function basculer(a: Asset, index: number, etendre: boolean) {
    setSelection((s) => {
      if (etendre && dernier.current !== null) {
        const de = assets.findIndex((x) => x.id === dernier.current);
        if (de >= 0) {
          const [i, j] = de < index ? [de, index] : [index, de];
          return [...new Set([...s, ...assets.slice(i, j + 1).map((x) => x.id)])];
        }
      }
      return s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id];
    });
    dernier.current = a.id;
  }

  async function modifier(ids: number[], changement: Record<string, unknown>, message: string) {
    setEchec(null);
    try {
      await appeler('PATCH', base, { ids, ...changement });
      toast(message);
      recharger();
      return true;
    } catch (e) {
      const m = e instanceof ErreurApi && e.statut === 400 ? e.message : null;
      setEchec({ texte: m ?? 'Impossible d’enregistrer.', reessayer: m ? undefined : () => void modifier(ids, changement, message) });
      return false;
    }
  }

  const nombreAssets = (n: number) => `${n} asset${n > 1 ? 's' : ''}`;

  function empreinteSelection(l: number, h: number) {
    if (choisis.some((a) => a.categorie === 'sol' || a.categorie === 'mur')) return setEchec({ texte: MESSAGE_SOL });
    void modifier(selection, { largeur: l, hauteur: h }, `Empreinte ${l}×${h} réglée sur ${nombreAssets(selection.length)}.`);
  }

  async function ajouterEtiquette(texte: string) {
    const tag = texte.trim();
    if (!tag) return;
    // Selected assets do not all carry the same labels: one request per distinct set, the new label added to each.
    const groupes = new Map<string, number[]>();
    for (const a of choisis) groupes.set(JSON.stringify(a.tags), [...(groupes.get(JSON.stringify(a.tags)) ?? []), a.id]);
    for (const [cle, ids] of groupes) {
      const existantes = JSON.parse(cle) as string[];
      if (existantes.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (!(await modifier(ids, { tags: [...existantes, tag] }, `Étiquette « ${tag} » ajoutée.`))) return;
    }
  }

  // ---- removal
  async function demanderRetrait(ids: number[]) {
    setEchec(null);
    const noms = assets.filter((a) => ids.includes(a.id)).map((a) => a.nom).join(', ');
    setRetrait({ ids, noms, cartes: null });
    try {
      const r = await Promise.all(ids.map((i) => lire<{ cartes: number }>(`${base}/${i}/utilisation`)));
      setRetrait((c) => (c ? { ...c, cartes: r.reduce((s, x) => s + x.cartes, 0) } : c));
    } catch {
      setRetrait(null);
      setEchec({ texte: 'Impossible de retirer.', reessayer: () => void demanderRetrait(ids) });
    }
  }

  async function confirmerRetrait() {
    if (!retrait) return;
    setEnCours(true);
    try {
      await appeler('DELETE', base, { ids: retrait.ids });
      toast(`${nombreAssets(retrait.ids.length)} retiré${retrait.ids.length > 1 ? 's' : ''}.`);
      setSelection((s) => s.filter((x) => !retrait.ids.includes(x)));
      setOuvert(null);
      setRetrait(null);
      recharger();
    } catch {
      const ids = retrait.ids;
      setRetrait(null);
      setEchec({ texte: 'Impossible de retirer.', reessayer: () => void demanderRetrait(ids) });
    } finally {
      setEnCours(false);
    }
  }

  const effacerFiltres = () => { setQ(''); setQEffective(''); setTags([]); setCategorie(''); };

  // ---- render
  const options = [
    { valeur: '' as const, libelle: 'Tous', compte: liste?.comptes.total },
    ...CATEGORIES.map((c) => ({ ...c, compte: liste?.comptes[c.valeur] })),
  ];

  let corps;
  if (liste === null) {
    corps = erreur
      ? <ErreurChargement texte="Impossible de charger la bibliothèque." onReessayer={() => { setErreur(false); recharger(); }} />
      : <Chargement texte="Chargement de la bibliothèque…" />;
  } else if (assets.length === 0) {
    corps = filtres
      ? <div className="etat bm-vide"><p>Aucun asset ne correspond.</p><Bouton onClick={effacerFiltres}>Effacer les filtres</Bouton></div>
      : categorie
        ? <div className="etat bm-vide"><p>Aucun asset dans cette catégorie.</p></div>
        : <div className="etat bm-vide"><p>{ecriture ? 'Aucun asset. Déposez des images.' : 'La bibliothèque est vide.'}</p></div>;
  } else {
    corps = (
      <ul className="bm-grille" aria-label="Assets">
        {assets.map((a, i) => (
          <li key={a.id}>
            <CarteAsset
              nom={a.nom}
              src={src(id, a)}
              empreinte={empreinteDe(a)}
              vueDessus={a.vueDessus}
              mj={ecriture && !a.visible}
              brouillon={a.etat === 'brouillon'}
              selectionnable={ecriture}
              selectionnee={selection.includes(a.id)}
              ouverte={ouvert === a.id}
              onOuvrir={ecriture ? () => setOuvert(a.id) : undefined}
              onSelection={(etendre) => basculer(a, i, etendre)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={`bm-assets${ouvertAsset ? ' bm-panneau-ouvert' : ''}`} {...survol.props}>
      {survol.survol && <VoileDepot texte="Déposez les images pour les ajouter." />}
      <Segments legende="Catégorie" options={options} valeur={categorie} onChange={(v) => { setCategorie(v); setSelection([]); }} />
      <div className="bm-outils">
        <Champ etiquette="Rechercher un asset" type="search" value={q} placeholder="Nom ou étiquette" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} />
      </div>
      {etiquettes.length > 0 && (
        <div className="bm-puces" role="group" aria-label="Étiquettes">
          {etiquettes.map((t) => (
            <PuceFiltre key={t} actif={tags.includes(t)} onChange={(on) => setTags((l) => (on ? [...l, t] : l.filter((x) => x !== t)))}>{t}</PuceFiltre>
          ))}
        </div>
      )}
      {ecriture && (
        <ZoneDepot onFichiers={recevoir} desactive={bibliothequePleine || depot || perdue} annonce={annonce} texte={depot ? 'Ajout en cours…' : 'Déposez des images ici'}>
          <Bouton icone={Library} disabled={bibliothequePleine || depot} ecrit onClick={() => setMediatheque(true)}>Choisir dans la médiathèque</Bouton>
        </ZoneDepot>
      )}
      {bibliothequePleine && <Alerte sens="avertissement">{MESSAGE_PLEINE}</Alerte>}
      {refus.map((r) => <Alerte key={r}>{r}</Alerte>)}
      {echec && (
        <Alerte action={echec.reessayer ? <Bouton petit onClick={echec.reessayer}>Réessayer</Bouton> : undefined}>{echec.texte}</Alerte>
      )}
      {ecriture && selection.length > 0 && (
        <BarreSelection nombre={selection.length} onVider={() => setSelection([])}>
          <Menu etiquette="Catégorie de la sélection" varianteDeclencheur="fantome-petit" declencheur="Catégorie"
            entrees={CATEGORIES.map((c) => ({ libelle: c.libelle, onChoisir: () => void modifier(selection, { categorie: c.valeur }, `Catégorie « ${c.libelle} » réglée.`) }))} />
          <Menu etiquette="Empreinte de la sélection" varianteDeclencheur="fantome-petit" declencheur="Empreinte"
            entrees={EMPREINTES.map(([l, h]) => ({ libelle: `${l}×${h}`, onChoisir: () => empreinteSelection(l, h) }))} />
          <Menu etiquette="Vue de dessus de la sélection" varianteDeclencheur="fantome-petit" declencheur="Vue de dessus"
            entrees={[
              { libelle: 'Vue de dessus', onChoisir: () => void modifier(selection, { vueDessus: true }, 'Vue de dessus réglée.') },
              { libelle: 'Pas de vue de dessus', onChoisir: () => void modifier(selection, { vueDessus: false }, 'Vue de dessus retirée.') },
            ]} />
          <Menu etiquette="Visibilité de la sélection" varianteDeclencheur="fantome-petit" declencheur="Visibilité"
            entrees={[
              { libelle: 'Visible des joueurs', onChoisir: () => void modifier(selection, { visible: true }, 'Visibilité réglée.') },
              { libelle: 'MJ seul', onChoisir: () => void modifier(selection, { visible: false }, 'Visibilité réglée.') },
            ]} />
          <EtiquetteAjout onAjouter={(t) => void ajouterEtiquette(t)} />
          <Bouton variante="danger" petit icone={Trash2} ecrit onClick={() => void demanderRetrait(selection)}>Retirer…</Bouton>
        </BarreSelection>
      )}
      {corps}

      {ouvertAsset && ecriture && (
        <PanneauAsset
          key={ouvertAsset.id}
          id={id}
          asset={ouvertAsset}
          echap={retrait === null}
          onFermer={() => setOuvert(null)}
          onEnregistrer={(changement) => modifier([ouvertAsset.id], changement, 'Asset enregistré.')}
          onRetirer={() => void demanderRetrait([ouvertAsset.id])}
        />
      )}

      {aDeposer && <BoiteDepot fichiers={aDeposer} defaut={categorie || 'objet'} onAnnuler={() => setADeposer(null)} onDeposer={(c) => void deposer(aDeposer, c)} />}
      {mediatheque && (
        <ChoixMediatheque id={id} base={base} onAjouter={ajouterDepuisMediatheque} onFermer={() => setMediatheque(false)} pleine={bibliothequePleine} />
      )}
      {retrait && (
        <BoiteDialogue
          titre={`Retirer ${nombreAssets(retrait.ids.length)}`}
          texte={retrait.cartes === null ? 'Calcul de l’usage…' : <><b>{retrait.noms}</b> · {phraseUsage(retrait.cartes)}.</>}
          action={`Retirer ${nombreAssets(retrait.ids.length)}`}
          desactive={retrait.cartes === null}
          enCours={enCours}
          onConfirmer={() => void confirmerRetrait()}
          onFermer={() => setRetrait(null)}
        >
          {retrait.cartes !== null && retrait.cartes > 0 && (
            <Alerte sens="avertissement">Sur ces cartes, les éléments deviennent des repères pour le MJ et disparaissent pour les joueurs. Le fichier reste dans la médiathèque.</Alerte>
          )}
        </BoiteDialogue>
      )}
    </div>
  );
}

function EtiquetteAjout({ onAjouter }: { onAjouter: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <form className="bm-etiquette" onSubmit={(e) => { e.preventDefault(); onAjouter(t); setT(''); }}>
      <Champ etiquette="Ajouter une étiquette" placeholder="Ajouter une étiquette" value={t} maxLength={30} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setT(e.target.value)} />
    </form>
  );
}

function BoiteDepot({ fichiers, defaut, onAnnuler, onDeposer }: { fichiers: File[]; defaut: Categorie; onAnnuler: () => void; onDeposer: (c: Categorie) => void }) {
  const [cat, setCat] = useState<Categorie>(defaut);
  return (
    <Fenetre titre={`Ajouter ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''}`} icone={Images} onFermer={onAnnuler}>
      <ul className="bm-fichiers">{fichiers.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}</ul>
      <Segments legende="Catégorie du dépôt" options={CATEGORIES} valeur={cat} onChange={setCat} />
      <div className="actions">
        <Bouton variante="principal" ecrit onClick={() => onDeposer(cat)}>{`Ajouter ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''}`}</Bouton>
        <Bouton onClick={onAnnuler}>Annuler</Bouton>
      </div>
    </Fenetre>
  );
}

function ChoixMediatheque({ id, base, onAjouter, onFermer, pleine }: {
  id: string; base: string; onAjouter: (f: FichierDisponible) => Promise<boolean>; onFermer: () => void; pleine: boolean;
}) {
  const [fichiers, setFichiers] = useState<FichierDisponible[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setErreur(false);
    lire<{ fichiers: FichierDisponible[] }>(`${base}/fichiers-disponibles`).then((r) => actif && setFichiers(r.fichiers), () => actif && setErreur(true));
    return () => { actif = false; };
  }, [base, essai]);
  return (
    <Fenetre titre="Choisir dans la médiathèque" icone={Library} onFermer={onFermer}>
      {erreur ? <ErreurChargement texte="Impossible de charger la médiathèque." onReessayer={() => setEssai((n) => n + 1)} />
        : fichiers === null ? <Chargement texte="Chargement de la médiathèque…" />
        : fichiers.length === 0 ? <p className="bm-vide-choix">Aucune image à ajouter : toutes celles de la médiathèque sont déjà des assets.</p>
        : (
          <ul className="bm-choix">
            {fichiers.map((f) => (
              <li key={f.id}>
                <img src={src(id, { id: f.id, jeton: f.jeton })} alt="" loading="lazy" />
                <span className="bm-choix-nom">{f.nom}</span>
                <Bouton petit disabled={pleine} ecrit aria-label={`Ajouter ${f.nom}`} onClick={() => void onAjouter(f).then((ok) => ok && setFichiers((l) => (l ?? []).filter((x) => x.id !== f.id)))}>Ajouter</Bouton>
              </li>
            ))}
          </ul>
        )}
      <div className="actions"><Bouton onClick={onFermer}>Fermer</Bouton></div>
    </Fenetre>
  );
}

function PanneauAsset({ id, asset, echap, onFermer, onEnregistrer, onRetirer }: {
  id: string; asset: Asset; echap: boolean; onFermer: () => void;
  onEnregistrer: (c: Record<string, unknown>) => Promise<boolean>; onRetirer: () => void;
}) {
  const [nom, setNom] = useState(asset.nom);
  const [cat, setCat] = useState<Categorie>(asset.categorie);
  const [l, setL] = useState(String(asset.largeur ?? ''));
  const [h, setH] = useState(String(asset.hauteur ?? ''));
  const [dessus, setDessus] = useState(asset.vueDessus);
  const [etiquettes, setEtiquettes] = useState(asset.tags.join(', '));
  const [erreur, setErreur] = useState<string | undefined>();
  const [visible, setVisible] = useState(asset.visible);
  const sans = cat === 'sol' || cat === 'mur';

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const n = nom.trim();
    if (n.length < 1 || n.length > 80) return setErreur('de 1 à 80 caractères.');
    setErreur(undefined);
    const tags = etiquettes.split(',').map((t) => t.trim()).filter(Boolean);
    await onEnregistrer({
      nom: n, categorie: cat, vueDessus: dessus, tags,
      ...(sans ? { largeur: null, hauteur: null } : { largeur: Number(l) || 1, hauteur: Number(h) || 1 }),
    });
  }

  async function regler(v: boolean) {
    setVisible(v);
    if (!(await onEnregistrer({ visible: v }))) setVisible(!v);
  }

  return (
    <PanneauLateral nom="Asset" libelle="Asset" icone={Palette} echap={echap} onFermer={onFermer}>
      <div className="bm-panneau-corps">
        <span className="carte-asset-vignette bm-panneau-image"><img src={src(id, asset)} alt={asset.nom} /></span>
        <h2 className="bm-panneau-titre">{asset.nom}</h2>
        <form onSubmit={(e) => void enregistrer(e)} noValidate>
          <Champ etiquette="Nom" value={nom} erreur={erreur} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNom(e.target.value)} />
          <Champ etiquette="Catégorie" liste value={cat} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCat(e.target.value as Categorie)}>
            {CATEGORIES.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
          </Champ>
          {sans ? <p className="bm-note">{MESSAGE_SOL}</p> : (
            <div className="bm-empreinte">
              <Champ etiquette="Largeur" type="number" min={1} max={20} value={l} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setL(e.target.value)} />
              <Champ etiquette="Hauteur" type="number" min={1} max={20} value={h} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setH(e.target.value)} />
            </div>
          )}
          <Interrupteur etiquette="Vue de dessus" coche={dessus} onChange={setDessus} />
          <Champ etiquette="Étiquettes" value={etiquettes} placeholder="métal, sommeil" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEtiquettes(e.target.value)} />
          <div className="actions"><Bouton type="submit" variante="principal" ecrit>Enregistrer</Bouton></div>
        </form>
        <Interrupteur etiquette="Visible des joueurs" coche={visible} ecrit onChange={(v) => void regler(v)} />
        <div className="actions"><Bouton variante="danger" icone={Trash2} ecrit onClick={onRetirer}>Retirer…</Bouton></div>
      </div>
    </PanneauLateral>
  );
}

function BibliothequeEcran() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const mj = univers.etat === 'ok' && univers.valeur.role === 'mj';
  const mode = useBasculeMode(mj);
  const joueur = mj && mode === 'joueur';
  const suffixe = joueur ? '?mode=joueur' : '';
  const [portail, setPortail] = useState<'chargement' | 'ok' | 'introuvable' | 'erreur'>('chargement');
  const [essai, setEssai] = useState(0);
  useTitreAriane('Bibliothèque', 'Outils');

  useEffect(() => {
    if (univers.etat === 'chargement') return;
    if (univers.etat === 'erreur') return setPortail(univers.statut === 404 || univers.statut === 403 ? 'introuvable' : 'erreur');
    let actif = true;
    setPortail('chargement');
    lire(`/api/univers/${id}/outils/battlemap/assets/description${suffixe}`).then(
      () => actif && setPortail('ok'),
      (e: unknown) => actif && setPortail(e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur'),
    );
    return () => { actif = false; };
  }, [id, suffixe, essai, univers.etat]); // eslint-disable-line react-hooks/exhaustive-deps

  if (portail === 'introuvable') return <PageIntrouvable />;
  if (portail === 'erreur') return <ErreurChargement page texte="Impossible de charger l’outil." onReessayer={() => setEssai((n) => n + 1)} />;
  if (portail === 'chargement') return <Chargement texte="Chargement de la bibliothèque…" />;

  const ecriture = mj && !joueur;
  // The art direction tab is the GM's only; a player (or the GM in Player mode) has no tab bar at all.
  if (!ecriture && params.get('onglet') === 'direction') return <PageIntrouvable />;
  const onglet = ecriture && params.get('onglet') === 'direction' ? 'direction' : 'assets';
  return (
    <div className="page-liste bm-page">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true"><Images size={20} strokeWidth={1.75} /></span>
        <h1>Bibliothèque</h1>
      </header>
      {ecriture && (
        <Onglets
          legende="Bibliothèque"
          actif={onglet}
          onglets={[{ valeur: 'assets', libelle: 'Assets' }, { valeur: 'direction', libelle: 'Direction artistique' }]}
          onChange={(v) => setParams(v === 'assets' ? {} : { onglet: v }, { replace: true })}
        />
      )}
      <div role={ecriture ? 'tabpanel' : undefined}>
        {onglet === 'assets'
          ? <Bibliotheque id={id!} ecriture={ecriture} suffixe={suffixe} />
          : <DirectionArtistique id={id!} />}
      </div>
    </div>
  );
}

export default { chemin: '/univers/:id/outils/battlemap/assets', composant: BibliothequeEcran } satisfies Ecran;
