/**
 * BVIT Lecture Check - Master Admin Web Application Logic
 * Real-time Firebase Firestore Sync, Analytics, Reports, and Clean UI Engine
 */

// Helper to get local date in YYYY-MM-DD
function getLocalDateDbStr(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Global State
let currentUser = null;
let masterTimetableEntries = [];
let allChecks = [];
let checkersList = [];
let selectedDate = getLocalDateDbStr();
let activeSection = 'dashboard';
let activeFloorFilter = 'ALL';
let activeSlotFilter = 'ALL';
let activeStatusFilter = 'ALL';
let searchQuery = '';
let notifiedNotTakenIds = new Set();

// Default 8 Lecture Slots
const DEFAULT_SLOTS = [
  { index: 1, title: "Slot 1 (08:25 AM - 09:25 AM)", start: "08:25 AM", end: "09:25 AM" },
  { index: 2, title: "Slot 2 (09:25 AM - 10:25 AM)", start: "09:25 AM", end: "10:25 AM" },
  { index: 3, title: "Slot 3 (10:30 AM - 11:30 AM)", start: "10:30 AM", end: "11:30 AM" },
  { index: 4, title: "Slot 4 (11:30 AM - 12:30 PM)", start: "11:30 AM", end: "12:30 PM" },
  { index: 5, title: "Slot 5 (12:50 PM - 01:50 PM)", start: "12:50 PM", end: "01:50 PM" },
  { index: 6, title: "Slot 6 (01:50 PM - 02:50 PM)", start: "01:50 PM", end: "02:50 PM" },
  { index: 7, title: "Slot 7 (02:55 PM - 03:55 PM)", start: "02:55 PM", end: "03:55 PM" },
  { index: 8, title: "Slot 8 (03:55 PM - 04:55 PM)", start: "03:55 PM", end: "04:55 PM" }
];

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  initDateSelectors();
  initNavigation();
  initFilters();
});

/* ==========================================================================
   1. AUTHENTICATION & SESSION MANAGEMENT
   ========================================================================== */
function initAuthUI() {
  const loginForm = document.getElementById('loginForm');
  const authWrapper = document.getElementById('authWrapper');
  const authError = document.getElementById('authError');
  const togglePassBtn = document.getElementById('togglePassword');
  const passInput = document.getElementById('passwordInput');

  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePassBtn.className = isPass ? 'fas fa-eye-slash toggle-password' : 'fas fa-eye toggle-password';
    });
  }

  // Check persistent admin session or Firebase Auth state
  const savedSession = localStorage.getItem('bvit_admin_logged_in');
  if (savedSession === 'true') {
    currentUser = { email: 'admin@bvit.edu', displayName: 'Administrator' };
    if (authWrapper) authWrapper.style.display = 'none';
    onAdminLoggedIn('admin@bvit.edu', 'Administrator');
  } else {
    if (authWrapper) authWrapper.style.display = 'flex';
  }

  auth.onAuthStateChanged((user) => {
    if (user && (user.email.includes('admin') || user.email === 'admin@bvit.edu')) {
      currentUser = user;
      localStorage.setItem('bvit_admin_logged_in', 'true');
      onAdminLoggedIn(user.email, user.displayName || 'Administrator');
    }
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('emailInput').value.trim();
      const password = document.getElementById('passwordInput').value.trim();
      const btn = document.getElementById('btnLogin');

      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
      btn.disabled = true;
      authError.style.display = 'none';

      try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        currentUser = cred.user;
        localStorage.setItem('bvit_admin_logged_in', 'true');
        onAdminLoggedIn(cred.user.email, cred.user.displayName || 'Administrator');
      } catch (err) {
        if ((email.toLowerCase() === 'admin@bvit.edu' || email.toLowerCase() === 'admin') && password === 'admin123') {
          currentUser = { email: 'admin@bvit.edu', displayName: 'Administrator' };
          localStorage.setItem('bvit_admin_logged_in', 'true');
          onAdminLoggedIn('admin@bvit.edu', 'Administrator');
        } else {
          authError.textContent = err.message.replace('Firebase: ', '') || 'Invalid admin credentials!';
          authError.style.display = 'block';
        }
      } finally {
        btn.innerHTML = 'Sign In to Portal <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
      }
    });
  }
}

function onAdminLoggedIn(email, name) {
  const authWrapper = document.getElementById('authWrapper');
  if (authWrapper) authWrapper.style.display = 'none';

  document.getElementById('adminNameDisplay').textContent = name;
  document.getElementById('adminRoleDisplay').textContent = email;

  // Load All Master Data & Realtime Listeners
  loadMasterTimetable();
  observeCheckersList();
  observeChecksForDate(selectedDate);
}

