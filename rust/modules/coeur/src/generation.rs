//! Generation of the galaxy's stars (AD-138, AD-140, AD-148 version 1: Eneria's generator).
//!
//! Pure: no file, no clock. The zones' geometry stays in TypeScript (AD-etoiles-2): the caller
//! gives, per block, the densities and the exclusions of the nine candidate hexagons.
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Hexagons per side of a block.
pub const TAILLE_BLOC: i32 = 5;
/// Default density of a galaxy (AD-etoiles-3): Eneria's 0.6757, rounded.
pub const DENSITE_DEFAUT: f64 = 0.68;
/// Version of the generator (AD-148): the draw of Eneria.
pub const VERSION_GENERATEUR: u32 = 1;

/// 32-bit string hash (xmur3) over the UTF-16 code units, with 32-bit wrapping products.
pub fn hash32(texte: &str) -> u32 {
    let unites: Vec<u16> = texte.encode_utf16().collect();
    let mut h: u32 = 1_779_033_703 ^ (unites.len() as u32);
    for u in unites {
        h = (h ^ u32::from(u)).wrapping_mul(3_432_918_353);
        h = h.rotate_left(13);
    }
    h = (h ^ (h >> 16)).wrapping_mul(2_246_822_507);
    h = (h ^ (h >> 13)).wrapping_mul(3_266_489_909);
    h ^ (h >> 16)
}

/// mulberry32 generator.
#[derive(Debug, Clone)]
pub struct Rng {
    etat: u32,
}

impl Rng {
    pub fn new(graine: u32) -> Self {
        Rng { etat: graine }
    }

    /// The next real, in `[0, 1)`.
    pub fn suivant(&mut self) -> f64 {
        self.etat = self.etat.wrapping_add(0x6D2B_79F5);
        let a = self.etat;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

/// A star: its hexagon, its size, its class letter and its place in the plane.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Etoile {
    pub q: i32,
    pub r: i32,
    pub taille: f64,
    pub lettre: String,
    pub x: f64,
    pub y: f64,
}

/// A planet of a system (the draw comes with `-systeme`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Planete {
    pub rang: u32,
    pub orbite: f64,
    pub angle: f64,
    pub rayon: f64,
    pub type_planete: String,
    pub lunes: Vec<Lune>,
}

/// A moon of a planet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Lune {
    pub orbite: f64,
    pub angle: f64,
    pub rayon: f64,
}

/// An asteroid belt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Ceinture {
    pub orbite: f64,
    pub largeur: f64,
    pub densite: f64,
}

/// A comet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Comete {
    pub demi_grand_axe: f64,
    pub excentricite: f64,
    pub angle: f64,
}

/// A nebula around a system.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Nebuleuse {
    pub x: f64,
    pub y: f64,
    pub rayon: f64,
    pub teinte: f64,
}

/// A companion star of a system.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Compagne {
    pub orbite: f64,
    pub angle: f64,
    pub taille: f64,
    pub lettre: String,
}

/// JavaScript's `Math.round`: halves go up.
fn arrondi_js(v: f64) -> f64 {
    (v + 0.5).floor()
}

const RACINE_3: f64 = 1.732_050_807_568_877_2;

/// Centre of a hexagon in the plane (pointy-top, unit size), AD-143.
pub fn hex_vers_plan(q: i32, r: i32) -> (f64, f64) {
    let (q, r) = (f64::from(q), f64::from(r));
    (RACINE_3 * (q + r / 2.0), 1.5 * r)
}

/// The hexagon containing a plane point (cube rounding), AD-143.
pub fn plan_vers_hex(x: f64, y: f64) -> (i32, i32) {
    let qf = ((RACINE_3 / 3.0) * x - y / 3.0) / 1.0;
    let rf = (2.0 / 3.0) * y;
    let sf = -qf - rf;
    let mut q = arrondi_js(qf);
    let mut r = arrondi_js(rf);
    let s = arrondi_js(sf);
    let dq = (q - qf).abs();
    let dr = (r - rf).abs();
    let ds = (s - sf).abs();
    if dq > dr && dq > ds {
        q = -r - s;
    } else if dr > ds {
        r = -q - s;
    }
    (q as i32, r as i32)
}

