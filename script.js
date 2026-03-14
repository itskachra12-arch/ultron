const ADMIN_PASSWORD = "creative123";

const KEYS = {
  publicCategories: "publicCategories",
  publicTools: "publicTools",
  privateCategories: "privateCategories",
  privateTools: "privateTools",
  homeCollapsed: "homeCollapsedCategories",
  libraryCollapsed: "libraryCollapsedCategories",
  syncBannerCollapsed: "syncBannerCollapsed",
};

const DEFAULT_PUBLIC_CATEGORIES = [
  { name: "AI Video Tools", desc: "Tools for generating videos using AI" },
  { name: "Design Resources", desc: "Free design tools and assets" }
];

const DEFAULT_PUBLIC_TOOLS = [
  { name: "Runway", link: "https://runway.ml", cat: "AI Video Tools", fav: true },
  { name: "Canva", link: "https://canva.com", cat: "Design Resources", fav: false }
];

let isAdmin = false;
let confirmCallback = null;
let editingPublicToolId = null;

document.addEventListener("DOMContentLoaded", () => {
  seedDefaults();
  setupSharedUI();

  const page = document.body.dataset.page;
  if (page === "home") initHomePage();
  if (page === "library") initLibraryPage();
});

function getJSON(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedDefaults() {
  if (!localStorage.getItem(KEYS.publicCategories)) {
    setJSON(KEYS.publicCategories, DEFAULT_PUBLIC_CATEGORIES);
  }
  if (!localStorage.getItem(KEYS.publicTools)) {
    setJSON(KEYS.publicTools, withIds(DEFAULT_PUBLIC_TOOLS));
  } else {
    normalizeToolIds(KEYS.publicTools);
  }

  if (!localStorage.getItem(KEYS.privateCategories)) {
    setJSON(KEYS.privateCategories, []);
  }

  if (!localStorage.getItem(KEYS.privateTools)) {
    setJSON(KEYS.privateTools, []);
  } else {
    normalizeToolIds(KEYS.privateTools);
  }

  if (!localStorage.getItem(KEYS.homeCollapsed)) setJSON(KEYS.homeCollapsed, {});
  if (!localStorage.getItem(KEYS.libraryCollapsed)) setJSON(KEYS.libraryCollapsed, {});
}

function withIds(items) {
  return items.map(item => ({
    id: item.id || generateId(),
    ...item
  }));
}

function normalizeToolIds(key) {
  const tools = getJSON(key);
  let changed = false;

  const fixed = tools.map(tool => {
    if (!tool.id) {
      changed = true;
      return { ...tool, id: generateId() };
    }
    return tool;
  });

  if (changed) setJSON(key, fixed);
}

function generateId() {
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setupSharedUI() {
  setupToasts();
  setupConfirmModal();
  setupScrollTop();
  setupKeyboardShortcut();
  setupAdminModal();
  setupEditModal();
}

function setupToasts() {
  window.showToast = function (message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  };
}

function setupConfirmModal() {
  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  const cancelBtn = document.getElementById("confirmCancel");
  const deleteBtn = document.getElementById("confirmDelete");
  const closeBackdrop = modal.querySelector("[data-close-modal]");

  window.showConfirm = function(title, text, onConfirm) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = text;
    confirmCallback = onConfirm;
    modal.classList.remove("hidden");
  };

  function closeConfirm() {
    modal.classList.add("hidden");
    confirmCallback = null;
  }

  cancelBtn?.addEventListener("click", closeConfirm);
  closeBackdrop?.addEventListener("click", closeConfirm);
  deleteBtn?.addEventListener("click", () => {
    if (typeof confirmCallback === "function") confirmCallback();
    closeConfirm();
  });
}

function setupAdminModal() {
  const modal = document.getElementById("adminModal");
  if (!modal) return;

  const cancelBtn = document.getElementById("adminCancelBtn");
  const loginBtn = document.getElementById("adminLoginBtn");
  const input = document.getElementById("adminPasswordInput");
  const backdrop = modal.querySelector("[data-close-admin-modal]");

  function closeAdminModal() {
    modal.classList.add("hidden");
    if (input) input.value = "";
  }

  window.openAdminModal = function() {
    modal.classList.remove("hidden");
    setTimeout(() => input?.focus(), 50);
  };

  cancelBtn?.addEventListener("click", closeAdminModal);
  backdrop?.addEventListener("click", closeAdminModal);

  loginBtn?.addEventListener("click", () => {
    const password = input.value.trim();
    if (password === ADMIN_PASSWORD) {
      isAdmin = true;
      closeAdminModal();
      renderHome();
      showToast("Admin mode activated", "info");
    } else {
      showToast("Wrong password!", "error");
    }
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn?.click();
  });
}

function setupEditModal() {
  const modal = document.getElementById("editToolModal");
  if (!modal) return;

  const cancelBtn = document.getElementById("editCancelBtn");
  const saveBtn = document.getElementById("editSaveBtn");
  const backdrop = modal.querySelector("[data-close-edit-modal]");

  function closeEditModal() {
    modal.classList.add("hidden");
    editingPublicToolId = null;
  }

  window.openEditToolModal = function(tool) {
    editingPublicToolId = tool.id;
    document.getElementById("editToolName").value = tool.name || "";
    document.getElementById("editToolUrl").value = tool.link || "";
    document.getElementById("editToolFav").checked = !!tool.fav;

    const cats = getJSON(KEYS.publicCategories);
    const select = document.getElementById("editToolCategory");
    updateSelectOptions(select, cats, "Select category");
    select.value = tool.cat || "";

    modal.classList.remove("hidden");
  };

  cancelBtn?.addEventListener("click", closeEditModal);
  backdrop?.addEventListener("click", closeEditModal);

  saveBtn?.addEventListener("click", () => {
    const name = document.getElementById("editToolName").value.trim();
    const link = sanitizeUrl(document.getElementById("editToolUrl").value.trim());
    const cat = document.getElementById("editToolCategory").value;
    const fav = document.getElementById("editToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    const tools = getJSON(KEYS.publicTools).map(tool => {
      if (tool.id === editingPublicToolId) {
        return { ...tool, name, link, cat, fav };
      }
      return tool;
    });

    setJSON(KEYS.publicTools, tools);
    closeEditModal();
    renderHome();
    showToast("Tool updated!", "success");
  });
}

