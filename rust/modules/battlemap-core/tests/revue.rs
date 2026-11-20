//! Review tests, written from the exit criterion (AD-153, AD-154, AD-156, AD-163, AD-battlemap-editeur-3/5/7):
//! the edges the shared fixtures do not reach.
use battlemap_core::*;
use serde_json::{json, Value};

fn vide(l: u32, h: u32) -> Value {
    serde_json::from_str(&carte_vide_json(l, h).unwrap()).unwrap()
}

fn lot(doc: &Value, lot: Value) -> Value {
    serde_json::from_str(&appliquer_lot_json(&doc.to_string(), &lot.to_string())).unwrap()
}

fn ok(doc: &Value, l: Value) -> Value {
    let r = lot(doc, l);
    assert_eq!(r["ok"], true, "{r}");
    r
}

/// Applies the batch then its inverses; returns the document after the batch.
fn aller_retour(doc: &Value, l: Value) -> Value {
    let r = ok(doc, l);
    let retour = ok(&r["document"], r["inverses"].clone());
    assert_eq!(retour["document"], *doc, "undo is not exact");
    let refait = ok(&retour["document"], retour["inverses"].clone());
    assert_eq!(refait["document"], r["document"], "redo is not exact");
    r["document"].clone()
}

fn elt(id: &str, calque: &str, asset: &str, x: f64, y: f64) -> Value {
    json!({"type": "poser_element", "id": id, "calque": calque, "asset_id": asset, "x": x, "y": y})
}

/// A map with a second object layer, floors, walls with a door, and interleaved elements.
fn riche() -> Value {
    let d = vide(10, 10);
    let l = json!([
        {"type": "creer_calque", "id": "o2", "nom": "Haut", "genre": "objet"},
        {"type": "peindre_sol", "calque": "sol", "cellules": [{"x": 0, "y": 0}, {"x": 1, "y": 0}], "asset_id": "dalle"},
        {"type": "tracer_mur", "calque": "murs", "segments": [{"x": 0, "y": 0, "cote": "h"}, {"x": 10, "y": 9, "cote": "v"}], "asset_id": "pierre"},
        {"type": "poser_porte", "calque": "murs", "x": 0, "y": 0, "cote": "h", "porte": true},
        elt("a", "objets", "t", 1.0, 1.0), elt("b", "o2", "t", 2.0, 2.0), elt("c", "objets", "t", 3.0, 3.0),
        {"type": "lier_fiche", "id": "a", "fiche_id": "f1"}
    ]);
    ok(&d, l)["document"].clone()
}

// Panne : si l'échelle n'est pas bornée à 0,25–4 (ou si les bornes sont exclues).
#[test]
fn echelle_bornes_incluses_et_hors_bornes_refusees() {
    let d = riche();
    for e in [0.25, 4.0, 1.0] {
        aller_retour(&d, json!([{"type": "mettre_a_echelle", "id": "a", "echelle": e}]));
    }
    for e in [0.249, 4.001, 0.0, -1.0] {
        let r = lot(&d, json!([{"type": "mettre_a_echelle", "id": "a", "echelle": e}]));
        assert_eq!((r["ok"].clone(), r["code"].clone()), (json!(false), json!("echelle_invalide")), "{e}");
    }
    let r = lot(&d, json!([elt("z", "objets", "t", 1.0, 1.0)].into_iter().map(|mut c| { c["echelle"] = json!(5.0); c }).collect::<Vec<_>>()));
    assert_eq!(r["code"], "echelle_invalide");
}

// Panne : miroir qui ne revient pas (bascule sans état précédent).
#[test]
fn miroir_bascule_et_se_defait_des_deux_etats() {
    let d = riche();
    let apres = aller_retour(&d, json!([{"type": "retourner_element", "id": "a"}]));
    assert_eq!(apres["elements"][0]["miroir"], true);
    let encore = aller_retour(&apres, json!([{"type": "retourner_element", "id": "a"}]));
    assert_eq!(encore["elements"][0]["miroir"], false);
    aller_retour(&d, json!([{"type": "retourner_element", "id": "a", "miroir": false}, {"type": "retourner_element", "id": "a", "miroir": true}]));
}

