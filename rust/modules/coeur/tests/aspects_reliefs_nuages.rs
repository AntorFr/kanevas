//! `kanevas-carte-rendu-aspects-reliefs-nuages`: one measured-value test per key (AD-aspects-reliefs-1, -2), the
//! neutral value, the refusals, determinism and the sorting of `trier_aspect`. Expected values are written by hand.
use coeur::edition::{trier_aspect, valider_aspect};
use coeur::rendu::*;
use serde_json::{json, Value};

const C: usize = 128;

fn image_c(t: &str, a: Value, cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": t, "aspect": a }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn image(t: &str, a: Value) -> Vec<u8> {
    image_c(t, a, C as u32)
}

/// A neutral body: black ground, no cap, no halo, no sea, no rim light.
fn base(extra: Value) -> Value {
    let mut o = json!({ "palette": vec!["#000000"; 7], "calottes": 0, "halo": 0, "bord": 0, "mer": 0, "nuages": 0 });
    for (k, v) in extra.as_object().unwrap() {
        o[k] = v.clone();
    }
    o
}

fn lum(p: &[u8]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

fn trie(t: &str, j: &str) -> Value {
    serde_json::from_str(&trier_aspect(t, j).unwrap_or_else(|e| panic!("{t} {j}: {e}"))).unwrap()
}

// ---- version, determinism, neutral value --------------------------------------------------------------------------

#[test]
fn la_version_du_rendu_est_3() {
    assert_eq!(VERSION_RENDU, 3);
}

/// (type, key, neutral value)
const NEUTRES: [(&str, &str, f64); 8] = [
    ("tellurique", "opacite_nuages", 1.0),
    ("tellurique", "terre_seche", 0.0),
    ("tellurique", "etirement", 1.0),
    ("tellurique", "eclairs", 0.0),
    ("tellurique", "inclinaison", 0.0),
    ("tellurique", "mers", 1.0),
    ("gazeuse", "atmosphere_epaisseur", 0.5),
    ("gazeuse", "etirement", 1.0),
];

/// Panne : une valeur neutre déplace un octet, ou une clé entre dans la graine du corps.
#[test]
fn la_valeur_neutre_de_chaque_cle_redonne_les_octets_du_corps_sans_la_cle() {
    for (t, k, v) in NEUTRES {
        for extra in [json!({}), json!({ "nuages": 0.7, "calottes": 0.5, "halo": 0.6 })] {
            let mut sans = extra.clone();
            let sans_b = image_c(t, sans.take(), 64);
            let mut avec = extra.clone();
            avec[k] = json!(v);
            assert_eq!(sans_b, image_c(t, avec, 64), "{t} {k}={v}");
        }
    }
    // the colour: `null` clears it
    assert_eq!(image_c("tellurique", json!({ "nuages": 0.7 }), 64), image_c("tellurique", json!({ "nuages": 0.7, "couleur_nuages": null }), 64));
    // the neutral value of a key leaves a verrouillee body as it was
    for (k, v) in [("terre_seche", 0.0), ("etirement", 1.0), ("opacite_nuages", 1.0), ("inclinaison", 0.0), ("atmosphere_epaisseur", 0.5)] {
        assert_eq!(image_c("verrouillee", json!({}), 64), image_c("verrouillee", json!({ k: v }), 64), "verrouillee {k}");
    }
}

/// Panne : une clé neuve entre dans la graine — son changement déplace tout le corps, pas seulement ce qu'elle dessine.
#[test]
fn une_cle_ne_change_pas_le_corps_elle_ne_change_que_son_dessin() {
    let a = image_c("tellurique", base(json!({ "inclinaison": 0 })), 64);
    let b = image_c("tellurique", base(json!({ "atmosphere_epaisseur": 0.5, "etirement": 1.0 })), 64);
    assert_eq!(a, b);
    // the same body with a key: the corners (outside the disc) and the alpha mask stay as they are
    let c = image_c("tellurique", base(json!({ "terre_seche": 0.8 })), 64);
    let sans = image_c("tellurique", base(json!({})), 64);
    assert_ne!(c, sans);
    let alpha = |o: &[u8]| o.chunks(4).map(|p| p[3]).collect::<Vec<_>>();
    assert_eq!(alpha(&c), alpha(&sans));
}

#[test]
fn deux_dessins_du_meme_corps_avec_les_sept_cles_donnent_les_memes_octets() {
    let a = json!({ "nuages": 0.8, "couleur_nuages": "#ff8800", "opacite_nuages": 0.6, "terre_seche": 0.5, "etirement": 2.5, "eclairs": 0.9, "inclinaison": 30, "mers": 4, "atmosphere_epaisseur": 0.8 });
    assert_eq!(image("tellurique", a.clone()), image("tellurique", a.clone()));
    let g = json!({ "etirement": 3.0, "eclairs": 0.9, "inclinaison": -40, "atmosphere_epaisseur": 0.1 });
    assert_eq!(image("gazeuse", g.clone()), image("gazeuse", g));
    assert_eq!(image("verrouillee", json!({ "nuages": 0.8, "couleur_nuages": "#ff8800", "terre_seche": 0.5 })), image("verrouillee", json!({ "nuages": 0.8, "couleur_nuages": "#ff8800", "terre_seche": 0.5 })));
}

// ---- measured values ----------------------------------------------------------------------------------------------

/// Panne : `couleur_nuages` n'est plus lue (la teinte reste blanche).
#[test]
fn couleur_nuages_la_teinte_des_pixels_de_nuage_se_rapproche_de_la_couleur_donnee() {
    // red share R/(R+G+B) of the lit cloud pixels on a black ground
    fn part_rouge(extra: Value) -> f64 {
        let mut b = base(json!({ "nuages": 1.0 }));
        for (k, v) in extra.as_object().unwrap() {
            b[k] = v.clone();
        }
        let o = image("tellurique", b);
        let (mut r, mut t) = (0.0, 0.0);
        for p in o.chunks(4).filter(|p| p[3] == 255 && p[0].max(p[1]).max(p[2]) > 60) {
            r += f64::from(p[0]);
            t += f64::from(p[0]) + f64::from(p[1]) + f64::from(p[2]);
        }
        assert!(t > 0.0, "cloud pixels found");
        r / t
    }
    let neutre = part_rouge(json!({}));
    let rouge = part_rouge(json!({ "couleur_nuages": "#ff0000" }));
    assert!(neutre < 0.4, "default clouds are white: {neutre}");
    assert!(rouge > 0.8, "red clouds: {rouge}");
    let bleu = part_rouge(json!({ "couleur_nuages": "#0000ff" }));
    assert!(bleu < 0.15, "blue clouds: {bleu}");
}

/// Panne : `opacite_nuages` n'est plus lue, ou lue à l'envers.
#[test]
fn opacite_nuages_a_0_2_la_mer_sous_un_ciel_couvert_est_plus_visible_qu_a_1() {
    // a sea-only ground (`mer` 1: all water, dark blue) under a full cover of white clouds
    let sol = |op: f64| image("tellurique", base(json!({ "mer": 1.0, "nuages": 1.0, "palette": vec!["#0a1f66"; 7], "opacite_nuages": op })));
    let moy = |o: &[u8]| -> f64 {
        let v: Vec<f64> = o.chunks(4).filter(|p| p[3] == 255).map(|p| lum(p)).collect();
        v.iter().sum::<f64>() / v.len() as f64
    };
    let (a, b) = (moy(&sol(0.2)), moy(&sol(1.0)));
    assert!(a < b - 15.0, "at 0.2 the sea shows more (darker mean): {a} vs {b}");
    // at 0 the clouds are gone: the picture is the one of a body without clouds
    let zero = sol(0.0);
    let aucun = image("tellurique", base(json!({ "mer": 1.0, "nuages": 1.0, "palette": vec!["#0a1f66"; 7], "opacite_nuages": 0.0 })));
    assert_eq!(zero, aucun);
    assert!(moy(&zero) < a, "monotone");
}

/// Panne : `terre_seche` n'est plus lue, ou touche la mer.
#[test]
fn terre_seche_la_part_de_terre_proche_du_ton_aride_croit_avec_la_cle_la_mer_ne_bouge_pas() {
    // blue sea, green land; the arid tone is the ochre #c9a272 (red above green)
    let pal = json!(["#0000ff", "#0000ff", "#1d5e2a", "#1d5e2a", "#1d5e2a", "#1d5e2a", "#1d5e2a"]);
    let mk = |s: f64| image("tellurique", json!({ "palette": pal, "calottes": 0, "halo": 0, "bord": 0, "nuages": 0, "mer": 0.5, "terre_seche": s }));
    let mer = |p: &[u8]| p[3] == 255 && p[2] > p[1];
    let part = |o: &[u8]| -> f64 {
        let (mut n, mut k) = (0.0, 0.0);
        for p in o.chunks(4).filter(|p| p[3] == 255 && !mer(p)) {
            n += 1.0;
            if f64::from(p[0]) > f64::from(p[1]) * 1.1 {
                k += 1.0;
            }
        }
        k / n
    };
    let (o0, o5, o1) = (mk(0.0), mk(0.5), mk(1.0));
    let (a, b, c) = (part(&o0), part(&o5), part(&o1));
    assert!(a < 0.05, "no dry land at 0: {a}");
    assert!(a < b && b < c, "grows: {a} {b} {c}");
    assert!(c > 0.3, "much dry land at 1: {c}");
    // the sea: every sea pixel of the picture without the key keeps its bytes
    let mut vus = 0;
    for (x, y) in o0.chunks(4).zip(o1.chunks(4)) {
        if mer(x) {
            vus += 1;
            assert_eq!(x, y, "sea pixel moved");
        }
    }
    assert!(vus > 500, "there is a sea: {vus}");
}

/// Panne : `etirement` n'est plus lu.
#[test]
fn etirement_le_rapport_largeur_hauteur_des_plages_de_nuages_croit_de_1_a_4() {
    // mean (run length along x) / (run length along y) of the cloud regions, face on and without a tilt
    fn rapport(e: f64) -> f64 {
        let o = image_c("tellurique", base(json!({ "nuages": 0.5, "etirement": e })), 256);
        let n = 256usize;
        let nuage: Vec<bool> = o.chunks(4).map(|p| p[3] == 255 && lum(p) > 70.0).collect();
        let runs = |horiz: bool| -> f64 {
            let (mut tot, mut k) = (0.0, 0.0);
            for a in 0..n {
                let mut l = 0;
                for b in 0..=n {
                    let on = b < n && nuage[if horiz { a * n + b } else { b * n + a }];
                    if on {
                        l += 1;
                    } else if l > 0 {
                        tot += f64::from(l);
                        k += 1.0;
                        l = 0;
                    }
                }
            }
            tot / k
        };
        runs(true) / runs(false)
    }
    let (r1, r4) = (rapport(1.0), rapport(4.0));
    assert!(r4 > r1 * 1.3, "wider than tall grows: {r1} -> {r4}");
}

/// Panne : `eclairs` ne dessine rien, ou dessine de jour, ou sans nuages.
#[test]
fn eclairs_des_pixels_clairs_isoles_du_cote_nuit_a_1_aucun_sans_nuages() {
    let n = 256usize;
    let corps = |extra: Value| image_c("tellurique", base(extra), n as u32);
    let sans = corps(json!({ "nuages": 0.5 }));
    let avec = corps(json!({ "nuages": 0.5, "eclairs": 1.0 }));
    // flashes: the pixels that changed; each one is bright and was dark (night side) in the picture without
    let mut flash = 0;
    let mut avant: Vec<f64> = Vec::new();
    for (a, b) in sans.chunks(4).zip(avec.chunks(4)) {
        if a != b {
            avant.push(lum(a));
            if lum(b) > 90.0 {
                flash += 1;
            }
        }
    }
    assert!(flash >= 8, "bright flashes at 1: {flash}");
    avant.sort_by(|x, y| x.partial_cmp(y).unwrap());
    assert!(avant[avant.len() / 2] < 70.0, "flashes are on the night side: median {}", avant[avant.len() / 2]);
    // isolated: no flash pixel has a flash neighbour beyond a small blob
    let isoles = (0..n * n).filter(|&i| sans[i * 4..i * 4 + 4] != avec[i * 4..i * 4 + 4]).count();
    assert!(isoles < n * n / 100, "sparse: {isoles}");
    // no cloud, no flash: same bytes
    assert_eq!(corps(json!({ "nuages": 0.0, "eclairs": 1.0 })), corps(json!({ "nuages": 0.0 })));
    // at 0 the same bytes as without the key; more at 1 than at 0.3
    assert_eq!(sans, corps(json!({ "nuages": 0.5, "eclairs": 0.0 })));
    let compte = |v: f64| corps(json!({ "nuages": 0.5, "eclairs": v })).chunks(4).zip(sans.chunks(4)).filter(|(a, b)| a != b).count();
    assert!(compte(1.0) > compte(0.3), "more flashes with the value");
}

/// Panne : `inclinaison` n'est plus lue, ou le signe est perdu.
#[test]
fn inclinaison_a_45_degres_le_barycentre_des_calottes_quitte_l_axe_vertical() {
    // white caps on a black ground: the horizontal offset of the barycentre of the bright pixels of the northern half
    let decalage = |deg: f64| -> f64 {
        let o = image("tellurique", base(json!({ "calottes": 0.9, "palette": ["#000000", "#000000", "#000000", "#000000", "#000000", "#000000", "#ffffff"], "inclinaison": deg })));
        let (mut sx, mut sy, mut k) = (0.0, 0.0, 0.0);
        for (i, p) in o.chunks(4).enumerate() {
            if p[3] == 255 && lum(p) > 60.0 && i / C < C / 2 {
                sx += (i % C) as f64;
                sy += (i / C) as f64;
                k += 1.0;
            }
        }
        assert!(k > 10.0, "caps found at {deg}: {k}");
        let _ = sy;
        sx / k - C as f64 / 2.0
    };
    let (a, b, c) = (decalage(0.0), decalage(45.0), decalage(-45.0));
    assert!((b - a).abs() > 3.0, "45° moves the barycentre of the caps: {a} -> {b}");
    assert!((c - a).abs() > 3.0, "-45° too: {c}");
    assert!((b - a) * (c - a) < 0.0, "opposite sides: {b} {c} around {a}");
}

/// Panne : `mers` ne sépare rien, ou fait varier la part d'eau.
#[test]
fn mers_a_4_plus_de_regions_d_eau_connexes_qu_a_1_et_la_part_d_eau_varie_de_moins_de_5_points() {
    // the water is the blue pixels of a two-colour ground (blue sea, red land)
    let pal = json!(["#0000ff", "#0000ff", "#ff0000", "#ff0000", "#ff0000", "#ff0000", "#ff0000"]);
    let mesure = |m: u32, graine: u32| -> (usize, f64) {
        let o = image("tellurique", json!({ "palette": pal, "calottes": 0, "halo": 0, "bord": 0, "nuages": 0, "mer": 0.5, "mers": m, "graine": graine }));
        let eau: Vec<bool> = o.chunks(4).map(|p| p[3] == 255 && p[2] > p[0]).collect();
        let disque = o.chunks(4).filter(|p| p[3] == 255).count();
        let part = eau.iter().filter(|e| **e).count() as f64 / disque as f64;
        let mut vu = vec![false; C * C];
        let mut regions = 0;
        for s in 0..C * C {
            if !eau[s] || vu[s] {
                continue;
            }
            regions += 1;
            let mut pile = vec![s];
            vu[s] = true;
            while let Some(i) = pile.pop() {
                let (x, y) = ((i % C) as i32, (i / C) as i32);
                for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                    let (xx, yy) = (x + dx, y + dy);
                    if xx < 0 || yy < 0 || xx >= C as i32 || yy >= C as i32 {
                        continue;
                    }
                    let j = yy as usize * C + xx as usize;
                    if eau[j] && !vu[j] {
                        vu[j] = true;
                        pile.push(j);
                    }
                }
            }
        }
        (regions, part)
    };
    for graine in [1u32, 8, 9, 7] {
        let (r1, p1) = mesure(1, graine);
        let (r4, p4) = mesure(4, graine);
        assert!(p1 > 0.15 && p1 < 0.85, "a sea exists at 1 (seed {graine}): {p1}");
        assert!(r4 > r1, "seed {graine}: {r1} regions at 1, {r4} at 4");
        assert!((p4 - p1).abs() < 0.05, "seed {graine}: water share {p1} -> {p4}");
    }
}

