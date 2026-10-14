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
  items.forEach((it) => {
    if (!it.desc && !it.price) return;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="c-qty">${fmtNum(it.qty || 0)}</td>` +
      `<td class="c-desc">${escapeHtml(it.desc)}</td>` +
      `<td class="c-price">${money(it.price || 0)}</td>` +
      `<td class="c-amount">${money((it.qty || 0) * (it.price || 0))}</td>`;
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
  downloadFile(`QBAS-Recibo-${fullFolio() || "sin-folio"}.html`, html, "text/html");
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
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-new").addEventListener("click", newReceipt);
  $("btn-save").addEventListener("click", saveToHistory);
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
  loadState();
  bindInputs();
  setLang(lang);
  applyTheme();
  applyAccent();
}

document.addEventListener("DOMContentLoaded", init);
