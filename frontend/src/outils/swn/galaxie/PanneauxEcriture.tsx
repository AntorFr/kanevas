import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { appeler } from '../../../api';
import { BoiteDialogue, Bouton, Pastille } from '../../../ui';
import { FormRoutePublique, FormZone, brouillonDeZone } from './Formulaires';
import { lireEchec } from './ecriture';
import { cases } from './geo';
import type { RouteCarte, SystemeCarte, ZoneCarte } from './types';

/** Retiring an element asks first; a stale version reads the conflict and « Recharger ». */
function Retrait({ titre, texte, action, url, conflit, onFini, onFermer, onRecharger, onIntrouvable }: {
  titre: string; texte: string; action: string; url: string; conflit: string;
  onFini: () => void; onFermer: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string>();
  const [stale, setStale] = useState(false);
  async function retirer() {
    setEnCours(true);
    setMessage(undefined);
    try {
      await appeler('DELETE', url);
      onFini();
    } catch (e) {
      const f = lireEchec(e);
      if (f.sorte === 'introuvable') onIntrouvable();
      else if (f.sorte === 'conflit') { setStale(true); setMessage(conflit); }
      else if (f.sorte === 'refus') setMessage('Action refusée.');
      else if (f.sorte !== 'perdu') setMessage('L’enregistrement a échoué. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }
  return (
    <BoiteDialogue titre={titre} texte={texte} action={action} icone={Trash2} enCours={enCours} onConfirmer={() => void retirer()} onFermer={onFermer}>
      {message && <p className="echec" role="alert">{message}</p>}
      {stale && <Bouton onClick={() => { onRecharger(); onFermer(); }}>Recharger</Bouton>}
    </BoiteDialogue>
  );
}

export function RetraitSysteme({ base, systeme, nbRoutes, version, ...r }: {
  base: string; systeme: { cle: string; nom: string }; nbRoutes: number; version: number;
  onFini: () => void; onFermer: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const routes = nbRoutes === 0 ? 'Aucune route ne sera effacée.' : nbRoutes === 1 ? 'Sa route sera effacée.' : `Ses ${nbRoutes} routes seront effacées.`;
  return (
    <Retrait titre={`Retirer « ${systeme.nom} » ?`} texte={`Retirer « ${systeme.nom} » ? ${routes}`} action="Retirer le système"
      url={`${base}/systemes/${encodeURIComponent(systeme.cle)}?version=${version}`} conflit="Ce système a changé depuis que vous l’avez ouvert." {...r} />
  );
}

/** The panel of a selected route (GM): its ends, its calculated length, its visibility. */
export function PanneauRoute({ base, route, systemes, onFini, onRecharger, onIntrouvable }: {
  base: string; route: RouteCarte; systemes: Map<string, SystemeCarte>;
  onFini: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [modif, setModif] = useState<RouteCarte | null>(null);
  const [retrait, setRetrait] = useState<RouteCarte | null>(null);
  const [attente, setAttente] = useState(false);
  const nom = (cle: string) => systemes.get(cle)?.nom ?? cle;
  // « Recharger »: once the map is read again, the form starts over with the stored route.
  useEffect(() => {
    if (attente && modif && route.version !== modif.version) { setModif(route); setAttente(false); }
  }, [attente, route, modif]);
  return (
    <section className="gx-bloc gx-panneau" aria-label="Route sélectionnée">
      <div className="gx-tete"><h2>Route de {nom(route.depuis.cle)} à {nom(route.vers.cle)}</h2>
        {route.publique === false ? <Pastille sens="mj">Privée</Pastille> : <Pastille sens="table">Publique</Pastille>}</div>
      <dl className="gx-kv"><dt>Longueur</dt><dd>{cases(route.longueur)}</dd></dl>
      {modif ? (
        <FormRoutePublique key={modif.version} base={base} route={modif} onFini={() => { setModif(null); onFini(); }} onAnnuler={() => setModif(null)}
          onRecharger={() => { setAttente(true); onRecharger(); }} onIntrouvable={onIntrouvable} />
      ) : (
        <div className="gx-actions">
          <Bouton icone={Pencil} ecrit onClick={() => setModif(route)}>Modifier</Bouton>
          <Bouton icone={Trash2} variante="danger" ecrit onClick={() => setRetrait(route)}>Retirer</Bouton>
        </div>
      )}
      {retrait && (
        <Retrait titre="Retirer cette route ?" texte={`Retirer la route de ${nom(route.depuis.cle)} à ${nom(route.vers.cle)} ?`} action="Retirer la route"
          url={`${base}/routes/${route.id}?version=${retrait.version}`} conflit="Cette route a changé depuis que vous l’avez ouverte."
          onFini={() => { setRetrait(null); onFini(); }} onFermer={() => setRetrait(null)} onRecharger={onRecharger} onIntrouvable={onIntrouvable} />
      )}
    </section>
  );
}

/** The panel of a selected zone (GM): every field is editable, the outline is not. */
export function PanneauZone({ base, zone, onFini, onRecharger, onIntrouvable }: {
  base: string; zone: ZoneCarte; onFini: () => void; onRecharger: () => void; onIntrouvable: () => void;
}) {
  const [modif, setModif] = useState<ZoneCarte | null>(null);
  const [retrait, setRetrait] = useState<ZoneCarte | null>(null);
  const [attente, setAttente] = useState(false);
  useEffect(() => {
    if (attente && modif && zone.version !== modif.version) { setModif(zone); setAttente(false); }
  }, [attente, zone, modif]);
  if (modif) {
    return (
      <FormZone key={modif.version} base={base} points={modif.contour} cle={modif.cle} version={modif.version} brouillon={brouillonDeZone(modif)}
        onFini={() => { setModif(null); onFini(); }} onAnnuler={() => setModif(null)} onCorriger={() => {}} onRecharger={() => { setAttente(true); onRecharger(); }} onIntrouvable={onIntrouvable} />
    );
  }
  return (
    <section className="gx-bloc gx-panneau" aria-label="Zone sélectionnée">
      <div className="gx-tete"><h2>{zone.nom}</h2>{zone.secret && <Pastille sens="mj">Secret</Pastille>}</div>
      <dl className="gx-kv"><dt>Sommets</dt><dd>{zone.contour.length}</dd></dl>
      <div className="gx-actions">
        <Bouton icone={Pencil} ecrit onClick={() => setModif(zone)}>Modifier</Bouton>
        <Bouton icone={Trash2} variante="danger" ecrit onClick={() => setRetrait(zone)}>Retirer</Bouton>
      </div>
      {retrait && (
        <Retrait titre={`Retirer « ${zone.nom} » ?`} texte={`Retirer la zone « ${zone.nom} » ?`} action="Retirer la zone"
          url={`${base}/zones/${encodeURIComponent(zone.cle!)}?version=${retrait.version}`} conflit="Cette zone a changé depuis que vous l’avez ouverte."
          onFini={() => { setRetrait(null); onFini(); }} onFermer={() => setRetrait(null)} onRecharger={onRecharger} onIntrouvable={onIntrouvable} />
      )}
    </section>
  );
}
