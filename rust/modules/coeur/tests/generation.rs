//! Reads the fixtures drawn by Eneria's generator (AD-etoiles-5) and checks the core against them.
use coeur::generation::*;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::collections::HashSet;

const FIXTURES: &str = include_str!("fixtures/generation-galaxie.json");
const EPS: f64 = 1e-9;

fn fixtures() -> Value {
    serde_json::from_str(FIXTURES).unwrap()
}

fn proche(a: f64, b: f64, ctx: &str) {
    assert!((a - b).abs() <= EPS, "{ctx}: {a} != {b}");
}

/// The six neighbours of a hexagon (`DIRS7` without the centre).
const VOISINS: [(i32, i32); 6] = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)];

struct Monde {
    defaut: f64,
    zones: Vec<(f64, HashSet<(i32, i32)>)>,
    exclus: HashSet<(i32, i32)>,
}

fn monde(f: &Value) -> Monde {
    let zones = f["densites"]["zones"]
        .as_array()
        .unwrap()
        .iter()
        .map(|z| {
            let hex = z["hexagones"]
                .as_array()
                .unwrap()
                .iter()
                .map(|h| (h[0].as_i64().unwrap() as i32, h[1].as_i64().unwrap() as i32))
                .collect();
            (z["densite"].as_f64().unwrap(), hex)
        })
        .collect();
    let mut exclus = HashSet::new();
    for s in f["systemes_definis"].as_array().unwrap() {
        if s["promu"].as_bool().unwrap() {
            continue;
        }
        let (q, r) = (s["q"].as_i64().unwrap() as i32, s["r"].as_i64().unwrap() as i32);
        exclus.insert((q, r));
        for (dq, dr) in VOISINS {
            exclus.insert((q + dq, r + dr));
        }
    }
    Monde { defaut: f["densites"]["defaut"].as_f64().unwrap(), zones, exclus }
}

fn entrees(m: &Monde, bx: i32, by: i32) -> ([f64; 9], [bool; 9]) {
    let (mut dens, mut exc) = ([0.0; 9], [false; 9]);
    for dq in 1..=3 {
        for dr in 1..=3 {
            let h = (TAILLE_BLOC * bx + dq, TAILLE_BLOC * by + dr);
            let i = indice_candidat(dq, dr);
            // the lowest zone density wins; a zone replaces the default (densiteHexagone)
            dens[i] = m
                .zones
                .iter()
                .filter(|(_, hex)| hex.contains(&h))
                .map(|(d, _)| *d)
                .reduce(f64::min)
                .unwrap_or(m.defaut);
            exc[i] = m.exclus.contains(&h);
        }
    }
    (dens, exc)
}

#[test]
fn chaque_bloc_des_fixtures_est_relu_a_l_identique() {
    let f = fixtures();
    let m = monde(&f);
    let graine = f["graine"].as_str().unwrap();
    let blocs = f["blocs"].as_array().unwrap();
    assert!(blocs.len() >= 400);
    let (mut etoiles, mut vides) = (0, 0);
    for b in blocs {
        let (bx, by) = (b["bx"].as_i64().unwrap() as i32, b["by"].as_i64().unwrap() as i32);
        let (dens, exc) = entrees(&m, bx, by);
        let obtenu = tirer_bloc(graine, bx, by, &dens, &exc).unwrap();
        let ctx = format!("bloc {bx},{by}");
        match (&b["etoile"], obtenu) {
            (Value::Null, None) => vides += 1,
            (Value::Null, Some(e)) => panic!("{ctx}: etoile inattendue {e:?}"),
            (attendu, None) => panic!("{ctx}: etoile attendue {attendu}"),
            (a, Some(e)) => {
                etoiles += 1;
                assert_eq!(e.q as i64, a["q"].as_i64().unwrap(), "{ctx} q");
                assert_eq!(e.r as i64, a["r"].as_i64().unwrap(), "{ctx} r");
                assert_eq!(e.lettre, a["lettre"].as_str().unwrap(), "{ctx} lettre");
                proche(e.taille, a["taille"].as_f64().unwrap(), &ctx);
                proche(e.x, a["x"].as_f64().unwrap(), &ctx);
                proche(e.y, a["y"].as_f64().unwrap(), &ctx);
            }
        }
    }
    assert_eq!(etoiles + vides, blocs.len());
    assert_eq!(etoiles, blocs.iter().filter(|b| !b["etoile"].is_null()).count());
    assert!(etoiles >= 100, "fixtures trop pauvres: {etoiles}");
}

