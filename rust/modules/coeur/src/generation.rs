//! Generation of the galaxy's stars (AD-138, AD-140, AD-148 version 1: Eneria's generator).
//!
//! Pure: no file, no clock. The zones' geometry stays in TypeScript (AD-etoiles-2): the caller
//! gives, per block, the densities and the exclusions of the nine candidate hexagons.
use serde::{Deserialize, Serialize};
use crate::reglages::{Reglages, VERSIONS_GENERATEUR};
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

/// The star classes of the core (AD-galaxie-systemes-1): letter, label and colour. `V` is the
/// reference's yellow-green and is never drawn from a key.
pub const CLASSES_ETOILE: [(&str, &str, &str); 7] = [
    ("M", "M \u{2014} rouge", "#ff8f70"),
    ("K", "K \u{2014} orange", "#ffb870"),
    ("G", "G \u{2014} jaune", "#ffe08a"),
    ("F", "F \u{2014} jaune p\u{e2}le", "#fff4d6"),
    ("A", "A \u{2014} blanche", "#dfe9ff"),
    ("B", "B \u{2014} bleue", "#a9c4ff"),
    ("V", "V \u{2014} jaune-vert", "#d6f08a"),
];

#[derive(Serialize)]
struct ClasseEtoile {
    lettre: &'static str,
    libelle: &'static str,
    couleur: &'static str,
}

/// Class letter of a system from its key and its continuous size in [0, 1]; never `V`.
pub fn classe_de_cle(cle: &str, taille: f64) -> Result<&'static str, String> {
    if !(0.0..=1.0).contains(&taille) {
        return Err("taille outside 0..1".to_string());
    }
    let c = Rng::new(hash32(&format!("couleur:{cle}"))).suivant();
    Ok(lettre_de(c, 0.65 + 1.45 * taille))
}

/// The seven classes as JSON: `[{lettre, libelle, couleur}]`.
#[wasm_bindgen]
pub fn classes_etoile() -> String {
    let liste: Vec<ClasseEtoile> = CLASSES_ETOILE
        .iter()
        .map(|(lettre, libelle, couleur)| ClasseEtoile { lettre, libelle, couleur })
        .collect();
    serde_json::to_string(&liste).unwrap_or_else(|_| "[]".to_string())
}

/// Class letter drawn from a key and a size; a size outside [0, 1] is refused.
#[wasm_bindgen(js_name = classe_de_cle)]
pub fn classe_de_cle_wasm(cle: &str, taille: f64) -> Result<String, JsError> {
    classe_de_cle(cle, taille).map(str::to_string).map_err(|m| JsError::new(&m))
}

/// The star of a block as JSON: `null` or the `Etoile` object. `exclus`: nine bytes, non-zero = excluded.
#[wasm_bindgen(js_name = tirer_bloc)]
pub fn tirer_bloc_wasm(graine: &str, bx: i32, by: i32, densites: &[f64], exclus: &[u8]) -> Result<String, JsError> {
    let exclus: Vec<bool> = exclus.iter().map(|b| *b != 0).collect();
    let etoile = tirer_bloc(graine, bx, by, densites, &exclus).map_err(|m| JsError::new(&m))?;
    serde_json::to_string(&etoile).map_err(|_| JsError::new("serialisation failed"))
}

// ---------------------------------------------------------------------------------------------
// Interior of a system (AD-systeme-1, AD-systeme-2): Eneria's `systeme()` reduced to its structure.
// The draw uses Eneria's defaults (no `R`: sizes .035, scale 3, moon .5, local step .45, star radius .2)
// and never yields an anomaly. Every draw stream is read in the order of the source, discarded calls
// included, which is what makes the counts exact.
// ---------------------------------------------------------------------------------------------

/// A body of the interior, as one row of `swn_astres` (AD-systeme-2). `aspect` carries what the source
/// computes beyond the place and is not a column.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Astre {
    pub cle: String,
    pub genre: String,
    pub parent_cle: Option<String>,
    pub etoile_rang: u32,
    #[serde(rename = "type")]
    pub type_astre: String,
    pub nom: Option<String>,
    pub orbite: Option<f64>,
    pub heure: f64,
    pub taille: f64,
    pub aspect: serde_json::Value,
}

/// A ring or a cloud, as one row of `swn_formations`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Formation {
    pub cle: String,
    pub forme: String,
    pub nom: Option<String>,
    pub parametres: serde_json::Value,
    pub etoile_rang: u32,
}

/// The whole interior of a system.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Systeme {
    pub astres: Vec<Astre>,
    pub formations: Vec<Formation>,
    pub transition: f64,
}

/// JavaScript's `Math.round`.
fn r_js(v: f64) -> f64 {
    (v + 0.5).floor()
}
fn r2(v: f64) -> f64 {
    r_js(v * 100.0) / 100.0
}
fn r3(v: f64) -> f64 {
    r_js(v * 1000.0) / 1000.0
}

