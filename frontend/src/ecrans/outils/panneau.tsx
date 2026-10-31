import { BookOpen, Map, RotateCcw, Settings2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { appeler, ErreurApi, useConnexionPerdue } from '../../api';
import { Bouton, ChargementListe, ErreurChargement, Interrupteur, PageIntrouvable, useToasts } from '../../ui';
import { LigneReglage } from './reglage';
import { BlocCatalogue } from './catalogue/bloc';
import { type Communs, type Ligne, type Niveau, type Outil, type Resolue, type Valeur, type VueOutils } from './types';
import './outils.css';

/** E-20 reads the common declaration, never a module's implementation. */
export function PanneauOutils({ id, niveau, sansSysteme = false }: { id: string; niveau: Niveau; sansSysteme?: boolean }) {
  const base = `/api/${niveau === 'systeme' ? 'systemes' : 'univers'}/${id}/outils`;
  const [vue, setVue] = useState<VueOutils>();
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur' | 'introuvable'>('chargement');
  const generation = useRef(0);
  const perdue = useConnexionPerdue();
  const recharger = useCallback(async () => {
    const tour = ++generation.current;
    try {
      const v = await appeler<VueOutils>('GET', base);
      if (tour === generation.current) { setVue(v); setEtat('ok'); }
    } catch (e) {
      if (tour === generation.current) setEtat(e instanceof ErreurApi && e.statut === 404 ? 'introuvable' : 'erreur');
    }
  }, [base]);
  useEffect(() => {
    setVue(undefined); setEtat('chargement');
    void recharger();
    return () => { generation.current++; };
  }, [recharger]);
  useEffect(() => {
    const rafraichir = () => { void recharger(); };
    window.addEventListener('kanevas:outils-modifies', rafraichir);
    return () => window.removeEventListener('kanevas:outils-modifies', rafraichir);
  }, [recharger]);

  if (etat === 'introuvable') return <PageIntrouvable />;
  if (!vue) return etat === 'erreur' ? <ErreurChargement texte="Impossible de charger les outils." onReessayer={() => void recharger()} />
    : <ChargementListe texte="Chargement des outils…" />;
  return <div className="panneau-outils">
    {perdue && <p className="echec" role="status">Connexion perdue.</p>}
    {etat === 'erreur' && <ErreurChargement texte="Impossible de charger les outils." onReessayer={() => void recharger()} />}
    {!vue.ecriture && <p className="outils-note">Seul le responsable du système règle ces valeurs.</p>}
    {vue.outils.length === 0 && <p className="outils-vide">{sansSysteme ? 'Cet univers n’a pas de système de jeu.' : 'Aucun outil ne s’applique à ce système de jeu.'}</p>}
    {vue.communs.map((m) => <div className="outils-module" key={m.module}>
      {m.reglages.length > 0 && <Carte key={m.module} titre={`Réglages communs · ${m.module}`} base={base} cle={m.module}
        niveau={niveau} definition={m} ecriture={vue.ecriture} recharger={recharger} />}
      {vue.outils.filter((o) => o.module === m.module).map((o) => <Carte key={o.cle} titre={o.libelle} base={base} cle={o.cle}
        niveau={niveau} definition={o} outil={o} outils={vue.outils} ecriture={vue.ecriture} recharger={recharger} />)}
    </div>)}
  </div>;
}

function Carte({ titre, base, cle, niveau, definition, outil, outils = [], ecriture, recharger }: {
  titre: string; base: string; cle: string; niveau: Niveau; definition: Communs | Outil; outil?: Outil; outils?: Outil[];
  ecriture: boolean; recharger: () => Promise<void>;
}) {
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [attente, setAttente] = useState(false);
  const verrou = useRef(false);
  const [apercu, setApercu] = useState<Partial<Ligne>>();
  const [echec, setEchec] = useState<string>();
  const [reprise, setReprise] = useState<() => void>();
  const ligne = (niveau === 'systeme' ? definition.systeme : definition.univers)!;
  const courant = { ...ligne, ...apercu };
  const reglages = outil ? outil.effectif.reglages : (definition as Communs).effectif;
  const inactif = attente || perdue;

  async function ecrire(suffixe: string, corps: unknown) {
    if (verrou.current || perdue || !ecriture) throw new Error('Write unavailable.');
    verrou.current = true; setAttente(true);
    try {
      await appeler('PUT', `${base}/${cle}/${suffixe}`, corps);
      window.dispatchEvent(new Event('kanevas:outils-modifies'));
      await recharger();
      toast('Enregistré.');
    } finally { verrou.current = false; setAttente(false); }
  }

  async function changer(suffixe: 'activation' | 'visibilite', corps: Record<string, boolean | null>, optimiste: Partial<Ligne>) {
    if (inactif || verrou.current) return;
    setEchec(undefined); setReprise(undefined); setApercu(optimiste);
    try { await ecrire(suffixe, corps); }
    catch (e) {
      const connu = e instanceof ErreurApi && [400, 403, 404, 409].includes(e.statut);
      setEchec(connu ? e.message : 'Enregistrement impossible.');
      if (!connu) setReprise(() => () => void changer(suffixe, corps, optimiste));
      if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) void recharger();
    } finally { setApercu(undefined); }
  }

  const actif = courant.active ?? outil?.systeme.active ?? false;
  const Icone = outil?.type === 'carte' ? Map : outil?.type === 'generateur' ? Sparkles : outil ? BookOpen : Settings2;
  return <section className="outil-carte" aria-label={titre} aria-busy={attente || undefined}>
    <header className="outil-tete"><Icone size={18} strokeWidth={1.75} aria-hidden="true" /><div><h2>{titre}</h2>
      {outil && <p>{outil.type === 'carte' ? 'Carte dynamique' : outil.type === 'generateur' ? 'Générateur' : 'Aide de jeu'} · {outil.module}</p>}</div>
      {outil && niveau === 'systeme' && ecriture && <Interrupteur etiquette={actif ? 'Activé' : 'Désactivé'} coche={actif} ecrit disabled={inactif}
        onChange={(active) => void changer('activation', { active }, { active })} />}
    </header>
    {outil && <>
      <p className="outil-description">{outil.description}</p>
      {niveau === 'univers' && ecriture ? <fieldset className="outil-activation" disabled={inactif}><legend>Activation</legend>
        {[null, true, false].map((v) => <label key={String(v)} className={courant.active === v ? 'choisi' : ''}>
          <input type="radio" name={`activation-${cle}`} checked={courant.active === v}
            onChange={() => void changer('activation', { active: v }, { active: v })} />
          {v === null ? `Suit le système (${outil.systeme.active ? 'Activé' : 'Désactivé'})` : v ? 'Activé' : 'Désactivé'}
        </label>)}
      </fieldset> : <p className="outil-origine">{niveau === 'systeme' ? 'Système · ' : ''}{actif ? 'Activé' : 'Désactivé'}</p>}
      {niveau === 'univers' && <p className="outil-origine">{courant.active !== null && 'Univers · '}{actif ? 'Activé' : 'Désactivé'}{courant.active === null && ' (suit le système)'}</p>}
      {echec && <div className="echec" role="alert">{echec} {reprise && <Bouton petit icone={RotateCcw} ecrit disabled={inactif} onClick={reprise}>Réessayer</Bouton>}</div>}
      {outil.dependances.length > 0 && <p className="outil-dependances">Demande : {outil.dependances.map((d) => {
        const dep = outils.find((o) => o.cle === d);
        return `${dep?.libelle ?? d} (${dep?.effectif.active ? 'Activé' : 'Désactivé'})`;
      }).join(', ')}</p>}
      <div className="outil-visibilite"><span>Visibilité</span>{(['mj', 'joueur'] as const).map((role) => {
        const v = courant.visibilite[role];
        const effectif = v ?? outil.systeme.visibilite[role] ?? outil.effectif.visibilite[role];
        const nom = role === 'mj' ? 'MJ' : 'Joueurs';
        return ecriture ? <div key={role} className="outil-role"><label className={v === null ? 'herite' : ''}>
          <input type="checkbox" checked={effectif} aria-checked={v === null ? 'mixed' : effectif} disabled={inactif}
            ref={(el) => { if (el) el.indeterminate = v === null; }}
            onChange={() => {
              const suivant = niveau === 'univers' ? v === null ? true : v ? false : null : !effectif;
              void changer('visibilite', { [role]: suivant }, { visibilite: { ...courant.visibilite, [role]: suivant } });
            }} />{nom}
        </label>{niveau === 'univers' && <small>{v === null ? `Suit le système (${effectif ? 'Oui' : 'Non'})` : 'Univers'}</small>}</div>
          : <span key={role}>{nom} · {effectif ? 'Oui' : 'Non'}</span>;
      })}</div>
    </>}
    {definition.reglages.filter((r) => niveau === 'univers' || r.niveau !== 'univers').map((r) => <LigneReglage key={r.nom} reglage={r}
      valeur={reglages[r.nom] ?? { valeur: r.defaut, origine: 'defaut' } as Resolue} niveau={niveau} version={ligne.versionReglages}
      ecriture={ecriture} occupe={attente} recharger={recharger}
      enregistrer={(valeurs: Record<string, Valeur | null>, version) => ecrire('reglages', { valeurs, version })} />)}
    {outil?.catalogue && <BlocCatalogue base={`${base}/${cle}/catalogue`} niveau={niveau} outil={outil}
      catalogue={outil.catalogue} outils={outils} ecriture={ecriture} recharger={recharger} />}
  </section>;
}
