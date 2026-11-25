//! Fingerprints of the version-2 drawing (AD-aspects-reliefs-1): one body per type, plus bodies that carry the
//! keys of the passes this slice touches, none of the slice's new keys. The hashes were taken from the code of
//! version 2, before any pass was modified; they move only with `VERSION_RENDU`, and the later tasks of the
//! slice replay them as they are. They are the SHA-256 of the RGBA bytes at 64 px.
use coeur::rendu::*;
use serde_json::json;

fn sha256(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut m = data.to_vec();
    m.push(0x80);
    while m.len() % 64 != 56 {
        m.push(0);
    }
    m.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for bloc in m.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([bloc[4 * i], bloc[4 * i + 1], bloc[4 * i + 2], bloc[4 * i + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

#[test]
fn sha256_de_reference() {
    assert_eq!(sha256(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

fn corps() -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = types().iter().map(|t| (t.to_string(), json!({ "type": t }).to_string())).collect();
    let mut plus = |nom: &str, t: &str, a: serde_json::Value| v.push((nom.to_string(), json!({ "type": t, "aspect": a }).to_string()));
    plus("tellurique nuages 1 halo 1 calottes", "tellurique", json!({ "nuages": 1.0, "halo": 1.0, "calottes": 0.6, "turbulence": 1.5 }));
    plus("tellurique mer 0.8 bord 1", "tellurique", json!({ "mer": 0.8, "bord": 1.0, "relief": 1.0, "brume": "#88aaff" }));
    plus("verrouillee nuages 0.5 halo 0.6", "verrouillee", json!({ "nuages": 0.5, "halo": 0.6 }));
    plus("glace halo 0.5", "glace", json!({ "halo": 0.5, "fissures": 0.6 }));
    plus("gazeuse tempete tache anneau", "gazeuse", json!({ "tempete": 0.8, "tache": { "latitude": 0.3 }, "anneau": { "opacite": 0.6 }, "halo": 0.5 }));
    plus("gazeuse bandes_couleurs", "gazeuse", json!({ "bandes_couleurs": ["#aa5522", "#ffddaa"], "turbulence": 0.4 }));
    v
}

/// `cle<TAB>sha` per body, in the order of `corps()`.
const EMPREINTES: &str = "\
naine_rouge	f5b76581f737a10e9d328c943bd9bc3c5dfc1d20ffb1a77bac33c5c5fb715652\n\
orange	2f7277240bb4d42ff6c1f62d4afb79c2f3ca571c22260ffc6137f7565fe7de97\n\
jaune_orange	d6296803268d8878716ab1db307abbbc6f19a69a4d8178dfb449ad2731374572\n\
jaune	41ec5b5de628d40e8a12cb39d54792aa39e05296f85474ecbce4e9620fbbd57c\n\
jaune_vert	f5c6b30b990c3964aaccef10d9fb11fdb2384e0a55e854d4173617c45637185a\n\
blanche	71174ff92a2cadf215ce82a2277398812f5661b20edfa3b6ed859a70b7488795\n\
geante_rouge	5eb0a1f80c590e746890644ab030c391648fb5d0925a85a19e9ff1b38f0f7799\n\
naine_blanche	4ea90ec097c560059e2cd38ab2835b111ab041583c46737c4e2b3417e907360f\n\
geante_bleue	b11a517823a24a948c6d33d8893636ec9149cc9599c980a7fb5a0d6b5aca62ca\n\
etoile	a8fe1780e8b20748f63d60137310477e525338057dd0163bb8d8adcb11c20a5f\n\
tellurique	6dfd721016f2dd410baf664a6b5dd9d0a9849f780f6b2676731e3bbbd643a03d\n\
verrouillee	374af39987873effaf999d0d7136829245e302802bf90c636bddbb13837ebc71\n\
glace	2a1aa67b0a4dc79edd2800d604c5ce35689ae734ae1b6806aea72fa92d4fee3b\n\
rocheux	99372869703183f86fd89039cf64c719ad282c5bc487854148712f417c4fa3db\n\
lave	88b89ab6a04cc087fc0af1c341eadc2ac9f285be79c85ebe8860b2bc09f2e3ac\n\
gazeuse	9b441b7151ed9da4861de3ec1938b435f10bddf07f190bbb120c874b24403716\n\
comete	eb45bbf6f61bc0bdd74c2e2119d0e8dd421dc726e0b9fe4b6e78c3137fea1a31\n\
nebuleuse	79baa282a1eac233b16e4cf8d899f736f4086eafe8a0c50860347f6ebaa825f7\n\
ceinture	089144d87aa16acff523ac14fa3168630e1061a1dcafd1ca196fcec788a8d2ab\n\
asteroides	571b212b53246cd4665dc2431a19cae802c1be67c339157586ad5fb041d9032e\n\
anomalie	ec89751a6429e8280bda4fa25cb55da89fa98ede3a35ee654b04101d87f67cb9\n\
tellurique nuages 1 halo 1 calottes	bc069e1a7cfe26fe83eb3da64501190895718a33a7202069364696bcd522b989\n\
tellurique mer 0.8 bord 1	b8d5a4c607258609d21f5482bdd6297208991f6cbdcf0a968a557ba7f6cf5163\n\
verrouillee nuages 0.5 halo 0.6	97bcf098f6bafd07873ea7412b6d5dd4181eff892478e0950d987ca79c501274\n\
glace halo 0.5	ae28c9eacce5300aae8531772117de3890c1c94abeaf99d6cde9402dca94ad62\n\
gazeuse tempete tache anneau	28806f130125e6a3f4a23643f5afa6ad4323782d45bddc9523774d0bd01c281b\n\
gazeuse bandes_couleurs	140c8937219212434f3daa66db3034aa40535a29147b26ab304a7c33e7624298";

#[test]
fn les_empreintes_de_la_version_2_ne_bougent_pas() {
    let sortie: Vec<String> = corps()
        .iter()
        .map(|(n, a)| format!("{n}\t{}", sha256(&dessiner(a, 64, VERSION_RENDU).unwrap())))
        .collect();
    assert_eq!(sortie.join("\n"), EMPREINTES);
}
