/* ========================================
   CLASH OF CLANS — CLAN DASHBOARD
   Application Logic — Firebase Real-time
   ======================================== */
(function () {
    'use strict';

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // ========== FIREBASE ==========
    const firebaseConfig = {
        apiKey: "AIzaSyAHOFCnC9NbMEICzP4RtXLQc3m5GU-eUpc",
        authDomain: "clan-dashboard.firebaseapp.com",
        databaseURL: "https://clan-dashboard-default-rtdb.firebaseio.com",
        projectId: "clan-dashboard",
        storageBucket: "clan-dashboard.firebasestorage.app",
        messagingSenderId: "78789632632",
        appId: "1:78789632632:web:f41e48766f5f5b8128038d"
    };

    // Initialize Firebase
    let db;
    let firebaseReady = false;
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;
    } catch (err) {
        console.warn('Firebase not configured. Using localStorage fallback.', err);
        firebaseReady = false;
    }

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
    const _AK = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    const _AP = 'df4b2ead662f5db4bc4cd1e708a180a8477da8d83dc08ecee2a82971ada0dd36';

    async function hashSHA256(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // In-memory cache (syncs with Firebase in real-time)
    let cache = {
        tournaments: [],
        members: [],
        updates: []
    };
    let sortAsc = true;
    let loginCache = []; // Admin login history cache

    // ========== DATA LAYER (Firebase + localStorage fallback) ==========

    // Convert Firebase object to array (Firebase stores as {key: value} object)
    function fbObjToArr(obj) {
        if (!obj) return [];
        return Object.keys(obj).map(k => ({ ...obj[k], _fbKey: k }));
    }

    // --- READ ---
    function getData(key) {
        if (key === KEYS.tournaments) return cache.tournaments;
        if (key === KEYS.members) return cache.members;
        if (key === KEYS.updates) return cache.updates;
        // Fallback for unknown keys
        try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
    }

    // --- WRITE ---
    function setData(key, data) {
        // Always update local cache
        if (key === KEYS.tournaments) cache.tournaments = data;
        if (key === KEYS.members) cache.members = data;
        if (key === KEYS.updates) cache.updates = data;

        if (firebaseReady) {
            // Write to Firebase — converts array to object keyed by item id
            const fbPath = key.replace('clan_', '');
            const obj = {};
            data.forEach(item => {
                const fbKey = item._fbKey || item.id;
                obj[fbKey] = { ...item };
                delete obj[fbKey]._fbKey; // Don't store the _fbKey in Firebase
            });
            db.ref(fbPath).set(obj).catch(err => {
                console.error('Firebase write error:', err);
                // Fallback to localStorage
                localStorage.setItem(key, JSON.stringify(data));
            });
        } else {
            localStorage.setItem(key, JSON.stringify(data));
        }
    }

    // --- Push single item (more efficient than rewriting entire array) ---
    function pushItem(key, item) {
        const fbPath = key.replace('clan_', '');
        if (firebaseReady) {
            const ref = db.ref(fbPath + '/' + item.id);
            const cleanItem = { ...item };
            delete cleanItem._fbKey;
            ref.set(cleanItem);
        }
        // Also update local cache
        if (key === KEYS.tournaments) cache.tournaments.push(item);
        if (key === KEYS.members) cache.members.push(item);
        if (key === KEYS.updates) cache.updates.push(item);
        if (!firebaseReady) localStorage.setItem(key, JSON.stringify(getData(key)));
    }

    // --- Delete single item ---
    function deleteItem(key, id) {
        const fbPath = key.replace('clan_', '');
        if (firebaseReady) {
            db.ref(fbPath + '/' + id).remove();
        }
        if (key === KEYS.tournaments) cache.tournaments = cache.tournaments.filter(x => x.id !== id);
        if (key === KEYS.members) cache.members = cache.members.filter(x => x.id !== id);
        if (key === KEYS.updates) cache.updates = cache.updates.filter(x => x.id !== id);
        if (!firebaseReady) localStorage.setItem(key, JSON.stringify(getData(key)));
    }

    // --- Update single item field ---
    function updateItem(key, id, updates) {
        const fbPath = key.replace('clan_', '');
        if (firebaseReady) {
            db.ref(fbPath + '/' + id).update(updates);
        }
        let arr = getData(key);
        const item = arr.find(x => x.id === id);
        if (item) Object.assign(item, updates);
        if (!firebaseReady) localStorage.setItem(key, JSON.stringify(arr));
    }

    // ========== FIREBASE REAL-TIME LISTENERS ==========
    function initFirebaseListeners() {
        if (!firebaseReady) return;

        // Tournaments
        db.ref('tournaments').on('value', snap => {
            cache.tournaments = fbObjToArr(snap.val());
            renderTournaments();
            populateTournamentFilter();
            updateDashboard();
            if (isAdminLoggedIn()) renderAdminLists();
            setTimeout(initScrollReveal, 100);
        });

        // Members
        db.ref('members').on('value', snap => {
            cache.members = fbObjToArr(snap.val());
            renderMembers();
            renderTournaments(); // Update slot counts
            updateDashboard();
            if (isAdminLoggedIn()) renderAdminLists();
            setTimeout(initScrollReveal, 100);
        });

        // Updates
        db.ref('updates').on('value', snap => {
            cache.updates = fbObjToArr(snap.val());
            renderUpdates();
            updateDashboard();
            if (isAdminLoggedIn()) renderAdminLists();
            setTimeout(initScrollReveal, 100);
        });
    }

    // ========== HELPERS ==========
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
        for (let i = 0; i < 12; i++) {
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
        // Reset war weight field
        const warWeightInput = $('#warWeight');
        const warWeightStatus = $('#warWeightStatus');
        if (warWeightInput) { warWeightInput.value = ''; warWeightInput.placeholder = 'Enter tag to auto-fetch...'; }
        if (warWeightStatus) { warWeightStatus.textContent = ''; warWeightStatus.className = 'war-weight-status'; }
        regModal.classList.add('active');
    }

    function closeRegModal() {
        regModal.classList.remove('active');
    }

    // ========== FWA STATS WAR WEIGHT AUTO-FETCH ==========
    let fwaStatsCache = null; // Cache the CSV data to avoid repeated fetches
    let fwaStatsCacheTime = 0;
    const FWA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const FWA_CLAN_TAG = 'RJC82J8Q';

    // Fetch and parse the fwastats CSV
    async function fetchFWAStats() {
        const now = Date.now();
        if (fwaStatsCache && (now - fwaStatsCacheTime) < FWA_CACHE_DURATION) {
            return fwaStatsCache; // Return cached data
        }

        const csvUrl = `http://fwastats.com/clan/${FWA_CLAN_TAG}/members.csv`;
        // Try multiple CORS proxies in case one fails
        const proxyUrls = [
            `https://corsproxy.io/?${encodeURIComponent(csvUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(csvUrl)}`
        ];

        for (const proxyUrl of proxyUrls) {
            try {
                const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
                if (!response.ok) continue;
                const csvText = await response.text();
                const parsed = parseCSV(csvText);
                if (parsed && parsed.length > 0) {
                    fwaStatsCache = parsed;
                    fwaStatsCacheTime = now;
                    return parsed;
                }
            } catch (err) {
                console.warn(`FWA Stats proxy failed: ${proxyUrl}`, err);
                continue;
            }
        }
        return null; // All proxies failed
    }

    // Parse CSV text into array of objects
    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];

        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));

        // Find relevant column indices
        const tagIdx = headers.findIndex(h => h.includes('tag'));
        const nameIdx = headers.findIndex(h => h.includes('name') && !h.includes('clan'));
        const weightIdx = headers.findIndex(h => h.includes('weight') || h.includes('war_weight') || h.includes('warweight'));
        const thIdx = headers.findIndex(h => h.includes('th') || h.includes('townhall') || h.includes('town_hall'));

        if (tagIdx === -1) return []; // Must have tag column at minimum

        const members = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length <= tagIdx) continue;

            members.push({
                tag: (cols[tagIdx] || '').trim().replace(/["']/g, ''),
                name: nameIdx >= 0 ? (cols[nameIdx] || '').trim().replace(/["']/g, '') : '',
                weight: weightIdx >= 0 ? (cols[weightIdx] || '').trim().replace(/["']/g, '') : '',
                th: thIdx >= 0 ? (cols[thIdx] || '').trim().replace(/["']/g, '') : ''
            });
        }
        return members;
    }

    // Handle CSV fields that may contain commas inside quotes
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current);
        return result;
    }

    // Normalize a player tag for comparison
    function normalizeTag(tag) {
        return tag.replace(/[#\s]/g, '').toUpperCase();
    }

    // Look up a player by tag or name in the FWA stats data
    function findPlayerInFWA(fwaData, searchTag, searchName) {
        const normTag = normalizeTag(searchTag);
        // First try exact tag match (most reliable)
        if (normTag) {
            const byTag = fwaData.find(m => normalizeTag(m.tag) === normTag);
            if (byTag) return byTag;
        }
        // Fallback: try name match (case-insensitive)
        if (searchName) {
            const normName = searchName.trim().toLowerCase();
            const byName = fwaData.find(m => m.name.toLowerCase() === normName);
            if (byName) return byName;
        }
        return null;
    }

    // Auto-fetch war weight when player tag is entered
    let warWeightDebounce = null;
    function initWarWeightAutoFetch() {
        const tagInput = $('#playerTag');
        const nameInput = $('#playerName');
        const weightInput = $('#warWeight');
        const statusEl = $('#warWeightStatus');
        if (!tagInput || !weightInput) return;

        async function doLookup() {
            const tag = tagInput.value.trim();
            const name = nameInput ? nameInput.value.trim() : '';

            if (!tag && !name) {
                weightInput.value = '';
                weightInput.placeholder = 'Enter tag to auto-fetch...';
                statusEl.textContent = '';
                statusEl.className = 'war-weight-status';
                return;
            }

            // Show loading
            weightInput.value = '';
            weightInput.placeholder = 'Fetching...';
            statusEl.textContent = '⏳';
            statusEl.className = 'war-weight-status loading';

            try {
                const fwaData = await fetchFWAStats();
                if (!fwaData) {
                    weightInput.placeholder = 'Could not reach FWA Stats';
                    statusEl.textContent = '⚠️';
                    statusEl.className = 'war-weight-status error';
                    return;
                }

                const player = findPlayerInFWA(fwaData, tag, name);
                if (player && player.weight) {
                    const formattedWeight = parseInt(player.weight).toLocaleString();
                    weightInput.value = formattedWeight;
                    statusEl.textContent = '✅';
                    statusEl.className = 'war-weight-status success';
                    // Also auto-fill TH if found and not yet selected
                    if (player.th && $('#thLevel').value === '') {
                        const thVal = parseInt(player.th);
                        if (thVal >= 8 && thVal <= 17) {
                            $('#thLevel').value = String(thVal);
                        }
                    }
                } else {
                    weightInput.value = '';
                    weightInput.placeholder = 'Not found in clan';
                    statusEl.textContent = '❌';
                    statusEl.className = 'war-weight-status not-found';
                }
            } catch (err) {
                console.error('War weight lookup error:', err);
                weightInput.placeholder = 'Lookup failed';
                statusEl.textContent = '⚠️';
                statusEl.className = 'war-weight-status error';
            }
        }

        // Debounced lookup on tag input (triggers 600ms after typing stops)
        tagInput.addEventListener('input', () => {
            clearTimeout(warWeightDebounce);
            warWeightDebounce = setTimeout(doLookup, 600);
        });

        // Also trigger on blur (when they tab away from the field)
        tagInput.addEventListener('blur', () => {
            clearTimeout(warWeightDebounce);
            if (tagInput.value.trim()) doLookup();
        });
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

        const newMember = {
            id: uid(), tournamentId: tId, tournamentName: t.name,
            name: data.name, tag: data.tag, th: data.th,
            cwlType: data.cwlType,
            warWeight: ($('#warWeight').value || '').replace(/,/g, ''),
            allocatedClan: '', allocatedClanLink: '',
            registeredAt: new Date().toISOString()
        };
        pushItem(KEYS.members, newMember);

        showFormMsg(`✅ ${data.name} registered successfully!`, 'success');
        showToast(`${data.name} registered for ${t.name}!`, 'success');

        setTimeout(() => {
            closeRegModal();
            if (!firebaseReady) renderAll(); // Firebase listeners handle re-render
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
        if (filterVal === 'none') {
            countBadge.textContent = 0;
            membersTableBody.innerHTML = '';
            membersTable.style.display = 'none';
            membersEmpty.style.display = 'block';
            return;
        }
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
            let clanCell = '<span class="td-not-assigned">Not assigned</span>';
            if (m.allocatedClan) {
                if (m.allocatedClanLink) {
                    clanCell = `<a href="${escapeHTML(m.allocatedClanLink)}" target="_blank" class="td-clan-link">${escapeHTML(m.allocatedClan)}</a>`;
                } else {
                    clanCell = `<span class="td-clan-tag">${escapeHTML(m.allocatedClan)}</span>`;
                }
            }
            const weightDisplay = m.warWeight ? parseInt(m.warWeight).toLocaleString() : '—';
            const weightClass = m.warWeight ? 'war-weight-cell has-weight' : 'war-weight-cell';
            row.innerHTML = `
                <td>${i + 1}</td>
                <td class="td-name">${escapeHTML(m.name)}</td>
                <td class="td-tag">${escapeHTML(m.tag)}</td>
                <td><span class="th-badge">TH${m.th}</span></td>
                <td><span class="${weightClass}">⚖️ ${weightDisplay}</span></td>
                <td><span class="td-tournament">🏆 ${escapeHTML(m.tournamentName || 'Unknown')}</span></td>
                <td><span class="td-cwl ${cwlClass}">${escapeHTML(m.cwlType || '—')}</span></td>
                <td>${clanCell}</td>
            `;
            membersTableBody.appendChild(row);
        });
    }

    function populateTournamentFilter() {
        const tournaments = getData(KEYS.tournaments);
        filterTournament.innerHTML = '<option value="none">Select a Tournament</option><option value="all">All Tournaments</option>';
        
        let firstOpenId = null;
        tournaments.forEach(t => {
            filterTournament.innerHTML += `<option value="${t.id}">${escapeHTML(t.name)}</option>`;
            if (t.status === 'open' && !firstOpenId) {
                firstOpenId = t.id;
            }
        });

        // Default to the currently open tournament if one exists
        if (firstOpenId) {
            filterTournament.value = firstOpenId;
        } else {
            filterTournament.value = 'none';
        }
    }

    function sortMembers() {
        let members = getData(KEYS.members);
        members.sort((a, b) => sortAsc ? parseInt(b.th) - parseInt(a.th) : parseInt(a.th) - parseInt(b.th));
        sortAsc = !sortAsc;
        setData(KEYS.members, members);
        if (!firebaseReady) renderMembers();
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
            // Refresh analytics if data is loaded
            if (visitorCache.length > 0) {
                updateVisitorStats();
                renderVisitorLog();
                renderTopLocations();
                renderBrowserBreakdown();
            }
            if (loginCache.length > 0) {
                renderLoginLog();
                updateLoginStats();
            }
        } else {
            adminLoginBox.style.display = 'flex';
            adminPanel.style.display = 'none';
        }
    }

    async function handleAdminLogin(e) {
        e.preventDefault();
        const user = $('#adminUser').value.trim();
        const pass = $('#adminPass').value;
        const [uH, pH] = await Promise.all([hashSHA256(user), hashSHA256(pass)]);
        const isSuccess = (uH === _AK && pH === _AP);

        logLoginAttempt(user, isSuccess);

        if (isSuccess) {
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
        analyticsUnlocked = false;
        destroyAnalyticsUI();
        checkAdminState();
        showToast('Logged out', 'info');
    }

    let analyticsUnlocked = false;

    function initAdminTabs() {
        $$('.admin-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                // If clicking Analytics tab and not yet unlocked, show login popup
                if (this.dataset.tab === 'tabAnalytics' && !analyticsUnlocked) {
                    const modal = document.getElementById('analyticsLoginModal');
                    const form = document.getElementById('analyticsLoginForm');
                    const msg = document.getElementById('analyticsLoginMessage');
                    if (modal) {
                        modal.classList.add('active');
                        if (form) form.reset();
                        if (msg) msg.className = 'form-message';
                    }
                    return; // Don't switch tab
                }

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
        pushItem(KEYS.tournaments, t);
        addTournamentForm.reset();
        $('#tSlots').value = 50;
        if (!firebaseReady) renderAll();
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
        pushItem(KEYS.updates, u);
        addUpdateForm.reset();
        if (!firebaseReady) renderAll();
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
                item.className = 'admin-item admin-member-item';
                item.innerHTML = `
                    <div class="admin-item-info">
                        <h5>${escapeHTML(m.name)} (TH${m.th})</h5>
                        <p>${escapeHTML(m.tag)} · 🏆 ${escapeHTML(m.tournamentName || '?')} · ${escapeHTML(m.cwlType || '—')}</p>
                    </div>
                    <div class="admin-clan-assign">
                        <input type="text" class="clan-input" data-mid="${m.id}" data-field="tag" placeholder="Clan tag e.g. #ABC" value="${escapeHTML(m.allocatedClan || '')}">
                        <input type="text" class="clan-input" data-mid="${m.id}" data-field="link" placeholder="Clan link (optional)" value="${escapeHTML(m.allocatedClanLink || '')}">
                        <button class="btn-admin-action btn-admin-save" data-id="${m.id}" data-action="save-clan">Save</button>
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
                // Delete tournament and its members
                deleteItem(KEYS.tournaments, id);
                const membersToRemove = getData(KEYS.members).filter(x => x.tournamentId === id);
                membersToRemove.forEach(m => deleteItem(KEYS.members, m.id));
                showToast('Tournament deleted ✅', 'info');
            } else if (action === 'toggle-tournament') {
                const t = getData(KEYS.tournaments).find(x => x.id === id);
                if (t) {
                    const newStatus = t.status === 'open' ? 'closed' : 'open';
                    updateItem(KEYS.tournaments, id, { status: newStatus });
                    showToast(`Tournament ${newStatus}`, 'info');
                }
            } else if (action === 'delete-update') {
                deleteItem(KEYS.updates, id);
                showToast('Update deleted ✅', 'info');
            } else if (action === 'delete-member') {
                deleteItem(KEYS.members, id);
                showToast('Member removed ✅', 'info');
            } else if (action === 'save-clan') {
                const tagInput = document.querySelector(`.clan-input[data-mid="${id}"][data-field="tag"]`);
                const linkInput = document.querySelector(`.clan-input[data-mid="${id}"][data-field="link"]`);
                if (tagInput) {
                    const clanTag = tagInput.value.trim();
                    const clanLink = linkInput ? linkInput.value.trim() : '';
                    updateItem(KEYS.members, id, { allocatedClan: clanTag, allocatedClanLink: clanLink });
                    const member = getData(KEYS.members).find(x => x.id === id);
                    showToast(`${member ? member.name : 'Member'} → ${clanTag || 'unassigned'} 🏰`, 'success');
                }
            }
            if (!firebaseReady) renderAll(); // Firebase listeners handle re-render
        });
    }

    // ========== CSV EXPORT ==========
    function downloadMembersCSV() {
        const members = getData(KEYS.members);
        if (members.length === 0) {
            showToast('No members to export!', 'error');
            return;
        }

        // CSV header
        const headers = ['#', 'Player Name', 'Player Tag', 'TH Level', 'War Weight', 'Tournament', 'CWL Type', 'Allocated Clan', 'Clan Link', 'Registered At'];

        // CSV rows
        const rows = members.map((m, i) => [
            i + 1,
            m.name || '',
            m.tag || '',
            m.th || '',
            m.warWeight || '',
            m.tournamentName || '',
            m.cwlType || '',
            m.allocatedClan || '',
            m.allocatedClanLink || '',
            m.registeredAt ? new Date(m.registeredAt).toLocaleString() : ''
        ]);

        // Build CSV string (handle commas/quotes in values)
        const csvContent = [headers, ...rows].map(row =>
            row.map(cell => {
                const str = String(cell);
                // Wrap in quotes if contains comma, quote, or newline
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }).join(',')
        ).join('\n');

        // Add BOM for Excel compatibility with special characters
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Generate filename with current date
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const filename = `CWL_Registration_${dateStr}.csv`;

        // Trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Downloaded ${members.length} members as ${filename}`, 'success');
    }

    // ========== DYNAMIC ANALYTICS UI ==========
    function buildAnalyticsUI() {
        const container = document.getElementById('tabAnalytics');
        if (!container || container.dataset.built) return;
        container.dataset.built = '1';
        container.innerHTML = `
            <div class="analytics-header">
                <h4 class="admin-list-title" style="margin-bottom:4px">📊 Dashboard</h4>
                <p class="admin-hint" style="margin-bottom:0">Monitoring overview.</p>
            </div>
            <div class="analytics-stats-grid">
                <div class="analytics-stat-card stat-live">
                    <div class="stat-icon-wrap"><span class="stat-icon">🟢</span><span class="stat-pulse"></span></div>
                    <div class="stat-info"><span class="stat-number" id="liveVisitors">0</span><span class="stat-label">Live Now</span></div>
                </div>
                <div class="analytics-stat-card stat-today">
                    <div class="stat-icon-wrap"><span class="stat-icon">📅</span></div>
                    <div class="stat-info"><span class="stat-number" id="todayVisitors">0</span><span class="stat-label">Today</span></div>
                </div>
                <div class="analytics-stat-card stat-total">
                    <div class="stat-icon-wrap"><span class="stat-icon">🌐</span></div>
                    <div class="stat-info"><span class="stat-number" id="totalVisitors">0</span><span class="stat-label">All-Time</span></div>
                </div>
                <div class="analytics-stat-card stat-unique">
                    <div class="stat-icon-wrap"><span class="stat-icon">👤</span></div>
                    <div class="stat-info"><span class="stat-number" id="uniqueVisitors">0</span><span class="stat-label">Unique</span></div>
                </div>
                <div class="analytics-stat-card stat-logins">
                    <div class="stat-icon-wrap"><span class="stat-icon">🔐</span></div>
                    <div class="stat-info"><span class="stat-number" id="totalLogins">0</span><span class="stat-label">Logins</span></div>
                </div>
            </div>
            <div class="analytics-locations-card">
                <h5>🌐 Browsers</h5>
                <div class="locations-list" id="browserBreakdownList"><p class="admin-hint">Loading...</p></div>
            </div>
            <div class="analytics-locations-card">
                <h5>🗺️ Locations</h5>
                <div class="locations-list" id="topLocationsList"><p class="admin-hint">Loading...</p></div>
            </div>
            <div class="analytics-table-header">
                <h5>📋 Log</h5>
                <div class="analytics-table-actions">
                    <button class="btn-admin-action btn-admin-toggle" id="btnClearVisitors">🗑️ Clear All</button>
                    <button class="btn-download-csv" id="btnDownloadVisitorCSV" style="padding:8px 16px;font-size:0.8rem">📥 Export CSV</button>
                </div>
            </div>
            <div class="analytics-table-wrapper">
                <table class="analytics-table" id="visitorTable">
                    <thead><tr><th>#</th><th>Source</th><th>Region</th><th>Type</th><th>Path</th><th>Time</th></tr></thead>
                    <tbody id="visitorTableBody"></tbody>
                </table>
                <div class="empty-state" id="visitorEmpty" style="display:none;">
                    <div class="empty-icon">📊</div><h3>No Data Yet</h3><p>Data will appear once available.</p>
                </div>
            </div>
            <div class="analytics-pagination" id="visitorPagination"></div>
            <div class="analytics-table-header" style="margin-top:30px;">
                <h5>🔐 Auth History</h5>
                <div class="analytics-table-actions">
                    <button class="btn-admin-action btn-admin-toggle" id="btnClearLogins">🗑️ Clear All</button>
                </div>
            </div>
            <div class="analytics-table-wrapper">
                <table class="analytics-table" id="loginTable">
                    <thead><tr><th>#</th><th>Source</th><th>Region</th><th>Type</th><th>Client</th><th>Result</th><th>Time</th></tr></thead>
                    <tbody id="loginTableBody"></tbody>
                </table>
                <div class="empty-state" id="loginEmpty" style="display:none;">
                    <div class="empty-icon">🔐</div><h3>No Records</h3><p>Records will appear here.</p>
                </div>
            </div>
        `;
        // Bind analytics action buttons
        document.getElementById('btnClearVisitors').addEventListener('click', clearVisitorData);
        document.getElementById('btnDownloadVisitorCSV').addEventListener('click', downloadVisitorCSV);
        document.getElementById('btnClearLogins').addEventListener('click', clearLoginData);
        // Refresh data into the newly built UI
        if (visitorCache.length > 0) {
            updateVisitorStats();
            renderVisitorLog();
            renderTopLocations();
            renderBrowserBreakdown();
        }
        if (loginCache.length > 0) {
            renderLoginLog();
            updateLoginStats();
        }
    }

    function destroyAnalyticsUI() {
        const container = document.getElementById('tabAnalytics');
        if (!container) return;
        container.innerHTML = '';
        delete container.dataset.built;
    }

    // ========== VISITOR ANALYTICS ==========
    let visitorCache = [];
    let visitorCurrentPage = 1;
    const VISITORS_PER_PAGE = 20;

    // Detect device type from user agent
    function getDeviceType() {
        const ua = navigator.userAgent;
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
            if (/iPad|Tablet/i.test(ua)) return '📱 Tablet';
            return '📱 Mobile';
        }
        return '💻 Desktop';
    }

    // Get browser name from user agent
    function getBrowserName() {
        const ua = navigator.userAgent;
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari')) return 'Safari';
        return 'Other';
    }

    // Log current visitor (called on every page load)
    async function logVisitor() {
        if (!firebaseReady) return;

        let ip = 'Unknown', city = 'Unknown', region = '', country = 'Unknown', countryCode = '';

        // Build the visitor object first — log IMMEDIATELY, then enrich with geo data
        const visitorId = 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const browserFingerprint = getBrowserName() + '_' + getDeviceType() + '_' + navigator.language + '_' + screen.width + 'x' + screen.height;
        const visitor = {
            id: visitorId,
            ip: ip,
            city: city,
            region: region,
            country: country,
            countryCode: countryCode,
            device: getDeviceType(),
            browser: getBrowserName(),
            fingerprint: browserFingerprint,
            page: window.location.pathname || '/',
            timestamp: new Date().toISOString(),
            dateKey: new Date().toISOString().split('T')[0]
        };

        // Save to Firebase immediately (even before geo lookup)
        try {
            await db.ref('visitors/' + visitorId).set(visitor);
        } catch (err) {
            console.warn('Visitor write failed:', err);
        }

        // Track live presence immediately
        trackLivePresence(ip);

        // Now try to enrich with geolocation data (async, non-blocking)
        try {
            const geoApis = [
                { url: 'https://ipwho.is/', parse: d => ({ ip: d.ip, city: d.city, region: d.region, country: d.country, cc: d.country_code }) },
                { url: 'https://freeipapi.com/api/json', parse: d => ({ ip: d.ipAddress, city: d.cityName, region: d.regionName, country: d.countryName, cc: d.countryCode }) },
                { url: 'https://ipapi.co/json/', parse: d => ({ ip: d.ip, city: d.city, region: d.region, country: d.country_name, cc: d.country_code }) }
            ];

            for (const api of geoApis) {
                try {
                    const resp = await fetch(api.url, { signal: AbortSignal.timeout(6000) });
                    if (!resp.ok) continue;
                    const data = await resp.json();
                    if (data.error || data.success === false) continue;

                    const parsed = api.parse(data);
                    if (parsed.ip) {
                        ip = parsed.ip;
                        city = parsed.city || 'Unknown';
                        region = parsed.region || '';
                        country = parsed.country || 'Unknown';
                        countryCode = parsed.cc || '';

                        // Update the visitor record with real geo data
                        db.ref('visitors/' + visitorId).update({
                            ip: ip,
                            city: city,
                            region: region,
                            country: country,
                            countryCode: countryCode
                        });

                        // Update live presence with real IP
                        break; // Got data, stop trying
                    }
                } catch (err) {
                    continue; // Try next API
                }
            }
        } catch (err) {
            console.warn('Geo lookup failed (visitor still logged):', err);
        }
    }

    // Track live presence using Firebase realtime
    function trackLivePresence(ip) {
        if (!firebaseReady) return;

        const sessionId = 'session_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const presenceRef = db.ref('live_visitors/' + sessionId);

        // Set presence with onDisconnect removal
        presenceRef.set({
            ip: ip,
            connectedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Remove on disconnect (browser close/tab close)
        presenceRef.onDisconnect().remove();

        // Also remove on page unload
        window.addEventListener('beforeunload', () => {
            presenceRef.remove();
        });
    }

    // Initialize visitor analytics listeners (for admin panel)
    function initVisitorAnalytics() {
        if (!firebaseReady) return;

        // Listen for visitor log changes
        db.ref('visitors').orderByChild('timestamp').on('value', snap => {
            visitorCache = fbObjToArr(snap.val());
            // Sort by timestamp descending (newest first)
            visitorCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (isAdminLoggedIn()) {
                updateVisitorStats();
                renderVisitorLog();
                renderTopLocations();
            }
        });

        // Listen for live visitors
        db.ref('live_visitors').on('value', snap => {
            const liveData = snap.val();
            const liveCount = liveData ? Object.keys(liveData).length : 0;
            const liveEl = document.getElementById('liveVisitors');
            if (liveEl) liveEl.textContent = liveCount;
        });

        // Listen for admin login log
        db.ref('admin_logins').orderByChild('timestamp').on('value', snap => {
            loginCache = fbObjToArr(snap.val());
            loginCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (isAdminLoggedIn()) {
                renderLoginLog();
                updateLoginStats();
            }
        });
    }

    // Update visitor stat cards
    function updateVisitorStats() {
        const today = new Date().toISOString().split('T')[0];
        const todayVisits = visitorCache.filter(v => v.dateKey === today).length;
        const totalVisits = visitorCache.length;
        const uniqueIPs = new Set(visitorCache.map(v => v.ip)).size;

        const todayEl = document.getElementById('todayVisitors');
        const totalEl = document.getElementById('totalVisitors');
        const uniqueEl = document.getElementById('uniqueVisitors');

        if (todayEl) todayEl.textContent = todayVisits;
        if (totalEl) totalEl.textContent = totalVisits;
        if (uniqueEl) uniqueEl.textContent = uniqueIPs;

        // Render browser breakdown
        renderBrowserBreakdown();
    }

    // Update login count stat
    function updateLoginStats() {
        const loginCountEl = document.getElementById('totalLogins');
        if (loginCountEl) {
            const successLogins = loginCache.filter(l => l.status === 'success').length;
            loginCountEl.textContent = successLogins;
        }
    }

    // Render browser breakdown bar chart
    function renderBrowserBreakdown() {
        const container = document.getElementById('browserBreakdownList');
        if (!container) return;

        const browserCounts = {};
        visitorCache.forEach(v => {
            const browser = v.browser || 'Unknown';
            browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        });

        const sorted = Object.entries(browserCounts)
            .sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) {
            container.innerHTML = '<p class="admin-hint">No visitor data yet.</p>';
            return;
        }

        const browserIcons = {
            'Chrome': '\ud83d\udd35', 'Firefox': '\ud83e\udd8a', 'Safari': '\ud83e\udded',
            'Edge': '\ud83d\udd37', 'Opera': '\ud83d\udd34', 'Other': '\ud83c\udf10'
        };
        const maxCount = sorted[0][1];
        container.innerHTML = sorted.map(([browser, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            const icon = browserIcons[browser] || '\ud83c\udf10';
            return `
                <div class="location-item">
                    <span class="location-flag">${icon}</span>
                    <span class="location-name">${escapeHTML(browser)}</span>
                    <div class="location-bar-wrap">
                        <div class="location-bar" style="width:${pct}%"></div>
                    </div>
                    <span class="location-count">${count}</span>
                </div>
            `;
        }).join('');
    }

    // Log admin login attempt to Firebase
    async function logLoginAttempt(username, success) {
        if (!firebaseReady) return;

        const loginId = 'login_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const loginRecord = {
            id: loginId,
            username: username,
            status: success ? 'success' : 'failed',
            device: getDeviceType(),
            browser: getBrowserName(),
            ip: 'Fetching...',
            city: 'Unknown',
            region: '',
            country: 'Unknown',
            countryCode: '',
            timestamp: new Date().toISOString(),
            dateKey: new Date().toISOString().split('T')[0]
        };

        // Write immediately
        try {
            await db.ref('admin_logins/' + loginId).set(loginRecord);
        } catch (err) {
            console.warn('Login log write failed:', err);
        }

        // Enrich with geo data asynchronously
        try {
            const geoApis = [
                { url: 'https://ipwho.is/', parse: d => ({ ip: d.ip, city: d.city, region: d.region, country: d.country, cc: d.country_code }) },
                { url: 'https://freeipapi.com/api/json', parse: d => ({ ip: d.ipAddress, city: d.cityName, region: d.regionName, country: d.countryName, cc: d.countryCode }) }
            ];
            for (const api of geoApis) {
                try {
                    const resp = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
                    if (!resp.ok) continue;
                    const data = await resp.json();
                    if (data.error || data.success === false) continue;
                    const parsed = api.parse(data);
                    if (parsed.ip) {
                        db.ref('admin_logins/' + loginId).update({
                            ip: parsed.ip,
                            city: parsed.city || 'Unknown',
                            region: parsed.region || '',
                            country: parsed.country || 'Unknown',
                            countryCode: parsed.cc || ''
                        });
                        break;
                    }
                } catch { continue; }
            }
        } catch (err) {
            console.warn('Login geo lookup failed:', err);
        }
    }

    // Render admin login log table
    function renderLoginLog() {
        const tbody = document.getElementById('loginTableBody');
        const table = document.getElementById('loginTable');
        const empty = document.getElementById('loginEmpty');
        if (!tbody) return;

        if (loginCache.length === 0) {
            table.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        empty.style.display = 'none';
        tbody.innerHTML = '';

        // Show latest 50 login attempts
        const pageData = loginCache.slice(0, 50);
        pageData.forEach((l, i) => {
            const row = document.createElement('tr');
            const ts = new Date(l.timestamp);
            const timeStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const location = l.city && l.city !== 'Unknown'
                ? `${l.city}${l.region ? ', ' + l.region : ''}, ${l.country}`
                : l.country || 'Unknown';
            const statusClass = l.status === 'success' ? 'login-status-success' : 'login-status-failed';
            const statusIcon = l.status === 'success' ? '\u2705' : '\u274c';

            row.innerHTML = `
                <td>${i + 1}</td>
                <td><span class="td-ip">${escapeHTML(l.ip || 'Unknown')}</span></td>
                <td class="td-location">${escapeHTML(location)}</td>
                <td><span class="td-device">${escapeHTML(l.device || '?')}</span></td>
                <td>${escapeHTML(l.browser || '?')}</td>
                <td><span class="${statusClass}">${statusIcon} ${l.status === 'success' ? 'Success' : 'Failed'}</span></td>
                <td class="td-timestamp">${timeStr}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Clear login data
    async function clearLoginData() {
        if (!confirm('Are you sure you want to clear ALL login records?')) return;
        try {
            if (firebaseReady) {
                await db.ref('admin_logins').remove();
            }
            loginCache = [];
            renderLoginLog();
            updateLoginStats();
            showToast('Login records cleared ✅', 'info');
        } catch (err) {
            console.error('Clear login data failed:', err);
            showToast('Failed to clear — check Firebase permissions!', 'error');
        }
    }

    // Render top locations bar chart
    function renderTopLocations() {
        const container = document.getElementById('topLocationsList');
        if (!container) return;

        // Count visits per location
        const locationCounts = {};
        visitorCache.forEach(v => {
            const loc = v.city && v.city !== 'Unknown'
                ? `${v.city}, ${v.country}`
                : v.country || 'Unknown';
            locationCounts[loc] = (locationCounts[loc] || 0) + 1;
        });

        // Sort and take top 8
        const sorted = Object.entries(locationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        if (sorted.length === 0) {
            container.innerHTML = '<p class="admin-hint">No visitor data yet.</p>';
            return;
        }

        const maxCount = sorted[0][1];
        container.innerHTML = sorted.map(([loc, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            // Try to get a flag emoji from country code
            const visitor = visitorCache.find(v => {
                const vLoc = v.city && v.city !== 'Unknown' ? `${v.city}, ${v.country}` : v.country || 'Unknown';
                return vLoc === loc;
            });
            const cc = visitor?.countryCode || '';
            const flag = cc ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌍';

            return `
                <div class="location-item">
                    <span class="location-flag">${flag}</span>
                    <span class="location-name">${escapeHTML(loc)}</span>
                    <div class="location-bar-wrap">
                        <div class="location-bar" style="width:${pct}%"></div>
                    </div>
                    <span class="location-count">${count}</span>
                </div>
            `;
        }).join('');
    }

    // Render visitor log table with pagination
    function renderVisitorLog() {
        const tbody = document.getElementById('visitorTableBody');
        const table = document.getElementById('visitorTable');
        const empty = document.getElementById('visitorEmpty');
        const pagination = document.getElementById('visitorPagination');
        if (!tbody) return;

        if (visitorCache.length === 0) {
            table.style.display = 'none';
            empty.style.display = 'block';
            pagination.innerHTML = '';
            return;
        }

        table.style.display = 'table';
        empty.style.display = 'none';

        // Pagination
        const totalPages = Math.ceil(visitorCache.length / VISITORS_PER_PAGE);
        if (visitorCurrentPage > totalPages) visitorCurrentPage = totalPages;
        const start = (visitorCurrentPage - 1) * VISITORS_PER_PAGE;
        const pageData = visitorCache.slice(start, start + VISITORS_PER_PAGE);

        tbody.innerHTML = '';
        pageData.forEach((v, i) => {
            const row = document.createElement('tr');
            const ts = new Date(v.timestamp);
            const timeStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const location = v.city && v.city !== 'Unknown'
                ? `${v.city}${v.region ? ', ' + v.region : ''}, ${v.country}`
                : v.country || 'Unknown';

            row.innerHTML = `
                <td>${start + i + 1}</td>
                <td><span class="td-ip">${escapeHTML(v.ip)}</span></td>
                <td class="td-location">${escapeHTML(location)}</td>
                <td><span class="td-device">${escapeHTML(v.device || '?')} · ${escapeHTML(v.browser || '?')}</span></td>
                <td>${escapeHTML(v.page || '/')}</td>
                <td class="td-timestamp">${timeStr}</td>
            `;
            tbody.appendChild(row);
        });

        // Render pagination buttons
        if (totalPages > 1) {
            let paginationHTML = '';
            if (visitorCurrentPage > 1) {
                paginationHTML += `<button data-page="${visitorCurrentPage - 1}">‹</button>`;
            }
            for (let p = 1; p <= totalPages; p++) {
                if (totalPages > 7) {
                    // Show: 1 ... (current-1) current (current+1) ... last
                    if (p === 1 || p === totalPages || (p >= visitorCurrentPage - 1 && p <= visitorCurrentPage + 1)) {
                        paginationHTML += `<button data-page="${p}" class="${p === visitorCurrentPage ? 'active' : ''}">${p}</button>`;
                    } else if (p === 2 || p === totalPages - 1) {
                        paginationHTML += `<button disabled style="border:none;cursor:default">…</button>`;
                    }
                } else {
                    paginationHTML += `<button data-page="${p}" class="${p === visitorCurrentPage ? 'active' : ''}">${p}</button>`;
                }
            }
            if (visitorCurrentPage < totalPages) {
                paginationHTML += `<button data-page="${visitorCurrentPage + 1}">›</button>`;
            }
            pagination.innerHTML = paginationHTML;

            // Pagination click handlers
            pagination.querySelectorAll('button[data-page]').forEach(btn => {
                btn.addEventListener('click', () => {
                    visitorCurrentPage = parseInt(btn.dataset.page);
                    renderVisitorLog();
                });
            });
        } else {
            pagination.innerHTML = '';
        }
    }

    // Clear all visitor data
    async function clearVisitorData() {
        if (!confirm('Are you sure you want to clear ALL visitor data? This cannot be undone.')) return;
        try {
            if (firebaseReady) {
                await db.ref('visitors').remove();
                await db.ref('live_visitors').remove();
            }
            visitorCache = [];
            updateVisitorStats();
            renderVisitorLog();
            renderTopLocations();
            renderBrowserBreakdown();
            showToast('Visitor data cleared ✅', 'info');
        } catch (err) {
            console.error('Clear visitor data failed:', err);
            showToast('Failed to clear — check Firebase permissions!', 'error');
        }
    }

    // Download visitor log as CSV
    function downloadVisitorCSV() {
        if (visitorCache.length === 0) {
            showToast('No visitor data to export!', 'error');
            return;
        }

        const headers = ['#', 'IP Address', 'City', 'Region', 'Country', 'Device', 'Browser', 'Page', 'Timestamp'];
        const rows = visitorCache.map((v, i) => [
            i + 1, v.ip || '', v.city || '', v.region || '', v.country || '',
            v.device || '', v.browser || '', v.page || '/',
            v.timestamp ? new Date(v.timestamp).toLocaleString() : ''
        ]);

        const csvContent = [headers, ...rows].map(row =>
            row.map(cell => {
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const filename = `Visitor_Log_${dateStr}.csv`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Exported ${visitorCache.length} visitor records`, 'success');
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

    // ========== LAZY-LOAD IFRAMES ==========
    function initLazyIframes() {
        const iframes = $$('iframe[data-src]');
        if (iframes.length === 0) return;
        const obs = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const iframe = entry.target;
                    iframe.src = iframe.dataset.src;
                    iframe.removeAttribute('data-src');
                    observer.unobserve(iframe);
                }
            });
        }, { rootMargin: '200px 0px' }); // Start loading 200px before visible
        iframes.forEach(iframe => obs.observe(iframe));
    }

    // ========== RENDER ALL ==========
    function renderAll() {
        renderTournaments();
        populateTournamentFilter();
        renderMembers();
        renderUpdates();
        updateDashboard();
        if (isAdminLoggedIn()) renderAdminLists();
        setTimeout(initScrollReveal, 100);
    }

    // ========== INIT ==========
    function init() {
        createParticles();
        initNavbar();
        initAdminTabs();
        initLazyIframes();

        // Modal
        modalClose.addEventListener('click', closeRegModal);
        regModal.addEventListener('click', e => { if (e.target === regModal) closeRegModal(); });
        regForm.addEventListener('submit', handleRegistration);
        initWarWeightAutoFetch();

        // Members
        btnSort.addEventListener('click', sortMembers);
        filterTournament.addEventListener('change', renderMembers);

        // Admin
        adminLoginForm.addEventListener('submit', handleAdminLogin);
        btnLogout.addEventListener('click', handleAdminLogout);
        addTournamentForm.addEventListener('submit', handleAddTournament);
        addUpdateForm.addEventListener('submit', handleAddUpdate);
        initAdminActions();
        $('#btnDownloadCSV').addEventListener('click', downloadMembersCSV);

        // Analytics Nav Button
        const navAnalyticsBtn = document.getElementById('navAnalyticsBtn');
        const analyticsLoginModal = document.getElementById('analyticsLoginModal');
        const analyticsModalClose = document.getElementById('analyticsModalClose');
        const analyticsLoginForm = document.getElementById('analyticsLoginForm');
        const analyticsLoginMessage = document.getElementById('analyticsLoginMessage');

        navAnalyticsBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (isAdminLoggedIn() && analyticsUnlocked) {
                // Already logged in AND analytics unlocked — go directly
                navigateToAnalytics();
            } else {
                // Show analytics login modal (even if admin logged in)
                analyticsLoginModal.classList.add('active');
                analyticsLoginForm.reset();
                analyticsLoginMessage.className = 'form-message';
            }
        });

        analyticsModalClose.addEventListener('click', () => {
            analyticsLoginModal.classList.remove('active');
        });
        analyticsLoginModal.addEventListener('click', e => {
            if (e.target === analyticsLoginModal) analyticsLoginModal.classList.remove('active');
        });

        analyticsLoginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const user = document.getElementById('analyticsUser').value.trim();
            const pass = document.getElementById('analyticsPass').value;
            const [uH, pH] = await Promise.all([hashSHA256(user), hashSHA256(pass)]);
            const isSuccess = (uH === _AK && pH === _AP);

            logLoginAttempt(user, isSuccess);

            if (isSuccess) {
                localStorage.setItem(KEYS.admin, 'true');
                analyticsUnlocked = true;
                buildAnalyticsUI();
                analyticsLoginModal.classList.remove('active');
                checkAdminState();
                showToast('Access granted! 📊', 'success');
                setTimeout(() => navigateToAnalytics(), 300);
            } else {
                analyticsLoginMessage.textContent = 'Invalid credentials. Try again.';
                analyticsLoginMessage.className = 'form-message error';
                showToast('Wrong credentials!', 'error');
            }
        });

        function navigateToAnalytics() {
            // Scroll to admin section
            document.getElementById('admin').scrollIntoView({ behavior: 'smooth' });
            // Switch to analytics tab
            setTimeout(() => {
                $$('.admin-tab').forEach(t => t.classList.remove('active'));
                $$('.admin-tab-content').forEach(c => c.classList.remove('active'));
                const analyticsTab = document.querySelector('.admin-tab[data-tab="tabAnalytics"]');
                const analyticsContent = document.getElementById('tabAnalytics');
                if (analyticsTab) analyticsTab.classList.add('active');
                if (analyticsContent) analyticsContent.classList.add('active');
            }, 400);
        }

        checkAdminState();

        if (firebaseReady) {
            // Firebase listeners will load data and render automatically
            initFirebaseListeners();
            // Log this visitor
            logVisitor();
            // Init analytics listeners for admin dashboard
            initVisitorAnalytics();
        } else {
            // Load from localStorage
            cache.tournaments = JSON.parse(localStorage.getItem(KEYS.tournaments) || '[]');
            cache.members = JSON.parse(localStorage.getItem(KEYS.members) || '[]');
            cache.updates = JSON.parse(localStorage.getItem(KEYS.updates) || '[]');
            renderAll();
            if (getData(KEYS.updates).length === 0) seedSampleUpdates();
        }

        // Run CWL auto-generation and cleanup checks shortly after load
        setTimeout(() => {
            autoGenerateMonthlyCWL();
            cleanupDuplicateCWL();
        }, 2000);
    }

    // ========== CLEANUP DUPLICATE CWL (one-time fix for old bug) ==========
    function cleanupDuplicateCWL() {
        const tournaments = getData(KEYS.tournaments);
        const updates = getData(KEYS.updates);

        // --- Clean up duplicate auto-generated tournaments ---
        // Group auto-generated tournaments by name
        const autoTournaments = tournaments.filter(t => t.autoGenerated);
        const nameGroups = {};
        autoTournaments.forEach(t => {
            if (!nameGroups[t.name]) nameGroups[t.name] = [];
            nameGroups[t.name].push(t);
        });

        let cleanedCount = 0;
        Object.keys(nameGroups).forEach(name => {
            const group = nameGroups[name];
            if (group.length <= 1) return; // No duplicates for this name

            // Sort by createdAt — keep the newest one
            group.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const keeper = group[0];

            // Delete all duplicates except the keeper
            for (let i = 1; i < group.length; i++) {
                deleteItem(KEYS.tournaments, group[i].id);
                cleanedCount++;
            }

            // If the keeper doesn't have a deterministic ID, migrate its members
            // to a deterministic ID. Extract month/year from the name (e.g. "CWL May 2026")
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            const match = name.match(/^CWL (\w+) (\d{4})$/);
            if (match) {
                const monthIdx = monthNames.indexOf(match[1]);
                const year = parseInt(match[2]);
                if (monthIdx >= 0) {
                    const deterministicId = `cwl_${year}_${String(monthIdx + 1).padStart(2, '0')}`;
                    if (keeper.id !== deterministicId) {
                        // Migrate: create new entry with deterministic ID, move members, delete old
                        const newEntry = { ...keeper, id: deterministicId };
                        delete newEntry._fbKey;
                        pushItem(KEYS.tournaments, newEntry);

                        // Re-assign members from old ID to new deterministic ID
                        const members = getData(KEYS.members);
                        members.filter(m => m.tournamentId === keeper.id).forEach(m => {
                            updateItem(KEYS.members, m.id, { tournamentId: deterministicId });
                        });

                        deleteItem(KEYS.tournaments, keeper.id);
                    }
                }
            }
        });

        // --- Clean up duplicate CWL announcements ---
        const cwlAnnouncements = updates.filter(u => u.category === 'cwl' && u.title && u.title.includes('Registration Open!'));
        const titleGroups = {};
        cwlAnnouncements.forEach(u => {
            if (!titleGroups[u.title]) titleGroups[u.title] = [];
            titleGroups[u.title].push(u);
        });

        Object.keys(titleGroups).forEach(title => {
            const group = titleGroups[title];
            if (group.length <= 1) return;

            // Keep the newest, delete duplicates
            group.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            for (let i = 1; i < group.length; i++) {
                deleteItem(KEYS.updates, group[i].id);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            console.log(`[CWL Cleanup] Removed ${cleanedCount} duplicate entries.`);
            if (!firebaseReady) renderAll();
        }
    }

    // ========== AUTO CWL: Opens 25th, Closes end-of-month ==========
    function autoGenerateMonthlyCWL() {
        const now = new Date();
        const currentDay = now.getDate();
        const currentMonth = now.getMonth(); // 0-indexed
        const currentYear = now.getFullYear();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        // Calculate the last day of the current month
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Registration window: 25th to last day of month (30 or 31, or 28/29 for Feb)
        const isRegistrationWindow = currentDay >= 25 && currentDay <= lastDayOfMonth;

        const tournaments = getData(KEYS.tournaments);

        // --- Outside registration window (1st–24th): AUTO-CLOSE any open auto-generated ---
        if (!isRegistrationWindow) {
            let closed = false;
            tournaments.forEach(t => {
                if (t.autoGenerated && t.status === 'open') {
                    updateItem(KEYS.tournaments, t.id, { status: 'closed' });
                    closed = true;
                }
            });
            if (closed) {
                showToast('CWL registration closed — CWL has started! ⚔️', 'info');
            }
            return;
        }

        // --- Inside registration window (25th–end of month): AUTO-OPEN ---
        // CWL is for the NEXT month
        const nextMonth = new Date(currentYear, currentMonth + 1, 1);
        const cwlMonth = nextMonth.getMonth();
        const cwlYear = nextMonth.getFullYear();
        const cwlName = `CWL ${monthNames[cwlMonth]} ${cwlYear}`;

        // Generate a DETERMINISTIC ID based on the target CWL month/year
        // This ensures the same tournament always has the same ID, preventing duplicates
        const cwlId = `cwl_${cwlYear}_${String(cwlMonth + 1).padStart(2, '0')}`;

        // Check if this specific CWL tournament already exists (by deterministic ID)
        const existingCWL = tournaments.find(t => t.id === cwlId);
        if (existingCWL) {
            // Tournament already exists — make sure it's open during the registration window
            if (existingCWL.status !== 'open') {
                updateItem(KEYS.tournaments, cwlId, { status: 'open' });
            }
            return;
        }

        // Auto-close any older open CWL tournaments from previous months
        tournaments.forEach(t => {
            if (t.autoGenerated && t.status === 'open' && t.id !== cwlId) {
                updateItem(KEYS.tournaments, t.id, { status: 'closed' });
            }
        });

        // Create the new CWL tournament with deterministic ID
        const newCWL = {
            id: cwlId,
            name: cwlName,
            date: nextMonth.toISOString().split('T')[0],
            slots: 30,
            desc: `CWL registration for ${monthNames[cwlMonth]} ${cwlYear}. Registration open from 25th until ${lastDayOfMonth}${lastDayOfMonth === 31 ? 'st' : 'th'}. Choose Serious or Lazy CWL.`,
            minTH: '8',
            status: 'open',
            autoGenerated: true,
            createdAt: now.toISOString()
        };
        pushItem(KEYS.tournaments, newCWL);

        // Post auto announcement (also with deterministic ID to prevent duplicates)
        const announcementId = `cwl_announce_${cwlYear}_${String(cwlMonth + 1).padStart(2, '0')}`;
        const updates = getData(KEYS.updates);
        const announcementExists = updates.some(u => u.id === announcementId);
        if (!announcementExists) {
            pushItem(KEYS.updates, {
                id: announcementId,
                title: `${cwlName} Registration Open!`,
                category: 'cwl',
                content: `Registration for ${cwlName} is now open! Sign up before the month ends (${lastDayOfMonth}${lastDayOfMonth === 31 ? 'st' : 'th'}). Choose Serious CWL or Lazy CWL.`,
                pinned: true,
                createdAt: now.toISOString()
            });
        }

        showToast(`${cwlName} registration is open! 🏆`, 'success');
    }

    // Seed sample updates for first visit
    function seedSampleUpdates() {
        const now = new Date();
        const samples = [
            { id: uid(), title: 'War Attack Strategy', category: 'war', content: 'All CWL participants must use both attacks within the first 12 hours. Failure to attack will result in removal from the roster.', pinned: false, createdAt: now.toISOString() },
            { id: uid(), title: 'Donation Requirements', category: 'donate', content: 'Minimum 500 donations per season to maintain elder status. Only donate max-level troops to war CCs during CWL.', pinned: false, createdAt: now.toISOString() },
            { id: uid(), title: 'Clan Games Starting Soon', category: 'event', content: 'Clan Games begin next week. Every member must complete at least 2,000 points to earn full rewards.', pinned: false, createdAt: now.toISOString() }
        ];
        samples.forEach(s => pushItem(KEYS.updates, s));
        if (!firebaseReady) renderAll();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
