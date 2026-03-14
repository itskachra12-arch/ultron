const SUPABASE_URL = "https://tgszbddlpxbnapkqyzoc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnc3piZGRscHhibmFwa3F5em9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTExNjUsImV4cCI6MjA4OTAyNzE2NX0.NDz8CgSjsBmWP-oF3Jb-yRbTZE0JkjBsly98SVcFs-Q";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const KEYS = {
  privateCategories: "privateCategories",
  privateTools: "privateTools",
  libraryCollapsed: "libraryCollapsedCategories",
  syncBannerCollapsed: "syncBannerCollapsed"
};

let isAdmin = false;
let confirmCallback = null;
let editingPublicToolId = null;

document.addEventListener("DOMContentLoaded", async () => {
  seedPrivateDefaults();
  setupSharedUI();

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    isAdmin = !!session;
    updateAdminUI();

    if (document.body.dataset.page === "home") {
      setTimeout(async () => {
        await renderHome();
      }, 0);
    }
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  isAdmin = !!session;
  updateAdminUI();

  const page = document.body.dataset.page;
  if (page === "home") await initHomePage();
  if (page === "library") initLibraryPage();
});

/* ---------------- auth ---------------- */

async function handleAdminLogin() {
  const email = document.getElementById("adminEmailInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value.trim();

  if (!email || !password) {
    return showToast("Email and password required!", "error");
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return showToast("Login failed: " + error.message, "error");
  }

  isAdmin = true;
  closeAdminModal();
  updateAdminUI();
  await renderHome();
  showToast("Logged in as admin!", "success");
}

async function handleAdminLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) return showToast("Logout failed", "error");

  isAdmin = false;
  updateAdminUI();
  await renderHome();
  showToast("Logged out", "info");
}

function updateAdminUI() {
  const adminBtn = document.getElementById("adminToggleBtn");
  const adminPanel = document.getElementById("adminPanelSection");

  if (adminBtn) {
    adminBtn.textContent = isAdmin ? "🔓 Logout" : "🔒 Admin";
  }

  if (adminPanel) {
    adminPanel.classList.toggle("hidden", !isAdmin);
  }
}

function closeAdminModal() {
  const modal = document.getElementById("adminModal");
  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");

  if (modal) modal.classList.add("hidden");
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
}

/* ---------------- local helpers ---------------- */

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

function generateId() {
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seedPrivateDefaults() {
  if (!localStorage.getItem(KEYS.privateCategories)) setJSON(KEYS.privateCategories, []);
  if (!localStorage.getItem(KEYS.privateTools)) setJSON(KEYS.privateTools, []);
  if (!localStorage.getItem(KEYS.libraryCollapsed)) setJSON(KEYS.libraryCollapsed, {});
}

/* ---------------- shared ui ---------------- */

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
  const backdrop = modal.querySelector("[data-close-modal]");

  window.showConfirm = function (title, text, onConfirm) {
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
  backdrop?.addEventListener("click", closeConfirm);
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
  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  const backdrop = modal.querySelector("[data-close-admin-modal]");
  const adminBtn = document.getElementById("adminToggleBtn");

  function open() {
    modal.classList.remove("hidden");
    setTimeout(() => emailInput?.focus(), 50);
  }

  cancelBtn?.addEventListener("click", closeAdminModal);
  backdrop?.addEventListener("click", closeAdminModal);

  loginBtn?.addEventListener("click", handleAdminLogin);

  passwordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn?.click();
  });

  adminBtn?.addEventListener("click", () => {
    if (isAdmin) {
      handleAdminLogout();
    } else {
      open();
    }
  });
}

