import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErreurApi, appeler } from '../../api';
import { Bouton, BoiteDialogue, Champ, useToasts } from '../../ui';
import { iconeDeNom } from '../../types-contexte';
import type { Fiche } from '../fiche/types';

export interface TypeSysteme {
  type: string;
  active: boolean;
  singulier: string;
  pluriel: string;
  nouveau: string;
  icone: string;
}

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/**
 * E-15, tab « Éléments »: the system's elements grouped by type (the list of E-8, one line per element), « Nouvel élément »
 * for a GM of the system. An element opens in the system's space (E-9).
 */
export function OngletElements({ systemeId, types, fiches, suite, peutEcrire }: {
  systemeId: string;
  types: TypeSysteme[];
  fiches: Fiche[];
  suite: boolean;
  peutEcrire: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToasts();
  const actifs = types.filter((t) => t.active);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState('');
  const [titre, setTitre] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);
  const groupes = types
    .map((t) => ({ t, lignes: fiches.filter((f) => f.type === t.type) }))
    .filter((g) => g.lignes.length > 0);

  function ouvrir() {
    setType(actifs[0]?.type ?? '');
    setTitre('');
    setErreur(undefined);
    setOuvert(true);
  }

  async function creer(e?: FormEvent) {
    e?.preventDefault();
    if (enCours) return;
    const t = titre.trim();
    if (t === '') return setErreur('le titre est obligatoire.');
    if (t.length > 120) return setErreur('120 caractères au plus.');
    setEnCours(true);
    try {
      const f = await appeler<Fiche>('POST', `/api/systemes/${systemeId}/fiches`, { type, titre: t });
      toast(`« ${t} » créé.`);
      navigate(`/systemes/${systemeId}/fiches/${f.id}`);
    } catch (e2) {
      setErreur(e2 instanceof ErreurApi && e2.statut === 400 ? e2.message : ECHEC);
      setEnCours(false);
    }
  }

  return (
    <>
      {peutEcrire && (
        <div className="barre-outils">
          <Bouton variante="principal" ecrit icone={Plus} disabled={actifs.length === 0} onClick={ouvrir}>
            Nouvel élément
          </Bouton>
        </div>
      )}
      {groupes.length === 0 ? (
        <p className="note-sys">Aucun élément pour l’instant.</p>
      ) : (
        groupes.map(({ t, lignes }) => {
          const Icone = iconeDeNom(t.icone);
          return (
            <section key={t.type} className="groupe-elements" aria-label={t.pluriel}>
              <h2>
                <Icone size={16} strokeWidth={1.75} aria-hidden="true" /> {t.pluriel}
              </h2>
              <ul className="liste-elements">
                {lignes.map((f) => (
                  <li key={f.id}>
                    <Link to={`/systemes/${systemeId}/fiches/${f.id}`}>{f.titre}</Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {suite && <p className="note-sys">D’autres éléments existent : affinez par type.</p>}
      {ouvert && (
        <BoiteDialogue
          titre="Nouvel élément"
          texte="Il naît sans section ; les joueurs ne lisent rien tant qu’une section ne leur est pas ouverte."
          action="Créer l’élément"
          variante="neutre"
          formulaire
          enCours={enCours}
          onConfirmer={() => void creer()}
          onFermer={() => setOuvert(false)}
          reperage={() => document.querySelector<HTMLElement>('main h1')}
        >
          <Champ liste etiquette="Type" value={type} onChange={(e: { target: { value: string } }) => setType(e.target.value)}>
            {actifs.map((t) => (
              <option key={t.type} value={t.type}>{t.singulier}</option>
            ))}
          </Champ>
          <Champ etiquette="Titre" value={titre} autoComplete="off" erreur={erreur}
            onChange={(e: { target: { value: string } }) => { setTitre(e.target.value); setErreur(undefined); }} />
        </BoiteDialogue>
      )}
    </>
  );
}
