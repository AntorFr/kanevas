//! `valider_formation`: the parameters of a ring or a cloud (`swn_formations.parametres`).
use super::{est_couleur, lire_json, nombre_dans, ErreurEdition, MAX_FORMATION, ORBITE_MAX};
use serde_json::{Map, Value};

fn materiaux(v: &Value) -> Result<(), ErreurEdition> {
    let ok = v.as_array().is_some_and(|l| {
        l.len() <= 16
            && l.iter().all(|m| {
                m.as_array().is_some_and(|p| {
                    p.len() == 2
                        && p[0].as_str().is_some_and(|s| (1..=32).contains(&s.chars().count()))
                        && p[1].as_f64().is_some_and(|n| n.is_finite() && n > 0.0 && n <= 100.0)
                })
            })
    });
    if ok { Ok(()) } else { Err(ErreurEdition::HorsBornes("`materiaux` must be up to 16 pairs [name, weight > 0]".into())) }
}

fn commun(k: &str, v: &Value) -> Result<bool, ErreurEdition> {
    match k {
        "rochers" => nombre_dans(v, k, 0.0, 2.0).map(|_| true),
        "materiaux" => materiaux(v).map(|_| true),
        _ => Ok(false),
    }
}

fn anneau(o: &Map<String, Value>) -> Result<(), ErreurEdition> {
    for (k, v) in o {
        if commun(k, v)? {
            continue;
        }
        match k.as_str() {
            "de" | "a" => {
                nombre_dans(v, k, 0.0, ORBITE_MAX)?;
            }
            "arc" => {
                // The part of the ring that exists: `[debut, fin]` in hours, each in [0, 12), going clockwise.
                let ok = v.as_array().is_some_and(|p| {
                    p.len() == 2 && p.iter().all(|h| h.as_f64().is_some_and(|h| h.is_finite() && (0.0..12.0).contains(&h)))
                }) && v[0].as_f64() != v[1].as_f64();
                if !ok {
                    return Err(ErreurEdition::HorsBornes("`arc` must be two different hours [start, end] in [0, 12)".into()));
                }
            }
            _ => return Err(ErreurEdition::CleInconnue(k.clone())),
        }
    }
    let (de, a) = match (o.get("de").and_then(Value::as_f64), o.get("a").and_then(Value::as_f64)) {
        (Some(de), Some(a)) => (de, a),
        _ => return Err(ErreurEdition::Invalide("a ring needs `de` and `a`".into())),
    };
    if de >= a {
        return Err(ErreurEdition::HorsBornes("`de` must be smaller than `a`".into()));
    }
    Ok(())
}

fn nuage(o: &Map<String, Value>) -> Result<(), ErreurEdition> {
    for (k, v) in o {
        if commun(k, v)? {
            continue;
        }
        match k.as_str() {
            "orbite" => {
                nombre_dans(v, k, 0.0, ORBITE_MAX)?;
            }
            "heure" => {
                if !v.as_f64().is_some_and(|h| h.is_finite() && (0.0..12.0).contains(&h)) {
                    return Err(ErreurEdition::HorsBornes("`heure` must be a number in [0, 12)".into()));
                }
            }
            "brume" => {
                if !(v.is_null() || est_couleur(v)) {
                    return Err(ErreurEdition::HorsBornes("`brume` must be null or a colour `#rrggbb`".into()));
                }
            }
            "centres" => {
                let l = v.as_array().filter(|l| (1..=16).contains(&l.len()));
                let l = l.ok_or_else(|| ErreurEdition::HorsBornes("`centres` must hold 1 to 16 centres".into()))?;
                for c in l {
                    let t = c.as_array().filter(|t| t.len() == 3);
                    let t = t.ok_or_else(|| ErreurEdition::HorsBornes("a centre is [orbite, heure, taille]".into()))?;
                    let (ob, h, ta) = (&t[0], &t[1], &t[2]);
                    // The centre is inside the extent: its farthest edge stays within the largest orbit.
                    nombre_dans(ob, "centres orbite", 0.0, ORBITE_MAX)?;
                    nombre_dans(&h.clone(), "centres heure", 0.0, 12.0)?;
                    if h.as_f64() == Some(12.0) {
                        return Err(ErreurEdition::HorsBornes("a centre's hour must be in [0, 12)".into()));
                    }
                    let ta = nombre_dans(ta, "centres taille", 0.0, 100.0)?;
                    if ta <= 0.0 || ob.as_f64().unwrap_or(0.0) + ta > ORBITE_MAX {
                        return Err(ErreurEdition::HorsBornes("a centre's size must be > 0 and stay inside the extent".into()));
                    }
                }
            }
            _ => return Err(ErreurEdition::CleInconnue(k.clone())),
        }
    }
    Ok(())
}

/// Checks `json` (an object, at most 8 KiB) as the parameters of a zone of shape `forme` (`anneau` or `nuage`):
/// known keys only; a ring has `de` ≥ 0 smaller than `a`, and may have an `arc`; a cloud's centres lie inside
/// the extent (orbit and size within 1 000, hour in [0, 12)). Returns the parameters re-serialised.
pub fn valider_formation(forme: &str, json: &str) -> Result<String, ErreurEdition> {
    if forme != "anneau" && forme != "nuage" {
        return Err(ErreurEdition::FormeInconnue(forme.to_string()));
    }
    let o = lire_json(json, MAX_FORMATION)?;
    if forme == "anneau" { anneau(&o)? } else { nuage(&o)? }
    Ok(Value::Object(o).to_string())
}