function setupEditModal() {
  const modal = document.getElementById("editToolModal");
  if (!modal) return;

  const cancelBtn = document.getElementById("editCancelBtn");
  const saveBtn = document.getElementById("editSaveBtn");
  const backdrop = modal.querySelector("[data-close-edit-modal]");

  function close() {
    modal.classList.add("hidden");
    editingPublicToolId = null;
  }

  window.openEditToolModal = async function (tool) {
    editingPublicToolId = tool.id;
    document.getElementById("editToolName").value = tool.name || "";
    document.getElementById("editToolUrl").value = tool.link || "";
    document.getElementById("editToolFav").checked = !!tool.fav;

    const categories = await fetchPublicCategories();
    const select = document.getElementById("editToolCategory");
    updateSelectOptions(select, categories, "Select category");
    select.value = tool.cat || "";

    modal.classList.remove("hidden");
  };

  cancelBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);

  saveBtn?.addEventListener("click", async () => {
    const name = document.getElementById("editToolName").value.trim();
    const link = sanitizeUrl(document.getElementById("editToolUrl").value.trim());
    const cat = document.getElementById("editToolCategory").value;
    const fav = document.getElementById("editToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    const { error } = await supabaseClient
      .from("public_tools")
      .update({ name, link, cat, fav })
      .eq("id", editingPublicToolId);

    if (error) return showToast("Could not update tool", "error");

    close();
    await renderHome();
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

/* ---------------- helpers ---------------- */

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
  return `https://www.google.com/s2/favicons?sz=128&domain=${getDomain(url)}`;
}

function suggestNameFromUrl(url) {
  const domain = getDomain(url);
  if (!domain) return "";
  const base = domain.split(".")[0] || "";
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function fallbackColor(text) {
  const colors = ["#4a9eff", "#845ef7", "#12b886", "#f59f00", "#e8590c", "#d6336c"];
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return colors[sum % colors.length];
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
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
      onSuccess(JSON.parse(reader.result));
    } catch {
      showToast("Invalid file. Please select a valid backup file.", "error");
    }
  };
  reader.readAsText(file);
}

function moveLocalCategory(key, index, direction) {
  const arr = getJSON(key);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  setJSON(key, arr);
}

function scoreTool(tool, term) {
  const name = tool.name.toLowerCase();
  const cat = tool.cat.toLowerCase();

  if (!term) return 0;
  if (name === term) return 100;
  if (name.startsWith(term)) return 90;
  if (name.includes(term)) return 75;
  if (cat === term) return 60;
  if (cat.startsWith(term)) return 50;
  if (cat.includes(term)) return 40;
  return 0;
}

/* ---------------- supabase public data ---------------- */

async function fetchPublicCategories() {
  const { data, error } = await supabaseClient
    .from("public_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load public categories", "error");
    return [];
  }

  return data || [];
}

async function fetchPublicTools() {
  const { data, error } = await supabaseClient
    .from("public_tools")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load public tools", "error");
    return [];
  }

  return data || [];
}

/* ---------------- home page ---------------- */

