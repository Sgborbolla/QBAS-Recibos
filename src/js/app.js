// Lógica principal del generador de recibos
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
  return currentSymbol() + " " + fmtNum(n);
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
}

function removeItem(idx) {
  items.splice(idx, 1);
  if (items.length === 0) items.push({ qty: 1, desc: "", price: 0 });
  renderItems();
  updateReceipt();
}

function renderItems() {
  const box = $("items");
  box.innerHTML = "";
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      `<input type="number" class="i-qty" min="0" step="0.01" value="${it.qty}">` +
      `<input type="text" class="i-desc" value="${escapeAttr(it.desc)}">` +
      `<input type="number" class="i-price" min="0" step="0.01" value="${it.price}">` +
      `<input type="text" class="i-amount" readonly value="${fmtNum((it.qty || 0) * (it.price || 0))}">` +
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

// ---------- Cálculos ----------
function computeTotals() {
  const subtotal = items.reduce((sum, it) => sum + (it.qty || 0) * (it.price || 0), 0);
  const type = $("discount-type").value;
  const raw = parseFloat($("discount-value").value) || 0;
  let discount = type === "percent" ? (subtotal * raw) / 100 : raw;
  if (discount < 0) discount = 0;
  if (discount > subtotal) discount = subtotal;
  return { subtotal, discount, total: subtotal - discount };
}

// ---------- Vista previa del recibo ----------
function updateReceipt() {
  $("r-issuer-name").textContent = $("issuer-name").value;
  $("r-issuer-address").textContent = $("issuer-address").value;
  $("r-issuer-phone").textContent = $("issuer-phone").value;

  $("r-client-name").textContent = $("client-name").value;
  $("r-client-address").textContent = $("client-address").value;
  $("r-client-phone").textContent = $("client-phone").value;

  $("r-folio").textContent = $("receipt-folio").value;
  $("r-date").textContent = formatDate($("receipt-date").value);
  $("r-receipt-word").textContent = t("receipt_word");

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
    if (!it.desc && !it.price && !it.qty) return;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="c-qty">${fmtNum(it.qty || 0)}</td>` +
      `<td class="c-desc">${escapeHtml(it.desc)}</td>` +
      `<td class="c-price">${money(it.price || 0)}</td>` +
      `<td class="c-amount">${money((it.qty || 0) * (it.price || 0))}</td>`;
    tbody.appendChild(tr);
  });

  const { subtotal, discount, total } = computeTotals();
  $("r-subtotal").textContent = money(subtotal);
  const discountRow = $("r-discount-row");
  if (discount > 0) {
    discountRow.classList.remove("hidden");
    $("r-discount").textContent = "- " + money(discount);
  } else {
    discountRow.classList.add("hidden");
  }
  $("r-total").textContent = money(total);

  $("r-notes").textContent = $("notes").value;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  $("notes").value = "";
  $("discount-value").value = 0;
  $("receipt-date").value = todayISO();
  items = [{ qty: 1, desc: "", price: 0 }];
  renderItems();
  updateReceipt();
  saveState();
}

// ---------- Persistencia ----------
function saveState() {
  const data = {
    lang,
    folioCounter,
    items,
    issuerLogoData,
    fields: {
      issuerName: $("issuer-name").value,
      issuerAddress: $("issuer-address").value,
      issuerPhone: $("issuer-phone").value,
      clientName: $("client-name").value,
      clientAddress: $("client-address").value,
      clientPhone: $("client-phone").value,
      date: $("receipt-date").value,
      currency: $("currency-select").value,
      custom: $("currency-custom").value,
      discountType: $("discount-type").value,
      discountValue: $("discount-value").value,
      notes: $("notes").value
    }
  };
  try { localStorage.setItem("qbas_state", JSON.stringify(data)); } catch (e) {}
}

function loadState() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem("qbas_state") || "null"); } catch (e) {}
  if (!data) {
    setFolio(1);
    $("receipt-date").value = todayISO();
    items = [{ qty: 1, desc: "", price: 0 }];
    return;
  }
  const f = data.fields || {};
  lang = data.lang || "es";
  LANG = lang;
  folioCounter = data.folioCounter || 1;
  issuerLogoData = data.issuerLogoData || "";
  items = Array.isArray(data.items) && data.items.length ? data.items : [{ qty: 1, desc: "", price: 0 }];

  $("issuer-name").value = f.issuerName || "";
  $("issuer-address").value = f.issuerAddress || "";
  $("issuer-phone").value = f.issuerPhone || "";
  $("client-name").value = f.clientName || "";
  $("client-address").value = f.clientAddress || "";
  $("client-phone").value = f.clientPhone || "";
  $("receipt-date").value = f.date || todayISO();
  $("currency-custom").value = f.custom || "";
  $("discount-type").value = f.discountType || "amount";
  $("discount-value").value = f.discountValue ?? 0;
  $("notes").value = f.notes || "";
  buildCurrencyOptions();
  $("currency-select").value = f.currency || "USD";
  toggleCustom();
  setFolio(folioCounter);
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
    "issuer-name", "issuer-address", "issuer-phone",
    "client-name", "client-address", "client-phone",
    "receipt-folio", "receipt-date", "notes", "discount-value"
  ];
  simple.forEach((id) => {
    $(id).addEventListener("input", () => { updateReceipt(); saveState(); });
  });
  $("discount-type").addEventListener("change", () => { updateReceipt(); saveState(); });
  $("currency-select").addEventListener("change", () => { toggleCustom(); updateReceipt(); saveState(); });
  $("currency-custom").addEventListener("input", () => { updateReceipt(); saveState(); });

  $("add-row").addEventListener("click", () => addItem(1, "", 0));
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-new").addEventListener("click", newReceipt);

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
}

function init() {
  loadState();
  bindInputs();
  setLang(lang);
}

document.addEventListener("DOMContentLoaded", init);
