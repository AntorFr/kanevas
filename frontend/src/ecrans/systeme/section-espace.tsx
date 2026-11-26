import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useLimiteContenu } from '../../cadre-contexte';
import { ErreurApi, appeler, useConnexionPerdue } from '../../api';
import { Bouton, BoiteDialogue, EditeurMarkdown, Interrupteur, Markdown, refusServeur, useToasts } from '../../ui';
import type { SectionVue } from '../fiche/types';

const ECHEC = 'L’action n’a pas abouti. Réessayez.';

/**
 * One section of an element in the system's space (E-9): its text for everyone who reads it; for a GM of the system the
 * Markdown editor, the switch « Lue par les joueurs » and the removal. Never the universe's audience menu: the space has no table.
 */
export function SectionEspace({ base, section, ecrit, rafraichir }: {
  base: string;
  section: SectionVue;
  ecrit: boolean;
  rafraichir: () => Promise<void>;
}) {
  const url = `${base}/sections/${section.id}`;
  const perdue = useConnexionPerdue();
  const max = useLimiteContenu();
  const { toast } = useToasts();
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState('');
  const [version, setVersion] = useState(section.version);
  const [erreurTexte, setErreurTexte] = useState<string>();
  const [echec, setEchec] = useState<string>();
  const [enCours, setEnCours] = useState<string>();
  const [aRetirer, setARetirer] = useState(false);
  const lue = section.audience?.joueursLisent ?? false;

  async function agir(cle: string, action: () => Promise<void>) {
    if (enCours || perdue) return;
    setEnCours(cle);
    setEchec(undefined);
    try {
      await action();
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'section_modifiee') setEchec('La section a changé depuis que vous l’avez ouverte. Rechargez la page pour voir la nouvelle version.');
      else if (e instanceof ErreurApi && e.statut === 400 && cle === 'enregistrer') setErreurTexte(refusServeur(e.message));
      else setEchec(e instanceof ErreurApi && e.statut === 403 ? 'Vous ne pouvez plus modifier ce système.' : ECHEC);
    } finally {
      setEnCours(undefined);
    }
  }

  return (
    <section className="sec" id={`section-${section.id}`} aria-label={section.titre}>
      <div className="sec-tete">
        <h2>{section.titre}</h2>
      </div>
      {ecrit && !edition && (
        <div className="sec-actions">
          <Bouton variante="fantome" petit ecrit icone={Pencil} aria-label={`Modifier « ${section.titre} »`} onClick={() => {
            setTexte(section.contenu ?? '');
            setVersion(section.version);
            setErreurTexte(undefined);
            setEdition(true);
          }}>
            Modifier
          </Bouton>
          <Bouton variante="fantome" petit ecrit icone={Trash2} aria-label={`Retirer la section « ${section.titre} »`} onClick={() => setARetirer(true)}>
            Retirer
          </Bouton>
        </div>
      )}
      {echec && <div className="alerte" role="alert"><span>{echec}</span></div>}
      {edition ? (
        <EditeurMarkdown
          etiquette={`Contenu de « ${section.titre} »`}
          valeur={texte}
          onChange={(v) => { setTexte(v); setErreurTexte(undefined); }}
          max={max}
          rows={8}
          autoFocus
          erreur={erreurTexte}
          onEnregistrer={() => void enregistrer()}
          onAnnuler={() => setEdition(false)}
        >
          <Bouton onClick={() => setEdition(false)}>Annuler</Bouton>
          <Bouton variante="principal" ecrit enCours={enCours === 'enregistrer'} onClick={() => void enregistrer()}>Enregistrer</Bouton>
        </EditeurMarkdown>
      ) : section.html.trim() === '' ? (
        <p className="texte vide">Rien d’écrit pour l’instant.</p>
      ) : (
        <Markdown className="texte" html={section.html} />
      )}
      {ecrit && !edition && (
        <Interrupteur
          etiquette="Lue par les joueurs"
          coche={lue}
          ecrit
          disabled={Boolean(enCours)}
          onChange={(v) => void agir('audience', async () => {
            await appeler('PATCH', url, { joueursLisent: v });
            await rafraichir();
            toast(v ? `« ${section.titre} » : lue par les joueurs` : `« ${section.titre} » : fermée aux joueurs`);
          })}
        />
      )}
      {aRetirer && (
        <BoiteDialogue
          titre={`Retirer la section « ${section.titre} » ?`}
          texte="Son contenu sera perdu."
          action="Retirer la section"
          enCours={enCours === 'retrait'}
          onConfirmer={() => void agir('retrait', async () => {
            await appeler('DELETE', url);
            setARetirer(false);
            await rafraichir();
          })}
          onFermer={() => setARetirer(false)}
          reperage={() => document.querySelector<HTMLElement>('main h1')}
        />
      )}
    </section>
  );

  async function enregistrer() {
    if (max !== undefined && texte.length > max) return;
    await agir('enregistrer', async () => {
      await appeler('PUT', `${url}/contenu`, { contenu: texte, version });
      setEdition(false);
      await rafraichir();
      toast(`« ${section.titre} » enregistrée`);
    });
  }
}
