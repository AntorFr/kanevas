import { Eye, EyeOff, Ellipsis, ExternalLink, Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ErreurApi, appeler, envoyerFichier, lire, useConnexionPerdue } from '../../../api';
import { BlocSection as BlocUi, BoiteDialogue, Bouton, LigneFichier, Menu, Vignette, useToasts, type EntreeMenu } from '../../../ui';
import { aller } from '../../assistant/adresse';
import { iconeDe, type Usage } from '../../mediatheque/commun';
import { useAjoutFichier } from '../fichiers';
import type { BlocSection } from '../registre';
import { MESSAGES_PIECES as T, formaterTaille } from '../pieces';
import type { PieceJointe, PropsBlocSection } from '../types';

/** E-9 « Pièces jointes »: the files joined to a section, references to the media library (AD-111, B-55). */
function BlocPiecesJointes({ universId, fiche, section, role, rafraichir, suffixeMode }: PropsBlocSection) {
  const perdue = useConnexionPerdue();
  const { toast } = useToasts();
  const mj = role === 'mj';
  const ecrit = mj || section.peutEcrire;
  const pieces = section.piecesJointes ?? [];
  const [aRetirer, setARetirer] = useState<number>();
  const [enCours, setEnCours] = useState<number>();
  const [echecs, setEchecs] = useState<Record<number, string>>({});
  const [indisponibles, setIndisponibles] = useState<number[]>([]);
  const [avertissement, setAvertissement] = useState<string>();
  const [boite, setBoite] = useState<{ piece: PieceJointe; usages: Usage[] }>();

  const base = `/api/univers/${universId}/fiches/${fiche.id}`;
  const urlFichier = (p: PieceJointe) => `/api/univers/${universId}/fichiers/${p.id}`;

  // The two ways to add (B-55): from the device, joined as it enters the library; or picked in the library.
  const ajout = useAjoutFichier<unknown>({
    universId: String(universId),
    suffixeMode,
    peutAjouter: ecrit,
    mj,
    etiquette: 'Joindre un fichier',
    declencheur: (
      <>
        <Paperclip size={14} strokeWidth={1.75} aria-hidden="true" />
        Joindre un fichier
      </>
    ),
    envoyer: (fichier, progres) =>
      envoyerFichier(`/api/univers/${universId}/fichiers`, fichier, progres, 'POST', { section: String(section.id), maniere: 'joint' }),
    apres: async (_r, fichier) => {
      await rafraichir();
      toast(`« ${fichier.name} » ajouté`);
    },
    choisir: async (f) => {
      await appeler('POST', `${base}/sections/${section.id}/fichiers`, { fichierId: f.id });
      await rafraichir();
      toast(`« ${f.nom} » joint`);
    },
    surDroitPerdu: () => {
      setAvertissement(T.droit);
      void rafraichir();
    },
  });

  // A reader with nothing to see and nothing to add has no block at all — unless a message is still to be shown.
  if (!mj && !ecrit && pieces.length === 0 && !ajout.enCours && !avertissement) return null;

  async function agir(id: number, action: () => Promise<void>, droit = false, confirmation?: string) {
    if (enCours !== undefined) return;
    setEnCours(id);
    setEchecs(({ [id]: _, ...reste }) => reste);
    setAvertissement(undefined);
    try {
      await action();
      setARetirer(undefined);
      setBoite(undefined);
      await rafraichir();
      if (confirmation) toast(confirmation);
    } catch (e) {
      const statut = e instanceof ErreurApi ? e.statut : 0;
      if (statut === 404) {
        setAvertissement(T.disparue);
        setARetirer(undefined);
        setBoite(undefined);
        await rafraichir();
      } else if (statut === 403 && droit) {
        setAvertissement(T.droit);
        setARetirer(undefined);
        await rafraichir();
      } else {
        setBoite(undefined);
        setEchecs((x) => ({ ...x, [id]: T.echec }));
      }
    } finally {
      setEnCours(undefined);
    }
  }

  const regler = (p: PieceJointe, visibilite: 'mj' | 'joueurs') =>
    agir(
      p.id,
      async () => void (await appeler('PATCH', `/api/univers/${universId}/fichiers/${p.id}`, { visibilite })),
      false,
      visibilite === 'mj' ? 'Fichier réservé au MJ.' : 'Fichier visible des joueurs.',
    );

  /** « Réserver au MJ »: the impact box (what the players lose) when the file is read anywhere, else at once. */
  async function reserver(p: PieceJointe) {
    if (enCours !== undefined) return;
    setEnCours(p.id);
    try {
      const { usages } = await lire<{ usages: Usage[] }>(`/api/univers/${universId}/fichiers/${p.id}/impact?action=reserver`);
      setEnCours(undefined);
      if (usages.length > 0) return setBoite({ piece: p, usages });
      await regler(p, 'mj');
    } catch (e) {
      setEnCours(undefined);
      if (e instanceof ErreurApi && e.statut === 404) {
        setAvertissement(T.disparue);
        await rafraichir();
      } else setEchecs((x) => ({ ...x, [p.id]: T.echec }));
    }
  }

  const menuDe = (p: PieceJointe) => {
    const entrees: EntreeMenu[] = [];
    if (ecrit) entrees.push({ libelle: 'Retirer', icone: Trash2, danger: true, impossible: perdue, onChoisir: () => setARetirer(p.id) });
    if (mj) {
      entrees.push(
        p.secrete
          ? { libelle: 'Rendre visible des joueurs', icone: Eye, impossible: perdue, onChoisir: () => void regler(p, 'joueurs') }
          : { libelle: 'Réserver au MJ', icone: EyeOff, impossible: perdue, onChoisir: () => void reserver(p) },
      );
    }
    entrees.push({ libelle: 'Ouvrir dans la médiathèque', icone: ExternalLink, onChoisir: () => aller(`/univers/${universId}/mediatheque?fichier=${p.id}`) });
    return <Menu etiquette={`Actions sur « ${p.nom} »`} icone={Ellipsis} entrees={entrees} />;
  };

  const telecharger = (p: PieceJointe) => (
    <a className="bouton neutre petit" href={urlFichier(p)} download={p.nom}>
      Télécharger
    </a>
  );

  return (
    <BlocUi libelle="Pièces jointes" icone={Paperclip} vide={pieces.length === 0 && !ajout.enCours ? 'Aucun fichier joint.' : undefined}>
      <div
        className={`pieces-jointes${pieces.length === 0 ? ' vide' : ''}`}
        onDragOver={(e) => ecrit && Array.from(e.dataTransfer?.types ?? []).includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (!ecrit || !Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
          e.preventDefault();
          ajout.deposer(Array.from(e.dataTransfer.files));
        }}
      >
        {avertissement && (
          <div className="echec" role="alert">
            {avertissement}
          </div>
        )}
        {pieces.length > 0 && (
          <ul className="liste-pieces">
            {pieces.map((p) => {
              const vignette = p.image && !indisponibles.includes(p.id);
              return (
                <li key={p.id} className={`piece${p.image ? ' image' : ''}${p.secrete ? ' reserve-mj' : ''}`}>
                  {vignette ? (
                    <Vignette
                      src={urlFichier(p)}
                      alt={p.nom}
                      href={urlFichier(p)}
                      onErreur={() => setIndisponibles((i) => [...i, p.id])}
                      legende={`${p.nom} · ${formaterTaille(p.taille)}`}
                      secrete={p.secrete}
                      actions={menuDe(p)}
                    />
                  ) : (
                    <>
                      {p.image && <div className="vignette indisponible">Image indisponible.</div>}
                      <LigneFichier
                        nom={p.nom}
                        taille={formaterTaille(p.taille)}
                        secret={p.secrete}
                        Icone={iconeDe({ nom: p.nom, type: '' })}
                        actions={
                          <>
                            {telecharger(p)}
                            {menuDe(p)}
                          </>
                        }
                      />
                    </>
                  )}
                  {echecs[p.id] && (
                    <div className="echec" role="alert">
                      {echecs[p.id]}
                    </div>
                  )}
                  {ecrit && aRetirer === p.id && (
                    <div className="confirmation" role="alertdialog" aria-label="Confirmer le retrait">
                      <p>Retirer « {p.nom} » de cette section ? Le fichier reste dans la médiathèque.</p>
                      <div className="actions">
                        <Bouton
                          variante="danger"
                          ecrit
                          enCours={enCours === p.id}
                          onClick={() => agir(p.id, () => appeler('DELETE', `${base}/sections/${section.id}/fichiers/${p.id}`), true, `« ${p.nom} » retiré`)}
                        >
                          Retirer
                        </Bouton>
                        <Bouton onClick={() => setARetirer(undefined)}>Annuler</Bouton>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {ajout.etat}
        {ecrit && <div className="ajout-piece">{ajout.menu}</div>}
      </div>
      {boite && (
        <BoiteDialogue
          titre={`Réserver « ${boite.piece.nom} » au MJ ?`}
          texte={`Les joueurs ne le verront plus dans : ${boite.usages.map((u) => u.libelle).join(' ; ')}.`}
          action="Réserver au MJ"
          enCours={enCours === boite.piece.id}
          onConfirmer={() => void regler(boite.piece, 'mj')}
          onFermer={() => setBoite(undefined)}
        />
      )}
    </BlocUi>
  );
}

export default {
  id: 'pieces-jointes',
  roles: ['mj', 'joueur'],
  rang: 20,
  composant: BlocPiecesJointes,
} satisfies BlocSection;
