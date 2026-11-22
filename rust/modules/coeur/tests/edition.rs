//! Tests of the `edition` module from the exit criterion of the task: conversions round trip on the fixtures,
//! the six neighbours, the defaults accepted, the refusals as values, never a panic.
use coeur::edition::*;
use coeur::generation::*;
use coeur::rendu::{catalogue_defaut, types};
use serde_json::{json, Value};

const FIXTURES: &str = include_str!("fixtures/generation-systemes.json");

fn systemes() -> Vec<Value> {
    serde_json::from_str::<Value>(FIXTURES).unwrap()["systemes"].as_array().unwrap().clone()
}

fn proche(a: f64, b: f64, eps: f64, ctx: &str) {
    assert!((a - b).abs() <= eps, "{ctx}: {a} != {b}");
}

// ---- conversions --------------------------------------------------------------------------------------------

/// Panne : `plan_vers_orbite_heure` n'est plus l'inverse d'`orbite_heure_vers_plan` (signe, sens des heures).
#[test]
fn plan_et_orbite_heure_font_l_aller_retour_sur_les_fixtures() {
    let mut vus = 0;
    for s in systemes() {
        let sortie = &s["sortie"];
        let mut points: Vec<(f64, f64)> = vec![];
        for f in sortie["formations"].as_array().unwrap() {
            if let Some(c) = f["parametres"]["centres"].as_array() {
                points.extend(c.iter().map(|c| (c[0].as_f64().unwrap(), c[1].as_f64().unwrap())));
            }
        }
        for a in sortie["astres"].as_array().unwrap() {
            if let (Some(o), Some(h)) = (a["orbite"].as_f64(), a["heure"].as_f64()) {
                points.push((o, h));
            }
        }
        for (o, h) in points {
            let (x, y) = orbite_heure_vers_plan(o, h);
            let (o2, h2) = plan_vers_orbite_heure(x, y);
            proche(o2, o, 1e-9, "orbite");
            if o > 0.0 {
                proche(h2, h, 1e-9, "heure");
            }
            vus += 1;
        }
    }
    assert!(vus > 50, "fixtures must carry points ({vus})");
}

/// Valeurs écrites en dur : 12 en haut, 3 à droite, 6 en bas, 9 à gauche.
#[test]
fn plan_vers_orbite_heure_aux_quatre_points_cardinaux() {
    for ((x, y), (o, h)) in [((0.0, -2.0), (2.0, 0.0)), ((2.0, 0.0), (2.0, 3.0)), ((0.0, 2.0), (2.0, 6.0)), ((-2.0, 0.0), (2.0, 9.0))] {
        let (o2, h2) = plan_vers_orbite_heure(x, y);
        proche(o2, o, 1e-9, "orbite");
        proche(h2, h, 1e-9, "heure");
    }
}

/// Panne : un voisin n'est plus ramené sur le cercle de transition ou son heure s'écarte de `heure_vers_voisin`.
#[test]
fn galactique_aux_six_voisins_retombe_sur_l_heure_du_voisin_et_le_rayon() {
    let voisins = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)];
    for (q0, r0) in [(0, 0), (7, -3), (-49, -48), (120, 31)] {
        for rayon in [0.7, 3.37, 12.5] {
            let mut heures = vec![];
            for (dq, dr) in voisins {
                let (o, h) = galactique_vers_orbite_heure(f64::from(dq), f64::from(dr), rayon).unwrap();
                proche(o, rayon, 0.0051, "rayon");
                assert_eq!(h, heure_vers_voisin(q0, r0, q0 + dq, r0 + dr), "heure {dq},{dr} depuis {q0},{r0}");
                assert!((0.0..12.0).contains(&h));
                heures.push(h);
            }
            heures.sort_by(|a, b| a.partial_cmp(b).unwrap());
            assert_eq!(heures, vec![1.0, 3.0, 5.0, 7.0, 9.0, 11.0], "six distinct directions");
        }
    }
}

#[test]
fn galactique_valeurs_connues() {
    // (1,0) is straight right: hour 3 (written by hand), the hexagon after next is twice as far.
    assert_eq!(galactique_vers_orbite_heure(1.0, 0.0, 4.0).unwrap(), (4.0, 3.0));
    assert_eq!(galactique_vers_orbite_heure(2.0, 0.0, 4.0).unwrap(), (8.0, 3.0));
    // (-1, 0): hour 9.
    assert_eq!(galactique_vers_orbite_heure(-1.0, 0.0, 4.0).unwrap(), (4.0, 9.0));
    // Half an hexagon is half the way.
    assert_eq!(galactique_vers_orbite_heure(0.5, 0.0, 4.0).unwrap(), (2.0, 3.0));
}

