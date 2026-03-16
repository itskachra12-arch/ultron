const SUPABASE_URL = "https://tgszbddlpxbnapkqyzoc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnc3piZGRscHhibmFwa3F5em9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTExNjUsImV4cCI6MjA4OTAyNzE2NX0.NDz8CgSjsBmWP-oF3Jb-yRbTZE0JkjBsly98SVcFs-Q";
const ADMIN_USER_ID = "2a7c9c98-580e-4329-8739-0459bd2dc878";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const KEYS = {
  privateCategories: "privateCategories",
  privateTools: "privateTools",
  libraryCollapsed: "libraryCollapsedCategories",
  guestImportDismissed: "guestImportDismissed"
};

const APP_BASE_URL = "https://itskachra12-arch.github.io/ultron/";
const RESET_REDIRECT_URL = APP_BASE_URL + "library.html?reset=1";

let isAdmin = false;
let confirmCallback = null;
let editingPublicToolId = null;
let currentUser = null;
let isImportingGuestLibrary = false;
let currentAdminTab = "feedback";
let deleteAccountSupported = false;

document.addEventListener("DOMContentLoaded", async () => {
  seedPrivateDefaults();
  setupSharedUI();

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      currentUser = session?.user || null;
      isAdmin = currentUser?.id === ADMIN_USER_ID;

      updateLibraryModeIndicator();
      updateAdminUI();

      const page = document.body.dataset.page;

      if (page === "home") {
        if (isAdmin) {
          await loadAdminFeedback();
        }
        await renderHome();
      }

      if (page === "library") {
        await refreshLibraryAuthUI();
        await renderLibrary();

        if (event === "SIGNED_IN" && currentUser) {
          maybePromptGuestImport();
        }
      }
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    isAdmin = currentUser?.id === ADMIN_USER_ID;
  }

  updateLibraryModeIndicator();
  updateAdminUI();

  const page = document.body.dataset.page;
  if (page === "home") await initHomePage();
  if (page === "library") await initLibraryPage();

  setupFeedbackModal();
});

/* ---------------- auth ---------------- */

async function handleAdminLogin() {
  const email = document.getElementById("adminEmailInput")?.value.trim() || "";
  const password = document.getElementById("adminPasswordInput")?.value.trim() || "";

  if (!email || !password) {
    return showToast("Email and password required!", "error");
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    return showToast("Login failed: " + error.message, "error");
  }

  const user = data?.user;
  if (!user || user.id !== ADMIN_USER_ID) {
    await supabaseClient.auth.signOut();
    return showToast("This account does not have admin access.", "error");
  }

  currentUser = user;
  isAdmin = true;
  closeAdminLoginModal();
  openModalById("adminPanelModal");
  switchAdminTab("feedback");
  updateAdminUI();
  await loadAdminFeedback();
  await renderHome();
  showToast("Logged in as admin!", "success");
}

async function handleAdminLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) return showToast("Logout failed", "error");

  currentUser = null;
  isAdmin = false;
  updateAdminUI();
  closeModalById("adminPanelModal");
  await renderHome();
  showToast("Logged out", "info");
}

async function handleUserSignup() {
  const email = document.getElementById("userSignupEmail")?.value.trim() || "";
  const password = document.getElementById("userSignupPassword")?.value.trim() || "";

  if (!email || !password) {
    return showToast("Email and password required!", "error");
  }

  if (password.length < 6) {
    return showToast("Password should be at least 6 characters.", "error");
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: RESET_REDIRECT_URL
    }
  });

  if (error) {
    return showToast(error.message, "error");
  }

  document.getElementById("userSignupEmail").value = "";
  document.getElementById("userSignupPassword").value = "";

  const authMsg = document.getElementById("authSuccessMessage");
  if (data?.session) {
    if (authMsg) {
      authMsg.textContent = "Account created successfully. You are now logged in.";
      authMsg.classList.remove("hidden");
    }
    showToast("Account created and logged in!", "success");
  } else {
    if (authMsg) {
      authMsg.textContent = "Account created. Please check your email to confirm your account.";
      authMsg.classList.remove("hidden");
    }
    showToast("Signup successful. Check your email.", "success");
  }
}

async function handleUserLogin() {
  const email = document.getElementById("userLoginEmail")?.value.trim() || "";
  const password = document.getElementById("userLoginPassword")?.value.trim() || "";

  if (!email || !password) {
    return showToast("Email and password required!", "error");
  }

  const guestHasData = hasGuestLibraryData();

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    return showToast("Login failed: " + error.message, "error");
  }

  currentUser = data?.user || null;
  isAdmin = currentUser?.id === ADMIN_USER_ID;

  await refreshLibraryAuthUI();
  await renderLibrary();
  closeModalById("accountModal");

  if (guestHasData && currentUser) {
    maybePromptGuestImport(true);
  }

  showToast("Logged in!", "success");
}

async function handleUserLogout() {
  showConfirm("Log Out", "Are you sure you want to log out?", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) return showToast("Logout failed", "error");

    currentUser = null;
    isAdmin = false;

    await refreshLibraryAuthUI();
    updateLibraryModeIndicator();
    await renderLibrary();
    closeModalById("accountModal");
    showToast("Logged out. Back to guest mode.", "info");
  }, "Log Out");
}

