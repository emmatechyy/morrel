// Store configuration. Morrel memories about this shop are verified against the deployed site.
window.SHOP_CONFIG = {
  // Product decision (Nov 2026): free shipping now starts at $75.
  freeShippingThreshold: 75,
  flatShipping: 6.95,
  coupons: {
    // DELIBERATE DEMO REGRESSION: the expiry year was mistyped while editing this file, so SAVE10
    // is rejected as expired. Kane catches it; see memory checkout-save10-discount on the board.
    SAVE10: { percentOff: 10, expires: "2025-12-31" },
  },
};
