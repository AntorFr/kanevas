import { Champ } from '../../../ui';
import { Equipage } from './Equipage';
import { consequencePoints } from './format';
import type { Alerte, ElementCatalogue, Ligne, Resultat } from './types';

type Info = { el: ElementCatalogue } | undefined;

/** The effect controls under a chosen line (B-83, X-7): the points of an exchange, the element a doubling aims at.
 *  Present only when the catalogue's row states the effect; nothing is computed here (V-5) — the consequence is the server's `echange`,
 *  the eligible lines are a display filter, and whether the target is valid is the server's blocking alert. */
const VISEES = ['montages_specialises', 'surcharge_cumulable', 'surdimensionne'];

/** The « Visée » rows (B-89, B-94): one per installation; the alerts are the server's (`cible_invalide`, `cible_deja_visee`, `effet_sans_objet`), only worded here. */
function Visees({ ligne, effet, lignes, alertes, ecriture, verrou, i, onRangee }: {
  ligne: Ligne; effet: string; lignes: Ligne[]; alertes: Alerte[]; ecriture: boolean; verrou: boolean; i: number;
  onRangee: (rang: number, valeur: string) => void;
}) {
  const armes = lignes.filter((l) => l.nature === 'armes');
  const amenagements = effet === 'surcharge_cumulable' ? [] : lignes.filter((l) => l.nature === 'amenagements');
  const dansConception = new Set([...armes, ...amenagements].map((l) => `${l.nature}/${l.cle}`));
  const rangees = Array.from({ length: ligne.quantite }, (_, k) => {
    const v = ligne.rangees?.[k] ?? '';
    return dansConception.has(v) ? v : '';
  });
  const nomDe = (v: string) => lignes.find((l) => `${l.nature}/${l.cle}` === v)?.nom;
  const vides = rangees.filter((v) => v === '').length;
  const invalide = alertes.find((a) => a.code === 'cible_invalide');
  const deja = alertes.some((a) => a.code === 'cible_deja_visee');
  const sansObjet = alertes.some((a) => a.code === 'effet_sans_objet');
  const idAlerte = `vx-visee-${i}`;
  const aucune = armes.length + amenagements.length === 0;
  const texteInvalide = invalide && (vides > 0
    ? (ligne.quantite === 1 ? 'Choisissez l\'élément visé' : `Choisissez l\'élément visé (${vides} installation${vides > 1 ? 's' : ''} sur ${ligne.quantite})`)
    : invalide.texte);
  const alertesLigne = (
    <>
      {texteInvalide && <p className="vx-alerte bloquante" id={idAlerte}><span className="vx-niveau">Bloquante</span><span>{texteInvalide}</span></p>}
      {deja && <p className="vx-alerte bloquante" id={`${idAlerte}-deja`}><span className="vx-niveau">Bloquante</span><span>Cet élément est déjà visé par un montage spécialisé</span></p>}
      {sansObjet && <p className="vx-alerte surveiller" id={`${idAlerte}-objet`}><span className="vx-niveau">À surveiller</span><span>Cet effet n&apos;a rien à modifier sur cette conception</span></p>}
    </>
  );
  const decrit = [texteInvalide ? idAlerte : '', deja ? `${idAlerte}-deja` : ''].filter(Boolean).join(' ') || undefined;

  if (!ecriture) {
    return (
      <div className="vx-effets">
        {rangees.map((v, k) => <p key={k} className="vx-lu">Visée : {nomDe(v) ?? '—'}</p>)}
        {alertesLigne}
      </div>
    );
  }
  if (aucune) {
    return (
      <div className="vx-effets">
        <p className="vx-equipage-bornes">{effet === 'surdimensionne' ? 'Aucune arme ni aucun aménagement à viser dans cette conception.' : 'Aucune arme à viser dans cette conception.'}</p>
        {alertesLigne}
      </div>
    );
  }
  return (
    <div className="vx-effets vx-vise vx-visees">
      {rangees.map((v, k) => (
        <Champ
          key={k} etiquette={ligne.quantite === 1 ? 'Visée' : `Visée ${k + 1}`} liste value={v} disabled={verrou}
          aria-invalid={v === '' && invalide ? true : undefined} aria-describedby={decrit}
          onChange={(e: { target: { value: string } }) => onRangee(k, e.target.value)}
        >
          <option value="">Choisir un élément</option>
          {armes.length > 0 && <optgroup label="Arme">{armes.map((l) => <option key={l.cle} value={`${l.nature}/${l.cle}`}>{l.nom}</option>)}</optgroup>}
          {amenagements.length > 0 && <optgroup label="Aménagement">{amenagements.map((l) => <option key={l.cle} value={`${l.nature}/${l.cle}`}>{l.nom}</option>)}</optgroup>}
        </Champ>
      ))}
      {alertesLigne}
    </div>
  );
}

