import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { lire, useConnexionPerdue } from '../../api';
import { Bouton } from '../../ui';
import './mentions.css';
import type { Mention } from './types';
import { iconeDuType } from './types-fiche';

/** « lien dans « Histoire » », the relation's label, or both separated by « · » (B-36). */
export function pourquoiDe(m: Mention): string {
  return m.pourquoi.map((p) => (p.genre === 'lien' ? `lien dans « ${p.section} »` : p.libelle)).join(' · ');
}

interface Props {
  universId: string;
  ficheId: number;
  /** The first page, carried by the sheet itself. */
  mentions: Mention[];
  suite: boolean;
  /** How many sources follow the first page, for this reader. */
  restantes: number;
  /** `?mode=joueur` when the GM reads as a player. */
  suffixeMode: string;
}

/**
 * E-9 block « Mentionnée dans » (B-36, AD-100): the sheets that cite this one, as far as the reader sees them. Fifty come with
 * the sheet, the rest by `GET …/mentions?apres=`. No block when there is nothing to show, and never a count of what is hidden.
 */
export function BlocMentions({ universId, ficheId, mentions, suite, restantes, suffixeMode }: Props) {
  const perdue = useConnexionPerdue();
  const [ajoutees, setAjoutees] = useState<Mention[]>([]);
  const [reste, setReste] = useState(suite ? restantes : 0);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);

  // The sheet was read again (after a write, or in the other mode): its first page wins over what was added.
  useEffect(() => {
    setAjoutees([]);
    setReste(suite ? restantes : 0);
    setEchec(false);
  }, [mentions, suite, restantes]);

  const toutes = [...mentions, ...ajoutees];
  if (toutes.length === 0) return null;

  async function suivantes() {
    if (enCours) return;
    setEnCours(true);
    setEchec(false);
    try {
      const p = await lire<{ mentions: Mention[]; suite: boolean; restantes: number }>(
        `/api/univers/${universId}/fiches/${ficheId}/mentions?apres=${toutes.length}${suffixeMode.replace('?', '&')}`,
      );
      setAjoutees((a) => [...a, ...p.mentions]);
      setReste(p.suite ? p.restantes : 0);
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="blocs">
      <section className="bloc-section bloc-mentions" aria-labelledby="titre-mentions">
        <h2 id="titre-mentions" className="bloc-libelle">
          <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
          Mentionnée dans
        </h2>
        <div className="bloc-contenu">
          <ul className="mentions">
            {toutes.map((m) => {
              const Icone = iconeDuType(m.type);
              return (
                <li key={m.ficheId} className="mention">
                  <Link className="jeton cible" to={`/univers/${universId}/fiche/${m.ficheId}`}>
                    <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span className="jeton-titre" title={m.titre}>
                      {m.titre}
                    </span>
                  </Link>
                  <span className="pourquoi">{pourquoiDe(m)}</span>
                </li>
              );
            })}
          </ul>
          {echec && (
            <div className="echec" role="alert">
              Impossible de charger la suite.
            </div>
          )}
          {reste > 0 && (
            <Bouton ecrit={false} disabled={enCours || perdue} onClick={() => void suivantes()}>
              {enCours ? 'Chargement…' : echec ? 'Réessayer' : `Afficher les ${reste} suivants`}
            </Bouton>
          )}
        </div>
      </section>
    </div>
  );
}
