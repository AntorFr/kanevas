import { Pastille, ListeAcces, Alerte, Bouton, type LigneAcces } from '../../ui';
import { RotateCcw } from 'lucide-react';
import {
  MOT_NIVEAU_SYSTEME,
  type JetonVue,
  type NiveauSysteme,
  type SystemeChoix,
} from './format';

const OPTIONS = [
  { valeur: 'aucun', libelle: '—' },
  { valeur: 'lecture', libelle: 'Lecture' },
  { valeur: 'ecriture', libelle: 'Écriture' },
] as const;

export const SUFFIXE_PLUS_MJ = 'lecture seule, vous n’êtes plus MJ du système';

/** What the form knows of the systems the owner reads: loading, failed, or the list. */
export type ListeSystemes = { etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; liste: SystemeChoix[] };

/**
 * The lines of the block: one per system the owner reads, plus the ones the token keeps and the owner no longer reads
 * (shown with « (plus lecteur) », their choice can only be lowered). `refus` are the ids a save refused.
 */
export function lignesSystemes(
  liste: SystemeChoix[],
  valeurs: Record<number, NiveauSysteme>,
  jeton: JetonVue | undefined,
  refus: ReadonlySet<number> = new Set(),
): LigneAcces[] {
  const lignes: LigneAcces[] = liste.map((s) => {
    const valeur = valeurs[s.id] ?? 'aucun';
    return {
      id: s.id,
      nom: s.nom,
      role: null,
      valeur,
      pastille: s.peutEcrire ? <Pastille sens="mj">MJ du système</Pastille> : <Pastille sens="table">Lecteur</Pastille>,
      ecritureOfferte: s.peutEcrire,
      suffixe: !s.peutEcrire && valeur === 'ecriture' && !refus.has(s.id) ? SUFFIXE_PLUS_MJ : undefined,
      erreur: refus.has(s.id) ? 'Vous n’êtes plus MJ de ce système.' : undefined,
    };
  });
  const connus = new Set(liste.map((s) => s.id));
  for (const a of jeton?.systemes ?? []) {
    if (connus.has(a.id)) continue;
    lignes.push({ id: a.id, nom: a.nom, role: null, valeur: valeurs[a.id] ?? 'aucun', ecritureOfferte: false });
  }
  return lignes;
}

/**
 * The block « Systèmes de jeu » of E-23 and E-5 (after « Univers atteints »). Absent when there is nothing to
 * choose; its label and two skeleton lines while loading; the box's alert and « Réessayer » on a load error.
 */
export function BlocSystemes({
  systemes,
  lignes,
  creation,
  onChange,
  onReessayer,
  desactive,
}: {
  systemes: ListeSystemes;
  lignes: LigneAcces[];
  creation: boolean;
  onChange: (id: number, valeur: NiveauSysteme) => void;
  onReessayer: () => void;
  desactive?: boolean;
}) {
  if (systemes.etat === 'ok' && lignes.length === 0) return null;
  return (
    <div className="bloc-systemes">
      <span id="lib-systemes" className="titre-liste-acces">
        Systèmes de jeu
      </span>
      {systemes.etat === 'chargement' && (
        <div className="squelette-systemes" role="status" aria-label="Chargement des systèmes">
          <div className="squelette" />
          <div className="squelette" />
        </div>
      )}
      {systemes.etat === 'erreur' && (
        <>
          <Alerte
            action={
              <Bouton petit icone={RotateCcw} onClick={onReessayer}>
                Réessayer
              </Bouton>
            }
          >
            Impossible de charger les systèmes.
          </Alerte>
          {creation && <p className="note-jeton">Sans cette liste, le jeton sera créé sans accès à un système.</p>}
        </>
      )}
      {systemes.etat === 'ok' && (
        <>
          <ListeAcces
            etiquette="Systèmes de jeu"
            lignes={lignes}
            avecComme={false}
            options={OPTIONS}
            libelleAbsent="(plus lecteur)"
            defile={lignes.length > 8}
            desactivee={desactive}
            onChange={(id, v) => onChange(id, v as NiveauSysteme)}
          />
          <p className="note-jeton">
            Un système n’est jamais compris dans « Tous mes univers » : choisissez-le ici. « Écriture » n’est offerte que là où vous êtes MJ du système.
          </p>
        </>
      )}
    </div>
  );
}

/** The second line of a token: « Systèmes : Stars Without Number : écriture · … », or null when it carries none. */
export function AccesSystemes({ j, lus }: { j: JetonVue; lus?: SystemeChoix[] }) {
  const liste = j.systemes ?? [];
  if (liste.length === 0) return null;
  return (
    <>
      Systèmes :{' '}
      {liste.map((s, i) => {
        const connu = lus?.find((x) => x.id === s.id);
        const plusMJ = s.niveau === 'ecriture' && !s.plusLecteur && connu !== undefined && !connu.peutEcrire;
        return (
          <span key={s.id}>
            {i > 0 && ' · '}
            <span className="sans-coupure">{s.nom} : {MOT_NIVEAU_SYSTEME[s.niveau]}</span>
            {s.plusLecteur && <small> (plus lecteur)</small>}
            {plusMJ && <small> ({SUFFIXE_PLUS_MJ})</small>}
          </span>
        );
      })}
    </>
  );
}