function setupScrollTop() {
  const btn = document.getElementById("scrollTopBtn");
  if (!btn) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) btn.classList.add("show");
    else btn.classList.remove("show");
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function setupKeyboardShortcut() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const typing = ["input", "textarea", "select"].includes(tag);

    if (e.key === "/" && !typing) {
      e.preventDefault();
      const search = document.getElementById("publicSearch") || document.getElementById("privateSearch");
      search?.focus();
    }
  });
}

function sanitizeUrl(url) {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return "https://" + url.trim();
  return url.trim();
}

function isValidUrl(url) {
  try {
    new URL(sanitizeUrl(url));
    return true;
  } catch {
    return false;
  }
}

function getDomain(url) {
  try {
    return new URL(sanitizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getFaviconUrl(url) {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}

function suggestNameFromUrl(url) {
  const domain = getDomain(url);
  if (!domain) return "";
  const base = domain.split(".")[0] || "";
  return base
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

function fallbackColor(text) {
  const colors = ["#4a9eff", "#845ef7", "#12b886", "#f59f00", "#e8590c", "#d6336c"];
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return colors[sum % colors.length];
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function updateSelectOptions(selectEl, categories, placeholder = "Select category") {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  if (!categories.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No categories available";
    selectEl.appendChild(opt);
    return;
  }

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  selectEl.appendChild(first);

  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.textContent = cat.name;
    selectEl.appendChild(opt);
  });
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseJSONFile(file, onSuccess) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      onSuccess(parsed);
    } catch {
      showToast("Invalid file. Please select a valid backup file.", "error");
    }
  };
  reader.readAsText(file);
}

function moveCategory(key, index, direction) {
  const arr = getJSON(key);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  setJSON(key, arr);
}

function initHomePage() {
  const adminBtn = document.getElementById("adminToggleBtn");
  const createCategoryBtn = document.getElementById("createPublicCategoryBtn");
  const addToolBtn = document.getElementById("addPublicToolBtn");
  const exportAllBtn = document.getElementById("exportAllBtn");
  const importAllBtn = document.getElementById("importAllBtn");
  const importAllInput = document.getElementById("importAllInput");
  const searchInput = document.getElementById("publicSearch");
  const publicToolUrl = document.getElementById("publicToolUrl");
  const publicToolName = document.getElementById("publicToolName");

  renderHome();

  adminBtn?.addEventListener("click", () => {
    if (isAdmin) {
      isAdmin = false;
      renderHome();
      showToast("Admin mode deactivated", "info");
    } else {
      openAdminModal();
    }
  });

  createCategoryBtn?.addEventListener("click", () => {
    const name = document.getElementById("publicCategoryName").value.trim();
    const desc = document.getElementById("publicCategoryDesc").value.trim();

    if (!name) return showToast("Name required!", "error");

    const categories = getJSON(KEYS.publicCategories);
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return showToast("Category already exists!", "error");
    }

    categories.push({ name, desc });
    setJSON(KEYS.publicCategories, categories);

    document.getElementById("publicCategoryName").value = "";
    document.getElementById("publicCategoryDesc").value = "";

    renderHome();
    showToast("Category created!", "success");
  });

  addToolBtn?.addEventListener("click", () => {
    const name = publicToolName.value.trim();
    const link = sanitizeUrl(publicToolUrl.value.trim());
    const cat = document.getElementById("publicToolCategory").value;
    const fav = document.getElementById("publicToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    const tools = getJSON(KEYS.publicTools);
    tools.push({ id: generateId(), name, link, cat, fav });
    setJSON(KEYS.publicTools, tools);

    publicToolName.value = "";
    publicToolUrl.value = "";
    document.getElementById("publicToolFav").checked = false;

    renderHome();
    showToast("Tool added!", "success");
  });

  publicToolUrl?.addEventListener("input", () => {
    if (!publicToolName.value.trim() && publicToolUrl.value.trim()) {
      publicToolName.value = suggestNameFromUrl(publicToolUrl.value);
    }
  });

  searchInput?.addEventListener("input", renderHome);

  exportAllBtn?.addEventListener("click", () => {
    const data = {
      publicCategories: getJSON(KEYS.publicCategories),
      publicTools: getJSON(KEYS.publicTools),
      privateCategories: getJSON(KEYS.privateCategories),
      privateTools: getJSON(KEYS.privateTools),
    };
    downloadJSON("toolbox-full-backup.json", data);
    showToast("Data exported!", "success");
  });

  importAllBtn?.addEventListener("click", () => importAllInput.click());

  importAllInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseJSONFile(file, (data) => {
      if (!data.publicCategories || !data.publicTools || !data.privateCategories || !data.privateTools) {
        return showToast("Invalid file. Please select a valid backup file.", "error");
      }

      setJSON(KEYS.publicCategories, data.publicCategories);
      setJSON(KEYS.publicTools, withIds(data.publicTools));
      setJSON(KEYS.privateCategories, data.privateCategories);
      setJSON(KEYS.privateTools, withIds(data.privateTools));

      renderHome();
      showToast("Data imported successfully", "info");
    });

    e.target.value = "";
  });
}