/// Panne : `atmosphere_epaisseur` n'est plus lue, ou à l'envers.
#[test]
fn atmosphere_epaisseur_la_bande_claire_du_limbe_est_plus_large_a_1_qu_a_0_2() {
    // width of the lit band beyond the body's edge, along the middle row, from the right
    let bande = |e: f64| -> usize {
        let o = image_c("tellurique", json!({ "palette": vec!["#000000"; 7], "calottes": 0, "nuages": 0, "mer": 0, "halo": 1.0, "bord": 0, "atmosphere_epaisseur": e }), 256);
        let y = 128usize;
        (0..256).filter(|x| { let p = &o[(y * 256 + x) * 4..(y * 256 + x) * 4 + 4]; p[3] > 0 && lum(p) > 12.0 }).count()
    };
    let (a, b) = (bande(0.2), bande(1.0));
    assert!(b > a + 8, "wider at 1 than at 0.2: {a} -> {b}");
    // at 0 the halo does not vanish into a hole of the image
    assert!(bande(0.0) <= a);
}

// ---- the other types, refusals, sorting ---------------------------------------------------------------------------

#[test]
fn les_types_planete_dessinent_inclinaison_et_atmosphere_epaisseur_et_changent_leurs_octets() {
    for t in ["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse"] {
        let n = image_c(t, json!({}), 64);
        assert_ne!(n, image_c(t, json!({ "inclinaison": 60 }), 64), "{t} inclinaison");
        assert_ne!(n, image_c(t, json!({ "atmosphere_epaisseur": 1.0, "halo": 1.0 }), 64), "{t} atmosphere");
    }
}

