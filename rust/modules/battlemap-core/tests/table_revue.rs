//! Testeur: edge cases of the table core that the shared fixtures do not pin (AD-battlemap-table-3, 4, 7).
use battlemap_core::*;
use serde_json::{json, Value};

fn parse(s: &str) -> Value {
    serde_json::from_str(s).unwrap()
}

fn calque(id: &str, genre: &str, mj: bool) -> Value {
    json!({"id": id, "nom": format!("nom-{id}"), "type": genre, "visible": true, "verrouille": false, "mj_seul": mj})
}

fn doc(l: u32, h: u32) -> Value {
    json!({"schema": 1, "largeur": l, "hauteur": h, "calques": [calque("c-sol", "sol", false), calque("c-mur", "mur", false), calque("c-obj", "objet", false)],
        "sols": [], "murs": [], "elements": []})
}

fn etat(l: u32, h: u32) -> Value {
    parse(&etat_vide_json(l, h).unwrap())
}

fn lot(d: &Value, e: &Value, cmds: Value, ctx: Value) -> Value {
    parse(&appliquer_table_json(&d.to_string(), &e.to_string(), &cmds.to_string(), &ctx.to_string()))
}

fn vue(d: &Value, e: &Value, ctx: Value) -> Value {
    parse(&vue_joueur_json(&d.to_string(), &e.to_string(), &ctx.to_string()).unwrap())
}

fn revelees(e: &Value, l: u32, h: u32) -> Vec<(i32, i32)> {
    table::cases_revelees(e["brouillard"].as_str().unwrap(), l, h).unwrap()
}

#[test]
fn le_bitmap_est_lsb_d_abord_ligne_par_ligne_en_base64() {
    // 10 x 6: cell (1,0) is bit 1 of byte 0 -> 0x02; cell (9,0) is bit 1 of byte 1 -> 0x02; cell (0,1) = index 10 = bit 2 of byte 1.
    let d = doc(10, 6);
    let r = lot(&d, &etat(10, 6), json!([{"type": "reveler_rect", "x": 1, "y": 0, "l": 1, "h": 1}]), json!({}));
    let octets = r["etat"]["brouillard"].as_str().unwrap();
    assert_eq!(octets, "AgAAAAAAAAA=", "{r}");
    let r = lot(&d, &etat(10, 6), json!([{"type": "reveler_rect", "x": 9, "y": 0, "l": 1, "h": 1}, {"type": "reveler_rect", "x": 0, "y": 1, "l": 1, "h": 1}]), json!({}));
    assert_eq!(r["etat"]["brouillard"], "AAYAAAAAAAA=", "{r}");
}

#[test]
fn un_bitmap_de_mauvaise_taille_ou_au_rembourrage_sale_est_refuse() {
    let d = doc(10, 6);
    let mut e = etat(10, 6);
    e["brouillard"] = json!("AAAA");
    assert_eq!(lot(&d, &e, json!([]), json!({}))["code"], "etat_invalide");
    // 60 bits: the 4 high bits of the last byte must stay zero.
    e["brouillard"] = json!("AAAAAAAAAPA=");
    assert_eq!(lot(&d, &e, json!([]), json!({}))["code"], "etat_invalide");
    e["brouillard"] = json!("pas du base64!");
    assert_eq!(lot(&d, &e, json!([]), json!({}))["code"], "etat_invalide");
    assert!(vue_joueur_json(&d.to_string(), &e.to_string(), "{}").is_err());
}

#[test]
fn une_commande_inconnue_ou_un_champ_en_trop_refuse_le_lot() {
    let d = doc(10, 6);
    let e = etat(10, 6);
    for c in [json!({"type": "teleporter"}), json!({"type": "reveler_rect", "x": 0, "y": 0, "l": 1, "h": 1, "en_trop": 1}), json!({"type": "reveler_rect", "x": 0.5, "y": 0, "l": 1, "h": 1})] {
        let r = lot(&d, &e, json!([{"type": "reveler_rect", "x": 0, "y": 0, "l": 1, "h": 1}, c]), json!({}));
        assert_eq!((&r["ok"], &r["code"]), (&json!(false), &json!("commande_invalide")), "{r}");
    }
}

