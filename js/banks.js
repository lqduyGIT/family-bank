// ============================================================
// banks.js — Vietnamese bank list via VietQR public API
// Endpoint: https://api.vietqr.io/v2/banks
// Returns: { code, data: [{ id, name, code, bin, shortName, logo, ... }] }
// ============================================================

const VIETQR_BANKS_URL = 'https://api.vietqr.io/v2/banks';
const CACHE_KEY = 'family-bank:banks:v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

let _cache = null;

export async function fetchBanks({ force = false } = {}) {
  if (_cache && !force) return _cache;

  // Try localStorage cache
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { banks, cachedAt } = JSON.parse(raw);
        if (Date.now() - cachedAt < CACHE_TTL && Array.isArray(banks) && banks.length > 0) {
          _cache = banks;
          return banks;
        }
      }
    } catch {}
  }

  // Fresh fetch
  const res = await fetch(VIETQR_BANKS_URL);
  if (!res.ok) throw new Error(`VietQR API ${res.status}`);
  const json = await res.json();
  const banks = (json.data || []).map((b) => ({
    id: b.id,
    name: b.name,           // e.g. "Ngân hàng TMCP Ngoại Thương Việt Nam"
    shortName: b.shortName, // e.g. "Vietcombank"
    code: b.code,           // e.g. "VCB"
    bin: b.bin,             // e.g. "970436"
    logo: b.logo,           // URL
    transferSupported: b.transferSupported,
    lookupSupported: b.lookupSupported,
  }));

  _cache = banks;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ banks, cachedAt: Date.now() })); } catch {}
  return banks;
}

export async function findBank(codeOrBin) {
  if (!codeOrBin) return null;
  const banks = await fetchBanks();
  return banks.find((b) => b.code === codeOrBin || b.bin === codeOrBin || b.shortName === codeOrBin) || null;
}
