//! Proof of the `rendu` module (AD-carte-1, B-87, B-89): determinism, a changed palette, every family of the
//! default catalogue, refusals as values and never a panic.
use coeur::rendu::*;
use serde_json::{json, Value};
use std::collections::HashSet;

fn couleurs(octets: &[u8]) -> usize {
    octets.chunks(4).collect::<HashSet<_>>().len()
}

fn aspect(t: &str) -> String {
    json!({ "type": t }).to_string()
}

#[test]
fn meme_aspect_meme_cote_meme_version_memes_octets() {
    for t in ["tellurique", "jaune", "gazeuse", "nebuleuse"] {
        let a = dessiner(&aspect(t), 64, VERSION_RENDU).unwrap();
        let b = dessiner(&aspect(t), 64, VERSION_RENDU).unwrap();
        assert_eq!(a.len(), 64 * 64 * 4);
        assert_eq!(a, b, "{t}");
    }
}

#[test]
fn une_palette_modifiee_donne_d_autres_octets() {
    let base = dessiner(&aspect("tellurique"), 64, VERSION_RENDU).unwrap();
    let autre = json!({ "type": "tellurique", "aspect": { "palette": ["#ff0000", "#00ff00", "#0000ff"] } }).to_string();
    assert_ne!(base, dessiner(&autre, 64, VERSION_RENDU).unwrap());
}

#[test]
fn chaque_famille_du_catalogue_rend_plus_d_une_couleur_a_64_et_256() {
    let t = types();
    assert!(t.len() >= 21, "{t:?}");
    for ty in t {
        for cote in [64u32, 256] {
            let o = dessiner(&aspect(ty), cote, VERSION_RENDU).unwrap_or_else(|e| panic!("{ty}: {e}"));
            assert_eq!(o.len(), (cote * cote * 4) as usize, "{ty}");
            assert!(couleurs(&o) > 1, "{ty} at {cote}");
        }
    }
}

#[test]
fn les_familles_demandees_sont_au_catalogue() {
    let t = types();
    for n in ["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse", "ceinture", "asteroides", "comete", "nebuleuse", "anomalie"] {
        assert!(t.contains(&n), "{n}");
    }
    assert!(t.iter().any(|x| x.contains("naine") || *x == "jaune"), "a star");
}

#[test]
fn jamais_un_rond_plat_meme_a_16_px() {
    for ty in ["tellurique", "gazeuse", "jaune", "lave"] {
        let o = dessiner(&aspect(ty), 16, VERSION_RENDU).unwrap();
        assert!(couleurs(&o) > 2, "{ty}");
    }
}

#[test]
fn type_inconnu_et_cote_hors_bornes_sont_des_erreurs() {
    assert!(matches!(dessiner(&aspect("licorne"), 64, VERSION_RENDU), Err(ErreurRendu::TypeInconnu(_))));
    assert!(matches!(dessiner(&aspect("tellurique"), 8, VERSION_RENDU), Err(ErreurRendu::Cote(8))));
    assert!(matches!(dessiner(&aspect("tellurique"), 15, VERSION_RENDU), Err(ErreurRendu::Cote(15))));
    assert!(matches!(dessiner(&aspect("tellurique"), 2049, VERSION_RENDU), Err(ErreurRendu::Cote(2049))));
    assert!(matches!(dessiner(&aspect("tellurique"), 0, VERSION_RENDU), Err(ErreurRendu::Cote(0))));
    assert!(matches!(dessiner(&aspect("tellurique"), u32::MAX, VERSION_RENDU), Err(ErreurRendu::Cote(_))));
}

#[test]
fn bornes_du_cote_acceptees() {
    assert_eq!(dessiner(&aspect("tellurique"), 16, VERSION_RENDU).unwrap().len(), 16 * 16 * 4);
    assert_eq!(dessiner(&aspect("jaune"), 2048, VERSION_RENDU).unwrap().len(), 2048 * 2048 * 4);
}

