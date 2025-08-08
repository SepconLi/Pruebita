/* ====== Utilities ====== */
const $ = (sel) => document.querySelector(sel);

function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), wait);
    };
}

/* ====== State / URL Sync ====== */
const defaultState = {
    categories: [],
    inStockOnly: false
};

function readStateFromURL() {
    const p = new URLSearchParams(location.search);
    const state = { ...defaultState };

    if (p.has("cat")) state.categories = p.get("cat").split(",").filter(Boolean);
    if (p.has("stock")) state.inStockOnly = p.get("stock") === "1";

    return state;
}

function syncStateWithURL(state) {
    const p = new URLSearchParams();
    if (state.categories.length) p.set("cat", state.categories.join(","));
    if (state.inStockOnly) p.set("stock", "1");

    const newURL = `${location.pathname}${p.toString() ? "?" + p.toString() : ""}`;
    history.replaceState(null, "", newURL);
}

/* ====== Data Loading & Validation ====== */
let INVENTORY = { items: [], meta: { lastUpdated: "" } };
const placeholderImg = "images/Placeholder.svg";

async function loadData() {
    try {
        const INVENTORY_URL = "data/inventory.json";
        const url = `${INVENTORY_URL}?t=${Date.now()}`
        const res = await fetch(url, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const error = validateSchema(data);
        if (error) {
            showError(`Invalid inventory schema: ${error}`);
            INVENTORY = { items: [], meta: { lastUpdated: "" } };
        } else {
            INVENTORY = data;
        }
    } catch (err) {
        showError(`Failed to load data/inventory.json (${err.message}).`);
        INVENTORY = { items: [], meta: { lastUpdated: "" } };
    }
}

function validateSchema(data) {
    if (!data || typeof data !== "object") return "Root is not an object";
    if (!Array.isArray(data.items)) return "`items` must be an array";
    if (!data.meta || typeof data.meta.lastUpdated !== "string")
        return "`meta.lastUpdated` must be a string (YYYY-MM-DD)";

    for (const [i, it] of data.items.entries()) {
        if (typeof it.id !== "string") return `items[${i}].id must be string`;
        if (typeof it.name !== "string") return `items[${i}].name must be string`;
        if (typeof it.description !== "string") return `items[${i}].description must be string`;
        if (typeof it.category !== "string") return `items[${i}].category must be string`;
        if (typeof it.price !== "number") return `items[${i}].price must be number`;
        if (typeof it.currency !== "string") return `items[${i}].currency must be string`;
        if (typeof it.inStock !== "boolean") return `items[${i}].inStock must be boolean`;
        if (!Array.isArray(it.tags)) return `items[${i}].tags must be array`;
        if (typeof it.image !== "string") return `items[${i}].image must be string`;
        if (typeof it.createdAt !== "string") return `items[${i}].createdAt must be string`;
    }
    return "";
}

function showError(msg) {
    const el = $("#errorBanner");
    el.textContent = msg;
    el.classList.remove("hidden");
}

/* ====== Filtering ====== */
function applyFilters(allItems, state) {
    let items = [...allItems];

    if (state.categories.length && state.categories[0] !== "") {
        const selected = state.categories[0].toLowerCase();
        items = items.filter(it => it.category.toLowerCase() === selected);
    }

    if (state.inStockOnly) items = items.filter((it) => it.inStock);

    return items;
}

/* ====== Rendering ====== */
function renderCategoriesSelect(items) {
    const sel = $("#categoryFilter");
    if (!sel) return;

    const cats = Array.from(new Set(items.map(i => i.category))).sort((a, b) => a.localeCompare(b));

    sel.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Mostrar todo";
    sel.appendChild(allOpt);

    for (const c of cats) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    }
}

function formatPrice(p, currency = "USD") {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(p);
    } catch {
        return `$${p.toFixed(2)}`;
    }
}