#[test]
fn le_lot_de_501_commandes_est_refuse_et_celui_de_500_passe() {
    let d = doc(10, 6);
    let un = json!({"type": "reveler_rect", "x": 0, "y": 0, "l": 1, "h": 1});
    assert_eq!(lot(&d, &etat(10, 6), Value::Array(vec![un.clone(); 500]), json!({}))["ok"], true);
    assert_eq!(lot(&d, &etat(10, 6), Value::Array(vec![un; 501]), json!({}))["code"], "lot_trop_grand");
}

#[test]
fn la_table_est_pleine_au_201e_pion_meme_dans_un_lot() {
    let d = doc(30, 10);
    let cmds: Vec<Value> = (0..201).map(|i| json!({"type": "ajouter_pion", "id": format!("p{i}"), "nom": "P", "x": i % 30, "y": i / 30})).collect();
    let r = lot(&d, &etat(30, 10), Value::Array(cmds[..200].to_vec()), json!({}));
    assert_eq!(r["ok"], true, "{r}");
    let r2 = lot(&d, &r["etat"], Value::Array(cmds[200..].to_vec()), json!({}));
    assert_eq!((&r2["code"], &r2["index"]), (&json!("table_pleine"), &json!(0)));
    // retire then add in one batch: 200 stays the ceiling
    let r3 = lot(&d, &r["etat"], json!([{"type": "retirer_pion", "id": "p0"}, cmds[200].clone()]), json!({}));
    assert_eq!(r3["ok"], true, "{r3}");
}

#[test]
fn un_pion_large_est_borne_par_son_emprise_et_un_id_invalide_est_refuse() {
    let d = doc(10, 6);
    let ctx = json!({"empreintes": {"grand": [3, 2]}});
    let ajout = |x: i32, y: i32| json!([{"type": "ajouter_pion", "id": "g", "nom": "G", "asset_id": "grand", "x": x, "y": y}]);
    assert_eq!(lot(&d, &etat(10, 6), ajout(7, 4), ctx.clone())["ok"], true);
    for (x, y) in [(8, 4), (7, 5), (-1, 0)] {
        assert_eq!(lot(&d, &etat(10, 6), ajout(x, y), ctx.clone())["code"], "position_invalide", "{x},{y}");
    }
    for id in ["", "Majuscule", "a b", "x234567890123456789012"] {
        let r = lot(&d, &etat(10, 6), json!([{"type": "ajouter_pion", "id": id, "nom": "G", "x": 0, "y": 0}]), json!({}));
        assert_eq!(r["code"], "commande_invalide", "{id:?}");
    }
    let r = lot(&d, &etat(10, 6), json!([{"type": "ajouter_pion", "id": "a", "nom": "  ", "x": 0, "y": 0}]), json!({}));
    assert_eq!(r["code"], "commande_invalide");
}

#[test]
fn regler_pion_ne_peut_pas_faire_sortir_un_pion_en_changeant_d_asset() {
    let d = doc(10, 6);
    let ctx = json!({"empreintes": {"grand": [3, 2]}});
    let r = lot(&d, &etat(10, 6), json!([{"type": "ajouter_pion", "id": "a", "nom": "A", "x": 9, "y": 5}]), ctx.clone());
    let r2 = lot(&d, &r["etat"], json!([{"type": "regler_pion", "id": "a", "asset_id": "grand"}]), ctx);
    assert_eq!(r2["code"], "position_invalide");
}

#[test]
fn un_rectangle_hors_carte_ou_vide_est_refuse() {
    let d = doc(10, 6);
    for (x, y, l, h) in [(0, 0, 11, 1), (9, 0, 2, 1), (0, 5, 1, 2), (-1, 0, 2, 1), (0, 0, 0, 1), (0, 0, 1, -1), (i32::MAX, 0, 1, 1), (1, 1, i32::MAX, 1)] {
        let r = lot(&d, &etat(10, 6), json!([{"type": "masquer_rect", "x": x, "y": y, "l": l, "h": h}]), json!({}));
        assert_eq!(r["code"], "position_invalide", "{x},{y},{l},{h}: {r}");
    }
    let r = lot(&d, &etat(10, 6), json!([{"type": "partager_vue", "vue": {"x": 0, "y": 0, "l": 11, "h": 1}}]), json!({}));
    assert_eq!(r["code"], "position_invalide");
}