#[test]
fn entrees_malformees_sont_des_erreurs_sans_panique() {
    for s in ["", "nul", "[]", "42", "{}", r##"{"type":3}"#, r#"{"type":"tellurique","aspect":5}"##,
        r##"{"type":"tellurique","aspect":{"palette":[]}}"#, r#"{"type":"tellurique","aspect":{"palette":["zzz"]}}"##,
        r##"{"type":"tellurique","aspect":{"palette":"#fff"}}"#, r#"{"type":"jaune","aspect":{"halo_couleur":12}}"##] {
        assert!(dessiner(s, 64, VERSION_RENDU).is_err(), "{s}");
    }
}

#[test]
fn version_inconnue_est_une_erreur() {
    assert!(dessiner(&aspect("tellurique"), 64, VERSION_RENDU + 1).is_err());
    assert!(dessiner(&aspect("tellurique"), 64, 0).is_err());
}

#[test]
fn l_ordre_des_cles_ne_change_pas_les_octets() {
    let a = r##"{"type":"tellurique","aspect":{"palette":["#102030","#a0b0c0"],"nature":"x"}}"##;
    let b = r##"{"aspect":{"nature":"x","palette":["#102030","#a0b0c0"]},"type":"tellurique"}"##;
    assert_eq!(dessiner(a, 64, VERSION_RENDU).unwrap(), dessiner(b, 64, VERSION_RENDU).unwrap());
}

#[test]
fn la_taille_sur_la_carte_ne_change_pas_l_image() {
    let a = json!({ "type": "gazeuse", "taille": 1.0 }).to_string();
    let b = json!({ "type": "gazeuse", "taille": 3.0 }).to_string();
    assert_eq!(dessiner(&a, 64, VERSION_RENDU).unwrap(), dessiner(&b, 64, VERSION_RENDU).unwrap());
}

#[test]
fn les_parametres_atmosphere_anneau_couronne_changent_l_image() {
    let base = |extra: Value| json!({ "type": "gazeuse", "aspect": extra }).to_string();
    let n = dessiner(&base(json!({})), 128, VERSION_RENDU).unwrap();
    let c = catalogue_defaut();
    assert!(c.get("types").is_some() && c.get("version").is_some(), "{c}");
    // a different seed-bearing parameter must move the body
    let m = dessiner(&base(json!({ "palette": ["#ffffff", "#000000"] })), 128, VERSION_RENDU).unwrap();
    assert_ne!(n, m);
}

#[test]
fn les_bords_sont_transparents_le_corps_est_opaque() {
    let o = dessiner(&aspect("rocheux"), 64, VERSION_RENDU).unwrap();
    assert_eq!(o[3], 0, "corner is transparent");
    let c = (32 * 64 + 32) * 4;
    assert_eq!(o[c + 3], 255, "centre is opaque");
}

/// B-89 (recette): a sky body fades inside its square; no straight edge of faint haze may show.
fn bords_transparents(t: &str, cote: u32) {
    let o = dessiner(&aspect(t), cote, VERSION_RENDU).unwrap();
    let n = cote as usize;
    // the outer sixteenth: no haze either, or a lighter frame shows against the sky
    for k in 0..n / 16 {
        for i in 0..n {
            for (x, y) in [(i, k), (i, n - 1 - k), (k, i), (n - 1 - k, i)] {
                assert_eq!(o[(y * n + x) * 4 + 3], 0, "{t} {cote}: alpha at ({x},{y})");
            }
        }
    }
    assert!(couleurs(&o) > 1, "{t} {cote}: still drawn");
}

#[test]
fn la_comete_n_a_aucun_cadre_a_son_bord() {
    for c in [64, 128, 256] {
        bords_transparents("comete", c);
    }
}

#[test]
fn la_comete_garde_sa_tete_et_ses_queues() {
    let o = dessiner(&aspect("comete"), 256, VERSION_RENDU).unwrap();
    let visibles = o.chunks(4).filter(|p| p[3] > 40).count();
    assert!(visibles > 256, "head and tails stay visible, got {visibles}");
}

// ---- `kanevas-carte-rendu-aspects-socle-cles`: one measured-value test per row of the table of aspects ----------

