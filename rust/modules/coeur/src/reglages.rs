//! `reglages` (AD-reglages-1, AD-reglages-2, AD-reglages-6, AD-147, AD-148): the settings object of the
//! generator, per version, and the default catalogue of aspects. The defaults live here and nowhere else; a
//! service stores only what the GM moved. Pure: no file, no clock; a refusal is a value, never a panic.
//!
//! The object is exactly what `tirer_systeme` reads of the settings:
//! `{ frequences: { comete, zone, nebuleuse }, par_classe: { <classe>: { planetes, lunes, ceintures, total } } }`.
//! - `frequences`: reals in [0, 1]. `zone` is the chance of a ring or a cloud; a class that favours it
//!   (the blue giant) scales it, keeping the source's ratio.
//! - `par_classe` is keyed by the star class of the draw (`naine_rouge`, `orange`, `jaune`, `jaune_vert`,
//!   `blanche`, `naine_blanche`, `geante_rouge`, `geante_bleue`): the draw's own classes, not the six letters
//!   of the screen, because one letter holds two classes that the draw treats differently (M: red dwarf and
//!   red giant). Each is a range `[min, max]` of integers: `planetes` 0-12, `lunes` per planet 0-8, `ceintures`
//!   0-2 (the draw knows two belts), `total` of bodies on the map 0-16.
//! The draw of the stars takes none of it (AD-reglages-3).
use crate::edition::{valider_aspect, COULEURS, NOMBRES};
use crate::generation::{plage, FREQ_ZONE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

/// The generator versions the core knows, oldest first (AD-148).
pub const VERSIONS_GENERATEUR: [u32; 1] = [1];
/// The version a galaxy created now draws with: the last known.
pub const VERSION_GENERATEUR_COURANTE: u32 = VERSIONS_GENERATEUR[VERSIONS_GENERATEUR.len() - 1];

/// Largest settings JSON, in bytes.
pub const MAX_REGLAGES: usize = 8 * 1024;
/// Largest partial aspect JSON, in bytes.
pub const MAX_ASPECT_TYPE: usize = 4 * 1024;

/// Star classes of the draw, in the order of the screen's table.
pub const CLASSES: [&str; 8] =
    ["naine_rouge", "orange", "jaune", "jaune_vert", "blanche", "naine_blanche", "geante_rouge", "geante_bleue"];

const CHAMPS_PLAGE: [(&str, i64); 4] = [("planetes", 12), ("lunes", 8), ("ceintures", 2), ("total", 16)];
const FREQUENCES: [&str; 3] = ["comete", "zone", "nebuleuse"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Frequences {
    pub comete: f64,
    pub zone: f64,
    pub nebuleuse: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParClasse {
    pub planetes: [i32; 2],
    pub lunes: [i32; 2],
    pub ceintures: [i32; 2],
    pub total: [i32; 2],
}

/// The complete settings object of a generator version.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reglages {
    pub frequences: Frequences,
    pub par_classe: BTreeMap<String, ParClasse>,
}

/// Why a settings or aspect object is refused: the field, the bound (a sentence, empty when none) and the message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErreurReglage {
    pub champ: String,
    pub borne: String,
    pub message: String,
}

impl ErreurReglage {
    fn new(champ: impl Into<String>, borne: impl Into<String>, message: impl Into<String>) -> Self {
        ErreurReglage { champ: champ.into(), borne: borne.into(), message: message.into() }
    }
    fn borne(champ: impl Into<String>, borne: String) -> Self {
        ErreurReglage { champ: champ.into(), message: borne.clone(), borne }
    }
    fn json(&self) -> Value {
        json!({ "ok": false, "champ": self.champ, "borne": self.borne, "message": self.message })
    }
}

fn version_connue(version: u32) -> Result<(), ErreurReglage> {
    if VERSIONS_GENERATEUR.contains(&version) {
        Ok(())
    } else {
        Err(ErreurReglage::new("version_generateur", "", "Version inconnue."))
    }
}

/// The complete default object of a version.
pub fn defaut(version: u32) -> Result<Reglages, ErreurReglage> {
    version_connue(version)?;
    let par_classe = CLASSES
        .iter()
        .map(|c| {
            let p = plage(c);
            let presentes = p.ceintures.iter().filter(|(_, w)| *w > 0.0).map(|(n, _)| *n);
            let (mn, mx) = (presentes.clone().min().unwrap_or(0), presentes.max().unwrap_or(0));
            (
                (*c).to_string(),
                ParClasse {
                    planetes: [p.planetes.0, p.planetes.1],
                    lunes: [0, 5],
                    ceintures: [mn, mx],
                    total: [4, 12],
                },
            )
        })
        .collect();
    Ok(Reglages { frequences: Frequences { comete: 1.0 / 3.0, zone: FREQ_ZONE, nebuleuse: 0.7 }, par_classe })
}

fn en_valeur(r: &Reglages) -> Value {
    serde_json::to_value(r).expect("settings serialise")
}

/// `Entre 0 et 12.`
fn phrase_borne(max: impl std::fmt::Display) -> String {
    format!("Entre 0 et {max}.")
}

fn objet<'a>(v: &'a Value, champ: &str) -> Result<&'a Map<String, Value>, ErreurReglage> {
    v.as_object().ok_or_else(|| ErreurReglage::new(champ, "", "Objet attendu."))
}

