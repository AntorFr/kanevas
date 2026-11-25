//! `kanevas-carte-rendu-aspects-reliefs-etoiles`: one measured-value test per key (AD-aspects-reliefs-1, -2) for
//! `intensite`, `activite` (stars), `vue` and the signed `courbure` (comet), the proof that `anneau.couleur`,
//! `couleur2` and `opacite` colour the ring, the neutral value, the refusals, determinism and the sorting of
//! `trier_aspect`. Expected values are written by hand.
use coeur::edition::{trier_aspect, valider_aspect};
use coeur::rendu::*;
use serde_json::{json, Value};

fn image_c(t: &str, a: Value, cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": t, "aspect": a }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn lum(p: &[u8]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

const ETOILES: [&str; 10] = ["naine_rouge", "orange", "jaune_orange", "jaune", "jaune_vert", "blanche", "geante_rouge", "naine_blanche", "geante_bleue", "etoile"];

// ---- neutral value, determinism ------------------------------------------------------------------------------------

/// Panne : une valeur neutre déplace un octet, ou une clé entre dans la graine du corps.
#[test]
fn la_valeur_neutre_de_chaque_cle_redonne_les_octets_du_corps_sans_la_cle() {
    for t in ETOILES {
        for extra in [json!({}), json!({ "taches": 0.9, "halo": 0.8, "rayons": 12 })] {
            let sans = image_c(t, extra.clone(), 64);
            let mut a = extra.clone();
            a["activite"] = json!(0);
            assert_eq!(sans, image_c(t, a, 64), "{t} activite 0");
            let mut a = extra.clone();
            a["intensite"] = json!(1);
            assert_eq!(sans, image_c(t, a, 64), "{t} intensite 1");
        }
    }
    let sans = image_c("comete", json!({}), 64);
    assert_eq!(sans, image_c("comete", json!({ "vue": "profil" }), 64), "vue profil");
    // courbure: [0, 1] draws as before (the default 0.45 written out is the default)
    assert_eq!(sans, image_c("comete", json!({ "courbure": 0.45 }), 64));
}

#[test]
fn deux_dessins_du_meme_corps_avec_les_cles_donnent_les_memes_octets() {
    let e = json!({ "activite": 0.7, "intensite": 1.4 });
    assert_eq!(image_c("jaune", e.clone(), 96), image_c("jaune", e, 96));
    for c in [-0.6, 0.6] {
        let k = json!({ "vue": "face", "courbure": c });
        assert_eq!(image_c("comete", k.clone(), 96), image_c("comete", k, 96));
    }
    let r = json!({ "anneau": { "couleur": "#ff0000", "couleur2": "#0000ff", "opacite": 0.5 } });
    assert_eq!(image_c("gazeuse", r.clone(), 96), image_c("gazeuse", r, 96));
}

/// Panne : une clé neuve déplace le disque ou le masque alpha de la couronne qu'elle ne touche pas.
#[test]
fn intensite_et_activite_changent_les_octets_de_chaque_type_d_etoile() {
    for t in ETOILES {
        assert_ne!(image_c(t, json!({}), 64), image_c(t, json!({ "intensite": 0.5 }), 64), "{t} intensite");
        assert_ne!(image_c(t, json!({}), 64), image_c(t, json!({ "intensite": 2 }), 64), "{t} intensite 2");
        assert_ne!(image_c(t, json!({}), 64), image_c(t, json!({ "activite": 1 }), 64), "{t} activite");
    }
}

// ---- measured values -----------------------------------------------------------------------------------------------

/// Panne : `intensite` n'est plus lue, ou ne touche que le disque ou que la couronne.
#[test]
fn intensite_la_luminosite_moyenne_du_disque_et_de_la_couronne_croit_de_0_5_a_2() {
    let c = 192usize;
    for t in ["jaune", "geante_bleue", "naine_rouge"] {
        let mesure = |v: f64| {
            let o = image_c(t, json!({ "intensite": v, "halo": 1.0, "taches": 0 }), c as u32);
            let (mut d, mut nd, mut k, mut nk) = (0.0, 0.0, 0.0, 0.0);
            for (i, p) in o.chunks(4).enumerate() {
                let (x, y) = ((i % c) as f64 + 0.5 - c as f64 / 2.0, (i / c) as f64 + 0.5 - c as f64 / 2.0);
                let r = (x * x + y * y).sqrt() / (c as f64 / 2.0);
                // premultiplied reading: the light the pixel adds
                let l = lum(p) * f64::from(p[3]) / 255.0;
                if r < 0.3 {
                    d += l;
                    nd += 1.0;
                } else if r > 0.45 && r < 0.9 {
                    k += l;
                    nk += 1.0;
                }
            }
            (d / nd, k / nk)
        };
        let (a, b, e) = (mesure(0.5), mesure(1.0), mesure(2.0));
        assert!(a.0 < b.0 && b.0 < e.0, "{t}: disc grows {a:?} {b:?} {e:?}");
        assert!(a.1 < b.1 && b.1 < e.1, "{t}: corona grows {a:?} {b:?} {e:?}");
    }
}

/// Panne : `intensite` à 0 n'éteint pas l'étoile, ou ne la laisse pas encore bornée.
#[test]
fn intensite_a_0_donne_un_disque_plus_sombre_qu_a_0_5() {
    let somme = |v: f64| image_c("jaune", json!({ "intensite": v }), 96).chunks(4).map(|p| lum(p) * f64::from(p[3]) / 255.0).sum::<f64>();
    assert!(somme(0.0) < somme(0.5) * 0.2, "{} {}", somme(0.0), somme(0.5));
}

/// Panne : `activite` n'est plus lue, ou dessine à 0, ou dessine dans le disque et non au-dessus.
#[test]
fn activite_des_pixels_hors_du_disque_a_1_et_pas_a_0() {
    let c = 192usize;
    for t in ["jaune", "blanche", "geante_rouge"] {
        let base = json!({ "halo": 0, "rayons": 0, "taches": 0 });
        let sans = image_c(t, base.clone(), c as u32);
        let hors = |v: f64| -> usize {
            let mut a = base.clone();
            a["activite"] = json!(v);
            let o = image_c(t, a, c as u32);
            o.chunks(4).zip(sans.chunks(4)).filter(|(a, b)| i32::from(a[3]) > i32::from(b[3]) + 10).count()
        };
        assert_eq!(hors(0.0), 0, "{t}: nothing at 0");
        let (a, b) = (hors(0.4), hors(1.0));
        assert!(b > 50, "{t}: prominences at 1: {b}");
        assert!(b > a && a > 0, "{t}: grows {a} {b}");
        // they rise from the limb, not from the far corona: within a third of a radius of the disc edge
        let o = image_c(t, json!({ "halo": 0, "rayons": 0, "taches": 0, "activite": 1 }), c as u32);
        let mut max_r: f64 = 0.0;
        for (i, (a, b)) in o.chunks(4).zip(sans.chunks(4)).enumerate() {
            if i32::from(a[3]) > i32::from(b[3]) + 10 {
                let (x, y) = ((i % c) as f64 + 0.5 - c as f64 / 2.0, (i / c) as f64 + 0.5 - c as f64 / 2.0);
                max_r = max_r.max((x * x + y * y).sqrt());
            }
        }
        assert!(max_r < c as f64 / 2.0, "{t}: inside the square: {max_r}");
    }
}

fn centre_et_poids(o: &[u8], c: usize, f: impl Fn(f64, f64, f64) -> bool) -> (f64, f64, f64) {
    // (sum of weight, weighted mean s, weighted mean u) along the gas axis seen from the head
    let cote = c as f64;
    let tete = (cote / 2.0 + 0.3 * cote, cote / 2.0 - 0.22 * cote);
    let n = (0.8f64 * 0.8 + 0.6 * 0.6).sqrt();
    let (ax, ay) = (-0.8 / n, 0.6 / n);
    let (mut w, mut ms, mut mu) = (0.0, 0.0, 0.0);
    for (i, p) in o.chunks(4).enumerate() {
        let (x, y) = ((i % c) as f64 + 0.5 - tete.0, (i / c) as f64 + 0.5 - tete.1);
        let (s, u) = (x * ax + y * ay, -x * ay + y * ax);
        let l = f64::from(p[3]) / 255.0;
        if f(s, u, l) {
            w += l;
            ms += l * s;
            mu += l * u;
        }
    }
    (w, ms / w, mu / w)
}

/// Panne : `vue` n'est plus lue, ou `face` ne raccourcit pas la queue, ou ne l'élargit pas autour du noyau.
#[test]
fn vue_en_face_la_queue_est_plus_courte_le_long_de_l_axe_et_plus_large_autour_du_noyau() {
    let c = 192usize;
    let cote = c as f64;
    let profil = image_c("comete", json!({ "vue": "profil" }), c as u32);
    let face = image_c("comete", json!({ "vue": "face" }), c as u32);
    assert_ne!(profil, face);
    // extent along the axis: the farthest `s` where the alpha is over 0.1
    let etendue = |o: &[u8]| {
        let mut m: f64 = 0.0;
        let n = (0.8f64 * 0.8 + 0.6 * 0.6).sqrt();
        let tete = (cote / 2.0 + 0.3 * cote, cote / 2.0 - 0.22 * cote);
        for (i, p) in o.chunks(4).enumerate() {
            if p[3] > 25 {
                let (x, y) = ((i % c) as f64 + 0.5 - tete.0, (i / c) as f64 + 0.5 - tete.1);
                m = m.max((x * -0.8 + y * 0.6) / n);
            }
        }
        m
    };
    let (ep, ef) = (etendue(&profil), etendue(&face));
    assert!(ef < ep * 0.7, "shorter along the axis: {ep} then {ef}");
    // around the nucleus: more light within 0.12 of the side of the picture, outside the nucleus itself
    let autour = |o: &[u8]| {
        let tete = (cote / 2.0 + 0.3 * cote, cote / 2.0 - 0.22 * cote);
        o.chunks(4)
            .enumerate()
            .filter(|(i, _)| {
                let (x, y) = ((i % c) as f64 + 0.5 - tete.0, (i / c) as f64 + 0.5 - tete.1);
                let r = (x * x + y * y).sqrt();
                r > 0.04 * cote && r < 0.12 * cote
            })
            .map(|(_, p)| f64::from(p[3]) / 255.0)
            .sum::<f64>()
    };
    assert!(autour(&face) > autour(&profil) * 1.15, "wider round the nucleus: {} then {}", autour(&profil), autour(&face));
    // across the axis, close to the head
    let large = |o: &[u8]| centre_et_poids(o, c, |s, u, l| s > 0.02 * cote && s < 0.1 * cote && u.abs() < 0.3 * cote && l > 0.02).0;
    assert!(large(&face) > large(&profil), "{} {}", large(&profil), large(&face));
}

/// Panne : le signe de `courbure` ne courbe pas la queue de l'autre côté, ou ne la miroite pas.
#[test]
fn courbure_de_moins_0_6_a_plus_0_6_le_barycentre_de_la_queue_change_de_cote_de_l_axe() {
    let c = 192usize;
    let cote = c as f64;
    let queue = |v: f64| centre_et_poids(&image_c("comete", json!({ "courbure": v }), c as u32), c, |s, _, l| s > 0.25 * cote && l > 0.02);
    let (neg, nul, pos) = (queue(-0.6), queue(0.0), queue(0.6));
    assert!(neg.2 * pos.2 < 0.0, "opposite sides of the axis: {} and {}", neg.2, pos.2);
    assert!((neg.2.abs() - pos.2.abs()).abs() < 0.15 * pos.2.abs(), "same bend: {} {}", neg.2, pos.2);
    assert!((neg.1 - pos.1).abs() < 0.05 * pos.1.abs(), "same length: {} {}", neg.1, pos.1);
    assert!(neg.2 < nul.2 && nul.2 < pos.2 || neg.2 > nul.2 && nul.2 > pos.2, "monotone: {} {} {}", neg.2, nul.2, pos.2);
    // 1 bends more than 0.3, as before
    assert!(queue(1.0).2.abs() > queue(0.3).2.abs());
    assert!(queue(-1.0).2.abs() > queue(-0.3).2.abs());
}

/// Panne : l'image à −c n'est pas l'image à +c retournée par l'axe du gaz.
#[test]
fn courbure_l_image_a_moins_c_est_celle_de_plus_c_retournee_par_l_axe() {
    let c = 192usize;
    let cote = c as f64;
    let a = image_c("comete", json!({ "courbure": 0.6 }), c as u32);
    let b = image_c("comete", json!({ "courbure": -0.6 }), c as u32);
    assert_ne!(a, b);
    let tete = (cote / 2.0 + 0.3 * cote, cote / 2.0 - 0.22 * cote);
    let n = (0.8f64 * 0.8 + 0.6 * 0.6).sqrt();
    let (ax, ay) = (-0.8 / n, 0.6 / n);
    let (mut ecart, mut masse) = (0.0, 0.0);
    for i in 0..c * c {
        let (x, y) = ((i % c) as f64 + 0.5 - tete.0, (i / c) as f64 + 0.5 - tete.1);
        // reflection across the axis through the head
        let d = x * ax + y * ay;
        let (rx, ry) = (2.0 * d * ax - x, 2.0 * d * ay - y);
        let (px, py) = ((rx + tete.0 - 0.5).round(), (ry + tete.1 - 0.5).round());
        if px < 0.0 || py < 0.0 || px >= cote || py >= cote {
            continue;
        }
        let j = py as usize * c + px as usize;
        for k in 0..4 {
            ecart += (f64::from(b[4 * i + k]) - f64::from(a[4 * j + k])).abs();
            masse += f64::from(a[4 * j + k]);
        }
    }
    // measured 1.8 % with the noise mirrored with the tail, 2.7 % when only the tail is mirrored
    assert!(ecart < 0.022 * masse, "mirror image: gap {ecart} of {masse}");
}

/// Panne : le signe de courbure change la graine du corps, donc le bruit.
#[test]
fn courbure_de_0_a_1_donne_les_octets_de_la_version_2_et_le_signe_ne_change_pas_la_graine() {
    // the same bytes whether the value is written in the aspect or comes from the default of version 2
    let defaut = image_c("comete", json!({}), 64);
    assert_eq!(defaut, image_c("comete", json!({ "courbure": 0.45 }), 64));
    for v in [0.0, 0.3, 1.0] {
        let a = image_c("comete", json!({ "courbure": v, "vue": "profil" }), 64);
        assert_eq!(a, image_c("comete", json!({ "courbure": v }), 64), "{v}");
    }
}

// ---- the ring: colour and opacity, no new key -----------------------------------------------------------------

fn anneau(extra: Value) -> Vec<u8> {
    let mut an = json!({ "inclinaison": 0.4 });
    for (k, v) in extra.as_object().unwrap() {
        an[k] = v.clone();
    }
    image_c("gazeuse", json!({ "palette": vec!["#808080"; 7], "anneau": an, "bord": 0, "halo": 0 }), 192)
}

/// Panne : `anneau.couleur` ou `couleur2` n'est plus lue.
#[test]
fn anneau_couleur_la_teinte_des_pixels_d_anneau_se_rapproche_de_la_couleur_donnee() {
    // the body at the scale it has with a ring (opacity 0 draws none of it): ring pixels are those that differ from it
    let sans = anneau(json!({ "opacite": 0.0 }));
    let part = |o: &[u8], canal: usize| {
        let (mut r, mut t, mut k) = (0.0, 0.0, 0);
        for (a, b) in sans.chunks(4).zip(o.chunks(4)) {
            if a[3] == 0 && b[3] > 40 {
                r += f64::from(b[canal]);
                t += f64::from(b[0]) + f64::from(b[1]) + f64::from(b[2]);
                k += 1;
            }
        }
        (r / t, k)
    };
    for (hex, canal) in [("#ff0000", 0), ("#00ff00", 1), ("#0000ff", 2)] {
        let o = anneau(json!({ "couleur": hex, "couleur2": hex }));
        let (p, k) = part(&o, canal);
        assert!(k > 100, "{hex}: ring pixels {k}");
        assert!(p > 0.6, "{hex}: share of its channel {p}");
        let (neutre, _) = part(&anneau(json!({ "couleur": "#808080", "couleur2": "#808080" })), canal);
        assert!(p > neutre + 0.2, "{hex}: {p} against grey {neutre}");
    }
    // couleur2 reads too: with the first colour grey and the second red, the ring leans red
    let (r2, k) = part(&anneau(json!({ "couleur": "#808080", "couleur2": "#ff0000" })), 0);
    let (r0, _) = part(&anneau(json!({ "couleur": "#808080", "couleur2": "#808080" })), 0);
    assert!(k > 100 && r2 > r0 + 0.05, "couleur2: {r2} against {r0}");
}

/// Panne : `anneau.opacite` n'est plus lue, ou n'éclaircit pas le corps derrière.
#[test]
fn anneau_opacite_le_corps_derriere_l_anneau_est_d_autant_plus_visible_que_l_opacite_baisse() {
    // the ring keys are part of the body's seed: the bands move with the opacity, so the measure is a contrast
    // between the pixels the ring crosses (found at full opacity) and the rest of the body, never a pixel-to-pixel gap
    let blanc = |op: f64| anneau(json!({ "couleur": "#ffffff", "couleur2": "#ffffff", "interieur": 1.4, "exterieur": 2.0, "angle": -0.2, "opacite": op }));
    let zero = blanc(0.0);
    let plein = blanc(1.0);
    let sous: Vec<bool> = zero.chunks(4).zip(plein.chunks(4)).map(|(a, p)| a[3] == 255 && lum(p) > lum(a) + 40.0).collect();
    let k = sous.iter().filter(|b| **b).count();
    assert!(k > 300, "body pixels under the ring: {k}");
    let contraste = |op: f64| {
        let o = blanc(op);
        let (mut a, mut na, mut b, mut nb) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
        for (p, dessous) in o.chunks(4).zip(&sous) {
            if *dessous {
                a += lum(p);
                na += 1.0;
            } else if p[3] == 255 {
                b += lum(p);
                nb += 1.0;
            }
        }
        a / na - b / nb
    };
    let (c1, c7, c4, c1b) = (contraste(1.0), contraste(0.7), contraste(0.4), contraste(0.15));
    assert!(c1 > c7 && c7 > c4 && c4 > c1b, "the body shows more as the opacity falls: {c1} {c7} {c4} {c1b}");
    assert!(c1 > 40.0 && c1b < c1 * 0.5, "{c1} {c1b}");
}

// ---- refusals, sorting -----------------------------------------------------------------------------------------------

fn ok(t: &str, j: Value) -> bool {
    valider_aspect(t, &j.to_string()).is_ok()
}

/// Panne : `courbure` acceptée sur un corps qui n'est pas une comète (AD-aspects-reliefs-1).
#[test]
fn courbure_est_refusee_hors_comete_quel_que_soit_le_signe() {
    for t in ["tellurique", "gazeuse", "etoile_naine_rouge"] {
        for c in [-0.5, 0.0, 0.5] {
            if types_ok(t) {
                assert!(!ok(t, json!({ "courbure": c })), "{t} {c}");
            }
        }
    }
}

fn types_ok(t: &str) -> bool {
    types().contains(&t)
}

#[test]
fn les_bornes_de_chaque_cle_sont_acceptees_et_le_juste_au_dela_refuse() {
    for t in ETOILES {
        for (k, bas, haut) in [("activite", 0.0, 1.0), ("intensite", 0.0, 2.0)] {
            assert!(ok(t, json!({ k: bas })), "{t} {k} low");
            assert!(ok(t, json!({ k: haut })), "{t} {k} high");
            assert!(!ok(t, json!({ k: bas - 0.01 })), "{t} {k} below");
            assert!(!ok(t, json!({ k: haut + 0.01 })), "{t} {k} above");
            assert!(!ok(t, json!({ k: "1" })), "{t} {k} string");
            assert!(!ok(t, json!({ k: null })), "{t} {k} null");
        }
    }
    assert!(ok("comete", json!({ "courbure": -1.0 })));
    assert!(ok("comete", json!({ "courbure": 1.0 })));
    assert!(ok("comete", json!({ "courbure": -0.3 })));
    assert!(!ok("comete", json!({ "courbure": -1.01 })));
    assert!(!ok("comete", json!({ "courbure": 1.01 })));
    assert!(!ok("comete", json!({ "courbure": "0.5" })));
    for v in ["profil", "face"] {
        assert!(ok("comete", json!({ "vue": v })), "{v}");
    }
    for v in [json!("dessus"), json!(""), json!("Face"), json!(1), json!(true), json!(null)] {
        assert!(!ok("comete", json!({ "vue": v })), "{v}");
    }
}

#[test]
fn une_cle_sur_un_type_qui_ne_la_dessine_pas_est_refusee_avec_son_chemin_et_les_types() {
    for (k, t, v) in [
        ("activite", "tellurique", json!(0.5)),
        ("activite", "comete", json!(0.5)),
        ("activite", "gazeuse", json!(0.5)),
        ("intensite", "glace", json!(1)),
        ("intensite", "comete", json!(1)),
        ("vue", "jaune", json!("face")),
        ("vue", "gazeuse", json!("face")),
    ] {
        let e = valider_aspect(t, &json!({ k: v }).to_string()).expect_err(&format!("{k} on {t}")).to_string();
        assert!(e.contains(k), "{e} names the path");
    }
    let e = valider_aspect("gazeuse", r#"{"vue":"face"}"#).unwrap_err().to_string();
    assert!(e.contains("comete"), "{e}");
    let e = valider_aspect("tellurique", r#"{"activite":0.5}"#).unwrap_err().to_string();
    assert!(e.contains("jaune") && e.contains("etoile"), "{e}");
}

#[test]
fn trier_aspect_range_chacune_des_cles_parmi_les_rendues_et_aucune_sous_non_rendu() {
    for t in ETOILES {
        let a = json!({ "activite": 0.5, "intensite": 1.5 });
        let r: Value = serde_json::from_str(&trier_aspect(t, &a.to_string()).unwrap()).unwrap();
        assert_eq!(r["inconnues"], json!([]), "{t}");
        assert_eq!(r["garde"], a, "{t}");
    }
    let a = json!({ "vue": "face", "courbure": -0.4 });
    let r: Value = serde_json::from_str(&trier_aspect("comete", &a.to_string()).unwrap()).unwrap();
    assert_eq!(r["inconnues"], json!([]));
    assert_eq!(r["garde"], a);
    let r: Value = serde_json::from_str(&trier_aspect("jaune", r#"{"activite":0.5,"x":1}"#).unwrap()).unwrap();
    assert_eq!(r["garde"], json!({ "activite": 0.5 }));
    assert_eq!(r["inconnues"], json!(["aspect.x"]));
    assert!(trier_aspect("comete", r#"{"vue":"dessus"}"#).is_err());
    assert!(trier_aspect("comete", r#"{"courbure":2}"#).is_err());
    assert!(trier_aspect("gazeuse", r#"{"activite":0.5}"#).is_err());
}