fn entre(r: &mut Rng, a: f64, b: f64) -> f64 {
    a + (b - a) * r.suivant()
}
fn entier(r: &mut Rng, a: i32, b: i32) -> i32 {
    a + (r.suivant() * f64::from(b - a + 1)).floor() as i32
}
fn pondere<T: Copy>(r: &mut Rng, l: &[(T, f64)]) -> T {
    let mut v = r.suivant() * l.iter().map(|(_, p)| *p).sum::<f64>();
    for (x, p) in l {
        v -= p;
        if v <= 0.0 {
            return *x;
        }
    }
    l[l.len() - 1].0
}

fn tirage(cle: &str, aspect: &str) -> Rng {
    Rng::new(hash32(&format!("{cle}|{aspect}")))
}

/// Golden angle in hours: bodies spread without lining up.
fn angle_or() -> f64 {
    12.0 * (1.0 - 1.0 / ((1.0 + 5f64.sqrt()) / 2.0))
}

/// Frequencies of the source (`FREQ`).
const FREQ_SERREE: f64 = 1.0 / 8.0;
const FREQ_LARGES: f64 = 1.0 / 10.0;
/// Default frequency of a zone (`FREQ.zone`): the reference of the class-specific zone chances.
pub(crate) const FREQ_ZONE: f64 = 0.5;
const PAS_LOCAL: f64 = 0.45;
const ECHELLE_TAILLE: f64 = 0.035 * 3.0;

/// Ranges of a star class (`PLAGES`): the constants of the source. The tunable ones (`planetes`, `ceintures`,
/// the moons and the total) are overridden by the settings (AD-reglages-1), see `PlageEff`.
pub(crate) struct Plage {
    pub(crate) planetes: (i32, i32),
    geantes: (i32, i32),
    pub(crate) ceintures: &'static [(i32, f64)],
    habitable: f64,
    depart: f64,
    pas: f64,
    verrouillees: f64,
    sans_lave: bool,
    zone: Option<f64>,
}

/// A class's ranges as the draw reads them: the source's constants under the settings' overrides.
struct PlageEff {
    base: &'static Plage,
    planetes: (i32, i32),
    ceintures: Vec<(i32, f64)>,
    lunes: (i32, i32),
    total: (i32, i32),
    zone: f64,
}

/// Weights of the belt counts in the window `[min, max]`: the source's weight where it has one, else the one
/// of the nearest listed count below (the last listed one), so the default window gives the source's list.
fn poids_ceintures(base: &[(i32, f64)], fenetre: (i32, i32)) -> Vec<(i32, f64)> {
    (fenetre.0..=fenetre.1)
        .map(|v| {
            let w = base
                .iter()
                .find(|(n, _)| *n == v)
                .or_else(|| base.iter().filter(|(n, _)| *n < v).last())
                .map_or(1.0, |(_, w)| *w);
            (v, w)
        })
        .collect()
}

fn plage_eff(classe: &str, rg: &Reglages) -> PlageEff {
    let base = plage(classe);
    let c = rg.par_classe.get(classe).or_else(|| rg.par_classe.get("jaune")).expect("settings hold every class");
    let zone = match base.zone {
        Some(z) => (rg.frequences.zone * (z / FREQ_ZONE)).min(1.0),
        None => rg.frequences.zone,
    };
    PlageEff {
        base,
        planetes: (c.planetes[0], c.planetes[1]),
        ceintures: poids_ceintures(base.ceintures, (c.ceintures[0], c.ceintures[1])),
        lunes: (c.lunes[0], c.lunes[1]),
        total: (c.total[0], c.total[1]),
        zone,
    }
}

const TEMPEREE: Plage = Plage {
    planetes: (4, 8),
    geantes: (1, 3),
    ceintures: &[(0, 0.45), (1, 0.42), (2, 0.13)],
    habitable: 0.5,
    depart: 1.0,
    pas: 1.0,
    verrouillees: 0.0,
    sans_lave: false,
    zone: None,
};