#[test]
fn hash32_egale_les_litteraux_des_fixtures() {
    let f = fixtures();
    let l = f["litteraux"]["hash32"].as_array().unwrap();
    assert!(!l.is_empty());
    for e in l {
        let chaine = e["chaine"].as_str().unwrap();
        assert_eq!(hash32(chaine) as u64, e["valeur"].as_u64().unwrap(), "{chaine:?}");
    }
}

#[test]
fn rng_egale_les_suites_des_fixtures() {
    let f = fixtures();
    let l = f["litteraux"]["rng"].as_array().unwrap();
    assert!(!l.is_empty());
    for e in l {
        let g = e["graine"].as_u64().unwrap() as u32;
        let mut r = Rng::new(g);
        for (i, v) in e["suite"].as_array().unwrap().iter().enumerate() {
            proche(r.suivant(), v.as_f64().unwrap(), &format!("graine {g} rang {i}"));
        }
    }
}

#[test]
fn densites_a_zero_aucune_etoile() {
    for bx in -12..12 {
        for by in -12..12 {
            assert_eq!(tirer_bloc("kanevas-neutre-1", bx, by, &[0.0; 9], &[false; 9]).unwrap(), None);
        }
    }
}

#[test]
fn densites_a_un_le_candidat_sauf_exclu() {
    let f = fixtures();
    let graine = f["graine"].as_str().unwrap();
    for bx in -12..12 {
        for by in -12..12 {
            let e = tirer_bloc(graine, bx, by, &[1.0; 9], &[false; 9]).unwrap().expect("densité 1 : une étoile");
            let (dq, dr) = (e.q - TAILLE_BLOC * bx, e.r - TAILLE_BLOC * by);
            assert!((1..=3).contains(&dq) && (1..=3).contains(&dr), "bord de bloc {bx},{by}");
            // excluding exactly that candidate removes the star; excluding any other keeps it
            let i = indice_candidat(dq, dr);
            for k in 0..9 {
                let mut exc = [false; 9];
                exc[k] = true;
                let r = tirer_bloc(graine, bx, by, &[1.0; 9], &exc).unwrap();
                if k == i {
                    assert_eq!(r, None, "bloc {bx},{by}: candidat exclu porte une étoile");
                } else {
                    assert_eq!(r, Some(e.clone()), "bloc {bx},{by}: exclusion d'un autre candidat");
                }
            }
        }
    }
}

#[test]
fn exclus_tous_vrais_aucune_etoile_meme_a_densite_un() {
    for bx in -6..6 {
        for by in -6..6 {
            assert_eq!(tirer_bloc("g", bx, by, &[1.0; 9], &[true; 9]).unwrap(), None);
        }
    }
}

#[test]
fn tirer_bloc_refuse_une_mauvaise_longueur() {
    assert!(tirer_bloc("g", 0, 0, &[1.0; 8], &[false; 9]).is_err());
    assert!(tirer_bloc("g", 0, 0, &[1.0; 9], &[false; 10]).is_err());
    assert!(tirer_bloc("g", 0, 0, &[], &[]).is_err());
}

#[test]
fn la_densite_d_un_autre_candidat_ne_decide_pas() {
    // only the drawn candidate's density counts
    let graine = "kanevas-neutre-1";
    let e = tirer_bloc(graine, 0, 0, &[1.0; 9], &[false; 9]).unwrap().unwrap();
    let i = indice_candidat(e.q, e.r);
    let mut d = [0.0; 9];
    d[i] = 1.0;
    assert_eq!(tirer_bloc(graine, 0, 0, &d, &[false; 9]).unwrap(), Some(e.clone()));
    let mut d = [1.0; 9];
    d[i] = 0.0;
    assert_eq!(tirer_bloc(graine, 0, 0, &d, &[false; 9]).unwrap(), None);
}

#[test]
fn constantes() {
    assert_eq!(DENSITE_DEFAUT, 0.68);
    assert_eq!(VERSION_GENERATEUR, 1);
    assert_eq!(TAILLE_BLOC, 5);
}

#[test]
fn plan_vers_hex_rend_l_hexagone_de_chaque_hexagone_des_fixtures() {
    let f = fixtures();
    let mut hexs: HashSet<(i32, i32)> = HashSet::new();
    for b in f["blocs"].as_array().unwrap() {
        if !b["etoile"].is_null() {
            hexs.insert((b["etoile"]["q"].as_i64().unwrap() as i32, b["etoile"]["r"].as_i64().unwrap() as i32));
        }
    }
    for z in f["densites"]["zones"].as_array().unwrap() {
        for h in z["hexagones"].as_array().unwrap() {
            hexs.insert((h[0].as_i64().unwrap() as i32, h[1].as_i64().unwrap() as i32));
        }
    }
    for s in f["systemes_definis"].as_array().unwrap() {
        hexs.insert((s["q"].as_i64().unwrap() as i32, s["r"].as_i64().unwrap() as i32));
    }
    assert!(hexs.len() > 1000);
    for (q, r) in hexs {
        let (x, y) = hex_vers_plan(q, r);
        assert_eq!(plan_vers_hex(x, y), (q, r), "hexagone {q},{r}");
    }
}