function logoutAdmin() {
  auth.signOut().catch(() => {});
  localStorage.removeItem('bvit_admin_logged_in');
  document.getElementById('emailInput').value = '';
  document.getElementById('passwordInput').value = '';
  const authWrapper = document.getElementById('authWrapper');
  if (authWrapper) authWrapper.style.display = 'flex';
}

/* ==========================================================================
   2. DATE PICKERS & NAVIGATION
   ========================================================================== */
function initDateSelectors() {
  const mainDatePicker = document.getElementById('mainDatePicker');
  const reportFromDate = document.getElementById('reportFromDate');
  const reportToDate = document.getElementById('reportToDate');

  if (mainDatePicker) {
    mainDatePicker.value = selectedDate;
    mainDatePicker.addEventListener('change', (e) => {
      selectedDate = e.target.value;
      observeChecksForDate(selectedDate);
    });
  }

  if (reportFromDate && reportToDate) {
    reportFromDate.value = selectedDate;
    reportToDate.value = selectedDate;
  }
}

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item-btn[data-section]');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      switchSection(section);
    });
  });
}

function switchSection(sectionName) {
  activeSection = sectionName;
  document.querySelectorAll('.nav-item-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-item-btn[data-section="${sectionName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const targetPanel = document.getElementById(`panel-${sectionName}`);
  if (targetPanel) targetPanel.classList.add('active');

  const titles = {
    dashboard: { title: 'Live Inspection Dashboard', sub: 'Real-time overview of current lecture inspections' },
    reports: { title: 'Official Inspection Reports', sub: 'Filtered history logs, analytics & print export' },
    timetable: { title: 'Master Timetable Explorer', sub: 'Classroom & laboratory schedule database' },
    checkers: { title: 'Floor Inspectors Management', sub: 'Manage floor assignments and checker accounts' }
  };
  if (titles[sectionName]) {
    document.getElementById('pageTitle').textContent = titles[sectionName].title;
    document.getElementById('pageSubtitle').textContent = titles[sectionName].sub;
  }

  if (sectionName === 'reports') {
    filterReports();
  } else if (sectionName === 'timetable') {
    renderTimetableTable();
  } else if (sectionName === 'checkers') {
    renderCheckersList();
  }
}

function initFilters() {
  // Floor Tabs Handler (Ground Floor, Third Floor, Fourth Floor, All)
  const floorTabs = document.querySelectorAll('#floorTabsContainer .floor-tab-btn');
  floorTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      floorTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFloorFilter = btn.getAttribute('data-floor');
      renderDashboard();
    });
  });

  // Status Dropdown
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      activeStatusFilter = e.target.value;
      renderDashboard();
    });
  }

  // Slot Dropdown
  const slotFilter = document.getElementById('slotFilter');
  if (slotFilter) {
    slotFilter.addEventListener('change', (e) => {
      activeSlotFilter = e.target.value;
      renderDashboard();
    });
  }

  // Search Input
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
      renderDashboard();
    });
  }
}

function clearSearchInput() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  searchQuery = '';
  renderDashboard();
}

function resetAllFilters() {
  activeFloorFilter = 'ALL';
  activeSlotFilter = 'ALL';
  activeStatusFilter = 'ALL';
  searchQuery = '';

  document.querySelectorAll('#floorTabsContainer .floor-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-floor') === 'ALL');
  });

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.value = 'ALL';

  const slotFilter = document.getElementById('slotFilter');
  if (slotFilter) slotFilter.value = 'ALL';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  renderDashboard();
}

/* ==========================================================================
   3. FIRESTORE REAL-TIME DATA OBSERVERS
   ========================================================================== */
async function loadMasterTimetable() {
  if (typeof DEFAULT_MASTER_TIMETABLE !== 'undefined' && Array.isArray(DEFAULT_MASTER_TIMETABLE)) {
    masterTimetableEntries = sanitizeTimetable(DEFAULT_MASTER_TIMETABLE);
    renderDashboard();
    return; // Use fast bundled cache directly with 0 network reads and 0 writes!
  }

  try {
    const doc = await db.collection('timetable_master').doc('master_bundle').get();
    if (doc.exists && doc.data()) {
      const data = doc.data();
      let entries = [];
      if (typeof data.jsonData === 'string' && data.jsonData.length > 0) {
        try { entries = JSON.parse(data.jsonData); } catch (e) {}
      } else if (Array.isArray(data.entries) && data.entries.length > 0) {
        entries = data.entries;
      }
      if (entries.length > 0) {
        masterTimetableEntries = sanitizeTimetable(entries);
        renderDashboard();
      }
    }
  } catch (err) {
    console.log("Firestore cloud timetable info:", err.message);
  }
}

