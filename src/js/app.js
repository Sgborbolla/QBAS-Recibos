// Lógica principal del generador de recibos (versión PRO)
let items = [];
let lang = "es";
let issuerLogoData = "";
let folioCounter = 1;

const $ = (id) => document.getElementById(id);

// ---------- Utilidades ----------
function fmtNum(n) {
  const value = isFinite(n) ? n : 0;
  return new Intl.NumberFormat(LANG === "en" ? "en-US" : "es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function currentSymbol() {
  const sel = $("currency-select").value;
  if (sel === "custom") {
    return ($("currency-custom").value || "").trim() || "$";
  }
  const c = CURRENCIES.find((x) => x.code === sel);
  return c ? c.symbol : "$";
}

function money(n) {
  const s = currentSymbol();
  const num = fmtNum(n);
  return $("currency-position").value === "after" ? `${num} ${s}` : `${s} ${num}`;
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return LANG === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

function padFolio(n) {
  return String(n).padStart(4, "0");
}

function fullFolio() {
  const prefix = $("folio-prefix").value || "";
  const num = $("receipt-folio").value || "";
  return `${prefix}${num}`;
}

// ---------- Idioma ----------
function setLang(l) {
  lang = l;
  LANG = l;
  try { localStorage.setItem("qbas_lang", l); } catch (e) {}
  document.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("active"));
  $(l === "es" ? "btn-es" : "btn-en").classList.add("active");
  applyI18n();
  buildCurrencyOptions();
  renderItems();
  updateReceipt();
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = lang;
  document.title = t("title");
}

// ---------- Moneda ----------
function buildCurrencyOptions() {
  const sel = $("currency-select");
  const prev = sel.value || "USD";
  sel.innerHTML = "";
  CURRENCIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = `${c.symbol} - ${c.code} (${lang === "en" ? c.en : c.es})`;
    sel.appendChild(opt);
  });
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = t("custom_currency_label");
  sel.appendChild(custom);
  sel.value = prev;
  if (!sel.value) sel.value = "USD";
}

// ---------- Filas de conceptos ----------
function addItem(qty, desc, price) {
  items.push({ qty: qty ?? 1, desc: desc ?? "", price: price ?? 0 });
  renderItems();
  updateReceipt();
  saveState();
}

function removeItem(idx) {
  items.splice(idx, 1);
  if (items.length === 0) items.push({ qty: 1, desc: "", price: 0 });
  renderItems();
  updateReceipt();
  saveState();
}

function duplicateItem(idx) {
  const it = items[idx];
  items.splice(idx + 1, 0, { qty: it.qty, desc: it.desc, price: it.price });
  renderItems();
  updateReceipt();
  saveState();
}

function renderItems() {
  const box = $("items");
  box.innerHTML = "";
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      `<input type="number" class="i-qty" min="0" step="0.01" value="${it.qty}" placeholder="${t("qty")}">` +
      `<input type="text" class="i-desc" value="${escapeAttr(it.desc)}" placeholder="${t("description")}">` +
      `<input type="number" class="i-price" min="0" step="0.01" value="${it.price}" placeholder="${t("unit_price")}">` +
      `<input type="text" class="i-amount" readonly value="${fmtNum((it.qty || 0) * (it.price || 0))}" placeholder="${t("amount")}">` +
      `<button type="button" class="dup" title="⧉">⧉</button>` +
      `<button type="button" class="del" title="×">×</button>`;
    row.querySelector(".i-qty").addEventListener("input", (e) => {
      items[idx].qty = parseFloat(e.target.value) || 0;
      refreshAmount(row, idx);
    });
    row.querySelector(".i-desc").addEventListener("input", (e) => {
      items[idx].desc = e.target.value;
      updateReceipt();
      saveState();
    });
    row.querySelector(".i-price").addEventListener("input", (e) => {
      items[idx].price = parseFloat(e.target.value) || 0;
      refreshAmount(row, idx);
    });
    row.querySelector(".dup").addEventListener("click", () => duplicateItem(idx));
    row.querySelector(".del").addEventListener("click", () => removeItem(idx));
    box.appendChild(row);
  });
}

