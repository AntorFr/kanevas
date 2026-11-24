//! Plays `tests/fixtures/table/*.json` (AD-battlemap-table-9). The same files are played through the Wasm
//! module by `src/wasm/battlemap-table.test.ts`.
use battlemap_core::*;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;

fn lire(nom: &str) -> Value {
    let chemin = format!("{}/tests/fixtures/table/{nom}.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&fs::read_to_string(chemin).unwrap()).unwrap()
}

/// JSON has one number type; every number is read as a float.
fn norm(v: Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
        autre => autre,
    }
}

fn parse(s: &str) -> Value {
    serde_json::from_str(s).unwrap()
}

fn cellules(v: &Value) -> BTreeSet<(i64, i64)> {
    v.as_array().unwrap().iter().map(|c| (c[0].as_i64().unwrap(), c[1].as_i64().unwrap())).collect()
}

fn revelees(etat: &Value, l: u32, h: u32) -> BTreeSet<(i64, i64)> {
    table::cases_revelees(etat["brouillard"].as_str().unwrap(), l, h)
        .unwrap()
        .into_iter()
        .map(|(x, y)| (i64::from(x), i64::from(y)))
        .collect()
}

fn lot(doc: &Value, etat: &Value, cmds: &Value, ctx: &Value) -> Value {
    parse(&appliquer_table_json(&doc.to_string(), &etat.to_string(), &cmds.to_string(), &ctx.to_string()))
}

#[test]
fn le_lot_nominal_donne_l_etat_et_la_vue_joueur_attendus() {
    let f = lire("lot-nominal");
    let doc = &f["document"];
    let (l, h) = (doc["largeur"].as_u64().unwrap() as u32, doc["hauteur"].as_u64().unwrap() as u32);
    let vide = parse(&etat_vide_json(l, h).unwrap());
    let r = lot(doc, &vide, &f["lot"], &f["contexte"]);
    assert_eq!(r["ok"], true, "{r}");
    let etat = &r["etat"];
    let a = &f["attendu"];
    assert_eq!(norm(etat["pions"].clone()), norm(a["pions"].clone()));
    assert_eq!(etat["vue"], a["vue"]);
    assert_eq!(etat["calques_masques"], a["calques_masques"]);
    assert_eq!(revelees(etat, l, h), cellules(&a["revele"]));

    let vue = parse(&vue_joueur_json(&doc.to_string(), &etat.to_string(), &f["contexte"].to_string()).unwrap());
    let mut attendue = f["attendu_vue"].clone();
    attendue["brouillard"] = etat["brouillard"].clone();
    assert_eq!(norm(vue.clone()), norm(attendue));
    let texte = vue.to_string();
    for secret in f["secrets"].as_array().unwrap() {
        assert!(!texte.contains(secret.as_str().unwrap()), "{secret} leaks");
    }
}

/// The state a case starts from: empty, with the generated tokens and the preparation applied.
fn depart(f: &Value, cas: &Value) -> (Value, Value, u32, u32) {
    let doc = if cas["document"].is_null() { f["document"].clone() } else { cas["document"].clone() };
    let (l, h) = (doc["largeur"].as_u64().unwrap() as u32, doc["hauteur"].as_u64().unwrap() as u32);
    let mut etat = parse(&etat_vide_json(l, h).unwrap());
    for i in 0..cas["pions_generes"].as_u64().unwrap_or(0) {
        etat["pions"].as_array_mut().unwrap().push(json!({"id": format!("g{i}"), "nom": "G", "asset_id": null, "fiche_id": null, "x": 0, "y": 0, "visible": true}));
    }
    if let Some(prep) = cas.get("preparation") {
        let r = lot(&doc, &etat, prep, &f["contexte"]);
        assert_eq!(r["ok"], true, "{}: preparation {r}", cas["nom"]);
        etat = r["etat"].clone();
    }
    (doc, etat, l, h)
}

