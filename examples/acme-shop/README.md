# Acme Shop (demo app under test)

A deliberately small static shop that the public Morrel demo verifies with real Kane CLI runs.
Live: https://morrel-demo-shop.vercel.app (Vercel project `morrel-demo-shop`).

- Demo login: `demo@acme.dev` / `demo1234` (client-side only, nothing real behind it).
- Behaviour lives in `app.js`; store rules (free-shipping threshold, coupons) in `shop.config.js`.
- `node build-pages.mjs` regenerates the HTML pages.
- Morrel records the commit of this directory (`MORREL_APP_DIR=examples/acme-shop`) on every run,
  so the board's commit column links runs to the exact version of the shop they observed.