// Panne : supprimer un calque ne restitue pas contenu, rang et ordre d'empilement.
#[test]
fn supprimer_calque_restitue_contenu_et_rang_de_chaque_calque() {
    let d = riche();
    for id in ["sol", "murs", "objets", "o2"] {
        let apres = aller_retour(&d, json!([{"type": "supprimer_calque", "id": id}]));
        assert!(apres["calques"].as_array().unwrap().iter().all(|c| c["id"] != id));
    }
    // layer settings (hidden / locked / GM only) come back too
    let r = ok(&d, json!([{"type": "regler_calque", "id": "o2", "visible": false, "verrouille": true, "mj_seul": true}]));
    aller_retour(&r["document"], json!([{"type": "supprimer_calque", "id": "o2"}]));
}

#[test]
fn calques_renommer_regler_ordonner_et_dupliquer_font_l_aller_retour() {
    let d = riche();
    aller_retour(&d, json!([{"type": "renommer_calque", "id": "sol", "nom": "Plancher"}]));
    aller_retour(&d, json!([{"type": "regler_calque", "id": "sol", "visible": false}]));
    aller_retour(&d, json!([{"type": "ordonner_calque", "id": "o2", "index": 0}]));
    aller_retour(&d, json!([{"type": "ordonner_calque", "id": "sol", "index": 3}]));
    let apres = aller_retour(&d, json!([{"type": "dupliquer_elements", "ids": ["a", "c"], "nouveaux_ids": ["a2", "c2"], "dx": 1.0, "dy": 0.5}]));
    assert_eq!(apres["elements"].as_array().unwrap().len(), 5);
    let copie = apres["elements"].as_array().unwrap().iter().find(|e| e["id"] == "a2").unwrap().clone();
    assert_eq!((copie["x"].clone(), copie["y"].clone()), (json!(2.0), json!(1.5)));
}

#[test]
fn un_lot_de_plusieurs_commandes_s_annule_en_un_lot() {
    let d = riche();
    aller_retour(&d, json!([
        {"type": "deplacer_element", "id": "a", "x": 5.5, "y": 5.5},
        {"type": "pivoter_element", "id": "a", "rotation": 270},
        {"type": "supprimer_element", "id": "c"},
        {"type": "gommer", "calque": "sol", "cellules": [{"x": 0, "y": 0}]},
        {"type": "gommer", "calque": "murs", "segments": [{"x": 0, "y": 0, "cote": "h"}]},
        {"type": "peindre_sol", "calque": "sol", "cellules": [{"x": 1, "y": 0}, {"x": 4, "y": 4}], "asset_id": "herbe"},
        {"type": "lier_fiche", "id": "a"}
    ]));
}

// Panne : une porte effacée avec son mur revient en simple mur.
#[test]
fn gommer_un_mur_porte_puis_annuler_rend_la_porte() {
    let d = riche();
    let apres = aller_retour(&d, json!([{"type": "gommer", "calque": "murs", "segments": [{"x": 0, "y": 0, "cote": "h"}]}]));
    assert_eq!(apres["murs"].as_array().unwrap().len(), 1);
}

// Panne : un lot dont la 2e commande est fautive s'applique à moitié.
#[test]
fn lot_refuse_en_entier_avec_l_index_fautif_et_sans_effet() {
    let d = riche();
    let r = lot(&d, json!([
        {"type": "deplacer_element", "id": "a", "x": 5.0, "y": 5.0},
        {"type": "deplacer_element", "id": "a", "x": 11.0, "y": 5.0}
    ]));
    assert_eq!((r["ok"].clone(), r["code"].clone(), r["index"].clone()), (json!(false), json!("position_invalide"), json!(1)));
    assert!(r.get("document").is_none());
    // a command outside the closed list is refused, nothing else
    for mauvaise in [json!([{"type": "teleporter"}]), json!({"type": "gommer"})] {
        let r = lot(&d, mauvaise);
        assert_eq!(r["ok"], false, "{r}");
    }
}