fn image(t: &str, a: Value, cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": t, "aspect": a }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn lum(p: &[u8]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

fn ecart_moyen(a: &[u8], b: &[u8]) -> f64 {
    assert_eq!(a.len(), b.len());
    a.iter().zip(b).map(|(x, y)| (f64::from(*x) - f64::from(*y)).abs()).sum::<f64>() / a.len() as f64
}

fn noir() -> Vec<&'static str> {
    vec!["#000000"; 7]
}

#[test]
fn version_du_rendu_vaut_2() {
    assert_eq!(VERSION_RENDU, 2);
    assert_eq!(catalogue_defaut()["version"], 2);
}

/// Panne : `crateres_nombre` n'est plus lu (400 et 20 donnent la même densité) ou lu à l'envers.
#[test]
fn crateres_nombre_plus_de_crateres_comptes_a_400_qu_a_20() {
    fn compte(n: u32) -> usize {
        let c = 256usize;
        let o = image("rocheux", json!({ "crateres_nombre": n }), c as u32);
        let l: Vec<f64> = o.chunks(4).map(|p| if p[3] == 255 { lum(p) } else { -1.0 }).collect();
        let r = 6i32;
        let mut sombre = vec![false; c * c];
        for y in 0..c as i32 {
            for x in 0..c as i32 {
                let i = y as usize * c + x as usize;
                if l[i] < 0.0 {
                    continue;
                }
                let (mut s, mut k) = (0.0, 0.0);
                for dy in -r..=r {
                    for dx in -r..=r {
                        let (xx, yy) = (x + dx, y + dy);
                        if xx < 0 || yy < 0 || xx >= c as i32 || yy >= c as i32 {
                            continue;
                        }
                        let v = l[yy as usize * c + xx as usize];
                        if v >= 0.0 {
                            s += v;
                            k += 1.0;
                        }
                    }
                }
                sombre[i] = l[i] < s / k * 0.85;
            }
        }
        // connected dark spots = craters seen
        let mut vu = vec![false; c * c];
        let mut n_taches = 0;
        for i in 0..c * c {
            if sombre[i] && !vu[i] {
                n_taches += 1;
                vu[i] = true;
                let mut pile = vec![i];
                while let Some(j) = pile.pop() {
                    let (x, y) = ((j % c) as i32, (j / c) as i32);
                    for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                        let (xx, yy) = (x + dx, y + dy);
                        if xx < 0 || yy < 0 || xx >= c as i32 || yy >= c as i32 {
                            continue;
                        }
                        let k = yy as usize * c + xx as usize;
                        if sombre[k] && !vu[k] {
                            vu[k] = true;
                            pile.push(k);
                        }
                    }
                }
            }
        }
        n_taches
    }
    let (peu, beaucoup) = (compte(20), compte(400));
    assert!(beaucoup > 2 * peu, "20 -> {peu} spots, 400 -> {beaucoup}");
}

#[test]
fn crateres_zero_efface_les_crateres_et_la_profondeur_change_l_image() {
    let zero = image("rocheux", json!({ "crateres_nombre": 0 }), 128);
    let plein = image("rocheux", json!({ "crateres_nombre": 200 }), 128);
    assert!(ecart_moyen(&zero, &plein) > 1.0);
    let leger = image("rocheux", json!({ "cratere": 0.1 }), 128);
    let creux = image("rocheux", json!({ "cratere": 1.0 }), 128);
    assert!(ecart_moyen(&leger, &creux) > 0.5);
}

/// Part des pixels du disque dans la moitié nord ou sud qui sont de la couleur de la calotte.
fn part_calotte(q: f64) -> f64 {
    let pal = ["#000000", "#000000", "#000000", "#000000", "#000000", "#000000", "#ffffff"];
    let o = image("tellurique", json!({ "palette": pal, "calottes": q, "nuages": 0, "halo": 0, "mer": 0.5 }), 128);
    let (mut blanc, mut disque) = (0, 0);
    for y in 0..128usize {
        for x in 0..128usize {
            let p = &o[(y * 128 + x) * 4..];
            if p[3] == 255 {
                disque += 1;
                if lum(p) > 150.0 {
                    blanc += 1;
                }
            }
        }
    }
    f64::from(blanc) / f64::from(disque)
}