#[test]
fn hex_vers_plan_egale_x_y_des_etoiles_des_fixtures() {
    let f = fixtures();
    for b in f["blocs"].as_array().unwrap().iter().filter(|b| !b["etoile"].is_null()) {
        let e = &b["etoile"];
        let (x, y) = hex_vers_plan(e["q"].as_i64().unwrap() as i32, e["r"].as_i64().unwrap() as i32);
        proche(x, e["x"].as_f64().unwrap(), "x");
        proche(y, e["y"].as_f64().unwrap(), "y");
    }
}

#[test]
fn plan_vers_hex_arrondit_les_points_hors_centre() {
    // a point slightly off a centre stays in its hexagon; the centre of the plane is (0,0)
    assert_eq!(plan_vers_hex(0.0, 0.0), (0, 0));
    for (q, r) in [(0, 0), (3, -7), (-12, 5), (40, -40)] {
        let (x, y) = hex_vers_plan(q, r);
        assert_eq!(plan_vers_hex(x + 0.3, y - 0.3), (q, r));
        assert_eq!(plan_vers_hex(x - 0.3, y + 0.3), (q, r));
    }
}

#[test]
fn lettre_de_aux_seuils() {
    assert_eq!(lettre_de(0.0, 1.0), "M");
    assert_eq!(lettre_de(0.299, 1.0), "M");
    assert_eq!(lettre_de(0.30, 1.0), "K");
    assert_eq!(lettre_de(0.55, 1.0), "G");
    assert_eq!(lettre_de(0.75, 1.0), "F");
    assert_eq!(lettre_de(0.88, 1.0), "A");
    assert_eq!(lettre_de(0.96, 1.0), "B");
    assert_eq!(lettre_de(5.0, 2.1), "B"); // clamped
    assert_eq!(lettre_de(0.0, 0.65), "M"); // clamped below
}

fn aller_retour<T: Serialize + DeserializeOwned + PartialEq + std::fmt::Debug>(v: T) {
    let json = serde_json::to_string(&v).unwrap();
    let retour: T = serde_json::from_str(&json).unwrap();
    assert_eq!(retour, v);
    assert_eq!(serde_json::to_string(&retour).unwrap(), json);
}

#[test]
fn aller_retour_etoile() {
    aller_retour(Etoile { q: -3, r: 7, taille: 1.234567890123, lettre: "G".into(), x: -5.19615242270663, y: 10.5 });
}

#[test]
fn aller_retour_lune() {
    aller_retour(Lune { orbite: 0.3, angle: 1.5707963267948966, rayon: 0.05 });
}

#[test]
fn aller_retour_planete() {
    aller_retour(Planete {
        rang: 2,
        orbite: 3.25,
        angle: 0.1,
        rayon: 0.4,
        type_planete: "tellurique".into(),
        lunes: vec![Lune { orbite: 0.3, angle: 1.0, rayon: 0.05 }, Lune { orbite: 0.6, angle: 2.0, rayon: 0.02 }],
    });
    aller_retour(Planete { rang: 0, orbite: 1.0, angle: 0.0, rayon: 0.1, type_planete: String::new(), lunes: vec![] });
}

#[test]
fn aller_retour_ceinture() {
    aller_retour(Ceinture { orbite: 4.5, largeur: 0.8, densite: 0.35 });
}

#[test]
fn aller_retour_comete() {
    aller_retour(Comete { demi_grand_axe: 6.0, excentricite: 0.93, angle: 3.0 });
}

#[test]
fn aller_retour_nebuleuse() {
    aller_retour(Nebuleuse { x: -1.5, y: 2.5, rayon: 4.0, teinte: 0.7 });
}

#[test]
fn aller_retour_compagne() {
    aller_retour(Compagne { orbite: 0.9, angle: 2.2, taille: 0.8, lettre: "K".into() });
}

#[test]
fn le_json_de_l_etoile_porte_les_cles_attendues() {
    let e = tirer_bloc("kanevas-neutre-1", 0, 0, &[1.0; 9], &[false; 9]).unwrap();
    let v: Value = serde_json::from_str(&serde_json::to_string(&e).unwrap()).unwrap();
    let mut cles: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
    cles.sort();
    assert_eq!(cles, ["lettre", "q", "r", "taille", "x", "y"]);
    assert_eq!(serde_json::to_string(&None::<Etoile>).unwrap(), "null");
}