fn verifier(cas: &Value, r: &Value, l: u32, h: u32, doc: &Value, ctx: &Value) {
    let a = &cas["attendu"];
    assert_eq!(r["ok"], a["ok"], "{}: {r}", cas["nom"]);
    if a["ok"] == false {
        assert_eq!(r["code"], a["code"], "{}: {r}", cas["nom"]);
        for cle in ["index", "champ"] {
            if a.get(cle).is_some() {
                assert_eq!(r[cle], a[cle], "{}: {cle}", cas["nom"]);
            }
        }
        return;
    }
    let etat = &r["etat"];
    let vues = revelees(etat, l, h);
    if let Some(v) = a.get("revele") {
        assert_eq!(vues, cellules(v), "{}", cas["nom"]);
    }
    if a.get("revele_tout") == Some(&json!(true)) {
        assert_eq!(vues.len() as u32, l * h, "{}", cas["nom"]);
    }
    if let Some(rc) = a.get("revele_hors") {
        let rc: Vec<i64> = rc.as_array().unwrap().iter().map(|n| n.as_i64().unwrap()).collect();
        assert!(!vues.iter().any(|(x, y)| (rc[0]..rc[0] + rc[2]).contains(x) && (rc[1]..rc[1] + rc[3]).contains(y)), "{}", cas["nom"]);
        assert!(!vues.is_empty(), "{}", cas["nom"]);
    }
    if let Some(m) = a.get("masque") {
        assert!(vues.is_disjoint(&cellules(m)), "{}", cas["nom"]);
    }
    if let Some(v) = a.get("vue") {
        assert_eq!(&etat["vue"], v, "{}", cas["nom"]);
    }
    // Expected positions, written by hand in the fixture: [{id, x, y}].
    for p in a.get("pions").and_then(|p| p.as_array()).into_iter().flatten() {
        let trouve = etat["pions"].as_array().unwrap().iter().find(|q| q["id"] == p["id"]).unwrap_or_else(|| panic!("{}: pion absent", cas["nom"]));
        assert_eq!((&trouve["x"], &trouve["y"]), (&p["x"], &p["y"]), "{}", cas["nom"]);
    }
    if a.get("vue_joueur_sans").is_some() || a.get("mj_garde").is_some() {
        let vue = parse(&vue_joueur_json(&doc.to_string(), &etat.to_string(), &ctx.to_string()).unwrap());
        for id in a["vue_joueur_sans"].as_array().into_iter().flatten() {
            assert!(!vue["pions"].as_array().unwrap().iter().any(|q| q["id"] == *id), "{}: {id} in the player view", cas["nom"]);
        }
        for id in a["mj_garde"].as_array().into_iter().flatten() {
            assert!(etat["pions"].as_array().unwrap().iter().any(|q| q["id"] == *id), "{}: {id} lost by the GM", cas["nom"]);
        }
    }
}

fn jouer_cas(nom_fichier: &str) {
    let f = lire(nom_fichier);
    for cas in f["cas"].as_array().unwrap() {
        let (doc, etat, l, h) = depart(&f, cas);
        let (r, l, h) = if let Some(t) = cas.get("nouvelle_taille") {
            let (nl, nh) = (t[0].as_u64().unwrap() as u32, t[1].as_u64().unwrap() as u32);
            let r = parse(&redimensionner_etat_json(&etat.to_string(), l, h, nl, nh, &f["contexte"].to_string()));
            (r, nl, nh)
        } else {
            let mut ctx = f["contexte"].clone();
            if let Some(a) = cas.get("acteur") {
                ctx["acteur"] = a.clone();
            }
            (lot(&doc, &etat, &cas["lot"], &ctx), l, h)
        };
        verifier(cas, &r, l, h, &doc, &f["contexte"]);
    }
}

#[test]
fn une_commande_invalide_refuse_le_lot_entier() {
    jouer_cas("refus");
}

#[test]
fn le_lot_d_un_joueur_ne_deplace_que_ses_pions_visibles_dans_la_carte() {
    jouer_cas("joueur");
}

#[test]
fn reveler_piece_s_arrete_au_mur_et_a_la_porte() {
    jouer_cas("pieces");
}

#[test]
fn reveler_piece_remplit_la_carte_pour_une_piece_ouverte() {
    jouer_cas("piece-ouverte");
}

#[test]
fn redimensionner_etat_etend_rogne_borne_la_vue_et_refuse() {
    jouer_cas("redimensionner");
}

#[test]
fn un_lot_refuse_ne_laisse_rien_de_ses_premieres_commandes() {
    let f = lire("refus");
    let doc = &f["document"];
    let vide = parse(&etat_vide_json(10, 6).unwrap());
    let cmds = json!([{"type": "reveler_rect", "x": 0, "y": 0, "l": 2, "h": 2}, {"type": "retirer_pion", "id": "absent"}]);
    let r = lot(doc, &vide, &cmds, &f["contexte"]);
    assert_eq!((&r["ok"], &r["code"], &r["index"]), (&json!(false), &json!("pion_inconnu"), &json!(1)));
    assert!(r.get("etat").is_none());
}
