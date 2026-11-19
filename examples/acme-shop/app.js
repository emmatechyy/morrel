(function () {
  const C = window.SHOP_CONFIG;
  const PRODUCTS = {
    "aero-mug": { name: "Aero Mug", price: 28 },
    "trail-bottle": { name: "Trail Bottle", price: 32 },
    "canvas-tote": { name: "Canvas Tote", price: 19 },
    "desk-lamp": { name: "Desk Lamp", price: 64 },
    "field-notebook": { name: "Field Notebook", price: 12 },
    "wool-socks": { name: "Wool Socks", price: 16 },
  };
  const $ = (s, r = document) => r.querySelector(s);
  const money = (n) => "$" + n.toFixed(2);
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  };

  // Theme: persisted in localStorage, applied before paint by the inline snippet in each page.
  const theme = () => store.get("acme.theme", "light");

  function header() {
    const user = store.get("acme.user", null);
    const count = store.get("acme.cart", []).length;
    const el = document.createElement("header");
    el.innerHTML = `<div class="bar"><a class="logo" href="/">Acme Shop</a>
      <nav><a href="/">Products</a><a href="/search">Search</a><a href="/pricing">Pricing</a><a href="/settings">Settings</a></nav>
      <div class="right">${user ? `<a href="/account">${user.name}</a>` : `<a href="/login">Sign in</a>`}
      <a class="cart" href="/checkout" aria-label="Cart">Cart <span class="badge" data-testid="cart-badge">${count}</span></a></div></div>`;
    document.body.prepend(el);
    const f = document.createElement("footer");
    f.textContent = "Acme Shop is a demo app used to exercise Morrel memories with Kane CLI. Nothing is for sale.";
    document.body.append(f);
  }

  const pages = {
    home() {
      $("#grid").innerHTML = Object.entries(PRODUCTS).map(([slug, p]) =>
        `<a class="card" href="/products/${slug}"><div class="ph"></div><div>${p.name}</div><div class="price muted">${money(p.price)}</div></a>`).join("");
    },
    product() {
      const slug = document.body.dataset.slug, p = PRODUCTS[slug];
      $("#add").addEventListener("click", () => {
        const cart = store.get("acme.cart", []); cart.push(slug); store.set("acme.cart", cart);
        $("[data-testid=cart-badge]").textContent = cart.length;
        $("#added").textContent = `${p.name} added to cart.`;
      });
    },
    login() {
      $("#login").addEventListener("submit", (e) => {
        e.preventDefault();
        const email = $("#email").value.trim().toLowerCase(), pw = $("#password").value;
        if (email === "demo@acme.dev" && pw === "demo1234") {
          store.set("acme.user", { email, name: "Demo" }); location.href = "/account";
        } else $("#err").textContent = "Invalid email or password.";
      });
    },
    account() {
      const u = store.get("acme.user", null);
      if (!u) { location.href = "/login"; return; }
      $("#hello").textContent = `Welcome back, ${u.name}`;
      $("#signout").addEventListener("click", () => { localStorage.removeItem("acme.user"); location.href = "/"; });
    },
    search() {
      const run = () => {
        const q = $("#q").value.trim().toLowerCase();
        if (!q) { $("#results").innerHTML = ""; return; }
        const hits = Object.entries(PRODUCTS).filter(([, p]) => p.name.toLowerCase().includes(q));
        $("#results").innerHTML = hits.length
          ? `<div class="grid">${hits.map(([s, p]) => `<a class="card" href="/products/${s}">${p.name}<div class="muted">${money(p.price)}</div></a>`).join("")}</div>`
          : `<div class="empty"><strong>No products found</strong><br>Nothing matches “${q.replace(/</g, "&lt;")}”. Try a different word.</div>`;
      };
      $("#searchform").addEventListener("submit", (e) => { e.preventDefault(); run(); });
    },
    checkout() {
      // Uses the cart if it has items, otherwise a fixed sample order so the page is testable on its own.
      let cart = store.get("acme.cart", []);
      const sample = cart.length === 0;
      if (sample) cart = ["trail-bottle", "aero-mug"];
      let coupon = null;
      const render = () => {
        const subtotal = cart.reduce((s, k) => s + PRODUCTS[k].price, 0);
        const discount = coupon ? +(subtotal * coupon.percentOff / 100).toFixed(2) : 0;
        const shipping = subtotal >= C.freeShippingThreshold ? 0 : C.flatShipping;
        $("#lines").innerHTML = cart.map((k) => `<div class="row"><span>${PRODUCTS[k].name}</span><span class="price">${money(PRODUCTS[k].price)}</span></div>`).join("") +
          `<div class="row"><span>Subtotal</span><span class="price">${money(subtotal)}</span></div>` +
          (coupon ? `<div class="row ok"><span>Discount (${coupon.code})</span><span class="price">-${money(discount)}</span></div>` : "") +
          `<div class="row"><span>Shipping</span><span class="price">${shipping === 0 ? "Free" : money(shipping)}</span></div>` +
          `<div class="row total"><span>Total</span><span class="price">${money(subtotal - discount + shipping)}</span></div>`;
        $("#shipnote").textContent = `Free shipping on orders over $${C.freeShippingThreshold}.`;
        $("#sample").hidden = !sample;
      };
      $("#couponform").addEventListener("submit", (e) => {
        e.preventDefault();
        const code = $("#code").value.trim().toUpperCase(), c = C.coupons[code];
        const msg = $("#couponmsg");
        if (!c) { coupon = null; msg.className = "notice bad"; msg.textContent = `${code || "That code"} is not a valid coupon.`; }
        else if (new Date(c.expires) < new Date()) { coupon = null; msg.className = "notice bad"; msg.textContent = `${code} has expired.`; }
        else { coupon = { code, ...c }; msg.className = "notice ok"; msg.textContent = `${code} applied: ${c.percentOff}% off your subtotal.`; }
        render();
      });
      render();
    },
    pricing() {
      const plans = [["Starter", 0], ["Pro", 20], ["Team", 50]];
      const draw = (annual) => {
        $("#plans").innerHTML = plans.map(([n, m]) => {
          const price = m === 0 ? "Free" : annual ? `$${(m * 12 * 0.8).toFixed(0)}/yr` : `$${m}/mo`;
          return `<div class="card plan"><h3>${n}</h3><div class="price">${price}${annual && m ? `<span class="save">Save 20%</span>` : ""}</div></div>`;
        }).join("");
        $("#monthly").setAttribute("aria-pressed", !annual); $("#annual").setAttribute("aria-pressed", annual);
      };
      $("#monthly").addEventListener("click", () => draw(false));
      $("#annual").addEventListener("click", () => draw(true));
      draw(false);
    },
    settings() {
      const show = () => { $("#current").textContent = `Theme: ${theme() === "dark" ? "Dark" : "Light"}`; };
      document.querySelectorAll("[data-theme-choice]").forEach((b) => b.addEventListener("click", () => {
        store.set("acme.theme", b.dataset.themeChoice);
        document.documentElement.dataset.theme = b.dataset.themeChoice; show();
      }));
      show();
    },
    forgot() {
      $("#forgot").addEventListener("submit", (e) => {
        e.preventDefault();
        const email = $("#femail").value.trim();
        if (!email.includes("@")) { $("#ferr").textContent = "Enter a valid email address."; return; }
        $("#forgot").hidden = true;
        $("#sent").hidden = false;
        $("#sentto").textContent = email;
      });
    },
  };

  header();
  pages[document.body.dataset.page]?.();
})();
