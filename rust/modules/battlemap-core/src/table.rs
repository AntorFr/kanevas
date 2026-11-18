//! The table (AD-battlemap-table-1 to 4, 7): the state of a map played at the table, its closed list of
//! commands (a batch is applied whole or refused whole), the player view and the resize of the state.
//! Pure functions over values: the caller gives the footprints of the assets and the readable sheets.
use crate::document::{Cote, Document, Erreur, ID_MAX, LARGEUR_MAX, HAUTEUR_MAX};
use crate::filtre::{self, Contexte};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// AD-163: tokens per table.
pub const PIONS_MAX: usize = 200;
/// AD-battlemap-table-3: commands per batch.
pub const LOT_MAX: usize = 500;
pub const PION_ID_MAX: usize = 20;
pub const PION_NOM_MAX: usize = 40;
pub const SCHEMA_TABLE: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub l: i32,
    pub h: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Pion {
    pub id: String,
    pub nom: String,
    #[serde(default)]
    pub asset_id: Option<String>,
    #[serde(default)]
    pub fiche_id: Option<String>,
    pub x: i32,
    pub y: i32,
    pub visible: bool,
}

/// The state of a table. `brouillard` is the **revealed** bitmap: one bit per cell, row-major from the
/// top-left, bit `i` is bit `i % 8` (least significant first) of byte `i / 8`, standard base64 with padding.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Etat {
    #[serde(default = "schema")]
    pub schema: u32,
    #[serde(default)]
    pub pions: Vec<Pion>,
    pub brouillard: String,
    #[serde(default)]
    pub vue: Option<Rect>,
    #[serde(default)]
    pub calques_masques: Vec<String>,
}

fn schema() -> u32 {
    SCHEMA_TABLE
}

/// One context object serves the commands, the view and the resize (unknown keys are ignored). What the caller knows and the core does not: footprints in cells of the assets (`[largeur, hauteur]`,
/// absent = 1 × 1, which is also a disc or a sheet without asset) and who plays the command.
#[derive(Deserialize, Debug, Default)]
pub struct ContexteTable {
    #[serde(default)]
    pub empreintes: HashMap<String, [u32; 2]>,
    /// `"mj"` (default) or `"joueur"`: a player's command is always refused in this slice.
    #[serde(default)]
    pub acteur: Option<String>,
}

/// The player view context: the filter of AD-156 plus the footprints.
#[derive(Deserialize, Debug, Default)]
pub struct ContexteVue {
    #[serde(default)]
    pub assets_mj_seul: Vec<String>,
    #[serde(default)]
    pub assets_retires: Vec<String>,
    #[serde(default)]
    pub fiches_lisibles: Vec<String>,
    #[serde(default)]
    pub empreintes: HashMap<String, [u32; 2]>,
}

