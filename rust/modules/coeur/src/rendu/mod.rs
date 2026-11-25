//! `rendu` (AD-carte-1, AD-139, AD-140, AD-149): draws a celestial body from its aspect as RGBA bytes.
//!
//! The renderer reads nothing but its arguments: no file, no clock. Its random streams are those of a
//! generator of its own. The body itself (its continents, its bands, its spots) is seeded by the hash of the
//! canonical aspect, so the thumbnail and the high-definition image show the same body; the fine grain
//! of the image is seeded by the hash of the canonical aspect *and* the side. Same aspect, same side,
//! same version give the same bytes; a modified aspect gives other bytes.
mod catalogue;
mod ciel;
mod corps;
mod etoile;
mod utile;

use serde_json::{json, Value};
use std::fmt;
use utile::{hache, hex, Bruit, Px, V3};
use wasm_bindgen::prelude::*;

pub use catalogue::{catalogue_defaut, types};
pub(crate) use catalogue::{famille, Famille};

/// Version of the renderer: part of the cache hash (AD-142), so a better rendering moves no body.
pub const VERSION_RENDU: u32 = 3;
pub const COTE_MIN: u32 = 16;
pub const COTE_MAX: u32 = 2048;

/// Why `dessiner` refuses. Never a panic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErreurRendu {
    Version(u32),
    Cote(u32),
    TypeInconnu(String),
    Aspect(String),
}

impl fmt::Display for ErreurRendu {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErreurRendu::Version(v) => write!(f, "unknown render version {v}"),
            ErreurRendu::Cote(c) => write!(f, "side {c} is out of [{COTE_MIN}, {COTE_MAX}]"),
            ErreurRendu::TypeInconnu(t) => write!(f, "unknown body type {t}"),
            ErreurRendu::Aspect(m) => write!(f, "invalid aspect: {m}"),
        }
    }
}

/// What every family draws with.
pub(crate) struct Ctx {
    pub cote: usize,
    pub demi: f32,
    pub bruit: Bruit,
    /// Seed of the fine grain: hash of the canonical aspect and the side.
    pub flux: u32,
    pub graine: u32,
    pub pal: Vec<V3>,
    pub asp: Value,
}

impl Ctx {
    pub fn f(&self, k: &str, d: f32) -> f32 {
        self.asp.get(k).and_then(Value::as_f64).map_or(d, |v| v as f32)
    }
    pub fn col(&self, k: &str, d: V3) -> V3 {
        self.asp.get(k).and_then(Value::as_str).and_then(hex).unwrap_or(d)
    }
    pub fn pal_i(&self, i: usize) -> V3 {
        self.pal[i.min(self.pal.len() - 1)]
    }
}

