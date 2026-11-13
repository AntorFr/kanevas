import { Library } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { appeler, envoyerFichier, ErreurApi, lire, useConnexionPerdue } from '../../api';
import {
  Alerte, Bouton, Champ, Chargement, ErreurChargement, Fenetre, Panneau, useSurvolPage, useToasts, VignetteReference, VoileDepot, ZoneDepot,
} from '../../ui';

const MAX_TEXTE = 5000;
const MAX_IMAGES = 8;
export const MESSAGE_LIMITE = '8 images au plus.';
export const PHRASE_MJ = 'Une image de référence est un fichier MJ seul : un fichier choisi dans la médiathèque le devient, et les joueurs ne le voient plus.';

interface Reference { fichierId: number; nom: string; legende: string; rang: number; jeton: string }
interface Direction { texte: string; textePrecedent: string | null; version: number; modifieLe: string | null; images: Reference[] }
interface FichierDisponible { id: number; nom: string; jeton: string }

const src = (universId: string, f: { fichierId?: number; id?: number; jeton: string }) =>
  `/api/univers/${universId}/fichiers/${f.fichierId ?? f.id}?v=${encodeURIComponent(f.jeton)}`;

/** « 163 / 5 000 » */
export const compteurTexte = (n: number) => `${n.toLocaleString('fr-FR')} / ${MAX_TEXTE.toLocaleString('fr-FR')}`.replace(/ /g, ' ');

export function DirectionArtistique({ id }: { id: string }) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const base = `/api/univers/${id}/outils/battlemap/direction`;
  const [dir, setDir] = useState<Direction | null>(null);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [texte, setTexte] = useState('');
  const [version, setVersion] = useState(0);
  const [images, setImages] = useState<Reference[]>([]);
  const [perime, setPerime] = useState(false);
  const [echec, setEchec] = useState<{ texte: string; reessayer?: () => void } | null>(null);
  const [refus, setRefus] = useState<string[]>([]);
  const [annonce, setAnnonce] = useState('');
  const [depot, setDepot] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [mediatheque, setMediatheque] = useState(false);

  const charger = useCallback(() => {
    let actif = true;
    lire<Direction>(base).then(
      (d) => {
        if (!actif) return;
        setDir(d);
        setTexte(d.texte);
        setVersion(d.version);
        setImages(d.images);
        setPerime(false);
        setErreur(false);
      },
      () => actif && setErreur(true),
    );
    return () => { actif = false; };
  }, [base]);
  useEffect(() => charger(), [charger, essai]);

  const pleines = images.length >= MAX_IMAGES;
  const modifie = dir !== null && texte !== dir.texte;

  async function enregistrer() {
    setEchec(null);
    setEnCours(true);
    try {
      const d = await appeler<Direction>('PUT', base, { texte, version });
      setDir(d);
      setVersion(d.version);
      setPerime(false);
      toast('Direction artistique enregistrée.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) setPerime(true);
      else if (e instanceof ErreurApi && e.statut === 400) setEchec({ texte: e.message });
      else setEchec({ texte: 'Impossible d’enregistrer.', reessayer: () => void enregistrer() });
    } finally {
      setEnCours(false);
    }
  }

  async function deposer(fichiers: File[]) {
    setRefus([]);
    setEchec(null);
    setDepot(true);
    const refuses: string[] = [];
    let ajoutes = 0;
    let place = MAX_IMAGES - images.length;
    for (const f of fichiers) {
      if (place <= 0) {
        refuses.push(MESSAGE_LIMITE);
        break;
      }
      try {
        const d = await envoyerFichier<Direction>(base + '/images', f, () => {}, 'POST').promesse;
        setImages(d.images);
        place = MAX_IMAGES - d.images.length;
        ajoutes += 1;
      } catch (e) {
        if (e instanceof ErreurApi && e.code === 'limite_references') {
          refuses.push(MESSAGE_LIMITE);
          break;
        }
        if (e instanceof ErreurApi && e.statut === 413) refuses.push(`${f.name} : ${e.message}`);
        else if (e instanceof ErreurApi && e.statut === 400) refuses.push(`${f.name} n’est pas une image.`);
        else setEchec({ texte: `Impossible d’ajouter ${f.name}.`, reessayer: () => void deposer([f]) });
      }
    }
    setDepot(false);
    setRefus([...new Set(refuses)]);
    setAnnonce(ajoutes > 0 ? `${ajoutes} image${ajoutes > 1 ? 's' : ''} déposée${ajoutes > 1 ? 's' : ''}` : '');
    if (ajoutes > 0) toast(`${ajoutes} image${ajoutes > 1 ? 's' : ''} ajoutée${ajoutes > 1 ? 's' : ''}.`);
  }
  const survol = useSurvolPage(true, (f) => void deposer(f));

  async function choisir(f: FichierDisponible): Promise<boolean> {
    try {
      const d = await appeler<Direction>('POST', `${base}/images/depuis-fichier`, { fichierId: f.id });
      setImages(d.images);
      toast(`« ${f.nom} » est devenu MJ seul.`);
      return true;
    } catch (e) {
      if (e instanceof ErreurApi && (e.code === 'limite_references' || e.statut === 409)) setRefus([e.code === 'limite_references' ? MESSAGE_LIMITE : e.message]);
      else setEchec({ texte: `Impossible d’ajouter ${f.nom}.` });
      return false;
    }
  }

  async function retirer(r: Reference) {
    setEchec(null);
    try {
      const d = await appeler<Direction>('DELETE', `${base}/images/${r.fichierId}`);
      setImages(d.images);
      setRefus([]);
      toast(`Référence « ${r.legende || r.nom} » retirée.`);
    } catch {
      setEchec({ texte: 'Impossible de retirer.', reessayer: () => void retirer(r) });
    }
  }

  async function legender(r: Reference, legende: string) {
    setEchec(null);
    try {
      const d = await appeler<Direction>('PATCH', `${base}/images/${r.fichierId}`, { legende });
      setImages(d.images);
    } catch (e) {
      setEchec({ texte: e instanceof ErreurApi && e.statut === 400 ? e.message : 'Impossible d’enregistrer.' });
      setImages((l) => [...l]);
    }
  }

  if (dir === null) {
    return erreur
      ? <ErreurChargement texte="Impossible de charger la direction artistique." onReessayer={() => { setErreur(false); setEssai((n) => n + 1); }} />
      : <Chargement texte="Chargement de la direction artistique…" />;
  }

  const vide = dir.version === 0 && images.length === 0;
  return (
    <div className="bm-direction" {...survol.props}>
      {survol.survol && <VoileDepot texte="Déposez les images pour les ajouter." />}
      {vide && <p className="etat">Aucune direction artistique. La génération et l’assistant travailleront sans style.</p>}
      {perime && (
        <Alerte sens="avertissement" action={<Bouton petit onClick={() => setEssai((n) => n + 1)}>Recharger</Bouton>}>
          Ce texte a changé depuis que vous l’avez ouvert.
        </Alerte>
      )}
      <Panneau titre="Style" reserveMj>
        <Champ
          etiquette="Style"
          zone
          className="bm-direction-texte"
          value={texte}
          maxLength={MAX_TEXTE}
          placeholder="Palette, lumière, matière, ce qu’il faut éviter…"
          compteur={compteurTexte(texte.length)}
          trop={texte.length >= MAX_TEXTE}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTexte(e.target.value)}
        />
      </Panneau>
      <Panneau titre={`Images de référence · ${images.length} / ${MAX_IMAGES}`} reserveMj>
        <ZoneDepot onFichiers={(f) => void deposer(f)} desactive={pleines || depot || perdue} annonce={annonce} texte={depot ? 'Ajout en cours…' : 'Déposez des images ici'}>
          <Bouton icone={Library} disabled={pleines || depot} ecrit onClick={() => setMediatheque(true)}>Choisir dans la médiathèque</Bouton>
        </ZoneDepot>
        {pleines && <Alerte sens="avertissement">{MESSAGE_LIMITE}</Alerte>}
        {refus.filter((r) => !(pleines && r === MESSAGE_LIMITE)).map((r) => <Alerte key={r}>{r}</Alerte>)}
        {images.length === 0 ? (
          <p className="etat bm-note">Aucune image de référence.</p>
        ) : (
          <ul className="bm-references" aria-label="Images de référence">
            {images.map((r) => (
              <li key={r.fichierId}>
                <VignetteReference nom={r.nom} src={src(id, r)} legende={r.legende} onLegende={(l) => void legender(r, l)} onRetirer={() => void retirer(r)} />
              </li>
            ))}
          </ul>
        )}
        <p className="bm-note">{PHRASE_MJ}</p>
      </Panneau>
      {echec && <Alerte action={echec.reessayer ? <Bouton petit onClick={echec.reessayer}>Réessayer</Bouton> : undefined}>{echec.texte}</Alerte>}
      <div className="actions">
        <Bouton variante="principal" ecrit enCours={enCours} disabled={!modifie && !perime} onClick={() => void enregistrer()}>Enregistrer</Bouton>
        <Bouton disabled title="Disponible avec l’assistant">Demander à l’assistant</Bouton>
      </div>
      {mediatheque && <ChoixImage id={id} base={base} deja={images.map((i) => i.fichierId)} pleine={pleines} onChoisir={choisir} onFermer={() => setMediatheque(false)} />}
    </div>
  );
}

