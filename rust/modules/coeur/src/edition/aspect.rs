//! `valider_aspect`: the keys an aspect may carry and their bounds. Defaults of the catalogue pass.
use super::{est_couleur, lire_json, nombre_dans, ErreurEdition, MAX_ASPECT};
use crate::rendu::{famille, types, Famille};
use serde_json::Value;

/// Numeric keys with their bounds.
pub(crate) const NOMBRES: [(&str, f64, f64); 31] = [
    ("mer", 0.0, 1.0),
    ("nuages", 0.0, 1.0),
    ("calottes", 0.0, 1.0),
    ("relief", 0.0, 2.0),
    ("echelle", 0.0, 4.0),
    ("halo", 0.0, 1.0),
    ("bord", 0.0, 1.0),
    ("fissures", 0.0, 1.0),
    ("cratere", 0.0, 1.0),
    ("bandes", 0.0, 1.0),
    ("tempete", 0.0, 1.0),
    ("terminateur", 0.0, 1.0),
    ("couronne", 0.0, 2.0),
    ("granulation", 0.0, 4.0),
    ("taches", 0.0, 1.0),
    ("densite", 0.0, 1.0),
    ("etoiles", 0.0, 1.0),
    ("rochers", 0.0, 2.0),
    ("torsion", 0.0, 4.0),
    ("longueur", 0.0, 2.0),
    ("ouverture", 0.0, 1.0),
    ("courbure", -1.0, 1.0),
    ("force_gaz", 0.0, 2.0),
    ("force_poussiere", 0.0, 2.0),
    ("tete", 0.0, 5.0),
    ("perihelie", 0.0, 1000.0),
    ("rayons", 0.0, 32.0),
    ("bras", 1.0, 12.0),
    ("graine", 0.0, 4_294_967_295.0),
    ("turbulence", 0.0, 2.0),
    ("crateres_nombre", 0.0, 2000.0),
];
pub(crate) const COULEURS: [&str; 7] = ["halo_couleur", "lumiere_couleur", "couleur", "gaz", "poussiere", "brume", "fond"];
const AUTRES: [&str; 9] = ["palette", "nature", "sens", "serree", "variantes", "tache", "bandes_couleurs", "anneau", "disparue"];

/// What a key of `NOUVELLES` holds.
#[derive(Clone, Copy)]
pub(crate) enum Genre {
    /// A number in `[min, max]`.
    Nombre(f64, f64),
    /// An integer in `[min, max]`.
    Entier(f64, f64),
    /// A colour `#rrggbb`, `null` clears it.
    Couleur,
    /// One of the listed words.
    Choix(&'static [&'static str]),
}

const ETOILES: &[&str] =
    &["naine_rouge", "orange", "jaune_orange", "jaune", "jaune_vert", "blanche", "geante_rouge", "naine_blanche", "geante_bleue", "etoile"];
const PLANETES: &[&str] = &["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse"];

/// The keys of `kanevas-carte-rendu-aspects-reliefs` (AD-aspects-reliefs-1): name, kind and bound, and the
/// types that draw it. The one list: validation, the sorting of `trier_aspect` and the exclusion of these keys from
/// the seed of a body (a neutral value draws the bytes of a body without the key) all read it.
pub(crate) const NOUVELLES: &[(&str, Genre, &[&str])] = &[
    ("couleur_nuages", Genre::Couleur, &["tellurique", "verrouillee"]),
    ("opacite_nuages", Genre::Nombre(0.0, 1.0), &["tellurique", "verrouillee"]),
    ("terre_seche", Genre::Nombre(0.0, 1.0), &["tellurique", "verrouillee"]),
    ("etirement", Genre::Nombre(0.25, 4.0), &["tellurique", "verrouillee", "gazeuse"]),
    ("eclairs", Genre::Nombre(0.0, 1.0), &["tellurique", "gazeuse"]),
    ("inclinaison", Genre::Nombre(-90.0, 90.0), PLANETES),
    ("mers", Genre::Entier(1.0, 8.0), &["tellurique"]),
    ("atmosphere_epaisseur", Genre::Nombre(0.0, 1.0), PLANETES),
    ("canyons", Genre::Nombre(0.0, 1.0), &["rocheux", "tellurique"]),
    ("lave", Genre::Nombre(0.0, 1.0), &["rocheux"]),
    ("cristaux", Genre::Nombre(0.0, 1.0), &["glace", "rocheux"]),
    ("geysers", Genre::Nombre(0.0, 1.0), &["glace", "rocheux"]),
    ("couleur_fissures", Genre::Couleur, &["glace", "rocheux", "lave"]),
    ("cratere_glace", Genre::Nombre(0.0, 1.0), &["glace"]),
    ("activite", Genre::Nombre(0.0, 1.0), ETOILES),
    ("intensite", Genre::Nombre(0.0, 2.0), ETOILES),
    ("vue", Genre::Choix(&["profil", "face"]), &["comete"]),
];