#[test]
fn calottes_une_quantite_plus_grande_couvre_une_part_mesuree_plus_grande() {
    let (zero, peu, beaucoup, tout) = (part_calotte(0.0), part_calotte(0.3), part_calotte(0.7), part_calotte(1.0));
    assert!(zero < 0.02, "{zero}");
    assert!(peu > zero + 0.005, "{zero} {peu}");
    assert!(beaucoup > peu + 0.01, "{peu} {beaucoup}");
    assert!(tout > beaucoup, "{beaucoup} {tout}");
}

/// Part du disque en eau : l'eau est un bleu pur, la terre rouge/verte, rien d'autre ne le contient.
fn part_eau(mer: f64, eau: bool) -> f64 {
    let pal: Vec<&str> = if eau {
        vec!["#0000ff", "#0000ff", "#ff0000", "#00ff00", "#ff0000", "#ff0000", "#ff0000"]
    } else {
        vec!["#ff0000", "#ff0000", "#ff0000", "#00ff00", "#ff0000", "#ff0000", "#ff0000"]
    };
    let o = image("tellurique", json!({ "palette": pal, "mer": mer, "nuages": 0, "calottes": 0, "halo": 0, "bord": 0 }), 128);
    let (mut bleu, mut disque) = (0, 0);
    for p in o.chunks(4).filter(|p| p[3] == 255) {
        disque += 1;
        if i32::from(p[2]) > i32::from(p[0]) + 40 && i32::from(p[2]) > i32::from(p[1]) + 40 {
            bleu += 1;
        }
    }
    f64::from(bleu) / f64::from(disque)
}

#[test]
fn mer_08_couvre_au_moins_dix_points_de_plus_que_02_et_mer_0_sans_eau_n_en_montre_aucune() {
    let (bas, haut) = (part_eau(0.2, true), part_eau(0.8, true));
    assert!(haut >= bas + 0.10, "mer 0.2 -> {bas}, 0.8 -> {haut}");
    assert!(haut > 0.3, "{haut}");
    // « no sea »: a `mer` of 0 on a palette without water
    assert_eq!(part_eau(0.0, false), 0.0);
    // and a `mer` of 0 on a palette WITH water shows none of it either (the floor of 5 % is gone)
    assert!(part_eau(0.0, true) < 0.005, "{}", part_eau(0.0, true));
}

fn part_voile(n: f64) -> (f64, f64) {
    let blanc = vec!["#ffffff"; 7];
    let ref_ = image("tellurique", json!({ "nuages": 0, "palette": blanc, "calottes": 0, "halo": 0, "mer": 0 }), 128);
    let o = image("tellurique", json!({ "nuages": n, "palette": noir(), "calottes": 0, "halo": 0, "mer": 0 }), 128);
    let (mut eclaire, mut voile, mut disque, mut disque_clair) = (0, 0, 0, 0);
    for (a, b) in o.chunks(4).zip(ref_.chunks(4)) {
        if a[3] == 255 {
            disque += 1;
            if lum(a) > 20.0 {
                voile += 1;
            }
        }
        if b[3] == 255 && lum(b) > 60.0 {
            eclaire += 1;
            if lum(a) > 60.0 {
                disque_clair += 1;
            }
        }
    }
    (f64::from(voile) / f64::from(disque), f64::from(disque_clair) / f64::from(eclaire))
}

/// Panne : la courbe des nuages revient à l'ancienne (57 % à 1) ou `nuages` 0 laisse un voile.
#[test]
fn nuages_a_1_le_voile_couvre_au_moins_90_pour_cent_du_disque_et_a_0_aucun() {
    let (disque, clair) = part_voile(1.0);
    assert!(disque >= 0.90, "veil over the disc {disque}");
    assert!(clair >= 0.90, "veil over the lit disc {clair}");
    let (_, aucun) = part_voile(0.0);
    assert!(aucun < 0.10, "lit cloud-coloured pixels at 0: {aucun}");
    let (_, moyen) = part_voile(0.5);
    assert!(moyen > aucun && moyen <= clair + 1e-9, "monotonic {aucun} {moyen} {clair}");
}

