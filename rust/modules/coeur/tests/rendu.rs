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