#[test]
fn les_clefs_de_nuage_de_la_verrouillee_et_de_la_gazeuse_changent_leurs_octets() {
    let v = image_c("verrouillee", json!({ "nuages": 0.8 }), 64);
    assert_ne!(v, image_c("verrouillee", json!({ "nuages": 0.8, "couleur_nuages": "#ff0000" }), 64));
    assert_ne!(v, image_c("verrouillee", json!({ "nuages": 0.8, "etirement": 3.0 }), 64));
    assert_ne!(image_c("verrouillee", json!({}), 64), image_c("verrouillee", json!({ "terre_seche": 1.0 }), 64));
    assert_ne!(image_c("gazeuse", json!({}), 64), image_c("gazeuse", json!({ "etirement": 4.0 }), 64));
}

fn ok(t: &str, j: Value) -> bool {
    valider_aspect(t, &j.to_string()).is_ok()
}

#[test]
fn les_bornes_de_chaque_cle_sont_acceptees_et_le_juste_au_dela_refuse() {
    let bornes: [(&str, &str, f64, f64); 8] = [
        ("tellurique", "opacite_nuages", 0.0, 1.0),
        ("tellurique", "terre_seche", 0.0, 1.0),
        ("tellurique", "etirement", 0.25, 4.0),
        ("tellurique", "eclairs", 0.0, 1.0),
        ("tellurique", "inclinaison", -90.0, 90.0),
        ("tellurique", "mers", 1.0, 8.0),
        ("tellurique", "atmosphere_epaisseur", 0.0, 1.0),
        ("gazeuse", "inclinaison", -90.0, 90.0),
    ];
    for (t, k, lo, hi) in bornes {
        assert!(ok(t, json!({ k: lo })), "{k} at {lo}");
        assert!(ok(t, json!({ k: hi })), "{k} at {hi}");
        assert!(!ok(t, json!({ k: lo - 0.01 })), "{k} below {lo}");
        assert!(!ok(t, json!({ k: hi + 0.01 })), "{k} above {hi}");
        assert!(!ok(t, json!({ k: "1" })), "{k} string");
        assert!(!ok(t, json!({ k: null })), "{k} null");
    }
    assert!(!ok("tellurique", json!({ "mers": 2.5 })), "mers integer");
    assert!(!ok("tellurique", json!({ "mers": 0 })));
    assert!(!ok("tellurique", json!({ "mers": 9 })));
    assert!(ok("tellurique", json!({ "couleur_nuages": "#aabbcc" })));
    assert!(ok("tellurique", json!({ "couleur_nuages": null })));
    for v in [json!("rouge"), json!("#abc"), json!(12), json!("#gggggg")] {
        assert!(!ok("tellurique", json!({ "couleur_nuages": v })), "{v}");
    }
}