/// Two rooms 3 wide side by side, walls round them (vertical wall at x = 3).
fn deux_pieces(porte: bool) -> Value {
    let mut d = doc(6, 3);
    let mut murs = vec![];
    for y in 0..3 {
        murs.push(json!({"calque": "c-mur", "x": 3, "y": y, "cote": "v", "asset_id": "m", "porte": porte && y == 1}));
    }
    d["murs"] = Value::Array(murs);
    d
}

#[test]
fn la_porte_est_une_limite_comme_le_mur_et_le_masquage_de_piece_aussi() {
    for porte in [false, true] {
        let d = deux_pieces(porte);
        let r = lot(&d, &etat(6, 3), json!([{"type": "reveler_piece", "x": 0, "y": 0}]), json!({}));
        let rev = revelees(&r["etat"], 6, 3);
        assert_eq!(rev.len(), 9, "{rev:?}");
        assert!(rev.iter().all(|(x, _)| *x < 3), "porte={porte}: {rev:?}");
        // Reveal both, then mask only the right room.
        let r = lot(&d, &etat(6, 3), json!([{"type": "reveler_rect", "x": 0, "y": 0, "l": 6, "h": 3}, {"type": "masquer_piece", "x": 5, "y": 2}]), json!({}));
        let rev = revelees(&r["etat"], 6, 3);
        assert!(rev.iter().all(|(x, _)| *x < 3) && rev.len() == 9, "porte={porte}: {rev:?}");
    }
}

#[test]
fn un_mur_horizontal_separe_les_lignes_et_une_case_hors_carte_est_refusee() {
    let mut d = doc(3, 4);
    d["murs"] = json!([0, 1, 2].map(|x| json!({"calque": "c-mur", "x": x, "y": 2, "cote": "h", "asset_id": "m"})));
    let r = lot(&d, &etat(3, 4), json!([{"type": "reveler_piece", "x": 1, "y": 3}]), json!({}));
    assert_eq!(revelees(&r["etat"], 3, 4).iter().map(|(_, y)| *y).collect::<Vec<_>>(), vec![2, 2, 2, 3, 3, 3]);
    let r = lot(&d, &etat(3, 4), json!([{"type": "reveler_piece", "x": 3, "y": 0}]), json!({}));
    assert_eq!(r["code"], "position_invalide");
}

#[test]
fn la_commande_d_un_joueur_est_refusee_meme_valide_ou_vide() {
    let d = doc(10, 6);
    for acteur in ["joueur", "autre"] {
        for cmds in [json!([]), json!([{"type": "reveler_rect", "x": 0, "y": 0, "l": 1, "h": 1}])] {
            let r = lot(&d, &etat(10, 6), cmds, json!({"acteur": acteur}));
            assert_eq!((&r["ok"], &r["code"]), (&json!(false), &json!("refuse")), "{r}");
        }
    }
    assert_eq!(lot(&d, &etat(10, 6), json!([]), json!({"acteur": "mj"}))["ok"], true);
}

#[test]
fn un_pion_de_deux_cases_se_voit_des_qu_une_case_est_revelee_et_perd_son_asset_mj_seul() {
    let d = doc(10, 6);
    let ctx = json!({"empreintes": {"grand": [2, 2], "secret-asset": [2, 2]}, "assets_mj_seul": ["secret-asset"], "fiches_lisibles": ["f-ok"]});
    let cmds = json!([
        {"type": "ajouter_pion", "id": "a", "nom": "Grand", "asset_id": "grand", "fiche_id": "f-secrete", "x": 4, "y": 2},
        {"type": "ajouter_pion", "id": "b", "nom": "Boss", "asset_id": "secret-asset", "fiche_id": "f-ok", "x": 0, "y": 0},
        {"type": "ajouter_pion", "id": "c", "nom": "Cache", "x": 0, "y": 0, "visible": false},
        {"type": "reveler_rect", "x": 5, "y": 3, "l": 1, "h": 1},
        {"type": "reveler_rect", "x": 0, "y": 0, "l": 1, "h": 1},
    ]);
    let r = lot(&d, &etat(10, 6), cmds, ctx.clone());
    assert_eq!(r["ok"], true, "{r}");
    let v = vue(&d, &r["etat"], ctx);
    let pions = v["pions"].as_array().unwrap();
    assert_eq!(pions.len(), 2, "{v}");
    assert_eq!((pions[0]["id"].as_str(), pions[0]["l"].as_i64(), pions[0]["fiche_id"].is_null()), (Some("a"), Some(2), true));
    // GM-only asset: a plain 1 x 1 disc with its name, no asset id, but the readable sheet is kept.
    assert_eq!((pions[1]["nom"].as_str(), pions[1]["asset_id"].is_null(), pions[1]["l"].as_i64(), pions[1]["fiche_id"].as_str()), (Some("Boss"), true, Some(1), Some("f-ok")));
    assert!(!v.to_string().contains("secret-asset") && !v.to_string().contains("f-secrete") && !v.to_string().contains("Cache"));
}

