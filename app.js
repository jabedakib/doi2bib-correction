// ---------------------------
// Minimal BibTeX parser (MVP) + Consistent formatter
// ---------------------------
// Goals implemented:
// 1) Author names ALWAYS -> "F M Lastname" (no dots, deterministic)
// 2) Materials in title like Bi2Te3, MoS2, MnBi2Te4 -> {Bi$_2$Te$_3$}, {MoS$_2$}, {MnBi$_2$Te$_4$}
// 3) DOI extraction from URL (optional) + enforce URL = https://doi.org/<doi> (optional)
// 4) fix.bib and DOI->Bib share the SAME normalization pipeline (formatEntry)

const $ = (id) => document.getElementById(id);

const tabBib = $("tabBib");
const tabDoi = $("tabDoi");
const paneBib = $("paneBib");
const paneDoi = $("paneDoi");

const bibIn = $("bibIn");
const bibOut = $("bibOut");
const doiIn = $("doiIn");
const doiOut = $("doiOut");

const noDots = $("noDots");
const enforceDoiUrl = $("enforceDoiUrl");
const tryExtractDoi = $("tryExtractDoi");
const status = $("status");

function setStatus(msg) {
  status.textContent = msg || "";
}

// Tabs
tabBib.addEventListener("click", () => {
  paneBib.classList.remove("hidden");
  paneDoi.classList.add("hidden");
  tabBib.className = "flex-1 px-4 py-2 rounded-xl bg-slate-900 text-white";
  tabDoi.className = "flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700";
});

tabDoi.addEventListener("click", () => {
  paneDoi.classList.remove("hidden");
  paneBib.classList.add("hidden");
  tabDoi.className = "flex-1 px-4 py-2 rounded-xl bg-slate-900 text-white";
  tabBib.className = "flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700";
});

// Upload .bib
$("btnUpload").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  bibIn.value = text;
  setStatus(`Loaded ${file.name}`);
});

// Copy/Download
$("btnCopy").addEventListener("click", async () => {
  const activeOut = paneBib.classList.contains("hidden") ? doiOut.value : bibOut.value;
  if (!activeOut.trim()) return setStatus("Nothing to copy.");
  await navigator.clipboard.writeText(activeOut);
  setStatus("Copied to clipboard.");
});