/// Is `k` a key of the slice?
pub(crate) fn est_nouvelle(k: &str) -> bool {
    NOUVELLES.iter().any(|(n, _, _)| *n == k)
}

fn cle_connue(k: &str) -> bool {
    NOMBRES.iter().any(|(n, _, _)| *n == k) || COULEURS.contains(&k) || AUTRES.contains(&k) || est_nouvelle(k)
}

/// A key of `NOUVELLES`: bound, integer or colour, then the types that draw it.
fn valider_nouvelle(type_astre: &str, k: &str, v: &Value) -> Result<(), ErreurEdition> {
    let Some((_, genre, types)) = NOUVELLES.iter().find(|(n, _, _)| *n == k) else { return Ok(()) };
    match *genre {
        Genre::Nombre(min, max) => {
            nombre_dans(v, k, min, max)?;
        }
        Genre::Entier(min, max) => {
            nombre_dans(v, k, min, max)?;
            if v.as_f64().is_some_and(|n| n.fract() != 0.0) {
                return Err(ErreurEdition::HorsBornes(format!("`{k}` must be an integer")));
            }
        }
        Genre::Choix(mots) => {
            if !v.as_str().is_some_and(|m| mots.contains(&m)) {
                return Err(ErreurEdition::HorsBornes(format!("`{k}` must be one of: {}", mots.join(", "))));
            }
        }
        Genre::Couleur => {
            if !(v.is_null() || est_couleur(v)) {
                return Err(ErreurEdition::HorsBornes(format!("`{k}` must be a colour `#rrggbb`")));
            }
        }
    }
    if !types.contains(&type_astre) {
        return Err(ErreurEdition::Invalide(format!("`{k}` is not drawn on a `{type_astre}` body, only on: {}", types.join(", "))));
    }
    Ok(())
}

/// Checks the JSON `json` (an object, at most 4 KiB) as the aspect of a body of type `type_astre`: known keys
/// only, each within its bounds. Returns the aspect re-serialised. The aspect is merged over the catalogue's
/// default of the type, so any subset of keys is valid.
pub fn valider_aspect(type_astre: &str, json: &str) -> Result<String, ErreurEdition> {
    if !types().contains(&type_astre) {
        return Err(ErreurEdition::TypeInconnu(type_astre.to_string()));
    }
    let o = lire_json(json, MAX_ASPECT)?;
    for (k, v) in &o {
        if !cle_connue(k) {
            return Err(ErreurEdition::CleInconnue(k.clone()));
        }
        if est_nouvelle(k) {
            valider_nouvelle(type_astre, k, v)?;
            continue;
        }
        if let Some((_, min, max)) = NOMBRES.iter().find(|(n, _, _)| n == k) {
            nombre_dans(v, k, *min, *max)?;
            if *k == "courbure" && type_astre != "comete" {
                return Err(ErreurEdition::Invalide(format!("`{k}` is not drawn on a `{type_astre}` body, only on: comete")));
            }
            if *k == "graine" || *k == "rayons" || *k == "bras" || *k == "crateres_nombre" {
                if v.as_f64().is_some_and(|n| n.fract() != 0.0) {
                    return Err(ErreurEdition::HorsBornes(format!("`{k}` must be an integer")));
                }
            }
            continue;
        }
        match k.as_str() {
            "palette" => {
                let l = v.as_array().filter(|l| (1..=16).contains(&l.len()));
                if !l.is_some_and(|l| l.iter().all(est_couleur)) {
                    return Err(ErreurEdition::HorsBornes("`palette` must hold 1 to 16 colours `#rrggbb`".into()));
                }
            }
            "bandes_couleurs" => {
                let l = v.as_array().filter(|l| (1..=16).contains(&l.len()));
                if !l.is_some_and(|l| l.iter().all(est_couleur)) {
                    return Err(ErreurEdition::HorsBornes("`bandes_couleurs` must hold 1 to 16 colours `#rrggbb`".into()));
                }
            }
            "tache" => objet_borne(k, v, &[("latitude", -1.0, 1.0), ("taille", 0.02, 0.4)], &["couleur"])?,
            "anneau" => {
                if v != &Value::Bool(false) {
                    objet_borne(
                        k,
                        v,
                        &[("interieur", 1.1, 2.5), ("exterieur", 1.2, 3.5), ("inclinaison", 0.12, 1.2), ("angle", -7.0, 7.0), ("opacite", 0.0, 1.0)],
                        &["couleur", "couleur2"],
                    )?
                }
            }
            "disparue" => {
                if !v.is_boolean() {
                    return Err(ErreurEdition::HorsBornes("`disparue` must be a boolean".into()));
                }
                if v == &Value::Bool(true) && famille(type_astre) != Some(Famille::Etoile) {
                    return Err(ErreurEdition::HorsBornes("`disparue` is for a star only".into()));
                }
            }
            "nature" => {
                if !(v.is_null() || v.as_str().is_some_and(|s| (1..=40).contains(&s.chars().count()))) {
                    return Err(ErreurEdition::HorsBornes("`nature` must be 1 to 40 characters".into()));
                }
            }
            "sens" => {
                if !matches!(v.as_i64(), Some(1) | Some(-1)) {
                    return Err(ErreurEdition::HorsBornes("`sens` must be 1 or -1".into()));
                }
            }
            "serree" => {
                if !v.is_boolean() {
                    return Err(ErreurEdition::HorsBornes("`serree` must be a boolean".into()));
                }
            }
            "variantes" => {
                if !v.is_object() {
                    return Err(ErreurEdition::HorsBornes("`variantes` must be an object".into()));
                }
            }
            _ => {
                // A colour key (`null` clears it, as the generator's brume does).
                if !(v.is_null() || est_couleur(v)) {
                    return Err(ErreurEdition::HorsBornes(format!("`{k}` must be a colour `#rrggbb`")));
                }
            }
        }
    }
    Ok(Value::Object(o).to_string())
}