// Panne : limite de calques absente ou décalée de un.
#[test]
fn vingt_calques_passent_le_vingt_et_unieme_est_carte_pleine() {
    let d = vide(5, 5); // 3 layers
    let creer = |n: usize| (0..n).map(|i| json!({"type": "creer_calque", "id": format!("c{i}"), "nom": format!("C{i}"), "genre": "objet"})).collect::<Vec<_>>();
    let r = ok(&d, Value::Array(creer(17)));
    assert_eq!(r["document"]["calques"].as_array().unwrap().len(), 20);
    let r = lot(&d, Value::Array(creer(18)));
    assert_eq!((r["code"].clone(), r["index"].clone()), (json!("carte_pleine"), json!(17)));
    // supprimer a layer then create one in the same batch stays within the limit
    let plein = r_doc(&d, creer(17));
    ok(&plein, json!([{"type": "supprimer_calque", "id": "c0"}, {"type": "creer_calque", "id": "n", "nom": "N", "genre": "sol"}]));
}

fn r_doc(d: &Value, l: Vec<Value>) -> Value {
    ok(d, Value::Array(l))["document"].clone()
}

// Panne : limite de taille de carte.
#[test]
fn taille_200_par_200_valide_201_refusee() {
    assert!(carte_vide_json(200, 200).is_ok());
    for (l, h) in [(201, 200), (200, 201), (0, 5)] {
        assert_eq!(carte_vide_json(l, h).unwrap_err().code, "limite_depassee");
    }
    let d = vide(200, 200);
    let r = lot(&d, json!([{"type": "redimensionner", "largeur": 201, "hauteur": 200}]));
    assert_eq!((r["code"].clone(), r["champ"].clone()), (json!("limite_depassee"), json!("taille")));
    ok(&vide(10, 10), json!([{"type": "redimensionner", "largeur": 200, "hauteur": 200}]));
}

// Panne : redimensionnement qui laisse du contenu dehors, ou qui refuse du contenu à la frontière.
#[test]
fn redimensionner_refuse_ce_qui_laisse_du_contenu_dehors_et_accepte_la_frontiere() {
    let d = riche(); // 10×10, floor (1,0), wall v at x=10 y=9, element at (3,3)
    let refus = |l: u32, h: u32| lot(&d, json!([{"type": "redimensionner", "largeur": l, "hauteur": h}]));
    // the vertical wall on the right edge (x = 10) needs width >= 10
    let r = refus(9, 10);
    assert_eq!((r["ok"].clone(), r["code"].clone(), r["champ"].clone()), (json!(false), json!("limite_depassee"), json!("taille")));
    // wall at y=9 (cell row 9) needs height >= 10
    assert_eq!(refus(10, 9)["code"], "limite_depassee");
    // element at 3,3 stays in a 3×3 map only if the wall is gone: build a map with an element only
    let e = ok(&vide(10, 10), json!([elt("e", "objets", "t", 5.0, 5.0)]))["document"].clone();
    let ok5 = lot(&e, json!([{"type": "redimensionner", "largeur": 5, "hauteur": 5}]));
    assert_eq!(ok5["ok"], true, "an element on the far edge (x = width) is inside: {ok5}");
    let ko = lot(&e, json!([{"type": "redimensionner", "largeur": 4, "hauteur": 10}]));
    assert_eq!((ko["code"].clone(), ko["champ"].clone()), (json!("limite_depassee"), json!("taille")));
    let ko = lot(&e, json!([{"type": "redimensionner", "largeur": 10, "hauteur": 4}]));
    assert_eq!(ko["code"], "limite_depassee");
    // floor outside
    let s = ok(&vide(10, 10), json!([{"type": "peindre_sol", "calque": "sol", "cellules": [{"x": 4, "y": 0}], "asset_id": "d"}]))["document"].clone();
    assert_eq!(lot(&s, json!([{"type": "redimensionner", "largeur": 4, "hauteur": 10}]))["code"], "limite_depassee");
    assert_eq!(lot(&s, json!([{"type": "redimensionner", "largeur": 5, "hauteur": 10}]))["ok"], true);
    // a shrink then a grow undoes exactly
    aller_retour(&e, json!([{"type": "redimensionner", "largeur": 5, "hauteur": 5}]));
    // inside a batch: the move comes first, so the resize may pass
    ok(&e, json!([{"type": "deplacer_element", "id": "e", "x": 1.0, "y": 1.0}, {"type": "redimensionner", "largeur": 2, "hauteur": 2}]));
    let r = lot(&e, json!([{"type": "redimensionner", "largeur": 2, "hauteur": 2}, {"type": "deplacer_element", "id": "e", "x": 1.0, "y": 1.0}]));
    assert_eq!((r["code"].clone(), r["index"].clone()), (json!("limite_depassee"), json!(0)));
}

