//! Tests of the `reglages` module from the exit criterion of the task (AD-reglages-1, AD-reglages-2, AD-reglages-6):
//! the defaults give the fixtures back, the refusals are values, the override moves only its key, a comet frequency
//! of 1 gives a comet to each fixture system, an unknown version is refused, the star draw takes no settings.
use coeur::edition::types_astre;
use coeur::generation::*;
use coeur::reglages::*;
use serde_json::{json, Value};

const SYSTEMES: &str = include_str!("fixtures/generation-systemes.json");
const SORTIE: &str = include_str!("fixtures/generation-sortie-systemes.json");

fn entrees() -> Vec<Value> {
    serde_json::from_str::<Value>(SYSTEMES).unwrap()["systemes"].as_array().unwrap().iter().map(|s| s["entree"].clone()).collect()
}

fn tire(e: &Value, rg: &Reglages) -> Systeme {
    tirer_systeme(e["q"].as_i64().unwrap() as i32, e["r"].as_i64().unwrap() as i32, e["taille"].as_f64().unwrap(), e["lettre"].as_str().unwrap(), 1, rg).unwrap()
}

fn refus(v: &Value) -> (&str, &str) {
    assert_eq!(v["ok"], json!(false), "{v}");
    (v["champ"].as_str().unwrap(), v["borne"].as_str().unwrap())
}

/// Panne : les défauts dérivent des valeurs d'-systeme et le tirage change d'octet.
#[test]
fn le_defaut_redonne_les_octets_des_fixtures() {
    let f: Value = serde_json::from_str(SORTIE).unwrap();
    let rg = defaut(1).unwrap();
    let mut vus = 0;
    for s in f["systemes"].as_array().unwrap() {
        let e = &s["entree"];
        assert_eq!(serde_json::to_string(&tire(e, &rg)).unwrap(), s["json"].as_str().unwrap(), "{e}");
        vus += 1;
    }
    assert_eq!(vus, 6);
}