async function sendForgotPassword(email, messageTargetId = "forgotPasswordMessage") {
  const cleanEmail = (email || "").trim();
  if (!cleanEmail) {
    return showToast("Please enter your email.", "error");
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: RESET_REDIRECT_URL
  });

  if (error) {
    return showToast(error.message, "error");
  }

  const box = document.getElementById(messageTargetId);
  if (box) {
    box.textContent = "Password reset email sent. Please check your inbox and spam/junk folder.";
    box.classList.remove("hidden");
  }

  showToast("Password reset email sent.", "success");
}

async function handleResetPasswordSave() {
  const newPassword = document.getElementById("resetNewPassword")?.value.trim() || "";
  const confirmPassword = document.getElementById("resetConfirmPassword")?.value.trim() || "";
  const box = document.getElementById("resetPasswordMessage");

  if (!newPassword || !confirmPassword) {
    return showToast("Please fill both password fields.", "error");
  }

  if (newPassword.length < 6) {
    return showToast("Password should be at least 6 characters.", "error");
  }

  if (newPassword !== confirmPassword) {
    return showToast("Passwords do not match.", "error");
  }

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

  if (error) {
    return showToast(error.message, "error");
  }

  if (box) {
    box.textContent = "Password updated successfully. You can now log in.";
    box.classList.remove("hidden");
  }

  document.getElementById("resetNewPassword").value = "";
  document.getElementById("resetConfirmPassword").value = "";

  setTimeout(() => {
    showAccountView("login");
  }, 900);
}

function updateAdminUI() {
  if (!document.body || document.body.dataset.page !== "home") return;
  if (!isAdmin) {
    closeModalById("adminPanelModal");
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById("adminLoginModal");
  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  const forgotInput = document.getElementById("adminForgotEmailInput");
  const forgotWrap = document.getElementById("adminForgotWrap");

  if (modal) modal.classList.add("hidden");
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
  if (forgotInput) forgotInput.value = "";
  if (forgotWrap) forgotWrap.classList.add("hidden");
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

function hasGuestLibraryData() {
  const categories = getJSON(KEYS.privateCategories, []);
  const tools = getJSON(KEYS.privateTools, []);
  return categories.length > 0 || tools.length > 0;
}

/* ---------------- shared ui ---------------- */

function setupSharedUI() {
  setupToasts();
  setupConfirmModal();
  setupScrollTop();
  setupKeyboardShortcut();
  setupAdminModal();
  setupAdminTabs();
  setupEditModal();
  setupCustomModals();
  setupPasswordToggles();
  setupAccountViews();
  setupDeleteAccountFlow();
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

  window.showConfirm = function (title, text, onConfirm, confirmText = "Delete") {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = text;
    if (deleteBtn) deleteBtn.textContent = confirmText;
    confirmCallback = onConfirm;
    modal.classList.remove("hidden");
  };

  function closeConfirm() {
    modal.classList.add("hidden");
    confirmCallback = null;
    if (deleteBtn) deleteBtn.textContent = "Delete";
  }

  cancelBtn?.addEventListener("click", closeConfirm);
  backdrop?.addEventListener("click", closeConfirm);
  deleteBtn?.addEventListener("click", () => {
    if (typeof confirmCallback === "function") confirmCallback();
    closeConfirm();
  });
}

function setupAdminModal() {
  const loginModal = document.getElementById("adminLoginModal");
  const loginBtn = document.getElementById("adminLoginBtn");
  const cancelBtn = document.getElementById("adminCancelBtn");
  const passwordInput = document.getElementById("adminPasswordInput");
  const backdrop = document.querySelector("[data-close-admin-login-modal]");
  const adminPanelBackdrop = document.querySelector("[data-close-admin-panel-modal]");
  const adminPanelCloseBtn = document.getElementById("adminPanelCloseBtn");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
  const adminForgotPasswordBtn = document.getElementById("adminForgotPasswordBtn");
  const adminSendResetBtn = document.getElementById("adminSendResetBtn");

  function openAdminEntry() {
    if (isAdmin && currentUser?.id === ADMIN_USER_ID) {
      openModalById("adminPanelModal");
      switchAdminTab("feedback");
      loadAdminFeedback();
    } else {
      loginModal?.classList.remove("hidden");
      setTimeout(() => document.getElementById("adminEmailInput")?.focus(), 50);
    }
  }

  window.openAdminEntry = openAdminEntry;

  cancelBtn?.addEventListener("click", closeAdminLoginModal);
  backdrop?.addEventListener("click", closeAdminLoginModal);
  adminPanelBackdrop?.addEventListener("click", () => closeModalById("adminPanelModal"));
  adminPanelCloseBtn?.addEventListener("click", () => closeModalById("adminPanelModal"));
  adminLogoutBtn?.addEventListener("click", handleAdminLogout);

  loginBtn?.addEventListener("click", handleAdminLogin);

  passwordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn?.click();
  });

  adminForgotPasswordBtn?.addEventListener("click", () => {
    document.getElementById("adminForgotWrap")?.classList.toggle("hidden");
  });

  adminSendResetBtn?.addEventListener("click", async () => {
    const email = document.getElementById("adminForgotEmailInput")?.value.trim() || document.getElementById("adminEmailInput")?.value.trim() || "";
    await sendForgotPassword(email, "adminLoginMessage");
  });
}

