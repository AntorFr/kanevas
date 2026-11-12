//! Example module: no product function, it proves the Rust -> Wasm path (AD-rust-8).
//! Copy it to start a new module.
use wasm_bindgen::prelude::*;

/// 32-bit FNV-1a over the UTF-8 bytes of `text`.
#[wasm_bindgen]
pub fn fnv1a(text: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in text.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

/// The crate version.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_vide_est_la_base_offset() {
        assert_eq!(fnv1a(""), 0x811c_9dc5);
    }

    #[test]
    fn fnv1a_vecteur_connu() {
        // Reference FNV-1a 32-bit vector.
        assert_eq!(fnv1a("a"), 0xe40c_292c);
    }

    #[test]
    fn fnv1a_kanevas_epingle() {
        assert_eq!(fnv1a("kanevas"), 3_485_111_814);
    }

    #[test]
    fn version_est_celle_du_crate() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
