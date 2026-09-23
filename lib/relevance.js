/**
 * Keep search results on-intent (e.g. "butter" should not include buttermilk).
 */

const STOP = new Set([
  "the",
  "and",
  "with",
  "for",
  "pack",
  "combo",
  "fresh",
  "premium",
  "amul",
  "dodla",
  "nandini",
  "mother",
  "dairy",
]);

/** When query has `when` tokens (and not `unless`), drop products matching `reject`. */
const FALSE_FRIENDS = [
  {
    when: ["butter"],
    unless: ["milk", "buttermilk", "milkshake"],
    reject: /\bbutter\s*milk\b|\bbuttermilk\b|\bbutter\s*scotch\b|\bbutterscotch\b/i,
    category: "Butter",
  },
  {
    when: ["milk"],
    unless: ["butter", "shake", "powder", "cream", "condensed", "coconut", "soy", "oat", "almond"],
    reject: /\bbutter\s*milk\b|\bbuttermilk\b|\bmilkshake\b|\bmilk\s*shake\b|\bmilk\s*powder\b|\bcondensed\s*milk\b/i,
    category: "Milk",
  },
  {
    when: ["bread"],
    unless: ["crumb", "crumbs", "stick", "sticks"],
    reject: /\bbread\s*crumbs?\b|\bbreadsticks?\b/i,
    category: "Bread",
  },
  {
    when: ["cream"],
    unless: ["ice", "cold", "biscuit", "cookie", "cracker"],
    reject: /\bice\s*cream\b|\bcold\s*cream\b/i,
    category: "Cream",
  },
  {
    when: ["oil"],
    unless: ["hair", "coconut", "mustard", "olive", "sunflower", "rice"],
    reject: /\bhair\s*oil\b|\bengine\s*oil\b/i,
    category: "Cooking oil",
  },
  {
    when: ["sugar"],
    unless: ["free", "cane", "brown", "jaggery"],
    reject: /\bsugar\s*free\b|\bsugarfree\b/i,
    category: "Sugar",
  },
];

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeQueryText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function queryTokens(query) {
  return normalizeQueryText(query)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

function hasWholeWord(hay, token) {
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(token)}(?:[^a-z0-9]|$)`, "i");
  return re.test(hay);
}

function activeFalseFriends(tokens) {
  const set = new Set(tokens);
  return FALSE_FRIENDS.filter((rule) => {
    if (!rule.when.every((t) => set.has(t))) return false;
    if (rule.unless.some((t) => set.has(t))) return false;
    return true;
  });
}

/** Human label for the filter chip, e.g. "Butter". */
export function inferProductCategory(query) {
  const tokens = normalizeQueryText(query).split(" ").filter(Boolean);
  const friends = activeFalseFriends(tokens);
  if (friends[0]?.category) return friends[0].category;
  const meaningful = queryTokens(query);
  if (!meaningful.length) return "";
  return meaningful.map((t) => t[0].toUpperCase() + t.slice(1)).join(" ");
}

/**
 * True if product is on-intent for the search query.
 */
export function productMatchesQuery(product, query) {
  const q = normalizeQueryText(query);
  if (q.length < 2) return true;

  const hay = normalizeQueryText(
    [product?.name, product?.brand, product?.quantity].filter(Boolean).join(" ")
  );
  if (!hay) return false;

  const tokens = queryTokens(query);
  // Brand-only queries (e.g. "amul") — keep loose
  const rawTokens = q.split(" ").filter((w) => w.length >= 2);
  const checkTokens = tokens.length ? tokens : rawTokens;

  for (const token of checkTokens) {
    if (!hasWholeWord(hay, token)) {
      // Allow brand token to match brand field only when other tokens match name
      continue;
    }
  }

  // Prefer: every non-stop query token appears as a whole word
  const must = rawTokens.filter((t) => !STOP.has(t) || checkTokens.includes(t));
  const required = must.length ? must : rawTokens;
  for (const token of required) {
    if (!hasWholeWord(hay, token)) return false;
  }

  for (const rule of activeFalseFriends(rawTokens)) {
    if (rule.reject.test(hay)) return false;
  }

  return true;
}

export function filterProductsByQuery(products, query) {
  if (!Array.isArray(products)) return [];
  if (!normalizeQueryText(query)) return products;
  return products.filter((p) => productMatchesQuery(p, query));
}