function renderHome() {
  const categories = getJSON(KEYS.publicCategories);
  const tools = getJSON(KEYS.publicTools);
  const collapsed = getJSON(KEYS.homeCollapsed, {});
  const searchTerm = (document.getElementById("publicSearch")?.value || "").trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  const adminPanel = document.getElementById("adminPanelSection");
  const categoriesContainer = document.getElementById("publicCategoriesContainer");
  const favoritesSection = document.getElementById("publicFavoritesSection");
  const favoritesGrid = document.getElementById("publicFavoritesGrid");
  const noResults = document.getElementById("publicNoResults");
  const stats = document.getElementById("publicStats");
  const publicToolCategory = document.getElementById("publicToolCategory");

  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin);
  updateSelectOptions(publicToolCategory, categories);

  categoriesContainer.innerHTML = "";
  favoritesGrid.innerHTML = "";
  noResults.classList.add("hidden");
  stats.textContent = `${tools.length} public links across ${categories.length} categories`;

  const matchingTools = tools.filter(tool => {
    if (!searchTerm) return true;
    return tool.name.toLowerCase().includes(searchTerm) || tool.cat.toLowerCase().includes(searchTerm);
  });

  const favorites = matchingTools.filter(tool => tool.fav);
  if (favorites.length && !isSearching) {
    favoritesSection.classList.remove("hidden");
    favorites.forEach(tool => favoritesGrid.appendChild(createLinkCard(tool, "public")));
  } else {
    favoritesSection.classList.add("hidden");
  }

  if (!categories.length) {
    categoriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🚀</div>
        <strong>No resources have been added yet. Check back soon!</strong>
      </div>
    `;
    return;
  }

  let totalVisible = 0;

  categories.forEach((cat, catIndex) => {
    const catTools = matchingTools.filter(tool => tool.cat === cat.name);

    // THE FIX: completely hide category if zero matches during search
    if (isSearching && catTools.length === 0) return;

    totalVisible += catTools.length;

    const block = document.createElement("div");
    block.className = "category-block";

    const head = document.createElement("div");
    head.className = "category-head";

    const left = document.createElement("div");
    left.className = "category-title-wrap";

    const title = document.createElement("h3");
    title.className = "category-title";
    title.textContent = cat.name;

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `(${catTools.length})`;

    const info = document.createElement("button");
    info.className = "info-icon";
    info.type = "button";
    info.innerHTML = "ⓘ";

    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent = cat.desc || "No description";
    info.appendChild(tooltip);

    info.addEventListener("click", (e) => e.stopPropagation());

    left.append(title, count, info);

    const actions = document.createElement("div");
    actions.className = "category-actions";

    if (isAdmin) {
      const upBtn = createMiniButton("↑", "Move up", (e) => {
        e.stopPropagation();
        moveCategory(KEYS.publicCategories, catIndex, -1);
        renderHome();
      });

      const downBtn = createMiniButton("↓", "Move down", (e) => {
        e.stopPropagation();
        moveCategory(KEYS.publicCategories, catIndex, 1);
        renderHome();
      });

      const delBtn = createMiniButton("🗑", "Delete category", (e) => {
        e.stopPropagation();
        showConfirm("Delete this category?", "Delete this category and all tools inside?", () => {
          deletePublicCategory(cat.name);
        });
      });

      actions.append(upBtn, downBtn, delBtn);
    }

    // THE FIX: automatically expand categories during search
    const isCollapsed = isSearching ? false : collapsed[cat.name];

    const arrow = createMiniButton(isCollapsed ? "▸" : "▾", "Toggle category", null);
    actions.appendChild(arrow);

    head.append(left, actions);

    const content = document.createElement("div");
    content.className = "category-content";
    if (isCollapsed) content.classList.add("hidden");

    if (catTools.length) {
      const grid = document.createElement("div");
      grid.className = "card-grid";
      catTools.forEach(tool => grid.appendChild(createLinkCard(tool, "public")));
      content.appendChild(grid);
    } else {
      content.innerHTML = `<div class="empty-inline">No tools in this category yet</div>`;
    }

    head.addEventListener("click", () => {
      const state = getJSON(KEYS.homeCollapsed, {});
      state[cat.name] = !state[cat.name];
      setJSON(KEYS.homeCollapsed, state);
      renderHome();
    });

    block.append(head, content);
    categoriesContainer.appendChild(block);
  });

  if (isSearching && totalVisible === 0) {
    noResults.classList.remove("hidden");
    noResults.innerHTML = `
      <div class="empty-emoji">🔍</div>
      <strong>No results found for "${escapeHtml(searchTerm)}"</strong>
    `;
  }

  if (isSearching) {
    stats.textContent = `${totalVisible} results found for "${escapeHtml(searchTerm)}"`;
  }
}

function deletePublicCategory(categoryName) {
  const categories = getJSON(KEYS.publicCategories).filter(c => c.name !== categoryName);
  const tools = getJSON(KEYS.publicTools).filter(t => t.cat !== categoryName);

  setJSON(KEYS.publicCategories, categories);
  setJSON(KEYS.publicTools, tools);

  renderHome();
  showToast("Category deleted!", "success");
}

function initLibraryPage() {
  const createCategoryBtn = document.getElementById("createPrivateCategoryBtn");
  const addToolBtn = document.getElementById("addPrivateToolBtn");
  const searchInput = document.getElementById("privateSearch");
  const exportBtn = document.getElementById("exportPrivateBtn");
  const importBtn = document.getElementById("importPrivateBtn");
  const importInput = document.getElementById("importPrivateInput");
  const generateSyncBtn = document.getElementById("generateSyncBtn");
  const showEnterCodeBtn = document.getElementById("showEnterCodeBtn");
  const loadSyncCodeBtn = document.getElementById("loadSyncCodeBtn");
  const copySyncCodeBtn = document.getElementById("copySyncCodeBtn");
  const toggleSyncBannerBtn = document.getElementById("toggleSyncBannerBtn");
  const privateToolUrl = document.getElementById("privateToolUrl");
  const privateToolName = document.getElementById("privateToolName");

  setupSyncBanner();
  renderLibrary();

  createCategoryBtn?.addEventListener("click", () => {
    const name = document.getElementById("privateCategoryName").value.trim();
    if (!name) return showToast("Name required!", "error");

    const categories = getJSON(KEYS.privateCategories);
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return showToast("Category already exists!", "error");
    }

    categories.push({ name });
    setJSON(KEYS.privateCategories, categories);

    document.getElementById("privateCategoryName").value = "";
    renderLibrary();
    showToast("Category created!", "success");
  });

  addToolBtn?.addEventListener("click", () => {
    const name = privateToolName.value.trim();
    const link = sanitizeUrl(privateToolUrl.value.trim());
    const cat = document.getElementById("privateToolCategory").value;
    const fav = document.getElementById("privateToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    const tools = getJSON(KEYS.privateTools);
    tools.push({ id: generateId(), name, link, cat, fav });
    setJSON(KEYS.privateTools, tools);

    privateToolName.value = "";
    privateToolUrl.value = "";
    document.getElementById("privateToolFav").checked = false;

    renderLibrary();
    showToast("Tool added!", "success");
  });

  privateToolUrl?.addEventListener("input", () => {
    if (!privateToolName.value.trim() && privateToolUrl.value.trim()) {
      privateToolName.value = suggestNameFromUrl(privateToolUrl.value);
    }
  });

  searchInput?.addEventListener("input", renderLibrary);

  exportBtn?.addEventListener("click", () => {
    const data = {
      privateCategories: getJSON(KEYS.privateCategories),
      privateTools: getJSON(KEYS.privateTools),
    };
    downloadJSON("my-library-backup.json", data);
    showToast("Data exported!", "success");
  });

  importBtn?.addEventListener("click", () => importInput.click());

  importInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseJSONFile(file, (data) => {
      if (!data.privateCategories || !data.privateTools) {
        return showToast("Invalid file. Please select a valid backup file.", "error");
      }

      setJSON(KEYS.privateCategories, data.privateCategories);
      setJSON(KEYS.privateTools, withIds(data.privateTools));

      renderLibrary();
      showToast("Data imported successfully", "info");
    });

    e.target.value = "";
  });

  generateSyncBtn?.addEventListener("click", generateSyncCodeFlow);

  showEnterCodeBtn?.addEventListener("click", () => {
    document.getElementById("enterCodeWrap").classList.toggle("hidden");
  });

  loadSyncCodeBtn?.addEventListener("click", loadFromSyncCode);

  copySyncCodeBtn?.addEventListener("click", async () => {
    const code = document.getElementById("syncCodeText").textContent.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast("Sync code copied!", "success");
    } catch {
      showToast("Could not copy code", "error");
    }
  });

  toggleSyncBannerBtn?.addEventListener("click", () => {
    const current = localStorage.getItem(KEYS.syncBannerCollapsed) === "true";
    localStorage.setItem(KEYS.syncBannerCollapsed, String(!current));
    setupSyncBanner();
  });
}

function setupSyncBanner() {
  const body = document.getElementById("syncBannerBody");
  const btn = document.getElementById("toggleSyncBannerBtn");
  if (!body || !btn) return;

  const collapsed = localStorage.getItem(KEYS.syncBannerCollapsed) === "true";
  body.classList.toggle("hidden", collapsed);
  btn.textContent = collapsed ? "+" : "—";
}

function renderLibrary() {
  const categories = getJSON(KEYS.privateCategories);
  const tools = getJSON(KEYS.privateTools);
  const collapsed = getJSON(KEYS.libraryCollapsed, {});
  const searchTerm = (document.getElementById("privateSearch")?.value || "").trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  const categoriesContainer = document.getElementById("privateCategoriesContainer");
  const favoritesSection = document.getElementById("privateFavoritesSection");
  const favoritesGrid = document.getElementById("privateFavoritesGrid");
  const noResults = document.getElementById("privateNoResults");
  const stats = document.getElementById("libraryStats");
  const privateToolCategory = document.getElementById("privateToolCategory");

  updateSelectOptions(privateToolCategory, categories);

  categoriesContainer.innerHTML = "";
  favoritesGrid.innerHTML = "";
  noResults.classList.add("hidden");

  stats.textContent = `You have saved ${tools.length} links across ${categories.length} categories`;

  const matchingTools = tools.filter(tool => {
    if (!searchTerm) return true;
    return tool.name.toLowerCase().includes(searchTerm) || tool.cat.toLowerCase().includes(searchTerm);
  });

  const favorites = matchingTools.filter(tool => tool.fav);
  if (favorites.length && !isSearching) {
    favoritesSection.classList.remove("hidden");
    favorites.forEach(tool => favoritesGrid.appendChild(createLinkCard(tool, "private")));
  } else {
    favoritesSection.classList.add("hidden");
  }

  if (!categories.length) {
    categoriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">📁</div>
        <strong>Your library is empty! Create a category to get started</strong>
        <div>Start building your library!</div>
        <div>Create your first category above and add links you want to save</div>
      </div>
    `;
    return;
  }

  let totalVisible = 0;

  categories.forEach((cat, catIndex) => {
    const catTools = matchingTools.filter(tool => tool.cat === cat.name);

    if (isSearching && catTools.length === 0) return;

    totalVisible += catTools.length;

    const block = document.createElement("div");
    block.className = "category-block";

    const head = document.createElement("div");
    head.className = "category-head";

    const left = document.createElement("div");
    left.className = "category-title-wrap";

    const title = document.createElement("h3");
    title.className = "category-title";
    title.textContent = cat.name;

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `(${catTools.length})`;

    left.append(title, count);

    const actions = document.createElement("div");
    actions.className = "category-actions";

    const upBtn = createMiniButton("↑", "Move up", (e) => {
      e.stopPropagation();
      moveCategory(KEYS.privateCategories, catIndex, -1);
      renderLibrary();
    });

    const downBtn = createMiniButton("↓", "Move down", (e) => {
      e.stopPropagation();
      moveCategory(KEYS.privateCategories, catIndex, 1);
      renderLibrary();
    });

    const delBtn = createMiniButton("🗑", "Delete category", (e) => {
      e.stopPropagation();
      showConfirm("Delete this category?", "Delete this category and all tools inside?", () => {
        deletePrivateCategory(cat.name);
      });
    });

    const isCollapsed = isSearching ? false : collapsed[cat.name];
    const arrow = createMiniButton(isCollapsed ? "▸" : "▾", "Toggle category", null);

    actions.append(upBtn, downBtn, delBtn, arrow);

    head.append(left, actions);

    const content = document.createElement("div");
    content.className = "category-content";
    if (isCollapsed) content.classList.add("hidden");

    if (catTools.length) {
      const grid = document.createElement("div");
      grid.className = "card-grid";
      catTools.forEach(tool => grid.appendChild(createLinkCard(tool, "private")));
      content.appendChild(grid);
    } else {
      content.innerHTML = `<div class="empty-inline">No links here yet. Add your first one above!</div>`;
    }

    head.addEventListener("click", () => {
      const state = getJSON(KEYS.libraryCollapsed, {});
      state[cat.name] = !state[cat.name];
      setJSON(KEYS.libraryCollapsed, state);
      renderLibrary();
    });

    block.append(head, content);
    categoriesContainer.appendChild(block);
  });

  if (isSearching && totalVisible === 0) {
    noResults.classList.remove("hidden");
    noResults.innerHTML = `
      <div class="empty-emoji">🔍</div>
      <strong>No results found for "${escapeHtml(searchTerm)}"</strong>
    `;
  }

  if (isSearching) {
    stats.textContent = `${totalVisible} results found for "${escapeHtml(searchTerm)}"`;
  }
}