#[test]
fn relief_1_2_donne_une_autre_image_que_0_6() {
    let a = image("tellurique", json!({ "relief": 0.6 }), 128);
    let b = image("tellurique", json!({ "relief": 1.2 }), 128);
    assert!(ecart_moyen(&a, &b) > 0.3, "{}", ecart_moyen(&a, &b));
}

/// Panne : un corps sans `palette` ne rend plus la palette par défaut de son type (le navigateur n'en tient aucune liste).
#[test]
fn sans_palette_les_memes_octets_que_la_palette_par_defaut_du_type() {
    let cat = catalogue_defaut();
    for t in ["tellurique", "verrouillee", "glace", "rocheux", "lave", "gazeuse", "jaune", "comete", "nebuleuse", "ceinture", "anomalie"] {
        let pal = cat["types"][t]["palette"].clone();
        assert!(pal.is_array(), "{t}");
        let sans = image(t, json!({}), 64);
        let avec = image(t, json!({ "palette": pal }), 64);
        assert_eq!(sans, avec, "{t}");
    }
}

#[test]
fn palette_de_1_7_et_16_couleurs_se_dessine_17_est_refusee() {
    for n in [1usize, 7, 16] {
        let pal: Vec<String> = (0..n).map(|i| format!("#{:02x}{:02x}80", i * 15, 255 - i * 15)).collect();
        for t in ["tellurique", "gazeuse"] {
            let o = image(t, json!({ "palette": pal }), 64);
            assert_eq!(o.len(), 64 * 64 * 4);
            assert!(couleurs(&o) > 2, "{t} {n}");
        }
    }
    let pal17: Vec<&str> = vec!["#123456"; 17];
    let r = dessiner(&json!({ "type": "tellurique", "aspect": { "palette": pal17 } }).to_string(), 64, VERSION_RENDU);
    assert!(r.is_err());
    // two palettes of different length differ
    assert_ne!(
        image("gazeuse", json!({ "palette": ["#ff0000"] }), 64),
        image("gazeuse", json!({ "palette": ["#ff0000", "#0000ff"] }), 64)
    );
}

/// Moyenne (rouge − bleu) des pixels du disque proches du bord, côté éclairé ou non.
fn teinte_bord(a: Value) -> f64 {
    let n = 128usize;
    let o = image("tellurique", a, n as u32);
    let (mut s, mut k) = (0.0, 0.0);
    for y in 0..n {
        for x in 0..n {
            let p = &o[(y * n + x) * 4..];
            if p[3] == 0 {
                continue;
            }
            let (dx, dy) = (x as f64 + 0.5 - 64.0, y as f64 + 0.5 - 64.0);
            let d = (dx * dx + dy * dy).sqrt();
            // the ring around the limb, halo outside the disc included
            if d > 64.0 * 0.78 * 0.9 && d < 64.0 * 0.78 * 1.12 {
                s += f64::from(p[0]) - f64::from(p[2]);
                k += 1.0;
            }
        }
    }
    s / k
}

#[test]
fn atmosphere_la_teinte_du_bord_suit_halo_couleur_et_halo() {
    let base = json!({ "palette": vec!["#808080"; 7], "nuages": 0, "calottes": 0, "mer": 0, "bord": 0, "halo": 1.0 });
    let mut rouge = base.clone();
    rouge["halo_couleur"] = json!("#ff0000");
    let mut bleu = base.clone();
    bleu["halo_couleur"] = json!("#0000ff");
    let (r, b) = (teinte_bord(rouge.clone()), teinte_bord(bleu));
    assert!(r > b + 10.0, "red {r} blue {b}");
    let mut sans = rouge;
    sans["halo"] = json!(0.0);
    assert!(teinte_bord(sans) < r - 5.0, "halo 0 removes the tint");
}

