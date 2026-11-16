//! The default catalogue of aspects of the core (AD-147, AD-carte-1): the types and palettes of Éneria's
//! `astres.yaml`, held only here. A body's own aspect is merged over its type's entry; lighting, atmosphere,
//! ring shadow and corona are parameters of the aspect with these defaults, none a new family (AD-149).
use serde_json::{json, Value};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Tellurique,
    Verrouillee,
    Glace,
    Rocheux,
    Lave,
    Gazeuse,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Famille {
    Etoile,
    Planete(Kind),
    Comete,
    Nebuleuse,
    Ceinture,
    Champ,
    Anomalie,
}

const ETOILES: [&str; 10] = [
    "naine_rouge",
    "orange",
    "jaune_orange",
    "jaune",
    "jaune_vert",
    "blanche",
    "geante_rouge",
    "naine_blanche",
    "geante_bleue",
    "etoile",
];

/// Every type of the default catalogue.
pub fn types() -> Vec<&'static str> {
    let mut t = ETOILES.to_vec();
    t.extend([
        "tellurique",
        "verrouillee",
        "glace",
        "rocheux",
        "lave",
        "gazeuse",
        "comete",
        "nebuleuse",
        "ceinture",
        "asteroides",
        "anomalie",
    ]);
    t
}

pub fn famille(t: &str) -> Option<Famille> {
    Some(match t {
        "tellurique" => Famille::Planete(Kind::Tellurique),
        "verrouillee" => Famille::Planete(Kind::Verrouillee),
        "glace" => Famille::Planete(Kind::Glace),
        "rocheux" => Famille::Planete(Kind::Rocheux),
        "lave" => Famille::Planete(Kind::Lave),
        "gazeuse" => Famille::Planete(Kind::Gazeuse),
        "comete" => Famille::Comete,
        "nebuleuse" => Famille::Nebuleuse,
        "ceinture" => Famille::Ceinture,
        "asteroides" => Famille::Champ,
        "anomalie" => Famille::Anomalie,
        s if ETOILES.contains(&s) => Famille::Etoile,
        _ => return None,
    })
}

/// The default aspect of a type, `None` when the type is unknown.
pub fn defaut(t: &str) -> Option<Value> {
    Some(match t {
        "naine_rouge" => etoile(["#ffb078", "#ff5a2a", "#a8200c"], 0.4, 0.5, 1.1),
        "orange" => etoile(["#ffdcae", "#ff9a3c", "#c2500e"], 0.4, 0.6, 1.0),
        "jaune_orange" => etoile(["#fff0c0", "#ffbe4a", "#d9701a"], 0.4, 0.65, 1.0),
        "jaune" | "etoile" => etoile(["#fffbe0", "#ffe066", "#e8a020"], 0.4, 0.7, 1.0),
        "jaune_vert" => etoile(["#fffff0", "#f4f08a", "#c8b82a"], 0.4, 0.7, 1.0),
        "blanche" => etoile(["#f4f8ff", "#dbe8ff", "#9ab8ee"], 0.4, 0.5, 0.9),
        "geante_rouge" => etoile(["#ffc8a0", "#ff6a34", "#962010"], 0.5, 0.75, 0.6),
        "naine_blanche" => etoile(["#ffffff", "#dce8ff", "#9ab6e8"], 0.3, 0.45, 1.4),
        "geante_bleue" => etoile(["#f4f8ff", "#9cc4ff", "#4a7ae0"], 0.44, 1.0, 0.9),
        "tellurique" => json!({
            "palette": ["#0d2f5e", "#2a74a8", "#d8c98f", "#4f8a3c", "#2e5f2c", "#8a7a62", "#f2f6fa"],
            "mer": 0.5, "nuages": 0.55, "calottes": 0.5, "relief": 0.6, "echelle": 0.78,
            "halo": 0.6, "halo_couleur": "#7fb6ff", "bord": 0.5,
            "variantes": {
                "océanique": { "palette": ["#06224a", "#1b62a0", "#bcd4b0", "#3f8a58", "#2a6a46", "#6a7a72", "#f2f6fa"], "mer": 0.72, "nuages": 0.7 },
                "aride": { "palette": ["#6b4a2a", "#a86f3c", "#d9a867", "#c48a4a", "#8a5a34", "#6e5a48", "#efe2cc"], "mer": 0.12, "nuages": 0.14, "calottes": 0.2, "halo": 0.4, "halo_couleur": "#ffcc99" }
            }
        }),
        "verrouillee" => json!({
            "palette": ["#c4dcf4", "#5a9ad0", "#4fa05a", "#c88a3c", "#e8602a"],
            "relief": 0.5, "echelle": 0.78, "halo": 0.4, "halo_couleur": "#ffb890", "bord": 0.45
        }),
        "glace" => json!({
            "palette": ["#f6faff", "#cfe4f7", "#9cc4e4", "#6fa0cf"],
            "fissures": 0.6, "relief": 0.45, "echelle": 0.78, "halo": 0.0, "halo_couleur": "#bfe0ff", "bord": 0.4,
            "variantes": { "à atmosphère": { "halo": 0.5, "bord": 0.6 } }
        }),
        "rocheux" => json!({
            "palette": ["#3e3934", "#6a625a", "#9a8f82", "#c9bfae"],
            "cratere": 0.8, "relief": 0.8, "echelle": 0.78, "halo": 0.0, "bord": 0.15
        }),
        "lave" => json!({
            "palette": ["#150b0a", "#3a1c14", "#ff5a14", "#ffc04a"],
            "relief": 0.5, "echelle": 0.78, "halo": 0.4, "halo_couleur": "#ff7a30", "bord": 0.5
        }),
        "gazeuse" => json!({
            "palette": ["#efe2c4", "#cfa676", "#a86f48", "#f6eedb", "#7a5a48"],
            "bandes": 0.8, "tempete": 0.5, "relief": 0.0, "echelle": 0.62, "halo": 0.3, "halo_couleur": "#ffe8c0", "bord": 0.35,
            "terminateur": 0.2
        }),
        "comete" => json!({
            "palette": ["#fff0c8", "#9fc8ff", "#ffcf6a"],
            "sens": 1, "longueur": 0.55, "ouverture": 0.25, "tete": 1.2, "courbure": 0.45,
            "force_gaz": 0.8, "force_poussiere": 0.7
        }),
        "nebuleuse" => json!({
            "palette": ["#b0507a", "#3a5ab0", "#f0c8e0"], "densite": 0.6, "etoiles": 0.5
        }),
        "ceinture" => json!({
            "palette": ["#8a8076", "#5a534c", "#b0a698", "#c8c0b0"], "rochers": 0.8
        }),
        "asteroides" => json!({
            "palette": ["#8a8076", "#5a534c", "#b0a698", "#c8c0b0"], "rochers": 0.8
        }),
        "anomalie" => json!({
            "palette": ["#7a5cff", "#35e0ff", "#ff4fd8"], "bras": 3, "torsion": 0.8, "halo": 0.7
        }),
        _ => return None,
    })
}

fn etoile(pal: [&str; 3], echelle: f32, couronne: f32, granulation: f32) -> Value {
    json!({
        "palette": pal, "echelle": echelle, "couronne": couronne, "granulation": granulation,
        "taches": 0.5, "rayons": 7, "halo": 0.0
    })
}

/// The whole default catalogue as JSON.
pub fn catalogue_defaut() -> Value {
    let mut m = serde_json::Map::new();
    for t in types() {
        m.insert(t.to_string(), defaut(t).unwrap_or(Value::Null));
    }
    json!({ "version": super::VERSION_RENDU, "types": m })
}