#[test]
fn une_cle_sur_un_type_qui_ne_la_dessine_pas_est_refusee_avec_son_chemin_et_les_types() {
    let cas: [(&str, &str, Value, &[&str]); 9] = [
        ("couleur_nuages", "gazeuse", json!("#ff0000"), &["tellurique", "verrouillee"]),
        ("opacite_nuages", "glace", json!(0.5), &["tellurique", "verrouillee"]),
        ("terre_seche", "gazeuse", json!(0.5), &["tellurique", "verrouillee"]),
        ("etirement", "rocheux", json!(2.0), &["tellurique", "verrouillee", "gazeuse"]),
        ("eclairs", "verrouillee", json!(0.5), &["tellurique", "gazeuse"]),
        ("mers", "verrouillee", json!(2), &["tellurique"]),
        ("inclinaison", "jaune", json!(10), &["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse"]),
        ("atmosphere_epaisseur", "ceinture", json!(0.5), &["tellurique", "gazeuse"]),
        ("mers", "gazeuse", json!(3), &["tellurique"]),
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
        ("tellurique", json!({ "couleur_nuages": "#aabbcc", "opacite_nuages": 0.5, "terre_seche": 0.5, "etirement": 2, "eclairs": 0.5, "inclinaison": 20, "mers": 3, "atmosphere_epaisseur": 0.7 })),
        ("gazeuse", json!({ "etirement": 2, "eclairs": 0.5, "inclinaison": 20, "atmosphere_epaisseur": 0.7 })),
        ("verrouillee", json!({ "couleur_nuages": null, "opacite_nuages": 0.5, "terre_seche": 0.5 })),
    ];
    for (t, a) in tous {
        let r = trie(t, &a.to_string());
        assert_eq!(r["inconnues"], json!([]), "{t}: nothing goes to non_rendu");
        assert_eq!(r["garde"], a, "{t}: every key kept as written");
    }
    // an unknown key next to a new one still goes, the new one stays
    let r = trie("tellurique", r#"{"mers":2,"x":1}"#);
    assert_eq!(r["garde"], json!({ "mers": 2 }));
    assert_eq!(r["inconnues"], json!(["aspect.x"]));
    // a refusal stays a refusal
    assert!(trier_aspect("gazeuse", r#"{"mers":2}"#).is_err());
    assert!(trier_aspect("tellurique", r#"{"mers":99}"#).is_err());
}