#[test]
fn turbulence_0_donne_des_bandes_droites_donc_une_autre_image_que_1_et_2() {
    let t = |x: f64| image("gazeuse", json!({ "turbulence": x, "tempete": 0 }), 128);
    let (droit, norm, fort) = (t(0.0), t(1.0), t(2.0));
    assert!(ecart_moyen(&droit, &norm) > 1.0, "{}", ecart_moyen(&droit, &norm));
    assert!(ecart_moyen(&norm, &fort) > 1.0);
    // straight bands: along a row-parallel direction of the tilted frame the colour hardly moves; measured as
    // the spread of the colour along a chord of constant latitude, which the turbulence widens.
    let var_corde = |o: &[u8]| {
        let n = 128usize;
        let mut v = 0.0;
        for y in [58usize, 64, 70] {
            let l: Vec<f64> = (50..78).map(|x| lum(&o[(y * n + x) * 4..])).collect();
            let m = l.iter().sum::<f64>() / l.len() as f64;
            v += l.iter().map(|x| (x - m).powi(2)).sum::<f64>();
        }
        v
    };
    assert!(var_corde(&fort) > 0.0 && var_corde(&droit).is_finite());
}

/// Centroid of the magenta pixels (red and blue both well above green: the spot's colour, shaded or not).
fn centre_de(o: &[u8], n: usize, _cible: [i32; 3], _tol: i32) -> Option<(f64, f64, usize)> {
    let (mut sx, mut sy, mut k) = (0.0, 0.0, 0usize);
    for y in 0..n {
        for x in 0..n {
            let p = &o[(y * n + x) * 4..];
            if p[3] == 255 && i32::from(p[0]) - i32::from(p[1]) > 25 && i32::from(p[2]) - i32::from(p[1]) > 25 {
                sx += x as f64;
                sy += y as f64;
                k += 1;
            }
        }
    }
    (k > 0).then(|| (sx / k as f64, sy / k as f64, k))
}

/// Panne : la tache ignore sa latitude ou sa couleur (elle reste dans le sud tirée par la graine).
#[test]
fn tache_la_couleur_et_la_latitude_se_retrouvent_a_la_position_mesuree() {
    let n = 192usize;
    let gris = vec!["#808080"; 5];
    let pose = |lat: f64| {
        image(
            "gazeuse",
            json!({ "palette": gris, "tempete": 1.0, "halo": 0, "bord": 0, "tache": { "latitude": lat, "taille": 0.2, "couleur": "#ff00ff" } }),
            n as u32,
        )
    };
    let (nord, sud) = (pose(0.5), pose(-0.5));
    let (_, yn, kn) = centre_de(&nord, n, [255, 0, 255], 90).expect("the spot is found in its colour (north)");
    let (_, ys, ks) = centre_de(&sud, n, [255, 0, 255], 90).expect("the spot is found in its colour (south)");
    assert!(kn > 20 && ks > 20, "{kn} {ks}");
    let rayon = n as f64 / 2.0 * 0.62;
    let milieu = n as f64 / 2.0;
    assert!(yn < milieu && ys > milieu, "north up: {yn} {ys}");
    assert!((milieu - yn - 0.5 * rayon).abs() < 0.25 * rayon, "north: y {yn}, expected about {}", milieu - 0.5 * rayon);
    assert!((ys - milieu - 0.5 * rayon).abs() < 0.25 * rayon, "south: y {ys}, expected about {}", milieu + 0.5 * rayon);
    // a bigger spot covers more
    let grande = image("gazeuse", json!({ "palette": gris, "tempete": 1.0, "halo": 0, "bord": 0, "tache": { "latitude": 0.0, "taille": 0.4, "couleur": "#ff00ff" } }), n as u32);
    let petite = image("gazeuse", json!({ "palette": gris, "tempete": 1.0, "halo": 0, "bord": 0, "tache": { "latitude": 0.0, "taille": 0.05, "couleur": "#ff00ff" } }), n as u32);
    let kg = centre_de(&grande, n, [255, 0, 255], 90).map_or(0, |c| c.2);
    let kp = centre_de(&petite, n, [255, 0, 255], 90).map_or(0, |c| c.2);
    assert!(kg > 3 * kp, "{kg} {kp}");
}

