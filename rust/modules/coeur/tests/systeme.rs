//! Checks the interior of a system drawn by the core against the twenty systems drawn by Eneria's source.
use coeur::generation::*;
use serde_json::Value;

const FIXTURES: &str = include_str!("fixtures/generation-systemes.json");
const EPS: f64 = 1e-9;

fn fixtures() -> Value {
    serde_json::from_str(FIXTURES).unwrap()
}

/// Deep equality: strings, nulls and structure exact, reals within EPS.
fn egal(a: &Value, b: &Value, ctx: &str) {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            assert!((x - y).abs() <= EPS, "{ctx}: {x} != {y}");
        }
        (Value::Array(x), Value::Array(y)) => {
            assert_eq!(x.len(), y.len(), "{ctx}: length");
            for (i, (u, v)) in x.iter().zip(y).enumerate() {
                egal(u, v, &format!("{ctx}[{i}]"));
            }
        }
        (Value::Object(x), Value::Object(y)) => {
            let mut kx: Vec<_> = x.keys().collect();
            let mut ky: Vec<_> = y.keys().collect();
            kx.sort();
            ky.sort();
            assert_eq!(kx, ky, "{ctx}: keys");
            for k in x.keys() {
                egal(&x[k], &y[k], &format!("{ctx}.{k}"));
            }
        }
        _ => assert_eq!(a, b, "{ctx}"),
    }
}

fn tire(e: &Value) -> Systeme {
    tirer_systeme(
        e["q"].as_i64().unwrap() as i32,
        e["r"].as_i64().unwrap() as i32,
        e["taille"].as_f64().unwrap(),
        e["lettre"].as_str().unwrap(),
        1,
        &coeur::reglages::defaut(1).unwrap(),
    )
    .unwrap()
}

#[test]
fn les_vingt_systemes_sont_retrouves() {
    let f = fixtures();
    let l = f["systemes"].as_array().unwrap();
    assert_eq!(l.len(), 20);
    for s in l {
        let s_ = tire(&s["entree"]);
        let v = serde_json::to_value(&s_).unwrap();
        let cle = format!("{},{}", s["entree"]["q"], s["entree"]["r"]);
        // same rows, same order
        egal(&v, &s["sortie"], &cle);
        // counts
        let att = s["sortie"]["astres"].as_array().unwrap();
        assert_eq!(s_.astres.len(), att.len(), "{cle}: astres");
        assert_eq!(s_.formations.len(), s["sortie"]["formations"].as_array().unwrap().len(), "{cle}: formations");
        assert!(s_.astres.iter().any(|a| a.genre == "etoile"));
    }
}

#[test]
fn deux_appels_rendent_la_meme_chaine() {
    for s in fixtures()["systemes"].as_array().unwrap() {
        let e = &s["entree"];
        let a = serde_json::to_string(&tire(e)).unwrap();
        let b = serde_json::to_string(&tire(e)).unwrap();
        assert_eq!(a, b);
    }
}

#[test]
fn transition_defaut_egale_la_transition() {
    for s in fixtures()["systemes"].as_array().unwrap() {
        let t = tire(&s["entree"]);
        let d = transition_defaut(&t.astres, &t.formations);
        assert!((d - t.transition).abs() <= EPS, "{d} != {}", t.transition);
        assert!((d - s["sortie"]["transition"].as_f64().unwrap()).abs() <= EPS);
    }
}

#[test]
fn aller_retour_serde_sans_perte() {
    for s in fixtures()["systemes"].as_array().unwrap() {
        let t = tire(&s["entree"]);
        let j = serde_json::to_string(&t).unwrap();
        let back: Systeme = serde_json::from_str(&j).unwrap();
        assert_eq!(back, t);
        assert_eq!(serde_json::to_string(&back).unwrap(), j);
    }
}

#[test]
fn version_inconnue_refusee() {
    assert!(tirer_systeme(0, 0, 0.8, "K", 0, &coeur::reglages::defaut(1).unwrap()).is_err());
    assert!(tirer_systeme(0, 0, 0.8, "K", 2, &coeur::reglages::defaut(1).unwrap()).is_err());
}

#[test]
fn orbite_heure_orientation() {
    let (x, y) = orbite_heure_vers_plan(2.0, 0.0);
    assert!(x.abs() < EPS && (y + 2.0).abs() < EPS, "12 en haut (y négatif vers le haut)");
    let (x, y) = orbite_heure_vers_plan(2.0, 3.0);
    assert!((x - 2.0).abs() < EPS && y.abs() < EPS, "3 à droite");
    let (x, y) = orbite_heure_vers_plan(2.0, 6.0);
    assert!(x.abs() < EPS && (y - 2.0).abs() < EPS);
}

#[test]
fn orbite_heure_aller_retour() {
    for o in [0.1, 1.0, 3.7, 9.99] {
        for k in 0..48 {
            let h = f64::from(k) * 0.25 - 0.0;
            if h >= 12.0 {
                continue;
            }
            let (x, y) = orbite_heure_vers_plan(o, h);
            let (o2, h2) = plan_vers_orbite_heure(x, y);
            assert!((o - o2).abs() < 1e-9, "{o} {h}");
            assert!((h - h2).abs() < 1e-9 || (h - h2).abs() > 11.999999, "{o} {h} -> {h2}");
        }
    }
}

#[test]
fn wasm_plat_rend_la_meme_chaine() {
    let s = &fixtures()["systemes"][3]["entree"];
    let a = tirer_systeme_wasm(
        s["q"].as_i64().unwrap() as i32,
        s["r"].as_i64().unwrap() as i32,
        s["taille"].as_f64().unwrap(),
        s["lettre"].as_str().unwrap(),
        1,
        "{}",
    );
    assert!(a.is_ok());
    assert_eq!(a.ok().unwrap(), serde_json::to_string(&tire(s)).unwrap());
}

#[test]
fn heure_vers_voisin_aux_six_directions() {
    // 12 en haut (0), 3 à droite ; les six voisins d'un hexagone pointe en haut.
    let cas = [((1, 0), 3.0), ((0, 1), 5.0), ((-1, 1), 7.0), ((-1, 0), 9.0), ((0, -1), 11.0), ((1, -1), 1.0)];
    for ((dq, dr), h) in cas {
        assert_eq!(heure_vers_voisin(4, -2, 4 + dq, -2 + dr), h, "voisin ({dq}, {dr})");
    }
    assert_eq!(heure_vers_voisin(0, 0, 0, 0), 0.0);
}