function badgeEl(text, cls = "") {
    const span = document.createElement("span");
    span.className = `badge ${cls}`.trim();
    span.textContent = text;
    return span;
}

function renderGrid(items) {
    const grid = $("#grid");
    grid.innerHTML = "";

    $("#count").textContent = `${items.length} result${items.length === 1 ? "" : "s"}`;

    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "card";
        empty.innerHTML = `
      <div class="card-body">
        <p class="muted">No items match your filters. Try resetting or widening your search.</p>
      </div>`;
        grid.appendChild(empty);
        return;
    }

    for (const it of items) {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
      <button class="card-link" type="button" data-id="${it.id}">
        <img src="${it.image}" alt="${it.name}" onerror="this.onerror=null;this.src='${placeholderImg}'" />
        <div class="card-body">
          <h3 class="card-title">${it.name}</h3>
          <div class="price">${formatPrice(it.price, it.currency)}</div>
          <div class="badges"></div>
        </div>
      </button>
    `;
        const badges = card.querySelector(".badges");
        if (it.tags.includes("new")) badges.appendChild(badgeEl("New", "new"));
        if (it.tags.includes("sale")) badges.appendChild(badgeEl("Sale", "sale"));
        if (!it.inStock) badges.appendChild(badgeEl("Out of stock", "oos"));

        card.querySelector(".card-link").addEventListener("click", () => openModal(it));
        grid.appendChild(card);
    }
}

/* ====== Modal ====== */
let lastFocused = null;

function openModal(it) {
    lastFocused = document.activeElement;

    $("#modalImg").src = it.image;
    $("#modalImg").alt = it.name;
    $("#modalTitle").textContent = it.name;
    $("#modalDesc").textContent = it.description;
    $("#modalCat").textContent = it.category;
    $("#modalPrice").textContent = formatPrice(it.price, it.currency);
    $("#modalStock").textContent = it.inStock ? "In stock" : "Out of stock";
    $("#modalTags").textContent = it.tags.join(", ") || "—";
    $("#modalCreated").textContent = it.createdAt;

    $("#modal").classList.remove("hidden");
    $(".modal-close").focus();
}

function closeModal() {
    $("#modal").classList.add("hidden");
    $("#modalImg").src = "";
    if (lastFocused) lastFocused.focus();
}

function setupModalEvents() {
    $("#modal").addEventListener("click", (e) => {
        if (e.target.matches("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
        if (!$("#modal").classList.contains("hidden") && e.key === "Escape") {
            e.preventDefault();
            closeModal();
        }
    });
}

/* ====== Controls binding ====== */
let STATE = { ...defaultState };

function setControlsFromState() {
    $("#inStockOnly").checked = STATE.inStockOnly;
    const sel = $("#categoryFilter");
    for (const opt of sel.options) {
        opt.selected = STATE.categories.includes(opt.value);
    }
}

function readStateFromControls() {
    const sel = $("#categoryFilter");
    const selected = Array.from(sel.selectedOptions).map((o) => o.value);

    STATE = {
        categories: selected,
        inStockOnly: $("#inStockOnly").checked
    };
}

const run = () => {
    readStateFromControls();
    syncStateWithURL(STATE);
    const items = applyFilters(INVENTORY.items, STATE);
    renderGrid(items);
};

function bindControls() {
    $("#categoryFilter").addEventListener("change", run);
    $("#inStockOnly").addEventListener("change", run);
}

/* ====== Bootstrap ====== */
(async function init() {
    $("#year").textContent = new Date().getFullYear();

    await loadData();
    renderCategoriesSelect(INVENTORY.items);

    STATE = readStateFromURL();
    setControlsFromState();

    bindControls();
    setupModalEvents();

    renderGrid(applyFilters(INVENTORY.items, STATE));

    document.addEventListener(
        "error",
        (e) => {
            const t = e.target;
            if (t.tagName === "IMG") t.src = placeholderImg;
        },
        true
    );
})();
