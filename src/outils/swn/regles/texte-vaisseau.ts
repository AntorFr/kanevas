// Text version of a ship (V-6, AD-127): deterministic Markdown, no `:::` block, no link.
import { texteMasse } from './masse.js'
import type { NatureVaisseau, ResultatVaisseau } from './vaisseau.js'

export const NBSP = '\u00A0'
const ORDRE: NatureVaisseau[] = ['moteurs', 'amenagements', 'defenses', 'armes', 'modifications']

export function entier(n: number): string {
  const signe = n < 0 ? '−' : ''
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

export const credits = (n: number): string => `${entier(n)}${NBSP}cr`

/** The rows of F-4, only when stated. */
function lignesRegles(r: ResultatVaisseau): [string, string][] {
  const rows: [string, number | null][] = [['Vitesse', r.vitesse ?? null], ['Armure', r.armure ?? null], ['Équipage', r.equipage?.choisi ?? null], ['Soutes', r.soutes ?? null]]
  return rows.flatMap(([k, n]): [string, string][] => n === null ? [] : [[k, entier(n)]])
}

/** The measures table of V-6; shared with the example sheets so the layout cannot drift. */
export function tableMesures(r: ResultatVaisseau, avecRegles = true): string {
  const jours = `${r.chantierJours} ${r.chantierJours < 2 ? 'jour' : 'jours'}`
  const portee = r.porteeSaut === null ? '—' : `${r.porteeSaut} ${r.porteeSaut < 2 ? 'case' : 'cases'}`
  const mesures: [string, string][] = [
    ['Prix', credits(r.prix)],
    ['PV', entier(r.pv)],
    ['CA', entier(r.ca)],
    ['Chantier', jours],
    ['Entretien', `${credits(r.entretien)} / an`],
    ['Portée de saut', portee],
    ...(avecRegles ? lignesRegles(r) : []),
    ['Puissance libre', entier(r.puissanceLibre)],
    ['Masse libre', texteMasse(r.masseLibre)],
    ['Emports', `${r.emports.utilises} / ${r.emports.total}`],
  ]
  return ['| Mesure | Valeur |', '|---|---|', ...mesures.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

/** The « Choix » list of V-6, ordered by nature then name. */
export function listeChoix(r: ResultatVaisseau): string {
  const choix = r.lignes
    .map((l, i) => ({ l, i }))
    .sort((a, b) => ORDRE.indexOf(a.l.nature) - ORDRE.indexOf(b.l.nature) || a.l.nom.localeCompare(b.l.nom, 'fr') || a.i - b.i)
    .map(({ l }) => {
      const vise = l.vise ? r.lignes.find((m) => m.nature === l.vise!.nature && m.cle === l.vise!.cle)?.nom ?? l.vise.cle : null
      return `- ${l.quantite} × ${l.nom}${l.magasins ? ` (+${l.magasins} ${l.magasins < 2 ? 'magasin' : 'magasins'})` : ''}`
        + (l.points ? ` (${l.points} ${l.points < 2 ? 'point' : 'points'})` : '')
        + (vise === null ? '' : ` (→ ${vise})`)
        + (l.cout === undefined ? '' : ` — ${credits(l.cout)}`)
    })
  return ['**Choix**', ...choix].join('\n')
}

export function texteVaisseau(r: ResultatVaisseau): string {
  const blocs = [`**${r.coque.nom}** — classe ${r.coque.classe}`, tableMesures(r), listeChoix(r)]
  if (r.alertes.length > 0) {
    blocs.push(
      ['**Alertes**', ...r.alertes.map((a) => `- **${a.niveau === 'bloquante' ? 'Bloquante' : 'À surveiller'}** : ${a.texte}`)].join('\n'),
    )
  }
  return blocs.join('\n\n') + '\n'
}
