/* ========================================
   CLASH OF CLANS — CLAN DASHBOARD
   Application Logic
   ======================================== */
(function () {
    'use strict';

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // DOM
    const navbar = $('#navbar'), hamburger = $('#hamburger'), navLinks = $('#navLinks');
    const heroParticles = $('#heroParticles'), toast = $('#toast');
    const regModal = $('#regModal'), modalClose = $('#modalClose'), regForm = $('#regForm');
    const formMessage = $('#formMessage'), modalTournamentName = $('#modalTournamentName');
    const regTournamentId = $('#regTournamentId');
    const tournamentsGrid = $('#tournamentsGrid');
    const membersTableBody = $('#membersTableBody'), membersTable = $('#membersTable'), membersEmpty = $('#membersEmpty');
    const countBadge = $('#countBadge'), btnSort = $('#btnSort');
    const filterTournament = $('#filterTournament');
    const updatesGrid = $('#updatesGrid');
    // Dashboard stats
    const activeTournaments = $('#activeTournaments'), totalRegistered = $('#totalRegistered');
    const totalUpdates = $('#totalUpdates'), totalSlots = $('#totalSlots');
    // Admin
    const adminLoginBox = $('#adminLoginBox'), adminPanel = $('#adminPanel');
    const adminLoginForm = $('#adminLoginForm'), adminLoginMessage = $('#adminLoginMessage');
    const btnLogout = $('#btnLogout');
    const addTournamentForm = $('#addTournamentForm'), addUpdateForm = $('#addUpdateForm');
    const adminTournamentsList = $('#adminTournamentsList');
    const adminUpdatesList = $('#adminUpdatesList');
    const adminMembersList = $('#adminMembersList');

    // Storage keys
    const KEYS = { tournaments: 'clan_tournaments', members: 'clan_members', updates: 'clan_updates', admin: 'clan_admin_logged' };
    // Default admin credentials (client-side only)
    const ADMIN_USER = 'admin';
    const ADMIN_PASS = 'clash2026';

    let sortAsc = true;

    // ========== HELPERS ==========
    function getData(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
    function setData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function escapeHTML(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function formatDate(d) { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }

    function showToast(msg, type = 'success') {
        toast.textContent = msg;
        toast.className = 'toast ' + type;
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ========== PARTICLES ==========
    function createParticles() {
        if (!heroParticles) return;
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 6 + 's';
            p.style.animationDuration = (4 + Math.random() * 4) + 's';
            const size = (2 + Math.random() * 4) + 'px';
            p.style.width = size; p.style.height = size;
            heroParticles.appendChild(p);
        }
    }

    // ========== NAVBAR ==========
    function initNavbar() {
        window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 60));
        hamburger.addEventListener('click', () => { hamburger.classList.toggle('active'); navLinks.classList.toggle('open'); });
        navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { hamburger.classList.remove('active'); navLinks.classList.remove('open'); }));
        const sections = $$('section[id]');
        window.addEventListener('scroll', () => {
            let cur = '';
            sections.forEach(s => { if (window.scrollY >= s.offsetTop - 100) cur = s.id; });
            navLinks.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
        });
    }

    // ========== DASHBOARD STATS ==========
    function updateDashboard() {
        const t = getData(KEYS.tournaments);
        const m = getData(KEYS.members);
        const u = getData(KEYS.updates);
        const openT = t.filter(x => x.status === 'open');
        const openSlots = openT.reduce((sum, x) => {
            const regs = m.filter(mm => mm.tournamentId === x.id).length;
            return sum + Math.max(0, x.slots - regs);
        }, 0);
        activeTournaments.textContent = openT.length;
        totalRegistered.textContent = m.length;
        totalUpdates.textContent = u.length;
        totalSlots.textContent = openSlots;
    }

    // ========== TOURNAMENTS (Public) ==========
    function renderTournaments() {
        const tournaments = getData(KEYS.tournaments);
        const members = getData(KEYS.members);
        tournamentsGrid.innerHTML = '';

        if (tournaments.length === 0) {
            tournamentsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🏰</div><h3>No Tournaments Yet</h3><p>Admin will add tournaments soon!</p></div>';
            return;
        }

        // Sort: open first, then upcoming, then closed
        const order = { open: 0, upcoming: 1, closed: 2 };
        const sorted = [...tournaments].sort((a, b) => (order[a.status] || 2) - (order[b.status] || 2));

        sorted.forEach(t => {
            const regs = members.filter(m => m.tournamentId === t.id).length;
            const slotsLeft = Math.max(0, t.slots - regs);
            const isFull = slotsLeft === 0;
            const isOpen = t.status === 'open' && !isFull;

            const card = document.createElement('div');
            card.className = 'tournament-card';
            card.innerHTML = `
                <div class="tournament-card-top">
                    <h3>${escapeHTML(t.name)}</h3>
                    <span class="t-date">📅 ${formatDate(t.date)}</span>
                    <span class="tournament-status status-${t.status}">${t.status === 'open' ? (isFull ? 'Full' : 'Open') : t.status}</span>
                </div>
                <div class="tournament-card-body">
                    <p>${escapeHTML(t.desc || 'No description provided.')}</p>
                    <div class="tournament-meta">
                        <span class="t-meta-badge">👥 ${regs}/${t.slots} Registered</span>
                        <span class="t-meta-badge">🏰 Min TH ${t.minTH}</span>
                        <span class="t-meta-badge">🎯 ${slotsLeft} Slots Left</span>
                    </div>
                    <button class="btn-tournament-register" data-id="${t.id}" data-name="${escapeHTML(t.name)}" ${!isOpen ? 'disabled' : ''}>
                        ${isOpen ? '⚔️ Register Now' : (isFull ? '🚫 Full' : (t.status === 'upcoming' ? '⏳ Coming Soon' : '🔒 Closed'))}
                    </button>
                </div>
            `;
            tournamentsGrid.appendChild(card);
        });

        // Attach handlers
        tournamentsGrid.querySelectorAll('.btn-tournament-register:not([disabled])').forEach(btn => {
            btn.addEventListener('click', function () {
                openRegModal(this.dataset.id, this.dataset.name);
            });
        });
    }

    // ========== REGISTRATION MODAL ==========
    function openRegModal(tournamentId, tournamentName) {
        regTournamentId.value = tournamentId;
        modalTournamentName.textContent = tournamentName;
        formMessage.className = 'form-message';
        regForm.reset();
        regModal.classList.add('active');
    }

    function closeRegModal() {
        regModal.classList.remove('active');
    }

    function handleRegistration(e) {
        e.preventDefault();
        const tId = regTournamentId.value;
        const data = {
            name: $('#playerName').value.trim(),
            tag: $('#playerTag').value.trim(),
            th: $('#thLevel').value,
            cwlType: $('#cwlType').value
        };

        if (!data.name || !data.tag || !data.th || !data.cwlType) {
            showFormMsg('Please fill in all required fields.', 'error'); return;
        }

        const tournaments = getData(KEYS.tournaments);
        const t = tournaments.find(x => x.id === tId);
        if (!t) { showFormMsg('Tournament not found.', 'error'); return; }

        // Check min TH
        if (parseInt(data.th) < parseInt(t.minTH)) {
            showFormMsg(`Minimum TH ${t.minTH} required for this tournament.`, 'error'); return;
        }

        let members = getData(KEYS.members);
        // Check duplicate in same tournament
        const dup = members.some(m => m.tournamentId === tId && m.tag.replace(/[#\s]/g, '').toLowerCase() === data.tag.replace(/[#\s]/g, '').toLowerCase());
        if (dup) { showFormMsg('This player tag is already registered for this tournament!', 'error'); showToast('Duplicate tag!', 'error'); return; }

        // Check slots
        const regs = members.filter(m => m.tournamentId === tId).length;
        if (regs >= t.slots) { showFormMsg('Tournament is full!', 'error'); showToast('No slots left!', 'error'); return; }

        members.push({
            id: uid(), tournamentId: tId, tournamentName: t.name,
            name: data.name, tag: data.tag, th: data.th,
            cwlType: data.cwlType,
            registeredAt: new Date().toISOString()
        });
        setData(KEYS.members, members);

        showFormMsg(`✅ ${data.name} registered successfully!`, 'success');
        showToast(`${data.name} registered for ${t.name}!`, 'success');

        setTimeout(() => {
            closeRegModal();
            renderAll();
            $('#members').scrollIntoView({ behavior: 'smooth' });
        }, 800);
    }

    function showFormMsg(msg, type) {
        formMessage.textContent = msg;
        formMessage.className = 'form-message ' + type;
        setTimeout(() => { formMessage.className = 'form-message'; }, 5000);
    }

    // ========== MEMBERS ==========
    function renderMembers() {
        let members = getData(KEYS.members);
        const filterVal = filterTournament.value;
        if (filterVal !== 'all') members = members.filter(m => m.tournamentId === filterVal);

        countBadge.textContent = members.length;
        membersTableBody.innerHTML = '';

        if (members.length === 0) {
            membersTable.style.display = 'none';
            membersEmpty.style.display = 'block';
            return;
        }

        membersTable.style.display = 'table';
        membersEmpty.style.display = 'none';

        members.forEach((m, i) => {
            const row = document.createElement('tr');
            const cwlClass = m.cwlType === 'Serious CWL' ? 'cwl-serious' : 'cwl-lazy';
            row.innerHTML = `
                <td>${i + 1}</td>
                <td class="td-name">${escapeHTML(m.name)}</td>
                <td class="td-tag">${escapeHTML(m.tag)}</td>
                <td><span class="th-badge">TH${m.th}</span></td>
                <td><span class="td-tournament">🏆 ${escapeHTML(m.tournamentName || 'Unknown')}</span></td>
                <td><span class="td-cwl ${cwlClass}">${escapeHTML(m.cwlType || '—')}</span></td>
            `;
            membersTableBody.appendChild(row);
        });
    }

    function populateTournamentFilter() {
        const tournaments = getData(KEYS.tournaments);
        filterTournament.innerHTML = '<option value="all">All Tournaments</option>';
        tournaments.forEach(t => {
            filterTournament.innerHTML += `<option value="${t.id}">${escapeHTML(t.name)}</option>`;
        });
    }

    function sortMembers() {
        let members = getData(KEYS.members);
        members.sort((a, b) => sortAsc ? parseInt(b.th) - parseInt(a.th) : parseInt(a.th) - parseInt(b.th));
        sortAsc = !sortAsc;
        setData(KEYS.members, members);
        renderMembers();
        showToast(`Sorted by TH (${sortAsc ? 'High→Low' : 'Low→High'})`, 'info');
    }

    // ========== UPDATES (Public) ==========
    function renderUpdates() {
        const updates = getData(KEYS.updates);
        updatesGrid.innerHTML = '';

        if (updates.length === 0) {
            updatesGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><h3>No Updates Yet</h3><p>Admin will post updates here.</p></div>';
            return;
        }

        // Pinned first
        const sorted = [...updates].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));

        sorted.forEach(u => {
            const card = document.createElement('article');
            card.className = 'update-card' + (u.pinned ? ' pinned' : '');
            card.innerHTML = `
                ${u.pinned ? '<div class="update-pin">📌 Pinned</div>' : ''}
                <div class="update-header">
                    <span class="update-category cat-${u.category}">${u.category.toUpperCase()}</span>
                    <span class="update-date">${formatDate(u.createdAt)}</span>
                </div>
                <h3>${escapeHTML(u.title)}</h3>
                <p>${escapeHTML(u.content)}</p>
            `;
            updatesGrid.appendChild(card);
        });
    }

    // ========== ADMIN ==========
    function isAdminLoggedIn() { return localStorage.getItem(KEYS.admin) === 'true'; }

    function checkAdminState() {
        if (isAdminLoggedIn()) {
            adminLoginBox.style.display = 'none';
            adminPanel.style.display = 'block';
            renderAdminLists();
        } else {
            adminLoginBox.style.display = 'flex';
            adminPanel.style.display = 'none';
        }
    }

    function handleAdminLogin(e) {
        e.preventDefault();
        const user = $('#adminUser').value.trim();
        const pass = $('#adminPass').value;
        if (user === ADMIN_USER && pass === ADMIN_PASS) {
            localStorage.setItem(KEYS.admin, 'true');
            showToast('Welcome, Admin! 👑', 'success');
            checkAdminState();
            adminLoginForm.reset();
            adminLoginMessage.className = 'form-message';
        } else {
            adminLoginMessage.textContent = 'Invalid credentials. Try again.';
            adminLoginMessage.className = 'form-message error';
            showToast('Wrong credentials!', 'error');
        }
    }

    function handleAdminLogout() {
        localStorage.removeItem(KEYS.admin);
        checkAdminState();
        showToast('Logged out', 'info');
    }

    // Admin Tabs
    function initAdminTabs() {
        $$('.admin-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                $$('.admin-tab').forEach(t => t.classList.remove('active'));
                $$('.admin-tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                $('#' + this.dataset.tab).classList.add('active');
            });
        });
    }

    // Add Tournament
    function handleAddTournament(e) {
        e.preventDefault();
        const t = {
            id: uid(),
            name: $('#tName').value.trim(),
            date: $('#tDate').value,
            slots: parseInt($('#tSlots').value),
            desc: $('#tDesc').value.trim(),
            minTH: $('#tMinTH').value,
            status: $('#tStatus').value,
            createdAt: new Date().toISOString()
        };
        if (!t.name || !t.date) return;
        const tournaments = getData(KEYS.tournaments);
        tournaments.push(t);
        setData(KEYS.tournaments, tournaments);
        addTournamentForm.reset();
        $('#tSlots').value = 50;
        renderAll();
        showToast(`Tournament "${t.name}" created!`, 'success');
    }

    // Add Update
    function handleAddUpdate(e) {
        e.preventDefault();
        const u = {
            id: uid(),
            title: $('#uTitle').value.trim(),
            category: $('#uCategory').value,
            content: $('#uContent').value.trim(),
            pinned: $('#uPinned').checked,
            createdAt: new Date().toISOString()
        };
        if (!u.title || !u.content) return;
        const updates = getData(KEYS.updates);
        updates.push(u);
        setData(KEYS.updates, updates);
        addUpdateForm.reset();
        renderAll();
        showToast(`Update "${u.title}" posted!`, 'success');
    }

    // Admin Lists
    function renderAdminLists() {
        // Tournaments
        const tournaments = getData(KEYS.tournaments);
        const members = getData(KEYS.members);
        const updates = getData(KEYS.updates);

        adminTournamentsList.innerHTML = '';
        if (tournaments.length === 0) {
            adminTournamentsList.innerHTML = '<p class="admin-hint">No tournaments yet. Create one above.</p>';
        } else {
            tournaments.forEach(t => {
                const regs = members.filter(m => m.tournamentId === t.id).length;
                const item = document.createElement('div');
                item.className = 'admin-item';
                item.innerHTML = `
                    <div class="admin-item-info">
                        <h5>${escapeHTML(t.name)}</h5>
                        <p>📅 ${formatDate(t.date)} · 👥 ${regs}/${t.slots} · Status: ${t.status}</p>
                    </div>
                    <div class="admin-item-actions">
                        <button class="btn-admin-action btn-admin-toggle" data-id="${t.id}" data-action="toggle-tournament">${t.status === 'open' ? 'Close' : 'Open'}</button>
                        <button class="btn-admin-action btn-admin-delete" data-id="${t.id}" data-action="delete-tournament">Delete</button>
                    </div>
                `;
                adminTournamentsList.appendChild(item);
            });
        }

        // Updates
        adminUpdatesList.innerHTML = '';
        if (updates.length === 0) {
            adminUpdatesList.innerHTML = '<p class="admin-hint">No updates yet.</p>';
        } else {
            updates.forEach(u => {
                const item = document.createElement('div');
                item.className = 'admin-item';
                item.innerHTML = `
                    <div class="admin-item-info">
                        <h5>${u.pinned ? '📌 ' : ''}${escapeHTML(u.title)}</h5>
                        <p>${u.category.toUpperCase()} · ${formatDate(u.createdAt)}</p>
                    </div>
                    <div class="admin-item-actions">
                        <button class="btn-admin-action btn-admin-delete" data-id="${u.id}" data-action="delete-update">Delete</button>
                    </div>
                `;
                adminUpdatesList.appendChild(item);
            });
        }

        // Members
        adminMembersList.innerHTML = '';
        if (members.length === 0) {
            adminMembersList.innerHTML = '<p class="admin-hint">No registered members.</p>';
        } else {
            members.forEach(m => {
                const item = document.createElement('div');
                item.className = 'admin-item';
                item.innerHTML = `
                    <div class="admin-item-info">
                        <h5>${escapeHTML(m.name)} (TH${m.th})</h5>
                        <p>${escapeHTML(m.tag)} · 🏆 ${escapeHTML(m.tournamentName || '?')} · ${escapeHTML(m.cwlType || '—')}</p>
                    </div>
                    <div class="admin-item-actions">
                        <button class="btn-admin-action btn-admin-delete" data-id="${m.id}" data-action="delete-member">Remove</button>
                    </div>
                `;
                adminMembersList.appendChild(item);
            });
        }
    }

    // Admin action handler (event delegation — attached once)
    function initAdminActions() {
        document.getElementById('adminPanel').addEventListener('click', function (e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();

            const id = btn.dataset.id;
            const action = btn.dataset.action;

            if (action === 'delete-tournament') {
                let ts = getData(KEYS.tournaments).filter(x => x.id !== id);
                let ms = getData(KEYS.members).filter(x => x.tournamentId !== id);
                setData(KEYS.tournaments, ts);
                setData(KEYS.members, ms);
                showToast('Tournament deleted ✅', 'info');
            } else if (action === 'toggle-tournament') {
                let ts = getData(KEYS.tournaments);
                const t = ts.find(x => x.id === id);
                if (t) t.status = t.status === 'open' ? 'closed' : 'open';
                setData(KEYS.tournaments, ts);
                showToast(`Tournament ${t.status}`, 'info');
            } else if (action === 'delete-update') {
                let us = getData(KEYS.updates).filter(x => x.id !== id);
                setData(KEYS.updates, us);
                showToast('Update deleted ✅', 'info');
            } else if (action === 'delete-member') {
                let ms = getData(KEYS.members).filter(x => x.id !== id);
                setData(KEYS.members, ms);
                showToast('Member removed ✅', 'info');
            }
            renderAll();
        });
    }

    // ========== SCROLL REVEAL ==========
    function initScrollReveal() {
        const els = [...$$('.section-header'), ...$$('.tournament-card'), ...$$('.update-card'), ...$$('.rule-card'), ...$$('.dash-card')];
        els.forEach(el => el.classList.add('reveal'));
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        els.forEach(el => obs.observe(el));
    }

    // ========== RENDER ALL ==========
    function renderAll() {
        renderTournaments();
        populateTournamentFilter();
        renderMembers();
        renderUpdates();
        updateDashboard();
        if (isAdminLoggedIn()) renderAdminLists();
        // Re-apply reveal
        setTimeout(initScrollReveal, 100);
    }

    // ========== INIT ==========
    function init() {
        createParticles();
        initNavbar();
        initAdminTabs();

        // Modal
        modalClose.addEventListener('click', closeRegModal);
        regModal.addEventListener('click', e => { if (e.target === regModal) closeRegModal(); });
        regForm.addEventListener('submit', handleRegistration);

        // Members
        btnSort.addEventListener('click', sortMembers);
        filterTournament.addEventListener('change', renderMembers);

        // Admin
        adminLoginForm.addEventListener('submit', handleAdminLogin);
        btnLogout.addEventListener('click', handleAdminLogout);
        addTournamentForm.addEventListener('submit', handleAddTournament);
        addUpdateForm.addEventListener('submit', handleAddUpdate);
        initAdminActions();

        checkAdminState();

        // Auto-generate CWL form on 26th of every month
        autoGenerateMonthlyCWL();

        renderAll();

        // Seed sample updates if first visit
        if (getData(KEYS.updates).length === 0) seedSampleUpdates();
    }

    // ========== AUTO CWL: Opens 26th, Closes 1st ==========
    function autoGenerateMonthlyCWL() {
        const now = new Date();
        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const tournaments = getData(KEYS.tournaments);

        // --- AUTO-CLOSE on 1st of every month ---
        // On the 1st (or any day 1-25), close all open CWL forms
        if (currentDay <= 25) {
            let closed = false;
            tournaments.forEach(t => {
                if (t.autoGenerated && t.status === 'open') {
                    t.status = 'closed';
                    closed = true;
                }
            });
            if (closed) {
                setData(KEYS.tournaments, tournaments);
                showToast('CWL registration closed — CWL has started! ⚔️', 'info');
            }
            return;
        }

        // --- AUTO-OPEN on 26th or later ---
        // Determine next month's CWL name
        const nextMonth = new Date(currentYear, currentMonth + 1, 1);
        const cwlName = `CWL ${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`;

        // Check if this CWL already exists
        const exists = tournaments.some(t => t.name === cwlName);
        if (exists) return;

        // Auto-close any older open CWL tournaments
        tournaments.forEach(t => {
            if (t.autoGenerated && t.status === 'open' && t.name !== cwlName) {
                t.status = 'closed';
            }
        });

        // Create the new CWL tournament
        tournaments.push({
            id: uid(),
            name: cwlName,
            date: nextMonth.toISOString().split('T')[0],
            slots: 30,
            desc: `CWL registration for ${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}. Registration open from 26th until 1st. Choose Serious or Lazy CWL.`,
            minTH: '8',
            status: 'open',
            autoGenerated: true,
            createdAt: now.toISOString()
        });
        setData(KEYS.tournaments, tournaments);

        // Post auto announcement
        const updates = getData(KEYS.updates);
        const announcementExists = updates.some(u => u.title === `${cwlName} Registration Open!`);
        if (!announcementExists) {
            updates.push({
                id: uid(),
                title: `${cwlName} Registration Open!`,
                category: 'cwl',
                content: `Registration for ${cwlName} is now open! Sign up before the 1st. Choose Serious CWL or Lazy CWL.`,
                pinned: true,
                createdAt: now.toISOString()
            });
            setData(KEYS.updates, updates);
        }

        showToast(`${cwlName} registration is open! 🏆`, 'success');
    }

    // Seed sample updates for first visit
    function seedSampleUpdates() {
        const now = new Date();
        const updates = [
            { id: uid(), title: 'War Attack Strategy', category: 'war', content: 'All CWL participants must use both attacks within the first 12 hours. Failure to attack will result in removal from the roster.', pinned: false, createdAt: now.toISOString() },
            { id: uid(), title: 'Donation Requirements', category: 'donate', content: 'Minimum 500 donations per season to maintain elder status. Only donate max-level troops to war CCs during CWL.', pinned: false, createdAt: now.toISOString() },
            { id: uid(), title: 'Clan Games Starting Soon', category: 'event', content: 'Clan Games begin next week. Every member must complete at least 2,000 points to earn full rewards.', pinned: false, createdAt: now.toISOString() }
        ];
        setData(KEYS.updates, updates);
        renderAll();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