function refreshAmount(row, idx) {
  const amount = (items[idx].qty || 0) * (items[idx].price || 0);
  row.querySelector(".i-amount").value = fmtNum(amount);
  updateReceipt();
  saveState();
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Cálculos ----------
function computeTotals() {
  const subtotal = items.reduce((sum, it) => sum + (it.qty || 0) * (it.price || 0), 0);
  const type = $("discount-type").value;
  const raw = parseFloat($("discount-value").value) || 0;
  let discount = type === "percent" ? (subtotal * raw) / 100 : raw;
  if (discount < 0) discount = 0;
  if (discount > subtotal) discount = subtotal;
  const base = subtotal - discount;
  const tax = $("tax-enabled").checked ? base * ((parseFloat($("tax-rate").value) || 0) / 100) : 0;
  return { subtotal, discount, tax, total: base + tax };
}

// ---------- Aplicar plantilla / color ----------
function applyTheme() {
  const theme = $("theme-select").value || "classic";
  const receipt = $("receipt");
  receipt.classList.remove("theme-classic", "theme-modern", "theme-compact");
  receipt.classList.add("theme-" + theme);
}
function applyAccent() {
  document.documentElement.style.setProperty("--accent", $("accent-color").value);
}

// ---------- Vista previa del recibo ----------
function updateReceipt() {
  $("r-issuer-name").textContent = $("issuer-name").value;
  $("r-issuer-address").textContent = $("issuer-address").value;
  $("r-issuer-phone").textContent = $("issuer-phone").value;
  $("r-issuer-taxid").textContent = $("issuer-taxid").value;

  $("r-client-name").textContent = $("client-name").value;
  $("r-client-address").textContent = $("client-address").value;
  $("r-client-phone").textContent = $("client-phone").value;
  $("r-client-taxid").textContent = $("client-taxid").value;

  $("r-folio").textContent = fullFolio();
  $("r-date").textContent = formatDate($("receipt-date").value);
  $("r-receipt-word").textContent = t("receipt_word");

  // vencimiento
  const due = $("receipt-duedate").value;
  if (due) {
    $("r-duedate-row").classList.remove("hidden");
    $("r-duedate").textContent = formatDate(due);
  } else {
    $("r-duedate-row").classList.add("hidden");
  }

  // estado
  const st = $("receipt-status").value;
  const statusEl = $("r-status");
  statusEl.textContent = st === "paid" ? t("status_paid") : t("status_pending");
  statusEl.className = "r-status " + (st === "paid" ? "paid" : "pending");

  // logo
  const logo = $("receipt-logo");
  if (issuerLogoData) {
    logo.src = issuerLogoData;
    logo.classList.remove("hidden");
  } else {
    logo.classList.add("hidden");
  }

  // filas impresas
  const tbody = $("r-items");
  tbody.innerHTML = "";
  const dl = (s) => String(s == null ? "" : s).replace(/"/g, "&quot;");
  items.forEach((it) => {
    if (!it.desc && !it.price) return;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="c-qty" data-label="${dl(t("qty"))}">${fmtNum(it.qty || 0)}</td>` +
      `<td class="c-desc" data-label="${dl(t("description"))}">${escapeHtml(it.desc)}</td>` +
      `<td class="c-price" data-label="${dl(t("unit_price"))}">${money(it.price || 0)}</td>` +
      `<td class="c-amount" data-label="${dl(t("amount"))}">${money((it.qty || 0) * (it.price || 0))}</td>`;
    tbody.appendChild(tr);
  });

  const { subtotal, discount, tax, total } = computeTotals();
  $("r-subtotal").textContent = money(subtotal);

  if (discount > 0) {
    $("r-discount-row").classList.remove("hidden");
    $("r-discount").textContent = "- " + money(discount);
  } else {
    $("r-discount-row").classList.add("hidden");
  }

  if ($("tax-enabled").checked && tax > 0) {
    $("r-tax-row").classList.remove("hidden");
    $("r-tax-label").textContent = ($("tax-name").value || "IVA") + " (" + (parseFloat($("tax-rate").value) || 0) + "%)";
    $("r-tax").textContent = money(tax);
  } else {
    $("r-tax-row").classList.add("hidden");
  }

  $("r-total").textContent = money(total);

  // pago
  const payKey = "pay_" + $("payment-method").value;
  $("r-payment").textContent = t(payKey);

  // firma
  $("r-sign").classList.toggle("hidden", !$("sign-enabled").checked);

  $("r-notes").textContent = $("notes").value;
}

// ---------- Folio ----------
function setFolio(n) {
  folioCounter = n;
  $("receipt-folio").value = padFolio(n);
}

function newReceipt() {
  folioCounter += 1;
  setFolio(folioCounter);
  $("client-name").value = "";
  $("client-address").value = "";
  $("client-phone").value = "";
  $("client-taxid").value = "";
  $("notes").value = "";
  $("discount-value").value = 0;
  $("tax-rate").value = 0;
  $("tax-enabled").checked = false;
  $("sign-enabled").checked = false;
  $("receipt-duedate").value = "";
  $("receipt-date").value = todayISO();
  $("receipt-status").value = "paid";
  items = [{ qty: 1, desc: "", price: 0 }];
  renderItems();
  updateReceipt();
  saveState();
}

// ---------- Estado ----------
function buildState() {
  return {
    lang,
    theme: $("theme-select").value,
    accent: $("accent-color").value,
    folioCounter,
    items,
    issuerLogoData,
    fields: {
      issuerName: $("issuer-name").value,
      issuerAddress: $("issuer-address").value,
      issuerPhone: $("issuer-phone").value,
      issuerTaxId: $("issuer-taxid").value,
      clientName: $("client-name").value,
      clientAddress: $("client-address").value,
      clientPhone: $("client-phone").value,
      clientTaxId: $("client-taxid").value,
      date: $("receipt-date").value,
      dueDate: $("receipt-duedate").value,
      folioPrefix: $("folio-prefix").value,
      payment: $("payment-method").value,
      status: $("receipt-status").value,
      currency: $("currency-select").value,
      custom: $("currency-custom").value,
      currencyPosition: $("currency-position").value,
      discountType: $("discount-type").value,
      discountValue: $("discount-value").value,
      taxEnabled: $("tax-enabled").checked,
      taxName: $("tax-name").value,
      taxRate: $("tax-rate").value,
      notes: $("notes").value,
      signEnabled: $("sign-enabled").checked
    }
  };
}

function saveState() {
  try { localStorage.setItem("qbas_state", JSON.stringify(buildState())); } catch (e) {}
}

function applyState(data) {
  if (!data) return;
  const f = data.fields || {};
  lang = data.lang || "es";
  LANG = lang;
  folioCounter = data.folioCounter || 1;
  issuerLogoData = data.issuerLogoData || "";
  items = Array.isArray(data.items) && data.items.length ? data.items : [{ qty: 1, desc: "", price: 0 }];

  $("theme-select").value = data.theme || "classic";
  $("accent-color").value = data.accent || "#1f6feb";

  $("issuer-name").value = f.issuerName || "";
  $("issuer-address").value = f.issuerAddress || "";
  $("issuer-phone").value = f.issuerPhone || "";
  $("issuer-taxid").value = f.issuerTaxId || "";
  $("client-name").value = f.clientName || "";
  $("client-address").value = f.clientAddress || "";
  $("client-phone").value = f.clientPhone || "";
  $("client-taxid").value = f.clientTaxId || "";
  $("receipt-date").value = f.date || todayISO();
  $("receipt-duedate").value = f.dueDate || "";
  $("folio-prefix").value = f.folioPrefix || "";
  $("payment-method").value = f.payment || "cash";
  $("receipt-status").value = f.status || "paid";
  $("currency-custom").value = f.custom || "";
  $("currency-position").value = f.currencyPosition || "before";
  $("discount-type").value = f.discountType || "amount";
  $("discount-value").value = f.discountValue ?? 0;
  $("tax-enabled").checked = !!f.taxEnabled;
  $("tax-name").value = f.taxName || "IVA";
  $("tax-rate").value = f.taxRate ?? 0;
  $("notes").value = f.notes || "";
  $("sign-enabled").checked = !!f.signEnabled;

  buildCurrencyOptions();
  $("currency-select").value = f.currency || "USD";
  toggleCustom();
  setFolio(folioCounter);
  applyTheme();
  applyAccent();
}

function loadState() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem("qbas_state") || "null"); } catch (e) {}
  if (!data) {
    lang = "es";
    LANG = lang;
    setFolio(1);
    $("receipt-date").value = todayISO();
    items = [{ qty: 1, desc: "", price: 0 }];
    return;
  }
  applyState(data);
}

// ---------- Historial ----------
function getHistory() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem("qbas_history") || "[]"); } catch (e) {}
  return Array.isArray(h) ? h : [];
}

function setHistory(h) {
  try { localStorage.setItem("qbas_history", JSON.stringify(h)); } catch (e) {}
}

function saveToHistory() {
  const { total } = computeTotals();
  const h = getHistory();
  h.unshift({
    id: Date.now(),
    folio: fullFolio(),
    client: $("client-name").value,
    total: money(total),
    savedAt: new Date().toISOString().slice(0, 10),
    data: buildState()
  });
  setHistory(h.slice(0, 50));
  toast(t("saved_ok"));
}

function renderHistory() {
  const list = $("history-list");
  const h = getHistory();
  list.innerHTML = "";
  if (h.length === 0) {
    list.innerHTML = `<p class="empty">${t("empty_history")}</p>`;
    return;
  }
  h.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML =
      `<div class="hi-info">` +
        `<strong>${escapeHtml(entry.folio || "-")}</strong>` +
        `<span>${escapeHtml(entry.client || "")}</span>` +
        `<span>${escapeHtml(entry.total || "")}</span>` +
        `<small>${escapeHtml(entry.savedAt || "")}</small>` +
      `</div>` +
      `<div class="hi-actions">` +
        `<button type="button" class="btn small load">${t("load")}</button>` +
        `<button type="button" class="btn small danger del">${t("delete")}</button>` +
      `</div>`;
    row.querySelector(".load").addEventListener("click", () => {
      applyState(entry.data);
      saveState();
      closeHistory();
    });
    row.querySelector(".del").addEventListener("click", () => {
      const nh = getHistory().filter((x) => x.id !== entry.id);
      setHistory(nh);
      renderHistory();
    });
    list.appendChild(row);
  });
}

function openHistory() {
  renderHistory();
  $("history-modal").classList.remove("hidden");
}
function closeHistory() {
  $("history-modal").classList.add("hidden");
}

// ---------- Exportar / Importar ----------
function collectCss() {
  let css = "";
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += rule.cssText + "\n";
    } catch (e) { /* hoja ajena: se omite */ }
  }
  return css;
}

function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// En la app (escritorio/Android) guarda en la carpeta; en el navegador descarga.
async function saveOrDownload(name, text, type) {
  const saved = await writeFileToFolder(name, new TextEncoder().encode(text));
  if (!saved) downloadFile(name, text, type);
}

function exportHTML() {
  const css = collectCss();
  const accent = $("accent-color").value;
  const receiptHtml = $("receipt").outerHTML;
  const data = JSON.stringify(buildState()).replace(/<\//g, "<\\/");
  const html =
`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t("title")} - ${escapeHtml(fullFolio())}</title>
<style>
${css}
:root { --accent: ${accent}; }
body { margin: 0; padding: 24px; background: var(--bg, #eef1f6); }
</style>
</head>
<body>
${receiptHtml}
<script id="qbas-data" type="application/json">${data}</script>
</body>
</html>`;
  saveOrDownload(`QBAS-Recibo-${fullFolio() || "sin-folio"}.html`, html, "text/html");
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      const m = text.match(/<script id="qbas-data" type="application\/json">([\s\S]*?)<\/script>/);
      if (m) {
        try { data = JSON.parse(m[1]); } catch (e2) { data = null; }
      }
    }
    if (data) {
      applyState(data);
      saveState();
      toast(t("import_ok"));
    } else {
      toast(t("import_error"));
    }
  };
  reader.readAsText(file);
}

// ---------- Aviso (toast) ----------
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast no-print";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1800);
}

// ---------- Base de datos local + Excel automático ----------
const DATA_FOLDER = "QBAS-Recibos";
const EXCEL_NAME = "QBAS-Recibos-BaseDeDatos.xlsx";

function getDB() {
  try {
    const d = JSON.parse(localStorage.getItem("qbas_db") || "[]");
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}

function setDB(db) {
  try { localStorage.setItem("qbas_db", JSON.stringify(db)); } catch (e) {}
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  const date = LANG === "en"
    ? `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`
    : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  let h = d.getHours();
  const ampm = h < 12
    ? (LANG === "en" ? "AM" : "a. m.")
    : (LANG === "en" ? "PM" : "p. m.");
  h = h % 12; if (h === 0) h = 12;
  return `${date} ${h}:${p(d.getMinutes())} ${ampm}`;
}

function buildReceiptRecord() {
  const { subtotal, discount, tax, total } = computeTotals();
  const sel = $("currency-select").value;
  const iso = new Date().toISOString();
  return {
    datetime: formatDateTime(iso),
    datetimeISO: iso,
    folio: fullFolio(),
    clientName: $("client-name").value,
    clientTaxId: $("client-taxid").value,
    clientPhone: $("client-phone").value,
    clientAddress: $("client-address").value,
    currencyCode: sel === "custom" ? ($("currency-custom").value || "").trim() : sel,
    currencySymbol: currentSymbol(),
    date: $("receipt-date").value,
    dueDate: $("receipt-duedate").value,
    payment: $("payment-method").value,
    status: $("receipt-status").value,
    subtotal, discount, tax, total,
    issuerName: $("issuer-name").value,
    items: items.filter((it) => it.desc || it.price).map((it) => ({
      qty: it.qty || 0, desc: it.desc || "", price: it.price || 0,
      amount: (it.qty || 0) * (it.price || 0)
    }))
  };
}

// Se llama cada vez que se genera/guarda una factura
function recordReceipt() {
  try {
    const rec = buildReceiptRecord();
    if (!rec.clientName && !rec.folio && (!rec.items || rec.items.length === 0)) return;
    const db = getDB();
    const idx = rec.folio ? db.findIndex((x) => x.folio && x.folio === rec.folio) : -1;
    if (idx >= 0) db[idx] = rec; else db.unshift(rec);
    setDB(db.slice(0, 5000));
    Promise.all([autoSaveExcel(), backupDB()]).then((r) => { if (r[0]) toast(t("db_updated")); });
  } catch (e) { /* nunca romper la app */ }
}

// ---------- Constructor de .xlsx (ZIP + CRC32, sin librerías) ----------
function xesc(s) {
  return String(s == null ? "" : s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function colLetter(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cleanSheetName(n) {
  return String(n).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Hoja";
}

function sheetXML(title, headers, rows, widths) {
  let cols = "";
  if (widths && widths.length) {
    cols = "<cols>" + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>";
  }
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  xml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  xml += cols + `<sheetData>`;
  let r = 0;
  if (title) {
    r++;
    xml += `<row r="${r}" ht="26" customHeight="1"><c r="A${r}" s="4" t="inlineStr"><is><t>${xesc(title)}</t></is></c></row>`;
  }
  r++;
  xml += `<row r="${r}" ht="20" customHeight="1">` +
    headers.map((h, i) => `<c r="${colLetter(i + 1)}${r}" s="1" t="inlineStr"><is><t>${xesc(h)}</t></is></c>`).join("") +
    `</row>`;
  rows.forEach((row) => {
    r++;
    xml += `<row r="${r}">` + row.map((cell, i) => {
      const ref = colLetter(i + 1) + r;
      if (cell === null || cell === undefined || cell === "") return `<c r="${ref}" s="2"/>`;
      if (typeof cell === "number" && isFinite(cell)) return `<c r="${ref}" s="3"><v>${cell}</v></c>`;
      return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xesc(cell)}</t></is></c>`;
    }).join("") + `</row>`;
  });
  xml += `</sheetData></worksheet>`;
  return xml;
}

function crc32Table() {
  if (crc32Table._t) return crc32Table._t;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  crc32Table._t = t;
  return t;
}

function crc32(bytes) {
  const t = crc32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ t[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const push = (u8) => { parts.push(u8); offset += u8.length; };

  files.forEach((f) => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;
    const localOffset = offset;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lh.set(nameBytes, 30);
    push(lh);
    push(dataBytes);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, localOffset, true);
    ch.set(nameBytes, 46);
    central.push(ch);
  });

  const centralStart = offset;
  let centralSize = 0;
  central.forEach((c) => { push(c); centralSize += c.length; });

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  push(end);

  let total = 0;
  parts.forEach((p) => { total += p.length; });
  const out = new Uint8Array(total);
  let pos = 0;
  parts.forEach((p) => { out.set(p, pos); pos += p.length; });
  return out;
}

