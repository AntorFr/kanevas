import { Paperclip } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { envoyerFichier } from '../../api';
import { referenceFichier, useToasts, type ApiEditeurFichier } from '../../ui';
import type { Fichier } from '../mediatheque/commun';
import { useAjoutFichier } from './fichiers';

interface Props {
  api: ApiEditeurFichier;
  universId: string;
  sectionId: number;
  /** `?mode=joueur` or ''. */
  suffixeMode: string;
  /** The effective role is GM: a file may be added inside a GM block. */
  mj: boolean;
  /** A file entered the text: the screen keeps what it knows of its visibility (B-55). */
  surFichier: (fichier: Fichier) => void;
}

/**
 * « Fichier » (`paperclip`) of the editor's toolbar (B-44, B-55): from the device the file enters the library
 * (its visibility follows the place of the caret) and an image or a link is put in the text; from the library
 * the same reference is put, the file untouched.
 */
export function OutilFichier({ api, universId, sectionId, suffixeMode, mj, surFichier }: Props) {
  const { toast } = useToasts();
  const poser = (f: Fichier) => {
    surFichier(f);
    api.inserer(referenceFichier(f.nom, f.id, f.image));
  };
  const ajout = useAjoutFichier<Fichier>({
    universId,
    suffixeMode,
    peutAjouter: true,
    mj,
    etiquette: 'Fichier',
    icone: Paperclip,
    envoyer: (fichier, progres) =>
      envoyerFichier<Fichier>(`/api/univers/${universId}/fichiers`, fichier, progres, 'POST', {
        section: String(sectionId),
        maniere: 'texte',
        blocMj: mj && api.dansBlocMJ() ? 'true' : 'false',
      }),
    apres: async (f) => {
      poser(f);
      toast(`« ${f.nom} » ajouté`);
    },
    choisir: async (f) => poser(f),
  });
  useEffect(() => {
    api.depot.current = ajout.deposer;
    return () => {
      api.depot.current = null;
    };
  });
  return (
    <>
      {ajout.menu}
      {api.sous && createPortal(ajout.etat, api.sous)}
    </>
  );
}