async function initHomePage() {
  const createCategoryBtn = document.getElementById("createPublicCategoryBtn");
  const addToolBtn = document.getElementById("addPublicToolBtn");
  const exportAllBtn = document.getElementById("exportAllBtn");
  const importAllBtn = document.getElementById("importAllBtn");
  const importAllInput = document.getElementById("importAllInput");
  const searchInput = document.getElementById("publicSearch");
  const publicToolUrl = document.getElementById("publicToolUrl");
  const publicToolName = document.getElementById("publicToolName");

  await renderHome();

  createCategoryBtn?.addEventListener("click", async () => {
    if (!isAdmin) return showToast("Please log in as admin first", "error");

    const name = document.getElementById("publicCategoryName").value.trim();
    const description = document.getElementById("publicCategoryDesc").value.trim();

    if (!name) return showToast("Name required!", "error");

    const categories = await fetchPublicCategories();
    const highestSort = categories.length ? Math.max(...categories.map(c => c.sort_order || 0)) : 0;

    const { error } = await supabaseClient.from("public_categories").insert({
      name,
      description,
      sort_order: highestSort + 1
    });

    if (error) return showToast("Could not create category", "error");

    document.getElementById("publicCategoryName").value = "";
    document.getElementById("publicCategoryDesc").value = "";

    await renderHome();
    showToast("Category created!", "success");
  });

  addToolBtn?.addEventListener("click", async () => {
    if (!isAdmin) return showToast("Please log in as admin first", "error");

    const name = publicToolName.value.trim();
    const link = sanitizeUrl(publicToolUrl.value.trim());
    const cat = document.getElementById("publicToolCategory").value;
    const fav = document.getElementById("publicToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    const tools = await fetchPublicTools();
    const highestSort = tools.length ? Math.max(...tools.map(t => t.sort_order || 0)) : 0;

    const { error } = await supabaseClient.from("public_tools").insert({
      name,
      link,
      cat,
      fav,
      sort_order: highestSort + 1
    });

    if (error) return showToast("Could not add tool", "error");

    publicToolName.value = "";
    publicToolUrl.value = "";
    document.getElementById("publicToolFav").checked = false;

    await renderHome();
    showToast("Tool added!", "success");
  });

  publicToolUrl?.addEventListener("input", () => {
    if (!publicToolName.value.trim() && publicToolUrl.value.trim()) {
      publicToolName.value = suggestNameFromUrl(publicToolUrl.value);
    }
  });

  searchInput?.addEventListener("input", renderHome);

  exportAllBtn?.addEventListener("click", async () => {
    const data = {
      publicCategories: await fetchPublicCategories(),
      publicTools: await fetchPublicTools(),
      privateCategories: getJSON(KEYS.privateCategories),
      privateTools: getJSON(KEYS.privateTools)
    };
    downloadJSON("toolbox-full-backup.json", data);
    showToast("Data exported!", "success");
  });

  importAllBtn?.addEventListener("click", () => importAllInput.click());

  importAllInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseJSONFile(file, async (data) => {
      if (!data.publicCategories || !data.publicTools || !data.privateCategories || !data.privateTools) {
        return showToast("Invalid file. Please select a valid backup file.", "error");
      }

      if (!isAdmin) return showToast("Please log in as admin first", "error");

      await supabaseClient.from("public_tools").delete().gte("id", 0);
      await supabaseClient.from("public_categories").delete().gte("id", 0);

      if (data.publicCategories.length) {
        await supabaseClient.from("public_categories").insert(
          data.publicCategories.map((c, i) => ({
            name: c.name,
            description: c.description || c.desc || "",
            sort_order: c.sort_order ?? i + 1
          }))
        );
      }

      if (data.publicTools.length) {
        await supabaseClient.from("public_tools").insert(
          data.publicTools.map((t, i) => ({
            name: t.name,
            link: t.link,
            cat: t.cat,
            fav: !!t.fav,
            sort_order: t.sort_order ?? i + 1
          }))
        );
      }

      setJSON(KEYS.privateCategories, data.privateCategories);
      setJSON(KEYS.privateTools, data.privateTools);

      await renderHome();
      showToast("Data imported successfully", "info");
    });

    e.target.value = "";
  });
}

