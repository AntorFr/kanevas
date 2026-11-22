import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ErreurApi } from '../../../api';
import { validerAspectType } from '../../../wasm/coeur';
import { Bouton, Champ, ChampCouleur, Curseur, ListeChoix, Panneau, type GroupeChoix } from '../../../ui';
import { dessineurDuCoeur } from './carte-sprites';
import {
  aspectADessiner, brouillonAspect, canonAspect, champsDe, libelleChamp, libelleDeType, grouperTypes, lireAspect, lireBorne,
  type BorneNombre, type BrouillonAspect,
} from './aspects-logique';
import { poserAspect, type AspectReglage, type VueReglages } from './reglages-api';
import { texteNombre } from './reglages-logique';

type Objet = Record<string, unknown>;

/** The bounds of the numbers of a type, asked once to the core's own refusal (never copied). */
const bornesConnues = new Map<string, Promise<BorneNombre | undefined>>();
function borneDe(type: string, cle: string): Promise<BorneNombre | undefined> {
  const k = `${type}|${cle}`;
  let p = bornesConnues.get(k);
  if (!p) {
    p = (async () => {
      try {
        const hors = JSON.parse(await validerAspectType(type, JSON.stringify({ [cle]: -1e12 }))) as { ok: boolean; borne?: string };
        const b = hors.ok ? null : lireBorne(hors.borne ?? '');
        if (!b) return undefined;
        const demi = JSON.parse(await validerAspectType(type, JSON.stringify({ [cle]: b.min + 0.5 }))) as { ok: boolean; message?: string };
        return { ...b, entier: !demi.ok && demi.message === 'Nombre entier attendu.' };
      } catch { return undefined; }
    })();
    bornesConnues.set(k, p);
  }
  return p;
}

/** A body drawn by the core in the browser; keeps the last picture while the draft is refused. */
function Vignette({ type, surcharge, cote, valide = true }: { type: string; surcharge: Objet; cote: number; valide?: boolean }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const aspect = aspectADessiner(type, surcharge);
  const px = Math.max(16, Math.round(cote * dpr));
  useEffect(() => {
    if (!valide) return;
    let actif = true;
    void dessineurDuCoeur(aspect, px).then((octets) => {
      const t = toile.current;
      const g = t?.getContext('2d');
      if (!actif || !t || !g) return;
      const image = new ImageData(new Uint8ClampedArray(octets.buffer, octets.byteOffset, octets.byteLength).slice(), px, px);
      g.putImageData(image, 0, 0);
    }, () => undefined);
    return () => { actif = false; };
  }, [aspect, px, valide]);
  return <canvas ref={toile} className="rg-vignette" width={px} height={px} style={{ width: cote, height: cote }} aria-hidden="true" />;
}

/**
 * E-24, « Aspects »: the catalogue of types of the galaxy. The drafts live in the shell (`brouillons`), so a switch of tab
 * keeps them; an entry exists only for a type being edited.
 */
