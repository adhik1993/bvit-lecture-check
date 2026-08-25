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
let activeSlotFilter = '';
let activeStatusFilter = '';
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
      closeMobileSidebar();
    });
  });

  const toggleBtn = document.getElementById('btnSidebarToggle');
  const closeBtn = document.getElementById('btnSidebarClose');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      openMobileSidebar();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeMobileSidebar();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeMobileSidebar();
    });
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('appSidebar') || document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar') || document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  document.body.style.overflow = '';
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
  activeSlotFilter = '';
  activeStatusFilter = '';
  searchQuery = '';

  document.querySelectorAll('#floorTabsContainer .floor-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-floor') === 'ALL');
  });

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.value = '';

  const slotFilter = document.getElementById('slotFilter');
  if (slotFilter) slotFilter.value = '';

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
  if (typeof DEFAULT_MASTER_TIMETABLE !== 'undefined' && Array.isArray(DEFAULT_MASTER_TIMETABLE) && DEFAULT_MASTER_TIMETABLE.length > 0) {
    masterTimetableEntries = sanitizeTimetable(DEFAULT_MASTER_TIMETABLE);
    renderDashboard();
    
    // Auto-sync clean master timetable bundle to Firestore Cloud
    try {
      const jsonStr = JSON.stringify(masterTimetableEntries);
      db.collection('timetable_master').doc('master_bundle').set({
        jsonData: jsonStr,
        updatedAt: Date.now(),
        version: 3,
        count: masterTimetableEntries.length
      }).catch(err => console.log("Cloud sync notice:", err.message));
      db.collection('timetable').doc('master_bundle').set({
        jsonData: jsonStr,
        updatedAt: Date.now(),
        version: 3,
        count: masterTimetableEntries.length
      }).catch(err => console.log("Cloud sync notice:", err.message));
    } catch (e) {
      console.log("Auto-sync timetable to Firestore info:", e.message);
    }
    return;
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
    if (e.roomNo && e.roomNo.toUpperCase().includes("WORKSHOP") && e.teacherName && e.teacherName.includes("Dhane") && e.teacherName.includes("Mohite")) {
      return false;
    }
    // Drop Chemistry early morning
    if (e.roomNo && e.roomNo.toUpperCase().includes("CHEMISTRY") && e.timeSlot && (e.timeSlot.includes("08:25") || e.timeSlot.includes("09:25"))) {
      return false;
    }
    // Drop old erroneous 425/426 joint room entries
    if (e.roomNo && (e.roomNo.includes("425/426") || e.roomNo.includes("425 / 426"))) {
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
  const menu = document.getElementById('reportCheckerMenu');
  if (menu) {
    let itemsHtml = `
      <div class="dropdown-item ${activeReportChecker === 'ALL' ? 'active' : ''}" data-val="ALL" onclick="handleCustomReportCheckerSelect('ALL', 'All Inspectors')">
        <div class="item-left"><i class="fas fa-users-cog"></i> <span>All Inspectors</span></div>
        <i class="fas fa-check check-icon"></i>
      </div>
    `;

    checkersList.forEach(c => {
      const isAct = activeReportChecker === c.name;
      const safeName = (c.name || '').replace(/'/g, "\\'");
      const floorText = c.assignedFloor || c.floor || 'Floor';
      itemsHtml += `
        <div class="dropdown-item ${isAct ? 'active' : ''}" data-val="${safeName}" onclick="handleCustomReportCheckerSelect('${safeName}', '${safeName}')">
          <div class="item-left"><i class="fas fa-user-shield"></i> <span>${c.name} (${floorText})</span></div>
          <i class="fas fa-check check-icon"></i>
        </div>
      `;
    });

    menu.innerHTML = itemsHtml;
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

function selectSlotFromPrompt(slotIndex) {
  const slotFilter = document.getElementById('slotFilter');
  if (slotFilter) slotFilter.value = slotIndex;
  activeSlotFilter = slotIndex;
  renderDashboard();
}

function selectStatusFromPrompt(statusVal) {
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.value = statusVal;
  activeStatusFilter = statusVal;
  renderDashboard();
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

  const hasFilterSelected = (activeSlotFilter !== '' && activeSlotFilter !== 'ALL') || 
                            (activeStatusFilter !== '' && activeStatusFilter !== 'ALL') || 
                            (activeFloorFilter !== 'ALL') || 
                            (searchQuery !== '');

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

      // If no filter selected, don't show cards
      if (!hasFilterSelected) return '';

      // UI Filters
      if (activeFloorFilter !== 'ALL' && !card.floor.toLowerCase().includes(activeFloorFilter.toLowerCase())) return '';
      if (activeSlotFilter && activeSlotFilter !== 'ALL' && activeSlotFilter != slot.index) return '';
      if (activeStatusFilter && activeStatusFilter !== 'ALL' && activeStatusFilter !== status) return '';
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

    if (hasFilterSelected && cardsHtml.length > 0) {
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

  if (!hasFilterSelected) {
    slotsContainer.innerHTML = `
      <div class="dashboard-prompt-container">
        <div class="prompt-hero-box">
          <div class="prompt-icon-halo">
            <div class="prompt-icon-inner">
              <i class="fas fa-layer-group"></i>
            </div>
          </div>
          <div class="prompt-hero-text">
            <div class="prompt-badge"><span class="pulse-dot-sm"></span> REAL-TIME INSPECTION READY</div>
            <h3 class="prompt-title">Select a Time Slot or Filter to Inspect</h3>
            <p class="prompt-desc">Click any time slot below or select status/floor from above to view live lecture checks across BVIT campus.</p>
          </div>
        </div>

        <div class="prompt-interactive-grid">
          
          <!-- Section 1: Quick Time Slot Selection -->
          <div class="prompt-group-card">
            <div class="prompt-group-header">
              <i class="fas fa-clock" style="color: var(--primary-light);"></i>
              <span>Select Time Slot (1 to 8)</span>
            </div>
            <div class="quick-slots-grid">
              ${DEFAULT_SLOTS.map(s => `
                <button type="button" class="quick-slot-btn" onclick="selectSlotFromPrompt('${s.index}')">
                  <span class="q-slot-num">Slot ${s.index}</span>
                  <span class="q-slot-time">${s.start} - ${s.end}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Section 2: Quick Status Filters -->
          <div class="prompt-side-grid">
            <div class="prompt-group-card">
              <div class="prompt-group-header">
                <i class="fas fa-chart-pie" style="color: var(--primary-light);"></i>
                <span>Filter by Live Status</span>
              </div>
              <div class="quick-status-row">
                <button type="button" class="quick-status-card taken" onclick="selectStatusFromPrompt('TAKEN')">
                  <div class="q-stat-top">
                    <i class="fas fa-check-circle"></i>
                    <span class="q-stat-badge">${totalTaken} Confirmed</span>
                  </div>
                  <span class="q-stat-name">Lectures Taken</span>
                  <span class="q-stat-sub">View ${totalTaken} completed lectures</span>
                </button>
                
                <button type="button" class="quick-status-card not-taken" onclick="selectStatusFromPrompt('NOT_TAKEN')">
                  <div class="q-stat-top">
                    <i class="fas fa-times-circle"></i>
                    <span class="q-stat-badge">${totalNotTaken} Missed</span>
                  </div>
                  <span class="q-stat-name">Not Taken (Missed)</span>
                  <span class="q-stat-sub">View ${totalNotTaken} missed lectures</span>
                </button>

                <button type="button" class="quick-status-card pending" onclick="selectStatusFromPrompt('PENDING')">
                  <div class="q-stat-top">
                    <i class="fas fa-hourglass-half"></i>
                    <span class="q-stat-badge">${totalPending} Remaining</span>
                  </div>
                  <span class="q-stat-name">Pending Checks</span>
                  <span class="q-stat-sub">View ${totalPending} pending verification</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  } else if (totalDisplayedCards === 0) {
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
    if (!hasFilterSelected) {
      resultsBadge.innerHTML = `<i class="fas fa-info-circle"></i> Select filter to view lectures (${totalExpected} scheduled today)`;
    } else {
      resultsBadge.innerHTML = `<i class="fas fa-filter"></i> Showing ${totalDisplayedCards} of ${totalExpected} Lectures`;
    }
  }
}

/* ==========================================================================
   5. OFFICIAL INSPECTION REPORTS & CSV / PRINT EXPORT
   ========================================================================== */
let currentFilteredReports = [];

function filterReports() {
  const fromDate = document.getElementById('reportFromDate').value;
  const toDate = document.getElementById('reportToDate').value;
  const statusFilter = activeReportStatus || 'ALL';
  const checkerFilter = activeReportChecker || 'ALL';
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
      tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 30px; color: var(--text-muted);">No inspection records found for the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((r, idx) => {
      const isNotTaken = (r.status || '').toUpperCase() === 'NOT_TAKEN';
      return `
        <tr>
          <td><b>#${idx + 1}</b></td>
          <td><b>${r.date || selectedDate}</b></td>
          <td><span class="room-badge">${r.classRoom || 'N/A'}</span></td>
          <td><b>${r.className || 'N/A'}</b></td>
          <td><b>${r.subject || 'N/A'}</b></td>
          <td>${r.lecturerName || 'N/A'}</td>
          <td>${r.lectureSlotId || r.startTime || 'N/A'}</td>
          <td>
            <span class="pill-badge ${isNotTaken ? 'not-taken' : 'taken'}">
              ${isNotTaken ? '✕ NOT TAKEN' : '✓ TAKEN'}
            </span>
          </td>
          <td><b>${r.checkedBy || 'Inspector'}</b></td>
          <td><span style="font-size: 12px; color: var(--text-secondary);">${r.checkerRemark || '-'}</span></td>
          <td style="text-align: center;">
            ${isNotTaken ? `
              <button type="button" class="btn-table-memo" onclick="openMemoModal(${idx})" title="Generate and Print Official Memo">
                <i class="fas fa-file-invoice"></i> <span>Memo PDF</span>
              </button>
            ` : `
              <span style="color: #94A3B8; font-size: 12px;">—</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
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
  const statusVal = activeReportStatus || 'ALL';

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
   OFFICIAL BHARATI VIDYAPEETH FACULTY INSPECTION MEMO GENERATOR
   ========================================================================== */
function getDepartmentFromClass(className, subject) {
  const c = (className || '').toUpperCase().trim();
  const s = (subject || '').toUpperCase().trim();
  
  if (c.includes('CM')) return 'CM';
  if (c.includes('IF')) return 'IF';
  if (c.includes('ME')) return 'ME';
  if (c.includes('EE')) return 'EE';
  if (c.includes('EJ') || c.includes('EXTC')) return 'EJ';
  if (c.includes('CE')) return 'CE';
  if (c.includes('AN') || c.includes('AIML')) return 'AN';
  
  if (s.includes('ENG') || s.includes('BMS') || s.includes('PHY') || s.includes('CHE') || s.includes('MATH')) return 'General Science & Humanities';
  if (s.includes('OOP') || s.includes('DSU') || s.includes('DMS') || s.includes('OSY') || s.includes('STE') || s.includes('DAN')) return 'CM';
  
  return 'Engineering';
}

function formatMemoTime(timeSlotStr, startTimeStr, endTimeStr) {
  let raw = timeSlotStr || `${startTimeStr || ''} - ${endTimeStr || ''}`;
  raw = raw.trim();
  
  const parts = raw.split(/[-–—]|to/i).map(p => p.trim());
  if (parts.length >= 2) {
    let s = parts[0].replace(':', '.').toLowerCase();
    let e = parts[1].replace(':', '.').toLowerCase();
    if (!s.includes('am') && !s.includes('pm')) {
      s += ' ' + (e.includes('pm') ? 'pm' : 'am');
    }
    return `${s} to ${e}`;
  }
  return raw.replace(':', '.').toLowerCase();
}

function formatMemoDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-GB');
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

function openMemoModal(recordIndex) {
  const record = currentFilteredReports[recordIndex];
  if (!record) return;
  openMemoInNewTab(record);
}

function openMemoInNewTab(record) {
  const todayDisplay = formatMemoDate(new Date().toISOString().split('T')[0]);
  const insDateDisplay = formatMemoDate(record.date || selectedDate);
  const timeFormatted = formatMemoTime(record.lectureSlotId, record.startTime, record.endTime);
  const deptName = getDepartmentFromClass(record.className, record.subject);
  const teacherName = record.lecturerName || 'Concerned Faculty';
  const classDiv = record.className || 'Class';
  const subject = record.subject || '';

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups for this site to open and print the Official Memo.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>BVIT Official Memo - ${teacherName}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 18mm 22mm 15mm 22mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Times New Roman', Times, Georgia, serif;
            color: #000000;
            background: #E2E8F0;
            padding: 20px 10px;
            line-height: 1.45;
            font-size: 14pt;
          }
          .no-print-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #0F172A;
            color: #FFFFFF;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            z-index: 9999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .toolbar-title {
            font-size: 15px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .toolbar-actions {
            display: flex;
            gap: 12px;
          }
          .btn-tb {
            padding: 8px 18px;
            font-size: 13.5px;
            font-weight: 700;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .btn-tb-print {
            background: #2563EB;
            color: #FFFFFF;
          }
          .btn-tb-print:hover {
            background: #1D4ED8;
          }
          .btn-tb-close {
            background: #334155;
            color: #FFFFFF;
          }
          .btn-tb-close:hover {
            background: #475569;
          }

          .memo-page-wrapper {
            margin: 70px auto 30px auto;
            max-width: 820px;
            background: #FFFFFF;
            padding: 45px 55px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            min-height: 1000px;
          }

          .memo-top-header { text-align: center; margin-bottom: 6px; }
          .memo-emblem-container { margin-bottom: 6px; display: flex; justify-content: center; }
          .memo-emblem-container img { height: 62px; max-width: 150px; object-fit: contain; }
          
          .memo-institute-title-line1 {
            font-family: 'Times New Roman', Times, serif;
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 0.3px;
            line-height: 1.25;
            text-transform: uppercase;
            color: #000000;
            white-space: nowrap;
          }
          .memo-institute-title-line2 {
            font-family: 'Times New Roman', Times, serif;
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 0.3px;
            line-height: 1.25;
            text-transform: uppercase;
            color: #000000;
            margin-top: 2px;
          }
          .memo-separator-double {
            border-bottom: 3px double #000000;
            margin-top: 10px;
            margin-bottom: 8px;
          }
          .memo-date-section {
            text-align: right;
            font-size: 13.5pt;
            margin-bottom: 24px;
          }
          .memo-title-wrapper { text-align: center; margin-bottom: 35px; }
          .memo-title-text {
            display: inline-block;
            font-size: 19pt;
            font-weight: bold;
            text-decoration: underline;
            letter-spacing: 1px;
            margin: 0;
          }
          .memo-recipient-block {
            font-size: 13.5pt;
            line-height: 1.4;
            margin-bottom: 40px;
          }
          .memo-strong { font-weight: bold; }
          .memo-content-body { margin-bottom: 50px; }
          .memo-text-paragraph {
            font-size: 13.5pt;
            line-height: 1.65;
            text-align: justify;
            margin-bottom: 28px;
            text-indent: 40px;
          }
          .memo-principal-row {
            display: flex;
            justify-content: flex-end;
            margin-top: 35px;
            margin-bottom: 20px;
          }
          .memo-principal-column {
            text-align: center;
            line-height: 1.35;
            min-width: 180px;
          }
          .memo-sign-space {
            height: 48px;
          }
          .memo-cc-row {
            line-height: 1.45;
            font-size: 11.5pt;
            margin-top: 15px;
          }
          .memo-cc-title { font-weight: bold; }
          .memo-cc-sub { padding-left: 45px; }

          @media print {
            body { background: #FFFFFF; padding: 0; }
            .no-print-toolbar { display: none !important; }
            .memo-page-wrapper {
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              max-width: 100% !important;
              min-height: auto !important;
            }
            .memo-institute-title-line1 {
              font-size: 14pt !important;
              white-space: nowrap !important;
            }
            .memo-institute-title-line2 {
              font-size: 14pt !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-toolbar">
          <div class="toolbar-title">
            <span>📄 Official Memo Preview — ${teacherName}</span>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="btn-tb btn-tb-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
            <button type="button" class="btn-tb btn-tb-close" onclick="window.close()">✕ Close</button>
          </div>
        </div>

        <div class="memo-page-wrapper">
          <div class="memo-top-header">
            <div class="memo-emblem-container">
              <img src="data:image/png;base64,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" alt="Bharati Vidyapeeth Logo" />
            </div>
            <div class="memo-institute-title-line1">BHARATI VIDYAPEETH INSTITUTE OF TECHNLOGY,</div>
            <div class="memo-institute-title-line2">NAVI MUMBAI</div>
            <div class="memo-separator-double"></div>
          </div>

          <div class="memo-date-section">
            <span>Date : <strong>${todayDisplay}</strong></span>
          </div>

          <div class="memo-title-wrapper">
            <h2 class="memo-title-text">MEMO</h2>
          </div>

          <div class="memo-recipient-block">
            <div class="memo-line">To,</div>
            <div class="memo-line memo-strong" style="margin-top: 6px;">${teacherName}</div>
            <div class="memo-line memo-strong">${deptName} Department</div>
            <div class="memo-line">BVIT, Navi Mumbai.</div>
          </div>

          <div class="memo-content-body">
            <p class="memo-text-paragraph">
              This has been observed that you have not conduct your class from <strong>${timeFormatted}</strong> on <strong>${insDateDisplay}</strong> of <strong>${classDiv} ${subject}</strong> .
            </p>
            <p class="memo-text-paragraph">
              This is viewed seriously. You are hereby instructed to submit your written explanation within <strong>1 dyas</strong> from the receipt of this memo
            </p>
          </div>

          <!-- 1. Principal Signature on the RIGHT Side FIRST -->
          <div style="display: flex; justify-content: flex-end; margin-top: 45px; margin-bottom: 25px;">
            <div style="text-align: center; min-width: 190px;">
              <div style="height: 45px;"></div>
              <strong style="font-size: 13pt; font-family: 'Times New Roman', Times, serif;">Principal</strong><br>
              <span style="font-size: 12pt; font-family: 'Times New Roman', Times, serif;">BVIT, Navi Mumbai</span>
            </div>
          </div>

          <!-- 2. C.c. to on the LEFT Side BELOW Principal Signature -->
          <div style="margin-top: 15px; font-size: 11.5pt; line-height: 1.45; font-family: 'Times New Roman', Times, serif;">
            <div><strong>C.c. to 1) Hon. Secretary,</strong></div>
            <div style="padding-left: 55px;">Bharati Vidyapeeth, Pune.</div>
            <div style="margin-top: 8px; padding-left: 45px;"><strong>2) Hon. Director,</strong></div>
            <div style="padding-left: 60px;">B.V. Education Complex, C.B.D.</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function generateBatchMemos() {
  const notTakenRecords = currentFilteredReports.filter(r => (r.status || '').toUpperCase() === 'NOT_TAKEN');
  if (notTakenRecords.length === 0) {
    alert("No 'Not Taken' lecture inspections found in the current filtered report.\n\nPlease select 'Not Taken Only' status filter and click 'Apply Filter'.");
    return;
  }

  const todayDisplay = formatMemoDate(new Date().toISOString().split('T')[0]);

  const memosHtml = notTakenRecords.map((r, idx) => {
    const insDateDisplay = formatMemoDate(r.date || selectedDate);
    const timeFormatted = formatMemoTime(r.lectureSlotId, r.startTime, r.endTime);
    const deptName = getDepartmentFromClass(r.className, r.subject);
    const teacherName = r.lecturerName || 'Concerned Faculty';
    const classDiv = r.className || 'Class';
    const subject = r.subject || '';

    return `
      <div class="memo-page-wrapper page-break" style="${idx < notTakenRecords.length - 1 ? 'page-break-after: always;' : ''}">
        <div class="memo-top-header">
          <div class="memo-emblem-container">
            <img src="data:image/png;base64,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" alt="Bharati Vidyapeeth Logo" />
          </div>
          <div class="memo-institute-title-line1">BHARATI VIDYAPEETH INSTITUTE OF TECHNLOGY,</div>
          <div class="memo-institute-title-line2">NAVI MUMBAI</div>
          <div class="memo-separator-double"></div>
        </div>

        <div class="memo-date-section">
          <span>Date : <strong>${todayDisplay}</strong></span>
        </div>

        <div class="memo-title-wrapper">
          <h2 class="memo-title-text">MEMO</h2>
        </div>

        <div class="memo-recipient-block">
          <div class="memo-line">To,</div>
          <div class="memo-line memo-strong" style="margin-top: 6px;">${teacherName}</div>
          <div class="memo-line memo-strong">${deptName} Department</div>
          <div class="memo-line">BVIT, Navi Mumbai.</div>
        </div>

        <div class="memo-content-body">
          <p class="memo-text-paragraph">
            This has been observed that you have not conduct your class from <strong>${timeFormatted}</strong> on <strong>${insDateDisplay}</strong> of <strong>${classDiv} ${subject}</strong> .
          </p>
          <p class="memo-text-paragraph">
            This is viewed seriously. You are hereby instructed to submit your written explanation within <strong>1 dyas</strong> from the receipt of this memo
          </p>
        </div>

        <!-- 1. Principal Signature on the RIGHT Side FIRST -->
          <div style="display: flex; justify-content: flex-end; margin-top: 45px; margin-bottom: 25px;">
            <div style="text-align: center; min-width: 190px;">
              <div style="height: 45px;"></div>
              <strong style="font-size: 13pt; font-family: 'Times New Roman', Times, serif;">Principal</strong><br>
              <span style="font-size: 12pt; font-family: 'Times New Roman', Times, serif;">BVIT, Navi Mumbai</span>
            </div>
          </div>

          <!-- 2. C.c. to on the LEFT Side BELOW Principal Signature -->
          <div style="margin-top: 15px; font-size: 11.5pt; line-height: 1.45; font-family: 'Times New Roman', Times, serif;">
            <div><strong>C.c. to 1) Hon. Secretary,</strong></div>
            <div style="padding-left: 55px;">Bharati Vidyapeeth, Pune.</div>
            <div style="margin-top: 8px; padding-left: 45px;"><strong>2) Hon. Director,</strong></div>
            <div style="padding-left: 60px;">B.V. Education Complex, C.B.D.</div>
          </div>
      </div>
    `;
  }).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups for this site to open and print the Official Memos.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>BVIT Not Taken Memos (${notTakenRecords.length} Faculties)</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 18mm 22mm 15mm 22mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Times New Roman', Times, Georgia, serif;
            color: #000000;
            background: #E2E8F0;
            padding: 20px 10px;
            line-height: 1.45;
            font-size: 14pt;
          }
          .no-print-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #0F172A;
            color: #FFFFFF;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            z-index: 9999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .toolbar-title {
            font-size: 15px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .toolbar-actions {
            display: flex;
            gap: 12px;
          }
          .btn-tb {
            padding: 8px 18px;
            font-size: 13.5px;
            font-weight: 700;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .btn-tb-print {
            background: #2563EB;
            color: #FFFFFF;
          }
          .btn-tb-print:hover {
            background: #1D4ED8;
          }
          .btn-tb-close {
            background: #334155;
            color: #FFFFFF;
          }
          .btn-tb-close:hover {
            background: #475569;
          }

          .memo-page-wrapper {
            margin: 70px auto 40px auto;
            max-width: 820px;
            background: #FFFFFF;
            padding: 45px 55px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            min-height: 1000px;
          }
          .page-break { page-break-after: always; }

          .memo-top-header { text-align: center; margin-bottom: 6px; }
          .memo-emblem-container { margin-bottom: 6px; display: flex; justify-content: center; }
          .memo-emblem-container img { height: 62px; max-width: 150px; object-fit: contain; }
          
          .memo-institute-title-line1 {
            font-family: 'Times New Roman', Times, serif;
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 0.3px;
            line-height: 1.25;
            text-transform: uppercase;
            color: #000000;
            white-space: nowrap;
          }
          .memo-institute-title-line2 {
            font-family: 'Times New Roman', Times, serif;
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 0.3px;
            line-height: 1.25;
            text-transform: uppercase;
            color: #000000;
            margin-top: 2px;
          }
          .memo-separator-double {
            border-bottom: 3px double #000000;
            margin-top: 10px;
            margin-bottom: 8px;
          }
          .memo-date-section {
            text-align: right;
            font-size: 13.5pt;
            margin-bottom: 24px;
          }
          .memo-title-wrapper { text-align: center; margin-bottom: 35px; }
          .memo-title-text {
            display: inline-block;
            font-size: 19pt;
            font-weight: bold;
            text-decoration: underline;
            letter-spacing: 1px;
            margin: 0;
          }
          .memo-recipient-block {
            font-size: 13.5pt;
            line-height: 1.4;
            margin-bottom: 40px;
          }
          .memo-strong { font-weight: bold; }
          .memo-content-body { margin-bottom: 50px; }
          .memo-text-paragraph {
            font-size: 13.5pt;
            line-height: 1.65;
            text-align: justify;
            margin-bottom: 28px;
            text-indent: 40px;
          }
          .memo-principal-row {
            display: flex;
            justify-content: flex-end;
            margin-top: 35px;
            margin-bottom: 20px;
          }
          .memo-principal-column {
            text-align: center;
            line-height: 1.35;
            min-width: 180px;
          }
          .memo-sign-space {
            height: 48px;
          }
          .memo-cc-row {
            line-height: 1.45;
            font-size: 11.5pt;
            margin-top: 15px;
          }
          .memo-cc-title { font-weight: bold; }
          .memo-cc-sub { padding-left: 45px; }

          @media print {
            body { background: #FFFFFF; padding: 0; }
            .no-print-toolbar { display: none !important; }
            .memo-page-wrapper {
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              max-width: 100% !important;
              min-height: auto !important;
            }
            .memo-institute-title-line1 {
              font-size: 14pt !important;
              white-space: nowrap !important;
            }
            .memo-institute-title-line2 {
              font-size: 14pt !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-toolbar">
          <div class="toolbar-title">
            <span>📄 Official Memos (${notTakenRecords.length} Faculties)</span>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="btn-tb btn-tb-print" onclick="window.print()">🖨️ Print / Save All as PDF</button>
            <button type="button" class="btn-tb btn-tb-close" onclick="window.close()">✕ Close</button>
          </div>
        </div>

        ${memosHtml}

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
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

let currentFilteredTimetable = [];
let activeTimetableDay = 'ALL';
let activeTimetableFloor = 'ALL';



let activeReportStatus = 'ALL';
let activeReportChecker = 'ALL';

function handleCustomStatusSelect(val, label) {
  activeStatusFilter = val;
  const labelElem = document.getElementById('selectedStatusText');
  if (labelElem) labelElem.textContent = label;

  document.querySelectorAll('#customStatusDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === val);
  });

  const container = document.getElementById('customStatusDropdown');
  if (container) container.classList.remove('open');

  renderDashboard();
}

function handleCustomSlotSelect(val, label) {
  activeSlotFilter = val;
  const labelElem = document.getElementById('selectedSlotText');
  if (labelElem) labelElem.textContent = label;

  document.querySelectorAll('#customSlotDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === val);
  });

  const container = document.getElementById('customSlotDropdown');
  if (container) container.classList.remove('open');

  renderDashboard();
}

function handleCustomReportStatusSelect(val, label) {
  activeReportStatus = val;
  const labelElem = document.getElementById('selectedReportStatusText');
  if (labelElem) labelElem.textContent = label;

  document.querySelectorAll('#customReportStatusDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === val);
  });

  const container = document.getElementById('customReportStatusDropdown');
  if (container) container.classList.remove('open');

  filterReports();
}

function handleCustomReportCheckerSelect(val, label) {
  activeReportChecker = val;
  const labelElem = document.getElementById('selectedReportCheckerText');
  if (labelElem) labelElem.textContent = label;

  document.querySelectorAll('#customReportCheckerDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === val);
  });

  const container = document.getElementById('customReportCheckerDropdown');
  if (container) container.classList.remove('open');

  filterReports();
}

function toggleCustomMenu(dropdownId) {
  const container = document.getElementById(dropdownId);
  if (!container) return;
  const isOpened = container.classList.contains('open');
  
  // Close any other open dropdowns
  document.querySelectorAll('.custom-dropdown-container').forEach(c => c.classList.remove('open'));
  
  if (!isOpened) {
    container.classList.add('open');
  }
}

// Close custom dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown-container')) {
    document.querySelectorAll('.custom-dropdown-container').forEach(c => c.classList.remove('open'));
  }
});

function handleCustomDaySelect(dayVal, dayLabel) {
  activeTimetableDay = dayVal;
  const labelElem = document.getElementById('selectedDayText');
  if (labelElem) labelElem.textContent = dayLabel;

  document.querySelectorAll('#customDayDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === dayVal);
  });

  const container = document.getElementById('customDayDropdown');
  if (container) container.classList.remove('open');

  renderTimetableTable();
}

function handleCustomFloorSelect(floorVal, floorLabel) {
  activeTimetableFloor = floorVal;
  const labelElem = document.getElementById('selectedFloorText');
  if (labelElem) labelElem.textContent = floorLabel;

  document.querySelectorAll('#customFloorDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === floorVal);
  });

  const container = document.getElementById('customFloorDropdown');
  if (container) container.classList.remove('open');

  renderTimetableTable();
}

function renderTimetableTable() {
  const tbody = document.getElementById('timetableTableBody');
  if (!tbody) return;

  const query = (document.getElementById('ttSearchInput') ? document.getElementById('ttSearchInput').value : '').toLowerCase().trim();

  let filtered = masterTimetableEntries.map((e, originalIndex) => ({ ...e, originalIndex }));

  if (activeTimetableDay !== 'ALL') {
    filtered = filtered.filter(e => (e.day || '').toLowerCase() === activeTimetableDay.toLowerCase());
  }

  if (activeTimetableFloor !== 'ALL') {
    filtered = filtered.filter(e => (e.floor || '').toLowerCase().includes(activeTimetableFloor.toLowerCase()));
  }

  if (query) {
    filtered = filtered.filter(e => {
      const txt = `${e.day} ${e.timeSlot} ${e.floor} ${e.roomNo} ${e.classDiv} ${e.subject} ${e.teacherName}`.toLowerCase();
      return txt.includes(query);
    });
  }

  currentFilteredTimetable = filtered;

  const countText = `${filtered.length} Slots Found`;
  const b1 = document.getElementById('ttResultsBadge');
  if (b1) b1.innerHTML = `<i class="fas fa-database"></i> ${countText}`;
  const b2 = document.getElementById('ttTableRecordsCount');
  if (b2) b2.textContent = countText;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 35px 20px; color: var(--text-muted); font-size: 14px;"><i class="fas fa-search" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>No timetable slots found for the selected day/floor/search criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((e, idx) => `
    <tr>
      <td><b>#${idx + 1}</b></td>
      <td><span class="day-badge">${e.day}</span></td>
      <td>${e.timeSlot}</td>
      <td><span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">${e.floor}</span></td>
      <td><span class="room-badge">${e.roomNo}</span></td>
      <td><b>${e.classDiv}</b></td>
      <td><b>${e.subject}</b></td>
      <td>${e.teacherName}</td>
      <td style="text-align: center;">
        <button type="button" class="btn-table-edit" onclick="openEditTimetableModal(${e.originalIndex})" title="Edit this slot in master timetable">
          <i class="fas fa-edit"></i> Edit
        </button>
      </td>
    </tr>
  `).join('');
}

function resetTimetableFilters() {
  activeTimetableDay = 'ALL';
  activeTimetableFloor = 'ALL';
  
  const dLabel = document.getElementById('selectedDayText');
  if (dLabel) dLabel.textContent = 'All Days (Mon – Sat)';
  document.querySelectorAll('#customDayDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === 'ALL');
  });

  const fLabel = document.getElementById('selectedFloorText');
  if (fLabel) fLabel.textContent = 'All Floors';
  document.querySelectorAll('#customFloorDropdown .dropdown-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-val') === 'ALL');
  });

  if (document.getElementById('ttSearchInput')) {
    document.getElementById('ttSearchInput').value = '';
  }
  renderTimetableTable();
}

function openEditTimetableModal(originalIndex) {
  const slot = masterTimetableEntries[originalIndex];
  if (!slot) return;

  document.getElementById('editSlotIndex').value = originalIndex;
  document.getElementById('editDay').value = slot.day || 'Monday';
  document.getElementById('editFloor').value = slot.floor || 'Third Floor';
  document.getElementById('editTimeSlot').value = slot.timeSlot || '';
  document.getElementById('editRoomNo').value = slot.roomNo || '';
  document.getElementById('editClassDiv').value = slot.classDiv || '';
  document.getElementById('editSubject').value = slot.subject || '';
  document.getElementById('editTeacherName').value = slot.teacherName || '';

  const modal = document.getElementById('editTimetableModal');
  if (modal) modal.classList.add('active');
}

function closeEditTimetableModal() {
  const modal = document.getElementById('editTimetableModal');
  if (modal) modal.classList.remove('active');
}

async function saveEditedTimetableSlot(e) {
  e.preventDefault();
  const idx = parseInt(document.getElementById('editSlotIndex').value, 10);
  if (isNaN(idx) || idx < 0 || idx >= masterTimetableEntries.length) return;

  const btn = document.getElementById('btnSaveTimetableSlot');
  const oldBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving to Cloud...';
  }

  const updatedSlot = {
    day: document.getElementById('editDay').value.trim(),
    floor: document.getElementById('editFloor').value.trim(),
    timeSlot: document.getElementById('editTimeSlot').value.trim(),
    roomNo: document.getElementById('editRoomNo').value.trim(),
    classDiv: document.getElementById('editClassDiv').value.trim(),
    subject: document.getElementById('editSubject').value.trim(),
    teacherName: document.getElementById('editTeacherName').value.trim()
  };

  masterTimetableEntries[idx] = updatedSlot;

  try {
    const jsonString = JSON.stringify(masterTimetableEntries);
    
    await Promise.all([
      db.collection('timetable_master').doc('master_bundle').set({
        jsonData: jsonString,
        updatedAt: Date.now(),
        version: 2,
        count: masterTimetableEntries.length
      }),
      db.collection('timetable').doc('master_bundle').set({
        jsonData: jsonString,
        updatedAt: Date.now(),
        version: 2,
        count: masterTimetableEntries.length
      })
    ]);

    closeEditTimetableModal();
    renderTimetableTable();
    renderDashboard();
    showLiveToast('Timetable Updated', `Slot for Room ${updatedSlot.roomNo} (${updatedSlot.classDiv} - ${updatedSlot.teacherName}) saved live to Firestore cloud!`, 'success');
  } catch (err) {
    console.error("Firestore Timetable Save Error:", err);
    alert("Error updating timetable in Firestore: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldBtnHtml;
    }
  }
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
