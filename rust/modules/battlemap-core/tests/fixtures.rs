//! Plays the shared fixtures (AD-165). The same files are played through the Wasm module by
//! `src/wasm/battlemap-core.test.ts`. `ECRIRE_ATTENDUS=1 cargo test` rewrites the two expected files.
use battlemap_core::*;
use serde_json::{json, Value};
use std::fs;

/// JSON has one number type; serde_json tells `1` from `1.0`, so every number is read as a float.
fn norm(v: Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
        autre => autre,
    }
}

fn lire(nom: &str) -> Value {
    let chemin = format!("{}/tests/fixtures/{nom}.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&fs::read_to_string(chemin).unwrap()).unwrap()
}

fn appliquer(doc: &Value, lot: &Value) -> Value {
    serde_json::from_str(&appliquer_lot_json(&doc.to_string(), &lot.to_string())).unwrap()
}

fn document_de(nom: &str) -> Value {
    match nom {
        "carte_vide" => serde_json::from_str(&carte_vide_json(20, 20).unwrap()).unwrap(),
        autre => lire(autre),
    }
}

#[test]
fn ecrire_les_attendus() {
    if std::env::var("ECRIRE_ATTENDUS").is_err() {
        return;
    }
    let doc = lire("document");
    let r = appliquer(&doc, &lire("lot"));
    assert_eq!(r["ok"], true, "{r}");
    let ecrire = |nom: &str, v: &Value| {
        let chemin = format!("{}/tests/fixtures/{nom}.json", env!("CARGO_MANIFEST_DIR"));
        fs::write(chemin, serde_json::to_string_pretty(v).unwrap() + "\n").unwrap();
    };
    ecrire("resultat-lot", &r);
    let filtre = filtrer_pour_joueur_json(&doc.to_string(), &lire("contexte").to_string()).unwrap();
    ecrire("document-filtre", &serde_json::from_str::<Value>(&filtre).unwrap());
}

#[test]
fn le_document_de_depart_est_valide() {
    let r: Value = serde_json::from_str(&valider_document_json(&lire("document").to_string())).unwrap();
    assert_eq!(r, json!({"ok": true}));
}

#[test]
fn chaque_commande_puis_son_inverse_rend_le_document_d_origine() {
    let doc = lire("document");
    for cas in lire("commandes").as_array().unwrap() {
        let r = appliquer(&doc, &cas["lot"]);
        assert_eq!(r["ok"], true, "{}: {r}", cas["nom"]);
        assert_ne!(norm(r["document"].clone()), norm(doc.clone()), "{}: the batch changed nothing", cas["nom"]);
        let retour = appliquer(&r["document"], &r["inverses"]);
        assert_eq!(retour["ok"], true, "{}: {retour}", cas["nom"]);
        assert_eq!(norm(retour["document"].clone()), norm(doc.clone()), "{}: undo is not exact", cas["nom"]);
        // …and the inverse of the inverse plays the batch again.
        let refait = appliquer(&retour["document"], &retour["inverses"]);
        assert_eq!(norm(refait["document"].clone()), norm(r["document"].clone()), "{}: redo is not exact", cas["nom"]);
    }
}

#[test]
fn le_lot_complet_donne_le_document_attendu_et_s_annule() {
    let doc = lire("document");
    let r = appliquer(&doc, &lire("lot"));
    assert_eq!(norm(r.clone()), norm(lire("resultat-lot")));
    let retour = appliquer(&r["document"], &r["inverses"]);
    assert_eq!(norm(retour["document"].clone()), norm(doc));
}

#[test]
fn les_refus_portent_leur_code_et_laissent_le_document() {
    for cas in lire("limites").as_array().unwrap() {
        let doc = document_de(cas["document"].as_str().unwrap());
        let r = appliquer(&doc, &cas["lot"]);
        assert_eq!(r["ok"], false, "{}: {r}", cas["nom"]);
        assert_eq!(r["code"], cas["code"], "{}: {r}", cas["nom"]);
        for cle in ["champ", "index"] {
            if cas.get(cle).is_some() {
                assert_eq!(r[cle], cas[cle], "{}: {cle}", cas["nom"]);
            }
        }
    }
}

#[test]
fn carte_vide_a_trois_calques_dans_l_ordre_sans_contenu() {
    let d: Value = serde_json::from_str(&carte_vide_json(30, 20).unwrap()).unwrap();
    let noms: Vec<_> = d["calques"].as_array().unwrap().iter().map(|c| c["nom"].as_str().unwrap()).collect();
    assert_eq!(noms, ["Sol", "Murs", "Objets"]);
    let types: Vec<_> = d["calques"].as_array().unwrap().iter().map(|c| c["type"].as_str().unwrap()).collect();
    assert_eq!(types, ["sol", "mur", "objet"]);
    assert!(d["calques"].as_array().unwrap().iter().all(|c| c["mj_seul"] == false));
    for k in ["sols", "murs", "elements"] {
        assert_eq!(d[k], json!([]));
    }
    assert_eq!((d["largeur"].clone(), d["hauteur"].clone()), (json!(30), json!(20)));
    assert_eq!(carte_vide_json(201, 5).unwrap_err().code, "limite_depassee");
    assert_eq!(carte_vide_json(5, 0).unwrap_err().code, "limite_depassee");
}

#[test]
fn le_document_d_un_joueur_est_celui_attendu() {
    let f = filtrer_pour_joueur_json(&lire("document").to_string(), &lire("contexte").to_string()).unwrap();
    assert_eq!(norm(serde_json::from_str::<Value>(&f).unwrap()), norm(lire("document-filtre")));
}

#[test]
fn le_filtre_joueur_ne_laisse_rien_du_secret() {
    let f = filtrer_pour_joueur_json(&lire("document").to_string(), &lire("contexte").to_string()).unwrap();
    for secret in ["secret-sol", "secret-objets", "piege", "coffre-secret", "vieille-lampe", "fiche-mj", "Réservé au MJ", "Pièges"] {
        assert!(!f.contains(secret), "{secret} leaks");
    }
    assert!(f.contains("fiche-publique"));
    // an empty context hides no asset and no layer but still drops every sheet link
    let vide = filtrer_pour_joueur_json(&lire("document").to_string(), "{}").unwrap();
    assert!(!vide.contains("fiche-publique") && vide.contains("coffre-secret"));
}

#[test]
fn lier_fiche_sans_fiche_delie_et_son_inverse_relie() {
    let doc = lire("document");
    let r = appliquer(&doc, &json!([{"type": "lier_fiche", "id": "e1"}]));
    let e1 = r["document"]["elements"][0].as_object().unwrap();
    assert!(!e1.contains_key("fiche_id"));
    assert_eq!(r["inverses"], json!([{"type": "lier_fiche", "id": "e1", "fiche_id": "fiche-publique"}]));
}

#[test]
fn la_limite_de_5000_elements_refuse_le_lot_entier() {
    let doc = document_de("carte_vide");
    let lot: Vec<Value> = (0..5001)
        .map(|i| json!({"type": "poser_element", "id": format!("n{i}"), "calque": "objets", "asset_id": "x", "x": 1, "y": 1}))
        .collect();
    let r = appliquer(&doc, &Value::Array(lot.clone()));
    assert_eq!((r["ok"].clone(), r["code"].clone(), r["index"].clone()), (json!(false), json!("carte_pleine"), json!(5000)));
    let r = appliquer(&doc, &Value::Array(lot[..5000].to_vec()));
    assert_eq!(r["ok"], true);
    assert_eq!(r["document"]["elements"].as_array().unwrap().len(), 5000);
}

#[test]
fn le_plafond_de_2_mo_refuse_le_lot() {
    let doc = document_de("carte_vide");
    let nom = "é".repeat(80);
    let lot: Vec<Value> = (0..200)
        .map(|i| json!({"type": "poser_element", "id": format!("{i:0>90}"), "calque": "objets", "asset_id": nom.repeat(10), "x": 1, "y": 1}))
        .collect();
    let mut doc = doc;
    let mut refus = None;
    for _ in 0..40 {
        let r = appliquer(&doc, &Value::Array(lot.clone().into_iter().map(|mut c| {
            c["id"] = json!(format!("{}-{}", c["id"].as_str().unwrap(), doc["elements"].as_array().unwrap().len()));
            c
        }).collect()));
        if r["ok"] == false {
            refus = Some(r);
            break;
        }
        doc = r["document"].clone();
    }
    assert_eq!(refus.expect("the 2 MB ceiling is reached")["code"], "carte_pleine");
}

#[test]
fn compter_usages_compte_sols_murs_et_elements() {
    let d = lire("document").to_string();
    assert_eq!(compter_usages_doc(&d, "dalle").unwrap(), 8);
    assert_eq!(compter_usages_doc(&d, "mur-pierre").unwrap(), 3);
    assert_eq!(compter_usages_doc(&d, "table").unwrap(), 1);
    assert_eq!(compter_usages_doc(&d, "inconnu").unwrap(), 0);
}

fn octets(nom: &str) -> Vec<u8> {
    use std::io::Read;
    let b64 = lire("png")[nom].as_str().unwrap().to_string();
    // minimal base64 decoder: the fixtures are plain standard base64
    let table = |c: u8| match c {
        b'A'..=b'Z' => c - b'A',
        b'a'..=b'z' => c - b'a' + 26,
        b'0'..=b'9' => c - b'0' + 52,
        b'+' => 62,
        _ => 63,
    };
    let (mut sortie, mut acc, mut bits) = (vec![], 0u32, 0);
    for c in b64.bytes().filter(|c| *c != b'=') {
        acc = (acc << 6) | u32::from(table(c));
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            sortie.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    let _ = std::io::empty().read(&mut []);
    sortie
}

#[test]
fn alpha_png_distingue_avec_et_sans_alpha() {
    assert!(!alpha_png(&octets("sans_alpha")));
    assert!(alpha_png(&octets("avec_alpha")));
    assert!(!alpha_png(&octets("rgba_opaque")));
    assert!(!alpha_png(b"pas un png"));
}

#[test]
fn detourer_fond_uni_rend_transparent_le_fond_relie_au_bord_et_garde_le_reste() {
    let sortie = png::detourer_fond_uni(&octets("fond_uni")).unwrap();
    assert!(alpha_png(&sortie));
    let mut d = ::png::Decoder::new(std::io::Cursor::new(&sortie));
    d.set_transformations(::png::Transformations::EXPAND);
    let mut l = d.read_info().unwrap();
    let mut t = vec![0; l.output_buffer_size()];
    assert_eq!(l.info().color_type, ::png::ColorType::Rgba);
    let i = l.next_frame(&mut t).unwrap();
    let alpha = |x: usize, y: usize| t[(y * i.width as usize + x) * 4 + 3];
    let png_fx = lire("png");
    for p in png_fx["transparents"].as_array().unwrap() {
        assert_eq!(alpha(p[0].as_u64().unwrap() as usize, p[1].as_u64().unwrap() as usize), 0);
    }
    for p in png_fx["conserves"].as_array().unwrap() {
        assert_eq!(alpha(p[0].as_u64().unwrap() as usize, p[1].as_u64().unwrap() as usize), 255);
    }
    assert!(png::detourer_fond_uni(b"x").is_err());
}