function setupAdminTabs() {
  const buttons = document.querySelectorAll("[data-admin-tab]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      switchAdminTab(btn.dataset.adminTab);
    });
  });

  const feedbackFilter = document.getElementById("adminFeedbackFilter");
  feedbackFilter?.addEventListener("change", loadAdminFeedback);
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  document.querySelectorAll("[data-admin-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.adminTab === tabName);
  });

  ["feedback", "tools", "categories", "backup"].forEach(tab => {
    const panel = document.getElementById(`adminTabPanel${capitalize(tab)}`);
    if (panel) panel.classList.toggle("hidden", tab !== tabName);
  });

  if (tabName === "feedback") {
    loadAdminFeedback();
  }
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

function setupCustomModals() {
  const openQuickAddModalBtn = document.getElementById("openQuickAddModalBtn");
  const closeQuickAddModalBtn = document.getElementById("closeQuickAddModalBtn");
  const quickAddBackdrop = document.querySelector("[data-close-quick-add-modal]");

  const modeBtn = document.getElementById("libraryModeBtn");
  const closeAccountModalBtn = document.getElementById("closeAccountModalBtn");
  const accountBackdrop = document.querySelector("[data-close-account-modal]");

  openQuickAddModalBtn?.addEventListener("click", () => openModalById("quickAddModal"));
  closeQuickAddModalBtn?.addEventListener("click", () => closeModalById("quickAddModal"));
  quickAddBackdrop?.addEventListener("click", () => closeModalById("quickAddModal"));

  modeBtn?.addEventListener("click", async () => {
    openModalById("accountModal");
    if (currentUser) {
      showAccountView("active");
    } else {
      showAccountView("signup");
    }
    await refreshLibraryAuthUI();
  });

  closeAccountModalBtn?.addEventListener("click", () => closeModalById("accountModal"));
  accountBackdrop?.addEventListener("click", () => closeModalById("accountModal"));

  const guestImportNowBtn = document.getElementById("guestImportNowBtn");
  const guestImportNotNowBtn = document.getElementById("guestImportNotNowBtn");
  const guestImportDontAskBtn = document.getElementById("guestImportDontAskBtn");

  guestImportNowBtn?.addEventListener("click", async () => {
    closeModalById("guestImportPromptModal");
    await importGuestLibraryToAccount();
  });

  guestImportNotNowBtn?.addEventListener("click", () => {
    closeModalById("guestImportPromptModal");
  });

  guestImportDontAskBtn?.addEventListener("click", () => {
    localStorage.setItem(KEYS.guestImportDismissed, "1");
    closeModalById("guestImportPromptModal");
    refreshLibraryAuthUI();
  });
}

function setupAccountViews() {
  const switchToLoginBtn = document.getElementById("switchToLoginBtn");
  const switchToSignupBtn = document.getElementById("switchToSignupBtn");
  const openForgotPasswordBtn = document.getElementById("openForgotPasswordBtn");
  const backToLoginBtn = document.getElementById("backToLoginBtn");
  const sendForgotPasswordBtn = document.getElementById("sendForgotPasswordBtn");
  const saveNewPasswordBtn = document.getElementById("saveNewPasswordBtn");

  switchToLoginBtn?.addEventListener("click", () => showAccountView("login"));
  switchToSignupBtn?.addEventListener("click", () => showAccountView("signup"));
  openForgotPasswordBtn?.addEventListener("click", () => showAccountView("forgot"));
  backToLoginBtn?.addEventListener("click", () => showAccountView("login"));

  sendForgotPasswordBtn?.addEventListener("click", async () => {
    const email = document.getElementById("forgotPasswordEmail")?.value.trim() || "";
    await sendForgotPassword(email, "forgotPasswordMessage");
  });

  saveNewPasswordBtn?.addEventListener("click", handleResetPasswordSave);
}

function showAccountView(view) {
  const guestView = document.getElementById("accountGuestView");
  const loginView = document.getElementById("accountLoginView");
  const forgotView = document.getElementById("forgotPasswordView");
  const resetView = document.getElementById("resetPasswordView");
  const activeView = document.getElementById("accountWrap");

  [guestView, loginView, forgotView, resetView, activeView].forEach(el => el?.classList.add("hidden"));

  if (view === "signup") guestView?.classList.remove("hidden");
  if (view === "login") loginView?.classList.remove("hidden");
  if (view === "forgot") forgotView?.classList.remove("hidden");
  if (view === "reset") resetView?.classList.remove("hidden");
  if (view === "active") activeView?.classList.remove("hidden");
}