function deletePrivateCategory(categoryName) {
  const categories = getJSON(KEYS.privateCategories).filter(c => c.name !== categoryName);
  const tools = getJSON(KEYS.privateTools).filter(t => t.cat !== categoryName);

  setJSON(KEYS.privateCategories, categories);
  setJSON(KEYS.privateTools, tools);

  renderLibrary();
  showToast("Category deleted!", "success");
}

function generateSyncCodeFlow() {
  const code = generateSyncCode();
  const data = {
    privateCategories: getJSON(KEYS.privateCategories),
    privateTools: getJSON(KEYS.privateTools),
  };

  localStorage.setItem(`sync_${code}`, JSON.stringify(data));

  document.getElementById("syncCodeText").textContent = code;
  document.getElementById("syncCodeBox").classList.remove("hidden");

  showToast("Sync code generated!", "success");
}

function loadFromSyncCode() {
  const code = document.getElementById("syncCodeInput").value.trim();
  if (!code) return showToast("Please enter a sync code!", "error");

  const raw = localStorage.getItem(`sync_${code}`);
  if (!raw) return showToast("Code not found. Make sure you're entering it correctly.", "error");

  try {
    const data = JSON.parse(raw);
    setJSON(KEYS.privateCategories, data.privateCategories || []);
    setJSON(KEYS.privateTools, withIds(data.privateTools || []));
    renderLibrary();
    showToast("Library loaded from sync code!", "info");
  } catch {
    showToast("Code not found. Make sure you're entering it correctly.", "error");
  }
}