pub(crate) fn plage(classe: &str) -> &'static Plage {
    const NAINE_ROUGE: Plage = Plage {
        planetes: (2, 5),
        geantes: (0, 1),
        ceintures: &[(0, 0.65), (1, 0.35)],
        habitable: 0.25,
        depart: 0.7,
        pas: 0.8,
        verrouillees: 0.5,
        sans_lave: false,
        zone: None,
    };
    const BLANCHE: Plage = Plage {
        planetes: (3, 6),
        geantes: (1, 2),
        ceintures: &[(0, 0.35), (1, 0.45), (2, 0.2)],
        habitable: 0.2,
        depart: 1.0,
        pas: 1.0,
        verrouillees: 0.0,
        sans_lave: false,
        zone: None,
    };
    const GEANTE_ROUGE: Plage = Plage {
        planetes: (2, 5),
        geantes: (1, 2),
        ceintures: &[(0, 0.4), (1, 0.45), (2, 0.15)],
        habitable: 0.0,
        depart: 1.6,
        pas: 1.0,
        verrouillees: 0.0,
        sans_lave: true,
        zone: None,
    };
    const NAINE_BLANCHE: Plage = Plage {
        planetes: (1, 4),
        geantes: (0, 2),
        ceintures: &[(0, 0.5), (1, 0.4), (2, 0.1)],
        habitable: 0.0,
        depart: 1.4,
        pas: 1.0,
        verrouillees: 0.0,
        sans_lave: true,
        zone: None,
    };
    const GEANTE_BLEUE: Plage = Plage {
        planetes: (0, 3),
        geantes: (0, 1),
        ceintures: &[(0, 0.4), (1, 0.6)],
        habitable: 0.0,
        depart: 1.5,
        pas: 1.1,
        verrouillees: 0.0,
        sans_lave: false,
        zone: Some(0.85),
    };
    match classe {
        "naine_rouge" => &NAINE_ROUGE,
        "blanche" => &BLANCHE,
        "geante_rouge" => &GEANTE_ROUGE,
        "naine_blanche" => &NAINE_BLANCHE,
        "geante_bleue" => &GEANTE_BLEUE,
        _ => &TEMPEREE,
    }
}

type Poids<T> = &'static [(T, f64)];

/// Moons drawn by planet type (`LUNES`).
fn lunes_de(type_planete: &str) -> Poids<i32> {
    match type_planete {
        "glace" => &[(0, 5.0), (1, 3.5), (2, 1.5)],
        "lave" => &[(0, 1.0)],
        "gazeuse" => &[(2, 1.0), (3, 1.0), (4, 1.0), (5, 1.0)],
        _ => &[(0, 6.0), (1, 3.0), (2, 1.0)],
    }
}

/// Moon types by planet type (`LUNE_DE`).
fn types_de_lune(type_planete: &str) -> Poids<&'static str> {
    match type_planete {
        "gazeuse" => &[("glace", 5.5), ("rocheux", 4.0), ("lave", 0.5)],
        "glace" => &[("glace", 3.0), ("rocheux", 1.0)],
        _ => &[("rocheux", 1.0)],
    }
}

/// A companion does not outshine the first: from the dimmest to the brightest (`ECLAT`).
const ECLAT: [&str; 9] = [
    "naine_rouge",
    "naine_blanche",
    "orange",
    "jaune_orange",
    "jaune",
    "jaune_vert",
    "blanche",
    "geante_rouge",
    "geante_bleue",
];
const COMPAGNES: [(&str, f64); 4] =
    [("naine_rouge", 6.0), ("orange", 2.5), ("naine_blanche", 1.0), ("jaune", 1.0)];

fn rang_eclat(c: &str) -> Option<usize> {
    ECLAT.iter().position(|e| *e == c)
}

/// Planet type of a kind (`TYPE_DE`).
fn type_de(sorte: &str) -> &'static str {
    match sorte {
        "habitable" | "oceanique" | "aride" => "tellurique",
        "verrouillee" => "verrouillee",
        "rocheux" => "rocheux",
        "lave" => "lave",
        "glace" | "glace_atmo" => "glace",
        _ => "gazeuse",
    }
}

fn nature_de(sorte: &str) -> Option<&'static str> {
    match sorte {
        "habitable" => Some("habitable"),
        "oceanique" => Some("océanique"),
        "aride" => Some("aride"),
        "glace_atmo" => Some("à atmosphère"),
        _ => None,
    }
}

const BRUMES: [&str; 6] = ["#b0507a", "#3a5ab0", "#c8501e", "#4a8a6a", "#7a5cff", "#a07a3a"];
/// Colours of a comet: head, gas tail, dust tail.
const COMETES: [[&str; 3]; 9] = [
    ["#fff0c8", "#9fc8ff", "#ffcf6a"],
    ["#cfe8ff", "#7fb8ff", "#f0e4cc"],
    ["#d8f0ff", "#8ad0ff", "#e8eef0"],
    ["#e0f0ff", "#90b8ff", "#f0dcb8"],
    ["#ffd8c0", "#a0b0ff", "#ffb088"],
    ["#9cffb8", "#5fe0a0", "#d8ecc0"],
    ["#e8f4ff", "#a8d0ff", "#e8e8e8"],
    ["#b8dcff", "#5a9cff", "#b8c8e8"],
    ["#c8b0ff", "#7a5aff", "#8a80a0"],
];