function buildXlsx() {
  const db = getDB().slice().sort((a, b) => ((a.datetimeISO || a.datetime) < (b.datetimeISO || b.datetime) ? 1 : -1));

  const n = (v) => (typeof v === "number" && isFinite(v) ? v : (parseFloat(v) || 0));

  const hR = [t("xls_datetime"), t("folio"), t("client_section"), t("xls_taxid"), t("xls_phone"),
    t("currency"), t("subtotal"), t("discount"), t("xls_tax"), t("total"), t("status"), t("payment")];
  const rowsR = db.map((r) => [
    formatDateTime(r.datetime), r.folio, r.clientName, r.clientTaxId, r.clientPhone,
    r.currencyCode || r.currencySymbol, n(r.subtotal), n(r.discount), n(r.tax), n(r.total),
    r.status === "paid" ? t("status_paid") : t("status_pending"), t("pay_" + r.payment)
  ]);
  const wR = [20, 12, 22, 16, 16, 10, 12, 12, 12, 12, 12, 14];

  const map = {};
  db.forEach((r) => {
    const name = (r.clientName || "").trim() || "—";
    const key = name + "|" + (r.clientTaxId || "");
    if (!map[key]) map[key] = { name, tax: r.clientTaxId || "", phone: r.clientPhone || "", addr: r.clientAddress || "", count: 0, total: 0 };
    map[key].count++;
    map[key].total += n(r.total);
    if (!map[key].phone && r.clientPhone) map[key].phone = r.clientPhone;
    if (!map[key].addr && r.clientAddress) map[key].addr = r.clientAddress;
  });
  const clients = Object.keys(map).map((k) => map[k]).sort((a, b) => b.total - a.total);
  const hC = [t("client_section"), t("xls_taxid"), t("xls_phone"), t("xls_address"), t("xls_count"), t("total")];
  const rowsC = clients.map((c) => [c.name, c.tax, c.phone, c.addr, c.count, c.total]);
  const wC = [24, 16, 16, 28, 16, 14];

  const hI = [t("xls_field"), t("xls_value")];
  const rowsI = [
    [t("issuer_name"), $("issuer-name").value],
    [t("xls_taxid"), $("issuer-taxid").value],
    [t("issuer_phone"), $("issuer-phone").value],
    [t("issuer_address"), $("issuer-address").value],
    [t("xls_datetime"), formatDateTime(new Date().toISOString())]
  ];
  const wI = [24, 42];

  const sheets = [
    { name: t("xls_sheet_receipts"), data: sheetXML(t("xls_title_receipts"), hR, rowsR, wR) },
    { name: t("xls_sheet_clients"), data: sheetXML(t("xls_title_clients"), hC, rowsC, wC) },
    { name: t("xls_sheet_issuer"), data: sheetXML(t("xls_title_issuer"), hI, rowsI, wI) }
  ];

  const sheetOverrides = sheets.map((s, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const rels = sheets.map((s, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheetOverrides +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` + sheets.map((s, i) => `<sheet name="${xesc(cleanSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets>` +
    `</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="3">` +
    `<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="15"/><color rgb="FF1F6FEB"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FFD9DEE8"/></left><right style="thin"><color rgb="FFD9DEE8"/></right><top style="thin"><color rgb="FFD9DEE8"/></top><bottom style="thin"><color rgb="FFD9DEE8"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="5">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`;

  const files = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: wbRels },
    { name: "xl/styles.xml", data: styles }
  ];
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.data }));

  return zipStore(files);
}