/// Validates an override and returns its canonical form: only the keys that differ from the defaults.
fn valider_surcharge(version: u32, json: &str) -> Result<Value, ErreurReglage> {
    let defauts = en_valeur(&defaut(version)?);
    if json.len() > MAX_REGLAGES {
        return Err(ErreurReglage::new("valeurs", format!("{} octets au plus.", MAX_REGLAGES), "Réglages trop volumineux."));
    }
    let v: Value = serde_json::from_str(json).map_err(|_| ErreurReglage::new("valeurs", "", "JSON invalide."))?;
    let racine = objet(&v, "valeurs")?;
    let mut sortie = Map::new();
    for (k, v) in racine {
        match k.as_str() {
            "frequences" => {
                let mut f = Map::new();
                for (n, x) in objet(v, "frequences")? {
                    let champ = format!("frequences.{n}");
                    if !FREQUENCES.contains(&n.as_str()) {
                        return Err(ErreurReglage::new(champ, "", "Clé inconnue."));
                    }
                    let x = x.as_f64().filter(|x| x.is_finite() && (0.0..=1.0).contains(x));
                    let x = x.ok_or_else(|| ErreurReglage::borne(champ, phrase_borne(1)))?;
                    if defauts["frequences"][n].as_f64() != Some(x) {
                        f.insert(n.clone(), json!(x));
                    }
                }
                if !f.is_empty() {
                    sortie.insert(k.clone(), Value::Object(f));
                }
            }
            "par_classe" => {
                let mut pc = Map::new();
                for (classe, c) in objet(v, "par_classe")? {
                    if !CLASSES.contains(&classe.as_str()) {
                        return Err(ErreurReglage::new(format!("par_classe.{classe}"), "", "Clé inconnue."));
                    }
                    let mut o = Map::new();
                    for (n, plage) in objet(c, &format!("par_classe.{classe}"))? {
                        let champ = format!("par_classe.{classe}.{n}");
                        let Some((_, max)) = CHAMPS_PLAGE.iter().find(|(c, _)| c == n) else {
                            return Err(ErreurReglage::new(champ, "", "Clé inconnue."));
                        };
                        let paire = plage.as_array().filter(|l| l.len() == 2).map(|l| (l[0].as_i64(), l[1].as_i64()));
                        let Some((Some(a), Some(b))) = paire else {
                            return Err(ErreurReglage::new(champ, "", "Deux entiers attendus : minimum et maximum."));
                        };
                        if !(0..=*max).contains(&a) || !(0..=*max).contains(&b) {
                            return Err(ErreurReglage::borne(champ, phrase_borne(max)));
                        }
                        if a > b {
                            return Err(ErreurReglage::new(champ, "", "Le minimum dépasse le maximum."));
                        }
                        if defauts["par_classe"][classe][n] != json!([a, b]) {
                            o.insert(n.clone(), json!([a, b]));
                        }
                    }
                    if !o.is_empty() {
                        pc.insert(classe.clone(), Value::Object(o));
                    }
                }
                if !pc.is_empty() {
                    sortie.insert(k.clone(), Value::Object(pc));
                }
            }
            _ => return Err(ErreurReglage::new(k.clone(), "", "Clé inconnue.")),
        }
    }
    Ok(Value::Object(sortie))
}