#[test]
fn les_murs_se_voient_si_l_une_des_deux_cases_est_revelee_et_les_elements_selon_leur_emprise() {
    let mut d = doc(6, 3);
    d["murs"] = json!([
        {"calque": "c-mur", "x": 3, "y": 1, "cote": "v", "asset_id": "m", "porte": true},
        {"calque": "c-mur", "x": 5, "y": 2, "cote": "v", "asset_id": "m"},
        {"calque": "c-mur", "x": 0, "y": 3, "cote": "h", "asset_id": "m"},
    ]);
    d["sols"] = json!([{"calque": "c-sol", "x": 0, "y": 0, "asset_id": "s"}, {"calque": "c-sol", "x": 1, "y": 0, "asset_id": "s"}]);
    d["elements"] = json!([
        {"id": "e1", "calque": "c-obj", "asset_id": "a", "x": 4.5, "y": 1.5},
        {"id": "e2", "calque": "c-obj", "asset_id": "a", "x": 1.5, "y": 1.5, "rotation": 90},
        {"id": "e3", "calque": "c-obj", "asset_id": "long", "x": 2.0, "y": 1.5, "rotation": 90, "echelle": 1.0},
    ]);
    let ctx = json!({"empreintes": {"long": [3, 1]}});
    // Reveal only cell (2,1): the wall (3,1) v separates (2,1)/(3,1) -> shown; (5,2) v separates (4,2)/(5,2) -> hidden;
    // the bottom border wall (0,3) h has (0,2) above, hidden.
    let r = lot(&d, &etat(6, 3), json!([{"type": "reveler_rect", "x": 2, "y": 1, "l": 1, "h": 1}]), ctx.clone());
    let v = vue(&d, &r["etat"], ctx.clone());
    assert_eq!(v["document"]["murs"].as_array().unwrap().len(), 1, "{v}");
    assert_eq!(v["document"]["sols"].as_array().unwrap().len(), 0);
    let ids: Vec<&str> = v["document"]["elements"].as_array().unwrap().iter().map(|e| e["id"].as_str().unwrap()).collect();
    // e1 on (4,1): hidden. e2 on (1,1): hidden. e3 (3x1 turned: 1 wide, 3 high, centre x=2 -> cells x 1.5..2.5 -> 1,2; y 0..3): touches (2,1) -> shown.
    assert_eq!(ids, vec!["e3"], "{v}");
    // The bottom border wall shows when its upper cell is revealed.
    let r = lot(&d, &etat(6, 3), json!([{"type": "reveler_rect", "x": 0, "y": 2, "l": 1, "h": 1}]), ctx.clone());
    assert_eq!(vue(&d, &r["etat"], ctx)["document"]["murs"].as_array().unwrap().len(), 1);
}

#[test]
fn un_calque_masque_retire_sols_murs_elements_et_son_propre_nom() {
    let mut d = doc(4, 2);
    d["calques"] = json!([calque("c-sol", "sol", false), calque("c-obj", "objet", false)]);
    d["sols"] = json!([{"calque": "c-sol", "x": 0, "y": 0, "asset_id": "s"}]);
    d["elements"] = json!([{"id": "e1", "calque": "c-obj", "asset_id": "a", "x": 0.5, "y": 0.5}]);
    let r = lot(&d, &etat(4, 2), json!([{"type": "reveler_rect", "x": 0, "y": 0, "l": 4, "h": 2}, {"type": "regler_calque_joueurs", "calque": "c-obj", "montre": false}, {"type": "regler_calque_joueurs", "calque": "c-sol", "montre": false}, {"type": "regler_calque_joueurs", "calque": "c-sol", "montre": true}]), json!({}));
    assert_eq!(r["etat"]["calques_masques"], json!(["c-obj"]));
    let v = vue(&d, &r["etat"], json!({}));
    assert_eq!(v["document"]["elements"].as_array().unwrap().len(), 0);
    assert_eq!(v["document"]["sols"].as_array().unwrap().len(), 1);
    assert!(!v.to_string().contains("nom-c-obj"));
    let r = lot(&d, &r["etat"], json!([{"type": "regler_calque_joueurs", "calque": "inconnu", "montre": false}]), json!({}));
    assert_eq!(r["code"], "calque_inconnu");
}