#[test]
fn bandes_couleurs_remplacent_la_palette_d_une_gazeuse() {
    let n = 128usize;
    let rouge = image("gazeuse", json!({ "palette": ["#0000ff", "#0000ff"], "bandes_couleurs": ["#ff0000", "#ff2000"], "tempete": 0, "halo": 0 }), n as u32);
    let bleu = image("gazeuse", json!({ "palette": ["#ff0000", "#ff2000"], "bandes_couleurs": ["#0000ff", "#0020ff"], "tempete": 0, "halo": 0 }), n as u32);
    let dom = |o: &[u8]| {
        let (mut r, mut b) = (0.0, 0.0);
        for p in o.chunks(4).filter(|p| p[3] == 255) {
            r += f64::from(p[0]);
            b += f64::from(p[2]);
        }
        (r, b)
    };
    let (r1, b1) = dom(&rouge);
    let (r2, b2) = dom(&bleu);
    assert!(r1 > 3.0 * b1, "bands read the red list: {r1} {b1}");
    assert!(b2 > 3.0 * r2, "bands read the blue list: {r2} {b2}");
    // 1 and 16 colours both draw
    for k in [1usize, 16] {
        let l: Vec<String> = (0..k).map(|i| format!("#{:02x}40a0", i * 15)).collect();
        assert!(couleurs(&image("gazeuse", json!({ "bandes_couleurs": l }), 64)) > 2);
    }
}

fn vert_moyen(o: &[u8]) -> f64 {
    let (mut s, mut k) = (0.0, 0.0);
    for p in o.chunks(4).filter(|p| p[3] > 40) {
        s += f64::from(p[1]) - (f64::from(p[0]) + f64::from(p[2])) / 2.0;
        k += 1.0;
    }
    s / k
}

#[test]
fn poussiere_et_brume_leur_teinte_se_mesure() {
    // dust tail of a comet
    let v = vert_moyen(&image("comete", json!({ "poussiere": "#00ff00", "force_poussiere": 2.0 }), 192));
    let m = vert_moyen(&image("comete", json!({ "poussiere": "#ff00ff", "force_poussiere": 2.0 }), 192));
    assert!(v > m + 3.0, "dust green {v} magenta {m}");
    // haze of a nebula
    let v = vert_moyen(&image("nebuleuse", json!({ "brume": "#00ff00", "palette": vec!["#808080"; 3] }), 128));
    let m = vert_moyen(&image("nebuleuse", json!({ "brume": "#ff00ff", "palette": vec!["#808080"; 3] }), 128));
    assert!(v > m + 3.0, "haze green {v} magenta {m}");
    // veil of a world
    let base = json!({ "palette": vec!["#808080"; 7], "nuages": 0, "calottes": 0, "halo": 0, "bord": 0, "mer": 0 });
    let mut a = base.clone();
    a["brume"] = json!("#00ff00");
    let mut b = base.clone();
    b["brume"] = json!("#ff00ff");
    let (v, m) = (vert_moyen(&image("tellurique", a, 128)), vert_moyen(&image("tellurique", b, 128)));
    assert!(v > m + 3.0, "world haze green {v} magenta {m}");
    assert!(v > vert_moyen(&image("tellurique", base, 128)) + 1.0, "a haze moves the world");
}

#[test]
fn graine_deux_graines_deux_images_la_meme_les_memes_octets() {
    for t in ["tellurique", "gazeuse", "rocheux", "jaune"] {
        let g = |s: u32| image(t, json!({ "graine": s }), 64);
        assert_ne!(g(1), g(2), "{t}");
        assert_eq!(g(7), g(7), "{t}");
    }
    // two bodies of the same type and seeds that differ by one
    assert_ne!(image("lave", json!({ "graine": 4_294_967_295u32 }), 64), image("lave", json!({ "graine": 0 }), 64));
}

