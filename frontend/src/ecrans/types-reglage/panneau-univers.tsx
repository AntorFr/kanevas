import { useEffect, useState } from 'react';

import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { BoiteDialogue, ChargementListe, ErreurChargement, Panneau, useToasts } from '../../ui';
import { iconeDeNom, useTypes, type TypeVue } from '../../types-contexte';
import './types-reglage.css';

type Choix = 'suivre' | 'active' | 'desactive';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';
const PLUS_MJ = 'Vous ne pouvez plus modifier ces paramètres.';

const choixDe = (t: TypeVue): Choix => t.forcage ?? 'suivre';

/** What the system alone says of this type (enabled when it says nothing). */
const valeurSysteme = (t: TypeVue) => t.systeme ?? true;

/** Would this type be enabled after the choice? */
const actifApres = (t: TypeVue, c: Choix) => (c === 'suivre' ? valeurSysteme(t) : c === 'active');

const nbFiches = (n: number) => (n === 0 ? 'Aucune fiche' : n === 1 ? '1 fiche' : `${n} fiches`);

/** « Les 201 lieux restent ; … » / « Le seul événement reste ; … » (feminine types are « Nouvelle … »). */
function texteConfirmation(t: TypeVue, n: number): string {
  const queue = 'on les atteint par un lien, la recherche ou l’arbre.';
  if (n === 1) {
    const f = t.nouveau.toLowerCase().startsWith('nouvelle');
    return `${f ? 'La' : 'Le'} seul${f ? 'e' : ''} ${t.singulier.toLowerCase()} reste ; on l’atteint par un lien, la recherche ou l’arbre.`;
  }
  return `Les ${n} ${t.pluriel.toLowerCase()} restent ; ${queue}`;
}

/** E-14, panel « Types de fiche »: one row per settable type, a three-way switch (GM only). */
export function PanneauTypesUnivers({ universId, universNom, avecSysteme }: { universId: string; universNom: string; avecSysteme: boolean }) {
  const { etat, types, recharger } = useTypes();
  const { toast } = useToasts();
  const perdue = useConnexionPerdue();
  const [lignes, setLignes] = useState<TypeVue[]>([]);
  const [attente, setAttente] = useState<{ type: string; choix: Choix }>();
  const [confirmation, setConfirmation] = useState<{ type: TypeVue; choix: Choix }>();
  const [echec, setEchec] = useState<string>();

  useEffect(() => {
    setLignes(types.filter((t) => t.reglable));
  }, [types]);

  async function regler(t: TypeVue, choix: Choix) {
    if (attente) return;
    setEchec(undefined);
    setAttente({ type: t.type, choix });
    try {
      const vue = await appeler<TypeVue>('PUT', `/api/univers/${universId}/types/${t.type}`, { etat: choix });
      setLignes((l) => l.map((x) => (x.type === t.type ? { ...x, ...vue, nbFiches: vue.nbFiches ?? x.nbFiches, systeme: vue.systeme ?? x.systeme } : x)));
      toast(
        `${t.singulier} : ${choix === 'suivre' ? 'suit le système' : choix === 'active' ? `activé dans ${universNom}` : `désactivé dans ${universNom}`}.`,
      );
      recharger();
    } catch (e) {
      setEchec(e instanceof ErreurApi && (e.statut === 403 || e.statut === 404) ? PLUS_MJ : ECHEC);
    } finally {
      setAttente(undefined);
    }
  }

  function choisir(t: TypeVue, choix: Choix) {
    if (attente || choix === choixDe(t)) return;
    if (t.active && !actifApres(t, choix) && (t.nbFiches ?? 0) > 0) return setConfirmation({ type: t, choix });
    void regler(t, choix);
  }

  const corps =
    etat === 'chargement' && lignes.length === 0 ? (
      <ChargementListe texte="Chargement des types…" />
    ) : etat === 'erreur' && lignes.length === 0 ? (
      <ErreurChargement texte="Impossible de charger les types." onReessayer={recharger} />
    ) : (
      <ul className="types">
        {lignes.map((t) => {
          const vu = attente?.type === t.type ? attente.choix : choixDe(t);
          const actif = attente?.type === t.type ? actifApres(t, attente.choix) : t.active;
          const sys = valeurSysteme(t);
          const contre = vu !== 'suivre' && avecSysteme && (vu === 'active') !== sys;
          const note = contre ? (sys ? 'Le système l’active.' : 'Le système le désactive.') : '';
          const Icone = iconeDeNom(t.icone);
          const inactif = perdue || Boolean(attente);
          return (
            <li key={t.type} className={`type-ligne${vu !== 'suivre' ? ' force' : ''}${actif ? '' : ' eteint'}`} data-type={t.type}>
              <span className="point" aria-hidden="true" title="Choix forcé" />
              <span className="type-ic" aria-hidden="true">
                <Icone size={16} strokeWidth={1.75} />
              </span>
              <span className="type-corps">
                <span className="type-nom" id={`type-nom-${t.type}`}>
                  {t.singulier}
                  {vu !== 'suivre' && <span className="lecteur"> (forcé)</span>}
                </span>
                {note && <span className="type-note">{note}</span>}
              </span>
              <span className="type-nb">{nbFiches(t.nbFiches ?? 0)}</span>
              <span className="bascule3" role="radiogroup" aria-labelledby={`type-nom-${t.type}`}>
                {(['suivre', 'active', 'desactive'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={vu === c}
                    aria-disabled={inactif || undefined}
                    tabIndex={vu === c ? 0 : -1}
                    onClick={() => !inactif && choisir(t, c)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                      e.preventDefault();
                      const ordre = ['suivre', 'active', 'desactive'] as const;
                      const i = (ordre.indexOf(c) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
                      const frere = e.currentTarget.parentElement?.querySelectorAll('button')[i] as HTMLButtonElement | undefined;
                      frere?.focus();
                      if (!inactif) choisir(t, ordre[i]!);
                    }}
                  >
                    {c === 'suivre' ? (
                      <>
                        <span className="src">{avecSysteme ? 'Système ·' : 'Par défaut ·'}</span>{' '}
                        {(avecSysteme ? sys : true) ? 'activé' : 'désactivé'}
                      </>
                    ) : c === 'active' ? (
                      'Activé'
                    ) : (
                      'Désactivé'
                    )}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <Panneau titre="Types de fiche" reserveMj>
      {echec && (
        <div className="echec" role="alert">
          {echec}
        </div>
      )}
      {corps}
      {confirmation && (
        <BoiteDialogue
          titre={`Désactiver « ${confirmation.type.singulier} » dans ${universNom} ?`}
          texte={texteConfirmation(confirmation.type, confirmation.type.nbFiches ?? 0)}
          action="Désactiver"
          enCours={Boolean(attente)}
          onFermer={() => setConfirmation(undefined)}
          onConfirmer={() => {
            const { type, choix } = confirmation;
            setConfirmation(undefined);
            void regler(type, choix);
          }}
        />
      )}
    </Panneau>
  );
}
