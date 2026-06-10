use std::collections::HashMap;

use crate::snapshot::BasisEntry;

/// Compute cross-venue basis entries from available mark/index/spot prices.
///
/// Basis is expressed in basis points (bps): `(price_a - price_b) / price_b * 10_000`.
///
/// Pairs computed (when data exists for both sides):
/// - mark vs index (per venue)
/// - perp_price vs first available spot price (cross-venue)
pub fn compute_basis(
    mark_price: &HashMap<String, f64>,
    index_price: &HashMap<String, f64>,
    price_ticks: &HashMap<String, f64>, // venue → latest mid price
) -> Vec<BasisEntry> {
    let mut entries = Vec::new();

    // Mark vs index per venue.
    for (venue, &mark) in mark_price {
        if let Some(&idx) = index_price.get(venue) {
            if idx > 0.0 {
                let bps = (mark - idx) / idx * 10_000.0;
                entries.push(BasisEntry {
                    reference: format!("{venue}-mark-vs-index"),
                    basis_bps: bps,
                });
            }
        }
    }

    // Perp (mid price) vs spot (mid price from another venue if available).
    // Heuristic: compare venues that have a price tick; first venue is perp, rest are spot.
    let venues_with_price: Vec<&String> = price_ticks.keys().collect();
    if venues_with_price.len() >= 2 {
        let venue_a = venues_with_price[0];
        let price_a = price_ticks[venue_a];
        for venue_b in &venues_with_price[1..] {
            let price_b = price_ticks[*venue_b];
            if price_b > 0.0 {
                let bps = (price_a - price_b) / price_b * 10_000.0;
                entries.push(BasisEntry {
                    reference: format!("{venue_a}-vs-{venue_b}"),
                    basis_bps: bps,
                });
            }
        }
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basis_empty_when_no_data() {
        let e = compute_basis(&HashMap::new(), &HashMap::new(), &HashMap::new());
        assert!(e.is_empty());
    }

    #[test]
    fn mark_vs_index_basis_bps_correct() {
        let mut mark = HashMap::new();
        mark.insert("binance".into(), 50_100.0_f64);
        let mut idx = HashMap::new();
        idx.insert("binance".into(), 50_000.0_f64);
        let entries = compute_basis(&mark, &idx, &HashMap::new());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].reference, "binance-mark-vs-index");
        // (100 / 50_000) * 10_000 = 20 bps
        assert!(
            (entries[0].basis_bps - 20.0).abs() < 1e-6,
            "got {}",
            entries[0].basis_bps
        );
    }

    #[test]
    fn cross_venue_price_basis_computed() {
        let mut prices: HashMap<String, f64> = HashMap::new();
        prices.insert("binance".into(), 50_100.0);
        prices.insert("okx".into(), 50_000.0);
        let entries = compute_basis(&HashMap::new(), &HashMap::new(), &prices);
        assert_eq!(entries.len(), 1);
        assert!(
            (entries[0].basis_bps - 20.0).abs() < 1e-6,
            "got {}",
            entries[0].basis_bps
        );
    }
}
