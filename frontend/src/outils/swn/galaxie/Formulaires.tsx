import { Check, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { appeler, useConnexionPerdue } from '../../../api';
import { Bouton, Champ, Interrupteur, Segments } from '../../../ui';
import { cases, distanceHex } from './geo';
import {
  CONFLIT, COULEURS, couleurServeur, ECHEC_ECRITURE, entierAffiche, erreurNom, lireEchec, TAILLES_NOMS, type Echec,
} from './ecriture';
import type { RouteCarte, SystemeCarte, ZoneCarte } from './types';

/** The state of a form that writes: in flight, refused, stale. One hook, so every form says the same words. */
export function useEnvoi(quoi: 'systeme' | 'route' | 'zone' | 'galaxie', surIntrouvable: () => void) {
  const perdue = useConnexionPerdue();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<Echec | null>(null);
  async function envoyer<T>(appel: () => Promise<T>): Promise<T | undefined> {
    if (enCours || perdue) return undefined;
    setEchec(null);
    setEnCours(true);
    try {
      return await appel();
    } catch (e) {
      const f = lireEchec(e);
      if (f.sorte === 'introuvable') surIntrouvable();
      else setEchec(f);
      return undefined;
    } finally {
      setEnCours(false);
    }
  }
  const messages = (aucun?: (e: Echec) => boolean): ReactNode => {
    if (!echec || echec.sorte === 'perdu' || echec.sorte === 'introuvable' || (aucun && aucun(echec))) return null;
    if (echec.sorte === 'conflit') return <p className="echec" role="alert">{CONFLIT[quoi]}</p>;
    if (echec.sorte === 'refus') return <p className="echec" role="alert">Action refusée.</p>;
    if (echec.sorte === 'autre') return <p className="echec" role="alert">{ECHEC_ECRITURE}</p>;
    return null;
  };
  return { enCours, echec, setEchec, envoyer, messages, conflit: echec?.sorte === 'conflit', perdue };
}

function Pied({ enCours, conflit, onRecharger, onAnnuler, libelle, desactive, enfants }: {
  enCours: boolean; conflit: boolean; onRecharger?: () => void; onAnnuler: () => void; libelle: string; desactive?: boolean; enfants?: ReactNode;
}) {
  return (
    <div className="gx-actions">
      {conflit && onRecharger && <Bouton onClick={onRecharger}>Recharger</Bouton>}
      <Bouton type="submit" variante="principal" icone={Check} ecrit disabled={desactive || enCours}>{enCours ? 'Enregistrement…' : libelle}</Bouton>
      <Bouton icone={X} onClick={onAnnuler} disabled={enCours}>Annuler</Bouton>
      {enfants}
    </div>
  );
}

function SelecteurCouleur({ valeur, onChange }: { valeur: string; onChange: (c: string) => void }) {
  return (
    <fieldset className="gx-couleurs">
      <legend>Couleur</legend>
      {COULEURS.map((c) => (
        <label key={c.nom}>
          <input type="radio" name="gx-couleur" value={c.nom} checked={valeur === c.nom} onChange={() => onChange(c.nom)} />
          <span className={`gx-pastille-couleur ${c.nom}`} aria-hidden="true" />
          <span className="gx-sr">{c.libelle}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface BrouillonSysteme { nom: string; taille: string; couleur: string; notes: string; secret: boolean }

/** « Nouveau système », « Promouvoir ce système » and « Modifier » share one form (E-21). */
export function FormSysteme({ base, mode, q, r, brouillon, version, cle, nbRoutes, onFini, onAnnuler, onDeplacer, onRecharger, onIntrouvable }: {
  base: string; mode: 'nouveau' | 'promouvoir' | 'modifier'; q: number; r: number; brouillon: BrouillonSysteme;
  version?: number; cle?: string; nbRoutes: number; onFini: (cle: string) => void; onAnnuler: () => void;
  onDeplacer: (b: BrouillonSysteme) => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [v, setV] = useState(brouillon);
  const [ouvert] = useState({ q, r });
  const [erreurNomMsg, setErreurNom] = useState<string>();
  const e = useEnvoi('systeme', onIntrouvable);
  const place = e.echec?.sorte === 'champ' ? e.echec : null;
  const titre = mode === 'nouveau' ? 'Nouveau système' : mode === 'promouvoir' ? 'Promouvoir ce système' : 'Modifier le système';
  const deplace = mode === 'modifier' && (q !== ouvert.q || r !== ouvert.r);

  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    const m = erreurNom(v.nom);
    setErreurNom(m);
    if (m) return;
    if ([...v.notes].length > 2000) return;
    const corps = { nom: v.nom.trim(), taille: v.taille, couleur: v.couleur, notes: v.notes, secret: v.secret, q, r };
    const res = await e.envoyer(() => mode === 'modifier'
      ? appeler<{ cle: string }>('PATCH', `${base}/systemes/${encodeURIComponent(cle!)}`, { ...corps, version })
      : appeler<{ cle: string }>('POST', `${base}/systemes`, corps));
    if (res) onFini(res.cle);
  }

  const champEchec = (c: string) => (place?.champ === c ? place.message : undefined);
  const hexagone = place?.code === 'case_occupee' ? 'Cet hexagone porte déjà un système.'
    : place?.champ === 'q' || place?.champ === 'r' ? 'Cet hexagone est hors de la carte.' : undefined;
  return (
    <section className="gx-bloc gx-form" aria-label={titre}>
      <h2>{titre}</h2>
      <form onSubmit={(ev) => void soumettre(ev)} noValidate>
        <fieldset disabled={e.enCours} className="gx-gele">
          <Champ etiquette="Nom" value={v.nom} erreur={erreurNomMsg ?? champEchec('nom')} maxLength={200}
            onChange={(ev: { target: { value: string } }) => setV({ ...v, nom: ev.target.value })} />
          <Segments legende="Taille" valeur={v.taille}
            options={TAILLES_NOMS.map((t) => ({ valeur: t.nom, libelle: t.libelle }))}
            onChange={(taille) => setV({ ...v, taille })} />
          <SelecteurCouleur valeur={v.couleur} onChange={(couleur) => setV({ ...v, couleur })} />
          <Champ zone etiquette="Notes" value={v.notes}
            erreur={[...v.notes].length > 2000 ? '2 000 caractères au plus.' : champEchec('notes')}
            onChange={(ev: { target: { value: string } }) => setV({ ...v, notes: ev.target.value })} />
          <Interrupteur etiquette="Secret (MJ seul)" coche={v.secret} onChange={(secret) => setV({ ...v, secret })} />
          <div className="gx-champ">
            <span>Hexagone ({entierAffiche(q)}, {entierAffiche(r)})</span>
            <Bouton onClick={() => onDeplacer(v)}>Déplacer</Bouton>
            {hexagone && <div className="erreur" role="alert">{hexagone}</div>}
            {deplace && nbRoutes > 0 && (
              <p className="gx-note">{nbRoutes === 1 ? 'Sa route sera recalculée.' : `Ses ${nbRoutes} routes seront recalculées.`}</p>
            )}
          </div>
        </fieldset>
        {e.messages()}
        <Pied enCours={e.enCours} conflit={e.conflit} onRecharger={onRecharger} onAnnuler={onAnnuler} libelle={mode === 'nouveau' ? 'Placer' : 'Enregistrer'} />
      </form>
    </section>
  );
}

/** « Nouvelle route »: the length is shown, computed by the grid, and is not an input. */
export function FormRoute({ base, depart, arrivee, onFini, onAnnuler, onIntrouvable }: {
  base: string; depart: SystemeCarte; arrivee: SystemeCarte; onFini: () => void; onAnnuler: () => void; onIntrouvable: () => void;
}) {
  const [publique, setPublique] = useState(true);
  const e = useEnvoi('route', onIntrouvable);
  const longueur = Math.max(1, distanceHex(depart, arrivee));
  const dejaLa = e.echec?.code === 'route_existante';
  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    const res = await e.envoyer(() => appeler('POST', `${base}/routes`, { depuis: depart.cle, vers: arrivee.cle, publique }));
    if (res) onFini();
  }
  return (
    <section className="gx-bloc gx-form" aria-label="Nouvelle route">
      <h2>Nouvelle route</h2>
      <form onSubmit={(ev) => void soumettre(ev)} noValidate>
        <fieldset disabled={e.enCours} className="gx-gele">
          <p>De {depart.nom} à {arrivee.nom}</p>
          <p>Longueur : {cases(longueur)}</p>
          <Interrupteur etiquette="Route publique" coche={publique} onChange={setPublique} />
        </fieldset>
        {dejaLa && <p className="echec" role="alert">Ces deux systèmes sont déjà reliés.</p>}
        {e.echec?.sorte === 'champ' && e.echec.champ === 'vers' && <p className="echec" role="alert">Choisissez deux systèmes différents.</p>}
        {e.messages()}
        <Pied enCours={e.enCours} conflit={false} onAnnuler={onAnnuler} libelle="Tracer" />
      </form>
    </section>
  );
}

export interface BrouillonZone { nom: string; couleur: string; densite: string; secret: boolean }

/** « Nouvelle zone » (and the edit of a zone): the density is a percentage, empty = the zone does not change it. */
export function FormZone({ base, points, cle, version, brouillon, onFini, onAnnuler, onCorriger, onRecharger, onIntrouvable }: {
  base: string; points: [number, number][]; cle?: string; version?: number; brouillon: BrouillonZone;
  onFini: () => void; onAnnuler: () => void; onCorriger: (b: BrouillonZone) => void; onRecharger?: () => void; onIntrouvable: () => void;
}) {
  const [v, setV] = useState(brouillon);
  const [erreurNomMsg, setErreurNom] = useState<string>();
  const [erreurDensite, setErreurDensite] = useState<string>();
  const e = useEnvoi('zone', onIntrouvable);
  const modif = cle !== undefined;
  const croise = e.echec?.sorte === 'champ' && e.echec.champ === 'contour';

  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    const m = erreurNom(v.nom);
    setErreurNom(m);
    let densite: number | null = null;
    setErreurDensite(undefined);
    if (v.densite.trim() !== '') {
      const p = Number(v.densite.replace(',', '.'));
      if (!Number.isFinite(p) || p < 0 || p > 100) { setErreurDensite('entre 0 et 100.'); return; }
      densite = p / 100;
    }
    if (m) return;
    const corps = { nom: v.nom.trim(), couleur: v.couleur, secret: v.secret, ...(modif ? {} : { contour: points }), ...(densite !== null ? { densite } : {}) };
    const res = await e.envoyer(() => modif
      ? appeler('PATCH', `${base}/zones/${encodeURIComponent(cle)}`, { ...corps, version })
      : appeler('POST', `${base}/zones`, corps));
    if (res) onFini();
  }
  const titre = modif ? 'Modifier la zone' : 'Nouvelle zone';
  return (
    <section className="gx-bloc gx-form" aria-label={titre}>
      <h2>{titre}</h2>
      <form onSubmit={(ev) => void soumettre(ev)} noValidate>
        <fieldset disabled={e.enCours} className="gx-gele">
          <Champ etiquette="Nom" value={v.nom} erreur={erreurNomMsg} onChange={(ev: { target: { value: string } }) => setV({ ...v, nom: ev.target.value })} />
          <SelecteurCouleur valeur={v.couleur} onChange={(couleur) => setV({ ...v, couleur })} />
          <Champ etiquette="Densité de systèmes" facultatif inputMode="decimal" value={v.densite} erreur={erreurDensite}
            onChange={(ev: { target: { value: string } }) => setV({ ...v, densite: ev.target.value })} />
          <Interrupteur etiquette="Secrète" coche={v.secret} onChange={(secret) => setV({ ...v, secret })} />
        </fieldset>
        {croise && (
          <p className="echec" role="alert">
            {e.echec?.message.includes('trois') ? 'Un contour compte au moins 3 points.' : 'Ce contour se croise. Corrigez-le.'}{' '}
            {!modif && <Bouton petit onClick={() => onCorriger(v)}>Corriger le contour</Bouton>}
          </p>
        )}
        {e.messages()}
        <Pied enCours={e.enCours} conflit={e.conflit} onRecharger={onRecharger} onAnnuler={onAnnuler} libelle={modif ? 'Enregistrer' : 'Dessiner'} />
      </form>
    </section>
  );
}

export const brouillonSystemeVide = (): BrouillonSysteme => ({ nom: '', taille: 'moyenne', couleur: 'accent', notes: '', secret: false });
export const brouillonZoneVide = (): BrouillonZone => ({ nom: '', couleur: 'danger', densite: '', secret: false });

/** « Modifier » of a route: only its visibility changes (the ends and the length do not). */
export function FormRoutePublique({ base, route, onFini, onAnnuler, onRecharger, onIntrouvable }: {
  base: string; route: RouteCarte; onFini: () => void; onAnnuler: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [publique, setPublique] = useState(route.publique !== false);
  const [version] = useState(route.version);
  const e = useEnvoi('route', onIntrouvable);
  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    const res = await e.envoyer(() => appeler('PATCH', `${base}/routes/${route.id}`, { publique, version }));
    if (res) onFini();
  }
  return (
    <form onSubmit={(ev) => void soumettre(ev)} noValidate aria-label="Modifier la route">
      <fieldset disabled={e.enCours} className="gx-gele"><Interrupteur etiquette="Route publique" coche={publique} onChange={setPublique} /></fieldset>
      {e.messages()}
      <Pied enCours={e.enCours} conflit={e.conflit} onRecharger={onRecharger} onAnnuler={onAnnuler} libelle="Enregistrer" />
    </form>
  );
}

export const brouillonDeZone = (z: ZoneCarte): BrouillonZone => ({
  nom: z.nom, couleur: couleurServeur(z.couleur), secret: z.secret === true,
  densite: z.densite === null || z.densite === undefined ? '' : String(Math.round(z.densite * 100)),
});