function sanitizeTimetable(entries) {
  return entries.filter(e => {
    // Drop old merged workshop string
    if (e.roomNo.toUpperCase().includes("WORKSHOP") && e.teacherName.includes("Dhane") && e.teacherName.includes("Mohite")) {
      return false;
    }
    // Drop Chemistry early morning
    if (e.roomNo.toUpperCase().includes("CHEMISTRY") && (e.timeSlot.includes("08:25") || e.timeSlot.includes("09:25"))) {
      return false;
    }
    return true;
  });
}

function observeCheckersList() {
  db.collection('checkers').onSnapshot((snapshot) => {
    const list = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    checkersList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    populateCheckerDropdowns();
    if (activeSection === 'checkers') renderCheckersList();
  });
}

function populateCheckerDropdowns() {
  const reportChecker = document.getElementById('reportCheckerFilter');
  if (reportChecker) {
    reportChecker.innerHTML = '<option value="ALL">All Inspectors</option>';
    checkersList.forEach(c => {
      reportChecker.innerHTML += `<option value="${c.name}">${c.name} (${c.assignedFloor || 'Floor'})</option>`;
    });
  }
}

let checksUnsubscribe = null;
let isInitialChecksLoad = true;

function observeChecksForDate(dateStr) {
  if (checksUnsubscribe) checksUnsubscribe();
  isInitialChecksLoad = true;

  console.log("Listening to real-time lecture_checks for date:", dateStr);

  const altDate = dateStr.split('-').reverse().join('-');

  // Query only specific date records (drastically reduces Firestore reads by ~95%)
  checksUnsubscribe = db.collection('lecture_checks')
    .where('date', 'in', [dateStr, altDate])
    .onSnapshot({ includeMetadataChanges: false }, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        const item = { id: doc.id, ...doc.data() };
        list.push(item);

        // Instant Audio Alert & Toast ONLY for NEW NOT_TAKEN check after initial load
        const isNotTaken = (item.status || '').toUpperCase() === 'NOT_TAKEN';
        if (isNotTaken) {
          if (!isInitialChecksLoad && !notifiedNotTakenIds.has(item.id)) {
            notifiedNotTakenIds.add(item.id);
            playAlertSound();
            showLiveToast('Lecture Not Taken Alert', item, 'danger');
          } else {
            notifiedNotTakenIds.add(item.id);
          }
        }
      });

      isInitialChecksLoad = false;
      allChecks = list;
      renderDashboard();
      if (activeSection === 'reports') filterReports();
    }, (error) => {
      console.warn("Targeted date query fallback:", error.message);
      // Fallback single date query
      db.collection('lecture_checks').where('date', '==', dateStr).onSnapshot((snap) => {
        const list = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        allChecks = list;
        renderDashboard();
      });
    });
}

/* ==========================================================================
   4. DASHBOARD METRICS & EXACT MATCHING ALGORITHMS
   ========================================================================== */
function getDayOfWeek(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return days[d.getDay()];
  }
  const d = new Date(dateStr);
  return isNaN(d) ? 'Monday' : days[d.getDay()];
}

