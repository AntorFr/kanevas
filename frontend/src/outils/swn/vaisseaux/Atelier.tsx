import { Minus, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { appeler, ErreurApi, lire, useConnexionPerdue } from '../../../api';
import { useTitreAriane } from '../../../cadre-contexte';
import { Bouton, BoiteDialogue, Chargement, ErreurChargement, PageIntrouvable, Pastille } from '../../../ui';
import { Equipage } from './Equipage';
import { bornesEquipage, brouillonDe, choixDe, credits, exigeReparation, legende, ligneAjuste, memeBrouillon, motifDe, requete } from './format';
import { Effets } from './Effets';
import { Alertes, Chiffres, ErreurCalcul } from './Resultats';
import { Selecteur } from './Selecteur';
import { NATURES, type PageCatalogue, type Alerte, type Brouillon, type Calcul, type Conception, type ElementCatalogue, type Ligne, type Nature } from './types';

type Ouvert = { nature: string; titre: string } | null;
interface Info { resume: string; univers: boolean; el: ElementCatalogue }
const infoDe = (e: ElementCatalogue): Info => ({
  el: e,
  resume: e.resume.replace(/coût [^·]*· /, ''),
  univers: e.univers === true || e.origine === 'univers' || e.origine === 'remplace',
});
/** The captions of a row: the catalogue's figures, then what it states of the effect (the class is the chosen hull's). */
const chiffresDe = (i: Info | undefined, classe: number): string =>
  i ? [i.resume, legende(i.el, classe)].filter(Boolean).join(' · ') : '';

/** E-22, the workshop of one design. The screen carries no rule: every change asks `POST calcul` (V-12). */
export function Atelier({ universId, ficheId, suffixe, initiale }: {
  universId: number;
  ficheId: number;
  suffixe: string;
  initiale?: Conception;
}) {
  const [saved, setSaved] = useState<Conception | null>(initiale?.ficheId === ficheId ? initiale : null);
  const [introuvable, setIntrouvable] = useState(false);
  const [echec, setEchec] = useState(false);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (saved && essai === 0) return;
    let actif = true;
    setEchec(false);
    lire<Conception>(`/api/univers/${universId}/outils/swn/vaisseaux/conceptions/${ficheId}${requete(suffixe)}`).then(
      (c) => actif && setSaved(c),
      (e: unknown) => {
        if (!actif) return;
        if (e instanceof ErreurApi && e.statut === 404) setIntrouvable(true);
        else setEchec(true);
      },
    );
    return () => { actif = false; };
  }, [universId, ficheId, suffixe, essai]); // eslint-disable-line react-hooks/exhaustive-deps

  if (introuvable) return <PageIntrouvable />;
  if (echec) return <ErreurChargement texte="Impossible de charger la conception." onReessayer={() => setEssai((n) => n + 1)} />;
  if (!saved) return <Chargement texte="Chargement du concepteur…" />;
  return <Corps universId={universId} suffixe={suffixe} saved={saved} onSaved={setSaved} onRecharger={() => { setSaved(null); setEssai((n) => n + 1); }} />;
}

