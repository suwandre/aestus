//! Raw payload hashing (P06-T013).
//!
//! Every raw market message is hashed before publish/storage. The hash lets
//! downstream consumers detect duplicates and proves message provenance.

use sha2::{Digest, Sha256};

/// Compute SHA-256 of `bytes` and return it formatted as `sha256:<hex>`.
/// Same format as in `fixtures/market/raw_events.json`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    format!("sha256:{}", hex::encode(hash))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_has_sha256_prefix() {
        let h = sha256_hex(b"hello");
        assert!(h.starts_with("sha256:"));
        assert_eq!(h.len(), 7 + 64); // "sha256:" + 64 hex chars
    }

    #[test]
    fn same_input_gives_same_hash() {
        assert_eq!(sha256_hex(b"test"), sha256_hex(b"test"));
    }

    #[test]
    fn different_inputs_differ() {
        assert_ne!(sha256_hex(b"a"), sha256_hex(b"b"));
    }

    #[test]
    fn known_hash() {
        // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let h = sha256_hex(b"");
        assert_eq!(
            h,
            "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