#[test]
fn galactique_bords_origine_et_entrees_fausses() {
    assert_eq!(galactique_vers_orbite_heure(0.0, 0.0, 5.0).unwrap(), (0.0, 0.0));
    assert_eq!(galactique_vers_orbite_heure(1.0, 0.0, 0.0).unwrap().0, 0.0);
    for (a, b, c) in [(f64::NAN, 0.0, 1.0), (0.0, f64::INFINITY, 1.0), (1.0, 0.0, f64::NAN), (1.0, 0.0, -1.0), (1.0, 0.0, f64::INFINITY)] {
        assert!(galactique_vers_orbite_heure(a, b, c).is_err(), "{a} {b} {c}");
    }
    // The hour never reaches 12, whatever the direction (a sweep around the hexagon).
    for i in 0..720 {
        let a = f64::from(i) / 720.0 * std::f64::consts::TAU;
        let (_, h) = galactique_vers_orbite_heure(a.cos(), a.sin(), 3.0).unwrap();
        assert!((0.0..12.0).contains(&h), "hour {h} at step {i}");
    }
}

// ---- types_astre --------------------------------------------------------------------------------------------

fn tri(mut v: Vec<&'static str>) -> Vec<&'static str> {
    v.sort();
    v
}

#[test]
fn types_astre_rend_la_liste_de_chaque_genre() {
    assert_eq!(tri(types_astre("planete").unwrap()), ["gazeuse", "glace", "lave", "rocheux", "tellurique", "verrouillee"]);
    assert_eq!(tri(types_astre("lune").unwrap()), ["glace", "lave", "rocheux"]);
    assert_eq!(types_astre("comete").unwrap(), ["comete"]);
    assert_eq!(
        tri(types_astre("etoile").unwrap()),
        ["blanche", "etoile", "geante_bleue", "geante_rouge", "jaune", "jaune_orange", "jaune_vert", "naine_blanche", "naine_rouge", "orange"]
    );
}

#[test]
fn types_astre_refuse_un_genre_inconnu_en_valeur() {
    for g in ["", "Planete", "astre", "ceinture", "planete "] {
        assert!(matches!(types_astre(g), Err(ErreurEdition::GenreInconnu(_))), "{g:?}");
    }
}

/// Panne : un type tiré par le générateur n'est pas dans la liste de son genre (l'ancrage serait refusé).
#[test]
fn chaque_corps_tire_a_un_type_de_son_genre_et_un_aspect_valide() {
    let mut n = 0;
    for s in systemes() {
        for a in s["sortie"]["astres"].as_array().unwrap() {
            let (genre, t) = (a["genre"].as_str().unwrap(), a["type"].as_str().unwrap());
            assert!(types_astre(genre).unwrap().contains(&t), "{genre} {t}");
            let aspect = a["aspect"].to_string();
            valider_aspect(t, &aspect).unwrap_or_else(|e| panic!("{} {t} {aspect}: {e}", a["cle"]));
            n += 1;
        }
        for f in s["sortie"]["formations"].as_array().unwrap() {
            let (forme, p) = (f["forme"].as_str().unwrap(), f["parametres"].to_string());
            valider_formation(forme, &p).unwrap_or_else(|e| panic!("{} {p}: {e}", f["cle"]));
        }
    }
    assert!(n > 100);
}

// ---- valider_aspect -----------------------------------------------------------------------------------------

#[test]
fn valider_aspect_accepte_le_defaut_de_chaque_type() {
    let cat = catalogue_defaut();
    let tous = cat["types"].as_object().unwrap();
    assert_eq!(tous.len(), types().len());
    for (t, d) in tous {
        let json = if d.is_object() { d.to_string() } else { "{}".to_string() };
        valider_aspect(t, &json).unwrap_or_else(|e| panic!("{t} {json}: {e}"));
        valider_aspect(t, "{}").unwrap_or_else(|e| panic!("{t} empty: {e}"));
    }
}

#[test]
fn valider_aspect_refuse_une_cle_inconnue() {
    let r = valider_aspect("tellurique", r##"{"mer":0.5,"licorne":1}"##);
    assert!(matches!(r, Err(ErreurEdition::CleInconnue(ref k)) if k == "licorne"), "{r:?}");
}

#[test]
fn valider_aspect_refuse_un_type_inconnu() {
    assert!(valider_aspect("licorne", "{}").is_err());
    assert!(valider_aspect("", "{}").is_err());
}

/// Bord : 4 096 octets passent, 4 097 sont trop gros — rempli d'espaces pour rester un JSON valide.
#[test]
fn valider_aspect_borne_la_taille_a_4_kio() {
    let rempli = |n: usize| format!("{{\"mer\":0.5{}}}", " ".repeat(n - 11));
    assert_eq!(rempli(4096).len(), 4096);
    assert!(valider_aspect("tellurique", &rempli(4096)).is_ok());
    assert!(matches!(valider_aspect("tellurique", &rempli(4097)), Err(ErreurEdition::TropGros { max: 4096 })));
    // a long key is refused as too big before anything else
    let gros = format!("{{\"{}\":1}}", "k".repeat(5000));
    assert!(matches!(valider_aspect("tellurique", &gros), Err(ErreurEdition::TropGros { .. })));
}

#[test]
fn valider_aspect_refuse_une_valeur_hors_bornes() {
    for j in [
        r#"{"mer":1.01}"#,
        r#"{"mer":-0.01}"#,
        r#"{"mer":"0.5"}"#,
        r#"{"mer":null}"#,
        r#"{"mer":1e999}"#,
        r#"{"echelle":4.5}"#,
        r##"{"halo_couleur":"rouge"}"##,
        r##"{"halo_couleur":"#fff"}"##,
        r##"{"halo_couleur":"#gggggg"}"##,
        r##"{"palette":[]}"##,
        r##"{"palette":["#102030","nope"]}"##,
        r##"{"palette":"#102030"}"##,
        r#"{"sens":0}"#,
        r#"{"sens":2}"#,
        r#"{"serree":"oui"}"#,
        r#"{"variantes":[1]}"#,
        r#"{"graine":-1}"#,
        r#"{"graine":4294967296}"#,
        r#"{"graine":1.5}"#,
        r#"{"bras":0}"#,
        r#"{"bras":13}"#,
    ] {
        assert!(valider_aspect("tellurique", j).is_err(), "{j}");
    }
}

#[test]
fn valider_aspect_accepte_les_bornes_incluses() {
    for j in [r#"{"mer":0}"#, r#"{"mer":1}"#, r#"{"echelle":4}"#, r#"{"graine":4294967295}"#, r#"{"graine":0}"#, r#"{"bras":1}"#, r#"{"sens":-1}"#, r#"{"sens":1}"#, r#"{"serree":true}"#] {
        assert!(valider_aspect("tellurique", j).is_ok(), "{j}");
    }
}

/// « Une valeur d'erreur, jamais une panique » : aucune de ces entrées ne panique.
#[test]
fn valider_aspect_et_formation_ne_paniquent_jamais() {
    let gros_nombre = format!("{{\"mer\":{}}}", "9".repeat(300));
    let entrees = [
        "", " ", "null", "[]", "[1]", "\"x\"", "1", "{", "{}}", "{\"a\":", "\u{0}", "{\"mer\":0.5,}", "{\"mer\":NaN}", "{\"é\":1}", "{\"mer\":1e-400}",
        "{\"palette\":[[]]}", "{\"centres\":[[1,2]]}", "{\"centres\":[[1e308,1e308,1e308]]}", "{\"de\":1e308,\"a\":1e309}", gros_nombre.as_str(),
    ];
    for e in entrees {
        for t in types() {
            let _ = valider_aspect(t, e);
        }
        for f in ["anneau", "nuage", "autre", ""] {
            let _ = valider_formation(f, e);
        }
    }
    for g in ["", "\u{0}", "é"] {
        let _ = types_astre(g);
    }
    for (a, b, c) in [(1e308, 1e308, 1e308), (f64::MIN, f64::MAX, f64::MAX), (-0.0, -0.0, 1.0), (1e-320, 0.0, 1.0)] {
        let _ = galactique_vers_orbite_heure(a, b, c);
    }
    for json in ["{\"mer\":0.5}", "{\"mer\": 0.5 }"] {
        // the re-serialised aspect is itself valid (idempotent)
        let r = valider_aspect("tellurique", json).unwrap();
        assert_eq!(valider_aspect("tellurique", &r).unwrap(), r);
    }
}

// ---- valider_formation --------------------------------------------------------------------------------------

#[test]
fn valider_formation_accepte_le_defaut_de_chaque_forme() {
    let anneau = json!({"de": 1.31, "a": 1.69, "rochers": 0.67, "materiaux": [["roche", 3], ["metal", 1]]}).to_string();
    let nuage = json!({"orbite": 1.23, "heure": 9.8, "rochers": 0.12, "brume": "#b0507a", "materiaux": [["roche", 2]], "centres": [[1.23, 9.8, 1.21]]}).to_string();
    assert!(valider_formation("anneau", &anneau).is_ok());
    assert!(valider_formation("nuage", &nuage).is_ok());
    assert!(valider_formation("anneau", r#"{"de":0,"a":1}"#).is_ok(), "de = 0 is allowed");
    assert!(valider_formation("nuage", "{}").is_ok(), "a cloud with no parameter");
}

#[test]
fn valider_formation_anneau_de_inferieur_a_a_et_positif() {
    for j in [r#"{"de":2,"a":1}"#, r#"{"de":1,"a":1}"#, r#"{"de":-0.1,"a":1}"#, r#"{"de":1}"#, r#"{"a":1}"#, "{}", r#"{"de":"1","a":2}"#, r#"{"de":1,"a":1001}"#] {
        assert!(valider_formation("anneau", j).is_err(), "{j}");
    }
    assert!(valider_formation("anneau", r#"{"de":999,"a":1000}"#).is_ok());
    assert!(valider_formation("anneau", r#"{"de":1,"a":1.0000001}"#).is_ok());
}

/// The form of an `arc` is not fixed by the design (a gap): only that it never lifts the `de` < `a` rule.
#[test]
fn valider_formation_anneau_avec_arc_garde_de_inferieur_a_a() {
    assert!(valider_formation("anneau", r#"{"de":2,"a":1,"arc":[2,5]}"#).is_err());
    assert!(valider_formation("anneau", r#"{"de":-1,"a":1,"arc":[2,5]}"#).is_err());
}

#[test]
fn valider_formation_refuse_cle_inconnue_et_forme_inconnue() {
    assert!(matches!(valider_formation("anneau", r#"{"de":1,"a":2,"licorne":1}"#), Err(ErreurEdition::CleInconnue(_))));
    assert!(matches!(valider_formation("nuage", r#"{"licorne":1}"#), Err(ErreurEdition::CleInconnue(_))));
    // a ring key on a cloud and the reverse
    assert!(valider_formation("nuage", r#"{"de":1,"a":2}"#).is_err());
    assert!(valider_formation("anneau", r#"{"de":1,"a":2,"centres":[[1,1,1]]}"#).is_err());
    assert!(matches!(valider_formation("disque", "{}"), Err(ErreurEdition::FormeInconnue(_))));
}

#[test]
fn valider_formation_borne_la_taille_a_8_kio() {
    let rempli = |n: usize| format!("{{\"de\":1,\"a\":2{}}}", " ".repeat(n - 14));
    assert_eq!(rempli(8192).len(), 8192);
    assert!(valider_formation("anneau", &rempli(8192)).is_ok());
    assert!(matches!(valider_formation("anneau", &rempli(8193)), Err(ErreurEdition::TropGros { max: 8192 })));
    // 5 KiB is too big for an aspect but fine for a zone
    assert!(matches!(valider_aspect("tellurique", &rempli(5000)), Err(ErreurEdition::TropGros { max: 4096 })));
    assert!(valider_formation("anneau", &rempli(5000)).is_ok());
}

#[test]
fn valider_formation_nuage_centres_dans_l_etendue() {
    let ok = |c: &str| valider_formation("nuage", &format!("{{\"centres\":{c}}}")).is_ok();
    assert!(ok("[[5,4,1]]"));
    assert!(ok("[[0,0,1]]"));
    assert!(ok("[[999,11.99,1]]"), "farthest edge exactly on the extent");
    assert!(!ok("[[1001,4,1]]"), "orbit beyond the extent");
    assert!(!ok("[[999.5,4,1]]"), "edge beyond the extent");
    assert!(!ok("[[-1,4,1]]"));
    assert!(!ok("[[5,12,1]]"), "12 is refused, not wrapped");
    assert!(!ok("[[5,-0.5,1]]"));
    assert!(!ok("[[5,4,0]]"), "size > 0");
    assert!(!ok("[[5,4,-1]]"));
    assert!(!ok("[]"));
    assert!(!ok("[[5,4]]"));
    assert!(!ok("[[5,4,1,2]]"));
    assert!(!ok("[[\"5\",4,1]]"));
    // one centre out of several is enough to refuse
    assert!(!ok("[[5,4,1],[2000,4,1]]"));
    assert!(valider_formation("nuage", r#"{"orbite":1001,"heure":3}"#).is_err());
    assert!(valider_formation("nuage", r#"{"orbite":5,"heure":12}"#).is_err());
}
