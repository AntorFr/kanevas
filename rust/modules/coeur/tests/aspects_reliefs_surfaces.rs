//! `kanevas-carte-rendu-aspects-reliefs-surfaces`: one measured-value test per key (AD-aspects-reliefs-1, -2) for
//! `canyons`, `lave`, `cristaux`, `geysers`, `couleur_fissures` and `cratere_glace`, the neutral value, the refusals,
//! determinism and the sorting of `trier_aspect`. Expected values are written by hand.
use coeur::edition::{trier_aspect, valider_aspect};
use coeur::rendu::*;
use serde_json::{json, Value};

fn image_c(t: &str, a: Value, cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": t, "aspect": a }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn lum(p: &[u8]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

/// A neutral body on a uniform grey ground: no cap, no halo, no sea, no cloud, no rim light.
fn gris(extra: Value) -> Value {
    let mut o = json!({ "palette": vec!["#808080"; 7], "calottes": 0, "halo": 0, "bord": 0, "mer": 0, "nuages": 0 });
    for (k, v) in extra.as_object().unwrap() {
        o[k] = v.clone();
    }
    o
}

fn lus(o: &[u8]) -> Vec<f64> {
    o.chunks(4).filter(|p| p[3] == 255).map(lum).collect()
}

fn mediane(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[v.len() / 2]
}

// ---- neutral value, determinism, version -----------------------------------------------------------------------

/// (type, key, neutral value)
const NEUTRES: [(&str, &str, f64); 6] = [
    ("rocheux", "canyons", 0.0),
    ("tellurique", "canyons", 0.0),
    ("rocheux", "lave", 0.0),
    ("glace", "cristaux", 0.0),
    ("glace", "geysers", 0.0),
    ("glace", "cratere_glace", 0.0),
];

/// Panne : une valeur neutre déplace un octet, ou une clé entre dans la graine du corps.
#[test]
fn la_valeur_neutre_de_chaque_cle_redonne_les_octets_du_corps_sans_la_cle() {
    assert_eq!(VERSION_RENDU, 3);
    for (t, k, v) in NEUTRES {
        for extra in [json!({}), json!({ "fissures": 0.6, "relief": 1.0, "calottes": 0.4, "halo": 0.5 })] {
            let sans = image_c(t, extra.clone(), 64);
            let mut avec = extra.clone();
            avec[k] = json!(v);
            assert_eq!(sans, image_c(t, avec, 64), "{t} {k}={v}");
        }
    }
    // `couleur_fissures: null` clears the key
    for t in ["glace", "rocheux", "lave"] {
        assert_eq!(image_c(t, json!({ "fissures": 0.6 }), 64), image_c(t, json!({ "fissures": 0.6, "couleur_fissures": null }), 64), "{t}");
    }
    // `cratere_glace` 0 leaves the number of craters without effect on an ice world
    assert_eq!(image_c("glace", json!({ "crateres_nombre": 400 }), 64), image_c("glace", json!({ "cratere_glace": 0, "crateres_nombre": 400 }), 64));
}

/// Panne : une clé neuve entre dans la graine, ou déplace le disque ou le masque alpha.
#[test]
fn une_cle_ne_change_que_son_dessin_et_laisse_le_masque_alpha() {
    let alpha = |o: &[u8]| o.chunks(4).map(|p| p[3]).collect::<Vec<_>>();
    for (t, a) in [
        ("rocheux", json!({ "canyons": 1.0 })),
        ("rocheux", json!({ "lave": 1.0 })),
        ("glace", json!({ "cristaux": 1.0 })),
        ("glace", json!({ "cratere_glace": 1.0 })),
        ("glace", json!({ "fissures": 0.6, "couleur_fissures": "#ff0000" })),
    ] {
        let sans = image_c(t, gris(json!({})), 64);
        let avec = image_c(t, gris(a.clone()), 64);
        assert_ne!(sans, avec, "{t} {a}");
        assert_eq!(alpha(&sans), alpha(&avec), "{t} {a}");
    }
}

#[test]
fn deux_dessins_du_meme_corps_avec_les_six_cles_donnent_les_memes_octets() {
    let g = json!({ "canyons": 0.7, "cristaux": 0.5, "geysers": 0.8, "couleur_fissures": "#ff8800", "cratere_glace": 0.9, "crateres_nombre": 200, "fissures": 0.6 });
    assert_eq!(image_c("glace", g.clone(), 96), image_c("glace", g, 96));
    let r = json!({ "canyons": 0.7, "lave": 0.8, "cristaux": 0.5, "geysers": 0.8, "couleur_fissures": "#ff8800" });
    assert_eq!(image_c("rocheux", r.clone(), 96), image_c("rocheux", r, 96));
    let l = json!({ "couleur_fissures": "#00ff88" });
    assert_eq!(image_c("lave", l.clone(), 96), image_c("lave", l, 96));
}

// ---- measured values ----------------------------------------------------------------------------------------------

/// Panne : `canyons` n'est plus lue, ou n'assombrit rien.
#[test]
fn canyons_la_part_de_pixels_sombres_croit_de_0_a_1_sur_rocheux_et_tellurique() {
    for t in ["rocheux", "tellurique"] {
        // share of the disc pixels darkened by over 15% against the body without canyons (a line at 1 is ×0.3, at 0.5 ×0.65)
        let sans = image_c(t, gris(json!({ "relief": 0 })), 192);
        let part = |v: f64| {
            let o = image_c(t, gris(json!({ "relief": 0, "canyons": v })), 192);
            let (mut n, mut k) = (0.0, 0.0);
            for (a, b) in sans.chunks(4).zip(o.chunks(4)).filter(|(a, _)| a[3] == 255) {
                n += 1.0;
                if lum(b) < lum(a) * 0.85 {
                    k += 1.0;
                }
            }
            k / n
        };
        let (a, b, c) = (part(0.0), part(0.5), part(1.0));
        assert_eq!(a, 0.0, "{t}: no dark pixel at 0");
        assert!(a < b && b < c, "{t}: grows {a} {b} {c}");
        assert!(c > 0.0015 && c < 0.5, "{t}: a visible share of dark lines at 1: {c}");
    }
}

/// Panne : `lave` n'est plus lue, apparaît sur le relief haut, ou sur un autre type.
#[test]
fn lave_des_pixels_chauds_sur_un_rocheux_a_1_aucun_a_0_jamais_ailleurs_que_sur_le_relief_bas() {
    let chaud = |p: &[u8]| p[3] == 255 && p[0] > 120 && f64::from(p[0]) > f64::from(p[2]) * 1.8 && p[0] > p[1];
    let n = |v: f64| image_c("rocheux", gris(json!({ "lave": v })), 192).chunks(4).filter(|p| chaud(p)).count();
    assert_eq!(n(0.0), 0, "no hot pixel at 0");
    let (a, b) = (n(0.5), n(1.0));
    assert!(b > 30, "hot pixels at 1: {b}");
    assert!(b > a, "more at 1 than at 0.5: {a} {b}");
    // only on the low relief: the pixels that changed were low in the picture without lava, and the high ground stays
    let sans = image_c("rocheux", gris(json!({})), 192);
    let avec = image_c("rocheux", gris(json!({ "lave": 1.0 })), 192);
    let (mut changes, mut inchanges) = (0, 0);
    for (x, y) in sans.chunks(4).zip(avec.chunks(4)) {
        if x[3] != 255 {
            continue;
        }
        if x == y { inchanges += 1 } else { changes += 1 }
    }
    assert!(inchanges > changes, "lava does not cover the whole body: {changes} changed, {inchanges} kept");
    // not on another type of world
    for t in ["glace", "tellurique", "gazeuse"] {
        let e = valider_aspect(t, r#"{"lave":1}"#).expect_err(t).to_string();
        assert!(e.contains("lave"), "{e}");
    }
}

/// Panne : `cristaux` n'est plus lue, ou dessine des taches et non des points.
#[test]
fn cristaux_le_nombre_de_pixels_clairs_isoles_croit_et_aucun_a_0() {
    for t in ["glace", "rocheux"] {
        let n = |v: f64| -> usize {
            let c = 256usize;
            let o = image_c(t, gris(json!({ "cristaux": v })), c as u32);
            let l: Vec<f64> = o.chunks(4).map(|p| if p[3] == 255 { lum(p) } else { 0.0 }).collect();
            // isolated bright pixel: much brighter than the median of the body, with no bright 4-neighbour at the same level
            let seuil = 215.0;
            (0..c * c).filter(|&i| l[i] > seuil).count()
        };
        let (a, b, c) = (n(0.0), n(0.5), n(1.0));
        assert_eq!(a, 0, "{t}: no clear pixel at 0 on a mid-grey ground");
        assert!(b > 0 && b < c, "{t}: grows {a} {b} {c}");
        assert!(c > 20, "{t}: crystals at 1: {c}");
        // sparse: far from covering the disc
        assert!(c < 256 * 256 / 8, "{t}: crystals are isolated: {c}");
    }
}

/// Panne : `geysers` ne dessine rien hors du disque, ou dessine à 0.
#[test]
fn geysers_des_pixels_hors_du_disque_a_1_aucun_a_0() {
    for t in ["glace", "rocheux"] {
        let c = 192usize;
        let sans = image_c(t, gris(json!({})), c as u32);
        let hors = |o: &[u8]| -> usize {
            // pixels that differ from the picture without geysers and lie outside the disc of the body (alpha 0 there before)
            o.chunks(4).zip(sans.chunks(4)).filter(|(a, b)| b[3] == 0 && a[3] > 0).count()
        };
        assert_eq!(hors(&image_c(t, gris(json!({ "geysers": 0 })), c as u32)), 0, "{t} at 0");
        let (a, b) = (hors(&image_c(t, gris(json!({ "geysers": 0.4 })), c as u32)), hors(&image_c(t, gris(json!({ "geysers": 1.0 })), c as u32)));
        assert!(a > 5 && b > a, "{t}: plumes off the disc: {a} then {b}");
    }
    // the body inside the disc stays as it was, but for the grain (one draw per visible pixel, so a plume shifts it by ±1-2 levels)
    let c = 128usize;
    let sans = image_c("glace", gris(json!({})), c as u32);
    let avec = image_c("glace", gris(json!({ "geysers": 1.0 })), c as u32);
    for (i, (a, b)) in sans.chunks(4).zip(avec.chunks(4)).enumerate() {
        let (dx, dy) = ((i % c) as f32 + 0.5 - 64.0, (i / c) as f32 + 0.5 - 64.0);
        if (dx * dx + dy * dy).sqrt() < 0.93 * 0.78 * 64.0 {
            for k in 0..3 {
                assert!((i32::from(a[k]) - i32::from(b[k])).abs() <= 3, "pixel {i} channel {k}: {} vs {}", a[k], b[k]);
            }
        }
    }
}

/// Panne : `couleur_fissures` n'est plus lue.
#[test]
fn couleur_fissures_la_teinte_des_pixels_de_fissure_se_rapproche_de_la_couleur_sur_une_glace_a_0_6() {
    // among the pixels where the channel of the colour rose by over 40 against the body without the colour (the cracks),
    // the share of that channel in the pixel: 1/3 on grey, up to 1 on the pure colour
    let part = |col: &str, canal: usize| -> (f64, usize) {
        let sans = image_c("glace", gris(json!({ "fissures": 0.6 })), 192);
        let avec = image_c("glace", gris(json!({ "fissures": 0.6, "couleur_fissures": col })), 192);
        let (mut r, mut t, mut k) = (0.0, 0.0, 0);
        for (a, b) in sans.chunks(4).zip(avec.chunks(4)) {
            if b[3] == 255 && (i32::from(b[canal]) - i32::from(a[canal])) > 40 {
                r += f64::from(b[canal]);
                t += f64::from(b[0]) + f64::from(b[1]) + f64::from(b[2]);
                k += 1;
            }
        }
        (r / t, k)
    };
    let (rouge, k) = part("#ff0000", 0);
    assert!(k > 20, "cracks found: {k}");
    assert!(rouge > 0.45, "red cracks: {rouge}");
    let (bleu, kb) = part("#0000ff", 2);
    assert!(kb > 20 && bleu > 0.45, "blue cracks: {bleu} on {kb}");
    // a different colour gives a different hue: the red channel of the red cracks is far above the one of the blue cracks
    let (vert, _) = part("#00ff00", 1);
    assert!(vert > 0.45, "green cracks: {vert}");
}

/// Panne : `couleur_fissures` ne remplace pas la couleur chaude d'une lave, ou ne se lit pas sur rocheux.
#[test]
fn couleur_fissures_sur_lave_remplace_le_chaud_et_sur_rocheux_trace_des_fissures() {
    let sans = image_c("lave", json!({}), 128);
    let bleu = image_c("lave", json!({ "couleur_fissures": "#0000ff" }), 128);
    assert_ne!(sans, bleu);
    let teinte = |o: &[u8]| -> f64 {
        let (mut b, mut t) = (0.0, 0.0);
        for p in o.chunks(4).filter(|p| p[3] == 255 && p[0].max(p[1]).max(p[2]) > 150) {
            b += f64::from(p[2]);
            t += f64::from(p[0]) + f64::from(p[1]) + f64::from(p[2]);
        }
        b / t
    };
    assert!(teinte(&bleu) > teinte(&sans) + 0.2, "the glowing cracks turn blue: {} vs {}", teinte(&sans), teinte(&bleu));
    // rocheux: cracks drawn in the colour even with no `fissures`
    let r0 = image_c("rocheux", gris(json!({})), 128);
    let r1 = image_c("rocheux", gris(json!({ "couleur_fissures": "#ff0000" })), 128);
    let rouges = r0.chunks(4).zip(r1.chunks(4)).filter(|(a, b)| a != b && b[0] > b[1] + 20).count();
    assert!(rouges > 30, "red cracks on a rocky world: {rouges}");
}

/// Panne : `cratere_glace` n'est plus lue, ou `crateres_nombre` ne compte plus sur glace.
#[test]
fn cratere_glace_plus_de_creux_sombres_a_1_qu_a_0_et_400_craters_plus_que_20() {
    let creux = |v: f64, nb: Option<f64>| -> usize {
        let mut a = gris(json!({ "relief": 0, "cratere_glace": v }));
        if let Some(n) = nb {
            a["crateres_nombre"] = json!(n);
        }
        let o = image_c("glace", a, 256);
        let l = lus(&o);
        let m = mediane(lus(&image_c("glace", gris(json!({ "relief": 0 })), 256)));
        l.iter().filter(|x| **x < m * 0.6).count()
    };
    let (a, b) = (creux(0.0, None), creux(1.0, None));
    assert!(b > a + 200, "more dark hollows at 1 than at 0: {a} -> {b}");
    assert!(creux(0.5, None) > a, "monotone");
    let (v20, v400) = (creux(1.0, Some(20.0)), creux(1.0, Some(400.0)));
    assert!(v400 > v20, "400 craters leave more hollows than 20: {v20} -> {v400}");
}

// ---- the other types, refusals, sorting -----------------------------------------------------------------------------

#[test]
fn chaque_cle_change_les_octets_des_types_qui_la_dessinent() {
    for (t, a) in [
        ("rocheux", json!({ "canyons": 1.0 })),
        ("tellurique", json!({ "canyons": 1.0 })),
        ("rocheux", json!({ "lave": 1.0 })),
        ("rocheux", json!({ "cristaux": 1.0 })),
        ("glace", json!({ "cristaux": 1.0 })),
        ("rocheux", json!({ "geysers": 1.0 })),
        ("glace", json!({ "geysers": 1.0 })),
        ("glace", json!({ "couleur_fissures": "#ff0000", "fissures": 0.6 })),
        ("rocheux", json!({ "couleur_fissures": "#ff0000" })),
        ("lave", json!({ "couleur_fissures": "#00ff00" })),
        ("glace", json!({ "cratere_glace": 1.0 })),
    ] {
        assert_ne!(image_c(t, json!({}), 64), image_c(t, a.clone(), 64), "{t} {a}");
    }
}

fn ok(t: &str, j: Value) -> bool {
    valider_aspect(t, &j.to_string()).is_ok()
}

#[test]
fn les_bornes_de_chaque_cle_sont_acceptees_et_le_juste_au_dela_refuse() {
    for (t, k) in [("rocheux", "canyons"), ("tellurique", "canyons"), ("rocheux", "lave"), ("glace", "cristaux"), ("rocheux", "cristaux"), ("glace", "geysers"), ("rocheux", "geysers"), ("glace", "cratere_glace")] {
        assert!(ok(t, json!({ k: 0.0 })), "{t} {k} at 0");
        assert!(ok(t, json!({ k: 1.0 })), "{t} {k} at 1");
        assert!(!ok(t, json!({ k: -0.01 })), "{t} {k} below 0");
        assert!(!ok(t, json!({ k: 1.01 })), "{t} {k} above 1");
        assert!(!ok(t, json!({ k: "1" })), "{t} {k} string");
        assert!(!ok(t, json!({ k: null })), "{t} {k} null");
    }
    for t in ["glace", "rocheux", "lave"] {
        assert!(ok(t, json!({ "couleur_fissures": "#aabbcc" })), "{t}");
        assert!(ok(t, json!({ "couleur_fissures": null })), "{t} null clears");
        for v in [json!("rouge"), json!("#abc"), json!(12), json!("#gggggg")] {
            assert!(!ok(t, json!({ "couleur_fissures": v })), "{t} {v}");
        }
    }
    // `crateres_nombre` is read on ice too, and its bound is the same as ever
    assert!(ok("glace", json!({ "crateres_nombre": 400 })));
    assert!(!ok("glace", json!({ "crateres_nombre": 2001 })));
}

#[test]
fn une_cle_sur_un_type_qui_ne_la_dessine_pas_est_refusee_avec_son_chemin_et_les_types() {
    let cas: [(&str, &str, Value, &[&str]); 12] = [
        ("canyons", "glace", json!(0.5), &["rocheux", "tellurique"]),
        ("canyons", "gazeuse", json!(0.5), &["rocheux", "tellurique"]),
        ("lave", "glace", json!(0.5), &["rocheux"]),
        ("lave", "tellurique", json!(0.5), &["rocheux"]),
        ("cristaux", "tellurique", json!(0.5), &["glace", "rocheux"]),
        ("cristaux", "lave", json!(0.5), &["glace", "rocheux"]),
        ("geysers", "gazeuse", json!(0.5), &["glace", "rocheux"]),
        ("geysers", "tellurique", json!(0.5), &["glace", "rocheux"]),
        ("couleur_fissures", "tellurique", json!("#ff0000"), &["glace", "rocheux", "lave"]),
        ("couleur_fissures", "gazeuse", json!("#ff0000"), &["glace", "rocheux", "lave"]),
        ("cratere_glace", "rocheux", json!(0.5), &["glace"]),
        ("cratere_glace", "lave", json!(0.5), &["glace"]),
    ];
    for (k, t, v, types) in cas {
        let e = valider_aspect(t, &json!({ k: v }).to_string()).expect_err(&format!("{k} on {t}")).to_string();
        assert!(e.contains(k), "{e} names the path");
        for ty in types {
            assert!(e.contains(ty), "{k} on {t}: {e} lists {ty}");
        }
    }
}

#[test]
fn trier_aspect_range_chacune_des_cles_parmi_les_rendues_et_aucune_sous_non_rendu() {
    let tous = [
        ("rocheux", json!({ "canyons": 0.5, "lave": 0.5, "cristaux": 0.5, "geysers": 0.5, "couleur_fissures": "#aabbcc" })),
        ("tellurique", json!({ "canyons": 0.5 })),
        ("glace", json!({ "cristaux": 0.5, "geysers": 0.5, "couleur_fissures": null, "cratere_glace": 0.5, "crateres_nombre": 100 })),
        ("lave", json!({ "couleur_fissures": "#aabbcc" })),
    ];
    for (t, a) in tous {
        let r: Value = serde_json::from_str(&trier_aspect(t, &a.to_string()).unwrap_or_else(|e| panic!("{t}: {e}"))).unwrap();
        assert_eq!(r["inconnues"], json!([]), "{t}: nothing goes to non_rendu");
        assert_eq!(r["garde"], a, "{t}: every key kept as written");
    }
    let r: Value = serde_json::from_str(&trier_aspect("glace", r#"{"geysers":0.5,"x":1}"#).unwrap()).unwrap();
    assert_eq!(r["garde"], json!({ "geysers": 0.5 }));
    assert_eq!(r["inconnues"], json!(["aspect.x"]));
    assert!(trier_aspect("tellurique", r#"{"geysers":0.5}"#).is_err());
    assert!(trier_aspect("glace", r#"{"cratere_glace":2}"#).is_err());
}
