//! `battlemap-core` (AD-153): the map model, shared by the browser and the server. Pure functions over
//! JSON text and bytes: no disk, no clock, no network. Rules live here and nowhere else (AD-battlemap-editeur-9).
pub mod commandes;
pub mod document;
pub mod filtre;
pub mod png;
pub mod table;

use document::{Document, Erreur};
use wasm_bindgen::prelude::*;

fn json<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_string(v).expect("serializable")
}

fn erreur_json(e: &Erreur) -> String {
    format!("{{\"ok\":false,{}", &json(e)[1..])
}

fn lire(document: &str) -> Result<Document, Erreur> {
    let doc: Document = serde_json::from_str(document).map_err(|_| Erreur::new("document_invalide"))?;
    doc.valider()?;
    Ok(doc)
}

/// The fixed limits of AD-163, for the callers that show them.
pub fn limites_json() -> String {
    use document::*;
    json(&serde_json::json!({
        "largeur_max": LARGEUR_MAX, "hauteur_max": HAUTEUR_MAX, "elements_max": ELEMENTS_MAX,
        "calques_max": CALQUES_MAX, "document_octets_max": DOCUMENT_OCTETS_MAX,
        "echelle_min": ECHELLE_MIN, "echelle_max": ECHELLE_MAX,
    }))
}

/// The document of a new map: « Sol », « Murs », « Objets », none GM-only, no content.
pub fn carte_vide_json(largeur: u32, hauteur: u32) -> Result<String, Erreur> {
    Document::vide(largeur, hauteur).map(|d| json(&d))
}

/// `{"ok":true,"document":…,"inverses":[…]}` or `{"ok":false,"code":…,"champ"?:…,"index"?:…}`.
pub fn appliquer_lot_json(document: &str, lot: &str) -> String {
    let resultat = (|| {
        let doc = lire(document)?;
        let lot: Vec<commandes::Commande> = serde_json::from_str(lot).map_err(|_| Erreur::new("commande_invalide"))?;
        commandes::appliquer_lot(&doc, &lot)
    })();
    match resultat {
        Ok((doc, inverses)) => format!("{{\"ok\":true,\"document\":{},\"inverses\":{}}}", json(&doc), json(&inverses)),
        Err(e) => erreur_json(&e),
    }
}

pub fn valider_document_json(document: &str) -> String {
    match lire(document) {
        Ok(_) => "{\"ok\":true}".to_string(),
        Err(e) => erreur_json(&e),
    }
}

pub fn filtrer_pour_joueur_json(document: &str, contexte: &str) -> Result<String, Erreur> {
    let doc = lire(document)?;
    let ctx: filtre::Contexte = serde_json::from_str(contexte).map_err(|_| Erreur::new("contexte_invalide"))?;
    Ok(json(&filtre::filtrer_pour_joueur(&doc, &ctx)))
}

pub fn compter_usages_doc(document: &str, asset_id: &str) -> Result<u32, Erreur> {
    Ok(filtre::compter_usages(&lire(document)?, asset_id) as u32)
}

/// The state of a new table (nothing revealed): `{"schema":1,"pions":[],"brouillard":…,"vue":null,"calques_masques":[]}`.
pub fn etat_vide_json(largeur: u32, hauteur: u32) -> Result<String, Erreur> {
    table::Etat::vide(largeur, hauteur).map(|e| json(&e))
}

fn lire_etat(etat: &str) -> Result<table::Etat, Erreur> {
    serde_json::from_str(etat).map_err(|_| Erreur::new("etat_invalide"))
}

/// `{"ok":true,"etat":…}` or `{"ok":false,"code":…,"index"?:…}`: the batch is applied whole or refused whole.
pub fn appliquer_table_json(document: &str, etat: &str, lot: &str, contexte: &str) -> String {
    let resultat = (|| {
        let doc = lire(document)?;
        let etat = lire_etat(etat)?;
        let ctx: table::ContexteTable = serde_json::from_str(contexte).map_err(|_| Erreur::new("contexte_invalide"))?;
        let lot: Vec<table::CommandeTable> = serde_json::from_str(lot).map_err(|_| Erreur::new("commande_invalide"))?;
        table::appliquer_lot(&doc, &etat, &lot, &ctx)
    })();
    match resultat {
        Ok(e) => format!("{{\"ok\":true,\"etat\":{}}}", json(&e)),
        Err(e) => erreur_json(&e),
    }
}