function ChoixImage({ id, base, deja, pleine, onChoisir, onFermer }: {
  id: string; base: string; deja: number[]; pleine: boolean; onChoisir: (f: FichierDisponible) => Promise<boolean>; onFermer: () => void;
}) {
  const [fichiers, setFichiers] = useState<FichierDisponible[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setErreur(false);
    lire<{ fichiers: FichierDisponible[] }>(`${base.replace(/direction$/, 'assets')}/fichiers-disponibles`).then(
      (r) => actif && setFichiers(r.fichiers),
      () => actif && setErreur(true),
    );
    return () => { actif = false; };
  }, [base, essai]);
  const liste = (fichiers ?? []).filter((f) => !deja.includes(f.id));
  return (
    <Fenetre titre="Choisir dans la médiathèque" icone={Library} onFermer={onFermer}>
      {erreur ? <ErreurChargement texte="Impossible de charger la médiathèque." onReessayer={() => setEssai((n) => n + 1)} />
        : fichiers === null ? <Chargement texte="Chargement de la médiathèque…" />
        : liste.length === 0 ? <p className="bm-vide-choix">Aucune image à ajouter.</p>
        : (
          <>
            <p className="bm-note">Le fichier choisi devient MJ seul.</p>
            <ul className="bm-choix">
              {liste.map((f) => (
                <li key={f.id}>
                  <img src={src(id, { id: f.id, jeton: f.jeton })} alt="" loading="lazy" />
                  <span className="bm-choix-nom">{f.nom}</span>
                  <Bouton petit disabled={pleine} ecrit aria-label={`Ajouter ${f.nom}`} onClick={() => void onChoisir(f).then((ok) => ok && setFichiers((l) => (l ?? []).filter((x) => x.id !== f.id)))}>Ajouter</Bouton>
                </li>
              ))}
            </ul>
          </>
        )}
      <div className="actions"><Bouton onClick={onFermer}>Fermer</Bouton></div>
    </Fenetre>
  );
}
