//! B-89 (recette, revérification): a comet melts into the sky; it is never a flat-edged rectangle.
//! Written from the need: the expected values are literal, none comes from the renderer.
use coeur::rendu::*;
use serde_json::json;

const COTES: [u32; 5] = [32, 64, 96, 200, 256];

fn comete(cote: u32) -> Vec<u8> {
    dessiner(&json!({ "type": "comete" }).to_string(), cote, VERSION_RENDU).unwrap()
}

fn alpha(o: &[u8], n: usize, x: usize, y: usize) -> u8 {
    o[(y * n + x) * 4 + 3]
}

#[test]
fn le_pourtour_de_la_comete_est_invisible_sur_toute_la_ceinture_externe() {
    for c in COTES {
        let n = c as usize;
        let o = comete(c);
        // the two outermost pixels of every side: nothing a viewer could see as an edge (alpha <= 4 of 255)
        for k in 0..2 {
            for i in 0..n {
                for (x, y) in [(i, k), (i, n - 1 - k), (k, i), (n - 1 - k, i)] {
                    assert!(alpha(&o, n, x, y) <= 4, "côté {c} : alpha {} en ({x},{y})", alpha(&o, n, x, y));
                }
            }
        }
    }
}

#[test]
fn l_opacite_de_la_comete_n_a_pas_de_marche_sur_ses_bords() {
    for c in COTES {
        let n = c as usize;
        let o = comete(c);
        // walking inwards from each side, two neighbouring pixels never differ by more than 64 of 255 in the outer eighth:
        // a flat frame is exactly such a step
        for i in 0..n {
            for d in 0..(n / 8) {
                for (a, b) in [((i, d), (i, d + 1)), ((i, n - 1 - d), (i, n - 2 - d)), ((d, i), (d + 1, i)), ((n - 1 - d, i), (n - 2 - d, i))] {
                    let pas = (alpha(&o, n, a.0, a.1) as i32 - alpha(&o, n, b.0, b.1) as i32).abs();
                    assert!(pas <= 64, "côté {c} : marche de {pas} entre {a:?} et {b:?}");
                }
            }
        }
    }
}

#[test]
fn la_comete_reste_dessinee_au_centre_a_chaque_taille() {
    for c in COTES {
        let n = c as usize;
        let o = comete(c);
        let visibles = o.chunks(4).filter(|p| p[3] > 40).count();
        assert!(visibles >= n, "côté {c} : seulement {visibles} pixels visibles");
    }
}