// Panne : un lot qui dépasse 5 000 éléments par duplication.
#[test]
fn dupliquer_au_dela_de_5000_elements_est_carte_pleine() {
    let d = vide(10, 10);
    let poses: Vec<Value> = (0..5000).map(|i| elt(&format!("e{i}"), "objets", "t", 1.0, 1.0)).collect();
    let plein = ok(&d, Value::Array(poses))["document"].clone();
    let r = lot(&plein, json!([{"type": "dupliquer_elements", "ids": ["e0"], "nouveaux_ids": ["x"]}]));
    assert_eq!((r["code"].clone(), r["ok"].clone()), (json!("carte_pleine"), json!(false)));
    // removing one and adding one in the same batch is allowed
    ok(&plein, json!([{"type": "supprimer_element", "id": "e1"}, elt("n", "objets", "t", 1.0, 1.0)]));
}

#[test]
fn entrees_fausses_codes_attendus() {
    let d = riche();
    let code = |l: Value| lot(&d, l)["code"].clone();
    assert_eq!(code(json!([elt("a", "objets", "t", 1.0, 1.0)])), "id_existant");
    assert_eq!(code(json!([elt("n", "sol", "t", 1.0, 1.0)])), "calque_incompatible");
    assert_eq!(code(json!([elt("n", "fantome", "t", 1.0, 1.0)])), "calque_inconnu");
    assert_eq!(code(json!([elt("n", "objets", "t", -0.5, 1.0)])), "position_invalide");
    assert_eq!(code(json!([elt("n", "objets", "t", 10.5, 1.0)])), "position_invalide");
    assert_eq!(code(json!([{"type": "pivoter_element", "id": "a", "rotation": 45}])), "rotation_invalide");
    assert_eq!(code(json!([{"type": "supprimer_element", "id": "nope"}])), "element_inconnu");
    assert_eq!(code(json!([{"type": "peindre_sol", "calque": "sol", "cellules": [{"x": 10, "y": 0}], "asset_id": "d"}])), "position_invalide");
    assert_eq!(code(json!([{"type": "peindre_sol", "calque": "murs", "cellules": [{"x": 1, "y": 0}], "asset_id": "d"}])), "calque_incompatible");
    assert_eq!(code(json!([{"type": "supprimer_calque", "id": "x"}])), "calque_inconnu");
    assert_eq!(code(json!([{"type": "poser_porte", "calque": "murs", "x": 3, "y": 3, "cote": "h", "porte": true}])), "mur_inconnu");
    assert_eq!(code(json!([{"type": "dupliquer_elements", "ids": ["a"], "nouveaux_ids": ["a2"], "dx": 20.0}])), "position_invalide");
    assert_eq!(code(json!([{"type": "dupliquer_elements", "ids": ["a", "c"], "nouveaux_ids": ["z"]}])), "commande_invalide");
}

