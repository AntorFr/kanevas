//! The map document (AD-154): one versioned JSON value, layers / floors / walls / elements.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// AD-163 — the only place these numbers exist (AD-battlemap-editeur-9).
pub const LARGEUR_MAX: u32 = 200;
pub const HAUTEUR_MAX: u32 = 200;
pub const ELEMENTS_MAX: usize = 5000;
pub const CALQUES_MAX: usize = 20;
pub const DOCUMENT_OCTETS_MAX: usize = 2 * 1024 * 1024;
pub const ECHELLE_MIN: f64 = 0.25;
pub const ECHELLE_MAX: f64 = 4.0;
pub const NOM_MAX: usize = 80;
pub const ID_MAX: usize = 100;
pub const SCHEMA: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TypeCalque {
    Sol,
    Mur,
    Objet,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Cote {
    /// Top edge of the cell (x, y).
    #[serde(rename = "h")]
    H,
    /// Left edge of the cell (x, y).
    #[serde(rename = "v")]
    V,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Calque {
    pub id: String,
    pub nom: String,
    #[serde(rename = "type")]
    pub genre: TypeCalque,
    pub visible: bool,
    pub verrouille: bool,
    pub mj_seul: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Sol {
    pub calque: String,
    pub x: i32,
    pub y: i32,
    pub asset_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Mur {
    pub calque: String,
    pub x: i32,
    pub y: i32,
    pub cote: Cote,
    pub asset_id: String,
    #[serde(default)]
    pub porte: bool,
}

fn un() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Element {
    pub id: String,
    pub calque: String,
    pub asset_id: String,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub rotation: u16,
    #[serde(default)]
    pub miroir: bool,
    #[serde(default = "un")]
    pub echelle: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fiche_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Document {
    #[serde(default = "schema")]
    pub schema: u32,
    pub largeur: u32,
    pub hauteur: u32,
    #[serde(default)]
    pub calques: Vec<Calque>,
    #[serde(default)]
    pub sols: Vec<Sol>,
    #[serde(default)]
    pub murs: Vec<Mur>,
    #[serde(default)]
    pub elements: Vec<Element>,
}

fn schema() -> u32 {
    SCHEMA
}

/// A refusal: a fixed code, the field concerned when the route needs it, the command index in a batch.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Erreur {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub champ: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<usize>,
}

impl Erreur {
    pub fn new(code: &'static str) -> Self {
        Erreur { code, champ: None, index: None }
    }
    pub fn champ(code: &'static str, champ: &'static str) -> Self {
        Erreur { code, champ: Some(champ), index: None }
    }
}

pub fn id_valide(id: &str) -> bool {
    !id.trim().is_empty() && id.chars().count() <= ID_MAX
}

pub fn nom_valide(nom: &str) -> bool {
    !nom.trim().is_empty() && nom.chars().count() <= NOM_MAX
}

pub fn echelle_valide(e: f64) -> bool {
    e.is_finite() && (ECHELLE_MIN..=ECHELLE_MAX).contains(&e)
}

pub fn rotation_valide(r: u16) -> bool {
    matches!(r, 0 | 90 | 180 | 270)
}

impl Document {
    /// The initial document of a new map (AD-battlemap-editeur-3): three layers, none GM-only, no content.
    pub fn vide(largeur: u32, hauteur: u32) -> Result<Document, Erreur> {
        if !(1..=LARGEUR_MAX).contains(&largeur) || !(1..=HAUTEUR_MAX).contains(&hauteur) {
            return Err(Erreur::champ("limite_depassee", "taille"));
        }
        let calque = |id: &str, nom: &str, genre| Calque {
            id: id.into(),
            nom: nom.into(),
            genre,
            visible: true,
            verrouille: false,
            mj_seul: false,
        };
        Ok(Document {
            schema: SCHEMA,
            largeur,
            hauteur,
            calques: vec![
                calque("sol", "Sol", TypeCalque::Sol),
                calque("murs", "Murs", TypeCalque::Mur),
                calque("objets", "Objets", TypeCalque::Objet),
            ],
            sols: vec![],
            murs: vec![],
            elements: vec![],
        })
    }

    pub fn rang(&self, calque: &str) -> Option<usize> {
        self.calques.iter().position(|c| c.id == calque)
    }

    pub fn position_valide(&self, x: f64, y: f64) -> bool {
        x.is_finite() && y.is_finite() && x >= 0.0 && y >= 0.0 && x <= f64::from(self.largeur) && y <= f64::from(self.hauteur)
    }

    pub fn cellule_valide(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && (x as u32) < self.largeur && (y as u32) < self.hauteur
    }

    /// A wall lies on a cell edge: the grid has `largeur + 1` vertical and `hauteur + 1` horizontal lines.
    pub fn segment_valide(&self, x: i32, y: i32, cote: Cote) -> bool {
        if x < 0 || y < 0 {
            return false;
        }
        let (x, y) = (x as u32, y as u32);
        match cote {
            Cote::H => x < self.largeur && y <= self.hauteur,
            Cote::V => x <= self.largeur && y < self.hauteur,
        }
    }

    /// Canonical order: content follows the layer order, so a restored layer gives back the exact document.
    pub fn normaliser(&mut self) {
        let rang: std::collections::HashMap<&str, usize> =
            self.calques.iter().enumerate().map(|(i, c)| (c.id.as_str(), i)).collect();
        let r = |c: &str| rang.get(c).copied().unwrap_or(usize::MAX);
        self.sols.sort_by_key(|s| (r(&s.calque), s.y, s.x));
        self.murs.sort_by_key(|m| (r(&m.calque), m.y, m.x, m.cote));
        self.elements.sort_by_key(|e| r(&e.calque)); // stable: z-order inside a layer stays
    }

    /// Structural check of a stored document (what the server runs before trusting it).
    pub fn valider(&self) -> Result<(), Erreur> {
        let invalide = || Erreur::new("document_invalide");
        if self.schema != SCHEMA {
            return Err(invalide());
        }
        if !(1..=LARGEUR_MAX).contains(&self.largeur) || !(1..=HAUTEUR_MAX).contains(&self.hauteur) {
            return Err(Erreur::champ("limite_depassee", "taille"));
        }
        if self.calques.len() > CALQUES_MAX || self.elements.len() > ELEMENTS_MAX {
            return Err(Erreur::new("carte_pleine"));
        }
        let mut ids = HashSet::new();
        for c in &self.calques {
            if !id_valide(&c.id) || !nom_valide(&c.nom) || !ids.insert(c.id.as_str()) {
                return Err(invalide());
            }
        }
        let genre = |id: &str| self.calques.iter().find(|c| c.id == id).map(|c| c.genre);
        let mut cases = HashSet::new();
        for s in &self.sols {
            if genre(&s.calque) != Some(TypeCalque::Sol)
                || !self.cellule_valide(s.x, s.y)
                || s.asset_id.is_empty()
                || !cases.insert((&s.calque, s.x, s.y))
            {
                return Err(invalide());
            }
        }
        let mut aretes = HashSet::new();
        for m in &self.murs {
            if genre(&m.calque) != Some(TypeCalque::Mur)
                || !self.segment_valide(m.x, m.y, m.cote)
                || m.asset_id.is_empty()
                || !aretes.insert((&m.calque, m.x, m.y, m.cote))
            {
                return Err(invalide());
            }
        }
        let mut eids = HashSet::new();
        for e in &self.elements {
            if genre(&e.calque) != Some(TypeCalque::Objet)
                || !id_valide(&e.id)
                || !eids.insert(e.id.as_str())
                || e.asset_id.is_empty()
                || !self.position_valide(e.x, e.y)
                || !rotation_valide(e.rotation)
                || !echelle_valide(e.echelle)
                || e.fiche_id.as_deref() == Some("")
            {
                return Err(invalide());
            }
        }
        Ok(())
    }

    pub fn octets(&self) -> usize {
        serde_json::to_vec(self).map(|v| v.len()).unwrap_or(usize::MAX)
    }
}
