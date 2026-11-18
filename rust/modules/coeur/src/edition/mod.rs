//! `edition` (AD-edition-3, AD-edition-4, AD-143): what the GM's writes ask of the core. Pure functions over
//! their arguments, no file, no clock. A refusal is an `ErreurEdition` value, never a panic.
//!
//! Conversions: the stored place is always `(orbite, heure)`; `plan_vers_orbite_heure` (generation) and
//! `galactique_vers_orbite_heure` (here) bring the two other repères to it. Validation: `types_astre`,
//! `valider_aspect` and `valider_formation` bound what a body or a zone may carry.
mod aspect;
mod formation;

use crate::generation::{hex_vers_plan, plan_vers_orbite_heure};
use crate::rendu::types;
use serde_json::Value;
use std::fmt;
use wasm_bindgen::prelude::*;

pub use aspect::valider_aspect;
pub use formation::valider_formation;

/// Largest JSON of an aspect, in bytes.
pub const MAX_ASPECT: usize = 4 * 1024;
/// Largest JSON of a zone's parameters, in bytes.
pub const MAX_FORMATION: usize = 8 * 1024;
/// Largest orbit of the system's extent.
pub const ORBITE_MAX: f64 = 1000.0;

/// Why an edition call refuses. `Display` is the message, without the content of the JSON.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErreurEdition {
    GenreInconnu(String),
    TypeInconnu(String),
    FormeInconnue(String),
    TropGros { max: usize },
    Json(String),
    CleInconnue(String),
    HorsBornes(String),
    Invalide(String),
}

impl fmt::Display for ErreurEdition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErreurEdition::GenreInconnu(g) => write!(f, "unknown genre {g}"),
            ErreurEdition::TypeInconnu(t) => write!(f, "unknown body type {t}"),
            ErreurEdition::FormeInconnue(s) => write!(f, "unknown zone shape {s}"),
            ErreurEdition::TropGros { max } => write!(f, "JSON larger than {max} bytes"),
            ErreurEdition::Json(m) => write!(f, "invalid JSON: {m}"),
            ErreurEdition::CleInconnue(k) => write!(f, "unknown key `{k}`"),
            ErreurEdition::HorsBornes(m) => write!(f, "out of bounds: {m}"),
            ErreurEdition::Invalide(m) => write!(f, "invalid: {m}"),
        }
    }
}

/// Types of the aspects catalogue that a body of `genre` may take.
pub fn types_astre(genre: &str) -> Result<Vec<&'static str>, ErreurEdition> {
    let tous = types();
    let parmi = |l: &[&str]| -> Vec<&'static str> { tous.iter().copied().filter(|t| l.contains(t)).collect() };
    Ok(match genre {
        "etoile" => tous
            .iter()
            .copied()
            .filter(|t| {
                !["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse", "comete", "nebuleuse", "ceinture", "asteroides", "anomalie"]
                    .contains(t)
            })
            .collect(),
        "planete" => parmi(&["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse"]),
        "lune" => parmi(&["rocheux", "glace", "lave"]),
        "comete" => parmi(&["comete"]),
        g => return Err(ErreurEdition::GenreInconnu(g.to_string())),
    })
}

/// Orbit and hour, both rounded to two decimals as the generator does, of a point of the galactic grid seen
/// from a system: `(dq, dr)` is the offset in hexagons (real), `rayon` the transition circle on which the
/// centre of an adjacent hexagon falls. The hour is in `[0, 12)` (12 is 0). Zero offset: `(0, 0)`.
pub fn galactique_vers_orbite_heure(dq: f64, dr: f64, rayon: f64) -> Result<(f64, f64), ErreurEdition> {
    if !(dq.is_finite() && dr.is_finite() && rayon.is_finite()) || rayon < 0.0 {
        return Err(ErreurEdition::Invalide("galactic offset or radius".into()));
    }
    // The distance between two adjacent hexagon centres in the plane (hex_vers_plan is linear).
    let (ux, uy) = hex_vers_plan(1, 0);
    let voisin = ux.hypot(uy);
    let (a, b) = (hex_vers_plan(1, 0), hex_vers_plan(0, 1));
    let (x, y) = (dq * a.0 + dr * b.0, dq * a.1 + dr * b.1);
    if x == 0.0 && y == 0.0 {
        return Ok((0.0, 0.0));
    }
    let (o, h) = plan_vers_orbite_heure(x, y);
    let h = arrondi2(h);
    Ok((arrondi2(o / voisin * rayon), if h >= 12.0 { 0.0 } else { h }))
}

fn arrondi2(v: f64) -> f64 {
    ((v * 100.0) + 0.5).floor() / 100.0
}

pub(crate) fn lire_json(json: &str, max: usize) -> Result<serde_json::Map<String, Value>, ErreurEdition> {
    if json.len() > max {
        return Err(ErreurEdition::TropGros { max });
    }
    match serde_json::from_str::<Value>(json) {
        Ok(Value::Object(o)) => Ok(o),
        Ok(_) => Err(ErreurEdition::Json("not an object".into())),
        Err(_) => Err(ErreurEdition::Json("not JSON".into())),
    }
}

/// A number in `[min, max]`, finite.
pub(crate) fn nombre_dans(v: &Value, cle: &str, min: f64, max: f64) -> Result<f64, ErreurEdition> {
    match v.as_f64() {
        Some(n) if n.is_finite() && n >= min && n <= max => Ok(n),
        _ => Err(ErreurEdition::HorsBornes(format!("`{cle}` must be a number in [{min}, {max}]"))),
    }
}

/// `#rrggbb`.
pub(crate) fn est_couleur(v: &Value) -> bool {
    v.as_str().is_some_and(|s| s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|c| c.is_ascii_hexdigit()))
}

// Flat exports (AD-etoiles-3): strings and numbers; a refusal throws with its message.

/// Types of a genre, as a JSON array of strings.
#[wasm_bindgen(js_name = types_astre)]
pub fn types_astre_wasm(genre: &str) -> Result<String, JsError> {
    let t = types_astre(genre).map_err(|e| JsError::new(&e.to_string()))?;
    serde_json::to_string(&t).map_err(|_| JsError::new("serialisation failed"))
}

/// `[orbite, heure]` of a galactic offset.
#[wasm_bindgen(js_name = galactique_vers_orbite_heure)]
pub fn galactique_vers_orbite_heure_wasm(dq: f64, dr: f64, rayon: f64) -> Result<Vec<f64>, JsError> {
    let (o, h) = galactique_vers_orbite_heure(dq, dr, rayon).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(vec![o, h])
}

/// The aspect, re-serialised, when it is valid for `type_astre`; throws otherwise.
#[wasm_bindgen(js_name = valider_aspect)]
pub fn valider_aspect_wasm(type_astre: &str, json: &str) -> Result<String, JsError> {
    valider_aspect(type_astre, json).map_err(|e| JsError::new(&e.to_string()))
}

/// The parameters, re-serialised, when they are valid for `forme`; throws otherwise.
#[wasm_bindgen(js_name = valider_formation)]
pub fn valider_formation_wasm(forme: &str, json: &str) -> Result<String, JsError> {
    valider_formation(forme, json).map_err(|e| JsError::new(&e.to_string()))
}
