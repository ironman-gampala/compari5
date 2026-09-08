"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMatchGroups, collectBrands } from "../lib/match.js";
import {
  deleteSavedList,
  loadSavedLists,
  persistSavedLists,
  saveNamedList,
  splitSearchTerms,
} from "../lib/lists.js";
import { formatUnitPrice } from "../lib/units.js";

const PLATFORMS = [
  { id: "blinkit", label: "Blinkit", logo: "/logos/blinkit.png" },
  { id: "instamart", label: "Instamart", logo: "/logos/instamart.png" },
  { id: "zepto", label: "Zepto", logo: "/logos/zepto.png" },
  { id: "bigbasket", label: "BigBasket", logo: "/logos/bigbasket.png" },
];

const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

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
  { id: "price_asc", label: "Price: low → high" },
  { id: "price_desc", label: "Price: high → low" },
  { id: "save_desc", label: "Biggest MRP save" },
  { id: "name_asc", label: "Name A–Z" },
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

function friendlyPlatformError(message) {
  const msg = String(message || "");
  if (/impit|native bindings|Chrome TLS/i.test(msg)) {
    return "Blinkit could not load on this server yet. Other stores should still work.";
  }
  if (/Blinkit blocked|auth_key failed/i.test(msg)) {
    return "Blinkit blocked this server request. Try again shortly.";
  }
  if (/not signed in|not connected|Sign in/i.test(msg)) {
    return msg;
  }
  if (msg.length > 160) return `${msg.slice(0, 157)}…`;
  return msg;
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
  if (filters.brand) {
    const b = filters.brand.toLowerCase();
    list = list.filter((p) => String(p.brand || "").toLowerCase() === b);
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

function filterPlatformResults(results, sortBy, filters) {
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
}

function insightFromFiltered(filtered) {
  if (!filtered) return null;
  const floors = [];
  for (const p of PLATFORMS) {
    const priced = (filtered[p.id]?.products || []).filter(
      (x) => x.price != null
    );
    if (!priced.length) continue;
    const floor = Math.min(...priced.map((x) => x.price));
    floors.push({ id: p.id, label: p.label, floor });
  }
  if (!floors.length) return null;
  floors.sort((a, b) => a.floor - b.floor);
  const best = floors[0];
  const next = floors[1];
  return {
    best,
    saves: next ? next.floor - best.floor : 0,
  };
}

function ProductCard({ prod, platformId, globalCheapest, onAdd }) {
  const isBest = prod.price === globalCheapest;
  const save = Math.round(saveAmount(prod));
  const unit = formatUnitPrice(prod);
  return (
    <article className={"product" + (isBest ? " product-best" : "")}>
      {prod.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={prod.image} alt="" />
      ) : (
        <div className="product-ph" />
      )}
      <div>
        <div className="name" title={prod.name}>
          {prod.name}
        </div>
        <div className="qty">
          {[prod.brand, prod.quantity].filter(Boolean).join(" · ") ||
            "Pack size not listed"}
        </div>
        <div className="badges">
          {prod.eta ? <span className="badge eta">{prod.eta}</span> : null}
          {unit ? <span className="badge unit">{unit}</span> : null}
          {save > 0 ? <span className="badge save">Save ₹{save}</span> : null}
          {isBest ? <span className="badge best">Lowest</span> : null}
        </div>
        <div className="price-row">
          <div>
            <span className={"price" + (isBest ? " best" : "")}>
              ₹{prod.price}
            </span>
            {prod.mrp && prod.mrp > prod.price ? (
              <span className="mrp">₹{prod.mrp}</span>
            ) : null}
          </div>
          <div className="links">
            <button className="btn soft small" onClick={() => onAdd(prod)}>
              Add
            </button>
            <button
              className="btn ghost small"
              onClick={() => openProduct(prod.url, prod.name, platformId)}
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function PlatformColumns({ filtered, globalCheapest, onAdd, loadingMap }) {
  return (
    <div className="platform-grid">
      {PLATFORMS.map((p) => {
        const block = filtered[p.id] || { products: [], error: null };
        const loading = loadingMap?.[p.id];
        const priced = block.products.filter((x) => x.price != null);
        const floor = priced.length
          ? Math.min(...priced.map((x) => x.price))
          : null;
        const isCheapestCol =
          floor != null && globalCheapest != null && floor === globalCheapest;
        return (
          <div
            className={
              "platform" + (isCheapestCol ? " platform-cheapest" : "")
            }
            key={p.id}
          >
            {isCheapestCol ? (
              <div className="platform-win-tag">Cheapest</div>
            ) : null}
            <h3>
              <span className="plat-title">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="plat-logo" src={p.logo} alt="" />
                {p.label}
              </span>
              {loading ? (
                <span className="floor loading">…</span>
              ) : floor != null ? (
                <span className={"floor" + (isCheapestCol ? " best" : "")}>
                  from ₹{floor}
                </span>
              ) : null}
            </h3>
            {block.error && (
              <p className="err">{friendlyPlatformError(block.error)}</p>
            )}
            {loading && !block.products.length && !block.error && (
              <p className="empty">Fetching…</p>
            )}
            {!loading && !block.error && !block.products.length && (
              <p className="empty">No products match these filters.</p>
            )}
            {block.products.slice(0, 8).map((prod) => (
              <ProductCard
                key={`${p.id}-${prod.id}`}
                prod={prod}
                platformId={p.id}
                globalCheapest={globalCheapest}
                onAdd={onAdd}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MatchBoard({ groups, onAdd }) {
  if (!groups?.length) return null;
  return (
    <div className="match-board">
      <div className="match-head">
        <h3>Same item, all stores</h3>
        <p>Matched by name and pack size across platforms.</p>
      </div>
      <div className="match-list">
        {groups.slice(0, 8).map((g) => (
          <div className="match-row" key={g.key}>
            <div className="match-meta">
              <div className="match-title">{g.title}</div>
              {g.quantity ? <div className="qty">{g.quantity}</div> : null}
            </div>
            <div className="match-prices">
              {PLATFORMS.map((p) => {
                const prod = g.items[p.id];
                if (!prod) {
                  return (
                    <div className="match-cell muted" key={p.id}>
                      <span className="match-plat">{p.label}</span>
                      <span>—</span>
                    </div>
                  );
                }
                const isBest = prod.price === g.bestPrice;
                return (
                  <div
                    className={"match-cell" + (isBest ? " best" : "")}
                    key={p.id}
                  >
                    <span className="match-plat">{p.label}</span>
                    <button
                      type="button"
                      className="match-price-btn"
                      onClick={() => onAdd(prod)}
                      title={`Add ${p.label}`}
                    >
                      ₹{prod.price}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [areaQuery, setAreaQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [location, setLocation] = useState(null);
  const [productQuery, setProductQuery] = useState("");
  const [results, setResults] = useState(null);
  const [multiResults, setMultiResults] = useState(null);
  const [searchProgress, setSearchProgress] = useState("");
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [platformLoading, setPlatformLoading] = useState({});
  const [list, setList] = useState([]);
  const [staples, setStaples] = useState(DEFAULT_STAPLES);
  const [history, setHistory] = useState([]);
  const [savedLists, setSavedLists] = useState([]);
  const [listName, setListName] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [sortBy, setSortBy] = useState("price_asc");
  const [filters, setFilters] = useState({
    inStock: false,
    hasDiscount: false,
    brand: "",
    maxPrice: "",
  });
  const areaDebounceRef = useRef(null);
  const suggestSeq = useRef(0);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  useEffect(() => {
    try {
      const loc = JSON.parse(localStorage.getItem(LOC_KEY) || "null");
      const items = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
      const pins = JSON.parse(localStorage.getItem(STAPLES_KEY) || "null");
      const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      setSavedLists(loadSavedLists());
      if (loc) {
        setLocation(loc);
        setAreaQuery(loc.label?.split(",").slice(0, 2).join(",") || "");
      }
      if (Array.isArray(items)) setList(items);
      if (Array.isArray(pins) && pins.length) setStaples(pins);
      if (Array.isArray(hist)) setHistory(hist.slice(0, 40));
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("b");
    if (shareId) {
      fetch(`/api/share?id=${encodeURIComponent(shareId)}`)
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (!ok || !d?.items?.length) {
            setError("That short basket link was not found.");
            return;
          }
          setList(d.items);
          if (d.location?.lat != null && d.location?.lng != null) {
            setLocation(d.location);
            setAreaQuery(
              d.location.label?.split(",").slice(0, 2).join(",") || ""
            );
          }
          showToast("Basket loaded from link");
        })
        .catch(() => setError("Could not load shared basket."))
        .finally(() => window.history.replaceState({}, "", "/"));
    }
    if (params.get("connected")) {
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

  useEffect(() => {
    persistSavedLists(savedLists);
  }, [savedLists]);

  const brandOptions = useMemo(() => {
    if (multiResults?.length) {
      const merged = {};
      for (const id of PLATFORM_IDS) {
        merged[id] = { products: [], error: null };
      }
      for (const block of multiResults) {
        if (!block.results) continue;
        for (const id of PLATFORM_IDS) {
          merged[id].products.push(...(block.results[id]?.products || []));
        }
      }
      return collectBrands(merged, PLATFORM_IDS);
    }
    return collectBrands(results, PLATFORM_IDS);
  }, [results, multiResults]);

  useEffect(() => {
    if (!filters.brand) return;
    const ok = brandOptions.some(
      (b) => b.toLowerCase() === filters.brand.toLowerCase()
    );
    if (!ok) setFilters((f) => ({ ...f, brand: "" }));
  }, [brandOptions, filters.brand]);

  async function suggestAreas(query) {
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      return;
    }
    const seq = ++suggestSeq.current;
    setLoadingGeo(true);
    try {
      const res = await fetch(
        `/api/geocode?mode=suggest&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (seq !== suggestSeq.current) return;
      if (!res.ok) throw new Error(data.error || "Could not find that area");
      setPlaces(data.places || []);
      if (!data.places?.length && data.warning) setError(data.warning);
    } catch (e) {
      if (seq === suggestSeq.current) setError(e.message);
    } finally {
      if (seq === suggestSeq.current) setLoadingGeo(false);
    }
  }

  function onAreaInput(value) {
    setAreaQuery(value);
    setError("");
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    areaDebounceRef.current = setTimeout(() => suggestAreas(value), 280);
  }

  async function pickPlace(place) {
    setPlaces([]);
    setError("");
    if (place.lat != null && place.lng != null) {
      setLocation(place);
      setAreaQuery(place.label.split(",").slice(0, 2).join(","));
      showToast("Delivery area set");
      return;
    }
    if (!place.placeId) return;
    setLoadingGeo(true);
    try {
      const res = await fetch(
        `/api/geocode?placeId=${encodeURIComponent(place.placeId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resolve address");
      const full = data.places?.[0];
      if (!full) throw new Error("Could not resolve address");
      setLocation(full);
      setAreaQuery(full.label.split(",").slice(0, 2).join(","));
      showToast("Delivery area set");
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

  async function fetchSearch(q, platform) {
    const params = new URLSearchParams({
      q,
      lat: String(location.lat),
      lng: String(location.lng),
      label: location.label || "",
      platform,
    });
    if (location.city) params.set("city", location.city);
    if (location.postalCode) params.set("postalCode", location.postalCode);
    if (location.locality) params.set("locality", location.locality);

    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    return data;
  }

  async function searchOneTermProgressive(term) {
    const empty = Object.fromEntries(
      PLATFORM_IDS.map((id) => [id, { products: [], error: null, meta: null }])
    );
    const merged = { ...empty };
    setResults(empty);
    setPlatformLoading(
      Object.fromEntries(PLATFORM_IDS.map((id) => [id, true]))
    );

    await Promise.all(
      PLATFORM_IDS.map(async (platform) => {
        try {
          const data = await fetchSearch(term, platform);
          const block = data.results?.[platform] || {
            products: [],
            error: null,
            meta: null,
          };
          merged[platform] = block;
          setResults((prev) => ({
            ...(prev || empty),
            [platform]: block,
          }));
          if (block.meta?.addressCreated) {
            setPinNote(
              `Instamart is using a new delivery pin saved as ${block.meta.addressLabel || "Compari5"}.`
            );
          }
        } catch (e) {
          const block = {
            products: [],
            error: e.message || "Search failed",
            meta: null,
          };
          merged[platform] = block;
          setResults((prev) => ({
            ...(prev || empty),
            [platform]: block,
          }));
        } finally {
          setPlatformLoading((prev) => ({ ...prev, [platform]: false }));
        }
      })
    );

    recordHistory(term, merged);
  }

  async function search(forcedQuery) {
    const raw = (forcedQuery ?? productQuery).trim();
    if (!location) {
      setError("Choose a delivery area first.");
      return;
    }
    const terms = splitSearchTerms(raw);
    if (!terms.length) {
      setError("Enter at least two characters to search.");
      return;
    }
    setProductQuery(terms.join(", "));
    setError("");
    setPinNote("");
    setLoadingSearch(true);
    setMultiResults(null);
    setSearchProgress("");

    try {
      if (terms.length === 1) {
        setSearchProgress(`Comparing “${terms[0]}” across stores…`);
        await searchOneTermProgressive(terms[0]);
      } else {
        const collected = [];
        for (let i = 0; i < terms.length; i++) {
          const term = terms[i];
          setSearchProgress(`Item ${i + 1}/${terms.length}: ${term}…`);
          try {
            const parts = await Promise.all(
              PLATFORM_IDS.map(async (platform) => {
                try {
                  const data = await fetchSearch(term, platform);
                  return [platform, data.results?.[platform]];
                } catch (e) {
                  return [
                    platform,
                    {
                      products: [],
                      error: e.message || "Search failed",
                      meta: null,
                    },
                  ];
                }
              })
            );
            const resultsObj = Object.fromEntries(parts);
            collected.push({ query: term, results: resultsObj, error: null });
            recordHistory(term, resultsObj);
            setMultiResults([...collected]);
          } catch (e) {
            collected.push({
              query: term,
              results: null,
              error: e.message || "Search failed",
            });
            setMultiResults([...collected]);
          }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSearch(false);
      setSearchProgress("");
      setPlatformLoading({});
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
    showToast("Added to basket");
  }

  function addBestFromFiltered(filtered, query) {
    if (!filtered) return;
    let best = null;
    for (const p of PLATFORMS) {
      for (const prod of filtered[p.id]?.products || []) {
        if (prod.price == null) continue;
        if (!best || prod.price < best.price) best = prod;
      }
    }
    if (!best) {
      setError("None of these results have a price yet.");
      return;
    }
    addItem(best, query);
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
    setList(Array.from(byQuery.values()));
    showToast("Kept lowest-priced picks");
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
    if (q.length < 2) {
      setError("Type a product search first, then save it as a shortcut.");
      return;
    }
    if (staples.includes(q)) {
      showToast("Already in saved searches");
      return;
    }
    setStaples((prev) => [q, ...prev].slice(0, 12));
    showToast("Saved search shortcut");
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
    !!filters.brand ||
    filters.maxPrice !== "" ||
    sortBy !== "price_asc";

  async function shareBasketText() {
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

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Basket text copied");
    } catch {
      setError("Could not copy the basket.");
    }
  }

  async function shareBasketLink() {
    if (!list.length) return;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location, items: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Share failed");
      const url = `${window.location.origin}/?b=${data.id}`;
      await navigator.clipboard.writeText(url);
      showToast("Short link copied");
    } catch (e) {
      setError(e.message || "Could not copy share link.");
    }
  }

  function handleSaveList() {
    if (!list.length) return;
    const name = listName.trim() || `List ${new Date().toLocaleDateString("en-IN")}`;
    setSavedLists((prev) =>
      saveNamedList(prev, { name, items: list, location })
    );
    setListName("");
    showToast("List saved");
  }

  function handleLoadList(id) {
    const found = savedLists.find((l) => l.id === id);
    if (!found) return;
    if (list.length && !window.confirm("Replace your current basket?")) return;
    setList(found.items || []);
    if (found.location?.lat != null) {
      setLocation(found.location);
      setAreaQuery(
        found.location.label?.split(",").slice(0, 2).join(",") || ""
      );
    }
    showToast(`Loaded “${found.name}”`);
  }

  function handleDeleteList(id) {
    setSavedLists((prev) => deleteSavedList(prev, id));
    showToast("Saved list removed");
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

  const filteredResults = useMemo(
    () => filterPlatformResults(results, sortBy, filters),
    [results, sortBy, filters]
  );

  const singleInsight = useMemo(
    () => insightFromFiltered(filteredResults),
    [filteredResults]
  );

  const singleMatchGroups = useMemo(() => {
    if (!filteredResults) return [];
    const all = PLATFORMS.flatMap((p) => filteredResults[p.id]?.products || []);
    return buildMatchGroups(all, PLATFORM_IDS);
  }, [filteredResults]);

  const globalCheapest = singleInsight?.best?.floor ?? null;

  const filteredMulti = useMemo(() => {
    if (!multiResults) return null;
    return multiResults.map((block) => {
      const filtered = filterPlatformResults(block.results, sortBy, filters);
      const insight = insightFromFiltered(filtered);
      const all = filtered
        ? PLATFORMS.flatMap((p) => filtered[p.id]?.products || [])
        : [];
      return {
        ...block,
        filtered,
        insight,
        groups: buildMatchGroups(all, PLATFORM_IDS),
        globalCheapest: insight?.best?.floor ?? null,
      };
    });
  }, [multiResults, sortBy, filters]);

  const hasAnyResults = !!(filteredResults || filteredMulti?.length);

  const queryHistory = useMemo(() => {
    const q = productQuery.trim().toLowerCase().split(",")[0]?.trim();
    if (!q) return [];
    return history.filter((h) => h.query.toLowerCase() === q).slice(0, 6);
  }, [history, productQuery]);

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">India quick commerce</p>
        <h1 className="brand">
          Compari<span>5</span>
        </h1>
        <p className="tagline">
          Live prices from Blinkit, Instamart, Zepto, and BigBasket — pick an
          area, search one item or a whole list, and see who wins.
        </p>
      </header>

      <section className="panel control-panel">
        <div className="auth-row" aria-label="Stores">
          {PLATFORMS.map((p) => (
            <div className="auth-card" key={p.id}>
              <header>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="plat-logo" src={p.logo} alt="" />
                {p.label}
              </header>
            </div>
          ))}
        </div>

        <div className="control-grid">
          <div className="field address-field">
            <label>Delivery area</label>
            <div className="address-box">
              <input
                value={areaQuery}
                onChange={(e) => onAreaInput(e.target.value)}
                onFocus={() => {
                  if (areaQuery.trim().length >= 2 && !places.length) {
                    suggestAreas(areaQuery);
                  }
                }}
                placeholder="Start typing an address or neighbourhood…"
                autoComplete="off"
                aria-autocomplete="list"
              />
              {loadingGeo && (
                <span className="address-spinner" aria-hidden>
                  …
                </span>
              )}
              {!!places.length && (
                <div className="suggestions address-suggestions" role="listbox">
                  {places.map((p) => (
                    <button
                      key={`${p.placeId || p.lat}-${p.label}`}
                      className="suggestion"
                      type="button"
                      onClick={() => pickPlace(p)}
                    >
                      <strong>{p.mainText || p.label.split(",")[0]}</strong>
                      <span>
                        {p.secondaryText ||
                          p.label.split(",").slice(1).join(",").trim()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {location && (
              <div className="chip location-chip">
                <span className="chip-dot" />
                Delivering near {location.label.split(",").slice(0, 2).join(",")}
              </div>
            )}
            <p className="field-hint">
              Google-style address search — pick a suggestion to set your pin.
            </p>
          </div>

          <div className="field">
            <label>Search products</label>
            <div className="row">
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="amul milk — or milk, bread, eggs"
              />
              <button
                className="btn"
                onClick={() => search()}
                disabled={loadingSearch || productQuery.length < 2 || !location}
              >
                {loadingSearch ? "Comparing…" : "Compare"}
              </button>
            </div>
            <p className="field-hint">
              Tip: separate items with commas for a multi-store list compare.
            </p>
          </div>
        </div>

        <div className="field">
          <label>Saved searches</label>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Tap to search again. Use × to remove. “Save this search” pins the
            box above.
          </p>
          <div className="staples">
            {staples.map((s) => (
              <div
                key={s}
                className={
                  "staple-chip" +
                  (productQuery.trim().toLowerCase() === s ? " active" : "")
                }
              >
                <button type="button" className="staple-run" onClick={() => search(s)}>
                  {s}
                </button>
                <button
                  type="button"
                  className="staple-x"
                  aria-label={`Remove ${s}`}
                  onClick={() => toggleStaple(s)}
                >
                  ×
                </button>
              </div>
            ))}
            <button className="btn soft small" onClick={pinCurrentQuery}>
              Save this search
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
        {searchProgress && (
          <div className="progress-note">
            <span className="progress-pulse" />
            {searchProgress}
          </div>
        )}
      </section>

      <div className="layout">
        <section className="results-section">
          <div className="section-head">
            <div>
              <h2 className="section-title">Results</h2>
              <p className="section-sub">
                Filters apply live. Delivery fees are not included.
              </p>
            </div>
            {filteredResults && (
              <div className="toolbar">
                <button
                  className="btn soft small"
                  onClick={() =>
                    addBestFromFiltered(filteredResults, productQuery)
                  }
                >
                  Add lowest
                </button>
              </div>
            )}
          </div>

          {hasAnyResults && (
            <div className="filters-bar">
              <label className="filter-field">
                <span>Sort</span>
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
                <span>Brand</span>
                <select
                  value={filters.brand}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, brand: e.target.value }))
                  }
                >
                  <option value="">All brands</option>
                  {brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>Max ₹</span>
                <input
                  type="number"
                  min={1}
                  placeholder="Any"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, maxPrice: e.target.value }))
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
                  Reset
                </button>
              )}
            </div>
          )}

          {singleInsight && (
            <div className="insight-strip">
              <strong>{singleInsight.best.label}</strong> leads this search at{" "}
              <strong>₹{singleInsight.best.floor}</strong>
              {singleInsight.saves > 0
                ? ` · about ₹${Math.round(singleInsight.saves)} less than the next store`
                : ""}
            </div>
          )}

          {!hasAnyResults && !loadingSearch && (
            <div className="empty-panel">
              <p className="empty">
                Choose a delivery area, then search a product or tap a staple.
              </p>
            </div>
          )}
          {loadingSearch && !hasAnyResults && (
            <div className="empty-panel">
              <p className="empty">{searchProgress || "Loading prices…"}</p>
            </div>
          )}

          {filteredResults && (
            <>
              <MatchBoard
                groups={singleMatchGroups}
                onAdd={(prod) => addItem(prod, productQuery)}
              />
              <PlatformColumns
                filtered={filteredResults}
                globalCheapest={globalCheapest}
                loadingMap={platformLoading}
                onAdd={(prod) => addItem(prod, productQuery)}
              />
            </>
          )}

          {filteredMulti?.map((block) => (
            <div className="multi-block" key={block.query}>
              <div className="multi-head">
                <div>
                  <h3 className="multi-title">{block.query}</h3>
                  {block.insight && (
                    <p className="multi-insight">
                      Best: {block.insight.best.label} at ₹
                      {block.insight.best.floor}
                      {block.insight.saves > 0
                        ? ` · saves ₹${Math.round(block.insight.saves)}`
                        : ""}
                    </p>
                  )}
                </div>
                {block.filtered && (
                  <button
                    className="btn soft small"
                    onClick={() =>
                      addBestFromFiltered(block.filtered, block.query)
                    }
                  >
                    Add cheapest
                  </button>
                )}
              </div>
              {block.error && (
                <p className="err">{friendlyPlatformError(block.error)}</p>
              )}
              {block.filtered && (
                <>
                  <MatchBoard
                    groups={block.groups}
                    onAdd={(prod) => addItem(prod, block.query)}
                  />
                  <PlatformColumns
                    filtered={block.filtered}
                    globalCheapest={block.globalCheapest}
                    onAdd={(prod) => addItem(prod, block.query)}
                  />
                </>
              )}
            </div>
          ))}

          {!!queryHistory.length && (
            <div className="history">
              <h4>Recent prices</h4>
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
                One column per store — items you added under each logo.
              </p>
            </div>
          </div>

          {!list.length && (
            <p className="empty">
              Add products from results. They’ll show here under each store.
            </p>
          )}

          {!!list.length && (
            <>
              <div className="basket-table-wrap">
                <table className="basket-table">
                  <thead>
                    <tr>
                      {PLATFORMS.map((p) => (
                        <th
                          key={p.id}
                          className={
                            totals.winner === p.id ? "col-cheapest" : ""
                          }
                        >
                          <span className="basket-th">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="plat-logo" src={p.logo} alt="" />
                            {p.label}
                            {totals.winner === p.id ? (
                              <span className="th-tag">Lowest</span>
                            ) : null}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {PLATFORMS.map((p) => {
                        const items = list.filter((i) => i.platform === p.id);
                        return (
                          <td
                            key={p.id}
                            className={
                              totals.winner === p.id ? "col-cheapest" : ""
                            }
                          >
                            {!items.length ? (
                              <p className="empty tiny">No items</p>
                            ) : (
                              <ul className="basket-col-items">
                                {items.map((item) => (
                                  <li key={item.key}>
                                    <div className="list-name">{item.name}</div>
                                    <div className="qty">
                                      ₹{item.price}
                                      {item.quantity
                                        ? ` · ${item.quantity}`
                                        : ""}
                                    </div>
                                    <div className="controls">
                                      <input
                                        type="number"
                                        min={1}
                                        value={item.qty}
                                        onChange={(e) =>
                                          updateQty(item.key, e.target.value)
                                        }
                                        aria-label="Quantity"
                                      />
                                      <button
                                        className="btn ghost small"
                                        onClick={() => removeItem(item.key)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="basket-col-total">
                              {totals.counts[p.id]
                                ? `₹${Math.round(totals.t[p.id])}`
                                : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {totals.winner && (
                <div className="basket-winner">
                  <span>
                    Cheapest store column:{" "}
                    <strong>
                      {PLATFORMS.find((p) => p.id === totals.winner)?.label}
                    </strong>
                    {totals.savingsVsWorst > 0
                      ? ` · saves ~₹${Math.round(totals.savingsVsWorst)} vs highest`
                      : ""}
                  </span>
                  <span>₹{Math.round(totals.t[totals.winner])}</span>
                </div>
              )}

              <div className="basket-actions">
                <button className="btn soft small" onClick={buildBestBasket}>
                  Keep lowest picks
                </button>
                <button className="btn soft small" onClick={shareBasketLink}>
                  Copy short link
                </button>
                <button className="btn ghost small" onClick={shareBasketText}>
                  Copy text
                </button>
                <button className="btn ghost small" onClick={() => setList([])}>
                  Clear
                </button>
              </div>
            </>
          )}

          <div className="saved-block">
            <h4>Named baskets</h4>
            <div className="saved-save-row">
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Name this basket"
                disabled={!list.length}
              />
              <button
                className="btn soft small"
                onClick={handleSaveList}
                disabled={!list.length}
              >
                Save
              </button>
            </div>
            {!savedLists.length && (
              <p className="empty tiny">No saved baskets yet.</p>
            )}
            <ul className="saved-list">
              {savedLists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="saved-name"
                    onClick={() => handleLoadList(l.id)}
                  >
                    {l.name}
                    <span>
                      {l.items?.length || 0} items · {formatTime(l.savedAt)}
                    </span>
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => handleDeleteList(l.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