fn double_option<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommandeTable {
    AjouterPion {
        id: String,
        nom: String,
        #[serde(default)]
        asset_id: Option<String>,
        #[serde(default)]
        fiche_id: Option<String>,
        x: i32,
        y: i32,
        #[serde(default = "vrai")]
        visible: bool,
    },
    DeplacerPion { id: String, x: i32, y: i32 },
    /// An absent `asset_id` / `fiche_id` leaves it; `null` clears it.
    ReglerPion {
        id: String,
        #[serde(default)]
        nom: Option<String>,
        #[serde(default)]
        visible: Option<bool>,
        #[serde(default, deserialize_with = "double_option")]
        fiche_id: Option<Option<String>>,
        #[serde(default, deserialize_with = "double_option")]
        asset_id: Option<Option<String>>,
    },
    RetirerPion { id: String },
    RevelerRect { x: i32, y: i32, l: i32, h: i32 },
    MasquerRect { x: i32, y: i32, l: i32, h: i32 },
    RevelerPiece { x: i32, y: i32 },
    MasquerPiece { x: i32, y: i32 },
    PartagerVue { #[serde(default)] vue: Option<Rect> },
    ReglerCalqueJoueurs { calque: String, montre: bool },
    Reinitialiser,
}

fn vrai() -> bool {
    true
}

type R<T> = Result<T, Erreur>;

fn err<T>(code: &'static str) -> R<T> {
    Err(Erreur::new(code))
}

// ---- the bitmap -------------------------------------------------------------------------------------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn encoder(octets: &[u8]) -> String {
    let mut s = String::with_capacity(octets.len().div_ceil(3) * 4);
    for bloc in octets.chunks(3) {
        let n = (u32::from(bloc[0]) << 16) | (u32::from(*bloc.get(1).unwrap_or(&0)) << 8) | u32::from(*bloc.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= bloc.len() {
                s.push(B64[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

fn decoder(texte: &str) -> Option<Vec<u8>> {
    let b = texte.as_bytes();
    if b.len() % 4 != 0 {
        return None;
    }
    let mut sortie = Vec::with_capacity(b.len() / 4 * 3);
    for (k, bloc) in b.chunks(4).enumerate() {
        let dernier = k == b.len() / 4 - 1;
        let rembourrage = bloc.iter().rev().take_while(|c| **c == b'=').count();
        if rembourrage > 2 || (rembourrage > 0 && !dernier) {
            return None;
        }
        let mut n = 0u32;
        for c in &bloc[..4 - rembourrage] {
            n = (n << 6) | B64.iter().position(|x| x == c)? as u32;
        }
        n <<= 6 * rembourrage as u32;
        let tous = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        sortie.extend_from_slice(&tous[..3 - rembourrage]);
    }
    Some(sortie)
}

/// A revealed-cells grid, decoded.
#[derive(Clone, Debug, PartialEq)]
struct Grille {
    l: u32,
    h: u32,
    bits: Vec<u8>,
}

impl Grille {
    fn vide(l: u32, h: u32) -> Grille {
        Grille { l, h, bits: vec![0; (l as usize * h as usize).div_ceil(8)] }
    }
    fn decoder(texte: &str, l: u32, h: u32) -> R<Grille> {
        let bits = decoder(texte).ok_or(Erreur::new("etat_invalide"))?;
        let n = l as usize * h as usize;
        if bits.len() != n.div_ceil(8) {
            return err("etat_invalide");
        }
        // Padding bits stay zero: one text per bitmap.
        if n % 8 != 0 && bits.last().is_some_and(|d| d >> (n % 8) != 0) {
            return err("etat_invalide");
        }
        Ok(Grille { l, h, bits })
    }
    fn encoder(&self) -> String {
        encoder(&self.bits)
    }
    fn dedans(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && (x as u32) < self.l && (y as u32) < self.h
    }
    fn get(&self, x: i32, y: i32) -> bool {
        if !self.dedans(x, y) {
            return false;
        }
        let i = y as usize * self.l as usize + x as usize;
        self.bits[i / 8] >> (i % 8) & 1 == 1
    }
    fn set(&mut self, x: i32, y: i32, v: bool) {
        let i = y as usize * self.l as usize + x as usize;
        if v {
            self.bits[i / 8] |= 1 << (i % 8);
        } else {
            self.bits[i / 8] &= !(1 << (i % 8));
        }
    }
}

// ---- state ------------------------------------------------------------------------------------------

fn pion_id_valide(id: &str) -> bool {
    (1..=PION_ID_MAX).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

fn nom_pion_valide(nom: &str) -> bool {
    !nom.trim().is_empty() && nom.chars().count() <= PION_NOM_MAX
}

fn fiche_valide(f: &str) -> bool {
    !f.is_empty() && f.chars().count() <= ID_MAX
}

fn empreinte(emp: &HashMap<String, [u32; 2]>, asset: Option<&str>) -> (i32, i32) {
    match asset.and_then(|a| emp.get(a)) {
        Some([l, h]) if *l >= 1 && *h >= 1 => ((*l).min(1000) as i32, (*h).min(1000) as i32),
        _ => (1, 1),
    }
}

fn pion_dedans(p: &Pion, (l, h): (i32, i32), largeur: u32, hauteur: u32) -> bool {
    p.x >= 0 && p.y >= 0 && i64::from(p.x) + i64::from(l) <= i64::from(largeur) && i64::from(p.y) + i64::from(h) <= i64::from(hauteur)
}

fn rect_valide(r: &Rect, largeur: u32, hauteur: u32) -> bool {
    r.l >= 1
        && r.h >= 1
        && r.x >= 0
        && r.y >= 0
        && i64::from(r.x) + i64::from(r.l) <= i64::from(largeur)
        && i64::from(r.y) + i64::from(r.h) <= i64::from(hauteur)
}

impl Etat {
    /// The state of a new table: nothing revealed, no token, no view, no hidden layer.
    pub fn vide(largeur: u32, hauteur: u32) -> R<Etat> {
        if !(1..=LARGEUR_MAX).contains(&largeur) || !(1..=HAUTEUR_MAX).contains(&hauteur) {
            return Err(Erreur::champ("limite_depassee", "taille"));
        }
        Ok(Etat { schema: SCHEMA_TABLE, pions: vec![], brouillard: Grille::vide(largeur, hauteur).encoder(), vue: None, calques_masques: vec![] })
    }

    /// Structural check of a stored state against its map.
    pub fn valider(&self, doc: &Document, emp: &HashMap<String, [u32; 2]>) -> R<()> {
        let invalide = || Erreur::new("etat_invalide");
        if self.schema != SCHEMA_TABLE || self.pions.len() > PIONS_MAX {
            return Err(invalide());
        }
        Grille::decoder(&self.brouillard, doc.largeur, doc.hauteur)?;
        let mut ids = HashSet::new();
        for p in &self.pions {
            if !pion_id_valide(&p.id)
                || !ids.insert(p.id.as_str())
                || !nom_pion_valide(&p.nom)
                || p.asset_id.as_deref().is_some_and(str::is_empty)
                || p.fiche_id.as_deref().is_some_and(|f| !fiche_valide(f))
                || !pion_dedans(p, empreinte(emp, p.asset_id.as_deref()), doc.largeur, doc.hauteur)
            {
                return Err(invalide());
            }
        }
        if self.vue.is_some_and(|v| !rect_valide(&v, doc.largeur, doc.hauteur)) {
            return Err(invalide());
        }
        let calques: HashSet<&str> = self.calques_masques.iter().map(String::as_str).collect();
        if calques.len() != self.calques_masques.len() {
            return Err(invalide());
        }
        Ok(())
    }
}

// ---- commands ---------------------------------------------------------------------------------------

fn pion_index(etat: &Etat, id: &str) -> R<usize> {
    etat.pions.iter().position(|p| p.id == id).ok_or(Erreur::new("pion_inconnu"))
}

fn peindre(g: &mut Grille, r: &Rect, v: bool) -> R<()> {
    if !rect_valide(r, g.l, g.h) {
        return err("position_invalide");
    }
    for y in r.y..r.y + r.h {
        for x in r.x..r.x + r.l {
            g.set(x, y, v);
        }
    }
    Ok(())
}

/// Is there a wall segment (or a door: it stays a limit, as in B-101) between two neighbouring cells?
fn separes(murs: &HashSet<(i32, i32, Cote)>, (x, y): (i32, i32), (nx, ny): (i32, i32)) -> bool {
    if nx != x {
        murs.contains(&(x.max(nx), y, Cote::V))
    } else {
        murs.contains(&(x, y.max(ny), Cote::H))
    }
}

/// Flood fill from a cell, in four directions, stopped by walls and doors. A room open to the outside
/// fills the whole connected area, the whole map included: the GM masks again.
fn remplir(doc: &Document, g: &mut Grille, x: i32, y: i32, v: bool) -> R<()> {
    if !g.dedans(x, y) {
        return err("position_invalide");
    }
    let murs: HashSet<(i32, i32, Cote)> = doc.murs.iter().map(|m| (m.x, m.y, m.cote)).collect();
    let mut vus = HashSet::from([(x, y)]);
    let mut file = VecDeque::from([(x, y)]);
    while let Some((cx, cy)) = file.pop_front() {
        g.set(cx, cy, v);
        for (nx, ny) in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)] {
            if g.dedans(nx, ny) && !vus.contains(&(nx, ny)) && !separes(&murs, (cx, cy), (nx, ny)) {
                vus.insert((nx, ny));
                file.push_back((nx, ny));
            }
        }
    }
    Ok(())
}

fn appliquer(doc: &Document, ctx: &ContexteTable, etat: &mut Etat, g: &mut Grille, c: &CommandeTable) -> R<()> {
    let dedans = |p: &Pion| pion_dedans(p, empreinte(&ctx.empreintes, p.asset_id.as_deref()), doc.largeur, doc.hauteur);
    match c {
        CommandeTable::AjouterPion { id, nom, asset_id, fiche_id, x, y, visible } => {
            if !pion_id_valide(id)
                || !nom_pion_valide(nom)
                || asset_id.as_deref().is_some_and(str::is_empty)
                || fiche_id.as_deref().is_some_and(|f| !fiche_valide(f))
            {
                return err("commande_invalide");
            }
            if etat.pions.iter().any(|p| &p.id == id) {
                return err("id_existant");
            }
            if etat.pions.len() >= PIONS_MAX {
                return err("table_pleine");
            }
            let p = Pion { id: id.clone(), nom: nom.clone(), asset_id: asset_id.clone(), fiche_id: fiche_id.clone(), x: *x, y: *y, visible: *visible };
            if !dedans(&p) {
                return err("position_invalide");
            }
            etat.pions.push(p);
        }
        CommandeTable::DeplacerPion { id, x, y } => {
            let i = pion_index(etat, id)?;
            let mut p = etat.pions[i].clone();
            (p.x, p.y) = (*x, *y);
            if !dedans(&p) {
                return err("position_invalide");
            }
            etat.pions[i] = p;
        }
        CommandeTable::ReglerPion { id, nom, visible, fiche_id, asset_id } => {
            let i = pion_index(etat, id)?;
            let mut p = etat.pions[i].clone();
            if let Some(n) = nom {
                if !nom_pion_valide(n) {
                    return err("commande_invalide");
                }
                p.nom = n.clone();
            }
            if let Some(v) = visible {
                p.visible = *v;
            }
            if let Some(f) = fiche_id {
                if f.as_deref().is_some_and(|f| !fiche_valide(f)) {
                    return err("commande_invalide");
                }
                p.fiche_id = f.clone();
            }
            if let Some(a) = asset_id {
                if a.as_deref().is_some_and(str::is_empty) {
                    return err("commande_invalide");
                }
                p.asset_id = a.clone();
            }
            if !dedans(&p) {
                return err("position_invalide");
            }
            etat.pions[i] = p;
        }
        CommandeTable::RetirerPion { id } => {
            let i = pion_index(etat, id)?;
            etat.pions.remove(i);
        }
        CommandeTable::RevelerRect { x, y, l, h } => peindre(g, &Rect { x: *x, y: *y, l: *l, h: *h }, true)?,
        CommandeTable::MasquerRect { x, y, l, h } => peindre(g, &Rect { x: *x, y: *y, l: *l, h: *h }, false)?,
        CommandeTable::RevelerPiece { x, y } => remplir(doc, g, *x, *y, true)?,
        CommandeTable::MasquerPiece { x, y } => remplir(doc, g, *x, *y, false)?,
        CommandeTable::PartagerVue { vue } => {
            if vue.is_some_and(|v| !rect_valide(&v, doc.largeur, doc.hauteur)) {
                return err("position_invalide");
            }
            etat.vue = *vue;
        }
        CommandeTable::ReglerCalqueJoueurs { calque, montre } => {
            if doc.rang(calque).is_none() {
                return err("calque_inconnu");
            }
            etat.calques_masques.retain(|c| c != calque);
            if !montre {
                etat.calques_masques.push(calque.clone());
            }
        }
        CommandeTable::Reinitialiser => {
            *etat = Etat::vide(doc.largeur, doc.hauteur)?;
            *g = Grille::vide(doc.largeur, doc.hauteur);
        }
    }
    Ok(())
}

/// Applies a batch whole or refuses it whole (the refusal carries the index of the command).
pub fn appliquer_lot(doc: &Document, etat: &Etat, lot: &[CommandeTable], ctx: &ContexteTable) -> R<Etat> {
    if ctx.acteur.as_deref().is_some_and(|a| a != "mj") {
        return err("refuse");
    }
    if lot.len() > LOT_MAX {
        return err("lot_trop_grand");
    }
    etat.valider(doc, &ctx.empreintes)?;
    let mut courant = etat.clone();
    let mut grille = Grille::decoder(&etat.brouillard, doc.largeur, doc.hauteur)?;
    for (i, c) in lot.iter().enumerate() {
        appliquer(doc, ctx, &mut courant, &mut grille, c).map_err(|mut e| {
            e.index = Some(i);
            e
        })?;
    }
    courant.brouillard = grille.encoder();
    Ok(courant)
}

// ---- player view ------------------------------------------------------------------------------------

#[derive(Serialize, Debug, PartialEq)]
pub struct PionVu {
    pub id: String,
    pub nom: String,
    pub asset_id: Option<String>,
    pub fiche_id: Option<String>,
    pub x: i32,
    pub y: i32,
    pub l: i32,
    pub h: i32,
}

/// What a player may read of a table: the document through the filter of AD-156, then through the fog.
/// The bitmap is the only shape of what is hidden; the view and the footprint are public.
#[derive(Serialize, Debug)]
pub struct VueJoueur {
    pub document: Document,
    pub pions: Vec<PionVu>,
    pub brouillard: String,
    pub vue: Option<Rect>,
}

fn cellules_touchees(g: &Grille, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
    let (cx0, cy0) = (x0.floor().max(0.0) as i32, y0.floor().max(0.0) as i32);
    // The right / bottom edge belongs to the cell on its left / above unless the span is a point.
    let fin = |v: f64, debut: f64| if v > debut && v.fract() == 0.0 { v as i32 - 1 } else { v.floor() as i32 };
    let (cx1, cy1) = (fin(x1, x0).min(g.l as i32 - 1), fin(y1, y0).min(g.h as i32 - 1));
    (cy0..=cy1).any(|y| (cx0..=cx1).any(|x| g.get(x, y)))
}

/// Applies the filter of AD-156, then the fog and the hidden layers (AD-battlemap-table-4).
pub fn vue_joueur(doc: &Document, etat: &Etat, ctx: &ContexteVue) -> R<VueJoueur> {
    let g = Grille::decoder(&etat.brouillard, doc.largeur, doc.hauteur)?;
    let base = Contexte {
        assets_mj_seul: ctx.assets_mj_seul.clone(),
        assets_retires: ctx.assets_retires.clone(),
        fiches_lisibles: ctx.fiches_lisibles.clone(),
    };
    let mut d = filtre::filtrer_pour_joueur(doc, &base);
    let masques: HashSet<&str> = etat.calques_masques.iter().map(String::as_str).collect();
    d.calques.retain(|c| !masques.contains(c.id.as_str()));
    d.sols.retain(|s| !masques.contains(s.calque.as_str()) && g.get(s.x, s.y));
    d.murs.retain(|m| {
        if masques.contains(m.calque.as_str()) {
            return false;
        }
        let (voisin_x, voisin_y) = match m.cote {
            Cote::H => (m.x, m.y - 1),
            Cote::V => (m.x - 1, m.y),
        };
        g.get(m.x, m.y) || g.get(voisin_x, voisin_y)
    });
    d.elements.retain(|e| {
        if masques.contains(e.calque.as_str()) {
            return false;
        }
        // An element is anchored at its centre; a quarter turn swaps its sides.
        let (mut l, mut h) = empreinte(&ctx.empreintes, Some(&e.asset_id));
        if e.rotation == 90 || e.rotation == 270 {
            std::mem::swap(&mut l, &mut h);
        }
        let (dx, dy) = (f64::from(l) * e.echelle / 2.0, f64::from(h) * e.echelle / 2.0);
        cellules_touchees(&g, e.x - dx, e.y - dy, e.x + dx, e.y + dy)
    });
    let cache: HashSet<&str> = ctx.assets_mj_seul.iter().chain(&ctx.assets_retires).map(String::as_str).collect();
    let lisibles: HashSet<&str> = ctx.fiches_lisibles.iter().map(String::as_str).collect();
    let pions = etat
        .pions
        .iter()
        .filter_map(|p| {
            let asset = p.asset_id.as_deref().filter(|a| !cache.contains(a));
            let (l, h) = empreinte(&ctx.empreintes, asset);
            let revele = (p.y..p.y + h).any(|y| (p.x..p.x + l).any(|x| g.get(x, y)));
            (p.visible && revele).then(|| PionVu {
                id: p.id.clone(),
                nom: p.nom.clone(),
                asset_id: asset.map(str::to_string),
                fiche_id: p.fiche_id.clone().filter(|f| lisibles.contains(f.as_str())),
                x: p.x,
                y: p.y,
                l,
                h,
            })
        })
        .collect();
    Ok(VueJoueur { document: d, pions, brouillard: etat.brouillard.clone(), vue: etat.vue })
}

// ---- resize -----------------------------------------------------------------------------------------

/// The state of a map that goes from `ancien` to `largeur × hauteur` cells (origin: top-left cell): the
/// bitmap is extended with hidden cells or cropped, the view is clamped, and a token whose footprint would
/// leave the map refuses the whole change (`limite_depassee`, `champ` = `taille`).
pub fn redimensionner_etat(etat: &Etat, ancien: (u32, u32), largeur: u32, hauteur: u32, ctx: &ContexteTable) -> R<Etat> {
    if !(1..=LARGEUR_MAX).contains(&largeur) || !(1..=HAUTEUR_MAX).contains(&hauteur) {
        return Err(Erreur::champ("limite_depassee", "taille"));
    }
    let avant = Grille::decoder(&etat.brouillard, ancien.0, ancien.1)?;
    if etat.pions.iter().any(|p| !pion_dedans(p, empreinte(&ctx.empreintes, p.asset_id.as_deref()), largeur, hauteur)) {
        return Err(Erreur::champ("limite_depassee", "taille"));
    }
    let mut apres = Grille::vide(largeur, hauteur);
    for y in 0..hauteur.min(ancien.1) as i32 {
        for x in 0..largeur.min(ancien.0) as i32 {
            if avant.get(x, y) {
                apres.set(x, y, true);
            }
        }
    }
    let vue = etat.vue.map(|v| {
        let x = v.x.clamp(0, largeur as i32 - 1);
        let y = v.y.clamp(0, hauteur as i32 - 1);
        Rect { x, y, l: v.l.clamp(1, largeur as i32 - x), h: v.h.clamp(1, hauteur as i32 - y) }
    });
    Ok(Etat { brouillard: apres.encoder(), vue, ..etat.clone() })
}

/// The revealed cells of a stored bitmap, row by row (what the tests and the callers read).
pub fn cases_revelees(brouillard: &str, largeur: u32, hauteur: u32) -> R<Vec<(i32, i32)>> {
    let g = Grille::decoder(brouillard, largeur, hauteur)?;
    Ok((0..hauteur as i32).flat_map(|y| (0..largeur as i32).map(move |x| (x, y))).filter(|(x, y)| g.get(*x, *y)).collect())
}