/// Star class (`classeAstre`) from the class letter and the size.
pub fn classe_astre(lettre: &str, taille: f64) -> &'static str {
    match lettre {
        "M" => {
            if taille >= 1.6 {
                "geante_rouge"
            } else {
                "naine_rouge"
            }
        }
        "K" => "orange",
        "G" => "jaune",
        "F" => "blanche",
        "A" => {
            if taille < 0.8 {
                "naine_blanche"
            } else {
                "blanche"
            }
        }
        "B" => "geante_bleue",
        "V" => "jaune_vert",
        _ => "jaune",
    }
}

fn compagne(r: &mut Rng, principale: &str) -> &'static str {
    let rang = rang_eclat(principale);
    let l: Vec<(&'static str, f64)> = COMPAGNES
        .iter()
        .filter(|(c, _)| match (rang_eclat(c), rang) {
            (Some(a), Some(b)) => a <= b,
            _ => false,
        })
        .copied()
        .collect();
    if l.is_empty() {
        "naine_rouge"
    } else {
        pondere(r, &l)
    }
}

/// The bodies of a star, from the inside out (`sequence`): rocky ones (lava closest), the habitable
/// world if any, a belt at the ice line, the giants, ice worlds, an outer belt.
fn sequence(p: &Plage, r: &mut Rng, n: i32, g: i32, b: i32, habitable: bool, rx: &mut Rng) -> Vec<&'static str> {
    let reste = n - g;
    let n_glace = if reste >= 3 {
        r_js(f64::from(reste) * entre(r, 0.15, 0.4)) as i32
    } else if reste == 2 && r.suivant() < 0.3 {
        1
    } else {
        0
    };
    let n_int = reste - n_glace;
    let mut int: Vec<&'static str> = Vec::new();
    for j in 0..n_int {
        if j == 0 && !p.sans_lave && n_int > 1 && r.suivant() < 0.4 {
            int.push("lave");
        } else if p.verrouillees > 0.0 && r.suivant() < p.verrouillees {
            int.push("verrouillee");
        } else if r.suivant() < 0.55 {
            int.push("rocheux");
        } else {
            int.push("aride");
        }
    }
    if habitable {
        if let Some(j) = int.iter().rposition(|s| *s != "lave") {
            int[j] = if rx.suivant() < 0.25 { "oceanique" } else { "habitable" };
        }
    }
    let mut seq = int;
    if b >= 1 {
        seq.push("ceinture");
    }
    for _ in 0..g {
        seq.push("gazeuse");
    }
    for _ in 0..n_glace {
        seq.push("glace");
    }
    if b >= 2 {
        seq.push("ceinture-ext");
    }
    seq
}

#[derive(Clone, Copy)]
struct Effectif {
    n: i32,
    g: i32,
    b: i32,
}

/// Planets, giants and belts of a star; `moitie` for a far companion (about half the ranges).
fn effectifs(p: &PlageEff, r: &mut Rng, moitie: bool) -> Effectif {
    let f = if moitie { 0.5 } else { 1.0 };
    let n = r_js(f64::from(entier(r, p.planetes.0, p.planetes.1)) * f) as i32;
    let g = (n / 2).min(r_js(f64::from(entier(r, p.base.geantes.0, p.base.geantes.1)) * f) as i32);
    let b = r_js(f64::from(pondere(r, &p.ceintures)) * f) as i32;
    Effectif { n, g, b }
}

/// Plane position of an orbit-and-hour place (AD-143): 12 at the top, 3 at the right.
pub fn orbite_heure_vers_plan(orbite: f64, heure: f64) -> (f64, f64) {
    let a = heure / 6.0 * std::f64::consts::PI;
    (orbite * a.sin(), -orbite * a.cos())
}

/// Orbit and hour (in `[0, 12)`) of a plane point (AD-143).
pub fn plan_vers_orbite_heure(x: f64, y: f64) -> (f64, f64) {
    let heure = ((x.atan2(-y) * 180.0 / std::f64::consts::PI / 30.0) % 12.0 + 12.0) % 12.0;
    (x.hypot(y), heure)
}

/// Direction, as an hour in `[0, 12)`, of the system at `(q2, r2)` seen from the one at `(q1, r1)` (AD-143, AD-carte-3):
/// the plane vector between the two hexagons read as an hour, 12 (0) at the top, 3 at the right, rounded to 2 decimals.
/// Two identical hexagons have no direction: 0.
pub fn heure_vers_voisin(q1: i32, r1: i32, q2: i32, r2_: i32) -> f64 {
    let (x1, y1) = hex_vers_plan(q1, r1);
    let (x2, y2) = hex_vers_plan(q2, r2_);
    if q1 == q2 && r1 == r2_ {
        return 0.0;
    }
    let (_, h) = plan_vers_orbite_heure(x2 - x1, y2 - y1);
    let h = r2(h);
    if h >= 12.0 { 0.0 } else { h }
}