/// Panne : une fréquence hors de [0, 1] passe, ou le message ne dit pas la borne.
#[test]
fn une_frequence_de_2_est_refusee_avec_son_champ_et_sa_borne() {
    let v = valider(1, r#"{"frequences":{"comete":2}}"#);
    assert_eq!(refus(&v), ("frequences.comete", "Entre 0 et 1."));
    assert_eq!(v["message"], "Entre 0 et 1.");
    assert_eq!(refus(&valider(1, r#"{"frequences":{"zone":-0.1}}"#)).1, "Entre 0 et 1.");
}

/// Panne : une clé inconnue est ignorée en silence (le réglage ne ferait rien).
#[test]
fn cle_inconnue_refusee_a_chaque_niveau() {
    assert_eq!(refus(&valider(1, r#"{"licorne":1}"#)).0, "licorne");
    assert_eq!(refus(&valider(1, r#"{"frequences":{"licorne":1}}"#)).0, "frequences.licorne");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"M":{"planetes":[1,2]}}}"#)).0, "par_classe.M");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"orange":{"licorne":[1,2]}}}"#)).0, "par_classe.orange.licorne");
}

/// Panne : un minimum au-dessus du maximum est accepté ; une valeur hors borne aussi.
#[test]
fn minimum_au_dessus_du_maximum_et_hors_bornes_refuses() {
    let v = valider(1, r#"{"par_classe":{"jaune":{"planetes":[5,2]}}}"#);
    assert_eq!(refus(&v).0, "par_classe.jaune.planetes");
    assert_eq!(v["message"], "Le minimum dépasse le maximum.");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"planetes":[0,13]}}}"#)), ("par_classe.jaune.planetes", "Entre 0 et 12."));
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"ceintures":[0,3]}}}"#)).1, "Entre 0 et 2.");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"lunes":[-1,3]}}}"#)).1, "Entre 0 et 8.");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"total":[0,17]}}}"#)).1, "Entre 0 et 16.");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"planetes":[1.5,3]}}}"#)).0, "par_classe.jaune.planetes");
    assert_eq!(refus(&valider(1, r#"{"par_classe":{"jaune":{"planetes":[1]}}}"#)).0, "par_classe.jaune.planetes");
}

/// Panne : un JSON trop gros est analysé (ou fait paniquer) au lieu d'être refusé d'emblée ; JSON cassé ou de mauvaise forme.
#[test]
fn json_trop_gros_ou_mal_forme_refuse_sans_panique() {
    let gros = format!(r#"{{"frequences":{{"comete":0.5}}{}}}"#, " ".repeat(9 * 1024));
    assert!(gros.len() > 9 * 1024);
    assert_eq!(refus(&valider(1, &gros)).0, "valeurs");
    assert!(fusionner(1, &gros).is_err());
    let limite = format!(r#"{{"frequences":{{"comete":0.5}}{}}}"#, " ".repeat(8 * 1024 - 29));
    assert_eq!(limite.len(), 8 * 1024);
    assert_eq!(valider(1, &limite)["ok"], json!(true));
    for mauvais in ["", "{", "null", "[]", "3", r#"{"frequences":3}"#, r#"{"frequences":{"comete":"a"}}"#, r#"{"par_classe":[]}"#, r#"{"par_classe":{"jaune":3}}"#] {
        assert_eq!(valider(1, mauvais)["ok"], json!(false), "{mauvais}");
        assert!(fusionner(1, mauvais).is_err(), "{mauvais}");
    }
}

/// Panne : `{}` ne rend plus le défaut, ou un objet partiel déplace une autre clé que la sienne.
#[test]
fn fusionner_est_le_defaut_et_ne_deplace_que_sa_cle() {
    let defaut_v = serde_json::to_value(defaut(1).unwrap()).unwrap();
    assert_eq!(serde_json::to_value(fusionner(1, "{}").unwrap()).unwrap(), defaut_v);
    let f = serde_json::to_value(fusionner(1, r#"{"frequences":{"comete":0.9},"par_classe":{"orange":{"lunes":[1,2]}}}"#).unwrap()).unwrap();
    let mut attendu = defaut_v.clone();
    attendu["frequences"]["comete"] = json!(0.9);
    attendu["par_classe"]["orange"]["lunes"] = json!([1, 2]);
    assert_eq!(f, attendu);
    // canonical form: only what differs from the defaults
    let c = valider(1, &format!(r#"{{"frequences":{{"comete":0.9,"zone":{}}}}}"#, defaut_v["frequences"]["zone"]));
    assert_eq!(c["canonique"], json!({"frequences":{"comete":0.9}}));
    assert_eq!(valider(1, "{}")["canonique"], json!({}));
}

/// Panne : le réglage de comète n'atteint pas le tirage (ou le défaut n'est plus tenu par les bornes).
#[test]
fn la_frequence_de_comete_decide_de_la_comete_de_chaque_systeme() {
    let es = entrees();
    assert_eq!(es.len(), 20);
    for (f, attendu) in [(1.0, 20), (0.0, 0)] {
        let rg = fusionner(1, &format!(r#"{{"frequences":{{"comete":{f}}}}}"#)).unwrap();
        let n = es.iter().filter(|e| tire(e, &rg).astres.iter().any(|a| a.genre == "comete")).count();
        assert_eq!(n, attendu, "comete={f}");
    }
}

/// Panne : le défaut ne tient pas dans ses propres bornes (le MJ ne pourrait pas le rétablir).
#[test]
fn le_defaut_est_valide_et_tient_dans_ses_bornes() {
    let d = serde_json::to_string(&defaut(1).unwrap()).unwrap();
    let v = valider(1, &d);
    assert_eq!(v["ok"], json!(true), "{v}");
    assert_eq!(v["canonique"], json!({}));
    assert_eq!(defaut(1).unwrap().par_classe.len(), CLASSES.len());
    assert_eq!(serde_json::to_string(&fusionner(1, &d).unwrap()).unwrap(), d);
}

/// Panne : une version inconnue passe par un des chemins.
#[test]
fn version_inconnue_refusee_partout() {
    assert_eq!(VERSIONS_GENERATEUR, [1]);
    assert_eq!(VERSION_GENERATEUR_COURANTE, 1);
    for v in [0, 2, u32::MAX] {
        assert_eq!(valider(v, "{}")["ok"], json!(false));
        assert!(defaut(v).is_err());
        assert!(fusionner(v, "{}").is_err());
        assert!(tirer_systeme(0, 0, 0.8, "K", v, &defaut(1).unwrap()).is_err());
    }
}

/// Panne : le tirage des étoiles prendrait un réglage — AD-reglages-3. On lit la signature exportée.
#[test]
fn le_tirage_des_etoiles_ne_prend_aucun_reglage() {
    let source = include_str!("../src/generation.rs");
    for sig in ["pub fn tirer_bloc(", "pub fn tirer_bloc_wasm("] {
        let debut = source.find(sig).unwrap_or_else(|| panic!("{sig}"));
        let fin = debut + source[debut..].find(')').unwrap();
        let args = &source[debut..fin];
        assert!(!args.to_lowercase().contains("reglage") && !args.contains("valeurs") && !args.contains("Reglages"), "{args}");
    }
}

/// Panne : un défaut d'aspect est refusé par son propre validateur, ou une valeur fausse passe.
#[test]
fn valider_aspect_type_accepte_les_defauts_et_refuse_le_reste() {
    let cat = types_catalogue();
    let cat = cat.as_object().unwrap();
    assert!(!cat.is_empty());
    for (t, a) in cat {
        let v = valider_aspect_type(t, &a.to_string());
        assert_eq!(v["ok"], json!(true), "{t}: {v} (défaut {a})");
    }
    let t = "tellurique";
    assert_eq!(valider_aspect_type(t, "{}")["ok"], json!(true));
    assert_eq!(refus(&valider_aspect_type(t, r#"{"licorne":1}"#)).0, "licorne");
    for mauvais in [r##"{"palette":["#12"]}"##, r##"{"palette":["#12345g"]}"##, r##"{"palette":["12"]}"##] {
        let v = valider_aspect_type("gazeuse", mauvais);
        assert_eq!(v["ok"], json!(false), "{mauvais}: {v}");
        assert!(v["message"].as_str().unwrap().contains("#rrggbb"), "{v}");
    }
    assert_eq!(refus(&valider_aspect_type(t, r#"{"mer":2}"#)), ("mer", "Entre 0 et 1."));
    assert_eq!(valider_aspect_type("licorne", "{}")["ok"], json!(false));
    let gros = format!(r#"{{"mer":0.5{}}}"#, " ".repeat(4 * 1024));
    assert_eq!(refus(&valider_aspect_type(t, &gros)).0, "parametres");
    for mauvais in ["", "[", "null", "3"] {
        assert_eq!(valider_aspect_type(t, mauvais)["ok"], json!(false), "{mauvais}");
    }
}

/// Panne : un type de `types_astre` n'a pas de paramètres par défaut dans le catalogue.
#[test]
fn types_catalogue_rend_chaque_type_de_types_astre() {
    let cat = types_catalogue();
    for genre in ["etoile", "planete", "lune", "comete"] {
        for t in types_astre(genre).unwrap() {
            assert!(cat.get(t).is_some_and(Value::is_object), "{genre}/{t}");
        }
    }
}
