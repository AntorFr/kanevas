//! `kanevas-carte-rendu-nuit-coeur`: one measured-value test per key (`villes`, `lueur`, `force_lueur`) for the lights of
//! the night side (AD-nuit-1, AD-aspects-reliefs-1), the lit side kept byte for byte, the refusals and the sorting.
//! The star shines from the right (`lumiere` 0): the right of the disc is lit (`eclair` 1), its left is night (`eclair` 0).
use coeur::edition::{trier_aspect, valider_aspect};
use coeur::rendu::*;
use serde_json::{json, Value};

const COTE: u32 = 192;

fn image_c(t: &str, a: Value, cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": t, "aspect": a }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn lum(p: &[u8]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

/// A body on a uniform grey ground, star on the right, no cloud, no halo, no rim, no relief.
fn corps(extra: Value) -> Value {
    let mut o = json!({ "palette": vec!["#808080"; 7], "calottes": 0, "halo": 0, "bord": 0, "nuages": 0, "relief": 0, "lumiere": 0, "elevation": 0.5 });
    for (k, v) in extra.as_object().unwrap() {
        o[k] = v.clone();
    }
    o
}

/// Opaque pixels with their abscissa on the unit disc (-1 left, 1 right).
fn disque(o: &[u8]) -> Vec<(usize, f64)> {
    let g = COTE as usize;
    let opaques: Vec<usize> = (0..g * g).filter(|i| o[i * 4 + 3] == 255).collect();
    let (min, max) = opaques.iter().fold((g, 0), |(a, b), i| (a.min(i % g), b.max(i % g)));
    let (c, r) = ((min + max) as f64 / 2.0, (max - min) as f64 / 2.0);
    opaques.into_iter().map(|i| (i, ((i % g) as f64 + 0.0 - c) / r)).collect()
}

/// Night: dif = nx·cos(0.5) + nz·sin(0.5) <= -0.27 (past `terminateur` 0.12) for nx <= -0.7.
fn nuit(o: &[u8]) -> Vec<usize> {
    disque(o).into_iter().filter(|(_, x)| *x <= -0.75).map(|(i, _)| i).collect()
}
/// Lit: dif >= 0.32 for nx >= 0.5, `eclair` is 1.
fn jour(o: &[u8]) -> Vec<usize> {
    disque(o).into_iter().filter(|(_, x)| *x >= 0.55).map(|(i, _)| i).collect()
}

fn lum_moy(o: &[u8], px: &[usize]) -> f64 {
    px.iter().map(|i| lum(&o[i * 4..i * 4 + 4])).sum::<f64>() / px.len() as f64
}

fn octets(o: &[u8], px: &[usize]) -> Vec<u8> {
    px.iter().flat_map(|i| o[i * 4..i * 4 + 4].to_vec()).collect()
}

fn gain(t: &str, base: Value, avec: Value) -> f64 {
    let sans = image_c(t, corps(base.clone()), COTE);
    let mut b = base;
    for (k, v) in avec.as_object().unwrap() {
        b[k] = v.clone();
    }
    let a = image_c(t, corps(b), COTE);
    let n = nuit(&sans);
    assert!(n.len() > 500, "a night side to measure: {}", n.len());
    lum_moy(&a, &n) - lum_moy(&sans, &n)
}

// ---- villes, lueur ------------------------------------------------------------------------------------------------

#[test]
fn villes_la_luminance_de_la_face_nocturne_depasse_celle_du_corps_sans_la_cle() {
    for t in ["tellurique", "verrouillee"] {
        let g = gain(t, json!({ "mer": 0 }), json!({ "villes": 1.0 }));
        assert!(g > 0.3, "{t}: the night side gets brighter: {g}");
        assert!(gain(t, json!({ "mer": 0 }), json!({ "villes": 0.5 })) > 0.0, "{t}: 0.5");
        assert!(gain(t, json!({ "mer": 0 }), json!({ "villes": 0.5 })) < g, "{t}: monotone");
    }
}

#[test]
fn villes_la_mer_ne_gagne_aucun_pixel_clair() {
    // `mer` 1: the whole sphere under water but for the peaks; the lights stay on the land
    let sans = image_c("tellurique", corps(json!({ "mer": 1.0 })), COTE);
    let avec = image_c("tellurique", corps(json!({ "mer": 1.0, "villes": 1.0, "force_lueur": 2.0 })), COTE);
    let terre = image_c("tellurique", corps(json!({ "mer": 0.0, "villes": 1.0, "force_lueur": 2.0 })), COTE);
    let clairs = |a: &[u8], b: &[u8]| nuit(b).iter().filter(|i| lum(&a[*i * 4..*i * 4 + 4]) + 40.0 < lum(&b[*i * 4..*i * 4 + 4])).count();
    let (sur_mer, sur_terre) = (clairs(&sans, &avec), clairs(&image_c("tellurique", corps(json!({ "mer": 0.0 })), COTE), &terre));
    assert!(sur_terre > 5, "land at night gets bright pixels: {sur_terre}");
    assert!(sur_mer * 5 < sur_terre, "a sea world gets (nearly) none: {sur_mer} vs {sur_terre}");
}

#[test]
fn lueur_la_luminance_de_la_face_nocturne_depasse_celle_du_corps_sans_la_cle() {
    for t in ["tellurique", "verrouillee"] {
        let g = gain(t, json!({ "mer": 0 }), json!({ "lueur": 1.0 }));
        assert!(g > 0.3, "{t}: the night side gets brighter: {g}");
        let m = gain(t, json!({ "mer": 0 }), json!({ "lueur": 0.5 }));
        assert!(m > 0.0 && m < g, "{t}: monotone {m} {g}");
    }
}

#[test]
fn lueur_est_froide_et_les_villes_chaudes() {
    let moy = |o: &[u8], px: &[usize], c: usize| px.iter().map(|i| f64::from(o[i * 4 + c])).sum::<f64>() / px.len() as f64;
    let sans = image_c("tellurique", corps(json!({ "mer": 0 })), COTE);
    let n = nuit(&sans);
    let v = image_c("tellurique", corps(json!({ "villes": 1.0, "mer": 0 })), COTE);
    let l = image_c("tellurique", corps(json!({ "lueur": 1.0, "mer": 0 })), COTE);
    assert!(moy(&v, &n, 0) - moy(&sans, &n, 0) > moy(&v, &n, 2) - moy(&sans, &n, 2), "cities: more red than blue");
    assert!(moy(&l, &n, 2) - moy(&sans, &n, 2) > moy(&l, &n, 0) - moy(&sans, &n, 0), "glow: more blue than red");
}

// ---- force_lueur --------------------------------------------------------------------------------------------------

#[test]
fn force_lueur_l_ecart_de_luminance_nocturne_croit_de_0_5_a_1_a_2_et_il_est_nul_a_0() {
    for (t, extra) in [("tellurique", json!({ "villes": 1.0, "mer": 0 })), ("verrouillee", json!({ "lueur": 1.0 })), ("verrouillee", json!({ "villes": 1.0, "lueur": 1.0 }))] {
        let sans_cle = {
            let mut e = extra.clone();
            e.as_object_mut().unwrap().remove("villes");
            e.as_object_mut().unwrap().remove("lueur");
            e
        };
        let sans = image_c(t, corps(sans_cle), COTE);
        let n = nuit(&sans);
        let ecart = |f: f64| {
            let mut e = extra.clone();
            e["force_lueur"] = json!(f);
            lum_moy(&image_c(t, corps(e), COTE), &n) - lum_moy(&sans, &n)
        };
        let (a, b, c, d) = (ecart(0.0), ecart(0.5), ecart(1.0), ecart(2.0));
        assert!(a.abs() < 1e-9, "{t} {extra}: nul at 0: {a}");
        assert!(b > 0.0 && b < c && c < d, "{t} {extra}: grows {b} {c} {d}");
        let mut e = extra.clone();
        e["force_lueur"] = json!(0.0);
        assert_eq!(image_c(t, corps(e), COTE), sans_image(t, &extra), "{t}: force_lueur 0 gives the bytes of a body without lights");
    }
}

fn sans_image(t: &str, extra: &Value) -> Vec<u8> {
    let mut e = extra.clone();
    e.as_object_mut().unwrap().remove("villes");
    e.as_object_mut().unwrap().remove("lueur");
    image_c(t, corps(e), COTE)
}

#[test]
fn force_lueur_sans_villes_ni_lueur_ne_change_aucun_octet() {
    for t in ["tellurique", "verrouillee"] {
        let sans = image_c(t, corps(json!({})), COTE);
        for f in [0.0, 0.5, 1.0, 2.0] {
            assert_eq!(sans, image_c(t, corps(json!({ "force_lueur": f })), COTE), "{t} {f}");
            assert_eq!(sans, image_c(t, corps(json!({ "force_lueur": f, "villes": 0, "lueur": 0 })), COTE), "{t} {f} at 0");
        }
    }
}

// ---- the lit side, neutral values, determinism -----------------------------------------------------------------------

#[test]
fn le_cote_eclaire_garde_les_octets_du_corps_sans_les_cles_pour_chacune_des_trois() {
    for t in ["tellurique", "verrouillee"] {
        let sans = image_c(t, corps(json!({})), COTE);
        let j = jour(&sans);
        assert!(j.len() > 500, "a lit side to compare");
        for extra in [json!({ "villes": 1.0 }), json!({ "lueur": 1.0 }), json!({ "villes": 1.0, "force_lueur": 2.0 }), json!({ "lueur": 1.0, "force_lueur": 2.0 })] {
            let avec = image_c(t, corps(extra.clone()), COTE);
            assert_ne!(sans, avec, "{t} {extra}: the night side did change");
            assert_eq!(octets(&sans, &j), octets(&avec, &j), "{t} {extra}: lit side untouched");
        }
        // `force_lueur` alone never moves the lit side either
        assert_eq!(octets(&sans, &j), octets(&image_c(t, corps(json!({ "force_lueur": 2.0 })), COTE), &j));
    }
}

#[test]
fn la_valeur_neutre_redonne_les_octets_et_le_masque_alpha_ne_bouge_pas() {
    assert_eq!(VERSION_RENDU, 3);
    let alpha = |o: &[u8]| o.chunks(4).map(|p| p[3]).collect::<Vec<_>>();
    for t in ["tellurique", "verrouillee"] {
        for extra in [json!({}), json!({ "relief": 1.0, "calottes": 0.4, "halo": 0.5, "nuages": 0.5 })] {
            let base = image_c(t, extra.clone(), 64);
            for neutre in [json!({ "villes": 0 }), json!({ "lueur": 0 }), json!({ "villes": 0, "lueur": 0, "force_lueur": 1 })] {
                let mut e = extra.clone();
                for (k, v) in neutre.as_object().unwrap() {
                    e[k] = v.clone();
                }
                assert_eq!(base, image_c(t, e, 64), "{t} {extra} {neutre}");
            }
        }
        let sans = image_c(t, corps(json!({})), 64);
        let avec = image_c(t, corps(json!({ "villes": 1.0, "lueur": 1.0 })), 64);
        assert_eq!(alpha(&sans), alpha(&avec), "{t}: alpha");
    }
}

#[test]
fn les_cles_ne_changent_pas_qui_est_le_corps_la_face_eclairee_vaut_aussi_avec_un_relief_et_des_nuages() {
    // the seed stays: with a relief and clouds, the lit pixels of a lit world are still those of the body without the keys
    let base = json!({ "relief": 1.0, "nuages": 0.0, "lumiere": 0, "calottes": 0, "halo": 0 });
    let sans = image_c("tellurique", base.clone(), COTE);
    let mut b = base;
    b["villes"] = json!(1.0);
    b["lueur"] = json!(1.0);
    let avec = image_c("tellurique", b, COTE);
    let diff = sans.chunks(4).zip(avec.chunks(4)).filter(|(a, b)| a != b).count();
    assert!(diff > 0);
    let g = COTE as usize;
    // the columns well on the lit half are all equal
    for y in 0..g {
        for x in (g * 3 / 4)..g {
            let i = (y * g + x) * 4;
            // an opaque pixel past 3/4 of the width is at nx >= 0.5 whatever the disc radius
            if sans[i + 3] == 255 {
                assert_eq!(sans[i..i + 4], avec[i..i + 4], "({x},{y})");
            }
        }
    }
}

#[test]
fn deux_dessins_du_meme_corps_avec_les_trois_cles_donnent_les_memes_octets() {
    for t in ["tellurique", "verrouillee"] {
        let a = json!({ "villes": 0.7, "lueur": 0.6, "force_lueur": 1.5 });
        assert_eq!(image_c(t, a.clone(), 96), image_c(t, a, 96), "{t}");
    }
}

// ---- refusals, sorting ----------------------------------------------------------------------------------------------

fn ok(t: &str, j: Value) -> bool {
    valider_aspect(t, &j.to_string()).is_ok()
}

#[test]
fn les_bornes_de_chaque_cle_sont_acceptees_et_le_juste_au_dela_refuse() {
    for (k, max) in [("villes", 1.0), ("lueur", 1.0), ("force_lueur", 2.0)] {
        for t in ["tellurique", "verrouillee"] {
            assert!(ok(t, json!({ k: 0.0 })), "{t} {k} at 0");
            assert!(ok(t, json!({ k: max })), "{t} {k} at {max}");
            assert!(!ok(t, json!({ k: -0.01 })), "{t} {k} below 0");
            assert!(!ok(t, json!({ k: max + 0.01 })), "{t} {k} above {max}");
            assert!(!ok(t, json!({ k: "1" })), "{t} {k} string");
            assert!(!ok(t, json!({ k: null })), "{t} {k} null");
            assert!(!ok(t, json!({ k: true })), "{t} {k} bool");
        }
    }
}

#[test]
fn une_cle_sur_un_type_qui_ne_la_dessine_pas_est_refusee_avec_son_chemin_et_les_types() {
    for k in ["villes", "lueur", "force_lueur"] {
        for t in ["gazeuse", "glace", "rocheux", "lave", "etoile", "comete"] {
            let e = valider_aspect(t, &json!({ k: 0.5 }).to_string()).expect_err(&format!("{k} on {t}")).to_string();
            assert!(e.contains(k), "{t}: {e} names the path");
            assert!(e.contains("tellurique") && e.contains("verrouillee"), "{k} on {t}: {e} lists the types");
        }
    }
}

#[test]
fn trier_aspect_range_les_trois_cles_parmi_les_rendues_et_aucune_sous_non_rendu() {
    for t in ["tellurique", "verrouillee"] {
        for a in [json!({ "villes": 0.5, "lueur": 0.5, "force_lueur": 1.5 }), json!({ "villes": 0, "lueur": 1, "force_lueur": 0 })] {
            let r: Value = serde_json::from_str(&trier_aspect(t, &a.to_string()).unwrap()).unwrap();
            assert_eq!(r["inconnues"], json!([]), "{t}: nothing goes to non_rendu");
            assert_eq!(r["garde"], a, "{t}: every key kept as written");
        }
    }
    assert!(trier_aspect("glace", r#"{"villes":0.5}"#).is_err());
    assert!(trier_aspect("tellurique", r#"{"force_lueur":2.5}"#).is_err());
}