/// Keys of the objects `tache` and `anneau`, and the objects that may carry unknown keys.
const SOUS_OBJETS: [(&str, &[&str]); 2] = [
    ("tache", &["latitude", "taille", "couleur"]),
    ("anneau", &["interieur", "exterieur", "inclinaison", "angle", "opacite", "couleur", "couleur2"]),
];

/// Sorts an aspect (AD-aspects-socle-2): keys the core does not know are removed at any depth and listed by
/// path (`aspect.x`, `aspect.anneau.y`); the rest is validated as `valider_aspect` does, so a known key out of
/// bounds is still a refusal. Returns `{"garde": <aspect>, "inconnues": [<paths>]}`.
pub fn trier_aspect(type_astre: &str, json: &str) -> Result<String, ErreurEdition> {
    if !types().contains(&type_astre) {
        return Err(ErreurEdition::TypeInconnu(type_astre.to_string()));
    }
    let mut o = lire_json(json, MAX_ASPECT)?;
    let mut inconnues: Vec<String> = Vec::new();
    let cles: Vec<String> = o.keys().cloned().collect();
    for k in cles {
        if !cle_connue(&k) {
            o.remove(&k);
            inconnues.push(format!("aspect.{k}"));
            continue;
        }
        if let Some((_, connues)) = SOUS_OBJETS.iter().find(|(n, _)| *n == k) {
            if let Some(Value::Object(sous)) = o.get_mut(&k) {
                let ks: Vec<String> = sous.keys().cloned().collect();
                for sk in ks {
                    if !connues.contains(&sk.as_str()) {
                        sous.remove(&sk);
                        inconnues.push(format!("aspect.{k}.{sk}"));
                    }
                }
            }
        }
    }
    let garde = valider_aspect(type_astre, &Value::Object(o).to_string())?;
    let garde: Value = serde_json::from_str(&garde).map_err(|_| ErreurEdition::Json("not JSON".into()))?;
    Ok(serde_json::json!({ "garde": garde, "inconnues": inconnues }).to_string())
}

/// An object of numbers within bounds and colours, every key optional, no other key.
fn objet_borne(cle: &str, v: &Value, nombres: &[(&str, f64, f64)], couleurs: &[&str]) -> Result<(), ErreurEdition> {
    let o = v.as_object().ok_or_else(|| ErreurEdition::HorsBornes(format!("`{cle}` must be an object")))?;
    for (k, x) in o {
        if let Some((_, min, max)) = nombres.iter().find(|(n, _, _)| n == k) {
            nombre_dans(x, &format!("{cle}.{k}"), *min, *max)?;
        } else if couleurs.contains(&k.as_str()) {
            if !est_couleur(x) {
                return Err(ErreurEdition::HorsBornes(format!("`{cle}.{k}` must be a colour `#rrggbb`")));
            }
        } else {
            return Err(ErreurEdition::CleInconnue(format!("{cle}.{k}")));
        }
    }
    Ok(())
}