/// Four centres drawn around the given point: an irregular, stable cloud (`nuageParDefaut`).
fn nuage_par_defaut(cle: &str, orbite: f64, heure: f64, taille: f64) -> Vec<[f64; 3]> {
    let mut r = Rng::new(hash32(cle));
    let mut centres = vec![[orbite, heure, taille]];
    for _ in 0..3 {
        let i = (r.suivant() * centres.len() as f64).floor() as usize;
        let [o, h, t] = centres[i];
        let a = r.suivant() * 2.0 * std::f64::consts::PI;
        let d = t * entre(&mut r, 0.6, 1.0);
        let (px, py) = orbite_heure_vers_plan(o, h);
        let (x, y) = (px + d * a.cos(), py + d * a.sin());
        let (no, nh) = plan_vers_orbite_heure(x, y);
        centres.push([r2(no), r2(nh), r2(taille * entre(&mut r, 0.55, 0.9))]);
    }
    centres
}

struct Anneau {
    etoile: usize,
    de: f64,
    a: f64,
    rochers: f64,
    materiaux: serde_json::Value,
    cle: String,
}

/// The interior of the system of the star at `(q, r)`; `taille` and `lettre` are the star's.
/// `version` is the generator version (AD-148) and `rg` the complete settings object of that version
/// (AD-reglages-1): the only inputs of the draw beyond the star.
pub fn tirer_systeme(q: i32, r: i32, taille: f64, lettre: &str, version: u32, rg: &Reglages) -> Result<Systeme, String> {
    use serde_json::json;
    if !VERSIONS_GENERATEUR.contains(&version) {
        return Err(format!("unknown generator version {version}"));
    }
    let cle = format!("{q},{r}");
    let classe0 = classe_astre(lettre, taille);

    let mut r_e = tirage(&cle, "etoiles");
    let u = r_e.suivant();
    let (serree, larges) = (u < FREQ_SERREE, !(u < FREQ_SERREE) && u < FREQ_SERREE + FREQ_LARGES);
    let mut classes: Vec<&'static str> = vec![classe0];
    if serree {
        classes.push(compagne(&mut r_e, classe0));
    }
    if larges {
        let mut k = if r_e.suivant() < 0.25 { 2 } else { 1 };
        while k > 0 {
            classes.push(compagne(&mut r_e, classe0));
            k -= 1;
        }
    }

    // counts, brought back within the bounds of the total (4 to 12 bodies on the map)
    let mut r_p = tirage(&cle, "plages");
    let pe: Vec<PlageEff> = classes.iter().map(|c| plage_eff(c, rg)).collect();
    let comete = r_p.suivant() < rg.frequences.comete;
    let mut zone = r_p.suivant() < pe[0].zone;
    let mut eff: Vec<Effectif> = Vec::new();
    for (k, _) in classes.iter().enumerate() {
        if k > 0 && serree {
            eff.push(Effectif { n: 0, g: 0, b: 0 });
        } else {
            eff.push(effectifs(&pe[k], &mut r_p, k > 0));
        }
    }
    let total = |eff: &[Effectif], zone: bool| -> i32 {
        eff.iter().map(|e| e.n + e.b).sum::<i32>() + i32::from(comete) + i32::from(zone)
    };
    for k in 0..eff.len() {
        if total(&eff, zone) <= pe[0].total.1 {
            break;
        }
        let min = if k > 0 { 1 } else { pe[k].planetes.0 };
        while total(&eff, zone) > pe[0].total.1 && eff[k].n > min {
            eff[k].n -= 1;
            eff[k].g = eff[k].g.min(eff[k].n);
        }
    }
    while total(&eff, zone) < pe[0].total.0 && eff[0].n < pe[0].planetes.1 {
        eff[0].n += 1;
    }
    let max_b = pe[0].ceintures.iter().map(|(v, _)| *v).max().unwrap_or(0);
    while total(&eff, zone) < pe[0].total.0 && eff[0].b < max_b {
        eff[0].b += 1;
    }
    if total(&eff, zone) < pe[0].total.0 {
        zone = true;
    }

    let mut r_t = tirage(&cle, "types");
    let mut r_x = tirage(&cle, "variantes");
    let mut r_b = tirage(&cle, "ceintures");
    let mut r_o = tirage(&cle, "orbites");
    let mut r_l = tirage(&cle, "lunes");
    let h0 = tirage(&cle, "heures").suivant() * 12.0;
    let or = angle_or();
    let rayon_etoile = r3(0.2 * 1.0);

    let mut etoiles: Vec<Astre> = classes
        .iter()
        .enumerate()
        .map(|(k, c)| Astre {
            cle: format!("{cle}.etoile-{k}"),
            genre: "etoile".into(),
            parent_cle: None,
            etoile_rang: k as u32,
            type_astre: (*c).into(),
            nom: None,
            orbite: Some(0.0),
            heure: 0.0,
            taille: rayon_etoile,
            aspect: json!({}),
        })
        .collect();
    let mut corps: Vec<Vec<Astre>> = vec![Vec::new(); classes.len()];
    let mut orbites_planetes: Vec<Vec<f64>> = vec![Vec::new(); classes.len()];
    let mut anneaux: Vec<Anneau> = Vec::new();
    let (mut n, mut habite) = (0u32, false);
    for k in 0..classes.len() {
        let p = pe[k].base;
        let Effectif { n: np, g, b } = eff[k];
        let hab = r_t.suivant() < p.habitable && !habite;
        let seq = sequence(p, &mut r_t, np, g, b, hab, &mut r_x);
        habite = habite || seq.iter().any(|s| *s == "habitable" || *s == "oceanique");
        let mut o = if k > 0 {
            0.0
        } else {
            p.depart.max(if serree { 1.6 } else { 0.0 })
        };
        let mut j = 0u32;
        for s0 in seq {
            let mut s = s0;
            let ext = s == "ceinture-ext";
            let orbite;
            if k > 0 {
                orbite = r2(rayon_etoile + PAS_LOCAL * (f64::from(j) + 1.0 + if ext { 0.3 } else { 0.0 }));
            } else {
                orbite = if s.starts_with("ceinture") {
                    r2(o + if ext { 0.3 } else { 0.0 })
                } else {
                    r2(o + entre(&mut r_o, -0.12, 0.12))
                };
                o += p.pas;
            }
            if s.starts_with("ceinture") {
                let largeur = if ext { entre(&mut r_b, 0.15, 0.45) } else { entre(&mut r_b, 0.1, 0.32) };
                let w = r2(largeur * if k > 0 { 0.5 } else { 1.0 });
                let de = r2(orbite - w);
                let a = r2(orbite + w);
                let rochers = r2(if ext { entre(&mut r_b, 0.2, 0.5) } else { entre(&mut r_b, 0.6, 1.2) });
                anneaux.push(Anneau {
                    etoile: k,
                    de,
                    a,
                    rochers,
                    materiaux: if ext {
                        json!([["glace", 3], ["roche", 1]])
                    } else {
                        json!([["roche", 3], ["metal", 1], ["fer", 1]])
                    },
                    cle: format!("{cle}.ceinture-{k}-{j}"),
                });
                j += 1;
                continue;
            }
            // an ice world keeps an atmosphere if big enough
            let mut tf = entre(&mut r_o, 0.85, 1.2);
            if s == "glace" {
                tf = entre(&mut r_o, 0.75, 1.35);
                if r_x.suivant() < 0.95_f64.min(0.1_f64.max((tf - 0.75) / 0.35)) {
                    s = "glace_atmo";
                }
            }
            let type_p = type_de(s);
            let id = format!("{cle}.{k}-{}", j + 1);
            corps[k].push(Astre {
                cle: id.clone(),
                genre: "planete".into(),
                parent_cle: None,
                etoile_rang: k as u32,
                type_astre: type_p.into(),
                nom: None,
                orbite: Some(orbite),
                heure: r2((h0 + f64::from(n) * or) % 12.0),
                taille: r3(ECHELLE_TAILLE * 1.0 * tf),
                aspect: json!({ "nature": nature_de(s) }),
            });
            orbites_planetes[k].push(orbite);
            let nl = pondere(&mut r_l, lunes_de(type_p)).max(pe[k].lunes.0).min(pe[k].lunes.1);
            for m in 0..nl {
                let tl = pondere(&mut r_l, types_de_lune(type_p));
                let rayon = r3(ECHELLE_TAILLE * 0.5 * entre(&mut r_l, 0.8, 1.1));
                let heure = r2((r_l.suivant() * 12.0 + f64::from(m) * or) % 12.0);
                corps[k].push(Astre {
                    cle: format!("{id}-{}", m + 1),
                    genre: "lune".into(),
                    parent_cle: Some(id.clone()),
                    etoile_rang: k as u32,
                    type_astre: tl.into(),
                    nom: None,
                    orbite: None,
                    heure,
                    taille: rayon,
                    aspect: json!({}),
                });
            }
            n += 1;
            j += 1;
        }
    }

    // place of the companion stars, then of the comet and the zone
    let bord_de = |k: usize, anneaux: &[Anneau]| -> f64 {
        let mut b = if k > 0 { rayon_etoile } else { 1.0 };
        for o in &orbites_planetes[k] {
            b = b.max(*o);
        }
        for z in anneaux.iter().filter(|z| z.etoile == k) {
            b = b.max(z.a);
        }
        b
    };
    let mut dehors = bord_de(0, &anneaux);
    let exterieur: Vec<f64> = (0..classes.len()).map(|k| if k > 0 { bord_de(k, &anneaux) + 0.25 } else { dehors }).collect();
    if serree {
        etoiles[1].aspect = json!({ "serree": true });
        etoiles[1].orbite = Some(0.35);
        etoiles[1].heure = r2(r_e.suivant() * 12.0);
    }
    if larges {
        let ks: Vec<usize> = (1..classes.len()).collect();
        let max_ext = ks.iter().map(|k| exterieur[*k]).fold(f64::NEG_INFINITY, f64::max);
        let commune = r2(dehors + max_ext + 0.6);
        let depart = r_e.suivant() * 12.0;
        for (i, k) in ks.iter().enumerate() {
            etoiles[*k].aspect = json!({ "serree": false });
            etoiles[*k].orbite = Some(commune);
            etoiles[*k].heure = r2((depart + i as f64 * 12.0 / ks.len() as f64) % 12.0);
            dehors = dehors.max(commune + exterieur[*k]);
        }
    }
    let mut r_z = tirage(&cle, "zone");
    let mut points: Vec<Astre> = Vec::new();
    if comete {
        let mut r_c = tirage(&cle, "comete");
        let [couleur, gaz, poussiere] = COMETES[(r_c.suivant() * COMETES.len() as f64).floor() as usize];
        let perihelie = r2(entre(&mut r_c, 0.5, 2.0));
        let orbite = r2(entre(&mut r_c, perihelie, dehors + 0.5));
        let heure = r2(r_z.suivant() * 12.0);
        let sens = if r_c.suivant() < 0.5 { 1 } else { -1 };
        let longueur = r3(entre(&mut r_c, 0.3, 0.8));
        let ouverture = r3(entre(&mut r_c, 0.08, 0.45));
        let tete = r3(entre(&mut r_c, 0.5, 2.2));
        let courbure = r3(entre(&mut r_c, 0.25, 0.7));
        let force_gaz = r3(entre(&mut r_c, 0.4, 1.1));
        let force_poussiere = r3(entre(&mut r_c, 0.35, 1.0));
        points.push(Astre {
            cle: format!("{cle}.comete"),
            genre: "comete".into(),
            parent_cle: None,
            etoile_rang: 0,
            type_astre: "comete".into(),
            nom: None,
            orbite: Some(orbite),
            heure,
            taille: tete,
            aspect: json!({
                "perihelie": perihelie, "sens": sens, "couleur": couleur, "gaz": gaz, "poussiere": poussiere,
                "longueur": longueur, "ouverture": ouverture, "tete": tete, "courbure": courbure,
                "force_gaz": force_gaz, "force_poussiere": force_poussiere,
            }),
        });
    }
    let mut formations: Vec<Formation> = anneaux
        .iter()
        .map(|z| Formation {
            cle: z.cle.clone(),
            forme: "anneau".into(),
            nom: None,
            parametres: json!({ "de": z.de, "a": z.a, "rochers": z.rochers, "materiaux": z.materiaux }),
            etoile_rang: z.etoile as u32,
        })
        .collect();
    let mut bord_nuage: Vec<f64> = Vec::new();
    if zone {
        let champ = r_z.suivant() >= rg.frequences.nebuleuse;
        let orbite = r2(if champ { dehors + 0.6 } else { entre(&mut r_z, 1.2, dehors + 0.5) });
        let heure = r2(r_z.suivant() * 12.0);
        let rochers = r2(if champ { entre(&mut r_z, 0.6, 1.0) } else { entre(&mut r_z, 0.0, 0.3) });
        let brume: Option<&str> = if champ {
            if r_z.suivant() < 0.5 {
                Some("#8a7a66")
            } else {
                None
            }
        } else {
            Some(BRUMES[(r_z.suivant() * BRUMES.len() as f64).floor() as usize])
        };
        let cle_zone = format!("{cle}.zone");
        let taille_nuage = r2(entre(&mut r_z, 0.8, 1.3));
        let centres = nuage_par_defaut(&cle_zone, orbite, heure, taille_nuage);
        bord_nuage = centres.iter().map(|c| c[0] + c[2]).collect();
        formations.push(Formation {
            cle: cle_zone,
            forme: "nuage".into(),
            nom: None,
            parametres: json!({
                "orbite": orbite, "heure": heure, "rochers": rochers, "brume": brume,
                "materiaux": if champ { json!([["roche", 3], ["roche_sombre", 1], ["metal", 1]]) } else { json!([["roche", 2], ["glace", 1]]) },
                "centres": centres,
            }),
            etoile_rang: 0,
        });
    }
    let mut bord = dehors;
    for b in bord_nuage {
        bord = bord.max(b);
    }
    for z in anneaux.iter().filter(|z| z.etoile == 0) {
        bord = bord.max(z.a);
    }
    let transition = r2(bord + 0.7);

    let mut astres = etoiles;
    for c in corps {
        astres.extend(c);
    }
    astres.extend(points);
    Ok(Systeme { astres, formations, transition })
}