/// What a player reads of a table: `{"document":…,"pions":[…],"brouillard":…,"vue":…}`.
pub fn vue_joueur_json(document: &str, etat: &str, contexte: &str) -> Result<String, Erreur> {
    let doc = lire(document)?;
    let etat = lire_etat(etat)?;
    let ctx: table::ContexteVue = serde_json::from_str(contexte).map_err(|_| Erreur::new("contexte_invalide"))?;
    table::vue_joueur(&doc, &etat, &ctx).map(|v| json(&v))
}

/// The state for a map resized from `largeur_avant × hauteur_avant` to `largeur × hauteur`, same reply shape as `appliquer_table_json`.
pub fn redimensionner_etat_json(etat: &str, largeur_avant: u32, hauteur_avant: u32, largeur: u32, hauteur: u32, contexte: &str) -> String {
    let resultat = (|| {
        let etat = lire_etat(etat)?;
        let ctx: table::ContexteTable = serde_json::from_str(contexte).map_err(|_| Erreur::new("contexte_invalide"))?;
        table::redimensionner_etat(&etat, (largeur_avant, hauteur_avant), largeur, hauteur, &ctx)
    })();
    match resultat {
        Ok(e) => format!("{{\"ok\":true,\"etat\":{}}}", json(&e)),
        Err(e) => erreur_json(&e),
    }
}

fn code(e: Erreur) -> String {
    e.code.to_string()
}

#[wasm_bindgen(js_name = limites)]
pub fn limites() -> String {
    limites_json()
}

#[wasm_bindgen(js_name = carte_vide)]
pub fn carte_vide(largeur: u32, hauteur: u32) -> Result<String, String> {
    carte_vide_json(largeur, hauteur).map_err(code)
}

#[wasm_bindgen(js_name = appliquerLot)]
pub fn appliquer_lot(document: &str, lot: &str) -> String {
    appliquer_lot_json(document, lot)
}

#[wasm_bindgen(js_name = validerDocument)]
pub fn valider_document(document: &str) -> String {
    valider_document_json(document)
}

#[wasm_bindgen(js_name = filtrerPourJoueur)]
pub fn filtrer_pour_joueur(document: &str, contexte: &str) -> Result<String, String> {
    filtrer_pour_joueur_json(document, contexte).map_err(code)
}

#[wasm_bindgen(js_name = compterUsages)]
pub fn compter_usages(document: &str, asset_id: &str) -> Result<u32, String> {
    compter_usages_doc(document, asset_id).map_err(code)
}

#[wasm_bindgen(js_name = alphaPng)]
pub fn alpha_png(octets: &[u8]) -> bool {
    png::alpha_png(octets)
}

#[wasm_bindgen(js_name = detourerFondUni)]
pub fn detourer_fond_uni(octets: &[u8]) -> Result<Vec<u8>, String> {
    png::detourer_fond_uni(octets)
}

#[wasm_bindgen(js_name = etatVide)]
pub fn etat_vide(largeur: u32, hauteur: u32) -> Result<String, String> {
    etat_vide_json(largeur, hauteur).map_err(code)
}

#[wasm_bindgen(js_name = appliquerTable)]
pub fn appliquer_table(document: &str, etat: &str, lot: &str, contexte: &str) -> String {
    appliquer_table_json(document, etat, lot, contexte)
}

#[wasm_bindgen(js_name = vueJoueur)]
pub fn vue_joueur(document: &str, etat: &str, contexte: &str) -> Result<String, String> {
    vue_joueur_json(document, etat, contexte).map_err(code)
}

#[wasm_bindgen(js_name = redimensionnerEtat)]
pub fn redimensionner_etat(etat: &str, largeur_avant: u32, hauteur_avant: u32, largeur: u32, hauteur: u32, contexte: &str) -> String {
    redimensionner_etat_json(etat, largeur_avant, hauteur_avant, largeur, hauteur, contexte)
}