async function renderHome() {
  const categories = await fetchPublicCategories();
  const tools = await fetchPublicTools();
  const searchTerm = (document.getElementById("publicSearch")?.value || "").trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  const adminPanel = document.getElementById("adminPanelSection");
  const favoritesSection = document.getElementById("publicFavoritesSection");
  const favoritesGrid = document.getElementById("publicFavoritesGrid");
  const categoriesSection = document.getElementById("publicCategoriesSection");
  const categoriesContainer = document.getElementById("publicCategoriesContainer");
  const searchSection = document.getElementById("publicSearchSection");
  const searchResults = document.getElementById("publicSearchResults");
  const noResults = document.getElementById("publicNoResults");
  const stats = document.getElementById("publicStats");
  const publicToolCategory = document.getElementById("publicToolCategory");

  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin);
  updateSelectOptions(publicToolCategory, categories);

  favoritesGrid.innerHTML = "";
  categoriesContainer.innerHTML = "";
  searchResults.innerHTML = "";
  noResults.classList.add("hidden");

  if (!categories.length && !tools.length) {
    categoriesSection.classList.remove("hidden");
    categoriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🚀</div>
        <strong>No resources have been added yet. Check back soon!</strong>
      </div>
    `;
    favoritesSection.classList.add("hidden");
    searchSection.classList.add("hidden");
    stats.textContent = "0 public links across 0 categories";
    return;
  }

  const matchingTools = tools
    .filter(tool => {
      if (!searchTerm) return true;
      return tool.name.toLowerCase().includes(searchTerm) || tool.cat.toLowerCase().includes(searchTerm);
    })
    .sort((a, b) => scoreTool(b, searchTerm) - scoreTool(a, searchTerm));

  if (isSearching) {
    favoritesSection.classList.add("hidden");
    categoriesSection.classList.add("hidden");
    searchSection.classList.remove("hidden");
    stats.textContent = `${matchingTools.length} results found for "${searchTerm}"`;

    if (!matchingTools.length) {
      noResults.classList.remove("hidden");
      noResults.innerHTML = `
        <div class="empty-emoji">🔍</div>
        <strong>No results found for "${escapeHtml(searchTerm)}"</strong>
      `;
      return;
    }

    matchingTools.forEach(tool => {
      searchResults.appendChild(createLinkCard(tool, "public", true));
    });

    return;
  }

  searchSection.classList.add("hidden");
  categoriesSection.classList.remove("hidden");
  stats.textContent = `${tools.length} public links across ${categories.length} categories`;

  const favorites = tools.filter(tool => tool.fav);
  if (favorites.length) {
    favoritesSection.classList.remove("hidden");
    favorites.forEach(tool => favoritesGrid.appendChild(createLinkCard(tool, "public", false)));
  } else {
    favoritesSection.classList.add("hidden");
  }

  categories.forEach((cat, catIndex) => {
    const catTools = tools.filter(tool => tool.cat === cat.name);

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
    tooltip.textContent = cat.description || "No description";
    info.appendChild(tooltip);
    info.addEventListener("click", (e) => e.stopPropagation());

    left.append(title, count, info);

    const actions = document.createElement("div");
    actions.className = "category-actions";

    if (isAdmin) {
      const upBtn = createMiniButton("↑", "Move up", async (e) => {
        e.stopPropagation();
        if (catIndex === 0) return;
        const prev = categories[catIndex - 1];
        await supabaseClient.from("public_categories").update({ sort_order: prev.sort_order }).eq("id", cat.id);
        await supabaseClient.from("public_categories").update({ sort_order: cat.sort_order }).eq("id", prev.id);
        await renderHome();
      });

      const downBtn = createMiniButton("↓", "Move down", async (e) => {
        e.stopPropagation();
        if (catIndex === categories.length - 1) return;
        const next = categories[catIndex + 1];
        await supabaseClient.from("public_categories").update({ sort_order: next.sort_order }).eq("id", cat.id);
        await supabaseClient.from("public_categories").update({ sort_order: cat.sort_order }).eq("id", next.id);
        await renderHome();
      });

      const delBtn = createMiniButton("🗑", "Delete category", (e) => {
        e.stopPropagation();
        showConfirm("Delete this category?", "Delete this category and all tools inside?", async () => {
          await supabaseClient.from("public_tools").delete().eq("cat", cat.name);
          await supabaseClient.from("public_categories").delete().eq("id", cat.id);
          await renderHome();
          showToast("Category deleted!", "success");
        });
      });

      actions.append(upBtn, downBtn, delBtn);
    }

    const arrow = createMiniButton("▾", "Expanded", null);
    actions.appendChild(arrow);

    head.append(left, actions);

    const content = document.createElement("div");
    content.className = "category-content";

    if (catTools.length) {
      const grid = document.createElement("div");
      grid.className = "card-grid";
      catTools.forEach(tool => grid.appendChild(createLinkCard(tool, "public", false)));
      content.appendChild(grid);
    } else {
      content.innerHTML = `<div class="empty-inline">No tools in this category yet</div>`;
    }

    block.append(head, content);
    categoriesContainer.appendChild(block);
  });
}

/* ---------------- library page ---------------- */

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
    downloadJSON("my-library-backup.json", {
      privateCategories: getJSON(KEYS.privateCategories),
      privateTools: getJSON(KEYS.privateTools)
    });
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
      setJSON(KEYS.privateTools, data.privateTools);
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

  const favoritesSection = document.getElementById("privateFavoritesSection");
  const favoritesGrid = document.getElementById("privateFavoritesGrid");
  const categoriesSection = document.getElementById("privateCategoriesSection");
  const categoriesContainer = document.getElementById("privateCategoriesContainer");
  const searchSection = document.getElementById("privateSearchSection");
  const searchResults = document.getElementById("privateSearchResults");
  const noResults = document.getElementById("privateNoResults");
  const stats = document.getElementById("libraryStats");
  const privateToolCategory = document.getElementById("privateToolCategory");

  updateSelectOptions(privateToolCategory, categories);

  favoritesGrid.innerHTML = "";
  categoriesContainer.innerHTML = "";
  searchResults.innerHTML = "";
  noResults.classList.add("hidden");

  if (!categories.length && !tools.length) {
    categoriesSection.classList.remove("hidden");
    categoriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">📁</div>
        <strong>Your library is empty! Create a category to get started</strong>
        <div>Start building your library!</div>
        <div>Create your first category above and add links you want to save</div>
      </div>
    `;
    favoritesSection.classList.add("hidden");
    searchSection.classList.add("hidden");
    stats.textContent = "You have saved 0 links across 0 categories";
    return;
  }

  const matchingTools = tools
    .filter(tool => {
      if (!searchTerm) return true;
      return tool.name.toLowerCase().includes(searchTerm) || tool.cat.toLowerCase().includes(searchTerm);
    })
    .sort((a, b) => scoreTool(b, searchTerm) - scoreTool(a, searchTerm));

  if (isSearching) {
    favoritesSection.classList.add("hidden");
    categoriesSection.classList.add("hidden");
    searchSection.classList.remove("hidden");
    stats.textContent = `${matchingTools.length} results found for "${searchTerm}"`;

    if (!matchingTools.length) {
      noResults.classList.remove("hidden");
      noResults.innerHTML = `
        <div class="empty-emoji">🔍</div>
        <strong>No results found for "${escapeHtml(searchTerm)}"</strong>
      `;
      return;
    }

    matchingTools.forEach(tool => {
      searchResults.appendChild(createLinkCard(tool, "private", true));
    });

    return;
  }

  searchSection.classList.add("hidden");
  categoriesSection.classList.remove("hidden");
  stats.textContent = `You have saved ${tools.length} links across ${categories.length} categories`;

  const favorites = tools.filter(tool => tool.fav);
  if (favorites.length) {
    favoritesSection.classList.remove("hidden");
    favorites.forEach(tool => favoritesGrid.appendChild(createLinkCard(tool, "private", false)));
  } else {
    favoritesSection.classList.add("hidden");
  }

  categories.forEach((cat, catIndex) => {
    const catTools = tools.filter(tool => tool.cat === cat.name);

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
      moveLocalCategory(KEYS.privateCategories, catIndex, -1);
      renderLibrary();
    });

    const downBtn = createMiniButton("↓", "Move down", (e) => {
      e.stopPropagation();
      moveLocalCategory(KEYS.privateCategories, catIndex, 1);
      renderLibrary();
    });

    const delBtn = createMiniButton("🗑", "Delete category", (e) => {
      e.stopPropagation();
      showConfirm("Delete this category?", "Delete this category and all tools inside?", () => {
        deletePrivateCategory(cat.name);
      });
    });

    const arrow = createMiniButton(collapsed[cat.name] ? "▸" : "▾", "Toggle category", null);

    actions.append(upBtn, downBtn, delBtn, arrow);

    head.append(left, actions);

    const content = document.createElement("div");
    content.className = "category-content";
    if (collapsed[cat.name]) content.classList.add("hidden");

    if (catTools.length) {
      const grid = document.createElement("div");
      grid.className = "card-grid";
      catTools.forEach(tool => grid.appendChild(createLinkCard(tool, "private", false)));
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
}