/// Class letter from the colour draw and the size.
pub fn lettre_de(couleur: f64, taille: f64) -> &'static str {
    let v = (couleur + (taille - 1.0) * 0.12).clamp(0.0, 0.999);
    if v < 0.30 {
        "M"
    } else if v < 0.55 {
        "K"
    } else if v < 0.75 {
        "G"
    } else if v < 0.88 {
        "F"
    } else if v < 0.96 {
        "A"
    } else {
        "B"
    }
}

/// The star of a hexagon: size `0.65 + 1.45 * u^2.6` and class letter.
pub fn etoile_en(q: i32, r: i32) -> Etoile {
    let u = Rng::new(hash32(&format!("taille:{q},{r}"))).suivant();
    let taille = 0.65 + 1.45 * u.powf(2.6);
    let c = Rng::new(hash32(&format!("couleur:{q},{r}"))).suivant();
    let (x, y) = hex_vers_plan(q, r);
    Etoile { q, r, taille, lettre: lettre_de(c, taille).to_string(), x, y }
}

/// Index of the candidate `(dq, dr)`, `dq, dr` in 1..=3: `dq` is the outer index.
pub fn indice_candidat(dq: i32, dr: i32) -> usize {
    ((dq - 1) * 3 + (dr - 1)) as usize
}

/// The star of block `(bx, by)`, at most one (AD-etoiles-1). `densites` and `exclus` hold the
/// nine candidates (`indice_candidat`); a bad length is an error, never a guess.
pub fn tirer_bloc(
    graine: &str,
    bx: i32,
    by: i32,
    densites: &[f64],
    exclus: &[bool],
) -> Result<Option<Etoile>, String> {
    if densites.len() != 9 || exclus.len() != 9 {
        return Err("densites and exclus must hold nine values".to_string());
    }
    let mut rng = Rng::new(hash32(&format!("{graine}:{bx}:{by}")));
    let t = rng.suivant();
    let dq = 1 + (rng.suivant() * 3.0).floor() as i32;
    let dr = 1 + (rng.suivant() * 3.0).floor() as i32;
    let i = indice_candidat(dq, dr);
    if exclus[i] || !(t < densites[i]) {
        return Ok(None);
    }
    Ok(Some(etoile_en(TAILLE_BLOC * bx + dq, TAILLE_BLOC * by + dr)))
}

// Flat exports (AD-etoiles-3): numbers, typed arrays, JSON strings.

/// Default density of a galaxy.
#[wasm_bindgen]
pub fn densite_defaut() -> f64 {
    DENSITE_DEFAUT
}

/// Version of the generator.
#[wasm_bindgen]
pub fn version_generateur() -> u32 {
    VERSION_GENERATEUR
}

#[wasm_bindgen(js_name = hash32)]
pub fn hash32_wasm(texte: &str) -> u32 {
    hash32(texte)
}

/// The first `n` reals of the generator seeded with `graine`.
#[wasm_bindgen]
pub fn rng_suite(graine: u32, n: u32) -> Vec<f64> {
    let mut rng = Rng::new(graine);
    (0..n).map(|_| rng.suivant()).collect()
}

/// Plane position `[x, y]` of an hexagon.
#[wasm_bindgen(js_name = hex_vers_plan)]
pub fn hex_vers_plan_wasm(q: i32, r: i32) -> Vec<f64> {
    let (x, y) = hex_vers_plan(q, r);
    vec![x, y]
}

/// Hexagon `[q, r]` containing a plane point.
#[wasm_bindgen(js_name = plan_vers_hex)]
pub fn plan_vers_hex_wasm(x: f64, y: f64) -> Vec<i32> {
    let (q, r) = plan_vers_hex(x, y);
    vec![q, r]
}

/// The star of a block as JSON: `null` or the `Etoile` object. `exclus`: nine bytes, non-zero = excluded.
#[wasm_bindgen(js_name = tirer_bloc)]
pub fn tirer_bloc_wasm(graine: &str, bx: i32, by: i32, densites: &[f64], exclus: &[u8]) -> Result<String, JsError> {
    let exclus: Vec<bool> = exclus.iter().map(|b| *b != 0).collect();
    let etoile = tirer_bloc(graine, bx, by, densites, &exclus).map_err(|m| JsError::new(&m))?;
    serde_json::to_string(&etoile).map_err(|_| JsError::new("serialisation failed"))
}
