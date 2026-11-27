//! The player filter (AD-156) and the usage count. The caller, who alone has the database, gives the context.
use crate::document::Document;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize, Debug, Default)]
#[serde(deny_unknown_fields)]
pub struct Contexte {
    #[serde(default)]
    pub assets_mj_seul: Vec<String>,
    #[serde(default)]
    pub assets_retires: Vec<String>,
    #[serde(default)]
    pub fiches_lisibles: Vec<String>,
}

/// What a player may read: no GM-only layer nor anything on it, no element of a GM-only or removed asset,
/// no `fiche_id` of a sheet she cannot read. Nothing in the result counts what was removed.
pub fn filtrer_pour_joueur(doc: &Document, ctx: &Contexte) -> Document {
    let cache: HashSet<&str> = ctx.assets_mj_seul.iter().chain(&ctx.assets_retires).map(String::as_str).collect();
    let lisibles: HashSet<&str> = ctx.fiches_lisibles.iter().map(String::as_str).collect();
    let mj: HashSet<&str> = doc.calques.iter().filter(|c| c.mj_seul).map(|c| c.id.as_str()).collect();
    let mut sortie = doc.clone();
    sortie.calques.retain(|c| !c.mj_seul);
    sortie.sols.retain(|s| !mj.contains(s.calque.as_str()));
    sortie.murs.retain(|m| !mj.contains(m.calque.as_str()));
    sortie.elements.retain(|e| !mj.contains(e.calque.as_str()) && !cache.contains(e.asset_id.as_str()));
    for e in &mut sortie.elements {
        if e.fiche_id.as_deref().is_some_and(|f| !lisibles.contains(f)) {
            e.fiche_id = None;
        }
    }
    sortie
}

/// How many floors, wall segments and elements of the document use the asset.
pub fn compter_usages(doc: &Document, asset_id: &str) -> usize {
    doc.sols.iter().filter(|s| s.asset_id == asset_id).count()
        + doc.murs.iter().filter(|m| m.asset_id == asset_id).count()
        + doc.elements.iter().filter(|e| e.asset_id == asset_id).count()
}
