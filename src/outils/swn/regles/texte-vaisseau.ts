// Text version of a ship (V-6, AD-127): deterministic Markdown, no `:::` block, no link.
import type { NatureVaisseau, ResultatVaisseau } from './vaisseau.js'

const NBSP = '\u00A0'
const ORDRE: NatureVaisseau[] = ['moteurs', 'amenagements', 'defenses', 'armes', 'modifications']

function entier(n: number): string {
  const signe = n < 0 ? '−' : ''
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

const credits = (n: number): string => `${entier(n)}${NBSP}cr`

export function texteVaisseau(r: ResultatVaisseau): string {
  const jours = `${r.chantierJours} ${r.chantierJours < 2 ? 'jour' : 'jours'}`
  const portee = r.porteeSaut === null ? '—' : `${r.porteeSaut} ${r.porteeSaut < 2 ? 'case' : 'cases'}`
  const mesures: [string, string][] = [
    ['Prix', credits(r.prix)],
    ['PV', entier(r.pv)],
    ['CA', entier(r.ca)],
    ['Chantier', jours],
    ['Entretien', `${credits(r.entretien)} / an`],
    ['Portée de saut', portee],
    ['Puissance libre', entier(r.puissanceLibre)],
    ['Masse libre', entier(r.masseLibre)],
    ['Emports', `${r.emports.utilises} / ${r.emports.total}`],
  ]
  const choix = r.lignes
    .map((l, i) => ({ l, i }))
    .sort((a, b) => ORDRE.indexOf(a.l.nature) - ORDRE.indexOf(b.l.nature) || a.l.nom.localeCompare(b.l.nom, 'fr') || a.i - b.i)
    .map(({ l }) => `- ${l.quantite} × ${l.nom}`)

  const blocs = [
    `**${r.coque.nom}** — classe ${r.coque.classe}`,
    ['| Mesure | Valeur |', '|---|---|', ...mesures.map(([k, v]) => `| ${k} | ${v} |`)].join('\n'),
    ['**Choix**', ...choix].join('\n'),
  ]
  if (r.alertes.length > 0) {
    blocs.push(
      ['**Alertes**', ...r.alertes.map((a) => `- **${a.niveau === 'bloquante' ? 'Bloquante' : 'À surveiller'}** : ${a.texte}`)].join('\n'),
    )
  }
  return blocs.join('\n\n') + '\n'
}
