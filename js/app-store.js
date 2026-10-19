/**
 * VertexCapitals Unified Client Reactive API Layer (js/app-store.js)
 * 100% Authentic Live Synchronization with Node.js & MySQL REST Backend
 * Clean vector icons, authentic session handling, Resend Email Integration.
 */

(function (window) {
  const STORAGE_KEY = 'vertexcapitals_store_live';
  const AUTH_KEY = 'vertexcapitals_auth_user_live';
  const USERS_LOCAL_KEY = 'vertexcapitals_local_users_live';
  const ADMIN_TOKEN_KEY = 'vx_admin_session_token';
  const ADMIN_TOKEN_EXPIRY_KEY = 'vx_admin_session_expiry';
  const THEME_KEY = 'vertexcapitals_theme';

  // Smart API Base Resolver
  function getCandidateBases() {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '' || window.location.protocol === 'file:';
      
      if (!isLocalDev) {
        // On live production domain: strictly use the current live domain
        return [window.location.origin];
      }
      
      // On local dev machine: check origin then fallback to port 3000
      const bases = [];
      if (window.location.origin && window.location.origin !== 'null') {
        bases.push(window.location.origin);
      }
      bases.push('http://localhost:3000');
      bases.push('http://127.0.0.1:3000');
      return [...new Set(bases)];
    }
    return [''];
  }

  async function callApi(path, options = {}) {
    const bases = getCandidateBases();
    let lastError = null;

    for (const base of bases) {
      try {
        const url = `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second graceful window
        
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });
        clearTimeout(timeoutId);

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          return { ok: true, status: res.status, data };
        } else if (res.status === 404 && base !== 'http://localhost:3000' && base !== 'http://127.0.0.1:3000') {
          continue;
        }
      } catch (err) {
        if (err.name === 'AbortError' || (err.message && err.message.includes('abort'))) {
          lastError = new Error('Request timed out. Please verify your server connection and retry.');
        } else {
          lastError = err;
        }
      }
    }
    return { ok: false, error: lastError ? lastError.message : 'Network error' };
  }

  class VertexStore {
    constructor() {
      this.currentUser = this.loadAuthUser();
      this.initTheme();
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            this.initToastContainer();
            this.initSideNav();
            this.syncThemeUI();
          });
        } else {
          this.initToastContainer();
          this.initSideNav();
          this.syncThemeUI();
        }
      }
    }

    // ==========================================
    // THEME ENGINE (Light & Dark Mode)
    // ==========================================
    getTheme() {
      try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
      } catch (e) {}
      return 'dark'; // Dark mode is default
    }

    setTheme(mode) {
      const targetTheme = mode === 'light' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, targetTheme);
      } catch (e) {}

      if (typeof document !== 'undefined' && document.documentElement) {
        if (targetTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      this.syncThemeUI();
      return targetTheme;
    }

    toggleTheme() {
      const current = this.getTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      this.setTheme(next);
      this.showToast(`Switched to ${next === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
      return next;
    }

    initTheme() {
      if (typeof document === 'undefined' || !document.documentElement) return;
      const theme = this.getTheme();
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    syncThemeUI() {
      if (typeof document === 'undefined') return;
      const theme = this.getTheme();
      const isDark = theme === 'dark';

      // Update all theme toggle button icons across the DOM
      document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        btn.innerHTML = isDark
          ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-400"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
          : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-700"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
      });

      // Update drawer theme switch pill
      const drawerSwitch = document.getElementById('vx-drawer-theme-pill');
      if (drawerSwitch) {
        drawerSwitch.innerHTML = isDark
          ? `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-400"></span> Dark Theme</span>`
          : `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-blue-600"></span> Light Theme</span>`;
      }
    }

    loadAuthUser() {
      try {
        const saved = localStorage.getItem(AUTH_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
      return null;
    }

    setAuthUser(user) {
      this.currentUser = user;
      try {
        if (user) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(AUTH_KEY);
        }
      } catch (e) {}
      this.updateSideNavUser();
    }

    logout() {
      this.setAuthUser(null);
      this.showToast('Signed out of session.', 'info');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 500);
    }

    // Helper: Local users store for guaranteed zero-downtime offline fallback
    getLocalUsers() {
      try {
        const data = localStorage.getItem(USERS_LOCAL_KEY);
        if (data) return JSON.parse(data);
      } catch (e) {}
      return [];
    }

    saveLocalUsers(users) {
      try {
        localStorage.setItem(USERS_LOCAL_KEY, JSON.stringify(users));
      } catch (e) {}
    }

    // ==========================================
    // ADMIN SESSION TOKEN (sessionStorage — cleared on tab close)
    // ==========================================
    getAdminToken() {
      try {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        const expiry = sessionStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);
        if (!token || !expiry) return null;
        if (Date.now() > parseInt(expiry, 10)) {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
          return null;
        }
        return token;
      } catch (e) { return null; }
    }

    setAdminToken(token, expiresAt) {
      try {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
        sessionStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, String(expiresAt));
      } catch (e) {}
    }

    clearAdminToken() {
      try {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
      } catch (e) {}
    }

    adminAuthHeaders() {
      const token = this.getAdminToken();
      return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async adminLogin(email, password) {
      const res = await callApi('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: (email || '').trim().toLowerCase(), password })
      });
      if (res.ok && res.data && res.data.success) {
        this.setAdminToken(res.data.adminToken, res.data.expiresAt);
        this.setAuthUser(res.data.user);
        return { success: true, user: res.data.user, expiresAt: res.data.expiresAt };
      }
      return { success: false, message: (res.data && res.data.message) || 'Authentication failed.' };
    }

    async adminLogout() {
      const token = this.getAdminToken();
      if (token) {
        await callApi('/api/admin/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
      this.clearAdminToken();
      this.setAuthUser(null);
      this.showToast('Admin session terminated.', 'info');
      setTimeout(() => { window.location.href = 'admin.html'; }, 600);
    }

    async adminVerifyToken() {
      const token = this.getAdminToken();
      if (!token) return { success: false, message: 'No active admin session.' };
      const res = await callApi('/api/admin/verify-token', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok && res.data && res.data.success) return res.data;
      this.clearAdminToken();
      return { success: false, message: 'Session expired.' };
    }

    // ==========================================
    // SIDE NAVIGATION DRAWER (Glassmorphism Blur & Dual-Theme)
    // ==========================================
    initSideNav() {
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('vx-side-nav-drawer')) return;
      if (window.location.pathname.includes('login') || window.location.pathname.includes('register') || window.location.pathname.includes('forgotpassword')) return;

      const user = this.currentUser || { full_name: 'Investor Account', email: 'investor@vertexcapitals.ltd' };
      const initials = (user.full_name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      const navHtml = `
        <div id="vx-side-nav-backdrop" class="fixed inset-0 bg-slate-900/60 dark:bg-[#070a11]/85 backdrop-blur-xl z-[99998] transition-opacity duration-300 opacity-0 pointer-events-none" onclick="VertexApp.toggleSideNav()"></div>
        <aside id="vx-side-nav-drawer" class="fixed top-0 left-0 bottom-0 w-72 sm:w-80 bg-white dark:bg-[#0c121e] border-r border-slate-200 dark:border-gray-800/90 z-[99999] flex flex-col justify-between transition-transform duration-300 -translate-x-full shadow-2xl font-sans text-slate-800 dark:text-gray-200">
          
          <!-- Drawer Header -->
          <div class="p-5 border-b border-slate-200 dark:border-gray-800/80 flex justify-between items-center bg-slate-50 dark:bg-[#070a11]/50">
            <a href="dashboard.html" class="flex items-center gap-2">
              <img src="images/navbarlogo.svg" alt="VertexCapitals Logo" class="h-6 brand-logo-adaptive">
            </a>
            <button onclick="VertexApp.toggleSideNav()" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#101726] border border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <!-- Drawer Navigation Links -->
          <div class="flex-1 overflow-y-auto p-4 space-y-5">
            <!-- User Profile Snapshot -->
            <div class="p-4 bg-slate-50 dark:bg-[#101726] border border-slate-200 dark:border-gray-800/80 rounded-2xl flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-primary/20" id="vx-drawer-avatar">
                ${initials}
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate" id="vx-drawer-name">${user.full_name}</h4>
                <p class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Verified Portfolio
                </p>
              </div>
            </div>

            <!-- Theme Switcher Pill -->
            <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-[#101726] border border-slate-200 dark:border-gray-800/80 rounded-2xl">
              <span class="text-xs font-semibold text-slate-600 dark:text-gray-400">Interface Theme</span>
              <button onclick="VertexApp.toggleTheme()" id="vx-drawer-theme-pill" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#070a11] border border-slate-200 dark:border-gray-700 shadow-sm text-slate-800 dark:text-gray-200 hover:border-primary transition-all flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-400"></span> Dark Theme
              </button>
            </div>

            <!-- Navigation Links -->
            <nav class="space-y-1 text-xs font-medium">
              <a href="dashboard.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span>Investor Dashboard</span>
              </a>

              <a href="invest-otc.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 group-hover:scale-105 transition-transform"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span>Invest in OTC Tranches</span>
              </a>

              <a href="deposit.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Deposit Funds</span>
              </a>

              <a href="withdrawal.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                <span>Withdraw Liquidity</span>
              </a>

              <a href="transactions.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                <span>Transactions Ledger</span>
              </a>

              <a href="become-a-partner.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span>Partner Referral Program</span>
              </a>

              <a href="profile-settings.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <span>Profile & Security</span>
              </a>

              <a href="support.html" class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#101726] transition-colors group">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary group-hover:scale-105 transition-transform"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>24/7 Support Desk</span>
              </a>
            </nav>
          </div>

          <!-- Drawer Footer -->
          <div class="p-5 border-t border-slate-200 dark:border-gray-800/80 bg-slate-50 dark:bg-[#070a11]/50">
            <button onclick="VertexApp.logout()" class="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>
      `;

      const wrapper = document.createElement('div');
      wrapper.id = 'vx-side-nav-wrapper';
      wrapper.innerHTML = navHtml;
      document.body.appendChild(wrapper);
      this.syncThemeUI();
    }

    updateSideNavUser() {
      if (!this.currentUser) return;
      const avatarEl = document.getElementById('vx-drawer-avatar');
      const nameEl = document.getElementById('vx-drawer-name');
      if (avatarEl && nameEl) {
        const initials = (this.currentUser.full_name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.innerText = initials;
        nameEl.innerText = this.currentUser.full_name;
      }
    }

    toggleSideNav() {
      let backdrop = document.getElementById('vx-side-nav-backdrop');
      let drawer = document.getElementById('vx-side-nav-drawer');
      if (!backdrop || !drawer) {
        this.initSideNav();
        backdrop = document.getElementById('vx-side-nav-backdrop');
        drawer = document.getElementById('vx-side-nav-drawer');
        if (!backdrop || !drawer) return;
      }

      const isOpen = !drawer.classList.contains('-translate-x-full');
      if (isOpen) {
        drawer.classList.add('-translate-x-full');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100', 'pointer-events-auto');
      } else {
        this.updateSideNavUser();
        drawer.classList.remove('-translate-x-full');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
        backdrop.classList.add('opacity-100', 'pointer-events-auto');
      }
    }

    // ==========================================
    // NOTIFICATION & TOAST UI (Clean SVG Icons)
    // ==========================================
    initToastContainer() {
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('vx-toast-container')) return;
      const container = document.createElement('div');
      container.id = 'vx-toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px;width:calc(100% - 40px);';
      document.body.appendChild(container);
    }

    showToast(message, type = 'info', duration = 4000) {
      this.initToastContainer();
      const container = document.getElementById('vx-toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `p-4 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-3 transition-all duration-300 transform translate-y-[-10px] opacity-0 pointer-events-auto border backdrop-blur-md`;

      let icon = '';
      if (type === 'success') {
        toast.className += ' bg-[#0c121e]/95 border-emerald-500/40 text-emerald-300 shadow-emerald-950/40';
        icon = `<div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`;
      } else if (type === 'error') {
        toast.className += ' bg-[#0c121e]/95 border-rose-500/40 text-rose-300 shadow-rose-950/40';
        icon = `<div class="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`;
      } else {
        toast.className += ' bg-[#0c121e]/95 border-primary/40 text-blue-300 shadow-blue-950/40';
        icon = `<div class="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>`;
      }

      toast.innerHTML = `${icon}<span class="flex-1 leading-snug">${message}</span>`;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-[-10px]', 'opacity-0');
      });

      setTimeout(() => {
        toast.classList.add('translate-y-[-10px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    // ==========================================
    // AUTHENTICATION METHODS (LIVE REST TO MYSQL)
    // ==========================================
    async register(name, email, password, country, refCode) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name: name, email: cleanEmail, password, country, referral_code: refCode })
      });

      if (apiRes.ok && apiRes.data) {
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Server connection error. Please check your internet or try again later.'
      };
    }

    async verifyEmailCode(email, code) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, code: (code || '').trim() })
      });

      if (apiRes.ok && apiRes.data) {
        if (apiRes.data.success && apiRes.data.user) {
          this.setAuthUser(apiRes.data.user);
        }
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Unable to connect to authentication server.'
      };
    }

    async resendOTP(email) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail })
      });

      if (apiRes.ok && apiRes.data) {
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Unable to connect to verification server.'
      };
    }

    async login(email, password) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password })
      });

      if (apiRes.ok && apiRes.data) {
        if (apiRes.data.success && apiRes.data.user) {
          this.setAuthUser(apiRes.data.user);
        }
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Unable to reach the login server. Please verify your connection.'
      };
    }

    async forgotPassword(email) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail })
      });

      if (apiRes.ok && apiRes.data) {
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Server error while requesting password recovery code.'
      };
    }

    async resetPassword(email, code, newPassword) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const apiRes = await callApi('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, code: (code || '').trim(), new_password: newPassword })
      });

      if (apiRes.ok && apiRes.data) {
        return apiRes.data;
      }

      return {
        success: false,
        message: apiRes.error || 'Server error while resetting password.'
      };
    }

    // ==========================================
    // LIVE USER WALLET & TRANSACTIONS
    // ==========================================
    async getSummary(userId) {
      const uid = userId || (this.currentUser ? this.currentUser.id : null);
      if (!uid) return null;
      const res = await callApi(`/api/wallet/summary/${uid}`);
      if (res.ok && res.data && res.data.success) {
        return res.data;
      }
      return null;
    }

    async deposit(asset, amount, txHash) {
      if (!this.currentUser) return { success: false, message: 'Please sign in first.' };
      const res = await callApi('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          user_id: this.currentUser.id,
          asset,
          amount: parseFloat(amount),
          tx_hash: txHash
        })
      });
      const data = res.data || {};
      if (data.success) {
        this.showToast(`Deposit of $${parseFloat(amount).toLocaleString()} submitted for review.`, 'success');
      } else {
        this.showToast(data.message || 'Deposit submission failed.', 'error');
      }
      return data;
    }

    async withdraw(asset, amount, destinationAddress) {
      if (!this.currentUser) return { success: false, message: 'Please sign in first.' };
      const res = await callApi('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          user_id: this.currentUser.id,
          asset,
          amount: parseFloat(amount),
          destination_address: destinationAddress
        })
      });
      const data = res.data || {};
      if (data.success) {
        this.showToast(`Payout request for $${parseFloat(amount).toLocaleString()} initiated.`, 'success');
      } else {
        this.showToast(data.message || 'Withdrawal failed.', 'error');
      }
      return data;
    }

    async investOTC(amount, trancheName = 'Executive Multi-Asset Tranche', weeklyRoi = 7.5, durationDays = 30) {
      if (!this.currentUser) return { success: false, message: 'Please sign in first.' };
      const res = await callApi('/api/wallet/invest-otc', {
        method: 'POST',
        body: JSON.stringify({
          user_id: this.currentUser.id,
          amount: parseFloat(amount),
          tranche_name: trancheName,
          weekly_roi: parseFloat(weeklyRoi),
          duration_days: parseInt(durationDays, 10)
        })
      });
      const data = res.data || {};
      if (data.success) {
        this.showToast(`Allocated $${parseFloat(amount).toLocaleString()} to ${trancheName}!`, 'success');
      } else {
        this.showToast(data.message || 'Allocation failed.', 'error');
      }
      return data;
    }

    // ==========================================
    // ADMIN OPERATIONS (all require valid admin token)
    // ==========================================

    _adminPost(path, body) {
      return callApi(path, {
        method: 'POST',
        headers: { ...this.adminAuthHeaders() },
        body: JSON.stringify(body)
      });
    }

    async getAdminOverview() {
      const token = this.getAdminToken();
      const res = await callApi('/api/admin/overview', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok && res.data) return res.data;
      return { success: false, message: (res.data && res.data.message) || 'Unauthorized.' };
    }

    async adminApproveDeposit(txRef) {
      const res = await this._adminPost('/api/admin/approve-deposit', { tx_ref: txRef });
      const data = res.data || {};
      if (data.success) this.showToast(`Deposit #${txRef} approved and funds credited.`, 'success');
      else if (res.status === 401) this.showToast('Admin session expired. Please log in again.', 'error');
      return data;
    }

    async adminApproveWithdrawal(txRef, txHash) {
      const res = await this._adminPost('/api/admin/approve-withdrawal', { tx_ref: txRef, tx_hash: txHash });
      const data = res.data || {};
      if (data.success) this.showToast(`Withdrawal #${txRef} marked completed & dispatched.`, 'success');
      return data;
    }

    async adminRejectDeposit(txRef, reason) {
      const res = await this._adminPost('/api/admin/reject-deposit', { tx_ref: txRef, reason });
      const data = res.data || {};
      if (data.success) this.showToast(`Deposit #${txRef} rejected.`, 'info');
      return data;
    }

    async adminRejectWithdrawal(txRef, reason) {
      const res = await this._adminPost('/api/admin/reject-withdrawal', { tx_ref: txRef, reason });
      const data = res.data || {};
      if (data.success) this.showToast(`Withdrawal #${txRef} rejected & funds refunded to user.`, 'info');
      return data;
    }

    async adminCreateUser(userData) {
      const res = await this._adminPost('/api/admin/users/create', userData);
      const data = res.data || {};
      if (data.success) this.showToast(`Investor account ${userData.full_name} created successfully!`, 'success');
      else this.showToast(data.message || 'Failed to create user.', 'error');
      return data;
    }

    async adminUpdateUser(userData) {
      const res = await this._adminPost('/api/admin/users/update', userData);
      const data = res.data || {};
      if (data.success) this.showToast('Investor profile updated.', 'success');
      else this.showToast(data.message || 'Failed to update profile.', 'error');
      return data;
    }

    async adminDeleteUser(userId) {
      const res = await this._adminPost('/api/admin/users/delete', { user_id: userId });
      const data = res.data || {};
      if (data.success) this.showToast('Investor account permanently deleted.', 'info');
      else this.showToast(data.message || 'Failed to delete user.', 'error');
      return data;
    }

    async adminBulkDeleteUsers(userIds) {
      const res = await this._adminPost('/api/admin/users/bulk-delete', { user_ids: userIds });
      const data = res.data || {};
      if (data.success) this.showToast(data.message || `${data.deleted} account(s) deleted.`, 'info');
      else this.showToast(data.message || 'Bulk delete failed.', 'error');
      return data;
    }

    async adminCreditProfit(userId, profitAmount, note) {
      const res = await this._adminPost('/api/admin/credit-profit', {
        user_id: userId, profit_amount: parseFloat(profitAmount), note
      });
      const data = res.data || {};
      if (data.success) this.showToast(`+$${parseFloat(profitAmount).toLocaleString()} profit credited & email sent!`, 'success');
      else this.showToast(data.message || 'Credit profit failed.', 'error');
      return data;
    }

    async adminUpdateUserBalance(userId, exchange, otc, profit) {
      const res = await this._adminPost('/api/admin/update-balance', {
        user_id: userId, exchange_balance: exchange, otc_balance: otc, accrued_profit: profit
      });
      const data = res.data || {};
      if (data.success) this.showToast(`Balances updated for User #${userId}.`, 'success');
      return data;
    }

    async adminCreateTransaction(txData) {
      const res = await this._adminPost('/api/admin/transactions/create', txData);
      const data = res.data || {};
      if (data.success) this.showToast('Transaction record injected.', 'success');
      return data;
    }

    async adminDeleteTransaction(txRef) {
      const res = await this._adminPost('/api/admin/transactions/delete', { tx_ref: txRef });
      const data = res.data || {};
      if (data.success) this.showToast(`Transaction record #${txRef} removed.`, 'info');
      return data;
    }

    async adminCreateOTCPlan(planData) {
      const res = await this._adminPost('/api/admin/otc-plans/create', planData);
      const data = res.data || {};
      if (data.success) this.showToast('OTC Investment contract assigned!', 'success');
      return data;
    }

    async adminUpdateOTCPlan(planData) {
      const res = await this._adminPost('/api/admin/otc-plans/update', planData);
      const data = res.data || {};
      if (data.success) this.showToast('OTC Contract updated.', 'success');
      return data;
    }

    async adminTerminateOTCPlan(planId) {
      const res = await this._adminPost('/api/admin/otc-plans/terminate', { plan_id: planId });
      const data = res.data || {};
      if (data.success) this.showToast('OTC Contract settled & principal refunded.', 'success');
      return data;
    }

    async adminDeleteOTCPlan(planId) {
      const res = await this._adminPost('/api/admin/otc-plans/delete', { plan_id: planId });
      const data = res.data || {};
      if (data.success) this.showToast('OTC contract deleted.', 'info');
      return data;
    }

    async adminSaveCompanyWallet(symbol, name, network, address, isActive = 1) {
      try {
        const payload = {
          symbol: (symbol || '').trim(),
          name: (name || '').trim(),
          network: (network || '').trim(),
          address: (address || '').trim(),
          is_active: isActive !== undefined ? isActive : 1
        };
        const res = await this._adminPost('/api/admin/save-company-wallet', payload);
        const data = res.data || {};
        if (data.success) {
          this.showToast(data.message || `Company custody wallet for ${name || symbol} saved!`, 'success');
          return data;
        } else {
          this.showToast(data.message || (res.error ? `Network Error: ${res.error}` : 'Failed to save company wallet.'), 'error');
          return data.success !== undefined ? data : { success: false, message: res.error || 'Failed to save company wallet' };
        }
      } catch (err) {
        this.showToast(err.message || 'Error saving company wallet.', 'error');
        return { success: false, message: err.message };
      }
    }

    async adminDeleteCompanyWallet(symbol) {
      try {
        const sym = (symbol || '').trim();
        const res = await this._adminPost('/api/admin/delete-company-wallet', { symbol: sym });
        const data = res.data || {};
        if (data.success) {
          this.showToast(data.message || `Custody wallet ${sym} removed.`, 'info');
          return data;
        } else {
          this.showToast(data.message || 'Failed to delete wallet.', 'error');
          return data.success !== undefined ? data : { success: false, message: 'Failed to delete wallet.' };
        }
      } catch (err) {
        this.showToast(err.message || 'Error deleting wallet.', 'error');
        return { success: false, message: err.message };
      }
    }

    async adminSendEmail(recipientEmail, subject, message) {
      const res = await this._adminPost('/api/admin/send-email', { recipient_email: recipientEmail, subject, message });
      const data = res.data || {};
      if (data.success) this.showToast('Email dispatched successfully!', 'success');
      return data;
    }

    async adminClearEmailLogs() {
      const res = await this._adminPost('/api/admin/email-logs/clear', {});
      const data = res.data || {};
      if (data.success) this.showToast('Email dispatch logs cleared.', 'info');
      return data;
    }
  }

  window.VertexApp = new VertexStore();
  window.toggleSideNav = function () {
    if (window.VertexApp) window.VertexApp.toggleSideNav();
  };
})(typeof window !== 'undefined' ? window : this);