fn nombre(v: &serde_json::Value, cle: &str) -> Option<f64> {
    v.get(cle).and_then(serde_json::Value::as_f64)
}

/// The default `transition` (`bord + .7`) of stored rows, for a defined system whose own is null.
pub fn transition_defaut(astres: &[Astre], formations: &[Formation]) -> f64 {
    let bord_de = |k: u32| -> f64 {
        let mut b = if k > 0 {
            astres
                .iter()
                .find(|a| a.genre == "etoile" && a.etoile_rang == k)
                .map_or(0.2, |a| a.taille)
        } else {
            1.0
        };
        for a in astres.iter().filter(|a| a.genre == "planete" && a.etoile_rang == k) {
            if let Some(o) = a.orbite {
                b = b.max(o);
            }
        }
        for f in formations.iter().filter(|f| f.forme == "anneau" && f.etoile_rang == k) {
            if let Some(v) = nombre(&f.parametres, "a") {
                b = b.max(v);
            }
        }
        b
    };
    let mut dehors = bord_de(0);
    for e in astres.iter().filter(|a| a.genre == "etoile" && a.etoile_rang > 0) {
        let lointaine = e.aspect.get("serree").and_then(serde_json::Value::as_bool) != Some(true);
        if let (true, Some(o)) = (lointaine, e.orbite) {
            dehors = dehors.max(o + bord_de(e.etoile_rang) + 0.25);
        }
    }
    let mut bord = dehors;
    for f in formations.iter().filter(|f| f.etoile_rang == 0) {
        match f.forme.as_str() {
            "nuage" => {
                if let Some(cs) = f.parametres.get("centres").and_then(serde_json::Value::as_array) {
                    for c in cs {
                        if let (Some(o), Some(t)) =
                            (c.get(0).and_then(serde_json::Value::as_f64), c.get(2).and_then(serde_json::Value::as_f64))
                        {
                            bord = bord.max(o + t);
                        }
                    }
                }
            }
            "anneau" => {
                if let Some(v) = nombre(&f.parametres, "a") {
                    bord = bord.max(v);
                }
            }
            _ => {}
        }
    }
    r2(bord + 0.7)
}

