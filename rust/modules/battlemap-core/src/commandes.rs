//! The closed list of commands (AD-battlemap-editeur-3). Each one is applied to a document and yields
//! its inverse as commands of the same list; a batch is applied whole or refused whole.
use crate::document::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Cellule {
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Segment {
    pub x: i32,
    pub y: i32,
    pub cote: Cote,
}

/// The content of a layer, carried by the inverse of `supprimer_calque`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct Contenu {
    #[serde(default)]
    pub sols: Vec<Sol>,
    #[serde(default)]
    pub murs: Vec<Mur>,
    #[serde(default)]
    pub elements: Vec<Element>,
}

fn vrai() -> bool {
    true
}
fn un() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Commande {
    PeindreSol { calque: String, cellules: Vec<Cellule>, asset_id: String },
    TracerMur { calque: String, segments: Vec<Segment>, asset_id: String },
    PoserPorte { calque: String, x: i32, y: i32, cote: Cote, porte: bool },
    PoserElement {
        id: String,
        calque: String,
        asset_id: String,
        x: f64,
        y: f64,
        #[serde(default)]
        rotation: u16,
        #[serde(default)]
        miroir: bool,
        #[serde(default = "un")]
        echelle: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fiche_id: Option<String>,
        /// Position in `elements` (an undo puts an element back where it was).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
    },
    DeplacerElement { id: String, x: f64, y: f64 },
    PivoterElement { id: String, rotation: u16 },
    SupprimerElement { id: String },
    Gommer {
        calque: String,
        #[serde(default)]
        cellules: Vec<Cellule>,
        #[serde(default)]
        segments: Vec<Segment>,
    },
    /// An absent (or null) `fiche_id` unlinks the element.
    LierFiche { id: String, #[serde(default)] fiche_id: Option<String> },
    CreerCalque {
        id: String,
        nom: String,
        genre: TypeCalque,
        #[serde(default)]
        mj_seul: bool,
        #[serde(default = "vrai")]
        visible: bool,
        #[serde(default)]
        verrouille: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        contenu: Option<Contenu>,
    },
    RenommerCalque { id: String, nom: String },
    ReglerCalque {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        visible: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        verrouille: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mj_seul: Option<bool>,
    },
    OrdonnerCalque { id: String, index: usize },
    SupprimerCalque { id: String },
    Redimensionner { largeur: u32, hauteur: u32 },
    /// Absent `miroir`: toggles.
    RetournerElement {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        miroir: Option<bool>,
    },
    MettreAEchelle { id: String, echelle: f64 },
    DupliquerElements {
        ids: Vec<String>,
        nouveaux_ids: Vec<String>,
        #[serde(default)]
        dx: f64,
        #[serde(default)]
        dy: f64,
    },
}

type R<T> = Result<T, Erreur>;

fn err<T>(code: &'static str) -> R<T> {
    Err(Erreur::new(code))
}

fn grouper<T>(valeurs: Vec<(T, Option<String>)>) -> Vec<(Option<String>, Vec<T>)> {
    let mut groupes: Vec<(Option<String>, Vec<T>)> = vec![];
    for (v, a) in valeurs {
        match groupes.iter_mut().find(|(g, _)| *g == a) {
            Some((_, l)) => l.push(v),
            None => groupes.push((a, vec![v])),
        }
    }
    groupes
}

fn calque_de_type(doc: &Document, id: &str, genre: TypeCalque) -> R<()> {
    match doc.calques.iter().find(|c| c.id == id) {
        None => err("calque_inconnu"),
        Some(c) if c.genre != genre => err("calque_incompatible"),
        Some(_) => Ok(()),
    }
}

fn element_index(doc: &Document, id: &str) -> R<usize> {
    doc.elements.iter().position(|e| e.id == id).ok_or(Erreur::new("element_inconnu"))
}

fn calque_index(doc: &Document, id: &str) -> R<usize> {
    doc.rang(id).ok_or(Erreur::new("calque_inconnu"))
}

fn poser_commande(e: &Element, index: Option<usize>) -> Commande {
    Commande::PoserElement {
        id: e.id.clone(),
        calque: e.calque.clone(),
        asset_id: e.asset_id.clone(),
        x: e.x,
        y: e.y,
        rotation: e.rotation,
        miroir: e.miroir,
        echelle: e.echelle,
        fiche_id: e.fiche_id.clone(),
        index,
    }
}

fn verifier_element(doc: &Document, e: &Element) -> R<()> {
    if !id_valide(&e.id) || e.asset_id.is_empty() || e.fiche_id.as_deref() == Some("") {
        return err("commande_invalide");
    }
    calque_de_type(doc, &e.calque, TypeCalque::Objet)?;
    if !doc.position_valide(e.x, e.y) {
        return err("position_invalide");
    }
    if !rotation_valide(e.rotation) {
        return err("rotation_invalide");
    }
    if !echelle_valide(e.echelle) {
        return err("echelle_invalide");
    }
    Ok(())
}

fn inserer_element(doc: &mut Document, e: Element, index: Option<usize>) -> R<()> {
    if doc.elements.iter().any(|x| x.id == e.id) {
        return err("id_existant");
    }
    if doc.elements.len() >= ELEMENTS_MAX {
        return err("carte_pleine");
    }
    verifier_element(doc, &e)?;
    match index {
        Some(i) if i <= doc.elements.len() => doc.elements.insert(i, e),
        Some(_) => return err("position_invalide"),
        None => doc.elements.push(e),
    }
    Ok(())
}

/// Applies one command; returns the commands that undo it, in the order to apply them.
pub fn appliquer(doc: &mut Document, c: &Commande) -> R<Vec<Commande>> {
    let inverses = appliquer_brut(doc, c)?;
    doc.normaliser();
    Ok(inverses)
}

fn appliquer_brut(doc: &mut Document, c: &Commande) -> R<Vec<Commande>> {
    match c {
        Commande::PeindreSol { calque, cellules, asset_id } => {
            calque_de_type(doc, calque, TypeCalque::Sol)?;
            if asset_id.is_empty() {
                return err("commande_invalide");
            }
            if cellules.iter().any(|c| !doc.cellule_valide(c.x, c.y)) {
                return err("position_invalide");
            }
            let mut index: HashMap<(i32, i32), usize> = HashMap::new();
            for (i, s) in doc.sols.iter().enumerate() {
                if &s.calque == calque {
                    index.insert((s.x, s.y), i);
                }
            }
            let mut avant: Vec<(Cellule, Option<String>)> = vec![];
            let mut touchees = HashSet::new();
            for c in cellules {
                if !touchees.insert((c.x, c.y)) {
                    continue;
                }
                match index.get(&(c.x, c.y)) {
                    Some(&i) => {
                        if doc.sols[i].asset_id != *asset_id {
                            avant.push((*c, Some(std::mem::replace(&mut doc.sols[i].asset_id, asset_id.clone()))));
                        }
                    }
                    None => {
                        avant.push((*c, None));
                        doc.sols.push(Sol { calque: calque.clone(), x: c.x, y: c.y, asset_id: asset_id.clone() });
                    }
                }
            }
            Ok(grouper(avant)
                .into_iter()
                .map(|(a, l)| match a {
                    Some(a) => Commande::PeindreSol { calque: calque.clone(), cellules: l, asset_id: a },
                    None => Commande::Gommer { calque: calque.clone(), cellules: l, segments: vec![] },
                })
                .collect())
        }
        Commande::TracerMur { calque, segments, asset_id } => {
            calque_de_type(doc, calque, TypeCalque::Mur)?;
            if asset_id.is_empty() {
                return err("commande_invalide");
            }
            if segments.iter().any(|s| !doc.segment_valide(s.x, s.y, s.cote)) {
                return err("position_invalide");
            }
            let mut index: HashMap<(i32, i32, Cote), usize> = HashMap::new();
            for (i, m) in doc.murs.iter().enumerate() {
                if &m.calque == calque {
                    index.insert((m.x, m.y, m.cote), i);
                }
            }
            let mut avant: Vec<(Segment, Option<String>)> = vec![];
            let mut touches = HashSet::new();
            for s in segments {
                if !touches.insert((s.x, s.y, s.cote)) {
                    continue;
                }
                match index.get(&(s.x, s.y, s.cote)) {
                    Some(&i) => {
                        if doc.murs[i].asset_id != *asset_id {
                            avant.push((*s, Some(std::mem::replace(&mut doc.murs[i].asset_id, asset_id.clone()))));
                        }
                    }
                    None => {
                        avant.push((*s, None));
                        doc.murs.push(Mur {
                            calque: calque.clone(),
                            x: s.x,
                            y: s.y,
                            cote: s.cote,
                            asset_id: asset_id.clone(),
                            porte: false,
                        });
                    }
                }
            }
            Ok(grouper(avant)
                .into_iter()
                .map(|(a, l)| match a {
                    Some(a) => Commande::TracerMur { calque: calque.clone(), segments: l, asset_id: a },
                    None => Commande::Gommer { calque: calque.clone(), cellules: vec![], segments: l },
                })
                .collect())
        }
        Commande::PoserPorte { calque, x, y, cote, porte } => {
            calque_de_type(doc, calque, TypeCalque::Mur)?;
            let m = doc
                .murs
                .iter_mut()
                .find(|m| &m.calque == calque && m.x == *x && m.y == *y && m.cote == *cote)
                .ok_or(Erreur::new("mur_inconnu"))?;
            let avant = std::mem::replace(&mut m.porte, *porte);
            Ok(vec![Commande::PoserPorte { calque: calque.clone(), x: *x, y: *y, cote: *cote, porte: avant }])
        }
        Commande::Gommer { calque, cellules, segments } => {
            let genre = doc.calques.iter().find(|c| &c.id == calque).map(|c| c.genre).ok_or(Erreur::new("calque_inconnu"))?;
            if (!cellules.is_empty() && genre != TypeCalque::Sol) || (!segments.is_empty() && genre != TypeCalque::Mur) {
                return err("calque_incompatible");
            }
            if cellules.iter().any(|c| !doc.cellule_valide(c.x, c.y))
                || segments.iter().any(|s| !doc.segment_valide(s.x, s.y, s.cote))
            {
                return err("position_invalide");
            }
            let a_effacer: HashSet<(i32, i32)> = cellules.iter().map(|c| (c.x, c.y)).collect();
            let mut sols_ote: Vec<(Cellule, Option<String>)> = vec![];
            doc.sols.retain(|s| {
                if &s.calque == calque && a_effacer.contains(&(s.x, s.y)) {
                    sols_ote.push((Cellule { x: s.x, y: s.y }, Some(s.asset_id.clone())));
                    false
                } else {
                    true
                }
            });
            let a_effacer: HashSet<(i32, i32, Cote)> = segments.iter().map(|s| (s.x, s.y, s.cote)).collect();
            let mut murs_ote: Vec<(Segment, Option<String>)> = vec![];
            let mut portes: Vec<Segment> = vec![];
            doc.murs.retain(|m| {
                if &m.calque == calque && a_effacer.contains(&(m.x, m.y, m.cote)) {
                    let s = Segment { x: m.x, y: m.y, cote: m.cote };
                    murs_ote.push((s, Some(m.asset_id.clone())));
                    if m.porte {
                        portes.push(s);
                    }
                    false
                } else {
                    true
                }
            });
            let mut inv: Vec<Commande> = grouper(sols_ote)
                .into_iter()
                .map(|(a, l)| Commande::PeindreSol { calque: calque.clone(), cellules: l, asset_id: a.unwrap_or_default() })
                .collect();
            inv.extend(grouper(murs_ote).into_iter().map(|(a, l)| Commande::TracerMur {
                calque: calque.clone(),
                segments: l,
                asset_id: a.unwrap_or_default(),
            }));
            inv.extend(portes.into_iter().map(|s| Commande::PoserPorte {
                calque: calque.clone(),
                x: s.x,
                y: s.y,
                cote: s.cote,
                porte: true,
            }));
            Ok(inv)
        }
        Commande::PoserElement { id, calque, asset_id, x, y, rotation, miroir, echelle, fiche_id, index } => {
            let e = Element {
                id: id.clone(),
                calque: calque.clone(),
                asset_id: asset_id.clone(),
                x: *x,
                y: *y,
                rotation: *rotation,
                miroir: *miroir,
                echelle: *echelle,
                fiche_id: fiche_id.clone(),
            };
            inserer_element(doc, e, *index)?;
            Ok(vec![Commande::SupprimerElement { id: id.clone() }])
        }
        Commande::SupprimerElement { id } => {
            let i = element_index(doc, id)?;
            let e = doc.elements.remove(i);
            Ok(vec![poser_commande(&e, Some(i))])
        }
        Commande::DeplacerElement { id, x, y } => {
            let i = element_index(doc, id)?;
            if !doc.position_valide(*x, *y) {
                return err("position_invalide");
            }
            let e = &mut doc.elements[i];
            let (ax, ay) = (e.x, e.y);
            e.x = *x;
            e.y = *y;
            Ok(vec![Commande::DeplacerElement { id: id.clone(), x: ax, y: ay }])
        }
        Commande::PivoterElement { id, rotation } => {
            let i = element_index(doc, id)?;
            if !rotation_valide(*rotation) {
                return err("rotation_invalide");
            }
            let avant = std::mem::replace(&mut doc.elements[i].rotation, *rotation);
            Ok(vec![Commande::PivoterElement { id: id.clone(), rotation: avant }])
        }
        Commande::RetournerElement { id, miroir } => {
            let i = element_index(doc, id)?;
            let e = &mut doc.elements[i];
            let avant = e.miroir;
            e.miroir = miroir.unwrap_or(!avant);
            Ok(vec![Commande::RetournerElement { id: id.clone(), miroir: Some(avant) }])
        }
        Commande::MettreAEchelle { id, echelle } => {
            let i = element_index(doc, id)?;
            if !echelle_valide(*echelle) {
                return err("echelle_invalide");
            }
            let avant = std::mem::replace(&mut doc.elements[i].echelle, *echelle);
            Ok(vec![Commande::MettreAEchelle { id: id.clone(), echelle: avant }])
        }
        Commande::LierFiche { id, fiche_id } => {
            let i = element_index(doc, id)?;
            if fiche_id.as_deref() == Some("") {
                return err("commande_invalide");
            }
            let avant = std::mem::replace(&mut doc.elements[i].fiche_id, fiche_id.clone());
            Ok(vec![Commande::LierFiche { id: id.clone(), fiche_id: avant }])
        }
        Commande::DupliquerElements { ids, nouveaux_ids, dx, dy } => {
            if ids.len() != nouveaux_ids.len() || ids.is_empty() || !dx.is_finite() || !dy.is_finite() {
                return err("commande_invalide");
            }
            let sources: Vec<Element> =
                ids.iter().map(|id| element_index(doc, id).map(|i| doc.elements[i].clone())).collect::<R<_>>()?;
            for (s, nid) in sources.iter().zip(nouveaux_ids) {
                let mut copie = s.clone();
                copie.id = nid.clone();
                copie.x += dx;
                copie.y += dy;
                inserer_element(doc, copie, None)?;
            }
            Ok(nouveaux_ids.iter().rev().map(|id| Commande::SupprimerElement { id: id.clone() }).collect())
        }
        Commande::CreerCalque { id, nom, genre, mj_seul, visible, verrouille, index, contenu } => {
            if !id_valide(id) || !nom_valide(nom) {
                return err("commande_invalide");
            }
            if doc.rang(id).is_some() {
                return err("id_existant");
            }
            if doc.calques.len() >= CALQUES_MAX {
                return err("carte_pleine");
            }
            let i = match index {
                Some(i) if *i <= doc.calques.len() => *i,
                Some(_) => return err("position_invalide"),
                None => doc.calques.len(),
            };
            doc.calques.insert(
                i,
                Calque { id: id.clone(), nom: nom.clone(), genre: *genre, visible: *visible, verrouille: *verrouille, mj_seul: *mj_seul },
            );
            if let Some(contenu) = contenu {
                if contenu.sols.iter().any(|s| &s.calque != id || s.asset_id.is_empty())
                    || contenu.murs.iter().any(|m| &m.calque != id || m.asset_id.is_empty())
                    || contenu.elements.iter().any(|e| &e.calque != id)
                {
                    return err("commande_invalide");
                }
                if (!contenu.sols.is_empty() && *genre != TypeCalque::Sol)
                    || (!contenu.murs.is_empty() && *genre != TypeCalque::Mur)
                    || (!contenu.elements.is_empty() && *genre != TypeCalque::Objet)
                {
                    return err("calque_incompatible");
                }
                if contenu.sols.iter().any(|s| !doc.cellule_valide(s.x, s.y))
                    || contenu.murs.iter().any(|m| !doc.segment_valide(m.x, m.y, m.cote))
                {
                    return err("position_invalide");
                }
                let n_sols: HashSet<_> = contenu.sols.iter().map(|s| (s.x, s.y)).collect();
                let n_murs: HashSet<_> = contenu.murs.iter().map(|m| (m.x, m.y, m.cote)).collect();
                if n_sols.len() != contenu.sols.len() || n_murs.len() != contenu.murs.len() {
                    return err("commande_invalide");
                }
                doc.sols.extend(contenu.sols.iter().cloned());
                doc.murs.extend(contenu.murs.iter().cloned());
                for e in &contenu.elements {
                    inserer_element(doc, e.clone(), None)?;
                }
            }
            Ok(vec![Commande::SupprimerCalque { id: id.clone() }])
        }
        Commande::SupprimerCalque { id } => {
            let i = calque_index(doc, id)?;
            let c = doc.calques.remove(i);
            let (mut sols, mut murs, mut elements) = (vec![], vec![], vec![]);
            doc.sols.retain(|s| if &s.calque == id { sols.push(s.clone()); false } else { true });
            doc.murs.retain(|m| if &m.calque == id { murs.push(m.clone()); false } else { true });
            doc.elements.retain(|e| if &e.calque == id { elements.push(e.clone()); false } else { true });
            let contenu = if sols.is_empty() && murs.is_empty() && elements.is_empty() {
                None
            } else {
                Some(Contenu { sols, murs, elements })
            };
            Ok(vec![Commande::CreerCalque {
                id: c.id,
                nom: c.nom,
                genre: c.genre,
                mj_seul: c.mj_seul,
                visible: c.visible,
                verrouille: c.verrouille,
                index: Some(i),
                contenu,
            }])
        }
        Commande::RenommerCalque { id, nom } => {
            let i = calque_index(doc, id)?;
            if !nom_valide(nom) {
                return err("nom_invalide");
            }
            let avant = std::mem::replace(&mut doc.calques[i].nom, nom.clone());
            Ok(vec![Commande::RenommerCalque { id: id.clone(), nom: avant }])
        }
        Commande::ReglerCalque { id, visible, verrouille, mj_seul } => {
            let i = calque_index(doc, id)?;
            let c = &mut doc.calques[i];
            let inv = Commande::ReglerCalque {
                id: id.clone(),
                visible: visible.map(|_| c.visible),
                verrouille: verrouille.map(|_| c.verrouille),
                mj_seul: mj_seul.map(|_| c.mj_seul),
            };
            if let Some(v) = visible {
                c.visible = *v;
            }
            if let Some(v) = verrouille {
                c.verrouille = *v;
            }
            if let Some(v) = mj_seul {
                c.mj_seul = *v;
            }
            Ok(vec![inv])
        }
        Commande::OrdonnerCalque { id, index } => {
            let i = calque_index(doc, id)?;
            if *index >= doc.calques.len() {
                return err("position_invalide");
            }
            let c = doc.calques.remove(i);
            doc.calques.insert(*index, c);
            Ok(vec![Commande::OrdonnerCalque { id: id.clone(), index: i }])
        }
        Commande::Redimensionner { largeur, hauteur } => {
            if !(1..=LARGEUR_MAX).contains(largeur) || !(1..=HAUTEUR_MAX).contains(hauteur) {
                return Err(Erreur::champ("limite_depassee", "taille"));
            }
            let (l, h) = (*largeur as i64, *hauteur as i64);
            let dehors = doc.sols.iter().any(|s| i64::from(s.x) >= l || i64::from(s.y) >= h)
                || doc.murs.iter().any(|m| match m.cote {
                    Cote::H => i64::from(m.x) >= l || i64::from(m.y) > h,
                    Cote::V => i64::from(m.x) > l || i64::from(m.y) >= h,
                })
                || doc.elements.iter().any(|e| e.x > l as f64 || e.y > h as f64);
            if dehors {
                return Err(Erreur::champ("limite_depassee", "taille"));
            }
            let inv = Commande::Redimensionner { largeur: doc.largeur, hauteur: doc.hauteur };
            doc.largeur = *largeur;
            doc.hauteur = *hauteur;
            Ok(vec![inv])
        }
    }
}

/// Applies a batch whole or not at all. On success: the new document and the batch that undoes it
/// (the inverses in reverse order); on refusal: the error, with the index of the command at fault.
pub fn appliquer_lot(doc: &Document, lot: &[Commande]) -> Result<(Document, Vec<Commande>), Erreur> {
    let mut courant = doc.clone();
    let mut inverses: Vec<Vec<Commande>> = vec![];
    for (i, c) in lot.iter().enumerate() {
        match appliquer(&mut courant, c) {
            Ok(inv) => inverses.push(inv),
            Err(mut e) => {
                e.index = Some(i);
                return Err(e);
            }
        }
    }
    if courant.octets() > DOCUMENT_OCTETS_MAX {
        return Err(Erreur::new("carte_pleine"));
    }
    Ok((courant, inverses.into_iter().rev().flatten().collect()))
}