// ---------- Constructor de PDF (sin librerías) ----------
const WINANSI = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

function toWinAnsi(str) {
  let out = "";
  for (const ch of String(str == null ? "" : str)) {
    const code = ch.codePointAt(0);
    if (code <= 0xFF) out += String.fromCharCode(code);
    else if (WINANSI[code] !== undefined) out += String.fromCharCode(WINANSI[code]);
    else out += "?";
  }
  return out;
}

function pdfEsc(str) {
  return toWinAnsi(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function latin1Bytes(str) {
  const a = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 0xFF;
  return a;
}

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return [31, 111, 235];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function buildPdf() {
  const W = 595.28, H = 841.89, M = 50;
  const ops = [];
  const rgb = (c) => `${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)}`;
  const accent = hexRgb($("accent-color").value);
  const dark = [31, 41, 55], gray = [107, 114, 128], line = [222, 226, 232];
  const factor = (bold) => (bold ? 0.56 : 0.52);
  const textWidth = (str, size, bold) => toWinAnsi(str).length * size * factor(bold);
  const setFill = (c) => ops.push(`${rgb(c)} rg`);
  const setStroke = (c, w) => ops.push(`${rgb(c)} RG ${w} w`);
  const text = (x, y, str, size, bold, c) => {
    ops.push(`${rgb(c)} rg`);
    ops.push("BT");
    ops.push(`${bold ? "/F2" : "/F1"} ${size} Tf`);
    ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    ops.push(`(${pdfEsc(str)}) Tj`);
    ops.push("ET");
  };
  const textR = (xRight, y, str, size, bold, c) => text(xRight - textWidth(str, size, bold), y, str, size, bold, c);
  const rectFill = (x, y, w, h, c) => { setFill(c); ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const hline = (x1, y, x2, c, w) => { setStroke(c, w || 0.7); ops.push(`${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`); };

  let y = H - 54;
  rectFill(M, H - 52, W - 2 * M, 4, accent);

  const issuerName = $("issuer-name").value || "—";
  text(M, H - 84, issuerName, 17, true, dark);
  let iy = H - 100, i = 0;
  const issuerLines = [$("issuer-address").value, $("issuer-phone").value,
    ($("issuer-taxid").value ? t("xls_taxid") + ": " + $("issuer-taxid").value : "")].filter(Boolean);
  issuerLines.forEach((l) => { text(M, iy - i * 13, l, 9.5, false, gray); i++; });

  textR(W - M, H - 80, t("receipt_word"), 22, true, accent);
  textR(W - M, H - 98, `${t("folio")}: ${fullFolio() || "—"}`, 10, false, dark);
  textR(W - M, H - 112, `${t("date")}: ${formatDate($("receipt-date").value)}`, 10, false, gray);
  if ($("receipt-duedate").value) textR(W - M, H - 126, `${t("due_date")}: ${formatDate($("receipt-duedate").value)}`, 10, false, gray);

  y = Math.min(H - 130, iy - issuerLines.length * 13 - 6);
  hline(M, y, W - M, line, 0.8);

  // Cliente
  y -= 20;
  text(M, y, t("client_section").toUpperCase(), 8.5, true, gray);
  y -= 15;
  text(M, y, $("client-name").value || "—", 11.5, true, dark);
  const cli = [$("client-address").value, $("client-phone").value,
    ($("client-taxid").value ? t("xls_taxid") + ": " + $("client-taxid").value : "")].filter(Boolean);
  cli.forEach((l) => { y -= 13; text(M, y, l, 9.5, false, gray); });

  // Tabla
  y -= 26;
  const cQty = M + 8, cDesc = M + 60, cPriceR = M + 400, cAmountR = W - M - 8;
  const rowH = 19;
  rectFill(M, y - 5, W - 2 * M, rowH, accent);
  const headY = y + 1;
  text(cQty, headY, t("qty"), 9.5, true, [255, 255, 255]);
  text(cDesc, headY, t("description"), 9.5, true, [255, 255, 255]);
  textR(cPriceR, headY, t("unit_price"), 9.5, true, [255, 255, 255]);
  textR(cAmountR, headY, t("amount"), 9.5, true, [255, 255, 255]);
  y -= rowH;

  const rows = items.filter((it) => it.desc || it.price);
  rows.forEach((it, idx) => {
    y -= rowH;
    if (idx % 2 === 1) rectFill(M, y - 5, W - 2 * M, rowH, [246, 248, 251]);
    let desc = toWinAnsi(it.desc || "");
    const maxW = (cPriceR - 24) - cDesc;
    while (textWidth(desc, 9.5, false) > maxW && desc.length > 1) desc = desc.slice(0, -1);
    if (desc !== toWinAnsi(it.desc || "")) desc = desc.slice(0, -1) + "…";
    text(cQty, y + 1, String(it.qty || 0), 9.5, false, dark);
    text(cDesc, y + 1, desc, 9.5, false, dark);
    textR(cPriceR, y + 1, money(it.price || 0), 9.5, false, dark);
    textR(cAmountR, y + 1, money((it.qty || 0) * (it.price || 0)), 9.5, false, dark);
  });
  y -= 8;
  hline(M, y, W - M, line, 0.8);

  // Totales
  const { subtotal, discount, tax, total } = computeTotals();
  const labelX = W - M - 210, valR = W - M - 8;
  const totRow = () => { y -= 16; };
  totRow(); text(labelX, y, t("subtotal"), 10, false, gray); textR(valR, y, money(subtotal), 10, false, dark);
  if (discount > 0) { totRow(); text(labelX, y, t("discount"), 10, false, gray); textR(valR, y, "- " + money(discount), 10, false, dark); }
  if ($("tax-enabled").checked && tax > 0) {
    totRow();
    const tn = ($("tax-name").value || "IVA") + " (" + (parseFloat($("tax-rate").value) || 0) + "%)";
    text(labelX, y, tn, 10, false, gray); textR(valR, y, money(tax), 10, false, dark);
  }
  y -= 8;
  hline(labelX, y, W - M, line, 0.8);
  y -= 24;
  text(labelX, y, t("total"), 13, true, dark); textR(valR, y, money(total), 13, true, accent);

  // Pago / estado
  y -= 34;
  text(M, y, t("payment") + ": " + t("pay_" + $("payment-method").value), 10, false, gray);
  textR(W - M, y, t("status") + ": " + ($("receipt-status").value === "paid" ? t("status_paid") : t("status_pending")), 10, true,
    $("receipt-status").value === "paid" ? [22, 163, 74] : [217, 119, 6]);

  // Notas
  if ($("notes").value) { y -= 30; text(M, y, t("notes_section").toUpperCase(), 8.5, true, gray); y -= 14; text(M, y, $("notes").value, 10, false, dark); }

  // Firma
  if ($("sign-enabled").checked) {
    y -= 60;
    hline(M, y, M + 180, dark, 0.8);
    text(M, y - 13, t("signature"), 9, false, gray);
  }

  // Pie
  const foot1 = "© 2026 QBASWING DESIGNER — Dr. Sergio Grabiel Borbolla Verdecia.";
  const foot2 = t("footer_version");
  setFill(gray);
  text((W - textWidth(foot1, 8, false)) / 2, M + 8, foot1, 8, false, gray);
  text((W - textWidth(foot2, 8, false)) / 2, M - 4, foot2, 8, false, gray);

  const content = ops.join("\n");
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>";
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let file = "%PDF-1.4\n";
  const offsets = [];
  for (let k = 1; k <= 6; k++) {
    offsets[k] = file.length;
    file += `${k} 0 obj\n${objs[k]}\nendobj\n`;
  }
  const xrefPos = file.length;
  file += "xref\n0 7\n0000000000 65535 f \n";
  for (let k = 1; k <= 6; k++) file += String(offsets[k]).padStart(10, "0") + " 00000 n \n";
  file += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return latin1Bytes(file);
}

async function savePdfAuto() {
  try {
    const buf = buildPdf();
    const name = `QBAS-Recibo-${fullFolio() || "sin-folio"}.pdf`;
    return await writeFileToFolder(name, buf);
  } catch (e) { return false; }
}

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Escribe un archivo dentro de Descargas/QBAS-Recibos (crea la carpeta la 1ª vez)
async function writeFileToFolder(name, bytes) {
  // --- Escritorio (Neutralino) ---
  if (typeof Neutralino !== "undefined" && Neutralino.filesystem) {
    try {
      let dir = ".";
      try {
        const downloads = await Neutralino.os.getPath("downloads");
        if (downloads) dir = downloads + "/" + DATA_FOLDER;
      } catch (e) { /* usa carpeta de la app */ }
      try { await Neutralino.filesystem.createDirectory(dir); } catch (e) {}
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await Neutralino.filesystem.writeBinaryFile(dir + "/" + name, buf);
      return true;
    } catch (e) { return false; }
  }

  // --- Android (Capacitor Filesystem): guarda en TODAS las ubicaciones a la vez ---
  if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem) {
    const FS = Capacitor.Plugins.Filesystem;
    let ok = false;
    try {
      try {
        const perm = await FS.checkPermissions();
        if (perm && (perm.publicStorage === "denied" || perm.publicStorage === "prompt")) {
          await FS.requestPermissions();
        }
      } catch (e) {}
      const b64 = bytesToBase64(bytes);
      const targets = [
        { path: "Download/" + DATA_FOLDER + "/" + name, directory: "EXTERNAL_STORAGE" },
        { path: DATA_FOLDER + "/" + name, directory: "DOCUMENTS" },
        { path: DATA_FOLDER + "/" + name, directory: "DATA" }
      ];
      for (const tg of targets) {
        try {
          await FS.writeFile({ path: tg.path, data: b64, directory: tg.directory, recursive: true });
          ok = true;
        } catch (e) { /* se intenta la siguiente ubicación */ }
      }
    } catch (e) { return ok; }
    return ok;
  }

  return false;
}

// Guarda el Excel automáticamente
async function autoSaveExcel() {
  let bytes;
  try { bytes = buildXlsx(); } catch (e) { return false; }
  return writeFileToFolder(EXCEL_NAME, bytes);
}

// Guarda una copia de seguridad de la base de datos (JSON)
async function backupDB() {
  try {
    const data = JSON.stringify({ savedAt: new Date().toISOString(), receipts: getDB() }, null, 2);
    return writeFileToFolder("QBAS-Recibos-BaseDeDatos.json", new TextEncoder().encode(data));
  } catch (e) { return false; }
}

async function initDataStore() {
  try {
    const ok = await autoSaveExcel();
    if (ok) toast(t("db_updated"));
  } catch (e) {}
}

// ---------- Inicialización ----------
function toggleCustom() {
  const wrap = $("custom-currency-wrap");
  if ($("currency-select").value === "custom") {
    wrap.classList.remove("hidden");
  } else {
    wrap.classList.add("hidden");
  }
}

function bindInputs() {
  const simple = [
    "issuer-name", "issuer-address", "issuer-phone", "issuer-taxid",
    "client-name", "client-address", "client-phone", "client-taxid",
    "receipt-folio", "receipt-date", "receipt-duedate", "folio-prefix",
    "notes", "discount-value", "tax-rate", "tax-name"
  ];
  simple.forEach((id) => {
    $(id).addEventListener("input", () => { updateReceipt(); saveState(); });
  });
  ["discount-type", "payment-method", "receipt-status", "currency-position"].forEach((id) => {
    $(id).addEventListener("change", () => { updateReceipt(); saveState(); });
  });
  $("tax-enabled").addEventListener("change", () => { updateReceipt(); saveState(); });
  $("sign-enabled").addEventListener("change", () => { updateReceipt(); saveState(); });
  $("theme-select").addEventListener("change", () => { applyTheme(); saveState(); });
  $("accent-color").addEventListener("input", () => { applyAccent(); saveState(); });

  $("currency-select").addEventListener("change", () => { toggleCustom(); updateReceipt(); saveState(); });
  $("currency-custom").addEventListener("input", () => { updateReceipt(); saveState(); });

  $("add-row").addEventListener("click", () => addItem(1, "", 0));
  $("btn-print").addEventListener("click", () => {
    recordReceipt();
    savePdfAuto().then((ok) => { if (ok) toast(t("db_updated")); });
    window.print();
  });
  $("btn-new").addEventListener("click", newReceipt);
  $("btn-save").addEventListener("click", () => { saveToHistory(); recordReceipt(); });
  $("btn-history").addEventListener("click", openHistory);
  $("history-close").addEventListener("click", closeHistory);
  $("btn-export").addEventListener("click", exportHTML);
  $("import-json").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importFile(file);
    e.target.value = "";
  });

  $("btn-es").addEventListener("click", () => setLang("es"));
  $("btn-en").addEventListener("click", () => setLang("en"));

  $("issuer-logo").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      issuerLogoData = reader.result;
      updateReceipt();
      saveState();
    };
    reader.readAsDataURL(file);
  });

  $("logo-remove").addEventListener("click", () => {
    issuerLogoData = "";
    $("issuer-logo").value = "";
    updateReceipt();
    saveState();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHistory();
  });
}

function init() {
  try { if (typeof Neutralino !== "undefined" && Neutralino.init) Neutralino.init(); } catch (e) {}
  loadState();
  bindInputs();
  setLang(lang);
  applyTheme();
  applyAccent();
  initDataStore();
}

document.addEventListener("DOMContentLoaded", init);
