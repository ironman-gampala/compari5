import { searchBlinkit } from "./blinkit.js";
import { searchInstamart } from "./instamart.js";
import { searchZepto } from "./zepto.js";
import { searchBigbasket } from "./bigbasket.js";

export const PLATFORMS = ["blinkit", "instamart", "zepto", "bigbasket"];

const adapters = {
  blinkit: searchBlinkit,
  zepto: searchZepto,
  bigbasket: searchBigbasket,
};

export async function searchAll(query, lat, lng, options = {}) {
  const only = options.platform;
  const platforms =
    only && PLATFORMS.includes(only) ? [only] : PLATFORMS;

  const entries = await Promise.all(
    platforms.map(async (platform) => {
      try {
        if (platform === "instamart") {
          const result = await searchInstamart(query, lat, lng, options);
          return {
            platform,
            products: result.products,
            error: null,
            meta: result.meta || null,
          };
        }
        const products = await adapters[platform](query, lat, lng, options);
        return { platform, products, error: null, meta: null };
      } catch (err) {
        return {
          platform,
          products: [],
          error: err?.message || String(err),
          meta: null,
        };
      }
    })
  );

  return Object.fromEntries(
    entries.map((e) => [
      e.platform,
      { products: e.products, error: e.error, meta: e.meta },
    ])
  );
}
