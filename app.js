// ---------------------------
// Minimal BibTeX parser (MVP)
// ---------------------------
// This is a simple parser that handles common BibTeX patterns.
// For v2, we can swap in a robust library (e.g., bibtex-parse-js) or build a stronger parser.

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
// Name normalization
// ---------------------------

function initialsFromGiven(given) {
  // given: "Albert Einstein" -> "A E" (but we later keep family separately)
  const parts = given.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map(p => p[0].toUpperCase());
  return letters.join(" ");
}

function normalizeOneAuthor(name) {
  // Handles:
  //  - "Lastname, First Middle"
  //  - "First Middle Lastname"
  //  - "F. Lastname" or "F Lastname"
  let n = name.trim();
  if (!n) return "";

  // remove excessive spaces
  n = n.replace(/\s+/g, " ");

  // If has comma: "Lastname, First Middle"
  if (n.includes(",")) {
    const [familyRaw, givenRaw] = n.split(",").map(s => s.trim());
    const family = familyRaw;
    const given = givenRaw || "";
    const initials = initialsFromGiven(given.replace(/\./g, " "));
    return `${initials} ${family}`.trim().replace(/\s+/g, " ");
  }

  // Else assume "First Middle Last"
  const parts = n.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];

  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  const initials = initialsFromGiven(given.replace(/\./g, " "));
  return `${initials} ${family}`.trim().replace(/\s+/g, " ");
}

function normalizeAuthors(authorField) {
  // BibTeX authors usually separated by " and "
  const authors = authorField.split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);
  let out = authors.map(normalizeOneAuthor).join(" and ");
  if (noDots.checked) out = out.replace(/\./g, "");
  return out;
}

// ---------------------------
// DOI extraction and URL enforcement
// ---------------------------

function extractDoiFromText(text) {
  if (!text) return "";
  const t = text.trim();
  // Common DOI pattern: 10.<digits>/<suffix>
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
  // Split by '@' but keep the '@'
  const raw = bib.split(/(?=@\w+)/g).map(s => s.trim()).filter(Boolean);
  return raw;
}

function parseEntry(entryText) {
  // @type{key, field = {value}, ...}
  const headMatch = entryText.match(/^@(\w+)\s*\{\s*([^,]+)\s*,/s);
  if (!headMatch) return null;

  const type = headMatch[1].toLowerCase();
  const key = headMatch[2].trim();

  const body = entryText.slice(headMatch[0].length).replace(/\}\s*$/s, "").trim();

  // Parse fields (very common patterns: field = {...} or "..." )
  const fields = {};
  const fieldRegex = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,]+)\s*,?/gs;

  let m;
  while ((m = fieldRegex.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    let value = m[2].trim();

    // strip wrapping quotes/braces lightly
    if (value.startsWith("{") && value.endsWith("}")) value = value.slice(1, -1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).trim();

    fields[name] = value;
  }

  return { type, key, fields };
}

function formatEntry({ type, key, fields }) {
  // Normalize authors
  if (fields.author) fields.author = normalizeAuthors(fields.author);

  // Try DOI extraction from URL if DOI missing
  if (tryExtractDoi.checked && !fields.doi && fields.url) {
    const d = extractDoiFromText(fields.url);
    if (d) fields.doi = d;
  }

  // Enforce url from DOI
  if (enforceDoiUrl.checked && fields.doi) {
    const d = fields.doi.trim();
    fields.doi = d;
    fields.url = doiUrl(d);
  }

  // Preferred field order
  const preferred = ["author", "title", "journal", "booktitle", "year", "volume", "number", "pages", "doi", "url"];
  const lines = [];

  for (const f of preferred) {
    if (fields[f]) lines.push(`  ${f} = {${fields[f]}}`);
  }

  // Include any other fields (kept at end)
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
// DOI -> BibTeX (Crossref)
// ---------------------------

async function fetchBibtexFromCrossref(doi) {
  // Crossref transform endpoint
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/x-bibtex`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Crossref error for ${doi}: ${res.status}`);
  return await res.text();
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
      const rawBib = await fetchBibtexFromCrossref(doi);
      // Normalize fetched bib
      const parsed = parseEntry(rawBib);
      if (!parsed) throw new Error("Received unparseable BibTeX.");
      // Make sure DOI recorded even if missing in bib
      if (!parsed.fields.doi) parsed.fields.doi = doi;
      combined += formatEntry(parsed) + "\n";
      ok++;
    } catch (e) {
      combined += `% Failed DOI: ${doi} (${e.message})\n`;
      failed++;
    }
  }

  doiOut.value = combined.trim() + "\n";
  setStatus(`Converted ${ok} DOI(s). Failed: ${failed}.`);
});