$("btnDownload").addEventListener("click", () => {
  const content = paneBib.classList.contains("hidden") ? doiOut.value : bibOut.value;
  if (!content.trim()) return setStatus("Nothing to download.");
  const blob = new Blob([content], { type: "application/x-bibtex;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bibclean.bib";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Downloaded bibclean.bib");
});

// ---------------------------
// Author normalization (STRICT)
// Output ALWAYS: "F M Lastname" (no dots)
// ---------------------------

function cleanToken(t) {
  // remove dots/commas; keep hyphens and apostrophes
  return (t || "").replace(/[.,]/g, "").trim();
}

function makeInitialsFromGiven(given) {
  // given can be "Albert", "Albert M", "A M", "A. M.", "Albert-Michel"
  const parts = (given || "")
    .replace(/\./g, " ")
    .split(/\s+/)
    .map(cleanToken)
    .filter(Boolean);

  return parts.map(p => p[0].toUpperCase()).join(" ");
}

function normalizeOneAuthorStrict(rawName) {
  let n = (rawName || "").trim();
  if (!n) return "";

  n = n.replace(/\s+/g, " ");

  // If it's a corporate author in braces, keep as-is
  // e.g., author = {{ATLAS Collaboration}}
  if (n.startsWith("{") && n.endsWith("}")) return n;

  // CASE 1: "Lastname, First Middle"
  if (n.includes(",")) {
    const pieces = n.split(",").map(s => s.trim()).filter(Boolean);
    const family = cleanToken(pieces[0] || "");
    const given = pieces.slice(1).join(" ");
    const initials = makeInitialsFromGiven(given);
    const out = `${initials} ${family}`.trim().replace(/\s+/g, " ");
    return noDots?.checked ? out.replace(/\./g, "") : out;
  }

  // CASE 2: "First Middle Lastname" or "F. M. Lastname" etc.
  const tokens = n.split(" ").map(cleanToken).filter(Boolean);
  if (tokens.length === 1) return tokens[0];

  const family = tokens[tokens.length - 1];
  const givenTokens = tokens.slice(0, -1);

  const initials = givenTokens
    .map(gt => (gt ? gt[0].toUpperCase() : ""))
    .filter(Boolean)
    .join(" ");

  const out = `${initials} ${family}`.trim().replace(/\s+/g, " ");
  return noDots?.checked ? out.replace(/\./g, "") : out;
}

function normalizeAuthorsStrict(authorField) {
  const authors = (authorField || "")
    .split(/\s+and\s+/i)
    .map(a => a.trim())
    .filter(Boolean);

  return authors.map(normalizeOneAuthorStrict).join(" and ");
}

// ---------------------------
// Title: materials latexification
// Example: Bi2Te3 -> {Bi$_2$Te$_3$}
// ---------------------------

function latexifyMaterialsInTitle(title) {
  if (!title) return title;

  // If already LaTeX-y, don't touch
  if (title.includes("$_") || title.includes("\\mathrm")) return title;

  // Match tokens that are made of repeated element blocks (>=2) and contain digits
  // Examples: Bi2Te3, MoS2, FePS3, MnBi2Te4, SnS2
  return title.replace(/\b([A-Z][a-z]?\d*){2,}\b/g, (token) => {
    if (!/\d/.test(token)) return token;

    // Convert each element+digits into element$_digits$
    const withSubs = token.replace(/([A-Z][a-z]?)(\d+)/g, (_, el, num) => `${el}$_${num}$`);

    // Wrap whole formula token in braces (as you requested)
    return `{${withSubs}}`;
  });
}

// ---------------------------
// DOI extraction and URL enforcement
// ---------------------------

function extractDoiFromText(text) {
  if (!text) return "";
  const t = text.trim();
  const m = t.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return m ? m[0] : "";
}

function doiUrl(doi) {
  return `https://doi.org/${doi}`;
}

// ---------------------------
// BibTeX parsing (simple)
// ---------------------------

function splitEntries(bib) {
  const raw = (bib || "").split(/(?=@\w+)/g).map(s => s.trim()).filter(Boolean);
  return raw;
}

function parseEntry(entryText) {
  const headMatch = entryText.match(/^@(\w+)\s*\{\s*([^,]+)\s*,/s);
  if (!headMatch) return null;

  const type = headMatch[1].toLowerCase();
  const key = headMatch[2].trim();

  const body = entryText.slice(headMatch[0].length).replace(/\}\s*$/s, "").trim();

  const fields = {};
  const fieldRegex = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,]+)\s*,?/gs;

  let m;
  while ((m = fieldRegex.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    let value = m[2].trim();

    if (value.startsWith("{") && value.endsWith("}")) value = value.slice(1, -1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).trim();

    fields[name] = value;
  }

  return { type, key, fields };
}

function formatEntry({ type, key, fields }) {
  // 1) Authors strict format
  if (fields.author) fields.author = normalizeAuthorsStrict(fields.author);

  // 2) Title materials formatting
  if (fields.title) fields.title = latexifyMaterialsInTitle(fields.title);

  // 3) Try DOI extraction from URL if DOI missing
  if (tryExtractDoi?.checked && !fields.doi && fields.url) {
    const d = extractDoiFromText(fields.url);
    if (d) fields.doi = d;
  }

  // 4) Enforce url from DOI
  if (enforceDoiUrl?.checked && fields.doi) {
    const d = fields.doi.trim();
    fields.doi = d;
    fields.url = doiUrl(d);
  }

  const preferred = ["author", "title", "journal", "booktitle", "year", "volume", "number", "pages", "doi", "url"];
  const lines = [];

  for (const f of preferred) {
    if (fields[f]) lines.push(`  ${f} = {${fields[f]}}`);
  }

  const extra = Object.keys(fields)
    .filter(f => !preferred.includes(f))
    .sort();

  for (const f of extra) {
    lines.push(`  ${f} = {${fields[f]}}`);
  }

  return `@${type}{${key},\n${lines.join(",\n")}\n}\n`;
}

// Main: Bib fix
$("btnFormatBib").addEventListener("click", () => {
  setStatus("");
  const input = bibIn.value || "";
  if (!input.trim()) return setStatus("Paste a .bib first.");

  const entries = splitEntries(input);
  const parsed = entries.map(parseEntry).filter(Boolean);

  if (!parsed.length) return setStatus("Could not detect BibTeX entries.");

  const out = parsed.map(formatEntry).join("\n");
  bibOut.value = out;
  setStatus(`Formatted ${parsed.length} entr${parsed.length === 1 ? "y" : "ies"}.`);
});

$("btnClearBib").addEventListener("click", () => {
  bibIn.value = "";
  bibOut.value = "";
  setStatus("");
});

// ---------------------------
// DOI -> BibTeX (Crossref JSON) -> consistent BibTeX
// ---------------------------

async function fetchCrossrefJson(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Crossref error ${res.status}`);
  const data = await res.json();
  return data.message;
}

function crossrefToBibEntry(msg) {
  const type = "article";
  const year = msg?.issued?.["date-parts"]?.[0]?.[0] ?? "";
  const title = (msg.title && msg.title[0]) ? msg.title[0] : "";
  const journal = (msg["container-title"] && msg["container-title"][0]) ? msg["container-title"][0] : "";
  const volume = msg.volume ?? "";
  const number = msg.issue ?? "";
  const pages = msg.page ?? "";
  const doi = msg.DOI ?? "";
  const url = doi ? `https://doi.org/${doi}` : (msg.URL ?? "");

  // Build a "given family" list; formatter will normalize to "F M Family"
  const authors = (msg.author || []).map(a => {
    const given = a.given ? a.given.trim() : "";
    const family = a.family ? a.family.trim() : "";
    return [given, family].filter(Boolean).join(" ").trim();
  }).filter(Boolean).join(" and ");

  const firstFamily = (msg.author && msg.author[0] && msg.author[0].family) ? msg.author[0].family : "ref";
  const firstWord = title ? title.split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, "") : "paper";
  const key = `${firstFamily}${year}${firstWord}`.replace(/\s+/g, "");

  const fields = {
    author: authors,
    title: title,
    journal: journal,
    year: String(year),
    volume: String(volume),
    number: String(number),
    pages: String(pages),
    doi: doi,
    url: url
  };

  return { type, key, fields };
}

$("btnConvertDoi").addEventListener("click", async () => {
  setStatus("");
  doiOut.value = "";

  const dois = (doiIn.value || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!dois.length) return setStatus("Paste at least one DOI.");

  let combined = "";
  let ok = 0;
  let failed = 0;

  for (const doi of dois) {
    try {
      const msg = await fetchCrossrefJson(doi);
      const entry = crossrefToBibEntry(msg);

      // SAME pipeline as fix.bib
      combined += formatEntry(entry) + "\n";
      ok++;
    } catch (e) {
      combined += `% Failed DOI: ${doi} (${e.message})\n`;
      failed++;
    }
  }

  doiOut.value = combined.trim() + "\n";
  setStatus(`Converted ${ok} DOI(s). Failed: ${failed}.`);
});