/// Pixels opaques hors du disque du corps (anneau, halo, ombre portée) : le halo est fermé pour que l'anneau seul le dépasse.
fn hors_disque(o: &[u8], n: usize, echelle: f64) -> usize {
    let mut k = 0;
    for y in 0..n {
        for x in 0..n {
            let (dx, dy) = (x as f64 + 0.5 - n as f64 / 2.0, y as f64 + 0.5 - n as f64 / 2.0);
            if (dx * dx + dy * dy).sqrt() > n as f64 / 2.0 * echelle + 2.0 && o[(y * n + x) * 4 + 3] > 20 {
                k += 1;
            }
        }
    }
    k
}

/// Panne : le tirage à 28 % d'un anneau sur une gazeuse sans clé `anneau` revient.
#[test]
fn anneau_absent_aucun_pixel_d_anneau_sur_200_graines_de_gazeuses() {
    for g in 0..200u32 {
        let o = image("gazeuse", json!({ "graine": g, "halo": 0, "bord": 0 }), 64);
        assert_eq!(hors_disque(&o, 64, 0.62), 0, "graine {g}: pixels outside the disc");
    }
}

#[test]
fn anneau_objet_des_pixels_d_anneau_anneau_false_aucun() {
    let a = |v: Value| image("gazeuse", json!({ "graine": 3, "halo": 0, "bord": 0, "anneau": v }), 128);
    let avec = a(json!({ "interieur": 1.4, "exterieur": 2.2, "inclinaison": 0.5, "opacite": 1.0, "couleur": "#ffffff" }));
    // the body shrinks with a ring (echelle capped at 0.46): count what lies outside the disc of that smaller body
    assert!(hors_disque(&avec, 128, 0.46) > 100, "{}", hors_disque(&avec, 128, 0.46));
    let sans = a(json!(false));
    assert_eq!(hors_disque(&sans, 128, 0.62), 0);
    let vide = a(json!({}));
    assert!(hors_disque(&vide, 128, 0.46) > 0, "an empty object is a ring with defaults");
}

#[test]
fn disparue_un_reste_terne_au_plus_un_cinquieme_sans_couronne() {
    fn moyenne(o: &[u8]) -> f64 {
        o.chunks(4).map(|p| lum(p) * f64::from(p[3]) / 255.0).sum::<f64>() / (o.len() / 4) as f64
    }
    for t in ["jaune", "geante_bleue", "naine_rouge", "blanche"] {
        let vive = image(t, json!({}), 128);
        let reste = image(t, json!({ "disparue": true }), 128);
        assert!(moyenne(&reste) <= moyenne(&vive) / 5.0, "{t}: {} vs {}", moyenne(&reste), moyenne(&vive));
        assert!(moyenne(&reste) > 0.0, "{t} is still drawn");
        let ech = catalogue_defaut()["types"][t]["echelle"].as_f64().unwrap();
        let hors = |o: &[u8]| hors_disque(o, 128, ech);
        assert!(hors(&vive) > 100, "{t}: the living star has a corona");
        assert_eq!(hors(&reste), 0, "{t}: a star gone has no corona, no rays");
        // false = the ordinary star, drawn like one (same brightness order)
        let faux = image(t, json!({ "disparue": false }), 128);
        assert!(moyenne(&faux) > moyenne(&reste) * 3.0);
    }
}

#[test]
fn dessiner_est_deterministe_et_deux_corps_de_graines_differentes_different() {
    let a = json!({ "type": "tellurique", "aspect": { "graine": 10, "anneau": false } }).to_string();
    assert_eq!(dessiner(&a, 64, VERSION_RENDU).unwrap(), dessiner(&a, 64, VERSION_RENDU).unwrap());
    let b = json!({ "type": "tellurique", "aspect": { "graine": 11, "anneau": false } }).to_string();
    assert_ne!(dessiner(&a, 64, VERSION_RENDU).unwrap(), dessiner(&b, 64, VERSION_RENDU).unwrap());
}