fn fusion(base: &mut Value, dessus: &Value) {
    match (base, dessus) {
        (Value::Object(b), Value::Object(d)) => {
            for (k, v) in d {
                match b.get_mut(k) {
                    Some(x) => fusion(x, v),
                    None => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, d) => *b = d.clone(),
    }
}

/// The override, validated, over the defaults of the version: the complete object.
pub fn fusionner(version: u32, surcharge_json: &str) -> Result<Reglages, ErreurReglage> {
    let surcharge = valider_surcharge(version, surcharge_json)?;
    let mut complet = en_valeur(&defaut(version)?);
    fusion(&mut complet, &surcharge);
    serde_json::from_value(complet).map_err(|_| ErreurReglage::new("valeurs", "", "Réglages invalides."))
}

/// What `tirer_systeme` takes: a complete object, or any valid subset of one, over the version's defaults.
pub fn reglages_complets(version: u32, json: &str) -> Result<Reglages, ErreurReglage> {
    fusionner(version, json)
}

/// `{ ok: true, canonique }` or `{ ok: false, champ, borne, message }` (AD-reglages-1).
pub fn valider(version: u32, surcharge_json: &str) -> Value {
    match valider_surcharge(version, surcharge_json) {
        Ok(c) => json!({ "ok": true, "canonique": c }),
        Err(e) => e.json(),
    }
}

/// The default parameters of every type of the catalogue of aspects (AD-reglages-6).
pub fn types_catalogue() -> Value {
    crate::rendu::catalogue_defaut()["types"].clone()
}

/// Validates the partial aspect of a type the GM overrides: `{ ok: true, canonique }` or the refusal.
pub fn valider_aspect_type(type_astre: &str, json_partiel: &str) -> Value {
    if json_partiel.len() > MAX_ASPECT_TYPE {
        return ErreurReglage::new("parametres", "4 Kio au plus.", "Paramètres trop volumineux.").json();
    }
    use crate::edition::ErreurEdition as E;
    match valider_aspect(type_astre, json_partiel) {
        Ok(c) => json!({ "ok": true, "canonique": serde_json::from_str::<Value>(&c).unwrap_or(Value::Null) }),
        Err(E::TypeInconnu(_)) => ErreurReglage::new("type", "", "Type inconnu.").json(),
        Err(E::TropGros { .. }) => ErreurReglage::new("parametres", "4 Kio au plus.", "Paramètres trop volumineux.").json(),
        Err(E::Json(_)) | Err(E::GenreInconnu(_)) | Err(E::FormeInconnue(_)) => {
            ErreurReglage::new("parametres", "", "Objet JSON attendu.").json()
        }
        Err(E::CleInconnue(k)) => ErreurReglage::new(k, "", "Clé inconnue.").json(),
        Err(E::HorsBornes(m)) | Err(E::Invalide(m)) => {
            let cle = m.split('`').nth(1).unwrap_or("parametres").to_string();
            let nombre = NOMBRES.iter().find(|(n, _, _)| *n == cle);
            let e = if let Some((_, mn, mx)) = nombre {
                let ok_borne = serde_json::from_str::<Value>(json_partiel)
                    .ok()
                    .and_then(|v| v.get(&cle).and_then(Value::as_f64))
                    .is_some_and(|x| x >= *mn && x <= *mx);
                if ok_borne {
                    ErreurReglage::new(cle, "", "Nombre entier attendu.")
                } else {
                    ErreurReglage::borne(cle, format!("Entre {mn} et {mx}."))
                }
            } else if COULEURS.contains(&cle.as_str()) || cle == "palette" {
                ErreurReglage::borne(cle, "Couleur invalide : #rrggbb.".to_string())
            } else {
                ErreurReglage::new(cle, "", "Valeur invalide.")
            };
            e.json()
        }
    }
}

// Flat exports (AD-139): strings and numbers; a refusal of a draw throws, a validation answers a value.

/// The complete default object of a version, as JSON; throws for an unknown version.
#[wasm_bindgen]
pub fn reglages_defaut(version: u32) -> Result<String, JsError> {
    let d = defaut(version).map_err(|e| JsError::new(&e.message))?;
    Ok(en_valeur(&d).to_string())
}

/// `{ ok, canonique }` or `{ ok: false, champ, borne, message }`.
#[wasm_bindgen]
pub fn valider_reglages(version: u32, surcharge_json: &str) -> String {
    valider(version, surcharge_json).to_string()
}

/// The complete object, the override over the defaults; throws with the message when the override is refused.
#[wasm_bindgen]
pub fn fusionner_reglages(version: u32, surcharge_json: &str) -> Result<String, JsError> {
    let r = fusionner(version, surcharge_json).map_err(|e| JsError::new(&e.message))?;
    Ok(en_valeur(&r).to_string())
}

/// The generator versions the core knows.
#[wasm_bindgen]
pub fn versions_generateur() -> Vec<u32> {
    VERSIONS_GENERATEUR.to_vec()
}

/// The version a galaxy created now draws with.
#[wasm_bindgen]
pub fn version_generateur_courante() -> u32 {
    VERSION_GENERATEUR_COURANTE
}

/// `{ ok, canonique }` or `{ ok: false, champ, borne, message }` for the partial aspect of a type.
#[wasm_bindgen(js_name = valider_aspect_type)]
pub fn valider_aspect_type_wasm(type_astre: &str, json_partiel: &str) -> String {
    valider_aspect_type(type_astre, json_partiel).to_string()
}

/// The default parameters of every type, as a JSON object `{ <type>: <aspect> }`.
#[wasm_bindgen(js_name = types_catalogue)]
pub fn types_catalogue_wasm() -> String {
    types_catalogue().to_string()
}