/// The interior of a system as JSON (AD-systeme-2).
#[wasm_bindgen(js_name = tirer_systeme)]
pub fn tirer_systeme_wasm(q: i32, r: i32, taille: f64, lettre: &str, version: u32, valeurs: &str) -> Result<String, JsError> {
    let rg = crate::reglages::reglages_complets(version, valeurs).map_err(|e| JsError::new(&e.message))?;
    let s = tirer_systeme(q, r, taille, lettre, version, &rg).map_err(|m| JsError::new(&m))?;
    serde_json::to_string(&s).map_err(|_| JsError::new("serialisation failed"))
}

/// The default `transition` of stored rows, from the JSON arrays of `astres` and `formations`.
#[wasm_bindgen(js_name = transition_defaut)]
pub fn transition_defaut_wasm(astres: &str, formations: &str) -> Result<f64, JsError> {
    let a: Vec<Astre> = serde_json::from_str(astres).map_err(|_| JsError::new("astres: invalid JSON"))?;
    let f: Vec<Formation> = serde_json::from_str(formations).map_err(|_| JsError::new("formations: invalid JSON"))?;
    Ok(transition_defaut(&a, &f))
}

/// Plane position `[x, y]` of an orbit and an hour.
#[wasm_bindgen(js_name = orbite_heure_vers_plan)]
pub fn orbite_heure_vers_plan_wasm(orbite: f64, heure: f64) -> Vec<f64> {
    let (x, y) = orbite_heure_vers_plan(orbite, heure);
    vec![x, y]
}

/// Orbit and hour `[orbite, heure]` of a plane point.
#[wasm_bindgen(js_name = plan_vers_orbite_heure)]
pub fn plan_vers_orbite_heure_wasm(x: f64, y: f64) -> Vec<f64> {
    let (o, h) = plan_vers_orbite_heure(x, y);
    vec![o, h]
}

/// Hour of the neighbouring system at `(q2, r2)` seen from `(q1, r1)`.
#[wasm_bindgen(js_name = heure_vers_voisin)]
pub fn heure_vers_voisin_wasm(q1: i32, r1: i32, q2: i32, r2: i32) -> f64 {
    heure_vers_voisin(q1, r1, q2, r2)
}