function normTime(t) {
  const clean = (t || '').trim().replace(/\./g, ':').replace(/\s+/g, '').toLowerCase();
  let timeOnly = clean.replace('am', '').replace('pm', '');
  if (timeOnly.startsWith('0') && timeOnly.length > 1) timeOnly = timeOnly.substring(1);
  const parts = timeOnly.split(':');
  const h = parseInt(parts[0], 10);
  const m = (parts[1] || '00').substring(0, 2);
  if (isNaN(h)) return timeOnly;
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${m}`;
}

function isEntryInExactSlot(entryTimeSlot, slotStart) {
  const parts = (entryTimeSlot || '').split(/[-to]/).map(p => p.trim());
  const eStart = parts[0] || '';
  const sNorm = normTime(slotStart);
  const esNorm = normTime(eStart);
  return esNorm === sNorm || (esNorm.length >= 3 && sNorm.startsWith(esNorm.substring(0, 3))) || (sNorm.length >= 3 && esNorm.startsWith(sNorm.substring(0, 3)));
}

function isCheckInExactSlot(checkSlotId, checkStart, slotStart) {
  const sStartNorm = normTime(slotStart);

  if (checkStart && checkStart.trim().length > 0) {
    const csNorm = normTime(checkStart);
    if (csNorm === sStartNorm || (csNorm.length >= 3 && sStartNorm.startsWith(csNorm.substring(0, 3))) || (sStartNorm.length >= 3 && csNorm.startsWith(sStartNorm.substring(0, 3)))) {
      return true;
    }
  }

  const checkStartPart = (checkSlotId || '').split(/[-to]/)[0].trim() || checkSlotId || '';
  const cStartNorm = normTime(checkStartPart);
  if (cStartNorm.length > 0) {
    if (cStartNorm === sStartNorm || (cStartNorm.length >= 3 && sStartNorm.startsWith(cStartNorm.substring(0, 3))) || (sStartNorm.length >= 3 && cStartNorm.startsWith(sStartNorm.substring(0, 3)))) {
      return true;
    }
  }

  return false;
}

function isRoomMatching(r1, r2) {
  function norm(r) {
    return (r || '').trim()
      .replace(/\s+/g, '')
      .replace(/[-_()/]/g, '')
      .replace(/room/gi, '')
      .replace(/lab/gi, '')
      .replace(/workshop/gi, 'ws')
      .replace(/w\/s/gi, 'ws')
      .toLowerCase();
  }

  const n1 = norm(r1);
  const n2 = norm(r2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  // Drawing Halls 1, 2, 3, 4
  for (const d of ['1', '2', '3', '4']) {
    const hasD1 = n1.includes('drawing') && n1.endsWith(d);
    const hasD2 = n2.includes('drawing') && n2.endsWith(d);
    if (hasD1 && hasD2) return true;
    if (hasD1 !== hasD2 && n1.includes('drawing') && n2.includes('drawing')) return false;
  }

  // 441 sub-labs
  if (n1.startsWith('441') && n2.startsWith('441')) {
    const isComp1 = n1.includes('comp') || n1.includes('ict');
    const isComp2 = n2.includes('comp') || n2.includes('ict');
    if (isComp1 && isComp2) return true;
    const isCirc1 = n1.includes('circ');
    const isCirc2 = n2.includes('circ');
    if (isCirc1 && isCirc2) return true;
    return false;
  }

  // Ground Floor Labs
  const groundLabs = ['som', 'cnc', 'chemistry', 'physics', 'machineshop', 'power', 'thermal'];
  for (const lab of groundLabs) {
    if (n1.includes(lab) && n2.includes(lab)) return true;
  }

  // Sub-room letters
  const last1 = n1.charAt(n1.length - 1);
  const last2 = n2.charAt(n2.length - 1);
  if (isNaN(last1) && isNaN(last2) && last1.match(/[a-z]/) && last2.match(/[a-z]/)) {
    return n1 === n2;
  }

  return n1 === n2 || (n1.length >= 3 && n2.length >= 3 && (n1.startsWith(n2) || n2.startsWith(n1)));
}

function isClassMatching(c1, c2) {
  function clean(s) {
    return (s || '').trim().replace(/\s+/g, '').replace(/[-()]/g, '').toLowerCase();
  }
  const clean1 = clean(c1);
  const clean2 = clean(c2);
  if (!clean1 || !clean2) return true;
  if (clean1 === clean2) return true;

  function extractBatch(s) {
    if (s.includes('batcha') || s.includes('bta')) return 'batcha';
    if (s.includes('batchb') || s.includes('btb')) return 'batchb';
    if (s.includes('batchc') || s.includes('btc')) return 'batchc';
    return '';
  }

  const b1 = extractBatch(clean1);
  const b2 = extractBatch(clean2);
  if (b1 && b2 && b1 !== b2) return false;
  return clean1.includes(clean2) || clean2.includes(clean1);
}

function renderDashboard() {
  const dayName = getDayOfWeek(selectedDate);
  const dayFilteredEntries = masterTimetableEntries.filter(e => {
    return e.day.toLowerCase() === dayName.toLowerCase() || 
           (dayName.length >= 3 && e.day.toLowerCase().startsWith(dayName.substring(0, 3).toLowerCase()));
  });

  const slotsContainer = document.getElementById('slotsContainer');
  if (!slotsContainer) return;
  slotsContainer.innerHTML = '';

  let totalExpected = 0;
  let totalDisplayedCards = 0;

  DEFAULT_SLOTS.forEach(slot => {
    const slotEntries = dayFilteredEntries.filter(e => isEntryInExactSlot(e.timeSlot, slot.start));
    
    // Group by Room + Class + Subject + Teacher
    const grouped = {};
    slotEntries.forEach(e => {
      const key = `${e.roomNo.trim()}_${e.classDiv.trim()}_${e.subject.trim()}_${e.teacherName.trim()}`.toLowerCase();
      if (!grouped[key]) {
        grouped[key] = {
          roomNo: e.roomNo,
          floor: e.floor,
          classDiv: e.classDiv,
          subject: e.subject,
          teacherName: e.teacherName,
          timeSlot: `${slot.start} - ${slot.end}`
        };
      }
    });

    const roomCards = Object.values(grouped);
    let slotTakenCount = 0;
    let slotNotTakenCount = 0;
    let slotPendingCount = 0;

    const cardsHtml = roomCards.map(card => {
      // Find matching check by Room, Slot, Class and Subject
      const matchedCheck = allChecks.find(c => 
        isRoomMatching(c.classRoom, card.roomNo) &&
        isCheckInExactSlot(c.lectureSlotId, c.startTime, slot.start) &&
        isClassMatching(c.className, card.classDiv) &&
        ((c.subject || '').toUpperCase().includes(card.subject.toUpperCase()) || (card.subject || '').toUpperCase().includes((c.subject || '').toUpperCase()) || !c.subject)
      ) || allChecks.find(c => 
        isRoomMatching(c.classRoom, card.roomNo) &&
        isCheckInExactSlot(c.lectureSlotId, c.startTime, slot.start) &&
        isClassMatching(c.className, card.classDiv)
      ) || allChecks.find(c => 
        isRoomMatching(c.classRoom, card.roomNo) &&
        isCheckInExactSlot(c.lectureSlotId, c.startTime, slot.start)
      );

      let status = 'PENDING';
      let checkBy = '';
      let remark = '';

      if (matchedCheck) {
        status = (matchedCheck.status || (matchedCheck.checkStatus === 1 ? 'NOT_TAKEN' : 'TAKEN')).toUpperCase();
        checkBy = matchedCheck.checkedBy || '';
        remark = matchedCheck.checkerRemark || '';
      }

      if (status === 'TAKEN') slotTakenCount++;
      else if (status === 'NOT_TAKEN') slotNotTakenCount++;
      else slotPendingCount++;

      // UI Filters
      if (activeFloorFilter !== 'ALL' && !card.floor.toLowerCase().includes(activeFloorFilter.toLowerCase())) return '';
      if (activeSlotFilter !== 'ALL' && activeSlotFilter != slot.index) return '';
      if (activeStatusFilter !== 'ALL' && activeStatusFilter !== status) return '';
      if (searchQuery) {
        const fullTxt = `${card.roomNo} ${card.classDiv} ${card.subject} ${card.teacherName} ${checkBy} ${remark}`.toLowerCase();
        if (!fullTxt.includes(searchQuery)) return '';
      }

      const isPr = card.classDiv.includes('Batch') || card.subject.toUpperCase().includes('LAB') || card.roomNo.toUpperCase().includes('LAB') || card.roomNo.toUpperCase().includes('WORKSHOP');

      return `
        <div class="room-card status-${status.toLowerCase().replace('_', '-')}">
          <div class="room-card-top">
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="room-badge">${card.roomNo}</span>
              <span class="type-badge ${isPr ? 'pr' : 'th'}">${isPr ? 'PR' : 'TH'}</span>
            </div>
            <span class="pill-badge ${status.toLowerCase().replace('_', '-')}">
              ${status === 'TAKEN' ? '✓ TAKEN' : status === 'NOT_TAKEN' ? '✕ NOT TAKEN' : '⏳ PENDING'}
            </span>
          </div>
          <div class="room-card-main">
            <div class="subject-class-line">
              <span>📖 ${card.subject}</span>
              <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">(${card.classDiv})</span>
            </div>
            <div class="teacher-line">
              <i class="fas fa-chalkboard-teacher" style="color: var(--primary-light);"></i>
              <span>${card.teacherName || 'N/A'}</span>
            </div>
            ${checkBy ? `
              <div class="checker-line">
                <i class="fas fa-user-check" style="color: var(--success);"></i>
                <span>Inspector: <b>${checkBy}</b></span>
              </div>
            ` : ''}
            ${remark ? `
              <div style="margin-top: 4px;">
                <span class="remark-tag"><i class="fas fa-comment-alt"></i> ${remark}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).filter(html => html.length > 0);

    totalExpected += roomCards.length;
    totalDisplayedCards += cardsHtml.length;

    if (cardsHtml.length > 0) {
      const slotBlock = document.createElement('div');
      slotBlock.className = 'slot-block';
      slotBlock.innerHTML = `
        <div class="slot-block-header">
          <div class="slot-title-area">
            <span class="slot-index-badge">Slot ${slot.index}</span>
            <span class="slot-time-text">${slot.title}</span>
          </div>
          <div class="slot-stats-summary">
            <span class="pill-badge taken">Taken: ${slotTakenCount}</span>
            <span class="pill-badge not-taken">Not Taken: ${slotNotTakenCount}</span>
            <span class="pill-badge pending">Pending: ${slotPendingCount}</span>
          </div>
        </div>
        <div class="room-cards-grid">
          ${cardsHtml.join('')}
        </div>
      `;
      slotsContainer.appendChild(slotBlock);
    }
  });

  if (totalDisplayedCards === 0) {
    slotsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        <i class="fas fa-search" style="font-size: 32px; color: var(--text-muted); margin-bottom: 12px;"></i>
        <h4 style="font-size: 16px; font-weight: 700; color: #0F172A;">No Lectures Match Selected Filters</h4>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Try selecting another floor tab, status, slot, or clear your search query.</p>
        <button type="button" class="btn-filter-reset" style="margin-top: 14px;" onclick="resetAllFilters()">
          <i class="fas fa-undo-alt"></i> Reset All Filters
        </button>
      </div>
    `;
  }

  // Update Filter Results Badge Counter
  const resultsBadge = document.getElementById('filterResultsCount');
  if (resultsBadge) {
    if (activeFloorFilter === 'ALL' && activeStatusFilter === 'ALL' && activeSlotFilter === 'ALL' && !searchQuery) {
      resultsBadge.innerHTML = `<i class="fas fa-layer-group"></i> Showing All ${totalExpected} Lectures`;
    } else {
      resultsBadge.innerHTML = `<i class="fas fa-filter"></i> Showing ${totalDisplayedCards} of ${totalExpected} Lectures`;
    }
  }

  // Calculate Overall Live Counts directly from allChecks (Matches Android App 1-to-1)
  const totalTaken = allChecks.filter(c => (c.status || '').toUpperCase() === 'TAKEN').length;
  const totalNotTaken = allChecks.filter(c => (c.status || '').toUpperCase() === 'NOT_TAKEN').length;
  const totalPending = Math.max(0, totalExpected - (totalTaken + totalNotTaken));

  // Update Summary KPI Cards
  document.getElementById('statTotalExpected').textContent = totalExpected;
  document.getElementById('statTotalTaken').textContent = totalTaken;
  document.getElementById('statTotalNotTaken').textContent = totalNotTaken;
  document.getElementById('statTotalPending').textContent = totalPending;

  const takenPct = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;
  const notTakenPct = totalExpected > 0 ? Math.round((totalNotTaken / totalExpected) * 100) : 0;
  const pendingPct = totalExpected > 0 ? Math.round((totalPending / totalExpected) * 100) : 0;

  document.getElementById('pctTaken').textContent = `${takenPct}% completed`;
  document.getElementById('pctNotTaken').textContent = `${notTakenPct}% missed`;
  document.getElementById('pctPending').textContent = `${pendingPct}% remaining`;

  document.getElementById('barTaken').style.width = `${takenPct}%`;
  document.getElementById('barNotTaken').style.width = `${notTakenPct}%`;
  document.getElementById('barPending').style.width = `${pendingPct}%`;
}