function Corps({ universId, suffixe, saved, onSaved, onRecharger }: {
  universId: number;
  suffixe: string;
  saved: Conception;
  onSaved: (c: Conception) => void;
  onRecharger: () => void;
}) {
  const base = `/api/univers/${universId}/outils/swn/vaisseaux`;
  const perdue = useConnexionPerdue();
  const ecriture = saved.peutEcrire;
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(saved));
  const [calcul, setCalcul] = useState<Calcul>({ resultat: saved.resultat, alertes: saved.alertes });
  const [etatCalcul, setEtatCalcul] = useState<'ok' | 'calcul' | 'erreur'>('ok');
  const [ouvert, setOuvert] = useState<Ouvert>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [conflit, setConflit] = useState(false);
  const [confirmerAnnuler, setConfirmerAnnuler] = useState(false);
  const [lienCopie, setLienCopie] = useState<'oui' | 'non' | null>(null);
  const [essaiCalcul, setEssaiCalcul] = useState(0);
  const [confirmerRecalcul, setConfirmerRecalcul] = useState(false);
  const [recalcul, setRecalcul] = useState<{ enCours: boolean; refus: string | null; echec: boolean; perdu: boolean; fait: boolean }>(
    { enCours: false, refus: null, echec: false, perdu: false, fait: false });
  const dernier = useRef(0);
  const premier = useRef(true);
  const [equipageTouche, setEquipageTouche] = useState(false);
  const [equipageInvalide, setEquipageInvalide] = useState(false);
  // Other steppers refused while typed (repair skill, points of a line): they block the save like the crew's.
  const [invalides, setInvalides] = useState<Record<string, boolean>>({});
  const marquer = useCallback((cle: string, v: boolean) => setInvalides((a) => (!!a[cle] === v ? a : { ...a, [cle]: v })), []);
  const [cleEquipage, setCleEquipage] = useState(0);
  const [infos, setInfos] = useState<Record<string, Info>>({});

  // The key figures and the « Univers » mark of each line come from the catalogue the player may read (display only).
  useEffect(() => {
    let actif = true;
    (async () => {
      for (const nature of ['coques', ...NATURES.map((n) => n.nature)]) {
        let curseur: string | undefined;
        do {
          let p: PageCatalogue;
          try {
            p = await lire<PageCatalogue>(`${base}/catalogue${requete(suffixe, { nature, curseur })}`);
          } catch {
            break;
          }
          if (!actif) return;
          setInfos((avant) => {
            const apres = { ...avant };
            for (const e of p.elements) apres[`${e.nature}/${e.cle}`] = infoDe(e);
            return apres;
          });
          curseur = p.suivant ?? undefined;
        } while (curseur);
      }
    })();
    return () => { actif = false; };
  }, [universId, suffixe]); // eslint-disable-line react-hooks/exhaustive-deps

  useTitreAriane(saved.titre, 'Outils');

  const modifie = !memeBrouillon(brouillon, brouillonDe(saved));

  // Every change recalculates: debounced 250 ms, the last answer wins, an older one is dropped.
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      if (essaiCalcul === 0) return;
    }
    const numero = ++dernier.current;
    setEtatCalcul('calcul');
    const minuterie = setTimeout(() => {
      appeler<Calcul>('POST', `${base}/calcul${requete(suffixe)}`, { ...choixDe(brouillon), ficheId: saved.ficheId }).then(
        (c) => {
          if (numero !== dernier.current) return;
          setCalcul(c);
          setEtatCalcul('ok');
        },
        () => numero === dernier.current && setEtatCalcul('erreur'),
      );
    }, 250);
    return () => clearTimeout(minuterie);
  }, [brouillon, essaiCalcul]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = useCallback((f: (b: Brouillon) => Brouillon) => {
    setMessage(null);
    setRefus(null);
    setBrouillon(f);
  }, []);

  function choisir(e: ElementCatalogue) {
    setInfos((avant) => ({ ...avant, [`${e.nature}/${e.cle}`]: infoDe(e) }));
    if (e.nature === 'coques') {
      // Untouched crew: not sent, so the server takes the new hull's minimum (F-2); a touched one is kept.
      change((b) => ({ ...b, coque: { cle: e.cle, nom: e.nom }, equipage: equipageTouche ? b.equipage : null }));
    } else {
      change((b) => {
        const nature = e.nature as Nature;
        const existante = b.lignes.find((l) => l.nature === nature && l.cle === e.cle);
        if (existante) return { ...b, lignes: b.lignes.map((l) => (l === existante ? { ...l, quantite: Math.min(99, l.quantite + 1) } : l)) };
        return { ...b, lignes: [...b.lignes, { nature, cle: e.cle, nom: e.nom, quantite: 1 }] };
      });
    }
    setOuvert(null);
  }
  const quantite = (l: Ligne, delta: number) =>
    change((b) => ({ ...b, lignes: b.lignes.map((x) => (x === l ? { ...x, quantite: Math.max(1, Math.min(99, x.quantite + delta)) } : x)) }));
  const retirer = (l: Ligne) => {
    marquer(`points/${l.nature}/${l.cle}`, false);
    change((b) => ({ ...b, lignes: b.lignes.filter((x) => x !== l) }));
  };
  const points = (l: Ligne, n: number) => change((b) => ({ ...b, lignes: b.lignes.map((x) => (x === l ? { ...x, points: n } : x)) }));
  const viser = (l: Ligne, valeur: string) => change((b) => ({
    ...b,
    lignes: b.lignes.map((x) => {
      if (x !== l) return x;
      const { vise: _vise, ...sans } = x;
      const [nature, ...cle] = valeur.split('/');
      return valeur === '' ? sans : { ...sans, vise: { nature: nature!, cle: cle.join('/') } };
    }),
  }));

  const alertes: Alerte[] = calcul.alertes;
  const bloquante = alertes.find((a) => a.niveau === 'bloquante');
  const resultat = calcul.resultat ?? saved.resultat;
  const retirees = new Set(alertes.filter((a) => a.code === 'element_retire').map((a) => a.ligne));
  const coqueRetiree = retirees.has(-1);
  const verrou = perdue || !ecriture;
  const classeInadaptee = new Set(alertes.filter((a) => a.code === 'classe_inadaptee').map((a) => a.ligne));
  // The crew block (E-22): the figure is the draft's, else the server's default; the bounds are the chosen hull's, as the catalogue states them.
  const equipageAffiche = brouillon.equipage ?? resultat.equipage?.choisi ?? null;
  const donneesCoque = infos[`coques/${brouillon.coque.cle}`]?.el.donnees;
  const borneMin = donneesCoque ? donneesCoque.equipage_min : resultat.equipage?.min;
  const borneMax = donneesCoque ? donneesCoque.equipage_max : resultat.equipage?.max;
  const bornes = bornesEquipage(borneMin, borneMax);
  const blocEquipage = bornes !== '' || equipageAffiche !== null;
  const classe = resultat.coque.classe;
  // The repair block (B-83): a chosen element asks for a skill, the server's result carries one, or the design has one above 0.
  const demandeReparation = brouillon.lignes.some((l) => exigeReparation(infos[`${l.nature}/${l.cle}`]?.el.donnees));
  const blocReparation = demandeReparation || resultat.reparation != null || brouillon.reparation > 0;
  const reparationAffichee = brouillon.reparation;
  const invalide = equipageInvalide || Object.values(invalides).some(Boolean);

  async function enregistrer() {
    if (enregistrement || bloquante || invalide || etatCalcul !== 'ok' || perdue) return;
    setEnregistrement(true);
    setMessage(null);
    setRefus(null);
    try {
      const c = await appeler<Conception>('PUT', `${base}/conceptions/${saved.ficheId}${requete(suffixe)}`, { ...choixDe(brouillon), version: saved.version });
      onSaved(c);
      setBrouillon(brouillonDe(c));
      setCalcul({ resultat: c.resultat, alertes: c.alertes });
      setEtatCalcul('ok');
      dernier.current++;
      setMessage('Conception enregistrée.');
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 0) setRefus('Enregistrement impossible : connexion perdue.');
      else if (e instanceof ErreurApi && e.statut === 409) setConflit(true);
      else if (e instanceof ErreurApi && e.code === 'conception_bloquee') {
        const fournies = (e.details?.alertes as Alerte[] | undefined) ?? [];
        const premiere = fournies.find((a) => a.niveau === 'bloquante');
        setRefus(`Enregistrement refusé : ${premiere ? motifDe(premiere) : 'conception bloquée'}.`);
        setEssaiCalcul((n) => n + 1);
      } else if (e instanceof ErreurApi && e.statut === 403) setRefus('Enregistrement refusé : vous ne pouvez pas modifier cette conception.');
      else setRefus('Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  }

  function annuler() {
    if (!modifie) return;
    setConfirmerAnnuler(true);
  }
  function revenir() {
    setBrouillon(brouillonDe(saved));
    setEquipageTouche(false);
    setEquipageInvalide(false);
    setInvalides({});
    setCleEquipage((n) => n + 1);
    setCalcul({ resultat: saved.resultat, alertes: saved.alertes });
    setEtatCalcul('ok');
    dernier.current++;
    setRefus(null);
    setConfirmerAnnuler(false);
  }

  // « Recalculer » (P-19, step 4): the core's route, with the version of the section read; the screen decides nothing.
  async function recalculer() {
    if (recalcul.enCours || perdue) return;
    setConfirmerRecalcul(false);
    setRecalcul({ enCours: true, refus: null, echec: false, perdu: false, fait: false });
    setMessage(null);
    try {
      await appeler('POST', `/api/univers/${universId}/fiches/${saved.ficheId}/sections/${saved.sectionId}/recalcul${requete(suffixe)}`, { version: saved.sectionVersion });
      const c = await lire<Conception>(`${base}/conceptions/${saved.ficheId}${requete(suffixe)}`);
      onSaved(c);
      setBrouillon(brouillonDe(c));
      setCalcul({ resultat: c.resultat, alertes: c.alertes });
      setEtatCalcul('ok');
      dernier.current++;
      setRecalcul({ enCours: false, refus: null, echec: false, perdu: false, fait: true });
      setMessage('Conception recalculée.');
    } catch (e) {
      const r = { enCours: false, refus: null as string | null, echec: false, perdu: false, fait: false };
      if (e instanceof ErreurApi && e.statut === 409) setConflit(true);
      else if (e instanceof ErreurApi && e.statut === 403) r.perdu = true;
      else if (e instanceof ErreurApi && e.statut === 400 || e instanceof ErreurApi && e.statut === 422) r.refus = e.message;
      else r.echec = true;
      setRecalcul(r);
    }
  }
  function demanderRecalcul() {
    if (modifie) setConfirmerRecalcul(true);
    else void recalculer();
  }

  async function copier() {
    const adresse = `${window.location.origin}/univers/${universId}/outils/swn/vaisseaux?fiche=${saved.ficheId}`;
    try {
      await navigator.clipboard.writeText(adresse);
      setLienCopie('oui');
    } catch {
      setLienCopie('non');
    }
  }

  const raison = bloquante ? `Enregistrement refusé : ${motifDe(bloquante)}.` : null;
  const peutEnregistrer = ecriture && !perdue && !bloquante && !invalide && etatCalcul === 'ok' && !enregistrement;
  const estompe = etatCalcul === 'erreur';

  return (
    <div className="vx">
      <div className="vx-entete">
        <div>
          <p className="vx-retour"><Link to={{ search: '' }}>Toutes les conceptions</Link></p>
          <h1>{saved.titre}</h1>
          <p className="vx-sous">{brouillon.coque.nom} · classe {resultat.coque.classe}</p>
        </div>
        <div className="vx-actions-tete">
          <Link className="bouton neutre" to={`/univers/${universId}/fiche/${saved.ficheId}`}>Ouvrir la fiche</Link>
          <Bouton onClick={() => void copier()}>Copier le lien</Bouton>
        </div>
      </div>
      {lienCopie && <p role="status" className="vx-note">{lienCopie === 'oui' ? 'Lien copié.' : 'Copie impossible : copiez l’adresse du navigateur.'}</p>}
      {perdue && <p className="echec" role="status">Connexion perdue.</p>}
      {!ecriture && <p className="vx-note" role="status">Lecture seule.</p>}
      {message && <p className="vx-succes" role="status">{message}</p>}
      {conflit && (
        <p className="echec" role="alert">
          Cette conception a changé depuis que vous l’avez ouverte.{' '}
          <Bouton petit onClick={() => { setConflit(false); onRecharger(); }}>Recharger</Bouton>
        </p>
      )}
      <div className="vx-corps">
        <div className="vx-colonne">
          {saved.perime && (
            <div className="vx-bande" role="status">
              <div>
                <p className="vx-bande-titre">Calculée avec d’anciens réglages.</p>
                <p className="vx-sous">Le texte de la fiche n’a pas changé. Enregistrer ou recalculer le met à jour.</p>
                {recalcul.refus && <p className="vx-raison" role="alert">{recalcul.refus}</p>}
                {recalcul.perdu && <p className="vx-note">Vous ne pouvez plus recalculer cette conception.</p>}
                {recalcul.echec && <p className="echec" role="alert">Impossible de recalculer cette conception.</p>}
                {perdue && saved.peutRecalculer && <p className="vx-note">Connexion perdue.</p>}
              </div>
              {saved.peutRecalculer && !recalcul.perdu && (
                <Bouton variante="principal" petit ecrit icone={RefreshCw} disabled={perdue || recalcul.enCours} onClick={demanderRecalcul}>
                  {recalcul.enCours ? 'Recalcul…' : recalcul.echec ? 'Réessayer' : 'Recalculer'}
                </Bouton>
              )}
            </div>
          )}
        <aside className="vx-resultats" aria-label="Résultats">
          <h2>
            {modifie || saved.perime ? 'Résultats' : 'Résultats enregistrés'}
            {etatCalcul === 'calcul' && <small className="vx-calcul" role="status"> Calcul…</small>}
          </h2>
          <div className="vx-defile">
          <div className={estompe ? 'vx-estompe' : undefined} data-estompe={estompe || undefined}>
            <Chiffres r={resultat} />
          </div>
          {etatCalcul === 'erreur' && <ErreurCalcul onReessayer={() => setEssaiCalcul((n) => n + 1)} />}
          <div className="vx-alertes-zone"><Alertes alertes={alertes} /></div>
          </div>
          {ecriture && (
            <div className="vx-enregistrer">
              <div className="vx-actions">
                <Bouton variante="principal" disabled={!peutEnregistrer} enCours={enregistrement} onClick={() => void enregistrer()}>Enregistrer</Bouton>
                <Bouton onClick={annuler}>Annuler</Bouton>
              </div>
              {raison && <p className="vx-raison" role="status">{raison}</p>}
              {refus && !raison && <p className="echec" role="alert">{refus}</p>}
              {refus && raison && refus !== raison && <p className="echec" role="alert">{refus}</p>}
            </div>
          )}
        </aside>
        </div>
        <section className="vx-choix" aria-label="Choix">
          {perdue && <p className="vx-note">Les choix sont verrouillés.</p>}
          <div className="vx-bloc">
            <div className="vx-bloc-tete"><h2>Coque</h2></div>
            <div className="vx-ligne-choix">
              <div className="vx-element-texte">
                <span className="vx-nom">{brouillon.coque.nom}</span>
                <span className="vx-sous">{infos[`coques/${brouillon.coque.cle}`] ? chiffresDe(infos[`coques/${brouillon.coque.cle}`], classe) : `classe ${classe}`}</span>
              </div>
              {infos[`coques/${brouillon.coque.cle}`]?.univers && <Pastille sens="neutre">Univers</Pastille>}
              {coqueRetiree && <Pastille sens="danger">Élément retiré de cet univers</Pastille>}
              {!verrou && <Bouton petit onClick={() => setOuvert({ nature: 'coques', titre: 'Changer de coque' })}>Changer de coque</Bouton>}
            </div>
            {ouvert?.nature === 'coques' && (
              <Selecteur universId={universId} suffixe={suffixe} nature="coques" titre={ouvert.titre} onChoisir={choisir} onFermer={() => setOuvert(null)} />
            )}
          </div>
          {blocEquipage && (
            <div className="vx-bloc">
              <div className="vx-bloc-tete"><h2>Équipage</h2></div>
              <Equipage
                key={cleEquipage} valeur={equipageAffiche} bornes={bornes} lecture={!ecriture} desactive={verrou}
                onChange={(n) => { setEquipageTouche(true); change((b) => ({ ...b, equipage: n })); }}
                onInvalide={(v) => { setEquipageTouche(true); setEquipageInvalide(v); }}
              />
            </div>
          )}
          {blocReparation && (
            <div className="vx-bloc">
              <div className="vx-bloc-tete"><h2>Compétence de réparation</h2></div>
              {ecriture ? (
                <Equipage
                  key={`rep-${cleEquipage}`} nom="Compétence de réparation" maximum={20} valeur={reparationAffichee} bornes="" lecture={false} desactive={verrou}
                  diminuer="Diminuer la compétence de réparation" augmenter="Augmenter la compétence de réparation"
                  onChange={(n) => change((b) => ({ ...b, reparation: n }))}
                  onInvalide={(v) => marquer('reparation', v)}
                />
              ) : (
                <p className="vx-lu">Compétence de réparation : {reparationAffichee}</p>
              )}
            </div>
          )}
          {NATURES.map((n) => {
            const lignes = brouillon.lignes.map((l, i) => ({ l, i })).filter(({ l }) => l.nature === n.nature);
            return (
              <div className="vx-bloc" key={n.nature}>
                <div className="vx-bloc-tete">
                  <h2>{n.titre}</h2>
                  {!verrou && lignes.length > 0 && <Bouton petit aria-label={`Ajouter : ${n.titre}`} onClick={() => setOuvert({ nature: n.nature, titre: n.ajout })}>Ajouter…</Bouton>}
                </div>
                {lignes.length === 0 ? (
                  <div className="vx-vide-bloc">
                    <span>Aucun choix</span>
                    {!verrou && <Bouton petit onClick={() => setOuvert({ nature: n.nature, titre: n.ajout })}>{n.ajout}</Bouton>}
                  </div>
                ) : (
                  <ul className="vx-lignes">
                    {lignes.map(({ l, i }) => (
                      <li key={`${l.nature}/${l.cle}`} className="vx-ligne-choix">
                        <div className="vx-element-texte">
                          <span className="vx-nom-ligne">
                            <span className="vx-nom">{l.nom}</span>
                            {classeInadaptee.has(i) && <Pastille sens="neutre">Classe</Pastille>}
                          </span>
                          {chiffresDe(infos[`${l.nature}/${l.cle}`], classe) && <span className="vx-sous">{chiffresDe(infos[`${l.nature}/${l.cle}`], classe)}</span>}
                          {resultat.lignes.find((r) => r.nature === l.nature && r.cle === l.cle)?.cout !== undefined && (
                            <span className="vx-sous">Ligne : {credits(resultat.lignes.find((r) => r.nature === l.nature && r.cle === l.cle)!.cout!)}</span>
                          )}
                          {ligneAjuste(resultat.lignes.find((r) => r.nature === l.nature && r.cle === l.cle)?.ajuste) && (
                            <span className="vx-sous">{ligneAjuste(resultat.lignes.find((r) => r.nature === l.nature && r.cle === l.cle)?.ajuste)}</span>
                          )}
                          {infos[`${l.nature}/${l.cle}`]?.el.donnees?.condition && <span className="vx-sous vx-condition">{infos[`${l.nature}/${l.cle}`]?.el.donnees?.condition}</span>}
                        </div>
                        {infos[`${l.nature}/${l.cle}`]?.univers && <Pastille sens="neutre">Univers</Pastille>}
                        {retirees.has(i) && <Pastille sens="danger">Élément retiré de cet univers</Pastille>}
                        {!ecriture ? (
                          <span className="vx-quantite-lue">× {l.quantite}</span>
                        ) : (
                          <>
                            <span className="vx-stepper" role="group" aria-label={`Quantité : ${l.nom}`}>
                              <Bouton petit aria-label={`Diminuer la quantité : ${l.nom}`} disabled={verrou || l.quantite <= 1} icone={Minus} onClick={() => quantite(l, -1)} />
                              <output aria-label={`Quantité de ${l.nom}`}>{l.quantite}</output>
                              <Bouton petit aria-label={`Augmenter la quantité : ${l.nom}`} disabled={verrou || l.quantite >= 99} icone={Plus} onClick={() => quantite(l, 1)} />
                            </span>
                            <Bouton petit disabled={verrou} aria-label={`Retirer : ${l.nom}`} onClick={() => retirer(l)}>Retirer</Bouton>
                          </>
                        )}
                        <Effets
                          ligne={l} info={infos[`${l.nature}/${l.cle}`]} infos={infos} lignes={brouillon.lignes} resultat={resultat}
                          alerte={alertes.find((a) => a.code === 'cible_invalide' && a.ligne === i)}
                          ecriture={ecriture} verrou={verrou} cle={cleEquipage}
                          onPoints={(n) => points(l, n)} onInvalide={(v) => marquer(`points/${l.nature}/${l.cle}`, v)} onVise={(v) => viser(l, v)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {ouvert?.nature === n.nature && (
                  <Selecteur universId={universId} suffixe={suffixe} nature={n.nature} titre={ouvert.titre} classeCoque={resultat.coque.classe} onChoisir={choisir} onFermer={() => setOuvert(null)} />
                )}
              </div>
            );
          })}
        </section>
      </div>
      {confirmerRecalcul && (
        <BoiteDialogue
          titre="Recalculer cette conception ?"
          texte="Vos modifications non enregistrées seront abandonnées."
          action="Recalculer"
          variante="mj"
          icone={RefreshCw}
          onConfirmer={() => void recalculer()}
          onFermer={() => setConfirmerRecalcul(false)}
        />
      )}
      {confirmerAnnuler && (
        <BoiteDialogue
          titre="Annuler les changements ?"
          texte="Le brouillon sera remplacé par la dernière conception enregistrée."
          action="Annuler les changements"
          onConfirmer={revenir}
          onFermer={() => setConfirmerAnnuler(false)}
        />
      )}
    </div>
  );
}
