"use client";

import { useEffect, useMemo, useState } from "react";

const PLATFORMS = [
  { id: "blinkit", label: "Blinkit", logo: "/logos/blinkit.png" },
  { id: "instamart", label: "Instamart", logo: "/logos/instamart.png" },
  { id: "zepto", label: "Zepto", logo: "/logos/zepto.png" },
  { id: "bigbasket", label: "BigBasket", logo: "/logos/bigbasket.png" },
];

const LOC_KEY = "compari5.location";
const LIST_KEY = "compari5.list";
const STAPLES_KEY = "compari5.staples";
const HISTORY_KEY = "compari5.priceHistory";

const DEFAULT_STAPLES = [
  "amul milk",
  "brown bread",
  "eggs",
  "banana",
  "maggi",
  "atta",
];

const SORT_OPTIONS = [
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
  { id: "save_desc", label: "Biggest saving on MRP" },
  { id: "name_asc", label: "Name A to Z" },
];

function formatTime(ts) {
  if (!ts) return "not yet";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "recently";
  }
}

function openProduct(url, name, platform) {
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const q = encodeURIComponent(name || "");
  const fallback = {
    blinkit: `https://blinkit.com/s/?q=${q}`,
    instamart: `https://www.swiggy.com/instamart/search?custom_back=true&query=${q}`,
    zepto: `https://www.zeptonow.com/search?query=${q}`,
    bigbasket: `https://www.bigbasket.com/ps/?q=${q}`,
  };
  window.open(fallback[platform], "_blank", "noopener,noreferrer");
}

function saveAmount(prod) {
  if (prod.mrp && prod.price != null && prod.mrp > prod.price) {
    return prod.mrp - prod.price;
  }
  return 0;
}