export default function Aspects({ universId, gid, vue, lectureSeule, perdue, brouillons, onBrouillon, onVue, onConflit, onIntrouvable, onEchec }: {
  universId: number | string; gid: string; vue: VueReglages; lectureSeule: boolean; perdue: boolean;
  brouillons: Record<string, BrouillonAspect>;
  onBrouillon: (type: string, b: BrouillonAspect | null) => void;
  onVue: (v: VueReglages) => void;
  onConflit: () => void;
  onIntrouvable: () => void;
  onEchec: (m: string | undefined) => void;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const parType = useMemo(() => new Map(vue.aspects.map((a) => [a.type, a])), [vue.aspects]);
  const [bornes, setBornes] = useState<Record<string, BorneNombre | undefined>>({});

  const ligne: AspectReglage | undefined = choisi ? parType.get(choisi) : undefined;
  const champs = useMemo(() => (ligne ? champsDe(ligne.defaut) : null), [ligne]);

  useEffect(() => {
    if (!choisi || !champs) return;
    let actif = true;
    setBornes({});
    void Promise.all(champs.nombres.map(async (k) => [k, await borneDe(choisi, k)] as const)).then((l) => {
      if (actif) setBornes(Object.fromEntries(l));
    });
    return () => { actif = false; };
  }, [choisi, champs]);

  const brouillon = ligne ? (brouillons[ligne.type] ?? brouillonAspect(ligne.defaut, ligne.surcharge)) : null;
  const lecture = ligne && brouillon ? lireAspect(brouillon, ligne.defaut, bornes, ligne.surcharge) : null;
  const invalide = lecture !== null && Object.keys(lecture.erreurs).length > 0;
  const modifie = ligne !== undefined && lecture !== null && canonAspect(lecture.surcharge) !== canonAspect(ligne.surcharge);
  const enregistre = ligne !== undefined && Object.keys(ligne.surcharge).length > 0;

  const groupes: GroupeChoix[] = grouperTypes(vue.aspects).map((g) => ({
    titre: g.titre,
    options: g.types.map((t) => {
      const a = parType.get(t)!;
      const b = brouillons[t];
      const l = b ? lireAspect(b, a.defaut, {}, a.surcharge) : null;
      const montre = l && Object.keys(l.erreurs).length === 0 ? l.surcharge : a.surcharge;
      return {
        id: t,
        libelle: libelleDeType(t, a.defaut),
        vignette: <Vignette type={t} surcharge={montre} cote={48} />,
        pastille: Object.keys(a.surcharge).length > 0 ? { sens: 'mj' as const, texte: 'Modifié' } : undefined,
      };
    }),
  }));

  const poser = (k: string, t: string) => ligne && brouillon && onBrouillon(ligne.type, { ...brouillon, [k]: t });

  async function envoyer(parametres: Objet | null) {
    if (!ligne) return;
    setEnCours(true); onEchec(undefined);
    try {
      const v = await poserAspect(universId, gid, ligne.type, { version: ligne.version, parametres });
      onVue(v);
      onBrouillon(ligne.type, null);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 404) return onIntrouvable();
      if (e instanceof ErreurApi && e.statut === 409 && e.code === 'a_change') return onConflit();
      if (e instanceof ErreurApi && e.code === 'reglage_invalide') return onEchec('Valeur refusée : voir les champs.');
      onEchec('Impossible d\'enregistrer cet aspect.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="rg-aspects">
      <div className="rg-aspects-liste">
        <ListeChoix etiquette="Types d'astre" groupes={groupes} selection={choisi} onChoisir={setChoisi} />
      </div>
      <div className="rg-aspects-editeur">
        {!ligne || !brouillon || !lecture || !champs ? (
          <p className="rg-aide">Choisissez un type pour modifier son aspect.</p>
        ) : (
          <Panneau titre={libelleDeType(ligne.type, ligne.defaut)}>
            <div className="rg-aspect-grand">
              <Vignette type={ligne.type} surcharge={lecture.surcharge} cote={160} valide={!invalide} />
              <p className="rg-aide">Les illustrations de tous les astres de ce type changent. Aucun astre ne bouge.</p>
            </div>

            {champs.palette.length > 0 && (
              <fieldset className="rg-palette">
                <legend>Palette</legend>
                {champs.palette.map((k) => (
                  <ChampCouleur key={k} etiquette={libelleChamp(k)} valeur={brouillon[k] ?? ''} disabled={lectureSeule}
                    onChange={(t) => poser(k, t)} />
                ))}
              </fieldset>
            )}
            {champs.couleurs.map((k) => (
              <ChampCouleur key={k} etiquette={libelleChamp(k)} valeur={brouillon[k] ?? ''} disabled={lectureSeule} onChange={(t) => poser(k, t)} />
            ))}
            <div className="rg-nombres">
            {champs.nombres.map((k) => {
              const born = bornes[k];
              const n = Number((brouillon[k] ?? '').replace(',', '.'));
              return (
                <div key={k} className="rg-nombre">
                  <Champ etiquette={libelleChamp(k)} value={brouillon[k] ?? ''} erreur={lecture.erreurs[k]} disabled={lectureSeule}
                    inputMode="decimal" autoComplete="off"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => poser(k, e.currentTarget.value)} />
                  {born && (
                    <Curseur etiquette={`${libelleChamp(k)} (curseur)`} valeur={Number.isFinite(n) ? Math.min(born.max, Math.max(born.min, n)) : born.min}
                      min={born.min} max={born.max} pas={born.entier ? 1 : (born.max - born.min) > 10 ? 0.1 : 0.05} disabled={lectureSeule}
                      affichage={texteNombre} onChange={(v) => poser(k, texteNombre(v))} />
                  )}
                  {born && <p className="rg-aide">Entre {texteNombre(born.min)} et {texteNombre(born.max)}.</p>}
                </div>
              );
            })}
            </div>

            {!lectureSeule && (
              <div className="rg-pied">
                <Bouton variante="principal" ecrit enCours={enCours} disabled={!modifie || invalide || perdue} onClick={() => void envoyer(Object.keys(lecture.surcharge).length > 0 ? lecture.surcharge : null)}>
                  Enregistrer
                </Bouton>
                <Bouton icone={RotateCcw} ecrit disabled={!enregistre || enCours || perdue} onClick={() => void envoyer(null)}>
                  Revenir au défaut
                </Bouton>
              </div>
            )}
          </Panneau>
        )}
      </div>
    </div>
  );
}
