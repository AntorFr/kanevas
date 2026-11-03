import { Eye, EyeOff, RotateCcw, Undo2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { appeler, ErreurApi, useConnexionPerdue } from '../../../api';
import { Bouton, ChargementListe, ErreurChargement, Pastille } from '../../../ui';
import type { CatalogueSummary, Niveau, Outil } from '../types';

type Origine = 'systeme' | 'univers' | 'remplace' | 'retire';
interface Element { nature: string; cle: string; nom: string; resume: string; origine?: Origine; masque?: boolean; version?: number }
interface Page { elements: Element[]; suivant: string | null }

const PAGE = 50;
const ORIGINES: Record<Origine, string> = {
  systeme: 'Système', univers: 'Univers', remplace: 'Remplacé pour l’univers', retire: 'Retiré de l’univers',
};

/** « Voir les éléments » (E-20): the resolved list of one tool, read through the route the caller's role opens. */
export function ElementsCatalogue({ base, niveau, outil, catalogue, ecriture }: {
  base: string; niveau: Niveau; outil: Outil; catalogue: CatalogueSummary; ecriture: boolean;
}) {
  const perdue = useConnexionPerdue();
  const [gestion, setGestion] = useState(niveau === 'univers' && ecriture);
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [listes, setListes] = useState<Record<string, Element[]>>({});
  const [nature, setNature] = useState(catalogue.natures[0]?.nom ?? '');
  const [visibles, setVisibles] = useState<Record<string, number>>({});
  const [occupe, setOccupe] = useState<string>();
  const [message, setMessage] = useState<{ texte: string; recharger?: boolean }>();
  const tour = useRef(0);
  const verrou = useRef(false);

  const charger = useCallback(async (modeGestion: boolean, silencieux = false) => {
    const mine = ++tour.current;
    if (!silencieux) setEtat('chargement');
    try {
      const resultat: Record<string, Element[]> = {};
      for (const { nom } of catalogue.natures) {
        const lignes: Element[] = [];
        let curseur: string | null = null;
        do {
          const q = new URLSearchParams({ nature: nom, ...(curseur ? { curseur } : {}) });
          const p: Page = await appeler<Page>('GET', `${base}${modeGestion ? '/gestion' : ''}?${q}`);
          lignes.push(...p.elements);
          curseur = p.suivant;
        } while (curseur);
        resultat[nom] = lignes;
      }
      if (mine === tour.current) { setListes(resultat); setEtat('ok'); }
    } catch (e) {
      if (mine !== tour.current) return;
      if (modeGestion && e instanceof ErreurApi && (e.statut === 404 || e.statut === 403)) {
        // The role was lost: read the list as a player does.
        setGestion(false); void charger(false, silencieux);
        return;
      }
      setEtat('erreur');
    }
  }, [base, catalogue.natures]);
  useEffect(() => { void charger(gestion); return () => { tour.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function agir(ligne: Element, requete: () => Promise<unknown>) {
    if (verrou.current || perdue) return;
    verrou.current = true; setOccupe(`${ligne.nature}/${ligne.cle}`); setMessage(undefined);
    try {
      await requete();
      await charger(true, true);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) setMessage({ texte: 'Cet élément a changé depuis que vous l’avez ouvert.', recharger: true });
      else if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) {
        setMessage({ texte: 'Vous ne pouvez plus gérer ce catalogue.' });
        setGestion(false); await charger(false, true);
      } else setMessage({ texte: 'L’action n’a pas abouti.' });
    } finally { verrou.current = false; setOccupe(undefined); }
  }
  const chemin = (l: Element, suffixe: string) => `${base}/${encodeURIComponent(l.nature)}/${encodeURIComponent(l.cle)}/${suffixe}`;
  const masquer = (l: Element, masque: boolean) => agir(l, () => appeler('PUT', chemin(l, 'masque'), { masque, version: l.version }));
  const retirer = (l: Element, retire: boolean) => agir(l, () => appeler('PUT', chemin(l, 'retrait'), { retire }));

  const total = Object.values(listes).reduce((n, l) => n + l.length, 0);
  const natureCourante = catalogue.natures.find((n) => n.nom === nature) ?? catalogue.natures[0];
  const lignes = (natureCourante && listes[natureCourante.nom]) || [];
  const montrees = lignes.slice(0, visibles[nature] ?? PAGE);
  const actions = gestion && niveau === 'univers';

  return <section className="catalogue-elements" aria-label={`Éléments · ${outil.libelle}`}>
    <h3>Éléments · {outil.libelle}</h3>
    {niveau === 'systeme' && <p className="catalogue-note">Lecture seule : seul le responsable importe.</p>}
    {perdue && <p className="echec" role="status">Connexion perdue.</p>}
    {message && <div className="echec" role="alert">{message.texte} {message.recharger &&
      <Bouton petit icone={RotateCcw} onClick={() => { setMessage(undefined); void charger(gestion, true); }}>Recharger</Bouton>}</div>}
    {etat === 'chargement' ? <ChargementListe texte="Chargement des éléments…" />
      : etat === 'erreur' ? <ErreurChargement texte="Impossible de charger les éléments." onReessayer={() => void charger(gestion)} />
      : total === 0 ? <p className="catalogue-note">Aucun élément dans ce catalogue.</p>
      : <>
        <div className="catalogue-natures" role="tablist">
          {catalogue.natures.map((n) => <button key={n.nom} type="button" role="tab" aria-selected={n.nom === natureCourante?.nom}
            className={n.nom === natureCourante?.nom ? 'on' : ''} onClick={() => setNature(n.nom)}>
            {n.libellePluriel} · {listes[n.nom]?.length ?? 0}</button>)}
        </div>
        {lignes.length === 0 ? <p className="catalogue-note">Aucun élément de ce type.</p> : <ul className="catalogue-lignes">
          {montrees.map((l) => {
            const cle = `${l.nature}/${l.cle}`;
            const inactif = perdue || occupe !== undefined;
            return <li key={cle} className={l.origine === 'retire' ? 'estompe' : ''}>
              <div className="catalogue-nom"><span>{l.nom}</span> <code>{l.cle}</code><small>{l.resume}</small></div>
              <div className="catalogue-pastilles">
                {l.origine && <Pastille sens={l.origine === 'systeme' || l.origine === 'retire' ? 'neutre' : 'mj'}>{ORIGINES[l.origine]}</Pastille>}
                {(l.origine === 'univers' || l.origine === 'remplace') && (l.masque
                  ? <Pastille sens="secrete">MJ seul</Pastille> : <Pastille sens="table">Visible des joueurs</Pastille>)}
              </div>
              {actions && (l.origine === 'univers' || l.origine === 'remplace') && (l.masque
                ? <Bouton petit icone={Eye} ecrit disabled={inactif} enCours={occupe === cle} onClick={() => void masquer(l, false)}>Rendre visible</Bouton>
                : <Bouton petit icone={EyeOff} ecrit disabled={inactif} enCours={occupe === cle} onClick={() => void masquer(l, true)}>Masquer aux joueurs</Bouton>)}
              {actions && l.origine === 'systeme' &&
                <Bouton petit icone={Trash2} ecrit disabled={inactif} enCours={occupe === cle} onClick={() => void retirer(l, true)}>Retirer de cet univers</Bouton>}
              {actions && l.origine === 'retire' &&
                <Bouton petit icone={Undo2} ecrit disabled={inactif} enCours={occupe === cle} onClick={() => void retirer(l, false)}>Rétablir</Bouton>}
            </li>;
          })}
        </ul>}
        {montrees.length < lignes.length && <Bouton petit onClick={() => setVisibles({ ...visibles, [nature]: montrees.length + PAGE })}>Afficher la suite</Bouton>}
      </>}
  </section>;
}
