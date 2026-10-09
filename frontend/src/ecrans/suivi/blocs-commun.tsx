import { Lock, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { Alerte, Bouton, Pastille } from '../../ui';

/** Loads something asynchronous for an E-3 block; `recharger` re-runs it (« Réessayer »). */
function useBlocCharge<T>(charger: () => Promise<T>, cle: unknown): [
  { etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; valeur: T },
  () => void,
] {
  const [etat, setEtat] = useState<{ etat: 'chargement' } | { etat: 'erreur' } | { etat: 'ok'; valeur: T }>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat({ etat: 'chargement' });
    charger().then(
      (valeur) => actif && setEtat({ etat: 'ok', valeur }),
      () => actif && setEtat({ etat: 'erreur' }),
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, essai]);
  return [etat, () => setEssai((n) => n + 1)];
}

/**
 * Shared frame of the blocks of E-3: no card, a title, an optional link (at the head of the title on a
 * desktop, under the rows on a phone), and the body. Its own loading and error states
 * (« Impossible de charger ce bloc. »), so that one failing block never takes the others down.
 * `reserveMj` gives it the GM matter (amber rule, hatching) and the words « MJ seul ».
 */
export function BlocVue({
  titre,
  reserveMj,
  lien,
  donnee,
  children,
}: {
  titre: string;
  reserveMj?: boolean;
  /** The link of the block (a `LienAction`), when it has one. */
  lien?: ReactNode;
  /** Data attribute naming the block, for the layout. */
  donnee?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`bloc-ve${reserveMj ? ' mj-seul' : ''}${lien ? ' avec-lien' : ''}`} aria-labelledby={id} data-bloc={donnee}>
      <div className="bloc-tete">
        <h2 id={id}>{titre}</h2>
        {reserveMj && (
          <Pastille sens="mj" icone={Lock}>
            MJ seul
          </Pastille>
        )}
      </div>
      {children}
      {lien && <div className="bloc-lien">{lien}</div>}
    </section>
  );
}

/** The loading of a block: rows shaped like its lines, then the word. */
function ChargementBloc({ lignes }: { lignes: number }) {
  return (
    <div className="charge-bloc" role="status">
      {Array.from({ length: lignes }, (_, i) => (
        <div className="os-ligne" key={i} aria-hidden="true">
          <span className="squelette tuile-os" />
          <span>
            <span className="squelette" style={{ width: `${46 + ((i * 11) % 22)}%`, height: 14 }} />
          </span>
        </div>
      ))}
      <p>Chargement…</p>
    </div>
  );
}

/** A block that loads its own data. */
export function BlocSuivi<T>({
  titre,
  cle,
  charger,
  reserveMj,
  lien,
  lignes = 2,
  children,
}: {
  titre: string;
  cle: unknown;
  charger: () => Promise<T>;
  reserveMj?: boolean;
  lien?: ReactNode;
  /** Skeleton rows while loading. */
  lignes?: number;
  children: (valeur: T) => ReactNode;
}) {
  const [etat, recharger] = useBlocCharge(charger, cle);
  return (
    <BlocVue titre={titre} reserveMj={reserveMj} lien={lien}>
      {etat.etat === 'chargement' && <ChargementBloc lignes={lignes} />}
      {etat.etat === 'erreur' && (
        <Alerte
          action={
            <Bouton petit icone={RotateCcw} onClick={recharger}>
              Réessayer
            </Bouton>
          }
        >
          Impossible de charger ce bloc.
        </Alerte>
      )}
      {etat.etat === 'ok' && children(etat.valeur)}
    </BlocVue>
  );
}

/** The empty state of a block: one sentence, and the action when there is one. */
export function VideBloc({ children }: { children: ReactNode }) {
  return <div className="vide-bloc">{children}</div>;
}