function deletePrivateCategory(categoryName) {
  setJSON(KEYS.privateCategories, getJSON(KEYS.privateCategories).filter(c => c.name !== categoryName));
  setJSON(KEYS.privateTools, getJSON(KEYS.privateTools).filter(t => t.cat !== categoryName));
  renderLibrary();
  showToast("Category deleted!", "success");
}

/* ---------------- sync ---------------- */

function generateSyncCode() {
  const adjectives = ["blue", "bright", "silent", "golden", "cosmic", "rapid", "lucky", "clever"];
  const animals = ["tiger", "fox", "otter", "falcon", "wolf", "panda", "eagle", "koala"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${animal}-${num}`;
}

function generateSyncCodeFlow() {
  const code = generateSyncCode();
  localStorage.setItem(`sync_${code}`, JSON.stringify({
    privateCategories: getJSON(KEYS.privateCategories),
    privateTools: getJSON(KEYS.privateTools)
  }));
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
    setJSON(KEYS.privateTools, data.privateTools || []);
    renderLibrary();
    showToast("Library loaded from sync code!", "info");
  } catch {
    showToast("Code not found. Make sure you're entering it correctly.", "error");
  }
}

/* ---------------- cards ---------------- */

function createLinkCard(tool, type, showCategory = false) {
  const card = document.createElement("div");
  card.className = "link-card";

  const top = document.createElement("div");
  top.className = "card-top";

  const topLeft = document.createElement("div");
  topLeft.className = "top-left-stack";

  if (tool.fav) {
    const fav = document.createElement("div");
    fav.className = "favorite-badge";
    fav.textContent = "⭐";
    topLeft.appendChild(fav);
  }

  if (showCategory) {
    const chip = document.createElement("div");
    chip.className = "category-chip";
    chip.textContent = tool.cat;
    topLeft.appendChild(chip);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-card-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "×";

  const canDelete = type === "private" || (type === "public" && isAdmin);
  if (!canDelete) deleteBtn.classList.add("hidden");

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showConfirm("Delete this tool?", "This action cannot be undone.", async () => {
      if (type === "public") {
        const { error } = await supabaseClient.from("public_tools").delete().eq("id", tool.id);
        if (error) return showToast("Could not delete tool", "error");
        await renderHome();
      } else {
        deletePrivateTool(tool.id);
      }
      showToast("Tool deleted!", "success");
    });
  });

  top.append(topLeft, deleteBtn);

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

    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (type === "public") {
        const { error } = await supabaseClient
          .from("public_tools")
          .update({ fav: !tool.fav })
          .eq("id", tool.id);

        if (error) return showToast("Could not update favorite", "error");
        await renderHome();
      } else {
        togglePrivateFavorite(tool.id);
      }
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

function deletePrivateTool(id) {
  const tools = getJSON(KEYS.privateTools).filter(tool => tool.id !== id);
  setJSON(KEYS.privateTools, tools);
  renderLibrary();
}

function togglePrivateFavorite(id) {
  const tools = getJSON(KEYS.privateTools).map(tool =>
    tool.id === id ? { ...tool, fav: !tool.fav } : tool
  );
  setJSON(KEYS.privateTools, tools);
  renderLibrary();
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