function setupDeleteAccountFlow() {
  const openDeleteBtn = document.getElementById("openDeleteAccountBtn");
  const cancelBtn = document.getElementById("deleteAccountCancelBtn");
  const continueBtn = document.getElementById("deleteAccountContinueBtn");
  const confirmBtn = document.getElementById("confirmDeleteAccountBtn");
  const forgotBtn = document.getElementById("deleteAccountForgotPasswordBtn");
  const backdrop = document.querySelector("[data-close-delete-account-modal]");

  openDeleteBtn?.addEventListener("click", () => {
    if (!deleteAccountSupported) {
      return showToast("Delete account is not enabled yet.", "info");
    }
    openModalById("deleteAccountModal");
    resetDeleteAccountModal();
  });

  cancelBtn?.addEventListener("click", () => closeModalById("deleteAccountModal"));
  backdrop?.addEventListener("click", () => closeModalById("deleteAccountModal"));

  continueBtn?.addEventListener("click", () => {
    document.getElementById("deleteAccountStep1")?.classList.add("hidden");
    document.getElementById("deleteAccountStep2")?.classList.remove("hidden");
  });

  forgotBtn?.addEventListener("click", async () => {
    closeModalById("deleteAccountModal");
    openModalById("accountModal");
    showAccountView("forgot");
    document.getElementById("forgotPasswordEmail").value = currentUser?.email || "";
  });

  confirmBtn?.addEventListener("click", async () => {
    showToast("Secure delete-account backend not enabled yet.", "info");
  });
}

function resetDeleteAccountModal() {
  document.getElementById("deleteAccountStep1")?.classList.remove("hidden");
  document.getElementById("deleteAccountStep2")?.classList.add("hidden");
  const password = document.getElementById("deleteAccountPassword");
  const box = document.getElementById("deleteAccountMessage");
  if (password) password.value = "";
  if (box) {
    box.textContent = "";
    box.classList.add("hidden");
  }
}

function openModalById(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("hidden");
}

function closeModalById(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("hidden");
}

