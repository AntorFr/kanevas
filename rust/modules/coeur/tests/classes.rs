//! The seven star classes and the class drawn from a key and a size (B-117, AD-galaxie-systemes-1).
use coeur::generation::*;
use serde_json::Value;
use std::collections::HashSet;

fn liste() -> Vec<Value> {
    serde_json::from_str(&classes_etoile()).unwrap()
}

#[test]
fn the_seven_classes_carry_their_letter_label_and_colour() {
    let attendu = [
        ("M", "M \u{2014} rouge", "#ff8f70"),
        ("K", "K \u{2014} orange", "#ffb870"),
        ("G", "G \u{2014} jaune", "#ffe08a"),
        ("F", "F \u{2014} jaune p\u{e2}le", "#fff4d6"),
        ("A", "A \u{2014} blanche", "#dfe9ff"),
        ("B", "B \u{2014} bleue", "#a9c4ff"),
        ("V", "V \u{2014} jaune-vert", "#d6f08a"),
    ];
    let l = liste();
    assert_eq!(l.len(), 7);
    for (i, (lettre, libelle, couleur)) in attendu.iter().enumerate() {
        assert_eq!(l[i]["lettre"], *lettre);
        assert_eq!(l[i]["libelle"], *libelle);
        assert_eq!(l[i]["couleur"], *couleur);
        assert_eq!(l[i].as_object().unwrap().len(), 3);
    }
}

#[test]
fn the_class_of_a_key_is_stable_and_a_member_of_the_list() {
    let lettres: Vec<String> = liste().iter().map(|c| c["lettre"].as_str().unwrap().to_string()).collect();
    for k in ["alpha", "beta", "", "2,-3"] {
        let a = classe_de_cle(k, 0.5).unwrap();
        assert_eq!(a, classe_de_cle(k, 0.5).unwrap());
        assert!(lettres.iter().any(|l| l == a));
    }
}

#[test]
fn two_hundred_keys_at_size_half_give_at_least_four_classes_and_never_v() {
    let vues: HashSet<&str> = (0..200).map(|i| classe_de_cle(&format!("cle-{i}"), 0.5).unwrap()).collect();
    assert!(vues.len() >= 4, "{vues:?}");
    assert!(!vues.contains("V"));
}

#[test]
fn no_size_ever_gives_v() {
    for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
        for i in 0..300 {
            assert_ne!(classe_de_cle(&format!("k{i}"), t).unwrap(), "V");
        }
    }
}

#[test]
fn a_bigger_size_is_never_cooler_and_often_hotter() {
    let ordre = |l: &str| "MKGFAB".find(l).unwrap();
    let mut plus_chaud = 0;
    for i in 0..200 {
        let k = format!("cle-{i}");
        let (petite, grande) = (ordre(classe_de_cle(&k, 0.0).unwrap()), ordre(classe_de_cle(&k, 1.0).unwrap()));
        assert!(petite <= grande, "{k}");
        if petite < grande {
            plus_chaud += 1;
        }
    }
    assert!(plus_chaud > 0);
    // a key whose draw sits at 0.2: M at size 0, K at size 1 (0.2 + 0.12 * 0.1 .. 0.2 + 0.12 * 1.1)
    let (m, b) = (0..2000)
        .map(|i| format!("x{i}"))
        .find_map(|k| (classe_de_cle(&k, 0.0).unwrap() == "M" && classe_de_cle(&k, 1.0).unwrap() != "M").then_some((k.clone(), k)))
        .expect("a key colder at 0 than at 1");
    assert_eq!(classe_de_cle(&m, 0.0).unwrap(), "M");
    assert_ne!(classe_de_cle(&b, 1.0).unwrap(), "M");
}

#[test]
fn the_class_follows_the_formula_of_the_design() {
    for i in 0..100 {
        let k = format!("f{i}");
        for t in [0.0, 0.3, 1.0] {
            let c = Rng::new(hash32(&format!("couleur:{k}"))).suivant();
            assert_eq!(classe_de_cle(&k, t).unwrap(), lettre_de(c, 0.65 + 1.45 * t));
        }
    }
}

#[test]
fn a_size_outside_zero_one_is_refused() {
    for t in [-0.001, 1.001, 2.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(classe_de_cle("a", t).is_err(), "{t}");
    }
    assert!(classe_de_cle("a", 0.0).is_ok());
    assert!(classe_de_cle("a", 1.0).is_ok());
}
