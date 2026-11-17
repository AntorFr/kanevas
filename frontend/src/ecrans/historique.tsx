import { ArrowLeft, History, RotateCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ErreurApi, appeler, lire, useConnexionPerdue } from '../api';
import { useCharge, useVue } from '../cadre-contexte';
import type { Ecran } from '../registre';
import type { UniversListe } from '../types';
import {
  Alerte,
  BoiteDialogue,
  Bouton,
  Champ,
  ChargementListe,
  Comparaison,
  ComparaisonSeule,
  ErreurChargement,
  EtatVide,
  Fenetre,
  LigneHistorique,
  ListeHistorique,
  PageIntrouvable,
  Panneau,
  useToasts,
} from '../ui';
import { ListeLiens, useRechercheLiens, type FicheLien } from '../ui/liste-liens';
import {
  ACTIONS,
  NON_CONSERVEE,
  PERIODES,
  dateLisible,
  libelleDe,
  origineDe,
  refusDe,
  requete,
  texteEntete,
  texteRelation,
  texteSection,
  viaDe,
  type DetailVue,
  type Filtres,
  type LigneVue,
} from './historique/format';
import './historique/historique.css';
import './ecrans.css';
import './liste.css';

interface Page {
  lignes: LigneVue[];
  curseur: string | null;
}

type Liste =
  | { etat: 'chargement' }
  | { etat: 'erreur' }
  | { etat: 'ok'; lignes: LigneVue[]; curseur: string | null; suite: 'repos' | 'cours' | 'erreur' };