#[test]
fn reinitialiser_vide_tout_et_les_commandes_suivantes_du_lot_s_appliquent() {
    let d = doc(4, 2);
    let r = lot(&d, &etat(4, 2), json!([
        {"type": "ajouter_pion", "id": "a", "nom": "A", "x": 0, "y": 0},
        {"type": "reveler_rect", "x": 0, "y": 0, "l": 2, "h": 1},
        {"type": "partager_vue", "vue": {"x": 0, "y": 0, "l": 2, "h": 2}},
        {"type": "regler_calque_joueurs", "calque": "c-obj", "montre": false},
        {"type": "reinitialiser"},
        {"type": "reveler_rect", "x": 3, "y": 1, "l": 1, "h": 1},
    ]), json!({}));
    assert_eq!(r["etat"]["pions"], json!([]));
    assert_eq!(r["etat"]["vue"], Value::Null);
    assert_eq!(r["etat"]["calques_masques"], json!([]));
    assert_eq!(revelees(&r["etat"], 4, 2), vec![(3, 1)]);
}

#[test]
fn redimensionner_garde_l_origine_en_haut_a_gauche_et_borne_la_vue() {
    let d = doc(10, 6);
    let r = lot(&d, &etat(10, 6), json!([{"type": "reveler_rect", "x": 8, "y": 0, "l": 2, "h": 1}, {"type": "reveler_rect", "x": 2, "y": 4, "l": 1, "h": 1}, {"type": "partager_vue", "vue": {"x": 6, "y": 3, "l": 4, "h": 3}}]), json!({}));
    let e = r["etat"].clone();
    // Narrower: row stride changes, bits must follow their cell, not their index.
    let r = parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 5, 6, "{}"));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(revelees(&r["etat"], 5, 6), vec![(2, 4)]);
    assert_eq!(r["etat"]["vue"], json!({"x": 4, "y": 3, "l": 1, "h": 3}));
    // Wider and taller: same cells, nothing new revealed.
    let r = parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 13, 9, "{}"));
    assert_eq!(revelees(&r["etat"], 13, 9), vec![(8, 0), (9, 0), (2, 4)]);
    assert_eq!(r["etat"]["vue"], e["vue"]);
    // Out of bounds sizes.
    for (l, h) in [(0, 6), (6, 0), (201, 6), (6, 201)] {
        let r = parse(&redimensionner_etat_json(&e.to_string(), 10, 6, l, h, "{}"));
        assert_eq!((&r["code"], &r["champ"]), (&json!("limite_depassee"), &json!("taille")), "{l}x{h}");
    }
    // A wrong old size does not match the bitmap.
    assert_eq!(parse(&redimensionner_etat_json(&e.to_string(), 9, 6, 5, 6, "{}"))["code"], "etat_invalide");
}

#[test]
fn redimensionner_refuse_si_l_emprise_d_un_pion_sortirait_et_ne_rogne_pas_une_vue_nulle() {
    let d = doc(10, 6);
    let ctx = json!({"empreintes": {"grand": [3, 1]}});
    let r = lot(&d, &etat(10, 6), json!([{"type": "ajouter_pion", "id": "a", "nom": "A", "asset_id": "grand", "x": 6, "y": 5}]), ctx.clone());
    let e = r["etat"].clone();
    assert_eq!(parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 8, 6, &ctx.to_string()))["code"], "limite_depassee");
    assert_eq!(parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 9, 6, &ctx.to_string()))["ok"], true);
    // Same pion with the footprint unknown (1 x 1): fits in 7 x 6.
    assert_eq!(parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 7, 6, "{}"))["ok"], true);
    assert_eq!(parse(&redimensionner_etat_json(&e.to_string(), 10, 6, 7, 5, &ctx.to_string()))["code"], "limite_depassee");
}