function applySortFilter(products, sortBy, filters) {
  let list = Array.isArray(products) ? [...products] : [];

  if (filters.inStock) {
    list = list.filter(
      (p) => p.availableQuantity == null || Number(p.availableQuantity) > 0
    );
  }
  if (filters.hasDiscount) {
    list = list.filter((p) => saveAmount(p) > 0);
  }
  if (filters.maxPrice !== "" && Number.isFinite(Number(filters.maxPrice))) {
    const max = Number(filters.maxPrice);
    list = list.filter((p) => p.price != null && p.price <= max);
  }
  if (filters.brand.trim()) {
    const b = filters.brand.trim().toLowerCase();
    list = list.filter(
      (p) =>
        String(p.brand || "").toLowerCase().includes(b) ||
        String(p.name || "").toLowerCase().includes(b)
    );
  }

  list.sort((a, b) => {
    if (sortBy === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
    if (sortBy === "save_desc") return saveAmount(b) - saveAmount(a);
    if (sortBy === "name_asc") {
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    return (a.price ?? Infinity) - (b.price ?? Infinity);
  });

  return list;
}

export default function Home() {
  const [areaQuery, setAreaQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [location, setLocation] = useState(null);
  const [productQuery, setProductQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [list, setList] = useState([]);
  const [staples, setStaples] = useState(DEFAULT_STAPLES);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [auth, setAuth] = useState({
    swiggy: false,
    zepto: false,
    swiggySyncedAt: null,
    zeptoSyncedAt: null,
  });
  const [pinNote, setPinNote] = useState("");
  const [sortBy, setSortBy] = useState("price_asc");
  const [filters, setFilters] = useState({
    inStock: false,
    hasDiscount: false,
    brand: "",
    maxPrice: "",
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  async function refreshAuth() {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      setAuth({
        swiggy: !!data.swiggy,
        zepto: !!data.zepto,
        swiggySyncedAt: data.swiggySyncedAt || null,
        zeptoSyncedAt: data.zeptoSyncedAt || null,
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const loc = JSON.parse(localStorage.getItem(LOC_KEY) || "null");
      const items = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
      const pins = JSON.parse(localStorage.getItem(STAPLES_KEY) || "null");
      const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (loc) {
        setLocation(loc);
        setAreaQuery(loc.label?.split(",").slice(0, 2).join(",") || "");
      }
      if (Array.isArray(items)) setList(items);
      if (Array.isArray(pins) && pins.length) setStaples(pins);
      if (Array.isArray(hist)) setHistory(hist.slice(0, 40));
    } catch {}
    refreshAuth();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      refreshAuth();
      showToast(
        params.get("connected") === "swiggy"
          ? "Swiggy signed in"
          : "Zepto signed in"
      );
      window.history.replaceState({}, "", "/");
    }
    if (params.get("auth_error")) {
      setError(decodeURIComponent(params.get("auth_error")));
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (location) localStorage.setItem(LOC_KEY, JSON.stringify(location));
  }, [location]);

  useEffect(() => {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  }, [list]);

  useEffect(() => {
    localStorage.setItem(STAPLES_KEY, JSON.stringify(staples));
  }, [staples]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
  }, [history]);

  async function geocode() {
    setError("");
    setLoadingGeo(true);
    setPlaces([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(areaQuery)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find that area");
      setPlaces(data.places || []);
      if (!data.places?.length) {
        setError(
          data.warning ||
            "No matching areas found. Try a neighbourhood and city name."
        );
      } else if (data.warning && data.provider === "nominatim") {
        setError(data.warning);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingGeo(false);
    }
  }

  function recordHistory(query, platformResults) {
    const stamp = Date.now();
    const entries = [];
    for (const p of PLATFORMS) {
      const products = platformResults?.[p.id]?.products || [];
      const priced = products.filter((x) => x.price != null);
      if (!priced.length) continue;
      const best = priced.reduce((a, b) => (a.price <= b.price ? a : b));
      entries.push({
        ts: stamp,
        query,
        platform: p.id,
        price: best.price,
        name: best.name,
      });
    }
    if (!entries.length) return;
    setHistory((prev) => [...entries, ...prev].slice(0, 40));
  }

  async function search(forcedQuery) {
    const q = (forcedQuery ?? productQuery).trim();
    if (!location) {
      setError("Choose a delivery area first.");
      return;
    }
    if (q.length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setProductQuery(q);
    setError("");
    setPinNote("");
    setLoadingSearch(true);
    setResults(null);
    try {
      const params = new URLSearchParams({
        q,
        lat: String(location.lat),
        lng: String(location.lng),
        label: location.label || "",
      });
      if (location.city) params.set("city", location.city);
      if (location.postalCode) params.set("postalCode", location.postalCode);
      if (location.locality) params.set("locality", location.locality);

      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results);
      recordHistory(q, data.results);
      const meta = data.results?.instamart?.meta;
      if (meta?.addressCreated) {
        setPinNote(
          `Instamart is using a new delivery pin saved as ${meta.addressLabel || "Compari5"}. It matches the area you selected above.`
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSearch(false);
    }
  }

  function addItem(product, query = productQuery) {
    setList((prev) => {
      const key = `${product.platform}:${product.id}`;
      const existing = prev.find((x) => x.key === key);
      if (existing) {
        return prev.map((x) =>
          x.key === key ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [
        ...prev,
        {
          key,
          platform: product.platform,
          id: product.id,
          name: product.name,
          quantity: product.quantity,
          price: product.price,
          mrp: product.mrp,
          url: product.url,
          image: product.image,
          eta: product.eta,
          query: query || product.name,
          qty: 1,
        },
      ];
    });
    showToast("Added to your basket");
  }

  function addBestFromResults() {
    if (!results) return;
    let best = null;
    for (const p of PLATFORMS) {
      const products = applySortFilter(
        results[p.id]?.products || [],
        "price_asc",
        filters
      );
      for (const prod of products) {
        if (prod.price == null) continue;
        if (!best || prod.price < best.price) best = prod;
      }
    }
    if (!best) {
      setError("None of these results have a price yet.");
      return;
    }
    addItem(best);
  }

  function buildBestBasket() {
    if (!list.length) return;
    const byQuery = new Map();
    for (const item of list) {
      const q = (item.query || item.name).toLowerCase();
      const existing = byQuery.get(q);
      const unit = item.price * item.qty;
      if (!existing || unit < existing.price * existing.qty) {
        byQuery.set(q, { ...item, key: `${item.platform}:${item.id}:best` });
      }
    }
    const next = Array.from(byQuery.values());
    setList(next);
    showToast("Basket updated to the lowest priced picks");
  }

  function updateQty(key, qty) {
    const n = Math.max(1, Number(qty) || 1);
    setList((prev) => prev.map((x) => (x.key === key ? { ...x, qty: n } : x)));
  }

  function removeItem(key) {
    setList((prev) => prev.filter((x) => x.key !== key));
  }

  function toggleStaple(term) {
    setStaples((prev) => {
      const has = prev.includes(term);
      if (has) return prev.filter((x) => x !== term);
      return [...prev, term].slice(0, 12);
    });
  }

  function pinCurrentQuery() {
    const q = productQuery.trim().toLowerCase();
    if (q.length < 2) return;
    if (!staples.includes(q)) setStaples((prev) => [q, ...prev].slice(0, 12));
    showToast("Saved to staples");
  }

  function clearFilters() {
    setSortBy("price_asc");
    setFilters({
      inStock: false,
      hasDiscount: false,
      brand: "",
      maxPrice: "",
    });
  }

  const filtersActive =
    filters.inStock ||
    filters.hasDiscount ||
    filters.brand.trim() ||
    filters.maxPrice !== "" ||
    sortBy !== "price_asc";

  async function shareBasket() {
    if (!list.length) return;
    const lines = [
      "Compari5 basket",
      location ? `Area: ${location.label.split(",").slice(0, 2).join(",")}` : "",
      "",
      ...list.map(
        (i) =>
          `• ${i.name} ×${i.qty} · ${i.platform} · ₹${Math.round(i.price * i.qty)}`
      ),
      "",
      ...PLATFORMS.map((p) => {
        const total = list
          .filter((i) => i.platform === p.id)
          .reduce((s, i) => s + i.price * i.qty, 0);
        return `${p.label}: ${total ? `₹${Math.round(total)}` : "no items"}`;
      }),
      "",
      "Delivery fees not included.",
    ].filter(Boolean);

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Basket copied to clipboard");
    } catch {
      setError("Could not copy the basket. Try selecting the text manually.");
    }
  }

  const totals = useMemo(() => {
    const t = {
      blinkit: 0,
      instamart: 0,
      zepto: 0,
      bigbasket: 0,
    };
    const counts = {
      blinkit: 0,
      instamart: 0,
      zepto: 0,
      bigbasket: 0,
    };
    let listMrp = 0;
    let listOffer = 0;
    for (const item of list) {
      t[item.platform] += item.price * item.qty;
      counts[item.platform] += item.qty;
      listOffer += item.price * item.qty;
      listMrp += (item.mrp || item.price) * item.qty;
    }
    const withItems = PLATFORMS.filter((p) => counts[p.id] > 0);
    let winner = null;
    if (withItems.length) {
      winner = withItems.reduce((best, p) =>
        t[p.id] < t[best.id] ? p : best
      ).id;
    }
    const priced = withItems.map((p) => t[p.id]);
    const savingsVsWorst =
      priced.length > 1 ? Math.max(...priced) - Math.min(...priced) : 0;
    const discountVsMrp = Math.max(0, listMrp - listOffer);
    return { t, counts, winner, savingsVsWorst, discountVsMrp, listOffer };
  }, [list]);

  function cheapestAmong(platformProducts) {
    const priced = platformProducts.filter((p) => p.price != null);
    if (!priced.length) return null;
    return Math.min(...priced.map((p) => p.price));
  }

  const filteredResults = useMemo(() => {
    if (!results) return null;
    const out = {};
    for (const p of PLATFORMS) {
      const block = results[p.id] || { products: [], error: null };
      out[p.id] = {
        ...block,
        products: applySortFilter(block.products || [], sortBy, filters),
      };
    }
    return out;
  }, [results, sortBy, filters]);

  const globalCheapest = useMemo(() => {
    if (!filteredResults) return null;
    const prices = PLATFORMS.flatMap((p) =>
      (filteredResults[p.id]?.products || [])
        .map((x) => x.price)
        .filter((n) => n != null)
    );
    return prices.length ? Math.min(...prices) : null;
  }, [filteredResults]);

  const queryHistory = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return history.filter((h) => h.query.toLowerCase() === q).slice(0, 6);
  }, [history, productQuery]);

  return (
    <main className="app">
      <header className="hero">
        <h1 className="brand">
          Compari<span>5</span>
        </h1>
        <p className="tagline">
          Compare live grocery prices from Blinkit, Instamart, Zepto, and
          BigBasket. Choose your area, search for what you need, and see which
          store costs less for your list.
        </p>
      </header>

      <section className="panel">
        <div className="auth-row">
          <div className="auth-card">
            <header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="plat-logo" src="/logos/blinkit.png" alt="" />
              Blinkit
            </header>
          </div>

          <div className="auth-card">
            <header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="plat-logo" src="/logos/instamart.png" alt="" />
              Instamart
            </header>
            <div className="meta">
              {auth.swiggy
                ? `Signed in. Last synced ${formatTime(auth.swiggySyncedAt)}.`
                : "Sign in with Swiggy so Instamart prices can load for your area."}
            </div>
            <div className="actions">
              {auth.swiggy ? (
                <button
                  className="btn ghost small"
                  onClick={async () => {
                    await fetch("/api/auth/status?provider=swiggy", {
                      method: "DELETE",
                    });
                    refreshAuth();
                  }}
                >
                  Sign out
                </button>
              ) : (
                <a className="btn small" href="/api/auth/swiggy">
                  Sign in with Swiggy
                </a>
              )}
            </div>
          </div>

          <div className="auth-card">
            <header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="plat-logo" src="/logos/zepto.png" alt="" />
              Zepto
            </header>
            <div className="meta">
              {auth.zepto
                ? `Signed in. Last synced ${formatTime(auth.zeptoSyncedAt)}.`
                : "Sign in with Zepto so Zepto prices can load for your area."}
            </div>
            <div className="actions">
              {auth.zepto ? (
                <button
                  className="btn ghost small"
                  onClick={async () => {
                    await fetch("/api/auth/status?provider=zepto", {
                      method: "DELETE",
                    });
                    refreshAuth();
                  }}
                >
                  Sign out
                </button>
              ) : (
                <a className="btn small" href="/api/auth/zepto">
                  Sign in with Zepto
                </a>
              )}
            </div>
          </div>

          <div className="auth-card">
            <header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="plat-logo" src="/logos/bigbasket.png" alt="" />
              BigBasket
            </header>
          </div>
        </div>

        <div className="field">
          <label>Delivery area</label>
          <div className="row">
            <input
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && geocode()}
              placeholder="HSR Layout Bengaluru, Bandra West"
            />
            <button
              className="btn"
              onClick={geocode}
              disabled={loadingGeo || areaQuery.length < 2}
            >
              {loadingGeo ? "Searching…" : "Find area"}
            </button>
          </div>
        </div>

        {location && (
          <div className="chip">
            Delivering near {location.label.split(",").slice(0, 2).join(",")}
          </div>
        )}

        {!!places.length && (
          <div className="suggestions">
            {places.map((p) => (
              <button
                key={`${p.lat}-${p.lng}-${p.label}`}
                className="suggestion"
                onClick={() => {
                  setLocation(p);
                  setPlaces([]);
                  setAreaQuery(p.label.split(",").slice(0, 2).join(","));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label>Staples</label>
          <div className="staples">
            {staples.map((s) => (
              <button
                key={s}
                className={
                  "staple" +
                  (productQuery.trim().toLowerCase() === s ? " active" : "")
                }
                onClick={() => search(s)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleStaple(s);
                }}
                title="Right click to unpin"
              >
                {s}
              </button>
            ))}
            <button className="btn soft small" onClick={pinCurrentQuery}>
              Save this search
            </button>
          </div>
        </div>

        <div className="field">
          <label>Product search</label>
          <div className="row">
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="amul milk, maggi, eggs"
            />
            <button
              className="btn"
              onClick={() => search()}
              disabled={loadingSearch || productQuery.length < 2 || !location}
            >
              {loadingSearch ? "Searching…" : "Compare prices"}
            </button>
          </div>
        </div>

        {pinNote && (
          <div className="note">
            <span>{pinNote}</span>
            <button className="btn ghost small" onClick={() => setPinNote("")}>
              Dismiss
            </button>
          </div>
        )}

        {error && <div className="alert">{error}</div>}
      </section>

      <div className="layout">
        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">Results</h2>
              <p className="section-sub">
                The lowest price in this search is highlighted. Delivery fees
                are not included.
              </p>
            </div>
            {results && (
              <div className="toolbar">
                <button className="btn soft small" onClick={addBestFromResults}>
                  Add the lowest price
                </button>
              </div>
            )}
          </div>

          {results && (
            <div className="filters-bar">
              <label className="filter-field">
                <span>Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>Max price (₹)</span>
                <input
                  type="number"
                  min={1}
                  placeholder="No limit"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, maxPrice: e.target.value }))
                  }
                />
              </label>
              <label className="filter-field grow">
                <span>Brand or product name</span>
                <input
                  type="text"
                  placeholder="amul, britannia"
                  value={filters.brand}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, brand: e.target.value }))
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filters.hasDiscount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      hasDiscount: e.target.checked,
                    }))
                  }
                />
                On offer
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, inStock: e.target.checked }))
                  }
                />
                In stock
              </label>
              {filtersActive && (
                <button className="btn ghost small" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!results && !loadingSearch && (
            <p className="empty">
              Choose a delivery area, then search for a product or tap a staple.
            </p>
          )}
          {loadingSearch && (
            <p className="empty">Loading prices from each store…</p>
          )}

          {filteredResults && (
            <div className="platform-grid">
              {PLATFORMS.map((p) => {
                const block = filteredResults[p.id] || {
                  products: [],
                  error: null,
                };
                const floor = cheapestAmong(block.products);
                return (
                  <div className="platform" key={p.id}>
                    <h3>
                      <span className="plat-title">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="plat-logo" src={p.logo} alt="" />
                        {p.label}
                      </span>
                      {floor != null && (
                        <span
                          className={
                            "floor" + (floor === globalCheapest ? " best" : "")
                          }
                        >
                          from ₹{floor}
                        </span>
                      )}
                    </h3>
                    {block.error && <p className="err">{block.error}</p>}
                    {!block.error && !block.products.length && (
                      <p className="empty">No products match these filters.</p>
                    )}
                    {block.products.slice(0, 12).map((prod) => {
                      const isBest = prod.price === globalCheapest;
                      const save = Math.round(saveAmount(prod));
                      return (
                        <div className="product" key={`${p.id}-${prod.id}`}>
                          {prod.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={prod.image} alt="" />
                          ) : (
                            <div />
                          )}
                          <div>
                            <div className="name" title={prod.name}>
                              {prod.name}
                            </div>
                            <div className="qty">
                              {prod.quantity || "Pack size not listed"}
                            </div>
                            <div className="badges">
                              {prod.eta ? (
                                <span className="badge eta">{prod.eta}</span>
                              ) : null}
                              <span className="badge stock">In stock</span>
                              {save > 0 ? (
                                <span className="badge save">Save ₹{save}</span>
                              ) : null}
                              {isBest ? (
                                <span className="badge best">Lowest here</span>
                              ) : null}
                            </div>
                            <div className="price-row">
                              <div>
                                <span
                                  className={"price" + (isBest ? " best" : "")}
                                >
                                  ₹{prod.price}
                                </span>
                                {prod.mrp && prod.mrp > prod.price ? (
                                  <span className="mrp">₹{prod.mrp}</span>
                                ) : null}
                              </div>
                              <div className="links">
                                <button
                                  className="btn soft small"
                                  onClick={() => addItem(prod)}
                                >
                                  Add
                                </button>
                                <button
                                  className="btn ghost small"
                                  onClick={() =>
                                    openProduct(prod.url, prod.name, p.id)
                                  }
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {!!queryHistory.length && (
            <div className="history">
              <h4>Recent prices for this search</h4>
              <ul>
                {queryHistory.map((h, i) => (
                  <li key={`${h.ts}-${h.platform}-${i}`}>
                    {formatTime(h.ts)} · {h.platform} · ₹{h.price} · {h.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="list-panel">
          <div className="section-head">
            <div>
              <h2 className="section-title">Basket</h2>
              <p className="section-sub">
                Running totals for each store based on what you added.
              </p>
            </div>
          </div>

          {!list.length && (
            <p className="empty">
              Add items from the results, or use Add the lowest price.
            </p>
          )}

          {list.map((item) => (
            <div className="list-item" key={item.key}>
              <div>
                <div className="list-name">{item.name}</div>
                <div className="qty">
                  {item.platform} · ₹{item.price}
                  {item.quantity ? ` · ${item.quantity}` : ""}
                  {item.eta ? ` · ${item.eta}` : ""}
                </div>
              </div>
              <div className="controls">
                <input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => updateQty(item.key, e.target.value)}
                />
                <button
                  className="btn ghost small"
                  onClick={() => openProduct(item.url, item.name, item.platform)}
                >
                  Open
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => removeItem(item.key)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {!!list.length && (
            <>
              <div className="totals">
                {PLATFORMS.map((p) => (
                  <div
                    className={
                      "total-row" + (totals.winner === p.id ? " winner" : "")
                    }
                    key={p.id}
                  >
                    <span>
                      {p.label}
                      {totals.counts[p.id]
                        ? ` · ${totals.counts[p.id]} items`
                        : ""}
                    </span>
                    <span>
                      {totals.counts[p.id]
                        ? `₹${Math.round(totals.t[p.id])}`
                        : "None"}
                    </span>
                  </div>
                ))}
              </div>

              {(totals.savingsVsWorst > 0 || totals.discountVsMrp > 0) && (
                <div className="savings">
                  {totals.winner
                    ? `${PLATFORMS.find((p) => p.id === totals.winner)?.label} is cheapest for this basket. `
                    : ""}
                  {totals.savingsVsWorst > 0
                    ? `That is about ₹${Math.round(totals.savingsVsWorst)} less than the costliest store mix. `
                    : ""}
                  {totals.discountVsMrp > 0
                    ? `Offers save about ₹${Math.round(totals.discountVsMrp)} against MRP. `
                    : ""}
                  Delivery and handling fees are not included.
                </div>
              )}

              <div className="toolbar" style={{ marginTop: "0.75rem" }}>
                <button className="btn soft small" onClick={buildBestBasket}>
                  Keep lowest picks
                </button>
                <button className="btn soft small" onClick={shareBasket}>
                  Copy basket
                </button>
                <button className="btn ghost small" onClick={() => setList([])}>
                  Clear basket
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