// --- player filter (AD-156) ---

fn filtre(doc: &Value, ctx: Value) -> Value {
    serde_json::from_str(&filtrer_pour_joueur_json(&doc.to_string(), &ctx.to_string()).unwrap()).unwrap()
}

fn secrete() -> Value {
    let d = riche();
    ok(&d, json!([
        {"type": "regler_calque", "id": "o2", "mj_seul": true},
        {"type": "creer_calque", "id": "ms", "nom": "Pièges", "genre": "sol", "mj_seul": true},
        {"type": "peindre_sol", "calque": "ms", "cellules": [{"x": 5, "y": 5}], "asset_id": "trap"},
        {"type": "creer_calque", "id": "mm", "nom": "Secret", "genre": "mur", "mj_seul": true},
        {"type": "tracer_mur", "calque": "mm", "segments": [{"x": 2, "y": 2, "cote": "h"}], "asset_id": "wall-secret"},
        elt("d", "objets", "asset-mj", 4.0, 4.0), elt("e", "objets", "asset-retire", 6.0, 6.0),
        {"type": "lier_fiche", "id": "c", "fiche_id": "fiche-cachee"}
    ]))["document"].clone()
}

#[test]
fn filtre_joueur_retire_calques_mj_contenu_assets_et_fiches_illisibles() {
    let d = secrete();
    let ctx = json!({"assets_mj_seul": ["asset-mj"], "assets_retires": ["asset-retire"], "fiches_lisibles": ["f1"]});
    let f = filtre(&d, ctx);
    let texte = f.to_string();
    for secret in ["o2", "Haut", "Pièges", "trap", "Secret", "wall-secret", "asset-mj", "asset-retire", "fiche-cachee"] {
        assert!(!texte.contains(secret), "{secret} leaks: {texte}");
    }
    let ids: Vec<&str> = f["elements"].as_array().unwrap().iter().map(|e| e["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["a", "c"]);
    assert_eq!(f["elements"][0]["fiche_id"], "f1");
    assert!(f["elements"][1].get("fiche_id").is_none());
    let noms: Vec<&str> = f["calques"].as_array().unwrap().iter().map(|c| c["nom"].as_str().unwrap()).collect();
    assert_eq!(noms, ["Sol", "Murs", "Objets"]);
    // public content stays
    assert_eq!(f["sols"].as_array().unwrap().len(), 2);
    assert_eq!(f["murs"].as_array().unwrap().len(), 2);
    // the input is not changed and the filter is idempotent
    assert_eq!(f, filtre(&f, json!({"assets_mj_seul": ["asset-mj"], "assets_retires": ["asset-retire"], "fiches_lisibles": ["f1"]})));
}

#[test]
fn filtre_joueur_sans_contexte_ne_garde_aucune_fiche_et_un_document_sans_secret_est_inchange() {
    let d = riche();
    let f = filtre(&d, json!({}));
    assert!(f["elements"].as_array().unwrap().iter().all(|e| e.get("fiche_id").is_none()));
    let mut attendu = d.clone();
    attendu["elements"][0].as_object_mut().unwrap().remove("fiche_id");
    // the second object layer is not GM-only here: nothing else is removed
    assert_eq!(f, attendu);
    assert_eq!(filtre(&d, json!({"fiches_lisibles": ["f1"]})), d);
}

#[test]
fn filtre_joueur_a_le_meme_resultat_que_le_calque_soit_en_tete_ou_en_queue() {
    // a GM-only layer that is not last: the elements of the layers after it are kept
    let d = ok(&riche(), json!([{"type": "regler_calque", "id": "objets", "mj_seul": true}]))["document"].clone();
    let f = filtre(&d, json!({"fiches_lisibles": ["f1"]}));
    let ids: Vec<&str> = f["elements"].as_array().unwrap().iter().map(|e| e["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["b"]);
}

#[test]
fn filtre_refuse_un_contexte_ou_un_document_invalide() {
    assert!(filtrer_pour_joueur_json(&riche().to_string(), "pas du json").is_err());
    assert!(filtrer_pour_joueur_json("{}", "{}").is_err());
}

#[test]
fn compter_usages_apres_commandes_et_asset_retire() {
    let d = riche();
    assert_eq!(compter_usages_doc(&d.to_string(), "t").unwrap(), 3);
    assert_eq!(compter_usages_doc(&d.to_string(), "dalle").unwrap(), 2);
    assert_eq!(compter_usages_doc(&d.to_string(), "pierre").unwrap(), 2);
    assert_eq!(compter_usages_doc(&d.to_string(), "").unwrap(), 0);
    let apres = ok(&d, json!([{"type": "supprimer_calque", "id": "o2"}]))["document"].clone();
    assert_eq!(compter_usages_doc(&apres.to_string(), "t").unwrap(), 2);
}

// --- PNG (AD-battlemap-editeur-7) ---

fn encoder(l: u32, h: u32, couleur: ::png::ColorType, profondeur: ::png::BitDepth, donnees: &[u8], palette: Option<(&[u8], &[u8])>, trns: Option<&[u8]>) -> Vec<u8> {
    let mut sortie = vec![];
    {
        let mut e = ::png::Encoder::new(&mut sortie, l, h);
        e.set_color(couleur);
        e.set_depth(profondeur);
        if let Some((p, _)) = palette { e.set_palette(p.to_vec()); }
        if let Some(t) = trns { e.set_trns(t.to_vec()); } else if let Some((_, t)) = palette { if !t.is_empty() { e.set_trns(t.to_vec()); } }
        let mut w = e.write_header().unwrap();
        w.write_image_data(donnees).unwrap();
    }
    sortie
}

#[test]
fn alpha_png_couvre_les_types_de_png() {
    use ::png::{BitDepth::*, ColorType::*};
    // RGBA with one transparent pixel / RGBA fully opaque / RGB
    assert!(alpha_png(&encoder(2, 1, Rgba, Eight, &[1, 2, 3, 255, 1, 2, 3, 0], None, None)));
    assert!(!alpha_png(&encoder(2, 1, Rgba, Eight, &[1, 2, 3, 255, 1, 2, 3, 255], None, None)));
    assert!(!alpha_png(&encoder(1, 1, Rgb, Eight, &[1, 2, 3], None, None)));
    // greyscale + alpha, 16-bit RGBA
    assert!(alpha_png(&encoder(1, 1, GrayscaleAlpha, Eight, &[9, 0], None, None)));
    assert!(alpha_png(&encoder(1, 1, Rgba, Sixteen, &[0, 1, 0, 2, 0, 3, 0, 0], None, None)));
    // palette with a tRNS entry that is used / not used
    let pal: &[u8] = &[0, 0, 0, 255, 0, 0];
    assert!(alpha_png(&encoder(2, 1, Indexed, Eight, &[0, 1], Some((pal, &[255, 0])), None)));
    assert!(!alpha_png(&encoder(2, 1, Indexed, Eight, &[0, 0], Some((pal, &[255, 0])), None)));
    assert!(!alpha_png(&encoder(2, 1, Indexed, Eight, &[0, 1], Some((pal, &[])), None)));
    // rubbish and empty input
    assert!(!alpha_png(&[]));
    assert!(!alpha_png(&[0x89, b'P', b'N', b'G']));
}

fn decoder(octets: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut d = ::png::Decoder::new(std::io::Cursor::new(octets));
    d.set_transformations(::png::Transformations::EXPAND);
    let mut l = d.read_info().unwrap();
    let mut t = vec![0; l.output_buffer_size()];
    let i = l.next_frame(&mut t).unwrap();
    (i.width, i.height, t[..i.buffer_size()].to_vec())
}

#[test]
fn detourer_fond_uni_garde_les_poches_internes_et_les_couleurs_differentes() {
    use ::png::{BitDepth::*, ColorType::*};
    // 5×5: white background, a ring of red around a white pocket in the middle
    let (b, r) = ([255u8, 255, 255], [200u8, 0, 0]);
    let mut px = vec![];
    for y in 0..5 {
        for x in 0..5 {
            let anneau = (1..=3).contains(&x) && (1..=3).contains(&y);
            let centre = x == 2 && y == 2;
            let c = if anneau && !centre { r } else { b };
            px.extend_from_slice(&c);
        }
    }
    let (l, h, t) = decoder(&detourer_fond_uni_ok(&encoder(5, 5, Rgb, Eight, &px, None, None)));
    assert_eq!((l, h), (5, 5));
    let a = |x: usize, y: usize| t[(y * 5 + x) * 4 + 3];
    let c = |x: usize, y: usize| [t[(y * 5 + x) * 4], t[(y * 5 + x) * 4 + 1], t[(y * 5 + x) * 4 + 2]];
    for (x, y) in [(0, 0), (4, 4), (0, 2), (2, 0), (4, 2)] { assert_eq!(a(x, y), 0, "edge {x},{y}"); }
    assert_eq!(a(2, 2), 255, "the pocket enclosed by the ring is not background");
    assert_eq!(a(1, 1), 255);
    assert_eq!(c(1, 1), [200, 0, 0], "colours of kept pixels are untouched");
}

fn detourer_fond_uni_ok(b: &[u8]) -> Vec<u8> {
    battlemap_core::png::detourer_fond_uni(b).expect("readable png")
}

#[test]
fn detourer_fond_uni_sans_fond_uni_ne_rend_rien_transparent() {
    use ::png::{BitDepth::*, ColorType::*};
    // four different corners: no plain background
    let mut px = vec![128u8; 3 * 3 * 3];
    px[0..3].copy_from_slice(&[0, 0, 0]);
    px[6..9].copy_from_slice(&[255, 255, 255]);
    let sortie = detourer_fond_uni_ok(&encoder(3, 3, Rgb, Eight, &px, None, None));
    assert!(!alpha_png(&sortie));
    // a plain image of one colour: everything is background and goes transparent
    let sortie = detourer_fond_uni_ok(&encoder(3, 3, Rgb, Eight, &[7u8; 27], None, None));
    let (_, _, t) = decoder(&sortie);
    assert!(t.chunks(4).all(|p| p[3] == 0));
    // a 1×1 image does not panic
    let _ = battlemap_core::png::detourer_fond_uni(&encoder(1, 1, Rgb, Eight, &[1, 2, 3], None, None));
    // rubbish is an error, not a panic
    assert!(battlemap_core::png::detourer_fond_uni(&[]).is_err());
}

#[test]
fn detourer_fond_uni_est_idempotent_et_garde_la_transparence_existante() {
    use ::png::{BitDepth::*, ColorType::*};
    let mut px = vec![];
    for i in 0..16 { px.extend_from_slice(&if i == 5 { [9u8, 9, 9, 255] } else { [255, 255, 255, 255] }); }
    let une = detourer_fond_uni_ok(&encoder(4, 4, Rgba, Eight, &px, None, None));
    let deux = detourer_fond_uni_ok(&une);
    assert_eq!(decoder(&une).2, decoder(&deux).2);
    let (_, _, t) = decoder(&une);
    assert_eq!(t[5 * 4 + 3], 255);
    assert_eq!(t[0 * 4 + 3], 0);
}