function setupPasswordToggles() {
  const togglePairs = [
    ["toggleSignupPasswordBtn", "userSignupPassword"],
    ["toggleLoginPasswordBtn", "userLoginPassword"],
    ["toggleResetPasswordBtn", "resetNewPassword"],
    ["toggleResetConfirmPasswordBtn", "resetConfirmPassword"],
    ["toggleDeletePasswordBtn", "deleteAccountPassword"],
    ["toggleAdminPasswordBtn", "adminPasswordInput"]
  ];

  togglePairs.forEach(([btnId, inputId]) => {
    const btn = document.getElementById(btnId);
    btn?.addEventListener("click", () => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
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

    if (e.key === "Escape") {
      closeModalById("accountModal");
      closeModalById("quickAddModal");
      closeModalById("guestImportPromptModal");
      closeAdminLoginModal();
      closeModalById("adminPanelModal");
      closeModalById("deleteAccountModal");
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (document.body.dataset.page === "home") {
        openAdminEntry();
      }
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
    const parsed = new URL(sanitizeUrl(url));
    return ["http:", "https:"].includes(parsed.protocol);
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
  const name = (tool.name || "").toLowerCase();
  const cat = (tool.cat || "").toLowerCase();

  if (!term) return 0;
  if (name === term) return 100;
  if (name.startsWith(term)) return 90;
  if (name.includes(term)) return 75;
  if (cat === term) return 60;
  if (cat.startsWith(term)) return 50;
  if (cat.includes(term)) return 40;
  return 0;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(dateStr) {
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return dateStr || "";
  }
}

function updateLibraryModeIndicator() {
  const title = document.getElementById("modeIndicatorTitle");
  const email = document.getElementById("modeIndicatorEmail");
  if (!title || !email) return;

  if (currentUser) {
    title.textContent = "Account Mode";
    email.textContent = currentUser.email || "";
    email.classList.remove("hidden");
  } else {
    title.textContent = "Guest Mode";
    email.textContent = "";
    email.classList.add("hidden");
  }
}

function maybePromptGuestImport(force = false) {
  if (!currentUser) return;
  if (!hasGuestLibraryData()) return;
  if (!force && localStorage.getItem(KEYS.guestImportDismissed) === "1") return;
  openModalById("guestImportPromptModal");
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

async function fetchFeedbackMessages() {
  const { data, error } = await supabaseClient
    .from("feedback_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showToast("Could not load feedback messages", "error");
    return [];
  }

  return data || [];
}

/* ---------------- supabase private data ---------------- */

async function fetchCloudCategories() {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from("private_categories")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load cloud categories", "error");
    return [];
  }

  return data || [];
}

async function fetchCloudTools() {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from("private_tools")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load cloud tools", "error");
    return [];
  }

  return data || [];
}

async function createCloudCategory(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) return new Error("Invalid category name");

  const { error } = await supabaseClient.from("private_categories").insert({
    user_id: currentUser.id,
    name: cleanName
  });

  return error;
}

async function createCloudTool(tool) {
  const name = (tool.name || "").trim();
  const link = sanitizeUrl((tool.link || "").trim());
  const cat = (tool.cat || "").trim();

  if (!name || !link || !cat) return new Error("Invalid tool data");

  const { error } = await supabaseClient.from("private_tools").insert({
    id: generateId(),
    user_id: currentUser.id,
    name,
    link,
    cat,
    fav: !!tool.fav
  });

  return error;
}

async function deleteCloudCategory(categoryName) {
  await supabaseClient
    .from("private_tools")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("cat", categoryName);

  const { error } = await supabaseClient
    .from("private_categories")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("name", categoryName);

  return error;
}

async function deleteCloudTool(id) {
  const { error } = await supabaseClient
    .from("private_tools")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("id", id);

  return error;
}

async function toggleCloudFavorite(id, nextFav) {
  const { error } = await supabaseClient
    .from("private_tools")
    .update({ fav: nextFav })
    .eq("user_id", currentUser.id)
    .eq("id", id);

  return error;
}

async function replaceCloudLibrary(data) {
  await supabaseClient.from("private_tools").delete().eq("user_id", currentUser.id);
  await supabaseClient.from("private_categories").delete().eq("user_id", currentUser.id);

  if (data.privateCategories?.length) {
    const { error } = await supabaseClient.from("private_categories").insert(
      data.privateCategories
        .filter(cat => (cat.name || "").trim())
        .map(cat => ({
          user_id: currentUser.id,
          name: cat.name.trim()
        }))
    );
    if (error) return error;
  }

  if (data.privateTools?.length) {
    const { error } = await supabaseClient.from("private_tools").insert(
      data.privateTools
        .filter(tool => (tool.name || "").trim() && (tool.link || "").trim() && (tool.cat || "").trim())
        .map(tool => ({
          id: tool.id || generateId(),
          user_id: currentUser.id,
          name: tool.name.trim(),
          link: sanitizeUrl(tool.link),
          cat: tool.cat.trim(),
          fav: !!tool.fav
        }))
    );
    if (error) return error;
  }

  return null;
}

async function mergeGuestLibraryIntoAccount(data) {
  if (!currentUser) {
    return { error: new Error("No logged-in user"), addedCategories: 0, addedTools: 0 };
  }

  const existingCategories = await fetchCloudCategories();
  const existingTools = await fetchCloudTools();

  const existingCategoryNames = new Set(
    existingCategories.map(cat => (cat.name || "").trim().toLowerCase())
  );

  const existingToolKeys = new Set(
    existingTools.map(tool => {
      const name = (tool.name || "").trim().toLowerCase();
      const link = sanitizeUrl((tool.link || "").trim()).toLowerCase();
      const cat = (tool.cat || "").trim().toLowerCase();
      return `${name}|${link}|${cat}`;
    })
  );

  const categoriesToInsert = [];
  const toolsToInsert = [];

  for (const cat of data.privateCategories || []) {
    const name = (cat.name || "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (!existingCategoryNames.has(key)) {
      existingCategoryNames.add(key);
      categoriesToInsert.push({
        user_id: currentUser.id,
        name
      });
    }
  }

  for (const tool of data.privateTools || []) {
    const name = (tool.name || "").trim();
    const link = sanitizeUrl((tool.link || "").trim());
    const cat = (tool.cat || "").trim();

    if (!name || !link || !cat) continue;

    if (!existingCategoryNames.has(cat.toLowerCase())) {
      existingCategoryNames.add(cat.toLowerCase());
      categoriesToInsert.push({
        user_id: currentUser.id,
        name: cat
      });
    }

    const toolKey = `${name.toLowerCase()}|${link.toLowerCase()}|${cat.toLowerCase()}`;
    if (!existingToolKeys.has(toolKey)) {
      existingToolKeys.add(toolKey);
      toolsToInsert.push({
        id: generateId(),
        user_id: currentUser.id,
        name,
        link,
        cat,
        fav: !!tool.fav
      });
    }
  }

  if (categoriesToInsert.length) {
    const { error } = await supabaseClient
      .from("private_categories")
      .insert(categoriesToInsert);
    if (error) {
      return { error, addedCategories: 0, addedTools: 0 };
    }
  }

  if (toolsToInsert.length) {
    const { error } = await supabaseClient
      .from("private_tools")
      .insert(toolsToInsert);
    if (error) {
      return { error, addedCategories: categoriesToInsert.length, addedTools: 0 };
    }
  }

  return {
    error: null,
    addedCategories: categoriesToInsert.length,
    addedTools: toolsToInsert.length
  };
}

async function importGuestLibraryToAccount() {
  if (!currentUser) {
    showToast("Please log in first.", "error");
    return;
  }

  if (isImportingGuestLibrary) return;

  const importBtn = document.getElementById("importGuestDataBtn");
  const guestData = {
    privateCategories: getJSON(KEYS.privateCategories, []),
    privateTools: getJSON(KEYS.privateTools, [])
  };

  if (!guestData.privateCategories.length && !guestData.privateTools.length) {
    showToast("No guest library found to import.", "error");
    return;
  }

  try {
    isImportingGuestLibrary = true;

    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = "Importing...";
    }

    const result = await mergeGuestLibraryIntoAccount(guestData);

    if (result.error) {
      console.error(result.error);
      showToast("Could not import guest library.", "error");
      return;
    }

    await refreshLibraryAuthUI();
    await renderLibrary();

    if (!result.addedCategories && !result.addedTools) {
      showToast("Nothing new to import. Your account already has this guest data.", "info");
    } else {
      showToast(
        `Guest library imported! Added ${result.addedCategories} categories and ${result.addedTools} links.`,
        "success"
      );
    }
  } catch (err) {
    console.error(err);
    showToast("Import failed unexpectedly.", "error");
  } finally {
    isImportingGuestLibrary = false;

    if (importBtn && !importBtn.classList.contains("hidden")) {
      importBtn.disabled = false;
      importBtn.textContent = "Import Guest Library";
    }
  }
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

  const favoritesSection = document.getElementById("publicFavoritesSection");
  const favoritesGrid = document.getElementById("publicFavoritesGrid");
  const categoriesSection = document.getElementById("publicCategoriesSection");
  const categoriesContainer = document.getElementById("publicCategoriesContainer");
  const searchSection = document.getElementById("publicSearchSection");
  const searchResults = document.getElementById("publicSearchResults");
  const noResults = document.getElementById("publicNoResults");
  const stats = document.getElementById("publicStats");
  const publicToolCategory = document.getElementById("publicToolCategory");

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

async function loadAdminFeedback() {
  if (!isAdmin) return;

  const list = document.getElementById("adminFeedbackList");
  const filter = document.getElementById("adminFeedbackFilter")?.value || "All";
  if (!list) return;

  list.innerHTML = "";

  const messages = await fetchFeedbackMessages();
  const filtered = filter === "All"
    ? messages
    : messages.filter(item => item.type === filter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><strong>No feedback messages found.</strong></div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "feedback-list";

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "feedback-card";

    const meta = document.createElement("div");
    meta.className = "feedback-meta";

    const type = document.createElement("span");
    type.className = "feedback-type-badge";
    type.textContent = item.type || "Unknown";

    const name = document.createElement("div");
    name.innerHTML = `<strong>Name:</strong> ${escapeHtml(item.name || "Not provided")}`;

    const email = document.createElement("div");
    email.innerHTML = `<strong>Email:</strong> ${escapeHtml(item.email || "Not provided")}`;

    const time = document.createElement("div");
    time.innerHTML = `<strong>Received:</strong> ${escapeHtml(formatDateTime(item.created_at))}`;

    meta.append(type, name, email, time);

    const toolLinkValue = item.tool_link || "";
    let toolLinkEl = null;
    if (toolLinkValue) {
      toolLinkEl = document.createElement("a");
      toolLinkEl.className = "feedback-tool-link";
      toolLinkEl.href = sanitizeUrl(toolLinkValue);
      toolLinkEl.target = "_blank";
      toolLinkEl.rel = "noopener noreferrer";
      toolLinkEl.textContent = toolLinkValue;
    }

    const message = document.createElement("div");
    message.className = "feedback-message";
    message.innerHTML = `<strong>Message:</strong>\n${escapeHtml(item.message || "No message provided")}`;

    const actions = document.createElement("div");
    actions.className = "modal-actions left";

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Delete";

    delBtn.addEventListener("click", () => {
      showConfirm("Delete this message?", "Are you sure you want to delete this message?", async () => {
        const { error } = await supabaseClient.from("feedback_messages").delete().eq("id", item.id);
        if (error) return showToast("Could not delete message.", "error");
        await loadAdminFeedback();
        showToast("Message deleted.", "success");
      });
    });

    actions.appendChild(delBtn);

    card.appendChild(meta);
    if (toolLinkEl) {
      const label = document.createElement("div");
      label.innerHTML = `<strong>Tool Link:</strong>`;
      label.style.marginBottom = "6px";
      card.appendChild(label);
      card.appendChild(toolLinkEl);
    }
    card.appendChild(message);
    card.appendChild(actions);
    wrap.appendChild(card);
  });

  list.appendChild(wrap);
}

/* ---------------- library page ---------------- */

async function initLibraryPage() {
  const createCategoryBtn = document.getElementById("createPrivateCategoryBtn");
  const addToolBtn = document.getElementById("addPrivateToolBtn");
  const searchInput = document.getElementById("privateSearch");
  const exportBtn = document.getElementById("exportPrivateBtn");
  const importBtn = document.getElementById("importPrivateBtn");
  const importInput = document.getElementById("importPrivateInput");
  const signupBtn = document.getElementById("userSignupBtn");
  const loginBtn = document.getElementById("userLoginBtn");
  const logoutBtn = document.getElementById("userLogoutBtn");
  const importGuestBtn = document.getElementById("importGuestDataBtn");
  const privateToolUrl = document.getElementById("privateToolUrl");
  const privateToolName = document.getElementById("privateToolName");

  handleResetModeIfNeeded();

  await refreshLibraryAuthUI();
  await renderLibrary();

  signupBtn?.addEventListener("click", handleUserSignup);
  loginBtn?.addEventListener("click", handleUserLogin);
  logoutBtn?.addEventListener("click", handleUserLogout);
  importGuestBtn?.addEventListener("click", importGuestLibraryToAccount);

  createCategoryBtn?.addEventListener("click", async () => {
    const name = document.getElementById("privateCategoryName").value.trim();
    if (!name) return showToast("Name required!", "error");

    if (currentUser) {
      const categories = await fetchCloudCategories();
      if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        return showToast("Category already exists!", "error");
      }

      const error = await createCloudCategory(name);
      if (error) return showToast("Could not create category", "error");
    } else {
      const categories = getJSON(KEYS.privateCategories);
      if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        return showToast("Category already exists!", "error");
      }

      categories.push({ name });
      setJSON(KEYS.privateCategories, categories);
    }

    document.getElementById("privateCategoryName").value = "";
    await renderLibrary();
    closeModalById("quickAddModal");
    showToast("Category created!", "success");
  });

  addToolBtn?.addEventListener("click", async () => {
    const name = privateToolName.value.trim();
    const link = sanitizeUrl(privateToolUrl.value.trim());
    const cat = document.getElementById("privateToolCategory").value;
    const fav = document.getElementById("privateToolFav").checked;

    if (!name) return showToast("Name required!", "error");
    if (!isValidUrl(link)) return showToast("Please enter a valid URL!", "error");
    if (!cat) return showToast("Please select a category!", "error");

    if (currentUser) {
      const error = await createCloudTool({ name, link, cat, fav });
      if (error) return showToast("Could not add tool", "error");
    } else {
      const tools = getJSON(KEYS.privateTools);
      tools.push({ id: generateId(), name, link, cat, fav });
      setJSON(KEYS.privateTools, tools);
    }

    privateToolName.value = "";
    privateToolUrl.value = "";
    document.getElementById("privateToolFav").checked = false;

    await renderLibrary();
    closeModalById("quickAddModal");
    showToast("Tool added!", "success");
  });

  privateToolUrl?.addEventListener("input", () => {
    if (!privateToolName.value.trim() && privateToolUrl.value.trim()) {
      privateToolName.value = suggestNameFromUrl(privateToolUrl.value);
    }
  });

  searchInput?.addEventListener("input", renderLibrary);

  exportBtn?.addEventListener("click", async () => {
    const data = currentUser
      ? {
          privateCategories: await fetchCloudCategories(),
          privateTools: await fetchCloudTools()
        }
      : {
          privateCategories: getJSON(KEYS.privateCategories),
          privateTools: getJSON(KEYS.privateTools)
        };

    downloadJSON("my-library-backup.json", data);
    showToast("Data exported!", "success");
  });

  importBtn?.addEventListener("click", () => importInput.click());

  importInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseJSONFile(file, async (data) => {
      if (!data.privateCategories || !data.privateTools) {
        return showToast("Invalid file. Please select a valid backup file.", "error");
      }

      if (currentUser) {
        const error = await replaceCloudLibrary(data);
        if (error) {
          console.error(error);
          return showToast("Could not import library", "error");
        }
      } else {
        setJSON(KEYS.privateCategories, data.privateCategories);
        setJSON(KEYS.privateTools, data.privateTools);
      }

      await renderLibrary();
      showToast("Data imported successfully", "info");
    });

    e.target.value = "";
  });
}

function handleResetModeIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") === "1") {
    openModalById("accountModal");
    showAccountView("reset");
  }
}

async function refreshLibraryAuthUI() {
  const libraryModeText = document.getElementById("libraryModeText");
  const accountEmailText = document.getElementById("accountEmailText");
  const importGuestBtn = document.getElementById("importGuestDataBtn");
  const guestImportNote = document.getElementById("guestImportNote");
  const deleteAccountSection = document.getElementById("deleteAccountSection");

  if (!libraryModeText) return;

  updateLibraryModeIndicator();

  if (currentUser) {
    libraryModeText.textContent = "You are logged in. Your library now syncs across your devices.";
    if (accountEmailText) accountEmailText.textContent = `Logged in as ${currentUser.email || "user"}`;

    if (importGuestBtn) {
      importGuestBtn.classList.toggle("hidden", !hasGuestLibraryData());
      importGuestBtn.disabled = false;
      importGuestBtn.textContent = "Import Guest Library";
    }

    if (guestImportNote) {
      const dismissed = localStorage.getItem(KEYS.guestImportDismissed) === "1";
      guestImportNote.classList.toggle("hidden", !(dismissed && hasGuestLibraryData()));
    }

    if (deleteAccountSection) {
      deleteAccountSection.classList.toggle("hidden", !deleteAccountSupported);
    }

    showAccountView("active");
  } else {
    libraryModeText.textContent = "You are using guest mode. Your library is saved only on this device.";

    if (importGuestBtn) {
      importGuestBtn.classList.add("hidden");
      importGuestBtn.disabled = false;
      importGuestBtn.textContent = "Import Guest Library";
    }

    if (guestImportNote) guestImportNote.classList.add("hidden");
    if (deleteAccountSection) deleteAccountSection.classList.add("hidden");

    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") showAccountView("reset");
    else showAccountView("signup");
  }
}