function generateSyncCode() {
  const adjectives = ["blue", "bright", "silent", "golden", "cosmic", "rapid", "lucky", "clever"];
  const animals = ["tiger", "fox", "otter", "falcon", "wolf", "panda", "eagle", "koala"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${animal}-${num}`;
}

function createLinkCard(tool, type) {
  const card = document.createElement("div");
  card.className = "link-card";

  const top = document.createElement("div");
  top.className = "card-top";

  const fav = document.createElement("div");
  fav.className = "favorite-badge";
  fav.textContent = tool.fav ? "⭐" : "";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-card-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "×";

  const canDelete = type === "private" || (type === "public" && isAdmin);
  if (!canDelete) deleteBtn.classList.add("hidden");

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showConfirm("Delete this tool?", "This action cannot be undone.", () => {
      deleteTool(tool.id, type);
    });
  });

  top.append(fav, deleteBtn);

  const faviconWrap = document.createElement("div");
  faviconWrap.className = "favicon-wrap";

  const img = document.createElement("img");
  img.src = getFaviconUrl(tool.link);
  img.alt = `${tool.name} favicon`;
  img.onerror = () => {
    faviconWrap.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.className = "favicon-fallback";
    fallback.style.background = fallbackColor(tool.name || "X");
    fallback.textContent = (tool.name?.charAt(0) || "🌐").toUpperCase();
    faviconWrap.appendChild(fallback);
  };
  faviconWrap.appendChild(img);

  const name = document.createElement("h4");
  name.className = "link-name";
  name.textContent = tool.name;

  const url = document.createElement("div");
  url.className = "link-url";
  url.textContent = getDomain(tool.link) || tool.link;

  card.append(top, faviconWrap, name, url);

  const showActions = type === "private" || (type === "public" && isAdmin);
  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "card-actions";

    const favBtn = document.createElement("button");
    favBtn.className = "card-action-btn";
    favBtn.textContent = tool.fav ? "Unfavorite" : "Favorite";
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(tool.id, type);
    });
    actions.appendChild(favBtn);

    if (type === "public" && isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "card-action-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditToolModal(tool);
      });
      actions.appendChild(editBtn);
    }

    card.appendChild(actions);
  }

  card.addEventListener("click", () => {
    window.open(tool.link, "_blank", "noopener,noreferrer");
  });

  return card;
}

function deleteTool(id, type) {
  const key = type === "public" ? KEYS.publicTools : KEYS.privateTools;
  const tools = getJSON(key).filter(tool => tool.id !== id);
  setJSON(key, tools);

  if (type === "public") renderHome();
  else renderLibrary();

  showToast("Tool deleted!", "success");
}

function toggleFavorite(id, type) {
  const key = type === "public" ? KEYS.publicTools : KEYS.privateTools;
  const tools = getJSON(key).map(tool => {
    if (tool.id === id) return { ...tool, fav: !tool.fav };
    return tool;
  });
  setJSON(key, tools);

  if (type === "public") renderHome();
  else renderLibrary();
}

function createMiniButton(text, title, handler) {
  const btn = document.createElement("button");
  btn.className = "mini-btn";
  btn.type = "button";
  btn.textContent = text;
  btn.title = title;
  if (handler) btn.addEventListener("click", handler);
  return btn;
}