fn fusion(base: &mut Value, sur: &Value) {
    match (base, sur) {
        (Value::Object(a), Value::Object(b)) => {
            for (k, v) in b {
                match a.get_mut(k) {
                    Some(x) => fusion(x, v),
                    None => {
                        a.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (a, b) => *a = b.clone(),
    }
}

const CLES_COULEUR: [&str; 6] = ["halo_couleur", "lumiere_couleur", "couleur", "gaz", "poussiere", "brume"];

/// Draws `aspect_json` (`{"type", "taille"?, "aspect"?}`: the object the generator returns for a body)
/// at `cote` x `cote` pixels: RGBA, straight alpha, `cote * cote * 4` bytes.
pub fn dessiner(aspect_json: &str, cote: u32, version_rendu: u32) -> Result<Vec<u8>, ErreurRendu> {
    dessiner_avec(aspect_json, cote, version_rendu, None, None)
}

/// Share of the requested light colour mixed into `lumiere_couleur` (AD-aspects-socle-1): half the gap.
pub const TEINTE_LUMIERE: f32 = 0.5;

fn octets_hex(s: &str) -> Option<[u8; 3]> {
    if s.len() != 7 || !s.starts_with('#') || !s[1..].bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let o = |i: usize| u8::from_str_radix(s.get(i..i + 2)?, 16).ok();
    Some([o(1)?, o(3)?, o(5)?])
}

/// Same as `dessiner`, with the direction of the star (`angle`, degrees in [0, 360), x to the right, y up;
/// replaces the `lumiere` key of the aspect) and the colour of its light (`lumiere`, `#rrggbb`, mixed for half
/// with `lumiere_couleur`). Neither changes the body itself, only how it is lit.
pub fn dessiner_avec(
    aspect_json: &str,
    cote: u32,
    version_rendu: u32,
    angle: Option<f64>,
    lumiere: Option<&str>,
) -> Result<Vec<u8>, ErreurRendu> {
    if let Some(a) = angle {
        if !(a.is_finite() && (0.0..360.0).contains(&a)) {
            return Err(ErreurRendu::Aspect("`angle` is not a number in [0, 360)".into()));
        }
    }
    let lumiere_octets = match lumiere {
        None => None,
        Some(l) => Some(octets_hex(l).ok_or_else(|| ErreurRendu::Aspect("`lumiere` is not a colour `#rrggbb`".into()))?),
    };
    if version_rendu != VERSION_RENDU {
        return Err(ErreurRendu::Version(version_rendu));
    }
    if !(COTE_MIN..=COTE_MAX).contains(&cote) {
        return Err(ErreurRendu::Cote(cote));
    }
    let entree: Value = serde_json::from_str(aspect_json).map_err(|_| ErreurRendu::Aspect("not JSON".into()))?;
    let objet = entree.as_object().ok_or_else(|| ErreurRendu::Aspect("not an object".into()))?;
    let type_corps = objet
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| ErreurRendu::Aspect("`type` is missing".into()))?;
    let mut asp = catalogue::defaut(type_corps).ok_or_else(|| ErreurRendu::TypeInconnu(type_corps.to_string()))?;
    let propre = match objet.get("aspect") {
        None | Some(Value::Null) => json!({}),
        Some(v) if v.is_object() => v.clone(),
        Some(_) => return Err(ErreurRendu::Aspect("`aspect` is not an object".into())),
    };
    // A variant of the catalogue by nature (e.g. an arid or an oceanic telluric world), then the body's own aspect.
    if let Some(n) = propre.get("nature").and_then(Value::as_str) {
        if let Some(v) = asp.get("variantes").and_then(|v| v.get(n)).cloned() {
            fusion(&mut asp, &v);
        }
    }
    if let Value::Object(o) = &mut asp {
        o.remove("variantes");
    }
    fusion(&mut asp, &propre);

    let pal: Vec<V3> = match asp.get("palette") {
        Some(Value::Array(l)) if !l.is_empty() && l.len() <= 16 => l
            .iter()
            .map(|c| c.as_str().and_then(hex).ok_or_else(|| ErreurRendu::Aspect("colour of the palette".into())))
            .collect::<Result<_, _>>()?,
        _ => return Err(ErreurRendu::Aspect("`palette` is not a list of 1 to 16 colours".into())),
    };
    for k in CLES_COULEUR {
        match asp.get(k) {
            None | Some(Value::Null) => {}
            Some(Value::String(s)) if hex(s).is_some() => {}
            Some(_) => return Err(ErreurRendu::Aspect(format!("colour `{k}`"))),
        }
    }

    // `taille` is the body's size on the map, not a property of its picture.
    // The keys of `NOUVELLES` change how the body is drawn, never which body it is: they are left out of the seed,
    // so a neutral value draws the bytes of a body without the key (AD-aspects-reliefs-1).
    let mut sans_nouvelles = asp.clone();
    if let Value::Object(o) = &mut sans_nouvelles {
        o.retain(|k, _| !crate::edition::est_nouvelle(k));
        // The sign of `courbure` only mirrors the tail: the seed reads its magnitude, so −c is +c flipped.
        if let Some(c) = o.get("courbure").and_then(Value::as_f64).filter(|c| *c < 0.0) {
            o.insert("courbure".into(), json!(-c));
        }
    }
    let canon = json!({ "type": type_corps, "aspect": sans_nouvelles }).to_string();
    let ctx = Ctx {
        cote: cote as usize,
        demi: cote as f32 / 2.0,
        bruit: Bruit { g: hache(utile_hash(&canon)) },
        flux: utile_hash(&format!("{canon}|{cote}")),
        graine: utile_hash(&canon),
        pal,
        asp,
    };
    let mut ctx = ctx;
    if let Some(a) = angle {
        if let Value::Object(o) = &mut ctx.asp {
            o.insert("lumiere".into(), json!(a));
        }
    }
    if let Some(demande) = lumiere_octets {
        let base = ctx.asp.get("lumiere_couleur").and_then(Value::as_str).and_then(octets_hex).unwrap_or([255, 245, 230]);
        let mix: Vec<u8> = (0..3)
            .map(|i| (base[i] as f32 + (demande[i] as f32 - base[i] as f32) * TEINTE_LUMIERE).round().clamp(0.0, 255.0) as u8)
            .collect();
        if let Value::Object(o) = &mut ctx.asp {
            o.insert("lumiere_couleur".into(), json!(format!("#{:02x}{:02x}{:02x}", mix[0], mix[1], mix[2])));
        }
    }
    // The bands of a gas giant read `bandes_couleurs` in place of the palette.
    if matches!(catalogue::famille(type_corps), Some(catalogue::Famille::Planete(catalogue::Kind::Gazeuse))) {
        if let Some(l) = ctx.asp.get("bandes_couleurs").and_then(Value::as_array) {
            let b: Option<Vec<V3>> = l.iter().map(|c| c.as_str().and_then(hex)).collect();
            match b {
                Some(b) if (1..=16).contains(&b.len()) => ctx.pal = b,
                _ => return Err(ErreurRendu::Aspect("`bandes_couleurs` is not a list of 1 to 16 colours".into())),
            }
        }
    }
    let pixels: Vec<Px> = match catalogue::famille(type_corps) {
        Some(catalogue::Famille::Etoile) => etoile::rendre(&ctx),
        Some(catalogue::Famille::Planete(k)) => corps::rendre(&ctx, k),
        Some(catalogue::Famille::Comete) => ciel::comete(&ctx),
        Some(catalogue::Famille::Nebuleuse) => ciel::nebuleuse(&ctx),
        Some(catalogue::Famille::Ceinture) => ciel::roches(&ctx, true),
        Some(catalogue::Famille::Champ) => ciel::roches(&ctx, false),
        Some(catalogue::Famille::Anomalie) => ciel::anomalie(&ctx),
        None => return Err(ErreurRendu::TypeInconnu(type_corps.to_string())),
    };
    Ok(vers_octets(&ctx, &pixels))
}

fn utile_hash(s: &str) -> u32 {
    crate::generation::hash32(s)
}

/// Soft clip above 0.8, then back to sRGB, with the grain of the side-seeded stream.
fn vers_octets(ctx: &Ctx, px: &[Px]) -> Vec<u8> {
    let mut out = Vec::with_capacity(px.len() * 4);
    let mut flux = utile::Flux(ctx.flux);
    for p in px {
        let a = p[3].clamp(0.0, 1.0);
        if a <= 0.0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
            continue;
        }
        let grain = (flux.suivant() - 0.5) * (1.6 / 255.0);
        for c in &p[..3] {
            let l = (c / a).max(0.0);
            let l = if l > 0.8 {
                let x = (l - 0.8) / 0.2;
                0.8 + 0.2 * x / (1.0 + x)
            } else {
                l
            };
            out.push(((l.sqrt() + grain).clamp(0.0, 1.0) * 255.0 + 0.5) as u8);
        }
        out.push((a * 255.0 + 0.5) as u8);
    }
    out
}

// Flat exports (AD-etoiles-3): strings, numbers, bytes.

/// The picture of a body: `cote * cote * 4` RGBA bytes (`angle` and `lumiere` optional). Throws for an unknown type, version or a side out of [16, 2048].
#[wasm_bindgen]
pub fn dessiner_astre(
    aspect_json: &str,
    cote: u32,
    version_rendu: u32,
    angle: Option<f64>,
    lumiere: Option<String>,
) -> Result<Vec<u8>, JsError> {
    dessiner_avec(aspect_json, cote, version_rendu, angle, lumiere.as_deref()).map_err(|e| JsError::new(&e.to_string()))
}

/// Seed of a body from its system key and its own key (AD-aspects-socle-2): same pair, same seed.
pub fn graine_de(cle_systeme: &str, cle_corps: &str) -> u32 {
    utile_hash(&format!("{cle_systeme}\u{1f}{cle_corps}"))
}

/// Seed of a body, see `graine_de`.
#[wasm_bindgen(js_name = graine_de)]
pub fn graine_de_wasm(cle_systeme: &str, cle_corps: &str) -> u32 {
    graine_de(cle_systeme, cle_corps)
}

/// Version of the renderer.
#[wasm_bindgen]
pub fn version_rendu() -> u32 {
    VERSION_RENDU
}

/// The default catalogue of aspects, as JSON: `{"version", "types": {<type>: <aspect>}}`.
#[wasm_bindgen]
pub fn catalogue_aspects() -> String {
    catalogue_defaut().to_string()
}