/** The sheet filter: a button that opens the search of sheets in a window (as E-11), « Toutes les fiches » to lift it. */
function FiltreFiche({ universId, fiche, onChoisir }: { universId: string; fiche: string; onChoisir: (id: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [courant, setCourant] = useState(0);
  const [recherche, reessayer] = useRechercheLiens(universId, texte, ouvert);
  const [titre, setTitre] = useState<string | null>(null);
  useEffect(() => {
    setTitre(null);
    if (!fiche) return;
    let actif = true;
    lire<{ titre: string }>(`/api/univers/${universId}/fiches/${fiche}`).then(
      (f) => actif && setTitre(f.titre),
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [universId, fiche]);

  const choisir = (f: FicheLien) => {
    setOuvert(false);
    setTexte('');
    setTitre(f.titre);
    onChoisir(String(f.id));
  };
  const n = recherche.etat === 'ok' ? recherche.fiches.length : 0;
  return (
    <div className="champ filtre-fiche">
      <span className="lib-champ">Fiche</span>
      <div className="filtre-fiche-ligne">
        <Bouton icone={Search} onClick={() => setOuvert(true)}>
          {fiche ? (titre ?? 'Une fiche') : 'Toutes les fiches'}
        </Bouton>
        {fiche && (
          <Bouton petit variante="fantome" onClick={() => onChoisir('')}>
            Toutes les fiches
          </Bouton>
        )}
      </div>
      {ouvert && (
        <Fenetre titre="Filtrer sur une fiche" icone={Search} onFermer={() => setOuvert(false)}>
          <Champ
            etiquette="Chercher une fiche"
            value={texte}
            role="combobox"
            aria-expanded="true"
            aria-controls="liste-filtre-fiche"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setTexte(e.target.value);
              setCourant(0);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'ArrowDown' && n > 0) {
                e.preventDefault();
                setCourant((courant + 1) % n);
              } else if (e.key === 'ArrowUp' && n > 0) {
                e.preventDefault();
                setCourant((courant - 1 + n) % n);
              } else if (e.key === 'Enter' && recherche.etat === 'ok' && recherche.fiches[courant]) {
                e.preventDefault();
                choisir(recherche.fiches[courant]!);
              }
            }}
          />
          <ListeLiens id="liste-filtre-fiche" recherche={recherche} courant={courant} onCourant={setCourant} onChoisir={choisir} onReessayer={reessayer} />
          <div className="actions-fenetre">
            <Bouton onClick={() => setOuvert(false)}>Annuler</Bouton>
          </div>
        </Fenetre>
      )}
    </div>
  );
}

/** The detail of a line: previous and current value, and the restoration when it exists. */
function Detail({ base, hid, retour, onRestauree }: { base: string; hid: string; retour: string; onRestauree: () => void }) {
  const [charge, recharger] = useCharge<DetailVue>(`${base}/${hid}`);
  const horsLigne = useConnexionPerdue();
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const { toast } = useToasts();

  useEffect(() => setRefus(null), [hid]);

  const retourLien = (
    <Link className="lien-retour" to={retour}>
      <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Retour à la liste
    </Link>
  );
  if (charge.etat === 'chargement') return <ChargementListe texte="Chargement de la ligne…" />;
  if (charge.etat === 'erreur') {
    return charge.statut === 404 ? (
      <>
        {retourLien}
        <EtatVide titre="Cette ligne n’existe plus.">
          <p>Elle a été purgée de l’historique.</p>
        </EtatVide>
      </>
    ) : (
      <>
        {retourLien}
        <ErreurChargement texte="Impossible de charger l’historique." onReessayer={recharger} />
      </>
    );
  }
  const d = charge.valeur;
  const l = d.ligne;
  const peutRestaurer = l.restaurable && l.valeurConservee && d.avant !== null;
  const section = l.objet === 'section';

  const restaurer = async () => {
    setEnCours(true);
    setRefus(null);
    try {
      const corps = section ? (l.action === 'modifiee' ? { version: d.version } : {}) : { empreinte: d.empreinte };
      await appeler('POST', `${base}/${hid}/restaurer`, corps);
      setConfirmer(false);
      toast('Version restaurée');
      onRestauree();
    } catch (e) {
      setConfirmer(false);
      setRefus(e instanceof ErreurApi ? refusDe(e.code, e.message) : 'Impossible de restaurer.');
    } finally {
      setEnCours(false);
    }
  };

  let corps;
  if (l.objet === 'fiche') {
    corps =
      d.sections && d.sections.length > 0 ? (
        <>
          <p className="intro">Les sections de la fiche, telles qu’elles étaient. Texte source, en lecture seule.</p>
          {d.sections.map((s) => (
            <ComparaisonSeule key={s.cle} nom={s.titre} texte={s.contenu} />
          ))}
        </>
      ) : l.action === 'supprimee' ? (
        <p className="intro">{l.valeurConservee ? 'Aucune section n’était conservée.' : NON_CONSERVEE}</p>
      ) : null;
  } else if (d.avant === null) {
    corps = <p className="intro">{l.valeurConservee ? 'Cette ligne n’a pas de valeur précédente.' : NON_CONSERVEE}</p>;
  } else if (l.objet === 'relation') {
    corps = <ComparaisonSeule nom="Valeur précédente" texte={texteRelation(d.avant)} />;
  } else if (section) {
    corps = <Comparaison avant={texteSection(d.avant as { titre: string; contenu: string })} courante={d.courante ? texteSection(d.courante as { titre: string; contenu: string }) : null} />;
  } else {
    corps = <Comparaison avant={texteEntete(d.avant)} courante={d.courante ? texteEntete(d.courante) : null} />;
  }

  return (
    <>
      {retourLien}
      <Panneau titre={libelleDe(l)}>
        <p className="meta-ligne">
          {dateLisible(l.creeLe)} · {l.compte?.username ?? 'Compte inconnu'}
          {viaDe(l) ? ` · ${viaDe(l)}` : ''} · {l.ficheTitre}
        </p>
        {corps}
        {refus && (
          <Alerte
            action={
              <Bouton
                petit
                icone={RotateCcw}
                onClick={() => {
                  setRefus(null);
                  recharger();
                }}
              >
                Recharger
              </Bouton>
            }
          >
            {refus}
          </Alerte>
        )}
        {peutRestaurer && (
          <div className="actions-detail">
            <Bouton variante="principal" icone={RotateCcw} ecrit disabled={horsLigne} onClick={() => setConfirmer(true)}>
              Restaurer cette version
            </Bouton>
          </div>
        )}
      </Panneau>
      {confirmer && (
        <BoiteDialogue
          titre="Restaurer cette version ?"
          texte={
            section
              ? `La section « ${l.objetCle ?? ''} » reprendra la valeur précédente. Un nouvel enregistrement s’ajoute à l’historique ; rien n’est effacé.`
              : 'L’en-tête de la fiche reprendra la valeur précédente. Un nouvel enregistrement s’ajoute à l’historique ; rien n’est effacé.'
          }
          action="Restaurer cette version"
          icone={RotateCcw}
          iconeAction={RotateCcw}
          variante="neutre"
          enCours={enCours}
          onConfirmer={() => void restaurer()}
          onFermer={() => setConfirmer(false)}
        />
      )}
    </>
  );
}

/** E-24 Historique de l'univers (GM only): the lines of the writes, filtered, compared and restored. */
function Historique() {
  const { id } = useParams();
  const [query, setQuery] = useSearchParams();
  const naviguer = useNavigate();
  const { mode } = useVue();
  const base = `/api/univers/${id}/historique`;
  const [univers] = useCharge<UniversListe>(`/api/univers/${id}`);
  const [contributeurs] = useCharge<{ comptes: { id: number; username: string }[]; jetons: { nom: string }[] }>(`${base}/contributeurs`);
  const filtres: Filtres = {
    fiche: query.get('fiche') ?? '',
    qui: query.get('qui') ?? '',
    action: query.get('action') ?? '',
    periode: query.get('periode') ?? '',
  };
  const ligneOuverte = query.get('ligne');
  const [liste, setListe] = useState<Liste>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  const cle = JSON.stringify(filtres);
  const demande = useRef(0);

  const estMJ = univers.etat === 'ok' && univers.valeur.role === 'mj' && mode !== 'joueur' && query.get('mode') !== 'joueur';
  useEffect(() => {
    if (!estMJ) return;
    const n = ++demande.current;
    setListe({ etat: 'chargement' });
    lire<Page>(`${base}${requete(filtres, new Date())}`).then(
      (p) => n === demande.current && setListe({ etat: 'ok', lignes: p.lignes, curseur: p.curseur, suite: 'repos' }),
      () => n === demande.current && setListe({ etat: 'erreur' }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, cle, essai, estMJ]);

  const chargerSuite = useCallback(async () => {
    if (liste.etat !== 'ok' || liste.curseur === null) return;
    const n = demande.current;
    setListe({ ...liste, suite: 'cours' });
    try {
      const p = await lire<Page>(`${base}${requete(filtres, new Date(), liste.curseur)}`);
      if (n === demande.current) setListe({ etat: 'ok', lignes: [...liste.lignes, ...p.lignes], curseur: p.curseur, suite: 'repos' });
    } catch {
      if (n === demande.current) setListe({ ...liste, suite: 'erreur' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, cle, liste]);

  const poser = (nom: keyof Filtres, valeur: string) => {
    const q = new URLSearchParams(query);
    if (valeur) q.set(nom, valeur);
    else q.delete(nom);
    q.delete('ligne');
    setQuery(q);
  };
  const versListe = (() => {
    const q = new URLSearchParams(query);
    q.delete('ligne');
    const s = q.toString();
    return `/univers/${id}/historique${s ? `?${s}` : ''}`;
  })();
  const versLigne = (hid: number) => {
    const q = new URLSearchParams(query);
    q.set('ligne', String(hid));
    return `/univers/${id}/historique?${q.toString()}`;
  };

  if (univers.etat === 'chargement') return <ChargementListe texte="Chargement de l’historique…" />;
  // A player, no role, an unknown universe, a GM in player mode: the same answer.
  if (univers.etat === 'erreur' && univers.statut === 404) return <PageIntrouvable />;
  if (univers.etat === 'ok' && !estMJ) return <PageIntrouvable />;
  if (univers.etat === 'erreur') return <ErreurChargement page onReessayer={() => setEssai((x) => x + 1)} />;

  const filtre = Object.values(filtres).some((v) => v !== '');
  return (
    <div className="page-liste page-historique">
      <header className="tete-liste">
        <span className="glyphe-type" aria-hidden="true">
          <History size={20} strokeWidth={1.75} />
        </span>
        <h1>Historique</h1>
      </header>
      <p className="intro">Les modifications de l’univers, de la plus récente à la plus ancienne. Une valeur précédente se restaure pendant 30 jours.</p>

      {ligneOuverte ? (
        <Detail
          base={base}
          hid={ligneOuverte}
          retour={versListe}
          onRestauree={() => {
            setEssai((x) => x + 1);
            naviguer(versListe);
          }}
        />
      ) : (
        <>
          <div className="filtres-historique" role="group" aria-label="Filtres">
            <Champ etiquette="Contributeur" liste value={filtres.qui} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => poser('qui', e.target.value)}>
              <option value="">Tous les contributeurs</option>
              {contributeurs.etat === 'ok' &&
                contributeurs.valeur.comptes.map((c) => (
                  <option key={`c${c.id}`} value={`c:${c.id}`}>
                    {c.username}
                  </option>
                ))}
              {contributeurs.etat === 'ok' &&
                contributeurs.valeur.jetons.map((j) => (
                  <option key={`j${j.nom}`} value={`j:${j.nom}`}>
                    Jeton « {j.nom} »
                  </option>
                ))}
            </Champ>
            <FiltreFiche universId={id ?? ''} fiche={filtres.fiche} onChoisir={(f) => poser('fiche', f)} />
            <Champ etiquette="Action" liste value={filtres.action} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => poser('action', e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a.valeur} value={a.valeur}>
                  {a.libelle}
                </option>
              ))}
            </Champ>
            <Champ etiquette="Période" liste value={filtres.periode} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => poser('periode', e.target.value)}>
              {PERIODES.map((p) => (
                <option key={p.valeur} value={p.valeur}>
                  {p.libelle}
                </option>
              ))}
            </Champ>
          </div>
          {liste.etat === 'chargement' && <ChargementListe texte="Chargement de l’historique…" />}
          {liste.etat === 'erreur' && <ErreurChargement texte="Impossible de charger l’historique." onReessayer={() => setEssai((x) => x + 1)} />}
          {liste.etat === 'ok' && liste.lignes.length === 0 && (
            <EtatVide titre="Aucune modification dans cette période.">
              {filtre && <p>Changez ou retirez un filtre pour voir plus de lignes.</p>}
            </EtatVide>
          )}
          {liste.etat === 'ok' && liste.lignes.length > 0 && (
            <>
              <ListeHistorique etiquette="Modifications de l’univers">
                {liste.lignes.map((l) => {
                  const o = origineDe(l.origine);
                  return (
                    <LigneHistorique
                      key={l.id}
                      date={l.creeLe}
                      dateLisible={dateLisible(l.creeLe)}
                      contributeur={l.compte?.username ?? 'Compte inconnu'}
                      via={viaDe(l)}
                      origine={o}
                      fiche={l.ficheId === null || l.objet === 'fiche' && l.action === 'supprimee' ? null : { vers: `/univers/${id}/fiche/${l.ficheCle}`, titre: l.ficheTitre }}
                      libelle={libelleDe(l)}
                      vers={versLigne(l.id)}
                      courante={ligneOuverte === String(l.id)}
                    />
                  );
                })}
              </ListeHistorique>
              {liste.suite === 'erreur' && <Alerte>Impossible de charger la suite.</Alerte>}
              {liste.curseur !== null && (
                <div className="suite-historique">
                  <Bouton enCours={liste.suite === 'cours'} onClick={() => void chargerSuite()}>
                    Charger la suite
                  </Bouton>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default { chemin: '/univers/:id/historique', composant: Historique } satisfies Ecran;