export function Effets({ ligne, info, infos, lignes, resultat, alerte, alertes, indice, ecriture, verrou, cle, onPoints, onInvalide, onVise, onRangee }: {
  ligne: Ligne;
  info: Info;
  infos: Record<string, Info>;
  lignes: Ligne[];
  resultat: Resultat;
  alerte: Alerte | undefined;
  alertes: Alerte[];
  indice: number;
  ecriture: boolean;
  verrou: boolean;
  cle: number;
  onPoints: (n: number) => void;
  onInvalide: (invalide: boolean) => void;
  onVise: (valeur: string) => void;
  onRangee: (rang: number, valeur: string) => void;
}) {
  const d = info?.el.donnees;
  if (!d) return null;

  if (d.effet === 'echange') {
    const points = ligne.points ?? 0;
    const echange = resultat.lignes.find((r) => r.nature === ligne.nature && r.cle === ligne.cle)?.echange;
    const consequence = echange && (resultat.lignes.find((r) => r.nature === ligne.nature && r.cle === ligne.cle)?.points ?? 0) === points && points > 0
      ? consequencePoints(points, echange) : undefined;
    if (!ecriture) {
      return (
        <div className="vx-effets">
          <p className="vx-lu">Points échangés : {points}</p>
          {consequence && <p className="vx-equipage-bornes">{consequence}</p>}
        </div>
      );
    }
    return (
      <div className="vx-effets">
        <p className="vx-effets-lib">Points échangés</p>
        <Equipage
          key={`${ligne.nature}/${ligne.cle}-${cle}`} nom="Points échangés" etiquette={`Points échangés : ${ligne.nom}`} maximum={d.points_max ?? 99}
          valeur={points} bornes="" ligne={consequence} lecture={false} desactive={verrou}
          onChange={onPoints} onInvalide={onInvalide}
        />
      </div>
    );
  }

  if (d.effet !== undefined && VISEES.includes(d.effet)) {
    return <Visees ligne={ligne} effet={d.effet} lignes={lignes} alertes={alertes} ecriture={ecriture} verrou={verrou} i={indice} onRangee={onRangee} />;
  }

  if (d.effet === 'soutes_doublees' || d.effet === 'magasins_doubles') {
    const eligibles = lignes.filter((l) => d.effet === 'soutes_doublees'
      ? l.nature === 'amenagements' && (() => { const x = infos[`${l.nature}/${l.cle}`]?.el.donnees; return x?.soute !== undefined || x?.soute_par_classe !== undefined; })()
      : l.nature === 'armes');
    const valeur = ligne.vise ? `${ligne.vise.nature}/${ligne.vise.cle}` : '';
    const choisi = eligibles.some((l) => `${l.nature}/${l.cle}` === valeur) ? valeur : '';
    if (!ecriture) {
      const cible = ligne.vise && lignes.find((l) => l.nature === ligne.vise!.nature && l.cle === ligne.vise!.cle);
      return <div className="vx-effets"><p className="vx-lu">Élément visé : {cible ? cible.nom : 'aucun'}</p></div>;
    }
    if (eligibles.length === 0) {
      return <div className="vx-effets"><p className="vx-equipage-bornes">Aucun élément à viser dans cette conception.</p></div>;
    }
    return (
      <div className="vx-effets vx-vise">
        <Champ
          etiquette="Élément visé" liste value={choisi} disabled={verrou} aria-invalid={alerte ? true : undefined}
          onChange={(e: { target: { value: string } }) => onVise(e.target.value)}
        >
          <option value="">Choisir un élément</option>
          {eligibles.map((l) => <option key={`${l.nature}/${l.cle}`} value={`${l.nature}/${l.cle}`}>{l.nom}</option>)}
        </Champ>
      </div>
    );
  }
  return null;
}
