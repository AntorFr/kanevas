import { useEffect, useMemo, useState } from 'react';

import { lire } from '../../../api';
import { Bouton, Pastille } from '../../../ui';
import { exclutLaClasse, legende, requete } from './format';
import type { ElementCatalogue, PageCatalogue } from './types';

/** The catalogue of one nature, 50 per page, with a filter above the long list (E-22). */
export function Selecteur({ universId, suffixe, nature, titre, classeCoque, onChoisir, onFermer }: {
  universId: number;
  suffixe: string;
  nature: string;
  titre: string;
  /** The class of the chosen hull: only to mark the elements its class excludes (the alert is the server's). */
  classeCoque?: number;
  onChoisir: (e: ElementCatalogue) => void;
  onFermer: () => void;
}) {
  const [elements, setElements] = useState<ElementCatalogue[]>([]);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [filtre, setFiltre] = useState('');
  const [essai, setEssai] = useState(0);

  function lirePage(curseur?: string) {
    setEtat('chargement');
    lire<PageCatalogue>(`/api/univers/${universId}/outils/swn/vaisseaux/catalogue${requete(suffixe, { nature, curseur })}`).then(
      (p) => {
        setElements((avant) => (curseur ? [...avant, ...p.elements] : p.elements));
        setSuivant(p.suivant);
        setEtat('ok');
      },
      () => setEtat('erreur'),
    );
  }
  useEffect(() => { lirePage(); }, [universId, suffixe, nature, essai]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return elements.filter((e) => !f || e.nom.toLowerCase().includes(f));
  }, [elements, filtre]);

  return (
    <div className="vx-selecteur" role="group" aria-label={titre}>
      <div className="vx-selecteur-tete">
        <strong>{titre}</strong>
        <Bouton petit onClick={onFermer}>Fermer</Bouton>
      </div>
      {(elements.length > 8 || filtre !== '') && (
        <input
          className="vx-filtre" type="search" placeholder="Filtrer" aria-label={`Filtrer : ${titre}`}
          value={filtre} onChange={(e) => setFiltre(e.target.value)}
        />
      )}
      {etat === 'chargement' && <p role="status">Chargement…</p>}
      {etat === 'erreur' && (
        <p className="echec" role="alert">
          Impossible de charger le catalogue. <Bouton petit onClick={() => (elements.length ? lirePage(suivant ?? undefined) : setEssai((n) => n + 1))}>Réessayer</Bouton>
        </p>
      )}
      {etat === 'ok' && elements.length === 0 && <p>Le catalogue est vide pour cette nature.</p>}
      <ul className="vx-elements">
        {visibles.map((e) => {
          const masque = e.masque === true;
          return (
            <li key={e.cle} className="vx-element">
              <div className="vx-element-texte">
                <span className="vx-nom">{e.nom}</span>
                <span className="vx-sous">{[e.resume, legende(e)].filter(Boolean).join(' · ')}</span>
                {e.donnees?.condition && <span className="vx-sous vx-condition">{e.donnees.condition}</span>}
              </div>
              <span className="vx-etiquettes">
                {classeCoque !== undefined && exclutLaClasse(e, classeCoque) && <Pastille sens="neutre">Classe</Pastille>}
                {(e.univers || e.origine === 'univers' || e.origine === 'remplace') && <Pastille sens="neutre">Univers</Pastille>}
                {masque && <Pastille sens="mj">Masqué</Pastille>}
              </span>
              <Bouton petit disabled={masque} title={masque ? 'Masqué : non proposé aux joueurs.' : undefined} onClick={() => onChoisir(e)}>
                {nature === 'coques' ? 'Choisir' : 'Ajouter'}
                <span className="vx-lecteur"> {e.nom}</span>
              </Bouton>
            </li>
          );
        })}
      </ul>
      {suivant && etat !== 'erreur' && <Bouton onClick={() => lirePage(suivant)}>Afficher la suite</Bouton>}
    </div>
  );
}