async function getLibraryData() {
  if (currentUser) {
    const [categories, tools] = await Promise.all([
      fetchCloudCategories(),
      fetchCloudTools()
    ]);
    return { categories, tools, mode: "cloud" };
  }

  return {
    categories: getJSON(KEYS.privateCategories),
    tools: getJSON(KEYS.privateTools),
    mode: "guest"
  };
}

async function renderLibrary() {
  const { categories, tools, mode } = await getLibraryData();
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
    searchSection.classList.add("hidden");
    categoriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">📁</div>
        <strong>Your ${mode === "cloud" ? "cloud" : "guest"} library is empty!</strong>
        <div>Create a category and start saving your links.</div>
      </div>
    `;
    favoritesSection.classList.add("hidden");
    stats.textContent = `You have saved 0 links across 0 categories`;
    return;
  }

  const matchingTools = tools
    .filter(tool => {
      if (!searchTerm) return true;
      return (tool.name || "").toLowerCase().includes(searchTerm) || (tool.cat || "").toLowerCase().includes(searchTerm);
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

    if (!currentUser) {
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

      actions.append(upBtn, downBtn);
    }

    const delBtn = createMiniButton("🗑", "Delete category", (e) => {
      e.stopPropagation();
      showConfirm("Delete this category?", "Delete this category and all tools inside?", async () => {
        if (currentUser) {
          const error = await deleteCloudCategory(cat.name);
          if (error) return showToast("Could not delete category", "error");
          await renderLibrary();
          showToast("Category deleted!", "success");
        } else {
          deletePrivateCategory(cat.name);
        }
      });
    });

    const arrow = createMiniButton(collapsed[cat.name] ? "▸" : "▾", "Toggle category", null);
    actions.append(delBtn, arrow);

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
        showToast("Tool deleted!", "success");
        return;
      }

      if (currentUser) {
        const error = await deleteCloudTool(tool.id);
        if (error) return showToast("Could not delete tool", "error");
        await renderLibrary();
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
        return;
      }

      if (currentUser) {
        const error = await toggleCloudFavorite(tool.id, !tool.fav);
        if (error) return showToast("Could not update favorite", "error");
        await renderLibrary();
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

/* ---------------- feedback modal + submit ---------------- */

function setupFeedbackModal() {
  const feedbackModal = document.getElementById("feedbackModal");
  if (!feedbackModal) return;

  const openBtns = [
    document.getElementById("feedbackOpenBtn"),
    document.getElementById("feedbackFooterBtn")
  ].filter(Boolean);

  const cancelBtn = document.getElementById("feedbackCancelBtn");
  const submitBtn = document.getElementById("feedbackSubmitBtn");
  const backdrop = feedbackModal.querySelector("[data-close-feedback-modal]");
  const typeSelect = document.getElementById("feedbackType");

  function openFeedbackModal() {
    feedbackModal.classList.remove("hidden");
    updateFeedbackTypeUI();
  }

  function closeFeedbackModal() {
    feedbackModal.classList.add("hidden");
    clearFeedbackForm();
  }

  openBtns.forEach(btn => {
    btn.addEventListener("click", openFeedbackModal);
  });

  cancelBtn?.addEventListener("click", closeFeedbackModal);
  backdrop?.addEventListener("click", closeFeedbackModal);
  typeSelect?.addEventListener("change", updateFeedbackTypeUI);

  submitBtn?.addEventListener("click", async () => {
    const name = document.getElementById("feedbackName")?.value.trim() || "";
    const email = document.getElementById("feedbackEmail")?.value.trim() || "";
    const type = document.getElementById("feedbackType")?.value || "Send Feedback";
    const toolLink = document.getElementById("feedbackToolLink")?.value.trim() || "";
    const message = document.getElementById("feedbackMessage")?.value.trim() || "";

    const isSuggestTool = type === "Suggest a Tool";

    if (isSuggestTool) {
      if (!toolLink) {
        return showToast("Tool link is required for Suggest a Tool.", "error");
      }
      if (!isValidUrl(toolLink)) {
        return showToast("Please enter a valid tool link.", "error");
      }
    } else {
      if (!message) {
        return showToast("Please write a message first!", "error");
      }
    }

    if (!supabaseClient) {
      return showToast("Feedback service unavailable right now.", "error");
    }

    const payload = {
      name,
      email,
      type,
      message,
      tool_link: isSuggestTool ? sanitizeUrl(toolLink) : null
    };

    const { error } = await supabaseClient.from("feedback_messages").insert(payload);

    if (error) {
      console.error(error);
      return showToast("Could not send feedback right now.", "error");
    }

    closeFeedbackModal();
    showToast("Thanks! Your message was sent.", "success");
  });
}

function updateFeedbackTypeUI() {
  const type = document.getElementById("feedbackType")?.value || "Suggest a Tool";
  const toolWrap = document.getElementById("feedbackToolLinkWrap");
  const message = document.getElementById("feedbackMessage");

  const isSuggest = type === "Suggest a Tool";
  toolWrap?.classList.toggle("hidden", !isSuggest);

  if (message) {
    message.placeholder = isSuggest
      ? "Optional message..."
      : "Write your message...";
  }
}

function clearFeedbackForm() {
  const name = document.getElementById("feedbackName");
  const email = document.getElementById("feedbackEmail");
  const type = document.getElementById("feedbackType");
  const toolLink = document.getElementById("feedbackToolLink");
  const message = document.getElementById("feedbackMessage");

  if (name) name.value = "";
  if (email) email.value = "";
  if (type) type.value = "Suggest a Tool";
  if (toolLink) toolLink.value = "";
  if (message) message.value = "";
  updateFeedbackTypeUI();
}