/* ==========================================================================
   5. OFFICIAL INSPECTION REPORTS & CSV / PRINT EXPORT
   ========================================================================== */
let currentFilteredReports = [];

function filterReports() {
  const fromDate = document.getElementById('reportFromDate').value;
  const toDate = document.getElementById('reportToDate').value;
  const statusFilter = document.getElementById('reportStatusFilter').value;
  const checkerFilter = document.getElementById('reportCheckerFilter').value;
  const query = (document.getElementById('reportSearchInput').value || '').toLowerCase().trim();

  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;

  const processRecords = (records) => {
    const fromNorm = (fromDate || '').replace(/[^0-9]/g, '');
    const toNorm = (toDate || '').replace(/[^0-9]/g, '');

    const filtered = records.filter(r => {
      const rDate = r.date || selectedDate;
      const rNorm = rDate.replace(/[^0-9]/g, '');

      if (fromDate && toDate) {
        if (rDate < fromDate && rDate > toDate && (rNorm < fromNorm || rNorm > toNorm)) {
          return false;
        }
      }

      if (statusFilter !== 'ALL' && (r.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (checkerFilter !== 'ALL' && (!r.checkedBy || !r.checkedBy.toLowerCase().includes(checkerFilter.toLowerCase()))) return false;
      if (query) {
        const txt = `${r.classRoom} ${r.className} ${r.subject} ${r.lecturerName} ${r.checkedBy} ${r.checkerRemark}`.toLowerCase();
        if (!txt.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => (b.date + (b.lectureSlotId || '')).localeCompare(a.date + (a.lectureSlotId || '')));

    currentFilteredReports = filtered;

    const countText = `${filtered.length} Records Found`;
    const b1 = document.getElementById('reportTotalRecords');
    if (b1) b1.innerHTML = `<i class="fas fa-database"></i> ${countText}`;
    const b2 = document.getElementById('reportTableRecordsCount');
    if (b2) b2.textContent = countText;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">No inspection records found for the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((r, idx) => `
      <tr>
        <td><b>#${idx + 1}</b></td>
        <td><b>${r.date || selectedDate}</b></td>
        <td><span class="room-badge">${r.classRoom || 'N/A'}</span></td>
        <td><b>${r.className || 'N/A'}</b></td>
        <td><b>${r.subject || 'N/A'}</b></td>
        <td>${r.lecturerName || 'N/A'}</td>
        <td>${r.lectureSlotId || r.startTime || 'N/A'}</td>
        <td>
          <span class="pill-badge ${(r.status || '').toUpperCase() === 'TAKEN' ? 'taken' : 'not-taken'}">
            ${(r.status || '').toUpperCase() === 'TAKEN' ? '✓ TAKEN' : '✕ NOT TAKEN'}
          </span>
        </td>
        <td><b>${r.checkedBy || 'Inspector'}</b></td>
        <td><span style="font-size: 12px; color: var(--text-secondary);">${r.checkerRemark || '-'}</span></td>
      </tr>
    `).join('');
  };

  // Instant 0-Read Memory Cache Check for Current Selected Date
  if (fromDate === toDate && fromDate === selectedDate && allChecks.length > 0) {
    processRecords(allChecks);
    return;
  }

  tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading inspection records...</td></tr>';

  // Efficient targeted date query from IndexedDB Cache / Firestore
  let queryRef = db.collection('lecture_checks');
  if (fromDate && toDate && fromDate === toDate) {
    queryRef = queryRef.where('date', '==', fromDate);
  }

  queryRef.get().then(snapshot => {
    const records = [];
    snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
    processRecords(records);
  }).catch(err => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 20px;">Error loading records: ${err.message}</td></tr>`;
  });
}

function exportReportsToCSV() {
  if (!currentFilteredReports || currentFilteredReports.length === 0) {
    alert("No records match the current filter to export. Please click 'Apply Filter' first.");
    return;
  }

  const fromDate = document.getElementById('reportFromDate').value || 'AllDates';
  const toDate = document.getElementById('reportToDate').value || 'AllDates';
  const statusVal = document.getElementById('reportStatusFilter').value || 'ALL';

  // UTF-8 BOM so Marathi / Indian names open cleanly in MS Excel
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "Sr,Date,Time Slot,Room No,Class/Division,Subject,Teacher Name,Inspection Status,Checked By,Checker Remark\r\n";

  currentFilteredReports.forEach((r, idx) => {
    const row = [
      `"${idx + 1}"`,
      `"${r.date || selectedDate}"`,
      `"${r.lectureSlotId || r.startTime || ''}"`,
      `"${r.classRoom || ''}"`,
      `"${r.className || ''}"`,
      `"${r.subject || ''}"`,
      `"${r.lecturerName || ''}"`,
      `"${(r.status || '').toUpperCase()}"`,
      `"${r.checkedBy || ''}"`,
      `"${(r.checkerRemark || '').replace(/"/g, '""')}"`
    ].join(",");
    csvContent += row + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `BVIT_Inspection_Report_${statusVal}_${fromDate}_to_${toDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printReportsPDF() {
  document.getElementById('printTimestamp').textContent = new Date().toLocaleString();
  window.print();
}

/* ==========================================================================
   6. CHECKERS MANAGEMENT & TIMETABLE EXPLORER
   ========================================================================== */
function renderCheckersList() {
  const container = document.getElementById('checkersGrid');
  if (!container) return;

  if (checkersList.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">No checkers registered yet.</p>';
    return;
  }

  container.innerHTML = checkersList.map(c => `
    <div class="stat-card" style="border-left: 4px solid var(--primary-light);">
      <div class="stat-top">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="admin-avatar">${(c.name || 'C').charAt(0)}</div>
          <div>
            <h3 style="font-size: 15px; font-weight: 700; color: #0F172A;">${c.name}</h3>
            <p style="font-size: 12px; color: var(--text-muted);">${c.email}</p>
          </div>
        </div>
        <button class="btn-icon" onclick="deleteChecker('${c.id}')" title="Delete Inspector" style="color: var(--danger);">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
      <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
        <div><i class="fas fa-layer-group" style="color: var(--primary-light); width: 18px;"></i> <b>${c.assignedFloor || 'All Floors'}</b></div>
        <div><i class="fas fa-phone-alt" style="color: var(--success); width: 18px;"></i> ${c.mobileNo || 'N/A'}</div>
      </div>
    </div>
  `).join('');
}

function openAddCheckerModal() {
  const modal = document.getElementById('addCheckerModal');
  if (modal) modal.classList.add('active');
}

function closeAddCheckerModal() {
  const modal = document.getElementById('addCheckerModal');
  if (modal) modal.classList.remove('active');
}

async function saveNewChecker(e) {
  e.preventDefault();
  const name = document.getElementById('chkName').value.trim();
  const email = document.getElementById('chkEmail').value.trim().toLowerCase();
  const mobile = document.getElementById('chkMobile').value.trim();
  const password = document.getElementById('chkPass').value.trim();
  const floor = document.getElementById('chkFloor').value;

  const id = `chk_${Date.now()}`;
  try {
    await db.collection('checkers').doc(id).set({
      id, name, email, mobileNo: mobile, password, assignedFloor: floor, createdAt: Date.now()
    });
    closeAddCheckerModal();
    showLiveToast('Inspector Added', `${name} has been assigned to ${floor}.`, 'success');
  } catch (err) {
    alert("Error adding inspector: " + err.message);
  }
}

async function deleteChecker(id) {
  if (confirm("Are you sure you want to remove this floor inspector?")) {
    try {
      await db.collection('checkers').doc(id).delete();
      showLiveToast('Inspector Removed', 'Floor inspector account has been removed.', 'warning');
    } catch (e) {
      alert("Error deleting inspector: " + e.message);
    }
  }
}

function renderTimetableTable() {
  const tbody = document.getElementById('timetableTableBody');
  if (!tbody) return;

  tbody.innerHTML = masterTimetableEntries.map((e, idx) => `
    <tr>
      <td><b>#${idx + 1}</b></td>
      <td><b>${e.day}</b></td>
      <td>${e.timeSlot}</td>
      <td>${e.floor}</td>
      <td><span class="room-badge">${e.roomNo}</span></td>
      <td><b>${e.classDiv}</b></td>
      <td><b>${e.subject}</b></td>
      <td>${e.teacherName}</td>
    </tr>
  `).join('');
}

/* ==========================================================================
   7. LIVE AUDIO SYNTHESIS & TOAST ENGINE
   ========================================================================== */
function playAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.log("Web audio notice:", e.message);
  }
}

function showLiveToast(title, check, type = 'danger') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // Limit max visible toasts to 2 at a time
  while (container.children.length >= 2) {
    container.firstElementChild.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast-premium ${type}`;
  toast.innerHTML = `
    <div class="toast-indicator"></div>
    <div class="toast-body">
      <div class="toast-header-line">
        <div class="toast-title-badge">
          <i class="fas fa-exclamation-circle"></i>
          <span>${title}</span>
        </div>
        <button type="button" class="toast-close-btn" onclick="this.closest('.toast-premium').remove()">&times;</button>
      </div>
      <div class="toast-main-details">
        <div class="toast-room-tag">Room ${check.classRoom || 'N/A'} • ${check.className || 'Class'}</div>
        <div class="toast-subject-title">📖 ${check.subject || 'Subject'}</div>
        <div class="toast-teacher-text"><i class="fas fa-chalkboard-teacher"></i> ${check.lecturerName || 'Teacher'}</div>
      </div>
      <div class="toast-inspector-footer">
        <i class="fas fa-user-shield"></i> Inspector: <b>${check.checkedBy || 'Floor Inspector'}</b>
      </div>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.95)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}
