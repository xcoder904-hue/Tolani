// ==========================================
// EduSphere College Management Portal - Core Client SPA
// ==========================================

// Ensure client device fingerprint
let deviceId = localStorage.getItem("es_device_id");
if (!deviceId) {
    deviceId = 'dev-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
    localStorage.setItem("es_device_id", deviceId);
}

// Global State
let currentUser = null;
let currentView = "dashboard";
let activeSessionPollingInterval = null;
let activeSessionCode = null;

// DOM Elements
const authView = document.getElementById("auth-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const sidebarMenuList = document.getElementById("sidebar-menu-list");
const sidebarUserName = document.getElementById("sidebar-user-name");
const sidebarUserRole = document.getElementById("sidebar-user-role");
const sidebarUserAvatar = document.getElementById("sidebar-user-avatar");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const dynamicContentArea = document.getElementById("dynamic-content-area");
const sidebarToggle = document.getElementById("sidebar-toggle");
const appSidebar = document.getElementById("app-sidebar");
const logoutButton = document.getElementById("logout-button");
const currentDateDisplay = document.getElementById("current-date-display");

// Modals
const generalModal = document.getElementById("general-modal");
const generalModalTitle = document.getElementById("general-modal-title");
const generalModalBody = document.getElementById("general-modal-body");
const generalModalClose = document.getElementById("general-modal-close");

const feeModal = document.getElementById("fee-modal");
const feeModalClose = document.getElementById("fee-modal-close");
const feePayForm = document.getElementById("fee-pay-form");
const feeModalDueAmt = document.getElementById("fee-modal-due-amt");
const feePayStudentId = document.getElementById("fee-pay-student-id");

// Set Current Date
if (currentDateDisplay) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateDisplay.textContent = new Date().toLocaleDateString('en-US', options);
}

// --- Theme Handling: Force light theme (white background & black text) ---
(function() {
    document.body.classList.add("light-theme");
    localStorage.setItem("es_theme", "light");
})();


// --- Sidebar Toggle ---
if (sidebarToggle && appSidebar) {
    sidebarToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        appSidebar.classList.toggle("active");
    });
    
    document.addEventListener("click", (e) => {
        if (window.innerWidth <= 992 && appSidebar.classList.contains("active")) {
            if (!appSidebar.contains(e.target) && e.target !== sidebarToggle && !sidebarToggle.contains(e.target)) {
                appSidebar.classList.remove("active");
            }
        }
    });
}

// --- Login Handling ---
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();

        showLoading(true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            showLoading(false);

            if (data.success) {
                currentUser = data.user;
                localStorage.setItem("es_current_user", JSON.stringify(currentUser));
                const savedTheme = localStorage.getItem("es_theme") || "dark";
                if (savedTheme === "light") {
                    document.body.classList.add("light-theme");
                } else {
                    document.body.classList.remove("light-theme");
                }
                const themeIcon = document.getElementById("theme-toggle-icon");
                if (themeIcon) {
                    themeIcon.className = savedTheme === "light" ? "fa-solid fa-moon" : "fa-solid fa-sun";
                }
                initializeDashboard();
            } else {
                alert(data.error || 'Login failed.');
            }
        } catch (err) {
            showLoading(false);
            console.error(err);
            alert('Failed to connect to the server.');
        }
    });
}

// --- Logout Handling ---
if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("es_current_user");
        currentUser = null;
        if (activeSessionPollingInterval) {
            clearInterval(activeSessionPollingInterval);
        }
        activeSessionCode = null;
        document.body.classList.add("light-theme");
        dashboardView.style.display = "none";
        authView.style.display = "flex";
        loginForm.reset();
    });
}

// --- Modal Handling ---
if (generalModalClose) {
    generalModalClose.addEventListener("click", () => {
        generalModal.classList.remove("active");
    });
}
if (feeModalClose) {
    feeModalClose.addEventListener("click", () => {
        feeModal.classList.remove("active");
    });
}

// Helper: Show/Hide Loading Overlay
function showLoading(show) {
    const btn = document.querySelector("#login-form button[type='submit']");
    if (btn) {
        btn.disabled = show;
        btn.innerHTML = show ? '<span>Signing In...</span> <i class="fa-solid fa-spinner fa-spin"></i>' : '<span>Sign In</span> <i class="fa-solid fa-arrow-right-to-bracket"></i>';
    }
}

// Robust GPS Coordinate Retrieval Helper (low accuracy first for fast indoor lock, fallback to high accuracy)
function getGPSCoordinates(onSuccess, onError) {
    if (!navigator.geolocation) {
        onError("GPS is not supported by your browser.");
        return;
    }
    
    // Try fast location acquisition first (low accuracy, works indoors immediately using Wi-Fi / Cell tower)
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            console.log("Acquired fast low-accuracy GPS location:", pos.coords.latitude, pos.coords.longitude);
            onSuccess(pos);
        },
        (err) => {
            console.warn("Fast GPS lock failed, attempting high accuracy fallback...", err);
            // Try high accuracy fallback
            navigator.geolocation.getCurrentPosition(
                (pos2) => {
                    console.log("Acquired high-accuracy GPS location:", pos2.coords.latitude, pos2.coords.longitude);
                    onSuccess(pos2);
                },
                (err2) => {
                    console.error("High accuracy GPS lock failed:", err2);
                    onError(err2);
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
            );
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
    );
}

// Helper: Get Initials
function getInitials(name) {
    if (!name) return "US";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

// Initialize Dashboard UI
function initializeDashboard() {
    authView.style.display = "none";
    dashboardView.style.display = "flex";

    // Set user profile info
    sidebarUserName.textContent = currentUser.name;
    sidebarUserRole.textContent = currentUser.role === 'teacher' ? 'PROFESSOR' : currentUser.role.toUpperCase();
    sidebarUserAvatar.textContent = getInitials(currentUser.name);

    currentView = "dashboard";
    buildSidebarMenu(currentUser.role);
    navigateTo("dashboard");
    if (typeof window.checkStudentLockdownRecovery === "function") {
        window.checkStudentLockdownRecovery();
    }
}

// Navigation Configuration
const ROLE_NAV = {
    student: [
        { id: "dashboard", label: "Overview", icon: "fa-chart-pie" },
        { id: "timetable", label: "Class Timetable", icon: "fa-calendar-days" },
        { id: "attendance", label: "Attendance Record", icon: "fa-calendar-check" },
        { id: "syllabus", label: "Syllabus & Courses", icon: "fa-book-open" },
        { id: "assignments", label: "Assignments", icon: "fa-pen-to-square" },
        { id: "study_materials", label: "Study Materials", icon: "fa-book" },
        { id: "student_marks", label: "Marks Sheet", icon: "fa-graduation-cap" },
        { id: "fees", label: "Fee Payment", icon: "fa-credit-card" },
        { id: "profile", label: "Profile Settings", icon: "fa-user-gear" }
    ],
    teacher: [
        { id: "dashboard", label: "Dashboard", icon: "fa-gauge" },
        { id: "students", label: "Student Registry", icon: "fa-users" },
        { id: "timetable", label: "Class Timetable", icon: "fa-calendar" },
        { id: "schedule", label: "Manage Attendance", icon: "fa-calendar-plus" },
        { id: "projector", label: "Classroom Projector", icon: "fa-display" },
        { id: "attendance_report", label: "Attendance Sheet", icon: "fa-table-list" },
        { id: "lecture_attendance", label: "Lecture Wise Sheet", icon: "fa-list-check" },
        { id: "lecture_history", label: "Manage Taken Lectures", icon: "fa-clock-rotate-left" },
        { id: "coursework_manager", label: "Coursework Suite", icon: "fa-folder-open" },
        { id: "profile", label: "Profile Settings", icon: "fa-user-gear" }
    ],
    admin: [
        { id: "dashboard", label: "Admin Console", icon: "fa-sliders" },
        { id: "bcom", label: "B.Com Regular", icon: "fa-book" },
        { id: "bcompro", label: "B.Com Professional", icon: "fa-graduation-cap" },
        { id: "mcom", label: "M.Com Management", icon: "fa-award" },
        { id: "students", label: "User Registry", icon: "fa-users" },
        { id: "schedule", label: "Manage Attendance", icon: "fa-calendar-plus" },
        { id: "projector", label: "Classroom Projector", icon: "fa-display" },
        { id: "attendance_report", label: "Attendance Sheet", icon: "fa-table-list" },
        { id: "lecture_attendance", label: "Lecture Wise Sheet", icon: "fa-list-check" },
        { id: "admin_lectures", label: "Teacher Lectures Report", icon: "fa-chalkboard-user" },
        { id: "coursework_manager", label: "Coursework Suite", icon: "fa-folder-open" },
        { id: "database", label: "Postgres Console", icon: "fa-database" },
        { id: "profile", label: "Profile Settings", icon: "fa-user-gear" }
    ]
};

function buildSidebarMenu(role) {
    const cleanRole = (role || '').toLowerCase();
    const navItems = ROLE_NAV[cleanRole];
    if (!navItems) {
        console.error("buildSidebarMenu: Invalid user role:", role);
        return;
    }
    sidebarMenuList.innerHTML = "";
    
    navItems.forEach(item => {
        const li = document.createElement("li");
        li.className = `sidebar-menu-item ${item.id === currentView ? 'active' : ''}`;
        li.dataset.view = item.id;
        
        li.innerHTML = `
            <a>
                <i class="fa-solid ${item.icon}"></i>
                <span>${item.label}</span>
            </a>
        `;
        
        li.addEventListener("click", () => {
            if (item.id === "projector") {
                window.open('projector.html', '_blank');
                return;
            }
            document.querySelectorAll(".sidebar-menu-item").forEach(el => el.classList.remove("active"));
            li.classList.add("active");
            navigateTo(item.id);
            if (window.innerWidth <= 992) {
                appSidebar.classList.remove("active");
            }
        });
        
        sidebarMenuList.appendChild(li);
    });
}

function navigateTo(viewId) {
    if (lockdownSessionId) {
        alert("Anti-tamper protection is active. You cannot navigate away from this screen until the attendance session is closed by the instructor.");
        return;
    }
    if (viewId === "projector") {
        window.open('projector.html', '_blank');
        return;
    }
    if (activeSessionPollingInterval) {
        clearInterval(activeSessionPollingInterval);
        activeSessionPollingInterval = null;
    }
    activeSessionCode = null;

    currentView = viewId;
    
    const activeItem = sidebarMenuList.querySelector(`[data-view="${viewId}"]`);
    if (activeItem) {
        document.querySelectorAll(".sidebar-menu-item").forEach(el => el.classList.remove("active"));
        activeItem.classList.add("active");
    }

    const activeRoute = ROLE_NAV[currentUser.role].find(item => item.id === viewId);
    pageTitle.textContent = activeRoute ? activeRoute.label : "Portal";
    pageSubtitle.textContent = `${currentUser.name} | ${currentUser.role.toUpperCase()} Portal`;

    const renderFn = `render${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`;
    
    if (typeof window[renderFn] === "function") {
        window[renderFn]();
    } else {
        dynamicContentArea.innerHTML = `
            <div class="glass-card text-center" style="padding: 40px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 40px; color: var(--warning); margin-bottom: 16px;"></i>
                <h3>View Under Construction</h3>
                <p style="color: var(--text-muted);">The ${viewId} module is being finalized.</p>
            </div>
        `;
    }
}

// Helper: Parse slot text like "Microeconomics (Prof. Sarah Jenkins)"
function parseSlot(slotText) {
    if (!slotText || slotText === 'Free Slot') return { subject: 'Free Slot', teacher: '' };
    const match = slotText.match(/^([^(]+)(?:\(([^)]+)\))?$/);
    if (match) {
        return {
            subject: match[1].trim(),
            teacher: match[2] ? match[2].trim() : ''
        };
    }
    return { subject: slotText, teacher: '' };
}

// =========================================================================
// STUDENT PORTAL MODULES
// =========================================================================

window.renderStudentDashboard = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch(`/api/attendance/student/${currentUser.id}/history`);
        const data = await res.json();
        
        const history = data.records || [];
        const presentCount = history.filter(r => r.status === 'present').length;
        const rate = history.length > 0 ? ((presentCount / history.length) * 100).toFixed(1) : "100.0";

        // Fetch Notices
        const noticeRes = await fetch(`/api/notices?program=${encodeURIComponent(currentUser.program)}`);
        const noticeData = await noticeRes.json();
        const notices = noticeData.notices || [];

        // --- FETCH TODAY'S DAILY LECTURE STATUS OVERRIDES ---
        const todayDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDayName = todayDays[new Date().getDay()];
        const todayDateStr = (function() {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        })();

        let dailyLectureStatusHTML = '';

        if (todayDayName === 'Sunday') {
            dailyLectureStatusHTML = `
                <div class="glass-card mb-24" style="border: 1px dashed var(--border-color);">
                    <h3 class="card-title mb-8"><i class="fa-solid fa-calendar-day mr-8" style="color: var(--accent);"></i> Today's Lecture Tracker</h3>
                    <p style="color: var(--text-muted); font-size: 13px; text-align: center; margin: 16px 0;">Today is Sunday. College is closed.</p>
                </div>
            `;
        } else {
            // Build the correct program key (robust version)
            let semester = currentUser.semester;
            if (!semester || semester === '0.0') {
                const cls = (currentUser.class || '').toUpperCase();
                if (cls.includes('SEM-V') || cls.includes('SEM-5')) semester = 'Semester 5';
                else if (cls.includes('SEM-III') || cls.includes('SEM-3')) semester = 'Semester 3';
                else if (cls.includes('SEM-I') || cls.includes('SEM-1')) semester = 'Semester 1';
                else if (cls.includes('SEM-II') || cls.includes('SEM-2')) semester = 'Semester 2';
                else if (cls.includes('SEM-IV') || cls.includes('SEM-4')) semester = 'Semester 4';
                else if (cls.includes('SEM-VI') || cls.includes('SEM-6')) semester = 'Semester 6';
            }
            
            let program = currentUser.program;
            if (!program || program === '1st Year' || program === '2nd Year' || program === '3rd Year') {
                program = 'B.Com (Regular)';
            }
            
            let division = currentUser.division;
            if (!division || division === 'B.Com (Regular)' || division === 'B.Com (Professional)') {
                division = currentUser.department || 'A';
            }

            const progKey = `${program} - ${semester} - Div ${division}`;

            // Get timetable for today's weekday using the correct division-specific key
            const ttRes = await fetch(`/api/timetables?program=${encodeURIComponent(progKey)}`);
            const ttData = await ttRes.json();
            let todayTimetable = (ttData.timetables || []).find(t => t.day === todayDayName) || {};

            if (!todayTimetable.slot_1 && !todayTimetable.slot_2 && !todayTimetable.slot_3 && !todayTimetable.slot_4) {
                // Fallback to program-level timetable if division-specific one is empty
                const fallbackRes = await fetch(`/api/timetables?program=${encodeURIComponent(program)}`);
                const fallbackData = await fallbackRes.json();
                todayTimetable = (fallbackData.timetables || []).find(t => t.day === todayDayName) || {};
            }

            // Get status overrides for today's date using robust program/division
            const adjRes = await fetch(`/api/daily-lectures?date=${todayDateStr}&program=${encodeURIComponent(program)}&division=${encodeURIComponent(division)}`);
            const adjData = await adjRes.json();
            const overrides = adjData.lectures || [];
            const overridesMap = {};
            overrides.forEach(o => { overridesMap[o.slot] = o; });

            const slots = [
                { id: 'slot_1', label: 'Slot 1 (9:00 - 9:55)', key: 'slot_1' },
                { id: 'slot_2', label: 'Slot 2 (10:00 - 10:55)', key: 'slot_2' },
                { id: 'slot_3', label: 'Slot 3 (11:00 - 11:55)', key: 'slot_3' },
                { id: 'slot_4', label: 'Slot 4 (12:00 - 12:55)', key: 'slot_4' }
            ];

            let slotsHTML = slots.map(s => {
                const timetableVal = todayTimetable[s.key] || 'Free Slot';
                const parsed = parseSlot(timetableVal);
                const override = overridesMap[s.id];

                let statusBadge = '';
                let detailsText = '';

                if (override) {
                    if (override.status === 'Free') {
                        statusBadge = `<span class="attendance-status-pill" style="background: rgba(239,68,68,0.1); color: var(--danger);"><i class="fa-solid fa-circle-xmark"></i> FREE LECTURE (Cancelled)</span>`;
                        detailsText = `<span style="color: var(--danger); font-size: 12px; font-weight: 500;">Original class by ${override.original_teacher} is cancelled today.</span>`;
                    } else if (override.status === 'Substituted') {
                        statusBadge = `<span class="attendance-status-pill" style="background: rgba(245,158,11,0.1); color: var(--warning);"><i class="fa-solid fa-arrows-rotate"></i> SUBSTITUTED</span>`;
                        detailsText = `<span style="color: var(--warning); font-size: 12px;">Taken by <strong>${override.substitute_teacher}</strong> (instead of ${override.original_teacher}).</span>`;
                    } else if (override.status === 'Combined') {
                        statusBadge = `<span class="attendance-status-pill" style="background: rgba(168,85,247,0.1); color: var(--secondary);"><i class="fa-solid fa-users-rectangle"></i> COMBINED CLASS</span>`;
                        detailsText = `<span style="color: var(--secondary); font-size: 12px;">Combined with <strong>Division ${override.combined_division}</strong>. ${override.notes ? `(${override.notes})` : ''}</span>`;
                    } else { // Scheduled override
                        statusBadge = `<span class="attendance-status-pill status-active"><i class="fa-solid fa-circle-check"></i> SCHEDULED</span>`;
                        detailsText = `<span style="color: var(--accent); font-size: 12px;">Class is on: ${override.notes || 'Normal room lecture.'}</span>`;
                    }
                } else {
                    if (parsed.subject === 'Free Slot') {
                        statusBadge = `<span class="attendance-status-pill" style="background: rgba(255,255,255,0.05); color: var(--text-muted);"><i class="fa-solid fa-moon"></i> No lecture</span>`;
                        detailsText = `<span style="color: var(--text-muted); font-size: 12px;">Empty slot.</span>`;
                    } else {
                        statusBadge = `<span class="attendance-status-pill status-active"><i class="fa-solid fa-circle-check"></i> SCHEDULED</span>`;
                        detailsText = `<span style="color: var(--text-muted); font-size: 12px;">Taken by ${parsed.teacher}.</span>`;
                    }
                }

                return `
                    <div class="flex-space" style="background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${s.label}</div>
                            <strong style="font-size: 15px; color: var(--text-main); display: block; margin: 2px 0;">
                                ${override ? override.subject : parsed.subject}
                            </strong>
                            <div style="margin-top: 4px;">${detailsText}</div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>
                `;
            }).join("");

            dailyLectureStatusHTML = `
                <div class="glass-card mb-24" style="border: 1.5px solid var(--accent);">
                    <div class="card-header-flex mb-16">
                        <h3 class="card-title"><i class="fa-solid fa-business-time mr-8" style="color: var(--accent);"></i> Today's Lecture Tracker</h3>
                        <span class="attendance-status-pill status-active" style="font-size: 11px;"><i class="fa-solid fa-clock-pulse fa-fade"></i> Live Updates</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${slotsHTML}
                    </div>
                </div>
            `;
        }

        let noticeBoardHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-bullhorn mr-8" style="color: var(--primary);"></i> Notice Board</h3>
                <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 8px;">
                    ${notices.length === 0 ? `<p style="color: var(--text-muted); font-size: 13px; text-align: center;">No notices published for your program.</p>` : 
                    notices.map(n => `
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                            <div class="flex-space mb-4">
                                <strong style="color: var(--text-main); font-size: 14px;">${n.title}</strong>
                                <span style="font-size: 10px; color: var(--text-muted);">${new Date(n.created_at).toLocaleString()}</span>
                            </div>
                            <p style="color: var(--text-muted); font-size: 12px; margin: 0; line-height: 1.4;">${n.content}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;

        dynamicContentArea.innerHTML = `
            ${dailyLectureStatusHTML}

            <div class="stats-grid mb-24">
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Attendance Rate</span>
                        <div class="stat-icon" style="background: rgba(20, 184, 166, 0.1); color: var(--accent);"><i class="fa-solid fa-percent"></i></div>
                    </div>
                    <div class="stat-value">${rate}%</div>
                    <div class="stat-desc">Minimum required is 75%</div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Lectures Attended</span>
                        <div class="stat-icon" style="background: rgba(99, 102, 241, 0.1); color: var(--primary);"><i class="fa-solid fa-check-double"></i></div>
                    </div>
                    <div class="stat-value">${presentCount} / ${history.length}</div>
                    <div class="stat-desc">Total class sessions held</div>
                </div>
            </div>

            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-address-card mr-8"></i> Student Profile Card</h3>
                <div class="form-grid">
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Full Name</span>
                        <strong style="font-size: 16px;">${currentUser.name}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Roll Number</span>
                        <strong style="font-size: 16px;">${currentUser.username}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Gender</span>
                        <strong style="font-size: 16px;">${currentUser.gender || 'Male'}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Department / Major</span>
                        <strong style="font-size: 16px;">${currentUser.department || 'B.Com NEP'}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Division / Class</span>
                        <strong style="font-size: 16px;">Division ${currentUser.division} | ${currentUser.class}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 12px; display: block;">Program</span>
                        <strong style="font-size: 16px;">${currentUser.program} (${currentUser.year})</strong>
                    </div>
                </div>
            </div>

            ${noticeBoardHTML}
        `;
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load dashboard statistics.</p></div>`;
    }
};

window.renderStudentTimetable = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        let semester = currentUser.semester;
        if (!semester || semester === '0.0') {
            const cls = (currentUser.class || '').toUpperCase();
            if (cls.includes('SEM-V') || cls.includes('SEM-5')) semester = 'Semester 5';
            else if (cls.includes('SEM-III') || cls.includes('SEM-3')) semester = 'Semester 3';
            else if (cls.includes('SEM-I') || cls.includes('SEM-1')) semester = 'Semester 1';
            else if (cls.includes('SEM-II') || cls.includes('SEM-2')) semester = 'Semester 2';
            else if (cls.includes('SEM-IV') || cls.includes('SEM-4')) semester = 'Semester 4';
            else if (cls.includes('SEM-VI') || cls.includes('SEM-6')) semester = 'Semester 6';
        }
        
        let program = currentUser.program;
        if (!program || program === '1st Year' || program === '2nd Year' || program === '3rd Year') {
            program = 'B.Com (Regular)';
        }
        
        let division = currentUser.division;
        if (!division || division === 'B.Com (Regular)' || division === 'B.Com (Professional)') {
            division = currentUser.department || 'A';
        }

        const progKey = `${program} - ${semester} - Div ${division}`;
        const res = await fetch(`/api/timetables?program=${encodeURIComponent(progKey)}`);
        const data = await res.json();
        let tRows = data.timetables || [];
        
        if (tRows.length === 0) {
            // Fallback to default program timetable if division-specific one is not yet defined
            const fallbackRes = await fetch(`/api/timetables?program=${encodeURIComponent(currentUser.program)}`);
            const fallbackData = await fallbackRes.json();
            tRows = fallbackData.timetables || [];
        }

        // Build a map day -> slots
        const ttMap = {};
        tRows.forEach(row => {
            ttMap[row.day] = {
                slot_1: row.slot_1 || 'Free Slot',
                slot_2: row.slot_2 || 'Free Slot',
                slot_3: row.slot_3 || 'Free Slot',
                slot_4: row.slot_4 || 'Free Slot'
            };
        });

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        let tableBodyHTML = days.map(day => {
            const slots = ttMap[day] || { slot_1: 'Free Slot', slot_2: 'Free Slot', slot_3: 'Free Slot', slot_4: 'Free Slot' };
            return `
                <tr>
                    <td><strong>${day}</strong></td>
                    <td style="${slots.slot_1 === 'Free Slot' ? 'color: var(--text-muted);' : ''}">${slots.slot_1.replace('(', '<br><small>').replace(')', '</small>')}</td>
                    <td style="${slots.slot_2 === 'Free Slot' ? 'color: var(--text-muted);' : ''}">${slots.slot_2.replace('(', '<br><small>').replace(')', '</small>')}</td>
                    <td style="${slots.slot_3 === 'Free Slot' ? 'color: var(--text-muted);' : ''}">${slots.slot_3.replace('(', '<br><small>').replace(')', '</small>')}</td>
                    <td style="${slots.slot_4 === 'Free Slot' ? 'color: var(--text-muted);' : ''}">${slots.slot_4.replace('(', '<br><small>').replace(')', '</small>')}</td>
                </tr>
            `;
        }).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <div class="card-header-flex mb-16">
                    <h3 class="card-title">Class Timetable - ${currentUser.program} (Div ${currentUser.division})</h3>
                    <span class="attendance-status-pill status-active"><i class="fa-solid fa-clock"></i> Weekly Class Schedule</span>
                </div>
                
                <div class="table-responsive">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Day</th>
                                <th>Slot 1 (9:00 - 9:55)</th>
                                <th>Slot 2 (10:00 - 10:55)</th>
                                <th>Slot 3 (11:00 - 11:55)</th>
                                <th>Slot 4 (12:00 - 12:55)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableBodyHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load timetable.</p></div>`;
    }
};

window.renderStudentAttendance = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch(`/api/attendance/student/${currentUser.id}/history`);
        const data = await res.json();
        
        const history = data.records || [];
        const tableRows = history.map(r => {
            const statusStr = (r.status || '').toLowerCase();
            let statusPill = `<span class="attendance-status-pill status-active">PRESENT</span>`;
            if (statusStr === 'absent') {
                statusPill = `<span class="attendance-status-pill status-absent">ABSENT</span>`;
            } else if (statusStr === 'flagged') {
                statusPill = `<span class="attendance-status-pill status-absent" style="background: var(--danger); color: white; border: none; font-size: 11px;"><i class="fa-solid fa-triangle-exclamation mr-4"></i> FLAGGED</span>`;
            } else if (statusStr === 'pending') {
                statusPill = `<span class="attendance-status-pill status-warning" style="background: var(--warning); color: black; border: none; font-size: 11px;"><i class="fa-solid fa-hourglass-half mr-4"></i> PENDING</span>`;
            }
            return `
                <tr>
                    <td><strong>${r.code}</strong></td>
                    <td>${r.subject}</td>
                    <td>${r.class_name}</td>
                    <td>${parseUTCDate(r.marked_at) ? parseUTCDate(r.marked_at).toLocaleString() : '--'}</td>
                    <td>${statusPill}</td>
                </tr>
            `;
        }).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-qrcode mr-8"></i> Digital Check-in Console</h3>
                <div style="font-size: 11px; color: var(--accent); margin-bottom: 12px; font-weight: 500;">
                    <i class="fa-solid fa-shield-halved"></i> Anti-Proxy Protection Active (Locked to device ID: <code>${deviceId.substring(0, 12)}...</code>)
                </div>
                <form id="student-checkin-form" style="max-width: 480px; display: flex; gap: 12px;">
                    <input type="text" id="checkin-code-input" class="form-control" placeholder="Enter active code (e.g. 482934)" required max="999999" pattern="\\d{6}" title="6-digit security code">
                    <button type="submit" class="btn btn-primary" style="width: 140px;">
                        <i class="fa-solid fa-circle-check"></i> Check In
                    </button>
                </form>
            </div>

            <div class="glass-card">
                <h3 class="card-title mb-16">Attendance History Logs</h3>
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Session Code</th>
                                <th>Subject</th>
                                <th>Class</th>
                                <th>Checked-in At</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows.length > 0 ? tableRows : `<tr><td colspan="5" style="color: var(--text-muted); padding: 24px;">No attendance logged yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const checkinForm = document.getElementById("student-checkin-form");
        if (checkinForm) {
            checkinForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const code = document.getElementById("checkin-code-input").value.trim();
                
                getGPSCoordinates(
                    async (position) => {
                        await submitCheckin(code, position.coords.latitude, position.coords.longitude, position.coords.accuracy);
                    },
                    async (err) => {
                        console.warn("GPS lookup failed, submitting null coordinates:", err);
                        await submitCheckin(code, null, null, null);
                    }
                );
            });
        }
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load check-in portal.</p></div>`;
    }
};

let activeSse = null;
let lockdownSessionId = null;

function handleVisibilityChange() {
    if (document.hidden && lockdownSessionId) {
        logLockdownViolation("TAB_SWITCHED");
    }
}


function handleFullscreenChange() {
    if (!document.fullscreenElement && lockdownSessionId) {
        logLockdownViolation("EXIT_FULLSCREEN");
        // Re-request fullscreen
        setTimeout(() => {
            if (lockdownSessionId) {
                const el = document.documentElement;
                if (typeof el.requestFullscreen === "function") {
                    el.requestFullscreen().catch(() => {});
                } else if (typeof el.webkitRequestFullscreen === "function") {
                    el.webkitRequestFullscreen();
                }
            }
        }, 1000);
    }
}

function handleBeforeUnload(e) {
    if (lockdownSessionId) {
        e.preventDefault();
        e.returnValue = "Leaving this page will void your attendance.";
        return e.returnValue;
    }
}

async function logLockdownViolation(type) {
    if (!lockdownSessionId) return;
    try {
        const response = await fetch('/api/attendance/session/violate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: lockdownSessionId,
                student_id: currentUser.id,
                type: type
            })
        });
        const data = await response.json();
        if (data.success && data.warning) {
            // Display custom float warning banner
            let banner = document.getElementById("lockdown-warning-banner");
            if (!banner) {
                banner = document.createElement("div");
                banner.id = "lockdown-warning-banner";
                banner.style.position = "fixed";
                banner.style.top = "20px";
                banner.style.left = "50%";
                banner.style.transform = "translateX(-50%)";
                banner.style.background = "rgba(245, 158, 11, 0.95)";
                banner.style.color = "#000000";
                banner.style.padding = "16px 24px";
                banner.style.borderRadius = "12px";
                banner.style.boxShadow = "0 10px 25px rgba(0,0,0,0.3)";
                banner.style.zIndex = "999999";
                banner.style.fontWeight = "bold";
                banner.style.textAlign = "center";
                banner.style.maxWidth = "90%";
                banner.style.width = "400px";
                banner.style.animation = "slideDown 0.4s ease-out";
                document.body.appendChild(banner);
            }
            
            banner.innerHTML = `
                <div style="font-size: 16px; margin-bottom: 8px;">⚠️ Focus Violation Warning</div>
                <div style="font-size: 13px; font-weight: normal;">You exited the lockdown environment. This is warning <strong>${data.violations_count}</strong>. Next violation will void your attendance!</div>
                <button class="btn btn-sm btn-dark" style="margin-top: 12px; background: #000; color: #fff; border: none; padding: 6px 12px; font-weight: bold; border-radius: 6px; cursor: pointer;" onclick="document.getElementById('lockdown-warning-banner').remove()">Dismiss Warning</button>
            `;

            // Re-request fullscreen to keep anti-tamper locked
            const el = document.documentElement;
            if (typeof el.requestFullscreen === "function") {
                el.requestFullscreen().catch(() => {});
            } else if (typeof el.webkitRequestFullscreen === "function") {
                el.webkitRequestFullscreen();
            }

            setTimeout(() => {
                const b = document.getElementById("lockdown-warning-banner");
                if (b) b.remove();
            }, 10000);
        } else {
            window.exitAttendanceLockdown(false);
        }
    } catch (e) {
        window.exitAttendanceLockdown(false);
    }
}


window.startAttendanceLockdown = async function(sessionId) {
    const el = document.documentElement;
    if (typeof el.requestFullscreen === "function") {
        el.requestFullscreen().catch(err => {
            console.warn("Fullscreen request rejected:", err);
        });
    } else if (typeof el.webkitRequestFullscreen === "function") {
        el.webkitRequestFullscreen();
    } else {
        console.warn("Fullscreen API not supported on this browser/device.");
    }

    setTimeout(() => {
        lockdownSessionId = sessionId;
    }, 5000);

    dynamicContentArea.innerHTML = `
        <div class="glass-card text-center" style="padding: 60px 20px; border: 2px solid var(--danger); position: relative; overflow: hidden;">
            <div style="margin-bottom: 24px;">
                <i class="fa-solid fa-shield-halved fa-beat" style="font-size: 64px; color: var(--danger); margin-bottom: 20px;"></i>
                <h2 style="color: var(--danger); margin-bottom: 12px;">Anti-Tamper Lockdown Active</h2>
                <p style="font-size: 15px; font-weight: 500;">Your check-in is complete. Status: <strong style="color: var(--warning);" id="lockdown-status-label">PENDING VERIFICATION</strong>.</p>
                <p style="color: var(--text-muted); font-size: 13px; max-width: 480px; margin: 12px auto 0;">
                    Do NOT switch tabs, minimize the browser, or exit fullscreen. Any focus loss will be immediately flagged to the professor in real-time.
                </p>
            </div>
            <div style="margin-top: 30px;" id="lockdown-status-area">
                <i class="fa-solid fa-spinner fa-spin-pulse" style="font-size: 36px; color: var(--danger); margin-bottom: 12px;"></i>
                <div style="font-size: 12px; color: var(--text-muted);">
                    Waiting for the instructor to release the final verification code...
                </div>
            </div>
        </div>
    `;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload, { capture: true });

    let expiresAt = null;
    let sessionExpiryTime = null;
    try {
        const sRes = await fetch(`/api/attendance/student/${currentUser.id}/active-checkin`);
        const sData = await sRes.json();
        if (sData.success && sData.record) {
            expiresAt = sData.record.expires_at;
            sessionExpiryTime = new Date(expiresAt).getTime();
        }
    } catch (e) {
        console.error("Error fetching active checkin details:", e);
    }

    const standbyInterval = setInterval(async () => {
        if (!lockdownSessionId) {
            clearInterval(standbyInterval);
            return;
        }

        if (sessionExpiryTime && Date.now() > sessionExpiryTime) {
            clearInterval(standbyInterval);
            window.exitAttendanceLockdown(true);
            return;
        }

        try {
            const res = await fetch(`/api/attendance/student/${currentUser.id}/active-checkin`);
            const data = await res.json();
            if (data.success) {
                if (!data.active) {
                    clearInterval(standbyInterval);
                    window.exitAttendanceLockdown(true);
                }
            } else {
                clearInterval(standbyInterval);
                window.exitAttendanceLockdown(true);
            }
        } catch (e) {}
    }, 5000);

    activeSse = new EventSource(`/api/attendance/session/${sessionId}/stream`);
    activeSse.addEventListener('SESSION_CLOSED', (e) => {
        clearInterval(standbyInterval);
        window.exitAttendanceLockdown(true);
    });

    activeSse.addEventListener('VERIFICATION_STARTED', (e) => {
        const verificationArea = document.getElementById("lockdown-status-area");
        if (verificationArea) {
            verificationArea.innerHTML = `
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 24px;">
                    <h3 style="color: var(--warning); margin-bottom: 8px;">Final Verification Required</h3>
                    <p style="color: var(--text-muted); font-size: 13px;">Enter the second verification code currently displayed on the classroom screen:</p>
                    <input type="text" id="lockdown-code2-input" class="form-control text-center" placeholder="000000" style="font-size: 24px; letter-spacing: 4px; max-width: 240px; margin: 16px auto; font-weight: bold; color: var(--warning);">
                    <button class="btn btn-warning" id="lockdown-verify-btn" style="color: black; font-weight: bold; cursor: pointer;">
                        <i class="fa-solid fa-circle-check mr-8"></i> Complete Verification
                    </button>
                    <div id="verification-error-msg" style="color: var(--danger); font-size: 12px; margin-top: 8px;"></div>
                </div>
            `;

            const verifyBtn = document.getElementById("lockdown-verify-btn");
            verifyBtn.addEventListener("click", async () => {
                const code2Input = document.getElementById("lockdown-code2-input");
                const code2Val = code2Input.value.trim();
                if (!code2Val) {
                    alert("Please enter the verification code.");
                    return;
                }

                verifyBtn.disabled = true;
                verifyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Verifying...`;

                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        await submitCode2(sessionId, code2Val, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, verifyBtn);
                    },
                    async (err) => {
                        await submitCode2(sessionId, code2Val, null, null, null, verifyBtn);
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            });
        }
    });
};

async function submitCode2(sessionId, code2, lat, lon, accuracy, button) {
    const errorDiv = document.getElementById("verification-error-msg");
    if (errorDiv) errorDiv.textContent = "";

    try {
        const response = await fetch('/api/attendance/verify-code2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                student_id: currentUser.id,
                code2: code2,
                student_lat: lat,
                student_lon: lon,
                student_accuracy: accuracy
            })
        });

        const data = await response.json();
        if (data.success) {
            const statusLabel = document.getElementById("lockdown-status-label");
            if (statusLabel) {
                statusLabel.textContent = "VERIFIED (PRESENT)";
                statusLabel.style.color = "var(--success)";
            }
            const standbyArea = document.getElementById("lockdown-status-area");
            if (standbyArea) {
                standbyArea.innerHTML = `
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 24px; text-align: center;">
                        <i class="fa-solid fa-circle-check fa-beat" style="font-size: 56px; color: var(--success); margin-bottom: 16px;"></i>
                        <h3 style="color: var(--success); margin-bottom: 8px;">Verification Successful!</h3>
                        <p style="font-size: 15px; font-weight: 600; color: #ffffff;">Status: PRESENT</p>
                        <p style="color: var(--text-muted); font-size: 13px; max-width: 400px; margin: 12px auto 0;">
                            Please remain on this screen. Fullscreen anti-tamper tracking is still active.
                        </p>
                        <div style="margin-top: 24px;">
                            <i class="fa-solid fa-spinner fa-spin-pulse" style="font-size: 24px; color: var(--success); margin-bottom: 8px;"></i>
                            <p style="font-size: 12px; color: var(--text-muted);">Waiting for the instructor to close the session...</p>
                        </div>
                    </div>
                `;
            }
        } else {
            if (errorDiv) errorDiv.textContent = data.error || "Verification failed.";
            button.disabled = false;
            button.innerHTML = `<i class="fa-solid fa-circle-check mr-8"></i> Complete Verification`;
        }
    } catch (err) {
        if (errorDiv) errorDiv.textContent = "Network error. Please try again.";
        button.disabled = false;
        button.innerHTML = `<i class="fa-solid fa-circle-check mr-8"></i> Complete Verification`;
    }
}

window.exitAttendanceLockdown = function(success) {
    lockdownSessionId = null;
    
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(() => {});
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('beforeunload', handleBeforeUnload, { capture: true });

    if (activeSse) {
        activeSse.close();
        activeSse = null;
    }

    if (success) {
        dynamicContentArea.innerHTML = `
            <div class="glass-card text-center" style="padding: 60px 20px; border: 2px solid var(--success);">
                <div style="margin-bottom: 24px;">
                    <i class="fa-solid fa-circle-check" style="font-size: 64px; color: var(--success); margin-bottom: 20px;"></i>
                    <h2 style="color: var(--success); margin-bottom: 12px;">Attendance Completed</h2>
                    <p style="font-size: 15px; font-weight: 500;">Your check-in has been successfully finalized and saved.</p>
                </div>
                <div style="margin-top: 30px;">
                    <button class="btn btn-primary" onclick="window.renderStudentAttendance()">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        `;
    } else {
        dynamicContentArea.innerHTML = `
            <div class="glass-card text-center" style="padding: 60px 20px; border: 2px solid var(--danger);">
                <div style="margin-bottom: 24px;">
                    <i class="fa-solid fa-ban fa-beat" style="font-size: 64px; color: var(--danger); margin-bottom: 20px;"></i>
                    <h2 style="color: var(--danger); margin-bottom: 12px;">Lockdown Violated</h2>
                    <p style="font-size: 15px; font-weight: 500; color: var(--text);">Your attendance has been flagged and voided.</p>
                    <p style="color: var(--text-muted); font-size: 13px; max-width: 480px; margin: 12px auto 0;">
                        You left the active attendance screen or exited fullscreen before the session completed. This violation has been reported to the instructor in real-time.
                    </p>
                </div>
                <div style="margin-top: 30px;">
                    <button class="btn btn-secondary" onclick="window.renderStudentAttendance()">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        `;
    }
};

async function submitCheckin(code, lat, lon, accuracy) {
    try {
        const submitRes = await fetch('/api/attendance/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                code, 
                student_id: currentUser.id, 
                device_id: deviceId,
                student_lat: lat,
                student_lon: lon,
                student_accuracy: accuracy
            })
        });
        const submitData = await submitRes.json();
        
        if (submitData.success) {
            window.startAttendanceLockdown(submitData.session_id);
        } else {
            alert(submitData.error || "Check-in failed.");
            if (submitData.error && (submitData.error.includes("Student record not found") || submitRes.status === 404)) {
                alert("Your session has expired or is invalid. You will be logged out. Please log in again to sync your details.");
                localStorage.removeItem("es_current_user");
                location.reload();
            }
        }
    } catch (err) {
        console.error(err);
        alert("Error submitting check-in.");
    }
}

window.renderStudentFees = function() {
    dynamicContentArea.innerHTML = `
        <div class="glass-card mb-24 text-center" style="padding: 40px 20px;">
            <div style="margin-bottom: 24px;">
                <i class="fa-solid fa-credit-card" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;"></i>
                <h3>Fee Payment Portal</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">Access the online fee payment gateway to clear your semester dues.</p>
            </div>
            
            <div class="text-center">
                <a href="https://share.google/x83WwiwJV409pKHzP" target="_blank" id="student-pay-now-btn" class="btn btn-primary" style="text-decoration: none; max-width: 320px; margin: 0 auto; display: inline-flex; align-items: center; justify-content: center; height: 44px; font-weight: 600;">
                    <i class="fa-solid fa-wallet mr-8"></i>
                    <span>Pay Now with eShiksa</span>
                </a>
            </div>
        </div>
    `;

    const payBtn = document.getElementById("student-pay-now-btn");
    if (payBtn) {
        payBtn.addEventListener("click", async () => {
            // Auto update status in backend database
            try {
                await fetch('/api/sql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: `UPDATE users SET fee_paid = fee_total, fee_due = 0 WHERE id = ${currentUser.id};`
                    })
                });
            } catch (e) {
                console.error("Error updating fees in database:", e);
            }

            // Auto update in current session local storage
            currentUser.fee_paid = currentUser.fee_total;
            currentUser.fee_due = 0;
            localStorage.setItem("es_current_user", JSON.stringify(currentUser));
            
            // Re-render view after a brief timeout to allow new tab to launch
            setTimeout(() => {
                window.renderStudentFees();
                alert("Payment detected! Your fee payment status has been auto-updated to PAID.");
            }, 1000);
        });
    }
};

window.openPaymentModal = function(amount) {
    feeModalDueAmt.textContent = `₹${amount.toFixed(2)}`;
    feePayStudentId.value = currentUser.id;
    feeModal.classList.add("active");
};

if (feePayForm) {
    feePayForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        alert("Payment Simulated Successfully! Outstanding balance cleared.");
        feeModal.classList.remove("active");
        
        currentUser.fee_paid = currentUser.fee_total;
        currentUser.fee_due = 0;
        localStorage.setItem("es_current_user", JSON.stringify(currentUser));
        
        try {
            await fetch('/api/sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `UPDATE users SET fee_paid = ${currentUser.fee_total}, fee_due = 0 WHERE id = ${currentUser.id};`
                })
            });
        } catch (e) {}

        navigateTo("fees");
    });
}

window.renderStudentProfile = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    let allowStudentEdit = true;
    try {
        const permRes = await fetch('/api/settings/profile-permissions');
        const permData = await permRes.json();
        allowStudentEdit = permData.allow_student_profile_edit !== false;
    } catch (e) {
        console.error(e);
    }

    const isLocked = !allowStudentEdit || currentUser.profile_locked === 1 || currentUser.profile_locked === '1';
    const isPassLocked = currentUser.password_locked === 1 || currentUser.password_locked === '1';
    
    dynamicContentArea.innerHTML = `
        <div class="glass-card mb-24">
            <h3 class="card-title mb-16"><i class="fa-solid fa-shield-halved mr-8"></i> Security & Details</h3>
            <div class="form-grid mb-24">
                <div>
                    <label>Full Name</label>
                    <input type="text" id="profile-name" class="form-control" value="${currentUser.name || ''}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Roll Number (Username)</label>
                    <input type="text" id="profile-roll-no" class="form-control" value="${currentUser.username ? currentUser.username.replace(/^(I|II|III|IV|V|VI)/, '') : ''}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Gender</label>
                    ${isLocked ? `
                        <input type="text" class="form-control" value="${currentUser.gender || 'Male'}" disabled>
                    ` : `
                        <select id="profile-gender" class="form-control">
                            <option value="Male" ${currentUser.gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${currentUser.gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                    `}
                </div>
                <div>
                    <label>Email ID</label>
                    <input type="email" id="profile-email" class="form-control" value="${currentUser.email || ''}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Contact Phone</label>
                    <input type="text" id="profile-phone" class="form-control" value="${currentUser.phone || ''}" ${isLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Category</label>
                    ${isLocked ? `
                        <input type="text" class="form-control" value="${currentUser.category || 'General'}" disabled>
                    ` : `
                        <select id="profile-category" class="form-control">
                            <option value="General" ${currentUser.category === 'General' ? 'selected' : ''}>General</option>
                            <option value="SEBC" ${currentUser.category === 'SEBC' ? 'selected' : ''}>SEBC</option>
                            <option value="SC" ${currentUser.category === 'SC' ? 'selected' : ''}>SC</option>
                            <option value="ST" ${currentUser.category === 'ST' ? 'selected' : ''}>ST</option>
                        </select>
                    `}
                </div>
            </div>
            
            ${isLocked ? `
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 12px;">
                    <i class="fa-solid fa-circle-info"></i> ${!allowStudentEdit ? 'Profile editing has been disabled by the administrator.' : 'Profile modification is locked. Please contact the college registrar office for major data changes.'}
                </p>
            ` : `
                <div style="margin-top: 24px;">
                    <button class="btn btn-primary" id="save-student-profile-btn">
                        <i class="fa-solid fa-lock mr-8"></i> Save & Lock Profile
                    </button>
                    <p style="font-size: 12px; color: var(--danger); margin-top: 12px;">
                        <i class="fa-solid fa-triangle-exclamation"></i> Warning: You can only edit your profile details ONCE. After saving, these fields will be locked permanently.
                    </p>
                </div>
            `}
        </div>

        <div class="glass-card">
            <h3 class="card-title mb-16"><i class="fa-solid fa-key mr-8"></i> Password Management</h3>
            <div class="form-grid mb-24" style="max-width: 480px;">
                <div>
                    <label>New Password</label>
                    <input type="password" id="profile-new-password" class="form-control" placeholder="Enter new custom password" ${isPassLocked ? 'disabled' : ''}>
                </div>
            </div>
            
            ${isPassLocked ? `
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 12px;">
                    <i class="fa-solid fa-circle-info"></i> Password modification is locked. You have already changed your password once.
                </p>
            ` : `
                <div style="margin-top: 24px;">
                    <button class="btn btn-primary" id="save-student-password-btn">
                        <i class="fa-solid fa-lock mr-8"></i> Save & Lock Password
                    </button>
                    <p style="font-size: 12px; color: var(--danger); margin-top: 12px;">
                        <i class="fa-solid fa-triangle-exclamation"></i> Warning: You can only change your password ONCE. Make sure to write it down securely.
                    </p>
                </div>
            `}
        </div>
    `;

    if (!isLocked) {
        const saveBtn = document.getElementById("save-student-profile-btn");
        saveBtn.addEventListener("click", async () => {
            const nameInput = document.getElementById("profile-name");
            const rollInput = document.getElementById("profile-roll-no");
            const genderInput = document.getElementById("profile-gender");
            const emailInput = document.getElementById("profile-email");
            const phoneInput = document.getElementById("profile-phone");
            const categoryInput = document.getElementById("profile-category");

            const nameVal = nameInput.value.trim();
            const rollVal = rollInput.value.trim();
            const genderVal = genderInput ? genderInput.value : currentUser.gender;
            const emailVal = emailInput.value.trim();
            const phoneVal = phoneInput.value.trim();
            const categoryVal = categoryInput ? categoryInput.value : currentUser.category;

            if (!nameVal || !rollVal || !emailVal || !phoneVal) {
                alert("All profile fields must be filled.");
                return;
            }

            const confirmSave = confirm("Are you sure? Once saved, you will NOT be able to change any profile details again.");
            if (!confirmSave) return;

            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Saving...`;

            try {
                const response = await fetch('/api/student/update-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        student_id: currentUser.id,
                        name: nameVal,
                        gender: genderVal,
                        roll_no: rollVal,
                        email: emailVal,
                        phone: phoneVal,
                        category: categoryVal
                    })
                });

                const data = await response.json();
                if (data.success) {
                    alert(data.message);
                    currentUser = data.user;
                    localStorage.setItem("es_current_user", JSON.stringify(currentUser));
                    
                    // Update sidebar info dynamically
                    sidebarUserName.textContent = currentUser.name;
                    
                    window.renderStudentProfile();
                } else {
                    alert(data.error || "Failed to update profile.");
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = `<i class="fa-solid fa-lock mr-8"></i> Save & Lock Profile`;
                }
            } catch (err) {
                console.error(err);
                alert("Network error. Please try again.");
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fa-solid fa-lock mr-8"></i> Save & Lock Profile`;
            }
        });
    }

    if (!isPassLocked) {
        const savePassBtn = document.getElementById("save-student-password-btn");
        savePassBtn.addEventListener("click", async () => {
            const passInput = document.getElementById("profile-new-password");
            const passVal = passInput.value.trim();

            if (!passVal) {
                alert("Password field cannot be empty.");
                return;
            }

            const confirmSave = confirm("Are you sure? Once saved, you will NOT be able to change your password again.");
            if (!confirmSave) return;

            savePassBtn.disabled = true;
            savePassBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Saving...`;

            try {
                const response = await fetch('/api/student/update-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        student_id: currentUser.id,
                        password: passVal
                    })
                });

                const data = await response.json();
                if (data.success) {
                    alert(data.message);
                    currentUser = data.user;
                    localStorage.setItem("es_current_user", JSON.stringify(currentUser));
                    window.renderStudentProfile();
                } else {
                    alert(data.error || "Failed to update password.");
                    savePassBtn.disabled = false;
                    savePassBtn.innerHTML = `<i class="fa-solid fa-lock mr-8"></i> Save & Lock Password`;
                }
            } catch (err) {
                console.error(err);
                alert("Network error. Please try again.");
                savePassBtn.disabled = false;
                savePassBtn.innerHTML = `<i class="fa-solid fa-lock mr-8"></i> Save & Lock Password`;
            }
        });
    }
};


// =========================================================================
// TEACHER PORTAL MODULES
// =========================================================================

window.renderTeacherDashboard = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    const todayDateStr = (function() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    })();

    try {
        // Fetch current overrides to list them
        const res = await fetch(`/api/daily-lectures?date=${todayDateStr}`);
        const data = await res.json();
        const overrides = data.lectures || [];

        let overridesRowsHTML = overrides.map(o => `
            <tr>
                <td>${o.program} (Div ${o.division})</td>
                <td><strong>${o.slot.toUpperCase().replace('_', ' ')}</strong></td>
                <td>${o.subject}</td>
                <td>${o.original_teacher}</td>
                <td>
                    <span class="attendance-status-pill" style="
                        background: ${o.status === 'Free' ? 'rgba(239,68,68,0.1)' : (o.status === 'Substituted' ? 'rgba(245,158,11,0.1)' : 'rgba(168,85,247,0.1)')};
                        color: ${o.status === 'Free' ? 'var(--danger)' : (o.status === 'Substituted' ? 'var(--warning)' : 'var(--secondary)')};
                    ">
                        ${o.status.toUpperCase()}
                    </span>
                </td>
                <td>
                    ${o.status === 'Substituted' ? `Sub: ${o.substitute_teacher}` : ''}
                    ${o.status === 'Combined' ? `Combined Div: ${o.combined_division} ${o.notes ? `(${o.notes})` : ''}` : ''}
                    ${o.status === 'Scheduled' ? `Note: ${o.notes}` : ''}
                    ${o.status === 'Free' ? 'Cancelled' : ''}
                </td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="clearLectureAdjustment(${o.id})" style="padding: 2px 6px; font-size: 10px;">Clear</button>
                </td>
            </tr>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="stats-grid mb-24">
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Lectures Scheduled</span>
                        <div class="stat-icon" style="background: rgba(99,102,241,0.1); color: var(--primary);"><i class="fa-solid fa-calendar"></i></div>
                    </div>
                    <div class="stat-value">7</div>
                    <div class="stat-desc">Active lectures this week</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Assigned Program</span>
                        <div class="stat-icon" style="background: rgba(20, 184, 166, 0.1); color: var(--accent);"><i class="fa-solid fa-book"></i></div>
                    </div>
                    <div class="stat-value" style="font-size: 18px; line-height: 38px;">${currentUser.program || 'B.Com (Regular)'}</div>
                    <div class="stat-desc">Faculty Instruction Stream</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Assigned Major</span>
                        <div class="stat-icon" style="background: rgba(168,85,247,0.1); color: var(--secondary);"><i class="fa-solid fa-building-columns"></i></div>
                    </div>
                    <div class="stat-value" style="font-size: 18px; line-height: 38px;">${currentUser.subject || 'Statistics'}</div>
                    <div class="stat-desc">${currentUser.department || 'Commerce & Accountancy'}</div>
                </div>
            </div>

            <!-- DAILY TIMETABLE ADJUSTMENTS FORM -->
            <div class="glass-card mb-24" style="border: 1.5px solid var(--warning);">
                <h3 class="card-title mb-12" style="color: var(--warning);"><i class="fa-solid fa-arrows-down-to-people mr-8"></i> Today's Lecture Availability Declarations</h3>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">
                    Declare substitutions, combine classes, or mark cancelled slots for today. Students will see live notices immediately on their home screen.
                </p>
                <form id="lecture-adj-form" class="form-grid">
                    <div>
                        <label>Academic Program</label>
                        <select id="adj-program" class="form-control" required>
                            <option value="B.Com (Regular)">B.Com (Regular)</option>
                            <option value="B.Com (Professional)">B.Com (Professional)</option>
                            <option value="M.Com">M.Com</option>
                        </select>
                    </div>
                    <div>
                        <label>Division</label>
                        <select id="adj-division" class="form-control" required>
                            <option value="A">Division A</option>
                            <option value="B">Division B</option>
                            <option value="C">Division C</option>
                            <option value="D">Division D</option>
                            <option value="E">Division E</option>
                            <option value="F">Division F</option>
                            <option value="G">Division G</option>
                        </select>
                    </div>
                    <div>
                        <label>Lecture Slot</label>
                        <select id="adj-slot" class="form-control" required>
                            <option value="slot_1">Slot 1 (9:00 - 9:55)</option>
                            <option value="slot_2">Slot 2 (10:00 - 10:55)</option>
                            <option value="slot_3">Slot 3 (11:00 - 11:55)</option>
                            <option value="slot_4">Slot 4 (12:00 - 12:55)</option>
                        </select>
                    </div>
                    <div>
                        <label>Subject Title</label>
                        <input type="text" id="adj-subject" class="form-control" placeholder="e.g. Statistics" required>
                    </div>
                    <div>
                        <label>Original Professor</label>
                        <input type="text" id="adj-original-teacher" class="form-control" value="${currentUser.name}" required>
                    </div>
                    <div>
                        <label>Lecture Status Today</label>
                        <select id="adj-status" class="form-control" required>
                            <option value="Scheduled">Scheduled (Normal)</option>
                            <option value="Free">Free Lecture (Cancelled)</option>
                            <option value="Substituted">Substituted (Taken by other teacher)</option>
                            <option value="Combined">Combined (Merged with another division)</option>
                        </select>
                    </div>

                    <!-- SUB CONTAINER FOR SUBSTITUTION -->
                    <div id="sub-teacher-container" class="form-grid-full" style="display: none; margin-top: 8px;">
                        <label style="color: var(--warning);">Substitute Professor Name</label>
                        <input type="text" id="adj-substitute-teacher" class="form-control" placeholder="Enter name of professor taking this class">
                    </div>

                    <!-- SUB CONTAINER FOR COMBINATION -->
                    <div id="combined-div-container" class="form-grid" style="display: none; grid-column: span 2; margin-top: 8px;">
                        <div>
                            <label style="color: var(--secondary);">Combined with Division</label>
                            <select id="adj-combined-division" class="form-control">
                                <option value="A">Division A</option>
                                <option value="B">Division B</option>
                                <option value="C">Division C</option>
                                <option value="D">Division D</option>
                                <option value="E">Division E</option>
                                <option value="F">Division F</option>
                                <option value="G">Division G</option>
                            </select>
                        </div>
                        <div>
                            <label style="color: var(--secondary);">Class Venue / Room / Lecture Notes</label>
                            <input type="text" id="adj-notes" class="form-control" placeholder="e.g. Held in Seminar Hall / Room 105">
                        </div>
                    </div>

                    <div class="form-grid-full" style="margin-top: 10px;">
                        <button type="submit" class="btn btn-primary" style="max-width: 260px;"><i class="fa-solid fa-bullhorn mr-4"></i> Publish Daily Adjustment</button>
                    </div>
                </form>
            </div>

            <!-- TODAY'S ACTIVE ADJUSTMENTS LIST -->
            <div class="glass-card">
                <h3 class="card-title mb-16">Today's Timetable Adjustments Monitor</h3>
                <div class="table-responsive">
                    <table class="custom-table text-center" style="font-size: 11px;">
                        <thead>
                            <tr>
                                <th>Class Info</th>
                                <th>Slot</th>
                                <th>Subject</th>
                                <th>Original Professor</th>
                                <th>Status Today</th>
                                <th>Adjustment Details</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${overridesRowsHTML.length > 0 ? overridesRowsHTML : `<tr><td colspan="7" style="color: var(--text-muted); padding: 12px;">No modifications declared today. Default weekly timetables are active.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Handle Status Change toggles
        const statusSelect = document.getElementById("adj-status");
        const subContainer = document.getElementById("sub-teacher-container");
        const combContainer = document.getElementById("combined-div-container");

        statusSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            subContainer.style.display = (val === 'Substituted') ? 'block' : 'none';
            combContainer.style.display = (val === 'Combined') ? 'grid' : 'none';
        });

        // Submit Override
        const adjForm = document.getElementById("lecture-adj-form");
        adjForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const program = document.getElementById("adj-program").value;
            const division = document.getElementById("adj-division").value;
            const slot = document.getElementById("adj-slot").value;
            const subject = document.getElementById("adj-subject").value.trim();
            const original_teacher = document.getElementById("adj-original-teacher").value.trim();
            const status = statusSelect.value;
            const substitute_teacher = document.getElementById("adj-substitute-teacher").value.trim();
            const combined_division = document.getElementById("adj-combined-division").value;
            const notes = document.getElementById("adj-notes").value.trim();

            try {
                const saveRes = await fetch('/api/daily-lectures/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: todayDateStr, program, division, slot, subject, original_teacher, status,
                        substitute_teacher, combined_division, notes
                    })
                });
                const saveData = await saveRes.json();
                if (saveData.success) {
                    alert(saveData.message);
                    window.renderTeacherDashboard();
                } else {
                    alert(saveData.error);
                }
            } catch (err) {
                alert("Failed to submit adjustment.");
            }
        });

    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load teacher workspace.</p></div>`;
    }
};

window.clearLectureAdjustment = async function(id) {
    if (!confirm("Are you sure you want to delete this class override? Timetable slot will fall back to default.")) return;
    try {
        const res = await fetch('/api/daily-lectures/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            if (currentUser.role === 'teacher') {
                window.renderTeacherDashboard();
            } else {
                window.renderAdminDashboard();
            }
        }
    } catch (e) {
        alert("Failed to clear override.");
    }
};

window.renderTeacherStudents = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const allStudents = (data.users || []).filter(u => u.role === 'student');

        function renderRows(filtered) {
            return filtered.map(s => `
                <tr>
                    <td><strong>${s.username}</strong></td>
                    <td>${s.name}</td>
                    <td>${s.gender || 'Male'}</td>
                    <td>Division ${s.division} - ${s.year || '1st Year'}</td>
                    <td>${s.program || 'B.Com (Regular)'}</td>
                    <td><span class="attendance-status-pill status-active">${s.subject || 'Commerce'}</span></td>
                </tr>
            `).join("");
        }

        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px;">
                    <h3 class="card-title">Student Registry (Roster List)</h3>
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <input type="text" id="teacher-student-search" class="form-control" placeholder="Search by Name or Roll No..." style="width: 200px; padding: 4px 8px; font-size: 13px; height: 32px; margin: 0;">
                        <select id="teacher-student-program-filter" class="form-control" style="width: 170px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Programs</option>
                            <option value="B.Com (Regular)">B.Com (Regular)</option>
                            <option value="B.Com (Professional)">B.Com (Professional)</option>
                            <option value="M.Com">M.Com</option>
                        </select>
                        <select id="teacher-student-year-filter" class="form-control" style="width: 120px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Years</option>
                            <option value="1st Year">1st Year</option>
                            <option value="2nd Year">2nd Year</option>
                            <option value="3rd Year">3rd Year</option>
                        </select>
                        <select id="teacher-student-div-filter" class="form-control" style="width: 120px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Divisions</option>
                            <option value="A">Division A</option>
                            <option value="B">Division B</option>
                            <option value="C">Division C</option>
                            <option value="D">Division D</option>
                            <option value="E">Division E</option>
                            <option value="F">Division F</option>
                            <option value="G">Division G</option>
                        </select>
                        <span style="font-size: 13px; color: var(--text-muted);" id="teacher-student-count">${allStudents.length} students</span>
                    </div>
                </div>
                
                <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Roll Number</th>
                                <th>Full Name</th>
                                <th>Gender</th>
                                <th>Division</th>
                                <th>Program</th>
                                <th>Subject</th>
                            </tr>
                        </thead>
                        <tbody id="teacher-student-tbody">
                            ${renderRows(allStudents)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const searchInput = document.getElementById("teacher-student-search");
        const progFilter = document.getElementById("teacher-student-program-filter");
        const divFilter = document.getElementById("teacher-student-div-filter");
        const yearFilter = document.getElementById("teacher-student-year-filter");
        const tbody = document.getElementById("teacher-student-tbody");
        const countSpan = document.getElementById("teacher-student-count");

        const filterHandler = () => {
            const pVal = progFilter.value;
            const dVal = divFilter.value;
            const yVal = yearFilter.value;
            const q = searchInput.value.toLowerCase().trim();

            const filtered = allStudents.filter(s => {
                const matchesP = (pVal === "All") || (s.program === pVal);
                const matchesD = (dVal === "All") || (s.division === dVal);
                const matchesY = (yVal === "All") || (s.year === yVal);
                const matchesSearch = !q || 
                    (s.name && s.name.toLowerCase().includes(q)) || 
                    (s.username && String(s.username).toLowerCase().includes(q));
                return matchesP && matchesD && matchesY && matchesSearch;
            });

            tbody.innerHTML = renderRows(filtered);
            countSpan.textContent = `${filtered.length} students`;
        };

        searchInput.addEventListener("input", filterHandler);
        progFilter.addEventListener("change", filterHandler);
        divFilter.addEventListener("change", filterHandler);
        yearFilter.addEventListener("change", filterHandler);

    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load students roster.</p></div>`;
    }
};

window.renderTeacherTimetable = function() {
    dynamicContentArea.innerHTML = `
        <div class="glass-card">
            <h3 class="card-title mb-16">Faculty Lectures Schedule</h3>
            <div class="table-responsive">
                <table class="custom-table text-center">
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Slot 1 (9:00 - 9:55)</th>
                            <th>Slot 2 (10:00 - 10:55)</th>
                            <th>Slot 3 (11:00 - 11:55)</th>
                            <th>Slot 4 (12:00 - 12:55)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Monday</strong></td>
                            <td>Stat (Div A)<br><small>Room 101</small></td>
                            <td>BA (Div B)<br><small>Room 102</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                        <tr>
                            <td><strong>Tuesday</strong></td>
                            <td>BM (Div C)<br><small>Room 103</small></td>
                            <td>CS (Div D)<br><small>Room 104</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                        <tr>
                            <td><strong>Wednesday</strong></td>
                            <td>Stat (Div A)<br><small>Room 101</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                        <tr>
                            <td><strong>Thursday</strong></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td>BA (Div B)<br><small>Room 102</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                        <tr>
                            <td><strong>Friday</strong></td>
                            <td>BM (Div C)<br><small>Room 103</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                        <tr>
                            <td><strong>Saturday</strong></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td>CS (Div D)<br><small>Room 104</small></td>
                            <td style="color: var(--text-muted);">Free</td>
                            <td style="color: var(--text-muted);">Free</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

// attendance code generator page
window.renderTeacherSchedule = function() {
    dynamicContentArea.innerHTML = `
        <div class="glass-card mb-24" id="code-generation-form-card">
            <h3 class="card-title mb-16"><i class="fa-solid fa-gears mr-8"></i> Configure Attendance Session</h3>
            <form id="attendance-gen-form" class="form-grid">
                <div>
                    <label for="att-program">Academic Program</label>
                    <select id="att-program" class="form-control">
                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                        <option value="B.Com (Professional)">B.Com (Professional)</option>
                        <option value="M.Com">M.Com</option>
                    </select>
                </div>
                <div>
                    <label for="att-class">Semester Year</label>
                    <select id="att-class" class="form-control">
                        <option value="B.Com. Sem-I">B.Com. Sem-I</option>
                        <option value="B.Com. Sem-III">B.Com. Sem-III</option>
                        <option value="B.Com. Sem-V">B.Com. Sem-V</option>
                    </select>
                </div>
                <div>
                    <label for="att-subject">Subject</label>
                    <select id="att-subject" class="form-control">
                        <!-- Loaded Dynamically -->
                    </select>
                </div>
                <div>
                    <label for="att-division">Division Eligibility</label>
                    <select id="att-division" class="form-control">
                        <option value="A">Division A</option>
                        <option value="B">Division B</option>
                        <option value="C">Division C</option>
                        <option value="D">Division D</option>
                        <option value="E">Division E</option>
                        <option value="F">Division F</option>
                        <option value="G">Division G</option>
                        <option value="All">All Divisions</option>
                    </select>
                </div>
                <div>
                    <label for="att-lecture-slot">Lecture Slot</label>
                    <select id="att-lecture-slot" class="form-control">
                        <option value="Lecture 1">Lecture 1</option>
                        <option value="Lecture 2">Lecture 2</option>
                        <option value="Lecture 3">Lecture 3</option>
                        <option value="Lecture 4">Lecture 4</option>
                    </select>
                </div>
                <div>
                    <label for="att-duration">Expiration Time</label>
                    <select id="att-duration" class="form-control">
                        <option value="5">5 minutes</option>
                        <option value="10" selected>10 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">60 minutes</option>
                    </select>
                </div>

                <!-- ANTI-PROXY OPTIONS BLOCK -->
                <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 12px; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; margin-top: 10px;">
                    <div style="display: flex; gap: 24px; align-items: center;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; font-weight: 500; font-size: 13px; color: var(--accent);">
                            <input type="checkbox" id="att-require-gps" style="width: 18px; height: 18px; cursor: pointer;">
                            <span><i class="fa-solid fa-location-crosshairs mr-4"></i> Enforce GPS Geofencing</span>
                        </label>
                        <label style="display: none; align-items: center; gap: 8px; cursor: pointer; margin: 0; font-weight: 500; font-size: 13px; color: var(--accent);">
                            <input type="checkbox" id="att-is-rolling" style="width: 18px; height: 18px; cursor: pointer;">
                            <span><i class="fa-solid fa-arrows-spin mr-4"></i> Enable Rolling Codes (20s)</span>
                        </label>
                    </div>
                    
                    <div id="gps-radius-container" style="display: none; margin-top: 4px;">
                        <label for="att-gps-radius" style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Geofence Radius Threshold</label>
                        <select id="att-gps-radius" class="form-control" style="max-width: 320px; font-size: 12px; height: 32px; padding: 4px 8px;">
                            <option value="5">5 Meters (Extreme - Instant Proximity)</option>
                            <option value="10">10 Meters (Super Strict - Classroom Desk Area)</option>
                            <option value="25">25 Meters (Ultra Strict - Same Classroom)</option>
                            <option value="50">50 Meters (Strict - Same Room)</option>
                            <option value="100">100 Meters (Same Building)</option>
                            <option value="200">200 Meters (Campus Wing)</option>
                            <option value="500" selected>500 Meters (Recommended - Campus Wide)</option>
                            <option value="1000">1 Kilometer (Broad Area)</option>
                            <option value="5000">5 Kilometers (City/Regional Check)</option>
                        </select>
                    </div>
                </div>

                <div class="form-grid-full text-center" style="margin-top: 20px;">
                    <button type="submit" class="btn btn-primary" style="max-width: 320px; margin: 0 auto; display: flex;">
                        <i class="fa-solid fa-qrcode mr-8"></i>
                        <span>Generate Active Check-in Code</span>
                    </button>
                </div>
            </form>
        </div>

        <div class="glass-card" id="code-active-display-card" style="display: none; border: 1.5px solid var(--accent);">
            <div class="card-header-flex mb-16">
                <h3 class="card-title">Live Attendance Session Log</h3>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm" id="launch-projector-btn" style="padding: 6px 12px; display: none;"><i class="fa-solid fa-expand"></i> Launch Projector View</button>
                    <button class="btn btn-secondary btn-sm" id="export-session-btn" style="padding: 6px 12px; background: var(--success); border-color: var(--success); color: white;"><i class="fa-solid fa-file-excel mr-4"></i> Export Session</button>
                    <button class="btn btn-secondary btn-sm" id="btn-manual-attendance" style="padding: 6px 12px; background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.2); color: var(--primary);"><i class="fa-solid fa-user-check mr-4"></i> Manual Attendance</button>
                    <button class="btn btn-secondary btn-sm" id="btn-bulk-phone-checkin" style="padding: 6px 12px; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: #3b82f6;"><i class="fa-solid fa-mobile-screen mr-4"></i> Phone Check-in Assist</button>
                    <button class="btn btn-danger btn-sm" id="close-session-btn" style="padding: 6px 12px;"><i class="fa-solid fa-power-off"></i> Close Session Early</button>
                </div>
            </div>

            <div class="attendance-code-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px;">
                <span class="attendance-status-pill status-active" id="active-session-label"><i class="fa-solid fa-circle-dot fa-fade"></i> SESSION ACTIVE</span>
                <div class="attendance-code-number" id="active-code-display">000000</div>
                <div style="display: none; margin: 10px auto; text-align: center;">
                    <img id="active-session-qrcode" style="width: 180px; height: 180px; border: 4px solid white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" src="" alt="Dynamic QR Code">
                    <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px; font-weight: 500;">
                        <i class="fa-solid fa-arrows-rotate fa-spin mr-4"></i> QR Code rotates every 15 seconds
                    </p>
                </div>
                <p style="color: var(--text-muted); font-size: 13px;" id="active-session-desc">
                    Show this code on the classroom projector screen.
                </p>
                <div id="active-session-verification-wrapper" style="width: 100%; text-align: center; margin-top: 10px;">
                    <button class="btn btn-warning" id="start-verification-btn" style="width: 100%; max-width: 280px; font-weight: bold; color: black;">
                        <i class="fa-solid fa-hourglass-start mr-8"></i> Start Verification Phase (Code 2)
                    </button>
                </div>
                <div style="font-size: 12px; margin-top: 8px; color: var(--accent);" id="active-session-timer">Expires at: --:--</div>
            </div>

            <h4 class="mb-12" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span><i class="fa-solid fa-users-viewfinder mr-8"></i> Checked-in Students (<span id="checked-in-count">0</span>)</span>
                <input type="text" id="active-session-search" class="form-control" placeholder="Search student name or roll..." style="width: 220px; font-size: 11px; height: 28px; padding: 4px 8px; margin: 0;">
            </h4>
            
            <div class="table-responsive">
                <table class="custom-table text-center" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th>Roll Number</th>
                            <th>Student Name</th>
                            <th>Gender</th>
                            <th>Division</th>
                            <th>Marked At</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="checked-in-records-list">
                        <tr><td colspan="7" style="color: var(--text-muted); padding: 12px;">Waiting for student check-ins...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const progSel = document.getElementById("att-program");
    const subSel = document.getElementById("att-subject");
    const classSel = document.getElementById("att-class");

    // Load subjects for selected program dynamically
    async function loadSubjects(program) {
        try {
            subSel.innerHTML = `<option value="">Loading subjects...</option>`;
            const res = await fetch(`/api/subjects?program=${encodeURIComponent(program)}`);
            const data = await res.json();
            const subjects = data.subjects || [];

            if (subjects.length === 0) {
                subSel.innerHTML = `<option value="Statistics">Statistics (Fallback)</option><option value="Accountancy">Accountancy (Fallback)</option>`;
            } else {
                subSel.innerHTML = subjects.map(s => `<option value="${s.name}" data-semester="${s.semester}">${s.name} (${s.code})</option>`).join("");
            }

            autoSelectSubject();
        } catch (e) {
            subSel.innerHTML = `<option value="Statistics">Statistics (Fallback)</option>`;
        }
    }

    function autoSelectSubject() {
        if (currentUser.role === 'teacher' && currentUser.subject) {
            const teacherSubjects = currentUser.subject.split(',').map(s => s.trim());
            const selectedClass = classSel.value;
            
            let targetSem = "";
            if (selectedClass.includes("Sem-I")) targetSem = "Semester 1";
            else if (selectedClass.includes("Sem-II")) targetSem = "Semester 2";
            else if (selectedClass.includes("Sem-III")) targetSem = "Semester 3";
            else if (selectedClass.includes("Sem-IV")) targetSem = "Semester 4";
            else if (selectedClass.includes("Sem-V")) targetSem = "Semester 5";
            else if (selectedClass.includes("Sem-VI")) targetSem = "Semester 6";

            const options = Array.from(subSel.options);
            let match = options.find(opt => {
                const optSem = opt.getAttribute("data-semester") || "";
                return optSem === targetSem && teacherSubjects.includes(opt.value);
            });

            if (!match) {
                match = options.find(opt => teacherSubjects.includes(opt.value));
            }

            if (match) {
                subSel.value = match.value;
            }
        }
    }

    function loadClasses(program) {
        if (program === 'M.Com') {
            classSel.innerHTML = `
                <option value="M.Com. Sem-I">M.Com. Sem-I</option>
                <option value="M.Com. Sem-II">M.Com. Sem-II</option>
                <option value="M.Com. Sem-III">M.Com. Sem-III</option>
                <option value="M.Com. Sem-IV">M.Com. Sem-IV</option>
            `;
        } else if (program === 'B.Com (Professional)') {
            classSel.innerHTML = `
                <option value="B.Com. Prof. Sem-I">B.Com. Prof. Sem-I</option>
                <option value="B.Com. Prof. Sem-II">B.Com. Prof. Sem-II</option>
                <option value="B.Com. Prof. Sem-III">B.Com. Prof. Sem-III</option>
                <option value="B.Com. Prof. Sem-IV">B.Com. Prof. Sem-IV</option>
                <option value="B.Com. Prof. Sem-V">B.Com. Prof. Sem-V</option>
                <option value="B.Com. Prof. Sem-VI">B.Com. Prof. Sem-VI</option>
            `;
        } else {
            classSel.innerHTML = `
                <option value="B.Com. Sem-I">B.Com. Sem-I</option>
                <option value="B.Com. Sem-II">B.Com. Sem-II</option>
                <option value="B.Com. Sem-III">B.Com. Sem-III</option>
                <option value="B.Com. Sem-IV">B.Com. Sem-IV</option>
                <option value="B.Com. Sem-V">B.Com. Sem-V</option>
                <option value="B.Com. Sem-VI">B.Com. Sem-VI</option>
            `;
        }
    }

    // Default load based on teacher program
    if (currentUser.program) {
        progSel.value = currentUser.program;
    }
    loadSubjects(progSel.value);
    loadClasses(progSel.value);

    progSel.addEventListener("change", (e) => {
        loadSubjects(e.target.value);
        loadClasses(e.target.value);
    });

    classSel.addEventListener("change", autoSelectSubject);

    const reqGpsCheck = document.getElementById("att-require-gps");
    const gpsRadCont = document.getElementById("gps-radius-container");
    if (reqGpsCheck && gpsRadCont) {
        reqGpsCheck.addEventListener("change", (e) => {
            gpsRadCont.style.display = e.target.checked ? "block" : "none";
        });
    }

    const activeCard = document.getElementById("code-active-display-card");
    const formCard = document.getElementById("code-generation-form-card");
    const genForm = document.getElementById("attendance-gen-form");
    const projectorBtn = document.getElementById("launch-projector-btn");

    let currentSessionObj = null;

    if (genForm) {
        genForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const className = document.getElementById("att-class").value;
            const subject = subSel.value;
            const division = document.getElementById("att-division").value;
            const program = progSel.value;
            const duration = document.getElementById("att-duration").value;
            const requireGps = document.getElementById("att-require-gps").checked;
            const isRolling = false;
            const geofenceRadius = document.getElementById("att-gps-radius").value;
            const lectureSlot = document.getElementById("att-lecture-slot").value;

            if (requireGps) {
                getGPSCoordinates(
                    async (position) => {
                        await sendCreateSession(className, subject, division, program, duration, true, position.coords.latitude, position.coords.longitude, false, geofenceRadius, lectureSlot);
                    },
                    async (err) => {
                        alert("Note: Location coordinates lookup failed or timed out. Creating geofenced session using fixed Tolani College Campus coordinates instead.");
                        await sendCreateSession(className, subject, division, program, duration, true, null, null, false, geofenceRadius, lectureSlot);
                    }
                );
            } else {
                await sendCreateSession(className, subject, division, program, duration, false, null, null, false, 50, lectureSlot);
            }
        });
    }

    async function sendCreateSession(class_name, subject, division, program, duration_minutes, require_gps, lat, lon, is_rolling, geofence_radius, lecture_slot) {
        try {
            const res = await fetch('/api/attendance/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    creator_id: currentUser.id,
                    class_name,
                    subject,
                    division,
                    program,
                    duration_minutes: parseInt(duration_minutes),
                    require_gps,
                    creator_lat: lat,
                    creator_lon: lon,
                    is_rolling,
                    geofence_radius: parseInt(geofence_radius),
                    lecture_slot
                })
            });
            const data = await res.json();

            if (data.success) {
                activeSessionCode = data.session.code;
                currentSessionObj = data.session;

                document.getElementById("active-code-display").textContent = activeSessionCode;
                
                const expiryTime = new Date(data.session.expires_at).toLocaleTimeString();
                document.getElementById("active-session-timer").textContent = `Expires at: ${expiryTime}`;
                document.getElementById("active-session-label").innerHTML = `<i class="fa-solid fa-circle-dot fa-fade"></i> ACTIVE | ${data.session.subject} (${data.session.division})`;

                formCard.style.display = "none";
                activeCard.style.display = "block";

                // Show projector button
                projectorBtn.style.display = "block";

                // Start Polling records
                pollCheckedInStudents(activeSessionCode);
                activeSessionPollingInterval = setInterval(() => pollCheckedInStudents(activeSessionCode), 3000);

                // Initialize QR rotation and professor SSE stream
                window.initializeProfessorActiveSession(data.session);
            } else {
                alert(data.error || "Failed to create session.");
            }
        } catch (err) {
            console.error(err);
            alert("Error starting attendance session.");
        }
    }

    if (projectorBtn) {
        projectorBtn.addEventListener("click", () => {
            if (currentSessionObj) {
                window.open(`projector.html?code=${currentSessionObj.code}`, '_blank');
            }
        });
    }

    const exportSessionBtn = document.getElementById("export-session-btn");
    if (exportSessionBtn) {
        exportSessionBtn.addEventListener("click", () => {
            const records = window.currentActiveSessionRecords || [];
            if (records.length === 0) {
                alert("No student check-ins to export yet.");
                return;
            }
            const headers = ["Roll Number", "Student Name", "Gender", "Division", "Marked At"];
            const rows = records.map(r => [
                r.roll_no,
                r.name,
                r.gender || 'Male',
                `Division ${r.division}`,
                formatRosterTime(r.marked_at)
            ]);
            
            const csvContent = "\uFEFF" + [
                headers.join(','),
                ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Attendance_Session_${activeSessionCode || 'Code'}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const bulkPhoneBtn = document.getElementById("btn-bulk-phone-checkin");
    if (bulkPhoneBtn) {
        bulkPhoneBtn.addEventListener("click", () => {
            if (!currentSessionObj) {
                alert("No active session found.");
                return;
            }
            
            generalModalTitle.textContent = "Phone Check-in Assistant";
            generalModalBody.innerHTML = `
                <div style="padding: 16px 0;">
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                        Class: <strong>${currentSessionObj.class_name} - Division ${currentSessionObj.division}</strong> | Subject: <strong>${currentSessionObj.subject}</strong>
                    </p>
                    
                    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 20px;">
                        <input type="number" id="bulk-student-count" class="form-control" min="1" max="100" placeholder="Number of students..." style="margin: 0; max-width: 180px;">
                        <button class="btn btn-primary" id="btn-generate-lines" style="padding: 8px 16px; font-weight: bold; cursor: pointer;">
                            Generate Lines
                        </button>
                    </div>

                    <div id="bulk-lines-container" style="display: flex; flex-direction: column; gap: 12px; max-height: 280px; overflow-y: auto; padding-right: 8px;">
                        <p style="color: var(--text-muted); font-size: 12px; margin: 0;"><i class="fa-solid fa-info-circle mr-4"></i> Enter the number of students who need manual check-in above to start.</p>
                    </div>

                    <button class="btn btn-success" id="btn-submit-bulk-checkin" style="display: none; margin-top: 20px; width: 100%; font-weight: bold; padding: 10px;">
                        <i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins
                    </button>
                </div>
            `;
            generalModal.classList.add("active");

            document.getElementById("btn-generate-lines").addEventListener("click", () => {
                const count = parseInt(document.getElementById("bulk-student-count").value);
                if (isNaN(count) || count < 1) {
                    alert("Please enter a valid positive number of students.");
                    return;
                }
                
                let linesHTML = "";
                for (let i = 1; i <= count; i++) {
                    linesHTML += `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-weight: 600; width: 80px; font-size: 12px; color: var(--text-muted);">Student ${i}:</span>
                            <input type="text" class="form-control bulk-roll-input" placeholder="Enter Roll Number (e.g. 351)" style="margin: 0; flex: 1;">
                        </div>
                    `;
                }
                
                document.getElementById("bulk-lines-container").innerHTML = linesHTML;
                document.getElementById("btn-submit-bulk-checkin").style.display = "block";
            });

            document.getElementById("btn-submit-bulk-checkin").addEventListener("click", async () => {
                const rollInputs = document.querySelectorAll(".bulk-roll-input");
                const rollNumbers = [];
                rollInputs.forEach(input => {
                    const val = input.value.trim();
                    if (val) rollNumbers.push(val);
                });

                if (rollNumbers.length === 0) {
                    alert("Please enter at least one student roll number.");
                    return;
                }

                const submitBtn = document.getElementById("btn-submit-bulk-checkin");
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Submitting...`;

                try {
                    const res = await fetch('/api/attendance/session/bulk-checkin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_code: activeSessionCode,
                            roll_numbers: rollNumbers
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert(`Attendance check-ins submitted successfully!\n- Added: ${data.added.join(', ') || 'None'}\n- Already checked in: ${data.alreadyPresent.join(', ') || 'None'}\n- Invalid/Not found: ${data.invalid.join(', ') || 'None'}`);
                        generalModal.classList.remove("active");
                        // Refresh active session records list
                        if (typeof window.pollCheckedInStudents === "function") {
                            window.pollCheckedInStudents(activeSessionCode);
                        }
                    } else {
                        alert("Submission failed: " + (data.error || 'Unknown error'));
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins`;
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error submitting attendance.");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins`;
                }
            });
        });
    }

    const manualBtn = document.getElementById("btn-manual-attendance");
    if (manualBtn) {
        manualBtn.addEventListener("click", async () => {
            if (!currentSessionObj) {
                alert("No active session found.");
                return;
            }
            
            generalModalTitle.textContent = "Manual Attendance Sheet";
            generalModalBody.innerHTML = `<div class="text-center" style="padding: 24px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary);"></i> Loading student list...</div>`;
            generalModal.classList.add("active");

            try {
                // Fetch all students in the class/division
                const studentsRes = await fetch(`/api/students/list?class_name=${encodeURIComponent(currentSessionObj.class_name)}&division=${encodeURIComponent(currentSessionObj.division)}`);
                const studentsData = await studentsRes.json();
                const students = studentsData.students || [];

                let searchQuery = "";

                function renderList() {
                    if (students.length === 0) {
                        generalModalBody.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 16px;">No students enrolled in ${currentSessionObj.class_name} Div ${currentSessionObj.division}.</p>`;
                        return;
                    }

                    const presentIds = new Set((window.currentActiveSessionRecords || []).map(r => r.student_id));

                    generalModalBody.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap;">
                            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">
                                Class: <strong>${currentSessionObj.class_name} - Division ${currentSessionObj.division}</strong> | Subject: <strong>${currentSessionObj.subject}</strong>
                            </p>
                            <input type="text" id="manual-att-search" class="form-control" placeholder="Search student..." style="width: 180px; font-size: 11px; height: 26px; padding: 2px 6px; margin: 0;">
                        </div>
                        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                            <table class="custom-table text-center" style="font-size: 13px;">
                                <thead>
                                    <tr>
                                        <th>Roll No.</th>
                                        <th>Name</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody id="manual-att-tbody">
                                    ${students.map(s => {
                                        const isPresent = presentIds.has(s.id);
                                        const statusLabel = isPresent 
                                            ? `<span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Present</span>`
                                            : `<span style="color: #ef4444; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Absent</span>`;
                                        const actionBtn = isPresent
                                            ? `<button class="btn btn-danger btn-sm manual-toggle-btn" data-id="${s.id}" data-action="absent" style="padding: 4px 8px; font-size: 11px;">Mark Absent</button>`
                                            : `<button class="btn btn-primary btn-sm manual-toggle-btn" data-id="${s.id}" data-action="present" style="padding: 4px 8px; font-size: 11px; background: #10b981; border-color: #10b981;">Mark Present</button>`;
                                        
                                        return `
                                            <tr data-name="${s.name.toLowerCase()}" data-roll="${String(s.roll_no).toLowerCase()}">
                                                <td><strong>${s.roll_no}</strong></td>
                                                <td style="text-align: left;">${s.name}</td>
                                                <td>${statusLabel}</td>
                                                <td>${actionBtn}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;

                    // Restore search value and apply filtering
                    const searchInput = document.getElementById("manual-att-search");
                    if (searchInput) {
                        searchInput.value = searchQuery;
                        applyFilter(searchQuery);

                        searchInput.addEventListener("input", (e) => {
                            searchQuery = e.target.value.toLowerCase().trim();
                            applyFilter(searchQuery);
                        });
                    }

                    generalModalBody.querySelectorAll(".manual-toggle-btn").forEach(btn => {
                        btn.addEventListener("click", async () => {
                            const studentId = parseInt(btn.dataset.id);
                            const action = btn.dataset.action;
                            btn.disabled = true;
                            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

                            try {
                                const markRes = await fetch('/api/attendance/mark-manual', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        session_id: currentSessionObj.id,
                                        student_id: studentId,
                                        status: action
                                    })
                                });
                                const markData = await markRes.json();
                                if (markData.success) {
                                    await pollCheckedInStudents(activeSessionCode);
                                    renderList();
                                } else {
                                    alert(markData.error || "Failed to update attendance.");
                                    btn.disabled = false;
                                }
                            } catch (e) {
                                alert("Connection error.");
                                btn.disabled = false;
                            }
                        });
                    });
                }

                function applyFilter(query) {
                    const tbody = document.getElementById("manual-att-tbody");
                    if (!tbody) return;
                    const rows = tbody.querySelectorAll("tr");
                    rows.forEach(tr => {
                        const name = tr.dataset.name || "";
                        const roll = tr.dataset.roll || "";
                        if (!query || name.includes(query) || roll.includes(query)) {
                            tr.style.display = "";
                        } else {
                            tr.style.display = "none";
                        }
                    });
                }

                renderList();

            } catch (err) {
                console.error(err);
                generalModalBody.innerHTML = `<p style="text-align: center; color: var(--danger); padding: 16px;">Failed to load students list.</p>`;
            }
        });
    }

    const closeBtn = document.getElementById("close-session-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", async () => {
            if (!activeSessionCode) return;
            try {
                const res = await fetch('/api/attendance/session/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: activeSessionCode })
                });
                const data = await res.json();
                if (data.success) {
                    const closedCode = activeSessionCode;
                    const tempSessionObj = currentSessionObj;

                    clearInterval(activeSessionPollingInterval);
                    activeSessionPollingInterval = null;
                    activeSessionCode = null;
                    currentSessionObj = null;
                    activeCard.style.display = "none";
                    formCard.style.display = "block";
                    
                    // Stop QR code rotation and close professor SSE stream
                    stopQrRotation();
                    if (window.professorSse) {
                        window.professorSse.close();
                        window.professorSse = null;
                    }

                    // Prompt to open Phone Check-in Assistant after close
                    const confirmAssist = confirm("Attendance session successfully closed.\n\nWould you like to manually add check-ins for students who forgot to check in with their phones?");
                    if (confirmAssist && tempSessionObj) {
                        showPhoneCheckinAssistant(closedCode, tempSessionObj);
                    }
                }
            } catch (e) {
                alert("Error closing session.");
            }
        });
    }

    // Helper to render bulk manual check-in lines modal
    function showPhoneCheckinAssistant(sessionCode, sessionObj) {
        generalModalTitle.textContent = "Phone Check-in Assistant";
        generalModalBody.innerHTML = `
            <div style="padding: 16px 0;">
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                    Class: <strong>${sessionObj.class_name} - Division ${sessionObj.division}</strong> | Subject: <strong>${sessionObj.subject}</strong>
                </p>
                
                <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 20px;">
                    <input type="number" id="bulk-student-count" class="form-control" min="1" max="100" placeholder="Number of students..." style="margin: 0; max-width: 180px;">
                    <button class="btn btn-primary" id="btn-generate-lines" style="padding: 8px 16px; font-weight: bold; cursor: pointer;">
                        Generate Lines
                    </button>
                </div>

                <div id="bulk-lines-container" style="display: flex; flex-direction: column; gap: 12px; max-height: 280px; overflow-y: auto; padding-right: 8px;">
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0;"><i class="fa-solid fa-info-circle mr-4"></i> Enter the number of students who need manual check-in above to start.</p>
                </div>

                <button class="btn btn-success" id="btn-submit-bulk-checkin" style="display: none; margin-top: 20px; width: 100%; font-weight: bold; padding: 10px; cursor: pointer;">
                    <i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins
                </button>
            </div>
        `;
        generalModal.classList.add("active");

        document.getElementById("btn-generate-lines").addEventListener("click", () => {
            const count = parseInt(document.getElementById("bulk-student-count").value);
            if (isNaN(count) || count < 1) {
                alert("Please enter a valid positive number of students.");
                return;
            }
            
            let linesHTML = "";
            for (let i = 1; i <= count; i++) {
                linesHTML += `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-weight: 600; width: 80px; font-size: 12px; color: var(--text-muted);">Student ${i}:</span>
                        <input type="text" class="form-control bulk-roll-input" placeholder="Enter Roll Number (e.g. 351)" style="margin: 0; flex: 1;">
                    </div>
                `;
            }
            
            document.getElementById("bulk-lines-container").innerHTML = linesHTML;
            document.getElementById("btn-submit-bulk-checkin").style.display = "block";
        });

        document.getElementById("btn-submit-bulk-checkin").addEventListener("click", async () => {
            const rollInputs = document.querySelectorAll(".bulk-roll-input");
            const rollNumbers = [];
            rollInputs.forEach(input => {
                const val = input.value.trim();
                if (val) rollNumbers.push(val);
            });

            if (rollNumbers.length === 0) {
                alert("Please enter at least one student roll number.");
                return;
            }

            const submitBtn = document.getElementById("btn-submit-bulk-checkin");
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Submitting...`;

            try {
                const res = await fetch('/api/attendance/session/bulk-checkin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_code: sessionCode,
                        roll_numbers: rollNumbers
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Attendance check-ins submitted successfully!\n- Added: ${data.added.join(', ') || 'None'}\n- Already checked in: ${data.alreadyPresent.join(', ') || 'None'}\n- Invalid/Not found: ${data.invalid.join(', ') || 'None'}`);
                    generalModal.classList.remove("active");
                    
                    // Refresh active session records list if it's still active
                    if (activeSessionCode === sessionCode && typeof window.pollCheckedInStudents === "function") {
                        window.pollCheckedInStudents(sessionCode);
                    }
                } else {
                    alert("Submission failed: " + (data.error || 'Unknown error'));
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins`;
                }
            } catch (err) {
                console.error(err);
                alert("Network error submitting attendance.");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-8"></i> Submit Attendance Check-ins`;
            }
        });
    }

    // Auto-recover active attendance session for this teacher if one is running
    async function recoverActiveSession() {
        try {
            const res = await fetch(`/api/attendance/session/active?creator_id=${currentUser.id}`);
            const data = await res.json();
            if (data.success && data.session) {
                activeSessionCode = data.session.code;
                currentSessionObj = data.session;

                document.getElementById("active-code-display").textContent = activeSessionCode;
                const expiryTime = new Date(data.session.expires_at).toLocaleTimeString();
                document.getElementById("active-session-timer").textContent = `Expires at: ${expiryTime}`;
                document.getElementById("active-session-label").innerHTML = `<i class="fa-solid fa-circle-dot fa-fade"></i> ACTIVE | ${data.session.subject} (${data.session.division})`;

                formCard.style.display = "none";
                activeCard.style.display = "block";
                projectorBtn.style.display = "block";

                // Resume Polling records
                pollCheckedInStudents(activeSessionCode);
                if (activeSessionPollingInterval) clearInterval(activeSessionPollingInterval);
                activeSessionPollingInterval = setInterval(() => pollCheckedInStudents(activeSessionCode), 3000);

                // Restore QR rotation and professor SSE stream
                window.initializeProfessorActiveSession(data.session);
            }
        } catch (e) {
            console.error("Failed to recover active session:", e);
        }
    }
    recoverActiveSession();
};

// --- DYNAMIC PROJECTOR VIEW FULLSCREEN MODAL ---
window.openProjectorMode = function(session) {
    const overlay = document.createElement("div");
    overlay.id = "projector-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #020617;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 40px;
        box-sizing: border-box;
    `;

    overlay.innerHTML = `
        <style>
            @keyframes pulseGlow {
                0% { box-shadow: 0 0 10px rgba(20, 184, 166, 0.1); }
                100% { box-shadow: 0 0 25px rgba(20, 184, 166, 0.4); }
            }
        </style>
        <div style="position: absolute; top: 24px; right: 24px; display: flex; gap: 16px;">
            <button class="btn btn-secondary" onclick="closeProjectorMode()" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: #ffffff;"><i class="fa-solid fa-compress mr-8"></i> Exit Projector View</button>
        </div>

        <div class="text-center" style="max-width: 800px; width: 100%;">
            <div style="font-size: 18px; color: var(--accent); font-weight: 600; text-transform: uppercase; letter-spacing: 2px;" id="projector-program">${session.program} - ${session.division !== 'All' ? 'Div ' + session.division : 'All Divisions'}</div>
            <h1 style="font-size: 38px; font-weight: 800; margin: 8px 0 24px 0; color: #f8fafc;" id="projector-subject">${session.subject}</h1>
            
            <div style="background: rgba(255,255,255,0.02); border: 1.5px solid var(--accent); padding: 48px; border-radius: 24px; margin-bottom: 32px; box-shadow: 0 0 50px rgba(20,184,166,0.15); position: relative; overflow: hidden;">
                <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 3px; color: var(--text-muted); margin-bottom: 12px;">Active Security Code</div>
                <div id="projector-code" style="font-size: 110px; font-weight: 900; letter-spacing: 8px; color: #ffffff; line-height: 1;">${activeSessionCode}</div>
                
                ${session.is_rolling ? `
                    <div style="margin-top: 24px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fa-solid fa-arrows-spin fa-spin" style="color: var(--accent);"></i>
                        <span style="font-size: 13px; color: var(--accent); font-weight: 500;" id="projector-timer-text">Code rotates in 20 seconds</span>
                    </div>
                ` : ''}
            </div>

            <div class="stats-grid mb-24" style="grid-template-columns: repeat(2, 1fr); max-width: 500px; margin: 0 auto 32px auto;">
                <div class="stat-card" style="background: rgba(255,255,255,0.01); border-color: rgba(255,255,255,0.05); padding: 16px;">
                    <div style="font-size: 12px; color: var(--text-muted);">Present Count</div>
                    <div style="font-size: 36px; font-weight: 800; color: var(--accent);" id="projector-present-count">0</div>
                </div>
                <div class="stat-card" style="background: rgba(255,255,255,0.01); border-color: rgba(255,255,255,0.05); padding: 16px;">
                    <div style="font-size: 12px; color: var(--text-muted);">Geofencing Check</div>
                    <div style="font-size: 15px; font-weight: 700; color: ${session.require_gps ? 'var(--accent)' : 'var(--text-muted)'}; margin-top: 10px;">
                        ${session.require_gps ? '<i class="fa-solid fa-location-crosshairs mr-4"></i> ACTIVE (50m)' : '<i class="fa-solid fa-location-slash mr-4"></i> DISABLED'}
                    </div>
                </div>
            </div>

            <h3 style="text-align: left; font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-users mr-4"></i> Recently Checked In</h3>
            <div id="projector-joined-list" style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: start; max-height: 200px; overflow-y: auto; background: rgba(255,255,255,0.01); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="color: var(--text-muted); font-size: 13px; width: 100%; text-align: center;">Waiting for student check-ins...</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let secondsLeft = 20;
    let projectorTimerInterval = null;

    if (session.is_rolling) {
        projectorTimerInterval = setInterval(async () => {
            secondsLeft--;
            const timerTxt = document.getElementById("projector-timer-text");
            if (timerTxt) {
                timerTxt.textContent = `Code rotates in ${secondsLeft} seconds`;
            }

            if (secondsLeft <= 0) {
                secondsLeft = 20;
                try {
                    const rotateRes = await fetch('/api/attendance/session/rotate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: activeSessionCode })
                    });
                    const rotateData = await rotateRes.json();
                    if (rotateData.success) {
                        activeSessionCode = rotateData.new_code;
                        const codeDisplay = document.getElementById("projector-code");
                        if (codeDisplay) codeDisplay.textContent = activeSessionCode;

                        const backDisplay = document.getElementById("active-code-display");
                        if (backDisplay) backDisplay.textContent = activeSessionCode;
                    }
                } catch (e) {
                    console.error("Rotation error:", e);
                }
            }
        }, 1000);
    }

    // Set polling display for projector mode
    window.projectorPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/attendance/session/${activeSessionCode}/records`);
            const data = await res.json();
            if (data.success) {
                const records = data.records || [];
                const presentCnt = document.getElementById("projector-present-count");
                if (presentCnt) presentCnt.textContent = records.length;

                const joinedList = document.getElementById("projector-joined-list");
                if (joinedList) {
                    if (records.length === 0) {
                        joinedList.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; width: 100%; text-align: center;">Waiting for student check-ins...</div>`;
                    } else {
                        joinedList.innerHTML = records.slice(0, 15).map(r => `
                            <span style="background: rgba(20,184,166,0.1); border: 1px solid var(--accent); color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; animation: pulseGlow 1.5s infinite alternate;">
                                <i class="fa-solid fa-circle-check" style="color: var(--accent);"></i>
                                ${r.name} (${r.roll_no})
                            </span>
                        `).join("");
                    }
                }
            }
        } catch (e) {}
    }, 3000);

    window.closeProjectorMode = function() {
        if (projectorTimerInterval) clearInterval(projectorTimerInterval);
        if (window.projectorPollInterval) clearInterval(window.projectorPollInterval);
        const overlay = document.getElementById("projector-overlay");
    };
};

window.markStudentAbsentManual = async function(studentId) {
    if (!confirm("Are you sure you want to mark this student as absent for the current session?")) return;
    try {
        const res = await fetch('/api/attendance/mark-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionObj.id,
                student_id: studentId,
                status: 'absent'
            })
        });
        const data = await res.json();
        if (data.success) {
            await pollCheckedInStudents(activeSessionCode);
        } else {
            alert(data.error || "Failed to update status.");
        }
    } catch (err) {
        console.error(err);
        alert("Connection error.");
    }
};

window.markStudentPresentManual = async function(studentId) {
    try {
        const res = await fetch('/api/attendance/mark-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionObj.id,
                student_id: studentId,
                status: 'present'
            })
        });
        const data = await res.json();
        if (data.success) {
            await pollCheckedInStudents(activeSessionCode);
        } else {
            alert(data.error || "Failed to update status.");
        }
    } catch (err) {
        console.error(err);
        alert("Connection error.");
    }
};

function parseUTCDate(timeStr) {
    if (!timeStr) return null;
    let dateStr = timeStr;
    if (!dateStr.endsWith('Z') && !/\+\d{2}:\d{2}$/.test(dateStr) && !/-\d{2}:\d{2}$/.test(dateStr)) {
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
            dateStr = dateStr.replace(' ', 'T');
        }
        dateStr += 'Z';
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(timeStr) : d;
}

function formatRosterTime(timeStr) {
    if (!timeStr) return '--:--';
    const d = parseUTCDate(timeStr);
    return !d ? timeStr : d.toLocaleTimeString();
}

async function pollCheckedInStudents(code) {
    try {
        const res = await fetch(`/api/attendance/session/${code}/records`);
        const data = await res.json();

        if (data.success) {
            const records = data.records || [];
            window.currentActiveSessionRecords = records;
            document.getElementById("checked-in-count").textContent = records.length;

            const tbody = document.getElementById("checked-in-records-list");
            if (records.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="color: var(--text-muted); padding: 12px;">Waiting for student check-ins...</td></tr>`;
            } else {
                tbody.innerHTML = records.map(r => {
                    const statusStr = (r.status || '').toUpperCase();
                    const isFlagged = statusStr === 'FLAGGED';
                    const isPending = statusStr === 'PENDING';
                    const isAbsent = statusStr === 'ABSENT';

                    let statusHtml = `<span class="attendance-status-pill status-active">PRESENT</span>`;
                    let actionHtml = `<button class="btn btn-danger btn-sm" onclick="window.markStudentAbsentManual(${r.student_id})" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-user-slash mr-4"></i> Mark Absent</button>`;

                    if (isFlagged) {
                        statusHtml = `<span class="attendance-status-pill status-absent" style="background: var(--danger); color: white; border: none; font-size: 11px;"><i class="fa-solid fa-triangle-exclamation mr-4"></i> FLAGGED (${r.violations_count})</span>`;
                    } else if (r.violations_count > 0) {
                        statusHtml = `<span class="attendance-status-pill status-warning" style="background: var(--warning); color: black; border: none; font-size: 11px;"><i class="fa-solid fa-circle-exclamation mr-4"></i> WARNING (${r.violations_count})</span>`;
                    } else if (isPending) {
                        statusHtml = `<span class="attendance-status-pill status-warning" style="background: var(--warning); color: black; border: none; font-size: 11px;"><i class="fa-solid fa-hourglass-half mr-4"></i> PENDING</span>`;
                    } else if (isAbsent) {
                        statusHtml = `<span class="attendance-status-pill status-absent">ABSENT</span>`;
                        actionHtml = `<button class="btn btn-primary btn-sm" onclick="window.markStudentPresentManual(${r.student_id})" style="padding: 4px 8px; font-size: 11px; background: #10b981; border-color: #10b981;"><i class="fa-solid fa-user-check mr-4"></i> Mark Present</button>`;
                    }
                    
                    let logsHtml = '';
                    if (r.violation_logs && r.violation_logs !== '[]') {
                        try {
                            const logs = JSON.parse(r.violation_logs);
                            logsHtml = `<div style="font-size: 10px; color: var(--danger); text-align: left; margin-top: 4px; max-width: 250px; overflow-wrap: break-word;">` +
                                logs.map(l => `• ${l.type} (${new Date(l.timestamp).toLocaleTimeString()})`).join('<br>') +
                                `</div>`;
                        } catch (e) {}
                    }

                    return `
                        <tr style="${isFlagged ? 'background: rgba(239, 68, 68, 0.05);' : ''}">
                            <td><strong>${r.roll_no}</strong></td>
                            <td>
                                <div style="font-weight: 500;">${r.name}</div>
                                ${logsHtml}
                            </td>
                            <td>${r.gender || 'Male'}</td>
                            <td>Division ${r.division}</td>
                            <td>${formatRosterTime(r.marked_at)}</td>
                            <td>${statusHtml}</td>
                            <td>${actionHtml}</td>
                        </tr>
                    `;
                }).join("");

                // Apply search filter locally if query exists
                const activeSearch = document.getElementById("active-session-search");
                const q = activeSearch ? activeSearch.value.toLowerCase().trim() : "";
                if (q) {
                    const rows = tbody.querySelectorAll("tr");
                    rows.forEach(tr => {
                        const text = tr.innerText.toLowerCase();
                        if (text.includes(q)) {
                            tr.style.display = "";
                        } else {
                            tr.style.display = "none";
                        }
                    });
                }
            }
        }
    } catch (e) {
        console.error("Polling error:", e);
    }
}

// Dynamic QR Code Rotation and Hashing Helpers
let qrRotationInterval = null;
window.professorSse = null;

function get15SecondHash(secretKey, timeWindow) {
    const input = secretKey + "_" + timeWindow;
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
    }
    const num = (hash >>> 0) % 900000 + 100000;
    return num.toString();
}

function startQrRotation(sessionId, secretKey) {
    if (qrRotationInterval) clearInterval(qrRotationInterval);

    const img = document.getElementById("active-session-qrcode");
    const codeDisplay = document.getElementById("active-code-display");
    if (!img) return;

    let lastWindow = -1;

    function updateQr() {
        const timeWindow = Math.floor(Date.now() / 15000);
        if (timeWindow !== lastWindow) {
            lastWindow = timeWindow;
            const hash = get15SecondHash(secretKey, timeWindow);
            const qrData = sessionId + ":" + hash;
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
            
            if (codeDisplay) {
                codeDisplay.textContent = hash.toUpperCase();
            }
        }
    }

    updateQr();
    qrRotationInterval = setInterval(updateQr, 1000);
}

function stopQrRotation() {
    if (qrRotationInterval) {
        clearInterval(qrRotationInterval);
        qrRotationInterval = null;
    }
}

window.initializeProfessorActiveSession = function(session) {
    if (window.professorSse) {
        window.professorSse.close();
        window.professorSse = null;
    }

    const startBtn = document.getElementById("start-verification-btn");
    const label = document.getElementById("active-session-label");
    const desc = document.getElementById("active-session-desc");
    const codeDisplay = document.getElementById("active-code-display");

    if (session.verification_started === 1) {
        // Verification started state (Static Code 2)
        if (startBtn) startBtn.style.display = "none";
        if (label) {
            label.className = "attendance-status-pill";
            label.style.background = "var(--warning)";
            label.style.color = "black";
            label.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> FINAL VERIFICATION ACTIVE`;
        }
        if (desc) desc.textContent = "Show this static verification code to students in class.";
        
        stopQrRotation();
        if (codeDisplay) codeDisplay.textContent = session.code2;
    } else {
        // Reset Code 1 display
        if (codeDisplay) codeDisplay.textContent = session.code;
        if (startBtn) {
            startBtn.style.display = "inline-block";
            startBtn.onclick = async () => {
                const confirmStart = confirm("Are you sure you want to start the final verification phase? Only students who have already checked in can verify.");
                if (!confirmStart) return;

                startBtn.disabled = true;
                startBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-8"></i> Starting...`;

                try {
                    const res = await fetch('/api/attendance/session/start-verification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: session.code })
                    });
                    const data = await res.json();
                    if (data.success) {
                        session.verification_started = 1;
                        session.code2 = data.code2;
                        currentSessionObj = session;
                        
                        window.initializeProfessorActiveSession(session);
                    } else {
                        alert(data.error || "Failed to start verification.");
                        startBtn.disabled = false;
                        startBtn.innerHTML = `<i class="fa-solid fa-hourglass-start mr-8"></i> Start Verification Phase (Code 2)`;
                    }
                } catch (e) {
                    alert("Error starting verification.");
                    startBtn.disabled = false;
                    startBtn.innerHTML = `<i class="fa-solid fa-hourglass-start mr-8"></i> Start Verification Phase (Code 2)`;
                }
            };
        }
        stopQrRotation();
    }

    window.professorSse = new EventSource(`/api/attendance/session/${session.id}/professor-stream`);
    window.professorSse.addEventListener('STUDENT_JOINED', () => {
        pollCheckedInStudents(session.code);
    });
    window.professorSse.addEventListener('STUDENT_FLAGGED', () => {
        pollCheckedInStudents(session.code);
    });
};


window.renderStaffProfile = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    let scriptUrlVal = "";
    let allowStudentEdit = true;
    let allowTeacherEdit = true;

    try {
        const driveRes = await fetch('/api/settings/drive');
        const driveData = await driveRes.json();
        scriptUrlVal = driveData.url || "";
    } catch (e) {
        console.error(e);
    }

    try {
        const permRes = await fetch('/api/settings/profile-permissions');
        const permData = await permRes.json();
        allowStudentEdit = permData.allow_student_profile_edit !== false;
        allowTeacherEdit = permData.allow_teacher_profile_edit !== false;
    } catch (e) {
        console.error(e);
    }

    let adminPermissionsHTML = "";
    if (currentUser.role === 'admin') {
        adminPermissionsHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-user-gear mr-8"></i> Portal Profile Edit Controls</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                    Enable or disable the profile details editing option for students and teachers.
                </p>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; font-weight: 600;">
                        <input type="checkbox" id="perm-student-edit" style="width: 20px; height: 20px; cursor: pointer;" ${allowStudentEdit ? 'checked' : ''}>
                        <span>Allow Students to Edit Profile Details (except Name & Roll No.)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; font-weight: 600;">
                        <input type="checkbox" id="perm-teacher-edit" style="width: 20px; height: 20px; cursor: pointer;" ${allowTeacherEdit ? 'checked' : ''}>
                        <span>Allow Professors to Edit Profile Details (except Name & ID)</span>
                    </label>
                    <button class="btn btn-primary" id="save-permissions-btn" style="padding: 8px 16px; width: fit-content; margin-top: 8px;">
                        <i class="fa-solid fa-floppy-disk mr-4"></i> Save Permissions
                    </button>
                </div>
            </div>
        `;
    }

    const isTeacher = currentUser.role === 'teacher';
    const isTeacherLocked = isTeacher && !allowTeacherEdit;

    let detailsCardHTML = `
        <div class="glass-card mb-24">
            <h3 class="card-title mb-16"><i class="fa-solid fa-user-tie mr-8"></i> Security & Details</h3>
            <div class="form-grid mb-24">
                <div>
                    <label>Full Name</label>
                    <input type="text" class="form-control" value="${currentUser.name}" disabled>
                </div>
                <div>
                    <label>Username / ID</label>
                    <input type="text" class="form-control" value="${currentUser.username}" disabled>
                </div>
                <div>
                    <label>Email ID</label>
                    <input type="text" id="staff-profile-email" class="form-control" value="${currentUser.email || ''}" ${isTeacherLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Contact Phone</label>
                    <input type="text" id="staff-profile-phone" class="form-control" value="${currentUser.phone || ''}" ${isTeacherLocked ? 'disabled' : ''}>
                </div>
                <div>
                    <label>Gender</label>
                    ${isTeacherLocked ? `
                        <input type="text" class="form-control" value="${currentUser.gender || 'Male'}" disabled>
                    ` : `
                        <select id="staff-profile-gender" class="form-control">
                            <option value="Male" ${currentUser.gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${currentUser.gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                    `}
                </div>
                <div>
                    <label>Department</label>
                    <input type="text" id="staff-profile-dept" class="form-control" value="${currentUser.department || ''}" ${isTeacherLocked ? 'disabled' : ''}>
                </div>
            </div>
            ${isTeacher || currentUser.role === 'admin' ? `
                ${isTeacherLocked ? `
                    <p style="font-size: 12px; color: var(--text-muted);">
                        <i class="fa-solid fa-circle-info"></i> Profile modification is locked. Profile editing has been disabled by the Administrator.
                    </p>
                ` : `
                    <div style="margin-top: 24px;">
                        <button class="btn btn-primary" id="save-staff-profile-btn">
                            <i class="fa-solid fa-floppy-disk mr-4"></i> Save Profile Details
                        </button>
                    </div>
                `}
            ` : `
                <p style="font-size: 12px; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-info"></i> Profile modification is locked. Please contact the college registrar office for changes.
                </p>
            `}
        </div>
    `;

    let storageCardHTML = "";
    if (currentUser.role === 'admin') {
        storageCardHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-hard-drive mr-8"></i> Server Storage & Optimization</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                    Monitor persistent storage usage, delete orphaned assignment/study files, and compact the SQLite database structure.
                </p>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; display: flex; flex-direction: column; gap: 8px;" id="storage-details-container">
                    <div><i class="fa-solid fa-spinner fa-spin mr-8"></i> Loading storage metrics...</div>
                </div>
                <button class="btn btn-danger" id="clean-storage-btn" style="padding: 8px 16px; width: fit-content; cursor: pointer;">
                    <i class="fa-solid fa-broom mr-4"></i> Optimize & Clean Storage
                </button>
            </div>
        `;
    }

    let driveCardHTML = "";
    if (currentUser.role === 'admin') {
        driveCardHTML = `
            <div class="glass-card">
                <h3 class="card-title mb-16"><i class="fa-brands fa-google-drive mr-8" style="color: var(--accent);"></i> Google Drive Attendance Sync</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                    EduSphere automatically syncs all finalized classroom attendance rosters to your Google Drive folder.
                </p>

                <div style="background: rgba(45, 212, 191, 0.05); border: 1px dashed var(--accent); border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <strong style="color: #0f172a; font-size: 14px; display: block; margin-bottom: 4px;">Target Google Drive Folder</strong>
                        <span style="font-size: 12px; color: var(--text-muted);">Click to open target folder on Google Drive.</span>
                    </div>
                    <a href="https://drive.google.com/drive/folders/1CVXvcVhY19ebf2xUu4HsHviksoHywjHA" target="_blank" class="btn btn-secondary btn-sm" style="border-color: var(--accent); color: var(--accent);">
                        <i class="fa-solid fa-up-right-from-square mr-4"></i> Open Folder
                    </a>
                </div>

                <div class="mb-24">
                    <label style="font-weight: 600; display: block; margin-bottom: 8px;">Google Apps Script Web App URL</label>
                    <input type="text" id="drive-script-url" class="form-control" placeholder="https://script.google.com/macros/s/.../exec">
                    <button class="btn btn-primary mt-12" id="save-drive-settings-btn" style="padding: 8px 16px;">Save Sync Settings</button>
                </div>

                <div style="background: rgba(15, 23, 42, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; font-size: 13px;">
                    <h4 style="color: #0f172a; font-weight: 700; margin-bottom: 12px;"><i class="fa-solid fa-circle-question mr-4"></i> Setup Instructions (1 Minute)</h4>
                    <ol style="margin-left: 20px; color: var(--text-muted); line-height: 1.6; text-align: left;">
                        <li>Open your Google account and go to <a href="https://script.google.com" target="_blank" style="color: var(--accent);">Google Apps Script</a>.</li>
                        <li>Create a <strong>New Project</strong> and replace the code block with the following handler script:
                            <pre style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 11px; color: #0f172a; overflow-x: auto; margin: 8px 0; font-family: monospace; border: 1px solid var(--border-color);">
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var folder = DriveApp.getFolderById("1CVXvcVhY19ebf2xUu4HsHviksoHywjHA");
  var file = folder.createFile(data.filename, data.content, "text/csv");
  return ContentService.createTextOutput(JSON.stringify({ success: true, url: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
}</pre>
                        </li>
                        <li>Click <strong>Deploy > New Deployment</strong> in Google Apps Script.</li>
                        <li>Choose <strong>Web App</strong> as the type.</li>
                        <li>Set <strong>Execute as:</strong> <i>Me</i>, and <strong>Who has access:</strong> <i>Anyone</i> (crucial for local server authorization).</li>
                        <li>Click <strong>Deploy</strong>, authorize the permissions, then copy the generated <strong>Web App URL</strong> and paste it above!</li>
                    </ol>
                </div>
            </div>
        `;
    }

    dynamicContentArea.innerHTML = `
        ${adminPermissionsHTML}
        ${detailsCardHTML}
        ${storageCardHTML}
        ${driveCardHTML}
    `;

    // Populate Drive script URL if admin
    if (currentUser.role === 'admin' && scriptUrlVal) {
        document.getElementById("drive-script-url").value = scriptUrlVal;
    }

    // Add listeners
    if (currentUser.role === 'admin') {
        const savePermsBtn = document.getElementById("save-permissions-btn");
        if (savePermsBtn) {
            savePermsBtn.addEventListener("click", async () => {
                const studentEditVal = document.getElementById("perm-student-edit").checked;
                const teacherEditVal = document.getElementById("perm-teacher-edit").checked;
                
                savePermsBtn.disabled = true;
                savePermsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-4"></i> Saving...`;

                try {
                    const res = await fetch('/api/settings/profile-permissions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            allow_student_profile_edit: studentEditVal,
                            allow_teacher_profile_edit: teacherEditVal
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert("Profile edit permissions updated successfully!");
                    } else {
                        alert("Failed to save permissions: " + (data.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error saving permissions.");
                } finally {
                    savePermsBtn.disabled = false;
                    savePermsBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-4"></i> Save Permissions`;
                }
            });
        }

        const saveDriveBtn = document.getElementById("save-drive-settings-btn");
        if (saveDriveBtn) {
            saveDriveBtn.addEventListener("click", async () => {
                const url = document.getElementById("drive-script-url").value.trim();
                try {
                    const res = await fetch('/api/settings/drive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert("Google Drive sync settings successfully updated.");
                    } else {
                        alert("Failed to update settings.");
                    }
                } catch (e) {
                    console.error(e);
                    alert("Error saving settings.");
                }
            });
        }

        // Storage details loading
        async function loadStorageMetrics() {
            const container = document.getElementById("storage-details-container");
            if (!container) return;
            try {
                const res = await fetch('/api/admin/storage-info');
                const data = await res.json();
                if (data.success) {
                    const stats = data.stats;
                    const formatSize = (bytes) => {
                        if (bytes === 0) return '0 Bytes';
                        const k = 1024;
                        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                    };

                    let persistentDiskHTML = "";
                    if (stats.persistentDiskFiles && stats.persistentDiskFiles.length > 0) {
                        persistentDiskHTML = `
                            <div style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px; text-align: left;">
                                <strong style="display:block; margin-bottom: 8px; color: #ffffff;">Persistent Volume Files (/var/data):</strong>
                                <ul style="margin: 0; padding: 0; list-style-type: none; display: flex; flex-direction: column; gap: 8px;">
                                    ${stats.persistentDiskFiles.map(f => `
                                        <li style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                                            <span>${f.name} (<span style="color: var(--text-muted);">${formatSize(f.size)}</span>)</span>
                                            ${f.name !== 'database.db' ? `
                                                <button class="btn btn-danger btn-sm" onclick="window.deletePersistentFile('${f.name}')" style="padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                                    <i class="fa-solid fa-trash-can"></i> Delete
                                                </button>
                                            ` : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    container.innerHTML = `
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">SQLite Database:</span><strong>${formatSize(stats.dbSize)}</strong></div>
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Uploaded Attachments:</span><strong>${formatSize(stats.uploadsSize)} (${stats.uploadsCount} files)</strong></div>
                        <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Total Persistent Vol. Size:</span><strong>${formatSize(stats.persistentDiskSize)}</strong></div>
                        ${persistentDiskHTML}
                    `;
                } else {
                    container.innerHTML = `<span style="color: var(--danger);">Failed to load metrics.</span>`;
                }
            } catch (err) {
                container.innerHTML = `<span style="color: var(--danger);">Error fetching storage stats.</span>`;
            }
        }

        window.deletePersistentFile = async function(filename) {
            if (!confirm(`Are you sure you want to delete ${filename}? This action cannot be undone.`)) return;
            try {
                const res = await fetch('/api/admin/delete-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`File ${filename} deleted successfully.`);
                    loadStorageMetrics();
                } else {
                    alert("Delete failed: " + (data.error || 'Unknown error'));
                }
            } catch (e) {
                console.error(e);
                alert("Network error deleting file.");
            }
        };

        // Initialize storage metrics
        loadStorageMetrics();

        const cleanStorageBtn = document.getElementById("clean-storage-btn");
        if (cleanStorageBtn) {
            cleanStorageBtn.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to run storage optimization? This will compact the database (vacuum) and permanently delete any uploaded files that are no longer linked to any assignment or study material. This is safe and will not affect active records.")) return;

                cleanStorageBtn.disabled = true;
                cleanStorageBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-4"></i> Cleaning...`;

                try {
                    const res = await fetch('/api/admin/clean-storage', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        const formatSize = (bytes) => {
                            if (bytes === 0) return '0 Bytes';
                            const k = 1024;
                            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                            const i = Math.floor(Math.log(bytes) / Math.log(k));
                            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                        };
                        alert(`Storage optimization completed!\n- Cleaned ${data.deletedFilesCount} unused/temp files.\n- Reclaimed ${formatSize(data.reclaimedBytes)}.`);
                        loadStorageMetrics();
                    } else {
                        alert("Optimization failed: " + (data.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error executing storage clean.");
                } finally {
                    cleanStorageBtn.disabled = false;
                    cleanStorageBtn.innerHTML = `<i class="fa-solid fa-broom mr-4"></i> Optimize & Clean Storage`;
                }
            });
        }
    }

    const isStaff = isTeacher || currentUser.role === 'admin';
    if (isStaff && !isTeacherLocked) {
        const saveStaffBtn = document.getElementById("save-staff-profile-btn");
        if (saveStaffBtn) {
            saveStaffBtn.addEventListener("click", async () => {
                const emailVal = document.getElementById("staff-profile-email").value.trim();
                const phoneVal = document.getElementById("staff-profile-phone").value.trim();
                const genderVal = document.getElementById("staff-profile-gender") ? document.getElementById("staff-profile-gender").value : currentUser.gender;
                const deptVal = document.getElementById("staff-profile-dept").value.trim();

                if (!emailVal || !phoneVal || !deptVal) {
                    alert("Email, phone, and department fields cannot be empty.");
                    return;
                }

                saveStaffBtn.disabled = true;
                saveStaffBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-4"></i> Saving...`;

                try {
                    const res = await fetch('/api/teacher/update-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            teacher_id: currentUser.id,
                            email: emailVal,
                            phone: phoneVal,
                            gender: genderVal,
                            department: deptVal
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert("Profile updated successfully!");
                        currentUser = data.user;
                        localStorage.setItem("es_current_user", JSON.stringify(currentUser));
                        window.renderStaffProfile();
                    } else {
                        alert("Failed to save profile: " + (data.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error saving profile.");
                } finally {
                    saveStaffBtn.disabled = false;
                    saveStaffBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-4"></i> Save Profile Details`;
                }
            });
        }
    }
};

window.renderTeacherProfile = function() {
    window.renderStaffProfile();
};


// =========================================================================
// ADMIN PORTAL MODULES
// =========================================================================

window.renderAdminDashboard = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const users = data.users || [];
        
        const students = users.filter(u => u.role === 'student');
        const teacherCount = users.filter(u => u.role === 'teacher').length;
        
        const bcomRegCount = students.filter(s => s.program === 'B.Com (Regular)').length;
        const bcomProCount = students.filter(s => s.program === 'B.Com (Professional)').length;
        const mcomCount = students.filter(s => s.program === 'M.Com').length;

        // Fetch today's live lecture overrides for admin monitor
        const todayDateStr = (function() {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        })();
        const adjRes = await fetch(`/api/daily-lectures?date=${todayDateStr}`);
        const adjData = await adjRes.json();
        const overrides = adjData.lectures || [];

        let overridesTableHTML = overrides.map(o => `
            <tr>
                <td>${o.program} (Div ${o.division})</td>
                <td><strong>${o.slot.toUpperCase().replace('_', ' ')}</strong></td>
                <td>${o.subject}</td>
                <td>${o.original_teacher}</td>
                <td>
                    <span class="attendance-status-pill" style="
                        background: ${o.status === 'Free' ? 'rgba(239,68,68,0.1)' : (o.status === 'Substituted' ? 'rgba(245,158,11,0.1)' : 'rgba(168,85,247,0.1)')};
                        color: ${o.status === 'Free' ? 'var(--danger)' : (o.status === 'Substituted' ? 'var(--warning)' : 'var(--secondary)')};
                    ">
                        ${o.status.toUpperCase()}
                    </span>
                </td>
                <td>
                    ${o.status === 'Substituted' ? `Sub Professor: <strong>${o.substitute_teacher}</strong>` : ''}
                    ${o.status === 'Combined' ? `Combined Div: <strong>Division ${o.combined_division}</strong> ${o.notes ? `(${o.notes})` : ''}` : ''}
                    ${o.status === 'Scheduled' ? `Note: ${o.notes}` : ''}
                    ${o.status === 'Free' ? 'Cancelled' : ''}
                </td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="clearLectureAdjustment(${o.id})" style="padding: 2px 6px; font-size: 10px;">Clear</button>
                </td>
            </tr>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="stats-grid mb-24">
                <div class="stat-card" style="grid-column: span 1;">
                    <div class="stat-header">
                        <span class="stat-title">Enrolled Students</span>
                        <div class="stat-icon" style="background: rgba(20, 184, 166, 0.1); color: var(--accent);"><i class="fa-solid fa-graduation-cap"></i></div>
                    </div>
                    <div class="stat-value">${students.length}</div>
                    <div style="font-size: 11px; margin-top: 8px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                        <span>B.Com Regular: <strong>${bcomRegCount}</strong></span>
                        <span>B.Com Professional: <strong>${bcomProCount}</strong></span>
                        <span>M.Com Postgrad: <strong>${mcomCount}</strong></span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Faculty Professors</span>
                        <div class="stat-icon" style="background: rgba(99, 102, 241, 0.1); color: var(--primary);"><i class="fa-solid fa-user-tie"></i></div>
                    </div>
                    <div class="stat-value">${teacherCount}</div>
                    <div class="stat-desc">Across all commerce streams</div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Database System</span>
                        <div class="stat-icon" style="background: rgba(168, 85, 247, 0.1); color: var(--secondary);"><i class="fa-solid fa-server"></i></div>
                    </div>
                    <div class="stat-value" style="font-size: 22px; line-height: 38px;">SQLite 3</div>
                    <div class="stat-desc">Integrated program schemas</div>
                </div>
            </div>

            <!-- LIVE COLLEGE LECTURE MONITOR (Principal / Admin view) -->
            <div class="glass-card mb-24" style="border: 1.5px solid var(--warning);">
                <div class="card-header-flex mb-16">
                    <h3 class="card-title" style="color: var(--warning);"><i class="fa-solid fa-desktop mr-8"></i> Live Today's Timetable Overrides Monitor</h3>
                    <span class="attendance-status-pill status-active" style="font-size: 11px;"><i class="fa-solid fa-clock-pulse fa-fade"></i> Live Campus Feed</span>
                </div>
                <div class="table-responsive">
                    <table class="custom-table text-center" style="font-size: 11px;">
                        <thead>
                            <tr>
                                <th>Class Info</th>
                                <th>Slot</th>
                                <th>Subject</th>
                                <th>Original Professor</th>
                                <th>Status Today</th>
                                <th>Adjustment Details</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${overridesTableHTML.length > 0 ? overridesTableHTML : `<tr><td colspan="7" style="color: var(--text-muted); padding: 12px;">No active adjustments declared for today. Normal weekly timetables are running.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="glass-card">
                <h3 class="card-title mb-16"><i class="fa-solid fa-sliders mr-8"></i> Administration Shortcut Actions</h3>
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="navigateTo('students')" style="flex-grow: 1; max-width: 250px;">
                        <i class="fa-solid fa-user-plus mr-8"></i>
                        <span>Manage Users List</span>
                    </button>
                    <button class="btn btn-secondary" onclick="navigateTo('database')" style="flex-grow: 1; max-width: 250px;">
                        <i class="fa-solid fa-terminal mr-8"></i>
                        <span>SQL CLI Terminal</span>
                    </button>
                    <button class="btn btn-danger" id="reset-database-btn" style="flex-grow: 1; max-width: 250px; background: #b91c1c; border-color: #b91c1c;">
                        <i class="fa-solid fa-trash-can mr-8"></i>
                        <span>Reset Portal Database</span>
                    </button>
                </div>
            </div>
        `;

        const resetBtn = document.getElementById("reset-database-btn");
        if (resetBtn) {
            resetBtn.addEventListener("click", async () => {
                const conf = prompt("WARNING: This will permanently delete all student profiles, teachers, subjects, classes, timetables, and notice logs.\n\nYour administrator account and baseline fee configurations will be preserved.\n\nType YES in all capitals to confirm:");
                if (conf === "YES") {
                    try {
                        resetBtn.disabled = true;
                        resetBtn.textContent = "Processing Reset...";
                        const response = await fetch('/api/admin/clear-database', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ confirm: 'yes' })
                        });
                        const resData = await response.json();
                        if (resData.success) {
                            alert(resData.message);
                            window.location.reload();
                        } else {
                            alert(resData.error || "Reset failed.");
                            resetBtn.disabled = false;
                            resetBtn.innerHTML = `<i class="fa-solid fa-trash-can mr-8"></i><span>Reset Portal Database</span>`;
                        }
                    } catch (e) {
                        alert("Error connecting to server.");
                        resetBtn.disabled = false;
                        resetBtn.innerHTML = `<i class="fa-solid fa-trash-can mr-8"></i><span>Reset Portal Database</span>`;
                    }
                }
            });
        }
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load admin stats.</p></div>`;
    }
};

window.renderAdminStudents = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const users = data.users || [];

        function renderRows(filtered) {
            return filtered.map(u => `
                <tr>
                    <td><strong>${u.id}</strong></td>
                    <td><strong>${u.username}</strong></td>
                    <td>${u.name}</td>
                    <td>${u.gender || 'Male'}</td>
                    <td><span class="attendance-status-pill ${u.role === 'admin' ? 'status-active' : (u.role === 'teacher' ? 'status-active' : 'status-active')}" style="background: ${u.role === 'admin' ? 'rgba(168,85,247,0.1)' : (u.role === 'teacher' ? 'rgba(99,102,241,0.1)' : 'rgba(20,184,166,0.1)')}; color: ${u.role === 'admin' ? 'var(--secondary)' : (u.role === 'teacher' ? 'var(--primary)' : 'var(--accent)')};">${u.role === 'teacher' ? 'PROFESSOR' : u.role.toUpperCase()}</span></td>
                    <td>Division ${u.division || 'N/A'}${u.role === 'student' ? ' - ' + (u.year || '1st Year') : ''}</td>
                    <td>${u.program || 'N/A'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${JSON.stringify(u).replace(/"/g, '&quot;')})" style="padding: 4px 8px; font-size: 11px;">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})" style="padding: 4px 8px; font-size: 11px;">Delete</button>
                    </td>
                </tr>
            `).join("");
        }        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px;">
                    <h3 class="card-title">User Registry Console</h3>
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <input type="text" id="admin-user-search" class="form-control" placeholder="Search by Name or Roll No..." style="width: 200px; padding: 4px 8px; font-size: 13px; height: 32px; margin: 0;">
                        <select id="admin-user-role-filter" class="form-control" style="width: 120px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Roles</option>
                            <option value="admin">Admins</option>
                            <option value="teacher">Professors</option>
                            <option value="student">Students</option>
                        </select>
                        <select id="admin-user-program-filter" class="form-control" style="width: 170px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Programs</option>
                            <option value="B.Com (Regular)">B.Com (Regular)</option>
                            <option value="B.Com (Professional)">B.Com (Professional)</option>
                            <option value="M.Com">M.Com</option>
                        </select>
                        <select id="admin-user-year-filter" class="form-control" style="width: 120px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Years</option>
                            <option value="1st Year">1st Year</option>
                            <option value="2nd Year">2nd Year</option>
                            <option value="3rd Year">3rd Year</option>
                        </select>
                        <select id="admin-user-div-filter" class="form-control" style="width: 120px; padding: 4px 8px; font-size: 13px; height: 32px;">
                            <option value="All">All Divisions</option>
                            <option value="A">Division A</option>
                            <option value="B">Division B</option>
                            <option value="C">Division C</option>
                            <option value="D">Division D</option>
                            <option value="E">Division E</option>
                            <option value="F">Division F</option>
                            <option value="G">Division G</option>
                        </select>
                        <button class="btn btn-secondary btn-sm" id="admin-user-export-btn" style="background: var(--success); border-color: var(--success); color: white;"><i class="fa-solid fa-file-excel mr-4"></i> Export Rosters</button>
                        <button class="btn btn-secondary btn-sm" id="admin-user-import-btn" style="background: var(--primary); border-color: var(--primary); color: white;"><i class="fa-solid fa-file-import mr-4"></i> Bulk Import CSV</button>
                        <button class="btn btn-primary btn-sm" onclick="openAddUserModal()"><i class="fa-solid fa-user-plus"></i> Add User</button>
                    </div>
                </div>
                
                <div class="table-responsive" style="max-height: 450px; overflow-y: auto;">
                    <table class="custom-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th>UID</th>
                                <th>Username / Roll No</th>
                                <th>Name</th>
                                <th>Gender</th>
                                <th>Role</th>
                                <th>Division</th>
                                <th>Program</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-user-tbody">
                            ${renderRows(users)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
 
        const searchInput = document.getElementById("admin-user-search");
        const rFilter = document.getElementById("admin-user-role-filter");
        const pFilter = document.getElementById("admin-user-program-filter");
        const yFilter = document.getElementById("admin-user-year-filter");
        const dFilter = document.getElementById("admin-user-div-filter");
        const tbody = document.getElementById("admin-user-tbody");
 
        const filterHandler = () => {
            const rVal = rFilter.value;
            const pVal = pFilter.value;
            const yVal = yFilter.value;
            const dVal = dFilter.value;
            const q = searchInput.value.toLowerCase().trim();
 
            const filtered = users.filter(u => {
                const matchesR = (rVal === "All") || (u.role === rVal);
                const matchesP = (pVal === "All") || (u.role !== "student") || (u.program === pVal);
                const matchesY = (yVal === "All") || (u.role !== "student") || (u.year === yVal);
                const matchesD = (dVal === "All") || (u.role !== "student") || (u.division === dVal);
                const matchesSearch = !q || 
                    (u.name && u.name.toLowerCase().includes(q)) || 
                    (u.username && String(u.username).toLowerCase().includes(q));
                return matchesR && matchesP && matchesY && matchesD && matchesSearch;
            });
 
            tbody.innerHTML = renderRows(filtered);
        };
 
        searchInput.addEventListener("input", filterHandler);
        rFilter.addEventListener("change", filterHandler);
        pFilter.addEventListener("change", filterHandler);
        yFilter.addEventListener("change", filterHandler);
        dFilter.addEventListener("change", filterHandler);

        const exportBtn = document.getElementById("admin-user-export-btn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                const students = users.filter(u => u.role === 'student');
                if (students.length === 0) {
                    alert("No students registered to export.");
                    return;
                }

                // Group students by program, year, semester, and division
                const groups = {};
                students.forEach(s => {
                    const prog = s.program || 'B.Com (Regular)';
                    const yr = s.year || '1st Year';
                    const sem = s.semester || 'Semester 1';
                    const div = s.division || 'A';
                    
                    const groupKey = `${prog}_${yr}_${sem}_Div_${div}`;
                    if (!groups[groupKey]) {
                        groups[groupKey] = [];
                    }
                    groups[groupKey].push(s);
                });

                // Download each group as a separate file
                Object.keys(groups).forEach(key => {
                    const groupStudents = groups[key];
                    const headers = ["Roll Number / Username", "Student Name", "Gender", "Category", "Class / Division", "Stream / Program", "Academic Year", "Semester", "Email", "Phone", "Fee Total", "Fee Paid", "Fee Due"];
                    const rows = groupStudents.map(s => [
                        s.username,
                        s.name,
                        s.gender || 'Male',
                        s.category || 'General',
                        `${s.class || 'B.Com'} - Div ${s.division || 'A'}`,
                        s.program || 'B.Com (Regular)',
                        s.year || '1st Year',
                        s.semester || 'Semester 1',
                        s.email || 'N/A',
                        s.phone || 'N/A',
                        s.fee_total || 0,
                        s.fee_paid || 0,
                        s.fee_due || 0
                    ]);

                    const csvContent = "\uFEFF" + [
                        headers.join(','),
                        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
                    ].join('\n');

                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    
                    const safeName = key.replace(/[^a-zA-Z0-9]/g, '_');
                    link.setAttribute("href", url);
                    link.setAttribute("download", `Roster_${safeName}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            });
        }

        const importBtn = document.getElementById("admin-user-import-btn");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                generalModalTitle.textContent = "Bulk Import Student Roster (CSV)";
                generalModalBody.innerHTML = `
                    <form id="bulk-import-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label><strong>1. Select Program</strong></label>
                            <select id="import-program" class="form-control" required>
                                <option value="B.Com (Regular)">B.Com (Regular)</option>
                                <option value="B.Com (Professional)">B.Com (Professional)</option>
                                <option value="M.Com">M.Com</option>
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label><strong>2. Academic Year</strong></label>
                            <select id="import-year" class="form-control" required>
                                <option value="1st Year">1st Year</option>
                                <option value="2nd Year">2nd Year</option>
                                <option value="3rd Year">3rd Year</option>
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label><strong>3. Semester</strong></label>
                            <select id="import-semester" class="form-control" required>
                                <option value="Semester 1">Semester 1</option>
                                <option value="Semester 2">Semester 2</option>
                                <option value="Semester 3">Semester 3</option>
                                <option value="Semester 4">Semester 4</option>
                                <option value="Semester 5">Semester 5</option>
                                <option value="Semester 6">Semester 6</option>
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label><strong>4. Class Division</strong></label>
                            <select id="import-division" class="form-control" required>
                                <option value="A">Division A</option>
                                <option value="B">Division B</option>
                                <option value="C">Division C</option>
                                <option value="D">Division D</option>
                                <option value="E">Division E</option>
                                <option value="F">Division F</option>
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label><strong>5. Choose CSV File</strong></label>
                            <input type="file" id="import-file" accept=".csv" class="form-control" required>
                            <span style="font-size: 11px; color: var(--text-muted);">Must contain headers like: <code>SR.NO.</code> (or <code>Roll No</code>), <code>Name</code>, <code>Gender</code>.</span>
                        </div>
                        <div id="import-progress-area" style="display: none; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 6px; font-size: 13px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span id="import-progress-text">Processing...</span>
                                <span id="import-progress-percent">0%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden;">
                                <div id="import-progress-bar" style="width: 0%; height: 100%; background: var(--primary); transition: width 0.1s;"></div>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                            <i class="fa-solid fa-file-import mr-8"></i> Start Bulk Import
                        </button>
                    </form>
                `;
                generalModal.classList.add("active");

                const form = document.getElementById("bulk-import-form");
                form.addEventListener("submit", async (e) => {
                    e.preventDefault();
                    const program = document.getElementById("import-program").value;
                    const year = document.getElementById("import-year").value;
                    const semester = document.getElementById("import-semester").value;
                    const division = document.getElementById("import-division").value;
                    const fileInput = document.getElementById("import-file");
                    
                    if (fileInput.files.length === 0) return;
                    const file = fileInput.files[0];
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const csvText = event.target.result;
                        
                        const lines = csvText.split(/\r?\n/);
                        if (lines.length <= 1) {
                            alert("CSV file is empty or missing data rows.");
                            return;
                        }
                        
                        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toUpperCase());
                        
                        let srNoIdx = headers.findIndex(h => h.includes('SR.NO') || h.includes('SR NO') || h.includes('ROLL') || h.includes('USERNAME') || h.includes('SERIAL') || h.includes('ID'));
                        let nameIdx = headers.findIndex(h => h.includes('NAME') || h.includes('STUDENT') || h.includes('FULLNAME'));
                        let genderIdx = headers.findIndex(h => h.includes('GENDER') || h.includes('SEX'));
                        let emailIdx = headers.findIndex(h => h.includes('EMAIL') || h.includes('MAIL'));
                        let phoneIdx = headers.findIndex(h => h.includes('PHONE') || h.includes('CONTACT') || h.includes('MOBILE'));
                        
                        if (srNoIdx === -1) srNoIdx = 0;
                        if (nameIdx === -1) nameIdx = 1;
                        if (genderIdx === -1) genderIdx = 2;
                        
                        const students = [];
                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            
                            const cols = [];
                            let current = '';
                            let inQuotes = false;
                            for (let c = 0; c < line.length; c++) {
                                const char = line[c];
                                if (char === '"') {
                                    inQuotes = !inQuotes;
                                } else if (char === ',' && !inQuotes) {
                                    cols.push(current.trim().replace(/^["']|["']$/g, ''));
                                    current = '';
                                } else {
                                    current += char;
                                }
                            }
                            cols.push(current.trim().replace(/^["']|["']$/g, ''));
                            
                            if (cols.length < 2 || !cols[srNoIdx]) continue;
                            
                            students.push({
                                rollNo: cols[srNoIdx].trim(),
                                name: cols[nameIdx] ? cols[nameIdx].trim() : `Student ${cols[srNoIdx]}`,
                                gender: cols[genderIdx] ? cols[genderIdx].trim() : 'Male',
                                email: emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx].trim() : '',
                                phone: phoneIdx !== -1 && cols[phoneIdx] ? cols[phoneIdx].trim() : ''
                            });
                        }
                        
                        if (students.length === 0) {
                            alert("No valid student rows found in the CSV.");
                            return;
                        }
                        
                        if (!confirm(`Found ${students.length} students. Proceed to import?`)) return;
                        
                        const progressArea = document.getElementById("import-progress-area");
                        const progressText = document.getElementById("import-progress-text");
                        const progressPercent = document.getElementById("import-progress-percent");
                        const progressBar = document.getElementById("import-progress-bar");
                        const submitBtn = form.querySelector("button[type='submit']");
                        
                        progressArea.style.display = "block";
                        submitBtn.disabled = true;
                        
                        let successCount = 0;
                        let errorCount = 0;
                        
                        for (let idx = 0; idx < students.length; idx++) {
                            const s = students[idx];
                            
                            let baselineFee = 0;
                            const progLower = program.toLowerCase();
                            const genderLower = s.gender.toLowerCase();
                            if (progLower.includes('professional')) {
                                baselineFee = genderLower === 'female' ? 14000 : 15000;
                            } else if (progLower.includes('m.com') || progLower.includes('mcom')) {
                                baselineFee = genderLower === 'female' ? 8000 : 9000;
                            } else {
                                baselineFee = genderLower === 'female' ? 5000 : 6000;
                            }
                            
                            try {
                                const addRes = await fetch('/api/users/add', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        username: s.rollNo,
                                        password: s.rollNo,
                                        role: 'student',
                                        name: s.name,
                                        email: s.email,
                                        phone: s.phone,
                                        gender: s.gender,
                                        category: 'General',
                                        subject: 'Commerce',
                                        class_name: `${program} - Div ${division}`,
                                        department: 'Commerce Department',
                                        division: division,
                                        program: program,
                                        year: year,
                                        semester: semester,
                                        fee_total: baselineFee,
                                        fee_paid: 0,
                                        fee_due: baselineFee
                                    })
                                });
                                const resJSON = await addRes.json();
                                if (resJSON.success) {
                                    successCount++;
                                } else {
                                    errorCount++;
                                }
                            } catch (err) {
                                errorCount++;
                            }
                            
                            const pct = Math.round(((idx + 1) / students.length) * 100);
                            progressPercent.textContent = `${pct}%`;
                            progressText.textContent = `Importing ${idx + 1} of ${students.length}...`;
                            progressBar.style.width = `${pct}%`;
                        }
                        
                        alert(`Roster import completed!\n\nSuccessfully Imported: ${successCount} students.\nFailed/Duplicates: ${errorCount}.`);
                        generalModal.classList.remove("active");
                        window.renderAdminStudents();
                    };
                    reader.readAsText(file);
                });
            });
        }

    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load user registry list.</p></div>`;
    }
};

window.openAddUserModal = function() {
    generalModalTitle.textContent = "Register New User Account";
    generalModalBody.innerHTML = `
        <form id="add-user-form" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="form-grid">
                <div>
                    <label>Username / Roll Number</label>
                    <input type="text" id="add-user-username" class="form-control" placeholder="105 or prof_sarah" required autocomplete="off">
                </div>
                <div>
                    <label>Password (Security Key / SPID)</label>
                    <input type="password" id="add-user-password" class="form-control" placeholder="••••••" required autocomplete="off">
                </div>
                <div>
                    <label>Full Name</label>
                    <input type="text" id="add-user-name" class="form-control" placeholder="Jane Doe" required autocomplete="off">
                </div>
                <div>
                    <label>Gender</label>
                    <select id="add-user-gender" class="form-control" required>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                <div>
                    <label>User Role</label>
                    <select id="add-user-role" class="form-control" required>
                        <option value="student">Student</option>
                        <option value="teacher">Professor</option>
                        <option value="admin">Administrator</option>
                    </select>
                </div>
                <div>
                    <label>Email Address</label>
                    <input type="email" id="add-user-email" class="form-control" placeholder="jane@tolani.edu" autocomplete="off">
                </div>
                <div>
                    <label>Contact Phone</label>
                    <input type="text" id="add-user-phone" class="form-control" placeholder="+91 98765 43210" autocomplete="off">
                </div>
                <div>
                    <label>Division</label>
                    <select id="add-user-division" class="form-control">
                        <option value="A">Division A</option>
                        <option value="B">Division B</option>
                        <option value="C">Division C</option>
                        <option value="D">Division D</option>
                        <option value="E">Division E</option>
                        <option value="F">Division F</option>
                        <option value="G">Division G</option>
                    </select>
                </div>
                <div>
                    <label>Class Year</label>
                    <input type="text" id="add-user-class" class="form-control" placeholder="B.Com. Sem-I" value="B.Com. Sem-I" autocomplete="off">
                </div>
                <div>
                    <label>Stream / Program</label>
                    <select id="add-user-program" class="form-control">
                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                        <option value="B.Com (Professional)">B.Com (Professional)</option>
                        <option value="M.Com">M.Com</option>
                    </select>
                </div>
                <div>
                    <label>Current Year</label>
                    <select id="add-user-year" class="form-control">
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                    </select>
                </div>
                <div>
                    <label>Current Semester</label>
                    <select id="add-user-semester" class="form-control">
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                        <option value="Semester 3">Semester 3</option>
                        <option value="Semester 4">Semester 4</option>
                        <option value="Semester 5">Semester 5</option>
                        <option value="Semester 6">Semester 6</option>
                    </select>
                </div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                <i class="fa-solid fa-save mr-8"></i>
                <span>Save Record</span>
            </button>
        </form>
    `;

    generalModal.classList.add("active");

    const addForm = document.getElementById("add-user-form");
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("add-user-username").value.trim();
        const password = document.getElementById("add-user-password").value;
        const name = document.getElementById("add-user-name").value.trim();
        const gender = document.getElementById("add-user-gender").value;
        const role = document.getElementById("add-user-role").value;
        const email = document.getElementById("add-user-email").value.trim();
        const phone = document.getElementById("add-user-phone").value.trim();
        const division = document.getElementById("add-user-division").value;
        const class_name = document.getElementById("add-user-class").value.trim();
        const program = document.getElementById("add-user-program").value;
        const year = document.getElementById("add-user-year").value;
        const semester = document.getElementById("add-user-semester").value;

        try {
            const res = await fetch('/api/users/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, name, email, phone, division, class_name, program, year, semester, gender })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                generalModal.classList.remove("active");
                window.renderAdminStudents();
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to submit user creation request.");
        }
    });
};

window.openEditUserModal = async function(user) {
    generalModalTitle.textContent = `Edit User Details (UID: ${user.id})`;

    let subjectBlock = '';
    if (user.role === 'teacher') {
        let checkboxesHTML = '';
        try {
            const subRes = await fetch(`/api/subjects?program=${encodeURIComponent(user.program || 'B.Com (Regular)')}`);
            const subData = await subRes.json();
            const subjects = subData.subjects || [];
            const userSubjects = user.subject ? user.subject.split(',').map(s => s.trim()) : [];
            checkboxesHTML = subjects.map(s => {
                const isChecked = userSubjects.includes(s.name) ? 'checked' : '';
                return `
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; margin: 4px 0; cursor: pointer; color: var(--text-main);">
                        <input type="checkbox" class="edit-user-subject-checkbox" value="${s.name}" ${isChecked} style="width: 16px; height: 16px; cursor: pointer;">
                        <span>${s.name} (${s.code}) - Sem ${s.semester.replace('Semester ', '')}</span>
                    </label>
                `;
            }).join('');
        } catch (e) {
            console.error("Failed to load subjects for edit:", e);
        }
        subjectBlock = `
            <div style="grid-column: span 2;">
                <label style="display: block; margin-bottom: 8px;">Assigned Subject(s)</label>
                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(0,0,0,0.2);">
                    ${checkboxesHTML || '<span style="color: var(--text-muted); font-size: 12px;">No subjects found for this program.</span>'}
                </div>
            </div>
        `;
    }

    generalModalBody.innerHTML = `
        <form id="edit-user-form" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="form-grid">
                <div>
                    <label>Username / Roll No</label>
                    <input type="text" id="edit-user-username" class="form-control" value="${user.username}" required autocomplete="off">
                </div>
                <div>
                    <label>Full Name</label>
                    <input type="text" id="edit-user-name" class="form-control" value="${user.name}" required autocomplete="off">
                </div>
                <div>
                    <label>Gender</label>
                    <select id="edit-user-gender" class="form-control" required>
                        <option value="Male" ${user.gender === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${user.gender === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                </div>
                <div>
                    <label>Email Address</label>
                    <input type="email" id="edit-user-email" class="form-control" value="${user.email || ''}" autocomplete="off">
                </div>
                <div>
                    <label>Contact Phone</label>
                    <input type="text" id="edit-user-phone" class="form-control" value="${user.phone || ''}" autocomplete="off">
                </div>
                <div>
                    <label>Division</label>
                    <select id="edit-user-division" class="form-control">
                        <option value="A" ${user.division === 'A' ? 'selected' : ''}>Division A</option>
                        <option value="B" ${user.division === 'B' ? 'selected' : ''}>Division B</option>
                        <option value="C" ${user.division === 'C' ? 'selected' : ''}>Division C</option>
                        <option value="D" ${user.division === 'D' ? 'selected' : ''}>Division D</option>
                        <option value="E" ${user.division === 'E' ? 'selected' : ''}>Division E</option>
                        <option value="F" ${user.division === 'F' ? 'selected' : ''}>Division F</option>
                        <option value="G" ${user.division === 'G' ? 'selected' : ''}>Division G</option>
                    </select>
                </div>
                <div>
                    <label>Class Year</label>
                    <input type="text" id="edit-user-class" class="form-control" value="${user.class || ''}" autocomplete="off">
                </div>
                <div>
                    <label>Department / Major</label>
                    <input type="text" id="edit-user-dept" class="form-control" value="${user.department || ''}" autocomplete="off">
                </div>
                <div>
                    <label>Stream / Program</label>
                    <select id="edit-user-program" class="form-control">
                        <option value="B.Com (Regular)" ${user.program === 'B.Com (Regular)' ? 'selected' : ''}>B.Com (Regular)</option>
                        <option value="B.Com (Professional)" ${user.program === 'B.Com (Professional)' ? 'selected' : ''}>B.Com (Professional)</option>
                        <option value="M.Com" ${user.program === 'M.Com' ? 'selected' : ''}>M.Com</option>
                    </select>
                </div>
                <div>
                    <label>Current Year</label>
                    <select id="edit-user-year" class="form-control">
                        <option value="1st Year" ${user.year === '1st Year' ? 'selected' : ''}>1st Year</option>
                        <option value="2nd Year" ${user.year === '2nd Year' ? 'selected' : ''}>2nd Year</option>
                        <option value="3rd Year" ${user.year === '3rd Year' ? 'selected' : ''}>3rd Year</option>
                    </select>
                </div>
                <div>
                    <label>Current Semester</label>
                    <select id="edit-user-semester" class="form-control">
                        <option value="Semester 1" ${user.semester === 'Semester 1' ? 'selected' : ''}>Semester 1</option>
                        <option value="Semester 2" ${user.semester === 'Semester 2' ? 'selected' : ''}>Semester 2</option>
                        <option value="Semester 3" ${user.semester === 'Semester 3' ? 'selected' : ''}>Semester 3</option>
                        <option value="Semester 4" ${user.semester === 'Semester 4' ? 'selected' : ''}>Semester 4</option>
                        <option value="Semester 5" ${user.semester === 'Semester 5' ? 'selected' : ''}>Semester 5</option>
                        <option value="Semester 6" ${user.semester === 'Semester 6' ? 'selected' : ''}>Semester 6</option>
                    </select>
                </div>
                <div>
                    <label>Change Password (leave blank to keep current)</label>
                    <input type="password" id="edit-user-password" class="form-control" placeholder="Enter new password" autocomplete="new-password">
                </div>
                ${subjectBlock}
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                <i class="fa-solid fa-save mr-8"></i>
                <span>Save Updates</span>
            </button>
        </form>
    `;

    generalModal.classList.add("active");

    const editForm = document.getElementById("edit-user-form");
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("edit-user-username").value.trim();
        const name = document.getElementById("edit-user-name").value.trim();
        const gender = document.getElementById("edit-user-gender").value;
        const email = document.getElementById("edit-user-email").value.trim();
        const phone = document.getElementById("edit-user-phone").value.trim();
        const division = document.getElementById("edit-user-division").value;
        const class_name = document.getElementById("edit-user-class").value.trim();
        const department = document.getElementById("edit-user-dept").value.trim();
        const program = document.getElementById("edit-user-program").value;
        const year = document.getElementById("edit-user-year").value;
        const semester = document.getElementById("edit-user-semester").value;
        const password = document.getElementById("edit-user-password").value;
        const subject = user.role === 'teacher' ? Array.from(document.querySelectorAll('.edit-user-subject-checkbox:checked')).map(cb => cb.value).join(', ') : null;

        try {
            const res = await fetch('/api/users/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, username, name, email, phone, division, class_name, department, program, year, semester, gender, password, subject })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                generalModal.classList.remove("active");
                if (window.renderAdminStudents && typeof window.renderAdminStudents === 'function') {
                    window.renderAdminStudents();
                } else {
                    window.renderProgramManagement(user.program);
                }
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save updates.");
        }
    });
};

window.deleteUser = async function(id) {
    if (!confirm("Are you sure you want to permanently delete this user account?")) return;

    try {
        const res = await fetch('/api/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            if (currentUser.role === 'admin') {
                window.renderAdminStudents();
            } else {
                window.renderProgramManagement(programName); // Falls back correctly
            }
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to delete user.");
    }
};

window.renderAdminTimetable = function() {
    dynamicContentArea.innerHTML = `
        <div class="glass-card text-center" style="padding: 40px;">
            <i class="fa-solid fa-calendar-days" style="font-size: 40px; color: var(--primary); margin-bottom: 16px;"></i>
            <h3>Unified Timetables Console</h3>
            <p style="color: var(--text-muted); margin-bottom: 20px;">Use the program management pages in the sidebar to configure schedules for individual streams.</p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="navigateTo('bcom')">B.Com Regular</button>
                <button class="btn btn-secondary" onclick="navigateTo('bcompro')">B.Com Professional</button>
                <button class="btn btn-secondary" onclick="navigateTo('mcom')">M.Com</button>
            </div>
        </div>
    `;
};

window.renderAdminSchedule = function() {
    window.renderTeacherSchedule();
};

window.renderAdminFees = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        const res = await fetch('/api/settings/fees');
        const data = await res.json();
        const f = data.fees || {};

        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <h3 class="card-title mb-16"><i class="fa-solid fa-wallet mr-8"></i> Baseline Tuition Fees Setup</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">
                    Configure gender-based baseline semester tuition fee rates for academic streams. Saving applies changes to new registrations.
                </p>
                <form id="admin-fees-form" style="display: flex; flex-direction: column; gap: 16px; max-width: 600px;">
                    
                    <h4 style="color: var(--primary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;"><i class="fa-solid fa-book mr-8"></i> B.Com (Regular) Fees</h4>
                    <div class="form-grid mb-12">
                        <div>
                            <label>Boys Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_bcom_regular_boy || '6200'}" id="fee-bcom-reg-boy" required>
                        </div>
                        <div>
                            <label>Girls Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_bcom_regular_girl || '5200'}" id="fee-bcom-reg-girl" required>
                        </div>
                    </div>

                    <h4 style="color: var(--accent); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;"><i class="fa-solid fa-graduation-cap mr-8"></i> B.Com (Professional) Fees</h4>
                    <div class="form-grid mb-12">
                        <div>
                            <label>Boys Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_bcom_professional_boy || '9500'}" id="fee-bcom-pro-boy" required>
                        </div>
                        <div>
                            <label>Girls Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_bcom_professional_girl || '8500'}" id="fee-bcom-pro-girl" required>
                        </div>
                    </div>

                    <h4 style="color: var(--secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;"><i class="fa-solid fa-award mr-8"></i> M.Com Fees</h4>
                    <div class="form-grid mb-12">
                        <div>
                            <label>Boys Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_mcom_boy || '12000'}" id="fee-mcom-boy" required>
                        </div>
                        <div>
                            <label>Girls Tuition Fee (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_baseline_mcom_girl || '11000'}" id="fee-mcom-girl" required>
                        </div>
                    </div>

                    <h4 style="color: var(--warning); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation mr-8"></i> Other Charges</h4>
                    <div class="form-grid mb-24">
                        <div>
                            <label>Late Penalty Rate (INR)</label>
                            <input type="number" class="form-control" value="${f.fee_penalty || '150'}" id="fee-penalty-rate" required>
                        </div>
                        <div></div>
                    </div>

                    <button type="submit" class="btn btn-primary" style="max-width: 220px;">
                        <i class="fa-solid fa-floppy-disk mr-8"></i> Save Baseline Fees
                    </button>
                </form>
            </div>
        `;

        const feesForm = document.getElementById("admin-fees-form");
        if (feesForm) {
            feesForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const fees = {
                    fee_baseline_bcom_regular_boy: document.getElementById("fee-bcom-reg-boy").value,
                    fee_baseline_bcom_regular_girl: document.getElementById("fee-bcom-reg-girl").value,
                    fee_baseline_bcom_professional_boy: document.getElementById("fee-bcom-pro-boy").value,
                    fee_baseline_bcom_professional_girl: document.getElementById("fee-bcom-pro-girl").value,
                    fee_baseline_mcom_boy: document.getElementById("fee-mcom-boy").value,
                    fee_baseline_mcom_girl: document.getElementById("fee-mcom-girl").value,
                    fee_penalty: document.getElementById("fee-penalty-rate").value
                };

                try {
                    const saveRes = await fetch('/api/settings/fees', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fees })
                    });
                    const saveData = await saveRes.json();
                    if (saveData.success) {
                        alert(saveData.message);
                    } else {
                        alert(saveData.error || "Failed to save baseline configuration.");
                    }
                } catch (err) {
                    alert("Error saving baseline settings.");
                }
            });
        }
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load fees setup.</p></div>`;
    }
};

window.renderAdminProfile = function() {
    window.renderStaffProfile();
};


// =========================================================================
// PROGRAM MANAGEMENT REUSABLE CONSOLE
// =========================================================================

window.renderProgramManagement = async function(programName) {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        // Load initial values (teachers, subjects, notices, timetables)
        const userRes = await fetch('/api/users');
        const userData = await userRes.json();
        const teachers = (userData.users || []).filter(u => u.role === 'teacher' && u.program === programName);

        const subRes = await fetch(`/api/subjects?program=${encodeURIComponent(programName)}`);
        const subData = await subRes.json();
        const subjects = subData.subjects || [];

        const noticeRes = await fetch(`/api/notices?program=${encodeURIComponent(programName)}`);
        const noticeData = await noticeRes.json();
        const notices = noticeData.notices || [];

        const ttRes = await fetch(`/api/timetables?program=${encodeURIComponent(programName)}`);
        const ttData = await ttRes.json();
        const ttRows = ttData.timetables || [];
        const ttMap = {};
        ttRows.forEach(r => {
            ttMap[r.day] = { slot_1: r.slot_1 || '', slot_2: r.slot_2 || '', slot_3: r.slot_3 || '', slot_4: r.slot_4 || '' };
        });

        // HTML Layout for Program tabs
        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <div class="card-header-flex mb-16" style="border-bottom: 1.5px solid var(--border-color); padding-bottom: 12px;">
                    <h3 class="card-title"><i class="fa-solid fa-graduation-cap mr-8"></i> ${programName} Console</h3>
                    <div class="tabs-group" style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm active" id="btn-tab-teachers">Professors</button>
                        <button class="btn btn-secondary btn-sm" id="btn-tab-timetable">Timetable</button>
                        <button class="btn btn-secondary btn-sm" id="btn-tab-subjects">Subjects</button>
                        <button class="btn btn-secondary btn-sm" id="btn-tab-notices">Notices</button>
                    </div>
                </div>

                <!-- TAB CONTENTS -->
                <div id="program-tab-content">
                    <!-- Dynamic -->
                </div>
            </div>
        `;

        // Render Teachers Tab
        function showTeachersTab() {
            let rowHTML = teachers.map(t => `
                <tr>
                    <td><strong>${t.id}</strong></td>
                    <td><strong>${t.username}</strong></td>
                    <td>${t.name}</td>
                    <td>${t.email || 'N/A'}</td>
                    <td>${t.phone || 'N/A'}</td>
                    <td><span class="attendance-status-pill status-active" style="font-size: 11px;">${t.subject || 'Not Assigned'}</span></td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser(${t.id})" style="padding: 4px 8px; font-size: 11px;">Remove</button>
                    </td>
                </tr>
            `).join("");

            document.getElementById("program-tab-content").innerHTML = `
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px;">
                    <h4 style="margin: 0;">Assigned Professors</h4>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <input type="text" id="program-prof-search" class="form-control" placeholder="Search professor name or subject..." style="width: 250px; font-size: 12px; height: 28px; padding: 4px 8px; margin: 0;">
                        <button class="btn btn-primary btn-sm" id="add-program-teacher-btn"><i class="fa-solid fa-user-plus mr-4"></i> Add Professor</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="custom-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th>UID</th>
                                <th>Username</th>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Subject</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowHTML.length > 0 ? rowHTML : `<tr><td colspan="7" style="color: var(--text-muted); padding: 16px; text-align: center;">No teachers assigned to this program.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;

            const profSearchInput = document.getElementById("program-prof-search");
            if (profSearchInput) {
                profSearchInput.addEventListener("input", (e) => {
                    const q = e.target.value.toLowerCase().trim();
                    const tbody = document.querySelector("#program-tab-content tbody");
                    if (!tbody) return;
                    const rows = tbody.querySelectorAll("tr");
                    rows.forEach(tr => {
                        const text = tr.innerText.toLowerCase();
                        if (!q || text.includes(q)) {
                            tr.style.display = "";
                        } else {
                            tr.style.display = "none";
                        }
                    });
                });
            }

            document.getElementById("add-program-teacher-btn").addEventListener("click", async () => {
                generalModalTitle.textContent = `Register Professor for ${programName}`;
                
                // Fetch subjects list for the program first
                let checkboxesHTML = '';
                try {
                    const subRes = await fetch(`/api/subjects?program=${encodeURIComponent(programName)}`);
                    const subData = await subRes.json();
                    const subjects = subData.subjects || [];
                    checkboxesHTML = subjects.map(s => `
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; margin: 4px 0; cursor: pointer; color: var(--text-main);">
                            <input type="checkbox" class="apt-subject-checkbox" value="${s.name}" style="width: 16px; height: 16px; cursor: pointer;">
                            <span>${s.name} (${s.code}) - Sem ${s.semester.replace('Semester ', '')}</span>
                        </label>
                    `).join('');
                } catch (e) {
                    console.error("Failed to load subjects for teacher registration:", e);
                }

                generalModalBody.innerHTML = `
                    <form id="add-prog-teacher-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-grid">
                            <div>
                                <label>Username (Code)</label>
                                <input type="text" id="apt-username" class="form-control" placeholder="prof_jennifer" required autocomplete="off">
                            </div>
                            <div>
                                <label>Password</label>
                                <input type="password" id="apt-password" class="form-control" placeholder="••••••" required autocomplete="off">
                            </div>
                            <div>
                                <label>Full Name</label>
                                <input type="text" id="apt-name" class="form-control" placeholder="Dr. Jennifer Smith" required autocomplete="off">
                            </div>
                            <div>
                                <label>Gender</label>
                                <select id="apt-gender" class="form-control" required>
                                    <option value="Female">Female</option>
                                    <option value="Male">Male</option>
                                </select>
                            </div>
                            <div>
                                <label>Email Address</label>
                                <input type="email" id="apt-email" class="form-control" placeholder="jennifer@tolani.edu" autocomplete="off">
                            </div>
                            <div>
                                <label>Contact Phone</label>
                                <input type="text" id="apt-phone" class="form-control" placeholder="+91 99988 88877" autocomplete="off">
                            </div>
                            <div style="grid-column: span 2;">
                                <label style="display: block; margin-bottom: 8px;">Assigned Subject(s)</label>
                                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(0,0,0,0.2);">
                                    ${checkboxesHTML || '<span style="color: var(--text-muted); font-size: 12px;">No subjects found for this program.</span>'}
                                </div>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                            <i class="fa-solid fa-save mr-8"></i> Save Professor Record
                        </button>
                    </form>
                `;
                generalModal.classList.add("active");

                document.getElementById("add-prog-teacher-form").addEventListener("submit", async (ev) => {
                    ev.preventDefault();
                    const username = document.getElementById("apt-username").value.trim();
                    const password = document.getElementById("apt-password").value;
                    const name = document.getElementById("apt-name").value.trim();
                    const gender = document.getElementById("apt-gender").value;
                    const email = document.getElementById("apt-email").value.trim();
                    const phone = document.getElementById("apt-phone").value.trim();
                    const subject = Array.from(document.querySelectorAll('.apt-subject-checkbox:checked')).map(cb => cb.value).join(', ');

                    try {
                        const registerRes = await fetch('/api/users/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username, password, name, email, phone, gender, subject,
                                role: 'teacher',
                                program: programName,
                                division: 'All',
                                class_name: programName + ' Faculty',
                                department: 'Commerce Faculty'
                            })
                        });
                        const registerData = await registerRes.json();
                        if (registerData.success) {
                            alert(registerData.message);
                            generalModal.classList.remove("active");
                            window.renderProgramManagement(programName);
                        } else {
                            alert(registerData.error);
                        }
                    } catch (e) {
                        alert("Error saving professor.");
                    }
                });
            });
        }

        // Render Timetable Tab
        function showTimetableTab() {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            // Initialize default select values
            let selectedSemester = 'Semester 1';
            let selectedDivision = 'A';

            async function refreshTimetableGrid() {
                const progKey = `${programName} - ${selectedSemester} - Div ${selectedDivision}`;
                const res = await fetch(`/api/timetables?program=${encodeURIComponent(progKey)}`);
                const data = await res.json();
                let currentRows = data.timetables || [];
                
                // Fallback to base program timetable if division/semester timetable does not exist
                if (currentRows.length === 0) {
                    const fallbackRes = await fetch(`/api/timetables?program=${encodeURIComponent(programName)}`);
                    const fallbackData = await fallbackRes.json();
                    currentRows = fallbackData.timetables || [];
                }

                const currentMap = {};
                currentRows.forEach(r => {
                    currentMap[r.day] = { slot_1: r.slot_1 || '', slot_2: r.slot_2 || '', slot_3: r.slot_3 || '', slot_4: r.slot_4 || '' };
                });

                days.forEach(day => {
                    const s = currentMap[day] || { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
                    document.getElementById(`tt-input-${day}-slot_1`).value = s.slot_1;
                    document.getElementById(`tt-input-${day}-slot_2`).value = s.slot_2;
                    document.getElementById(`tt-input-${day}-slot_3`).value = s.slot_3;
                    document.getElementById(`tt-input-${day}-slot_4`).value = s.slot_4;
                });
            }

            let rowHTML = days.map(day => {
                return `
                    <tr>
                        <td><strong>${day}</strong></td>
                        <td><input type="text" class="form-control tt-input" id="tt-input-${day}-slot_1" data-day="${day}" data-slot="slot_1" value="" placeholder="Free Slot" style="font-size: 11px; padding: 4px; height: 28px;"></td>
                        <td><input type="text" class="form-control tt-input" id="tt-input-${day}-slot_2" data-day="${day}" data-slot="slot_2" value="" placeholder="Free Slot" style="font-size: 11px; padding: 4px; height: 28px;"></td>
                        <td><input type="text" class="form-control tt-input" id="tt-input-${day}-slot_3" data-day="${day}" data-slot="slot_3" value="" placeholder="Free Slot" style="font-size: 11px; padding: 4px; height: 28px;"></td>
                        <td><input type="text" class="form-control tt-input" id="tt-input-${day}-slot_4" data-day="${day}" data-slot="slot_4" value="" placeholder="Free Slot" style="font-size: 11px; padding: 4px; height: 28px;"></td>
                    </tr>
                `;
            }).join("");

            document.getElementById("program-tab-content").innerHTML = `
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px; align-items: center;">
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <h4 style="margin: 0; margin-right: 12px;">Weekly Lecture Schedule Registry</h4>
                        <label style="font-size: 12px; color: var(--text-muted);">Semester:</label>
                        <select id="tt-select-semester" class="form-control" style="width: 120px; padding: 4px; height: 28px; font-size: 11px;">
                            <option value="Semester 1">Semester 1</option>
                            <option value="Semester 2">Semester 2</option>
                            <option value="Semester 3">Semester 3</option>
                            <option value="Semester 4">Semester 4</option>
                            <option value="Semester 5">Semester 5</option>
                            <option value="Semester 6">Semester 6</option>
                        </select>
                        <label style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">Division:</label>
                        <select id="tt-select-division" class="form-control" style="width: 100px; padding: 4px; height: 28px; font-size: 11px;">
                            <option value="A">Division A</option>
                            <option value="B">Division B</option>
                            <option value="C">Division C</option>
                            <option value="D">Division D</option>
                            <option value="E">Division E</option>
                            <option value="F">Division F</option>
                            <option value="G">Division G</option>
                        </select>
                    </div>
                    <button class="btn btn-primary btn-sm" id="save-program-timetable-btn"><i class="fa-solid fa-floppy-disk mr-4"></i> Save Timetable</button>
                </div>
                <div class="table-responsive">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Day</th>
                                <th>Slot 1 (8:00-9:00)</th>
                                <th>Slot 2 (9:00-10:00)</th>
                                <th>Slot 3 (10:20-11:20)</th>
                                <th>Slot 4 (11:20-12:20)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowHTML}
                        </tbody>
                    </table>
                </div>
            `;

            // Setup Event Listeners for selectors
            const semSelect = document.getElementById("tt-select-semester");
            const divSelect = document.getElementById("tt-select-division");

            semSelect.addEventListener("change", () => {
                selectedSemester = semSelect.value;
                refreshTimetableGrid();
            });

            divSelect.addEventListener("change", () => {
                selectedDivision = divSelect.value;
                refreshTimetableGrid();
            });

            // Initial load of grid
            refreshTimetableGrid();

            document.getElementById("save-program-timetable-btn").addEventListener("click", async () => {
                const inputs = document.querySelectorAll(".tt-input");
                const gridData = {};

                const targetProgName = `${programName} - ${selectedSemester} - Div ${selectedDivision}`;

                days.forEach(d => {
                    gridData[d] = { program: targetProgName, day: d, slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
                });

                inputs.forEach(ip => {
                    const day = ip.dataset.day;
                    const slot = ip.dataset.slot;
                    gridData[day][slot] = ip.value.trim();
                });

                try {
                    let errors = 0;
                    for (const row of Object.values(gridData)) {
                        const response = await fetch('/api/timetables/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(row)
                        });
                        const resJSON = await response.json();
                        if (!resJSON.success) errors++;
                    }

                    if (errors === 0) {
                        alert(`Weekly timetable for ${selectedSemester} (${selectedDivision}) saved successfully!`);
                    } else {
                        alert("Encountered errors while saving some slots.");
                    }
                } catch (e) {
                    alert("Failed to save timetable due to API error.");
                }
            });
        }

        // Render Subjects Tab
        function showSubjectsTab() {
            let rowHTML = subjects.map(s => `
                <tr>
                    <td><strong>${s.code}</strong></td>
                    <td>${s.name}</td>
                    <td>${s.year}</td>
                    <td>${s.semester}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" id="del-sub-${s.id}" style="padding: 4px 8px; font-size: 11px;">Delete</button>
                    </td>
                </tr>
            `).join("");

            document.getElementById("program-tab-content").innerHTML = `
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px;">
                    <h4 style="margin: 0;">Academic Subjects Curriculum</h4>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <input type="text" id="subject-search" class="form-control" placeholder="Search subject code or name..." style="width: 250px; font-size: 12px; height: 28px; padding: 4px 8px; margin: 0;">
                        <button class="btn btn-primary btn-sm" id="add-program-subject-btn"><i class="fa-solid fa-plus mr-4"></i> Add Subject</button>
                    </div>
                </div>
                <div class="table-responsive" style="max-height: 380px; overflow-y: auto;">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Subject Code</th>
                                <th>Subject Name</th>
                                <th>Academic Year</th>
                                <th>Semester</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowHTML.length > 0 ? rowHTML : `<tr><td colspan="5" style="color: var(--text-muted); padding: 16px; text-align: center;">No subjects configured yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;

            const subSearch = document.getElementById("subject-search");
            if (subSearch) {
                subSearch.addEventListener("input", (e) => {
                    const q = e.target.value.toLowerCase().trim();
                    const tbody = document.querySelector("#program-tab-content tbody");
                    if (!tbody) return;
                    const rows = tbody.querySelectorAll("tr");
                    rows.forEach(tr => {
                        const text = tr.innerText.toLowerCase();
                        if (!q || text.includes(q)) {
                            tr.style.display = "";
                        } else {
                            tr.style.display = "none";
                        }
                    });
                });
            }

            // Add delete bindings
            subjects.forEach(s => {
                const dBtn = document.getElementById(`del-sub-${s.id}`);
                if (dBtn) {
                    dBtn.addEventListener("click", async () => {
                        if (!confirm(`Are you sure you want to delete ${s.name}?`)) return;
                        try {
                            const res = await fetch('/api/subjects/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id })
                            });
                            const delData = await res.json();
                            if (delData.success) {
                                alert(delData.message);
                                window.renderProgramManagement(programName);
                            }
                        } catch (e) {
                            alert("Failed to delete subject.");
                        }
                    });
                }
            });

            document.getElementById("add-program-subject-btn").addEventListener("click", () => {
                generalModalTitle.textContent = `Add Subject to ${programName}`;
                generalModalBody.innerHTML = `
                    <form id="add-prog-subject-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label>Subject Name</label>
                            <input type="text" id="aps-name" class="form-control" placeholder="Advanced Cost Accounting" required>
                        </div>
                        <div class="form-group">
                            <label>Subject Code</label>
                            <input type="text" id="aps-code" class="form-control" placeholder="BC-105" required>
                        </div>
                        <div class="form-grid">
                            <div>
                                <label>Year</label>
                                <select id="aps-year" class="form-control">
                                    <option value="1st Year">1st Year</option>
                                    <option value="2nd Year">2nd Year</option>
                                    <option value="3rd Year">3rd Year</option>
                                </select>
                            </div>
                            <div>
                                <label>Semester</label>
                                <select id="aps-semester" class="form-control">
                                    <option value="Semester 1">Semester 1</option>
                                    <option value="Semester 2">Semester 2</option>
                                    <option value="Semester 3">Semester 3</option>
                                    <option value="Semester 4">Semester 4</option>
                                    <option value="Semester 5">Semester 5</option>
                                    <option value="Semester 6">Semester 6</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                            <i class="fa-solid fa-save mr-8"></i> Add Curriculum Subject
                        </button>
                    </form>
                `;
                generalModal.classList.add("active");

                document.getElementById("add-prog-subject-form").addEventListener("submit", async (ev) => {
                    ev.preventDefault();
                    const name = document.getElementById("aps-name").value.trim();
                    const code = document.getElementById("aps-code").value.trim();
                    const year = document.getElementById("aps-year").value;
                    const semester = document.getElementById("aps-semester").value;

                    try {
                        const response = await fetch('/api/subjects/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, code, program: programName, year, semester })
                        });
                        const resData = await response.json();
                        if (resData.success) {
                            alert(resData.message);
                            generalModal.classList.remove("active");
                            window.renderProgramManagement(programName);
                        } else {
                            alert(resData.error);
                        }
                    } catch (e) {
                        alert("Error adding subject.");
                    }
                });
            });
        }

        // Render Notices Tab
        function showNoticesTab() {
            let rowHTML = notices.map(n => `
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; margin-bottom: 12px; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                        <div>
                            <strong style="color: var(--text-main); font-size: 14px;">${n.title}</strong>
                            <span style="font-size: 10px; color: var(--text-muted); margin-left: 8px;">(${new Date(n.created_at).toLocaleString()})</span>
                        </div>
                        <button class="btn btn-danger btn-sm" id="del-notice-${n.id}" style="padding: 2px 6px; font-size: 10px; height: 22px;">Delete</button>
                    </div>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0; line-height: 1.4;">${n.content}</p>
                </div>
            `).join("");

            document.getElementById("program-tab-content").innerHTML = `
                <div class="card-header-flex mb-16">
                    <h4 style="margin: 0;">Published Notices & Circulars</h4>
                    <button class="btn btn-primary btn-sm" id="add-program-notice-btn"><i class="fa-solid fa-plus mr-4"></i> Post Notice</button>
                </div>
                <div style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
                    ${rowHTML.length > 0 ? rowHTML : `<p style="color: var(--text-muted); padding: 16px; text-align: center;">No notices published yet.</p>`}
                </div>
            `;

            // Delete notices
            notices.forEach(n => {
                const dBtn = document.getElementById(`del-notice-${n.id}`);
                if (dBtn) {
                    dBtn.addEventListener("click", async () => {
                        if (!confirm("Are you sure you want to delete this announcement?")) return;
                        try {
                            const res = await fetch('/api/notices/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: n.id })
                            });
                            const delData = await res.json();
                            if (delData.success) {
                                alert(delData.message);
                                window.renderProgramManagement(programName);
                            }
                        } catch (e) {
                            alert("Failed to delete notice.");
                        }
                    });
                }
            });

            document.getElementById("add-program-notice-btn").addEventListener("click", () => {
                generalModalTitle.textContent = `Post Notice for ${programName}`;
                generalModalBody.innerHTML = `
                    <form id="add-prog-notice-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label>Notice Title</label>
                            <input type="text" id="apn-title" class="form-control" placeholder="Mid-Semester Timetable Update" required>
                        </div>
                        <div class="form-group">
                            <label>Notice Content</label>
                            <textarea id="apn-content" class="form-control" rows="5" placeholder="Write notice details here..." required style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-color); color: var(--text-main); font-family: inherit; font-size: 13px; padding: 8px; border-radius: 6px;"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Broadcast Scope</label>
                            <select id="apn-scope" class="form-control">
                                <option value="${programName}">${programName} Students</option>
                                <option value="All">All College Students</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
                            <i class="fa-solid fa-bullhorn mr-8"></i> Publish Announcement
                        </button>
                    </form>
                `;
                generalModal.classList.add("active");

                document.getElementById("add-prog-notice-form").addEventListener("submit", async (ev) => {
                    ev.preventDefault();
                    const title = document.getElementById("apn-title").value.trim();
                    const content = document.getElementById("apn-content").value.trim();
                    const scope = document.getElementById("apn-scope").value;

                    try {
                        const response = await fetch('/api/notices/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, content, program: scope })
                        });
                        const resData = await response.json();
                        if (resData.success) {
                            alert(resData.message);
                            generalModal.classList.remove("active");
                            window.renderProgramManagement(programName);
                        } else {
                            alert(resData.error);
                        }
                    } catch (e) {
                        alert("Error posting notice.");
                    }
                });
            });
        }

        // Tab selection events
        const tBtn = document.getElementById("btn-tab-teachers");
        const ttBtn = document.getElementById("btn-tab-timetable");
        const subBtn = document.getElementById("btn-tab-subjects");
        const nBtn = document.getElementById("btn-tab-notices");

        const clearTabs = () => {
            [tBtn, ttBtn, subBtn, nBtn].forEach(b => b.classList.remove("active"));
        };

        tBtn.addEventListener("click", () => { clearTabs(); tBtn.classList.add("active"); showTeachersTab(); });
        ttBtn.addEventListener("click", () => { clearTabs(); ttBtn.classList.add("active"); showTimetableTab(); });
        subBtn.addEventListener("click", () => { clearTabs(); subBtn.classList.add("active"); showSubjectsTab(); });
        nBtn.addEventListener("click", () => { clearTabs(); nBtn.classList.add("active"); showNoticesTab(); });

        // Default open Teachers tab
        showTeachersTab();

    } catch (e) {
        console.error(e);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load program details.</p></div>`;
    }
};

// Admin Program Management Routing Wrappers
window.renderAdminBcom = function() {
    window.renderProgramManagement("B.Com (Regular)");
};

window.renderAdminBcompro = function() {
    window.renderProgramManagement("B.Com (Professional)");
};

window.renderAdminMcom = function() {
    window.renderProgramManagement("M.Com");
};

// PostgreSQL terminal commands
window.renderAdminDatabase = function() {
    dynamicContentArea.innerHTML = `
        <div class="glass-card mb-16" style="background: rgba(15,23,42,0.9); border: 1.5px solid var(--accent); padding: 24px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <span style="font-size: 24px; color: var(--accent);"><i class="fa-solid fa-terminal"></i></span>
                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #10b981;">Database Query CLI Terminal</h3>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
                Direct client interface to college SQL schema. Supports <code>SELECT</code>, <code>UPDATE</code>, and <code>DELETE</code> statements.
            </p>
            <div id="postgres-history" style="background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #10b981; margin-bottom: 12px; white-space: pre-wrap;">sqlite3=# -- Connected to SQLite database.db
sqlite3=# SELECT id, name, role, program FROM users LIMIT 3;
id | name | role | program
1 | Admin Principal | admin | B.Com (Regular)
2 | Prof. Sarah Jenkins | teacher | B.Com (Regular)
3 | AADITYA HIMMATLAL BALDANIYA | student | B.Com (Regular)
(3 rows)</div>
            <form id="postgres-query-form" style="display: flex; gap: 8px;">
                <span style="font-family: monospace; font-size: 13px; color: #10b981; align-self: center;">sqlite3=#</span>
                <input type="text" id="postgres-query-input" class="form-control" placeholder="SELECT * FROM users WHERE division = 'A' LIMIT 5;" style="background: #020617; color: #10b981; font-family: monospace; border: 1px solid #334155; padding-left: 12px; flex-grow: 1;" autocomplete="off" required>
                <button type="submit" class="btn btn-primary" style="background: #10b981; border-color: #10b981; color: #020617; font-weight: bold; width: 100px;">Execute</button>
            </form>
        </div>
        <div class="glass-card">
            <h4 class="mb-12">Database Schema Guidelines</h4>
            <ul style="color: var(--text-muted); font-size: 12px; line-height: 1.6; padding-left: 20px;">
                <li>Main tables: <code>users</code>, <code>attendance_sessions</code>, <code>attendance_records</code>, <code>settings</code>, <code>subjects</code>, <code>timetables</code>, <code>notices</code>, <code>daily_lectures</code>.</li>
                <li>Make sure to use correct columns names when running manual queries.</li>
            </ul>
        </div>
    `;

    const pgForm = document.getElementById("postgres-query-form");
    const pgInput = document.getElementById("postgres-query-input");
    const pgHistory = document.getElementById("postgres-history");

    if (pgForm) {
        pgForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const query = pgInput.value.trim();
            if (!query) return;

            pgInput.value = "";
            pgHistory.textContent += `\nsqlite3=# ${query}`;
            pgHistory.scrollTop = pgHistory.scrollHeight;

            try {
                const res = await fetch('/api/sql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });
                const data = await res.json();
                pgHistory.textContent += `\n${data.result || 'No output'}`;
                pgHistory.scrollTop = pgHistory.scrollHeight;
            } catch (err) {
                pgHistory.textContent += `\nERROR: Failed to connect to server.`;
                pgHistory.scrollTop = pgHistory.scrollHeight;
            }
        });
    }
};

window.renderUnifiedAttendanceReport = async function(isTeacherOnly) {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const res = await fetch('/api/attendance/analytics');
        const data = await res.json();
        
        if (!data.success) {
            dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load analytics: ${data.message || 'Unknown error'}</p></div>`;
            return;
        }

        dynamicContentArea.innerHTML = `
            <div class="card-header-flex mb-24">
                <div>
                    <h2 style="margin: 0; font-size: 24px; color: #ffffff;">Attendance Data Sheet</h2>
                    <p style="color: var(--text-muted); font-size: 13px; margin: 4px 0 0 0;">Complete student attendance record and summary</p>
                </div>
            </div>

            <!-- Filters -->
            <div class="glass-card mb-24" style="padding: 16px;">
                <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) 120px 120px 100px; align-items: flex-end; gap: 12px;">
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Class</label>
                        <select id="sheet-class" class="form-control"></select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Division</label>
                        <select id="sheet-division" class="form-control"></select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Subject</label>
                        <select id="sheet-subject" class="form-control"></select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Start Date</label>
                        <input type="date" id="sheet-start-date" class="form-control">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">End Date</label>
                        <input type="date" id="sheet-end-date" class="form-control">
                    </div>
                    <div>
                        <button class="btn btn-primary" id="sheet-search-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <i class="fa-solid fa-magnifying-glass"></i> Search
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-secondary" id="sheet-export-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.2); color: #10b981;">
                            <i class="fa-solid fa-file-excel"></i> Export Excel
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-secondary" id="sheet-print-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <i class="fa-solid fa-print"></i> Print
                        </button>
                    </div>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid mb-24" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
                <div class="stat-card" style="padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(59,130,246,0.1); color: #3b82f6; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-users"></i>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: block;">Total Students</span>
                            <h3 id="stat-students" style="margin: 2px 0 0 0; font-size: 22px; color: #ffffff;">0</h3>
                            <span style="font-size: 10px; color: var(--text-muted);">Active Students</span>
                        </div>
                    </div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(16,185,129,0.1); color: #10b981; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-calendar-days"></i>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: block;">Total Lectures</span>
                            <h3 id="stat-lectures" style="margin: 2px 0 0 0; font-size: 22px; color: #ffffff;">0</h3>
                            <span style="font-size: 10px; color: var(--text-muted);">This Year</span>
                        </div>
                    </div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(245,158,11,0.1); color: #f59e0b; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: block;">Total Present</span>
                            <h3 id="stat-present" style="margin: 2px 0 0 0; font-size: 22px; color: #ffffff;">0</h3>
                            <span style="font-size: 10px; color: var(--text-muted);">This Year</span>
                        </div>
                    </div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(239,68,68,0.1); color: #ef4444; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-circle-xmark"></i>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: block;">Total Absent</span>
                            <h3 id="stat-absent" style="margin: 2px 0 0 0; font-size: 22px; color: #ffffff;">0</h3>
                            <span style="font-size: 10px; color: var(--text-muted);">This Year</span>
                        </div>
                    </div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(139,92,246,0.1); color: #8b5cf6; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-chart-pie"></i>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: block;">Overall Attendance</span>
                            <h3 id="stat-overall" style="margin: 2px 0 0 0; font-size: 22px; color: #ffffff;">0%</h3>
                            <span style="font-size: 10px; color: var(--text-muted);">This Year</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Records Split Grid -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;" class="mb-24 content-split-section">
                <!-- Record Table -->
                <div class="glass-card" style="padding: 20px; display: flex; flex-direction: column;">
                    <h3 class="card-title mb-16" style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 8px;">
                        <span><i class="fa-solid fa-table-list mr-8"></i> Student Attendance Record</span>
                        <input type="text" id="sheet-student-search" class="form-control" placeholder="Search student name or roll..." style="width: 220px; font-size: 12px; height: 28px; padding: 4px 8px; margin: 0;">
                    </h3>
                    <div class="table-responsive" style="max-height: 440px; overflow-y: auto; flex-grow: 1;">
                        <table class="custom-table text-center" style="font-size: 13px;">
                            <thead>
                                <tr>
                                    <th>Roll No.</th>
                                    <th>Student Name</th>
                                    <th>Total Lectures</th>
                                    <th>Present</th>
                                    <th>Absent</th>
                                    <th>Attendance %</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="sheet-tbody"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Annual Summary Card -->
                <div class="glass-card" style="padding: 20px; display: flex; flex-direction: column;" id="sheet-summary-card">
                    <h3 class="card-title mb-16"><i class="fa-solid fa-address-card mr-8"></i> Student Annual Summary</h3>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;" id="student-summary-content">
                        <p style="color: var(--text-muted); text-align: center; margin-top: 50px;">Select a student from the record table to view their summary details.</p>
                    </div>
                </div>
            </div>

            <!-- Bottom Charts -->
            <div style="display: grid; grid-template-columns: 2fr 1.2fr; gap: 24px;" class="mb-24 charts-split-section">
                <div class="glass-card" style="padding: 20px;">
                    <h3 class="card-title mb-16"><i class="fa-solid fa-chart-column mr-8"></i> Monthly Attendance Overview (All Students)</h3>
                    <div style="height: 220px; display: flex; align-items: flex-end; justify-content: space-between; padding: 10px 20px;" id="bar-chart-container"></div>
                </div>
                <div class="glass-card" style="padding: 20px;">
                    <h3 class="card-title mb-16"><i class="fa-solid fa-chart-pie mr-8"></i> Attendance Distribution (This Year)</h3>
                    <div style="display: flex; gap: 16px; align-items: center; height: 220px;" id="donut-chart-container"></div>
                </div>
            </div>

            <!-- Footer -->
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 8px;">
                <span>Note: Attendance is calculated automatically. No manual calculation required.</span>
                <span id="sheet-last-updated">Last Updated: ${new Date().toLocaleString()}</span>
            </div>
        `;

        // Populate dropdown options
        const classSelect = document.getElementById("sheet-class");
        const divSelect = document.getElementById("sheet-division");
        const subjSelect = document.getElementById("sheet-subject");

        classSelect.innerHTML = data.classes.map(c => `<option value="${c}">${c}</option>`).join('');
        divSelect.innerHTML = data.divisions.map(d => `<option value="${d}">Division ${d}</option>`).join('');
        subjSelect.innerHTML = data.subjects.map(s => `<option value="${s}">${s}</option>`).join('');

        // Populate default values for Start Date and End Date
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const formatDate = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };
        document.getElementById("sheet-start-date").value = formatDate(startOfMonth);
        document.getElementById("sheet-end-date").value = formatDate(today);

        // Apply style rules for active row highlighting
        const style = document.createElement('style');
        style.id = 'attendance-sheet-highlight-styles';
        style.innerHTML = `
            .active-row-highlight {
                background: rgba(99, 102, 241, 0.15) !important;
                border-left: 3px solid var(--primary) !important;
            }
            @media print {
                aside, header, .sidebar-brand, #app-sidebar, .card-header-flex, .glass-card:has(#sheet-class), #sheet-print-btn, #sheet-export-btn, #sheet-search-btn {
                    display: none !important;
                }
                body {
                    background: white !important;
                    color: black !important;
                }
                .glass-card {
                    background: none !important;
                    border: none !important;
                    box-shadow: none !important;
                }
            }
        `;
        // Clean existing styles if loaded before
        const prevStyle = document.getElementById('attendance-sheet-highlight-styles');
        if (prevStyle) prevStyle.remove();
        document.head.appendChild(style);

        // Core update rendering logic
        let currentStudents = [];
        
        async function updateSheetData() {
            const cls = classSelect.value;
            const div = divSelect.value;
            const sub = subjSelect.value;
            const startDate = document.getElementById("sheet-start-date").value;
            const endDate = document.getElementById("sheet-end-date").value;

            // Show mini spinners on stat numbers
            document.getElementById("stat-students").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 14px;"></i>`;
            document.getElementById("stat-lectures").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 14px;"></i>`;
            document.getElementById("stat-present").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 14px;"></i>`;
            document.getElementById("stat-absent").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 14px;"></i>`;
            document.getElementById("stat-overall").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 14px;"></i>`;

            const queryRes = await fetch(`/api/attendance/analytics?class_name=${encodeURIComponent(cls)}&division=${encodeURIComponent(div)}&subject=${encodeURIComponent(sub)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`);
            const resData = await queryRes.json();

            if (!resData.success) {
                alert("Failed to fetch analytical data.");
                return;
            }

            currentStudents = resData.students || [];

            // Populate Stats Cards
            document.getElementById("stat-students").textContent = resData.metrics.totalStudents;
            document.getElementById("stat-lectures").textContent = resData.metrics.totalLectures;
            document.getElementById("stat-present").textContent = resData.metrics.totalPresent;
            document.getElementById("stat-absent").textContent = resData.metrics.totalAbsent;
            document.getElementById("stat-overall").textContent = resData.metrics.overallAttendance.toFixed(1) + '%';

            // Populate Table
            const tbody = document.getElementById("sheet-tbody");
            if (currentStudents.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="color: var(--text-muted); padding: 24px;">No students found for class ${cls} Division ${div}.</td></tr>`;
                document.getElementById("student-summary-content").innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 50px;">No student records found.</p>`;
            } else {
                tbody.innerHTML = currentStudents.map(s => {
                    let pillColor = "rgba(239, 68, 68, 0.1)";
                    let pillText = "red";
                    let textColor = "#ef4444";
                    if (s.status === 'Excellent') {
                        pillColor = "rgba(16, 185, 129, 0.15)";
                        textColor = "#10b981";
                    } else if (s.status === 'Good') {
                        pillColor = "rgba(59, 130, 246, 0.15)";
                        textColor = "#3b82f6";
                    } else if (s.status === 'Average') {
                        pillColor = "rgba(245, 158, 11, 0.15)";
                        textColor = "#f59e0b";
                    }

                    return `
                        <tr data-roll="${s.rollNo}" style="cursor: pointer;">
                            <td><strong>${s.rollNo}</strong></td>
                            <td style="text-align: left;">${s.name}</td>
                            <td>${s.totalLectures}</td>
                            <td style="color: #10b981; font-weight: 600;">${s.present}</td>
                            <td style="color: #ef4444; font-weight: 600;">${s.absent}</td>
                            <td style="font-weight: 600;">${s.percentage.toFixed(1)}%</td>
                            <td>
                                <span style="background: ${pillColor}; color: ${textColor}; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                    ${s.status}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('');

                // Click event hooks for rows
                tbody.querySelectorAll('tr').forEach(tr => {
                    tr.addEventListener('click', () => {
                        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row-highlight'));
                        tr.classList.add('active-row-highlight');
                        const roll = tr.dataset.roll;
                        const targetStudent = currentStudents.find(s => s.rollNo === roll);
                        if (targetStudent) {
                            renderStudentSummary(targetStudent, cls, div);
                        }
                    });
                });

                // Auto-select first student on loading
                if (currentStudents.length > 0) {
                    tbody.querySelector('tr').click();
                }
            }

            // Render Bar Chart
            renderMonthlyBarChart(resData.monthlyOverview);

            // Render Donut Chart
            renderDonutChart(resData.distribution, resData.metrics.totalStudents);
        }

        function renderStudentSummary(student, cls, div) {
            const summaryDiv = document.getElementById("student-summary-content");
            
            let statusPillColor = "#ef4444";
            if (student.status === 'Excellent') statusPillColor = "#10b981";
            else if (student.status === 'Good') statusPillColor = "#3b82f6";
            else if (student.status === 'Average') statusPillColor = "#f59e0b";

            summaryDiv.innerHTML = `
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: var(--accent); text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Selected Student Profile</div>
                    <h4 style="margin: 4px 0 0 0; font-size: 18px; color: #ffffff;">${student.name}</h4>
                    <span style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px;">Gender: ${student.gender}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Roll No.:</span><strong>${student.rollNo}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Class:</span><strong>${cls} - Division ${div}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Total Lectures:</span><strong>${student.totalLectures}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted); color: #10b981;">Total Present:</span><strong style="color: #10b981;">${student.present}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted); color: #ef4444;">Total Absent:</span><strong style="color: #ef4444;">${student.absent}</strong></div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; text-align: center;">
                    <span style="font-size: 11px; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Attendance Percentage</span>
                    <h2 style="font-size: 32px; margin: 0; color: #ffffff;">${student.percentage.toFixed(1)}%</h2>
                    <span style="background: ${statusPillColor}; color: white; display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 8px;">
                        ${student.status}
                    </span>
                </div>
            `;
        }

        function renderMonthlyBarChart(monthlyOverview) {
            const chartDiv = document.getElementById("bar-chart-container");
            chartDiv.innerHTML = monthlyOverview.map(item => `
                <div style="display: flex; flex-direction: column; align-items: center; flex-grow: 1; height: 100%;">
                    <div style="flex-grow: 1; display: flex; align-items: flex-end; width: 20px; background: rgba(255,255,255,0.02); border-radius: 4px; overflow: hidden; position: relative;">
                        <div style="height: ${item.percentage}%; width: 100%; background: linear-gradient(180deg, var(--primary) 0%, rgba(99,102,241,0.4) 100%); border-radius: 4px; transition: height 0.5s; cursor: pointer;" title="Average: ${item.percentage}%"></div>
                    </div>
                    <span style="font-size: 10px; margin-top: 8px; color: var(--text-muted);">${item.month}</span>
                </div>
            `).join('');
        }

        function renderDonutChart(dist, total) {
            const container = document.getElementById("donut-chart-container");
            
            const exc = total > 0 ? parseFloat(((dist.excellent / total) * 100).toFixed(0)) : 0;
            const good = total > 0 ? parseFloat(((dist.good / total) * 100).toFixed(0)) : 0;
            const avg = total > 0 ? parseFloat(((dist.average / total) * 100).toFixed(0)) : 0;
            const needs = total > 0 ? parseFloat(((dist.needsImprove / total) * 100).toFixed(0)) : 0;

            container.innerHTML = `
                <div style="flex-shrink: 0; width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(#10b981 0% ${exc}%, #3b82f6 ${exc}% ${exc+good}%, #f59e0b ${exc+good}% ${exc+good+avg}%, #ef4444 ${exc+good+avg}% 100%); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="width: 86px; height: 86px; border-radius: 50%; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <span style="font-size: 20px; font-weight: 700; color: #ffffff;">${total}</span>
                        <span style="font-size: 10px; color: var(--text-muted);">Students</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11px; flex-grow: 1; min-width: 140px;">
                    <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;"></span> Excellent (90%+): ${dist.excellent} (${exc}%)</div>
                    <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; display: inline-block;"></span> Good (75-89%): ${dist.good} (${good}%)</div>
                    <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span> Average (60-74%): ${dist.average} (${avg}%)</div>
                    <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"></span> Needs Improve (<60%): ${dist.needsImprove} (${needs}%)</div>
                </div>
            `;
        }

        // Search Button Click handler
        document.getElementById("sheet-search-btn").addEventListener("click", updateSheetData);

        const sheetSearchInput = document.getElementById("sheet-student-search");
        if (sheetSearchInput) {
            sheetSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById("sheet-tbody");
                if (!tbody) return;
                const rows = tbody.querySelectorAll("tr");
                rows.forEach(tr => {
                    const text = tr.innerText.toLowerCase();
                    if (!q || text.includes(q)) {
                        tr.style.display = "";
                    } else {
                        tr.style.display = "none";
                    }
                });
            });
        }

        // Print Button handler
        document.getElementById("sheet-print-btn").addEventListener("click", () => {
            window.print();
        });

        // Export Button handler
        document.getElementById("sheet-export-btn").addEventListener("click", () => {
            if (currentStudents.length === 0) {
                alert("No records to export.");
                return;
            }

            const headers = [
                "Roll Number", "Student Name", "Gender", "Total Lectures", "Present", "Absent", "Attendance %", "Status"
            ];

            const csvRows = currentStudents.map(s => [
                s.rollNo,
                s.name,
                s.gender,
                s.totalLectures,
                s.present,
                s.absent,
                s.percentage + '%',
                s.status
            ]);

            const csvContent = "\uFEFF" + [
                headers.join(','),
                ...csvRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Attendance_Sheet_Export_${classSelect.value.replace(/\s+/g, '_')}_Div_${divSelect.value}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Trigger first analytics load
        await updateSheetData();

    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load attendance sheet view.</p></div>`;
    }
};

window.renderTeacherAttendance_report = function() {
    window.renderUnifiedAttendanceReport(true);
};

window.renderAdminAttendance_report = function() {
    window.renderUnifiedAttendanceReport(false);
};

window.renderTeacherLecture_attendance = function() {
    window.renderLectureWiseAttendanceReport(true);
};

window.renderAdminLecture_attendance = function() {
    window.renderLectureWiseAttendanceReport(false);
};

window.renderLectureWiseAttendanceReport = async function(isTeacherOnly) {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        const filterRes = await fetch('/api/attendance/analytics');
        const filterData = await filterRes.json();
        
        if (!filterData.success) {
            dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load filters.</p></div>`;
            return;
        }

        // Print styles injection
        const style = document.createElement('style');
        style.id = 'lecture-sheet-print-styles';
        style.innerHTML = `
            @media print {
                aside, header, .sidebar-brand, #app-sidebar, .card-header-flex, .glass-card:has(#lecture-sheet-class), #lecture-sheet-print-btn, #lecture-sheet-export-btn, #lecture-sheet-search-btn {
                    display: none !important;
                }
                body {
                    background: white !important;
                    color: black !important;
                }
                .glass-card {
                    background: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                }
            }
        `;
        const prevStyle = document.getElementById('lecture-sheet-print-styles');
        if (prevStyle) prevStyle.remove();
        document.head.appendChild(style);

        dynamicContentArea.innerHTML = `
            <div class="card-header-flex mb-24">
                <div>
                    <h2 style="margin: 0; font-size: 24px; color: #ffffff;">Lecture-wise Attendance Sheet</h2>
                    <p style="color: var(--text-muted); font-size: 13px; margin: 4px 0 0 0;">View or export attendance list for a specific lecture slot</p>
                </div>
            </div>

            <!-- Filters -->
            <div class="glass-card mb-24" style="padding: 16px;">
                <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) 200px 100px 100px; align-items: flex-end; gap: 12px;">
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Class / Semester</label>
                        <select id="lecture-sheet-class" class="form-control"></select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Division</label>
                        <select id="lecture-sheet-division" class="form-control"></select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Select Lecture</label>
                        <select id="lecture-sheet-session" class="form-control"></select>
                    </div>
                    <div>
                        <button class="btn btn-primary" id="lecture-sheet-search-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px;">
                            <i class="fa-solid fa-magnifying-glass"></i> Search
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-secondary" id="lecture-sheet-export-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.2); color: #10b981; height: 38px;">
                            <i class="fa-solid fa-file-csv"></i> Export CSV
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-secondary" id="lecture-sheet-print-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px;">
                            <i class="fa-solid fa-print"></i> Print
                        </button>
                    </div>
                </div>
            </div>

            <!-- Record Table Card -->
            <div class="glass-card" style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-table-list mr-8"></i> Student Attendance Registry</h3>
                    <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-muted);">
                        <span>Total: <strong id="lecture-total-count" style="color: #ffffff;">0</strong></span>
                        <span>Present: <strong id="lecture-present-count" style="color: var(--success);">0</strong></span>
                        <span>Absent: <strong id="lecture-absent-count" style="color: var(--danger);">0</strong></span>
                    </div>
                </div>
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="custom-table text-center" style="font-size: 13px;">
                        <thead>
                            <tr>
                                <th>Roll No.</th>
                                <th>Semester</th>
                                <th>Division</th>
                                <th>Lecture</th>
                                <th>Student Name</th>
                                <th>Attendance Status</th>
                                <th>Date Marked</th>
                            </tr>
                        </thead>
                        <tbody id="lecture-sheet-tbody">
                            <tr>
                                <td colspan="7" style="color: var(--text-muted); padding: 24px;">Please select class, division, and a lecture to load the attendance list.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const classSelect = document.getElementById("lecture-sheet-class");
        const divSelect = document.getElementById("lecture-sheet-division");
        const sessionSelect = document.getElementById("lecture-sheet-session");
        const searchBtn = document.getElementById("lecture-sheet-search-btn");
        const exportBtn = document.getElementById("lecture-sheet-export-btn");
        const printBtn = document.getElementById("lecture-sheet-print-btn");
        const tbody = document.getElementById("lecture-sheet-tbody");

        // Populate baseline dropdowns
        classSelect.innerHTML = filterData.classes.map(c => `<option value="${c}">${c}</option>`).join('');
        divSelect.innerHTML = filterData.divisions.map(d => `<option value="${d}">Division ${d}</option>`).join('');

        // Function to fetch lectures for the selected class/division
        async function loadLectures() {
            sessionSelect.innerHTML = `<option value="">Loading lectures...</option>`;
            sessionSelect.disabled = true;

            const cls = classSelect.value;
            const div = divSelect.value;
            let url = `/api/attendance/sessions?class_name=${encodeURIComponent(cls)}&division=${encodeURIComponent(div)}`;
            if (isTeacherOnly) {
                url += `&creator_id=${currentUser.id}`;
            }

            try {
                const res = await fetch(url);
                const data = await res.json();
                const sessions = data.sessions || [];

                if (sessions.length === 0) {
                    sessionSelect.innerHTML = `<option value="">No lectures found</option>`;
                    sessionSelect.disabled = true;
                } else {
                    sessionSelect.innerHTML = sessions.map(s => {
                        const dateStr = new Date(s.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        return `<option value="${s.code}" data-slot="${s.lecture_slot}" data-subject="${s.subject}" data-date="${dateStr}">${dateStr} - ${s.lecture_slot} (${s.subject})</option>`;
                    }).join('');
                    sessionSelect.disabled = false;
                }
            } catch (e) {
                sessionSelect.innerHTML = `<option value="">Error loading lectures</option>`;
                sessionSelect.disabled = true;
            }
        }

        // Trigger dynamic lecture reloading when filters change
        classSelect.addEventListener("change", loadLectures);
        divSelect.addEventListener("change", loadLectures);

        // Load initially
        await loadLectures();

        let lastSearchResults = [];

        // Search trigger
        searchBtn.addEventListener("click", async () => {
            const code = sessionSelect.value;
            if (!code) {
                alert("Please select a lecture to search.");
                return;
            }

            tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 20px; color: var(--primary);"></i> Loading student roster...</td></tr>`;

            const cls = classSelect.value;
            const div = divSelect.value;

            const selectedOption = sessionSelect.options[sessionSelect.selectedIndex];
            const slot = selectedOption.getAttribute('data-slot');
            const subject = selectedOption.getAttribute('data-subject');
            const lectureLabel = `${slot} (${subject})`;

            try {
                // 1. Fetch enrolled students
                const studentsRes = await fetch(`/api/students/list?class_name=${encodeURIComponent(cls)}&division=${encodeURIComponent(div)}`);
                const studentsData = await studentsRes.json();
                const studentsList = studentsData.students || [];

                // 2. Fetch session attendance records
                const recordsRes = await fetch(`/api/attendance/session/${code}/records`);
                const recordsData = await recordsRes.json();
                const markedRecords = recordsData.records || [];

                // Build mapping by student ID / Roll number
                const markedMap = {};
                markedRecords.forEach(r => {
                    markedMap[r.roll_no] = r;
                });

                let presentCount = 0;
                let absentCount = 0;
                const rowsData = [];

                studentsList.forEach(s => {
                    const record = markedMap[s.username];
                    const isPresent = !!record && record.status === 'present';
                    if (isPresent) presentCount++;
                    else absentCount++;

                    rowsData.push({
                        roll_no: s.roll_no,
                        semester: cls,
                        division: div,
                        lecture: lectureLabel,
                        name: s.name,
                        status: isPresent ? 'Present' : 'Absent',
                        date: isPresent ? (parseUTCDate(record.marked_at) ? parseUTCDate(record.marked_at).toLocaleDateString('en-GB') : '-') : '-'
                    });
                });

                lastSearchResults = rowsData;

                document.getElementById("lecture-total-count").textContent = studentsList.length;
                document.getElementById("lecture-present-count").textContent = presentCount;
                document.getElementById("lecture-absent-count").textContent = absentCount;

                if (rowsData.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--text-muted); padding: 24px;">No students registered for this class.</td></tr>`;
                } else {
                    tbody.innerHTML = rowsData.map(r => `
                        <tr>
                            <td><strong>${r.roll_no}</strong></td>
                            <td>${r.semester}</td>
                            <td>Division ${r.division}</td>
                            <td>${r.lecture}</td>
                            <td class="text-left">${r.name}</td>
                            <td>
                                <span class="attendance-status-pill" style="
                                    background: ${r.status === 'Present' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};
                                    color: ${r.status === 'Present' ? 'var(--success)' : 'var(--danger)'};
                                    border: 1px solid ${r.status === 'Present' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'};
                                ">
                                    ${r.status}
                                </span>
                            </td>
                            <td>${r.date}</td>
                        </tr>
                    `).join('');
                }

            } catch (err) {
                console.error("Error generating lecture report:", err);
                tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger); padding: 24px;">Error loading attendance sheet data.</td></tr>`;
            }
        });

        // Export CSV trigger
        exportBtn.addEventListener("click", () => {
            if (lastSearchResults.length === 0) {
                alert("Please run a search first to export data.");
                return;
            }

            const headers = ['Roll No', 'Semester', 'Division', 'Lecture', 'Student Name', 'Attendance Status', 'Date Marked'];
            const csvRows = [headers.join(',')];

            lastSearchResults.forEach(r => {
                const values = [
                    r.roll_no,
                    `"${r.semester}"`,
                    `"Division ${r.division}"`,
                    `"${r.lecture.replace(/"/g, '""')}"`,
                    `"${r.name.replace(/"/g, '""')}"`,
                    r.status,
                    r.date
                ];
                csvRows.push(values.join(','));
            });

            const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            
            const cls = classSelect.value.replace(/\s+/g, '_');
            const div = divSelect.value;
            const code = sessionSelect.value;
            link.setAttribute("download", `lecture_attendance_${cls}_Div_${div}_${code}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Print trigger
        printBtn.addEventListener("click", () => {
            window.print();
        });

    } catch (e) {
        console.error(e);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load lecture-wise sheet.</p></div>`;
    }
};


// =========================================================================
// STUDENT COURSEWORK PORTAL MODULES
// =========================================================================

window.renderStudentSyllabus = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    try {
        const res = await fetch(`/api/courses?program=${encodeURIComponent(currentUser.program)}`);
        const data = await res.json();
        const courses = data.courses || [];

        let coursesHTML = courses.map(c => `
            <div class="glass-card mb-16" style="border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 12px;">
                    <div>
                        <span style="font-size: 11px; text-transform: uppercase; color: var(--accent); letter-spacing: 1px;">Course Code: ${c.code}</span>
                        <h4 style="margin: 4px 0 0 0; font-size: 18px; color: #ffffff;">${c.name}</h4>
                    </div>
                    <span class="attendance-status-pill status-active" style="font-size: 11px;">Active Course</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
                    <strong>Course Syllabus / Topics covered:</strong><br>
                    <p style="margin-top: 8px; white-space: pre-line; background: rgba(255,255,255,0.01); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">${c.syllabus || 'No syllabus uploaded yet.'}</p>
                </div>
            </div>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-8"><i class="fa-solid fa-book-open mr-8"></i> Academic Syllabus</h3>
                <p style="color: var(--text-muted); font-size: 13px;">View course structures and syllabus topics for ${currentUser.program}.</p>
            </div>
            ${coursesHTML.length > 0 ? coursesHTML : `<div class="glass-card text-center"><p style="color: var(--text-muted);">No syllabus records found for this program.</p></div>`}
        `;
    } catch (e) {
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load syllabus.</p></div>`;
    }
};

window.renderStudentAssignments = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    try {
        const cleanClass = currentUser.class.split(' - ')[0]; // B.Com. Sem-V
        const res = await fetch(`/api/assignments?program=${encodeURIComponent(currentUser.program)}&class_name=${encodeURIComponent(cleanClass)}`);
        const data = await res.json();
        const list = data.assignments || [];

        let listHTML = list.map(a => `
            <div class="glass-card mb-16" style="border-left: 4px solid var(--warning);">
                <div class="card-header-flex mb-12">
                    <div>
                        <h4 style="margin: 0; font-size: 16px; color: #ffffff;">${a.title}</h4>
                        <span style="font-size: 12px; color: var(--text-muted);">${a.subject} | Sem: ${a.class_name}</span>
                    </div>
                    <span style="font-size: 12px; font-weight: 600; color: var(--warning);"><i class="fa-solid fa-calendar-xmark mr-4"></i> Due Date: ${a.due_date}</span>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">${a.description || 'No instructions provided.'}</p>
                ${a.file_path ? `
                    <a href="${a.file_path}" download class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; max-width: 220px; background: rgba(255,255,255,0.03);">
                        <i class="fa-solid fa-cloud-arrow-down" style="color: var(--accent);"></i> Download File (${a.file_name})
                    </a>
                ` : '<span style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-info-circle mr-4"></i> No attachment file</span>'}
            </div>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-8"><i class="fa-solid fa-pen-to-square mr-8"></i> Coursework Assignments</h3>
                <p style="color: var(--text-muted); font-size: 13px;">Pending homework, sheets, and assignments for your active semester.</p>
            </div>
            ${listHTML.length > 0 ? listHTML : `<div class="glass-card text-center"><p style="color: var(--text-muted);">No assignments posted yet. You are all caught up!</p></div>`}
        `;
    } catch (e) {
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load assignments.</p></div>`;
    }
};

window.renderStudentStudy_materials = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    try {
        const cleanClass = currentUser.class.split(' - ')[0];
        const res = await fetch(`/api/study-materials?program=${encodeURIComponent(currentUser.program)}&class_name=${encodeURIComponent(cleanClass)}`);
        const data = await res.json();
        const list = data.materials || [];

        let listHTML = list.map(m => `
            <div class="glass-card mb-16" style="border-left: 4px solid var(--accent);">
                <div class="card-header-flex mb-12">
                    <div>
                        <h4 style="margin: 0; font-size: 16px; color: #ffffff;">${m.title}</h4>
                        <span style="font-size: 12px; color: var(--text-muted);">${m.subject} | Resource Handout</span>
                    </div>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">${m.description || 'Lecture resources for exam reference.'}</p>
                ${m.file_path ? `
                    <a href="${m.file_path}" download class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; max-width: 220px; background: rgba(255,255,255,0.03);">
                        <i class="fa-solid fa-file-pdf" style="color: var(--danger);"></i> Download Material (${m.file_name})
                    </a>
                ` : '<span style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-circle-exclamation mr-4"></i> No attached material</span>'}
            </div>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-8"><i class="fa-solid fa-book mr-8"></i> Study Material Notes</h3>
                <p style="color: var(--text-muted); font-size: 13px;">Reference lecture notes, slides, and files uploaded by faculty.</p>
            </div>
            ${listHTML.length > 0 ? listHTML : `<div class="glass-card text-center"><p style="color: var(--text-muted);">No study materials uploaded for your class yet.</p></div>`}
        `;
    } catch (e) {
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load study materials.</p></div>`;
    }
};

window.renderStudentStudent_marks = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    try {
        const res = await fetch(`/api/marks/${currentUser.id}`);
        const data = await res.json();
        const marks = data.marks || [];

        let totalObtained = 0;
        let totalMax = 0;
        marks.forEach(m => {
            totalObtained += m.marks_obtained;
            totalMax += m.marks_total;
        });

        const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : null;
        let statusColor = "var(--text-muted)";
        let statusText = "No grades yet";
        if (percentage !== null) {
            const p = parseFloat(percentage);
            if (p >= 75) { statusColor = "var(--success)"; statusText = "First Class with Distinction"; }
            else if (p >= 60) { statusColor = "var(--accent)"; statusText = "First Class"; }
            else if (p >= 40) { statusColor = "var(--warning)"; statusText = "Pass Class"; }
            else { statusColor = "var(--danger)"; statusText = "Fail / Needs Improvement"; }
        }

        let marksHTML = marks.map(m => `
            <tr>
                <td><strong>${m.subject}</strong></td>
                <td>${m.exam_name}</td>
                <td><strong style="color: var(--accent);">${m.marks_obtained}</strong> / ${m.marks_total}</td>
                <td>${((m.marks_obtained / m.marks_total) * 100).toFixed(0)}%</td>
                <td>
                    <span class="attendance-status-pill status-active" style="background: ${(m.marks_obtained / m.marks_total) >= 0.4 ? 'rgba(20,184,166,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${(m.marks_obtained / m.marks_total) >= 0.4 ? 'var(--accent)' : 'var(--danger)'};">
                        ${(m.marks_obtained / m.marks_total) >= 0.4 ? 'PASS' : 'FAIL'}
                    </span>
                </td>
            </tr>
        `).join("");

        dynamicContentArea.innerHTML = `
            <div class="stats-grid mb-24">
                <div class="stat-card" style="grid-column: span 1;">
                    <div class="stat-header">
                        <span class="stat-title">Average Score</span>
                        <div class="stat-icon" style="background: rgba(20,184,166,0.1); color: var(--accent);"><i class="fa-solid fa-graduation-cap"></i></div>
                    </div>
                    <div class="stat-value">${percentage !== null ? percentage + '%' : 'N/A'}</div>
                    <div class="stat-desc" style="color: ${statusColor}; font-weight: 600;">${statusText}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Aggregate Marks</span>
                        <div class="stat-icon" style="background: rgba(99,102,241,0.1); color: var(--primary);"><i class="fa-solid fa-award"></i></div>
                    </div>
                    <div class="stat-value" style="font-size: 26px; line-height: 38px;">${totalObtained} / ${totalMax}</div>
                    <div class="stat-desc">Total scored across internal/external tests</div>
                </div>
            </div>

            <div class="glass-card">
                <h3 class="card-title mb-16"><i class="fa-solid fa-file-invoice mr-8"></i> Semester Marks Registry</h3>
                <div class="table-responsive">
                    <table class="custom-table text-center" style="font-size: 13px;">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Examination Name</th>
                                <th>Marks Scored</th>
                                <th>Percentage</th>
                                <th>Grade Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${marksHTML.length > 0 ? marksHTML : `<tr><td colspan="5" style="color: var(--text-muted); padding: 24px;">No examination marks recorded for your account yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load marks history.</p></div>`;
    }
};

// =========================================================================
// TEACHER & ADMIN COURSEWORK SUITE MANAGER PANEL
// =========================================================================

window.renderTeacherCoursework_manager = function() {
    window.renderUnifiedCourseworkManager();
};

window.renderAdminCoursework_manager = function() {
    window.renderUnifiedCourseworkManager();
};

window.renderUnifiedCourseworkManager = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;
    
    try {
        const coursesRes = await fetch('/api/courses');
        const coursesData = await coursesRes.json();
        const allCourses = coursesData.courses || [];

        const assignRes = await fetch('/api/assignments');
        const assignData = await assignRes.json();
        const allAssignments = assignData.assignments || [];

        const matRes = await fetch('/api/study-materials');
        const matData = await matRes.json();
        const allMaterials = matData.materials || [];

        const usersRes = await fetch('/api/users');
        const usersData = await usersRes.json();
        const allStudents = (usersData.users || []).filter(u => u.role === 'student');

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24" style="padding: 12px 20px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="coursework-tabs-header">
                    <button class="btn btn-primary active-tab" onclick="switchCourseworkTab('syllabus')" id="tab-btn-syllabus" style="flex-grow: 1; max-width: 180px;"><i class="fa-solid fa-book-open mr-4"></i> Syllabus</button>
                    <button class="btn btn-secondary" onclick="switchCourseworkTab('assignments')" id="tab-btn-assignments" style="flex-grow: 1; max-width: 180px;"><i class="fa-solid fa-pen-to-square mr-4"></i> Assignments</button>
                    <button class="btn btn-secondary" onclick="switchCourseworkTab('materials')" id="tab-btn-materials" style="flex-grow: 1; max-width: 180px;"><i class="fa-solid fa-book mr-4"></i> Study Materials</button>
                    <button class="btn btn-secondary" onclick="switchCourseworkTab('marks')" id="tab-btn-marks" style="flex-grow: 1; max-width: 180px;"><i class="fa-solid fa-graduation-cap mr-4"></i> Marks Entry</button>
                </div>
            </div>

            <!-- TAB 1: SYLLABUS -->
            <div id="coursework-tab-syllabus" class="coursework-tab-content">
                <div class="form-grid-2-1">
                    <div class="glass-card">
                        <h4 class="card-title mb-16"><i class="fa-solid fa-list-check mr-8"></i> Add / Edit Subject Course Info</h4>
                        <form id="syllabus-form" style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="form-grid">
                                <div>
                                    <label>Course Code</label>
                                    <input type="text" id="syl-code" class="form-control" placeholder="e.g. BCP-501" required autocomplete="off">
                                </div>
                                <div>
                                    <label>Course Name</label>
                                    <input type="text" id="syl-name" class="form-control" placeholder="e.g. Corporate Accounting" required autocomplete="off">
                                </div>
                                <div>
                                    <label>Academic Program</label>
                                    <select id="syl-program" class="form-control" required>
                                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                                        <option value="B.Com (Professional)" selected>B.Com (Professional)</option>
                                        <option value="M.Com">M.Com</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label>Detailed Syllabus Modules</label>
                                <textarea id="syl-detail" class="form-control" style="height: 140px; font-family: monospace;" placeholder="Module 1: ...&#10;Module 2: ..." required></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary" style="max-width: 200px;"><i class="fa-solid fa-floppy-disk mr-4"></i> Save Course</button>
                        </form>
                    </div>

                    <div class="glass-card">
                        <h4 class="card-title mb-12">Existing Subjects</h4>
                        <div style="max-height: 380px; overflow-y: auto;">
                            <div id="syl-list-container">
                                <!-- Loaded dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 2: ASSIGNMENTS -->
            <div id="coursework-tab-assignments" class="coursework-tab-content" style="display: none;">
                <div class="form-grid-2-1">
                    <div class="glass-card">
                        <h4 class="card-title mb-16"><i class="fa-solid fa-file-circle-plus mr-8"></i> Upload New Homework Assignment</h4>
                        <form id="assignment-form" style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="form-grid">
                                <div>
                                    <label>Program</label>
                                    <select id="asg-program" class="form-control" required>
                                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                                        <option value="B.Com (Professional)" selected>B.Com (Professional)</option>
                                        <option value="M.Com">M.Com</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Semester Class</label>
                                    <select id="asg-class" class="form-control" required>
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                                <div>
                                    <label>Subject</label>
                                    <select id="asg-subject" class="form-control" required>
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                                <div>
                                    <label>Due Date</label>
                                    <input type="date" id="asg-due" class="form-control" required>
                                </div>
                                <div style="grid-column: span 2;">
                                    <label>Assignment Title</label>
                                    <input type="text" id="asg-title" class="form-control" placeholder="e.g. Valuation of Goodwill Assignment Sheet" required autocomplete="off">
                                </div>
                            </div>
                            <div>
                                <label>Work instructions / Notes</label>
                                <textarea id="asg-desc" class="form-control" style="height: 80px;" placeholder="Instructions for students..."></textarea>
                            </div>
                            <div>
                                <label>Attachment Document (Optional)</label>
                                <input type="file" id="asg-file" class="form-control" style="padding: 4px;">
                            </div>
                            <button type="submit" class="btn btn-primary" style="max-width: 240px;"><i class="fa-solid fa-cloud-arrow-up mr-4"></i> Upload & Post Assignment</button>
                        </form>
                    </div>

                    <div class="glass-card">
                        <h4 class="card-title mb-12">Active Assignments</h4>
                        <div style="max-height: 440px; overflow-y: auto;" id="asg-list-container">
                            <!-- Loaded dynamically -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 3: STUDY MATERIALS -->
            <div id="coursework-tab-materials" class="coursework-tab-content" style="display: none;">
                <div class="form-grid-2-1">
                    <div class="glass-card">
                        <h4 class="card-title mb-16"><i class="fa-solid fa-file-zipper mr-8"></i> Upload Study Materials & Notes</h4>
                        <form id="material-form" style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="form-grid">
                                <div>
                                    <label>Program</label>
                                    <select id="mat-program" class="form-control" required>
                                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                                        <option value="B.Com (Professional)" selected>B.Com (Professional)</option>
                                        <option value="M.Com">M.Com</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Semester Class</label>
                                    <select id="mat-class" class="form-control" required>
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                                <div>
                                    <label>Subject</label>
                                    <select id="mat-subject" class="form-control" required>
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                                <div style="grid-column: span 3;">
                                    <label>Material Resource Title</label>
                                    <input type="text" id="mat-title" class="form-control" placeholder="e.g. Amalgamation Lecture Handout" required autocomplete="off">
                                </div>
                            </div>
                            <div>
                                <label>Description / References</label>
                                <textarea id="mat-desc" class="form-control" style="height: 80px;" placeholder="Slides, notes, etc. details..."></textarea>
                            </div>
                            <div>
                                <label>PDF / Slide Document File</label>
                                <input type="file" id="mat-file" class="form-control" style="padding: 4px;" required>
                            </div>
                            <button type="submit" class="btn btn-primary" style="max-width: 240px;"><i class="fa-solid fa-cloud-arrow-up mr-4"></i> Upload & Share Material</button>
                        </form>
                    </div>

                    <div class="glass-card">
                        <h4 class="card-title mb-12">Posted Resources</h4>
                        <div style="max-height: 440px; overflow-y: auto;" id="mat-list-container">
                            <!-- Loaded dynamically -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 4: MARKS ENTRY -->
            <div id="coursework-tab-marks" class="coursework-tab-content" style="display: none;">
                <div class="form-grid-2-1">
                    <div class="glass-card">
                        <h4 class="card-title mb-16"><i class="fa-solid fa-award mr-8"></i> Input Student Marks</h4>
                        <form id="marks-form" style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="form-grid">
                                <div>
                                    <label>Filter Student Program</label>
                                    <select id="mrk-program" class="form-control">
                                        <option value="B.Com (Regular)">B.Com (Regular)</option>
                                        <option value="B.Com (Professional)" selected>B.Com (Professional)</option>
                                        <option value="M.Com">M.Com</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Filter Semester Class</label>
                                    <select id="mrk-class" class="form-control">
                                        <!-- Loaded dynamically -->
                                    </select>
                                </div>
                                <div>
                                    <label>Filter Student Division</label>
                                    <select id="mrk-division" class="form-control">
                                        <option value="A">Division A</option>
                                        <option value="B">Division B</option>
                                        <option value="C">Division C</option>
                                        <option value="D">Division D</option>
                                        <option value="E">Division E</option>
                                        <option value="F">Division F</option>
                                        <option value="G">Division G</option>
                                    </select>
                                </div>
                                <div style="grid-column: span 3;">
                                    <label style="color: var(--accent);">Choose Student Roll Number</label>
                                    <select id="mrk-student-sel" class="form-control" required style="border-color: var(--accent);">
                                        <!-- Loaded dynamically -->
                                    </select>
                                </div>
                                
                                <div>
                                    <label>Subject</label>
                                    <select id="mrk-subject" class="form-control" required>
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                                <div>
                                    <label>Exam / Test Name</label>
                                    <select id="mrk-exam" class="form-control" required>
                                        <option value="Internal Test 1">Internal Test 1</option>
                                        <option value="Internal Test 2">Internal Test 2</option>
                                        <option value="Mid-Semester Exam">Mid-Semester Exam</option>
                                        <option value="Semester End Exam">Semester End Exam</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Marks Scored</label>
                                    <input type="number" id="mrk-obtained" class="form-control" placeholder="e.g. 24" required min="0">
                                </div>
                                <div>
                                    <label>Total Max Marks</label>
                                    <input type="number" id="mrk-total" class="form-control" value="30" required min="1">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" style="max-width: 200px;"><i class="fa-solid fa-floppy-disk mr-4"></i> Save Grade Entry</button>
                        </form>
                    </div>

                    <div class="glass-card">
                        <h4 class="card-title mb-12" id="mrk-log-title">Student Grades Log</h4>
                        <div class="table-responsive" style="max-height: 420px; overflow-y: auto;">
                            <table class="custom-table text-center" style="font-size: 11px;">
                                <thead>
                                    <tr>
                                        <th>Subject</th>
                                        <th>Exam Name</th>
                                        <th>Marks</th>
                                        <th>Percentage</th>
                                    </tr>
                                </thead>
                                <tbody id="mrk-log-tbody">
                                    <tr><td colspan="4" style="color: var(--text-muted); padding: 12px;">Select a student from the filters list to inspect their record.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        window.switchCourseworkTab = function(tabName) {
            document.querySelectorAll(".coursework-tab-content").forEach(el => el.style.display = "none");
            document.getElementById(`coursework-tab-${tabName}`).style.display = "block";

            document.querySelectorAll("#coursework-tabs-header button").forEach(btn => {
                btn.className = "btn btn-secondary";
            });
            document.getElementById(`tab-btn-${tabName}`).className = "btn btn-primary active-tab";
        };

        const sylForm = document.getElementById("syllabus-form");
        const sylCode = document.getElementById("syl-code");
        const sylName = document.getElementById("syl-name");
        const sylProg = document.getElementById("syl-program");
        const sylDetail = document.getElementById("syl-detail");
        const sylContainer = document.getElementById("syl-list-container");

        let currentCourses = [...allCourses];
        function renderCoursesList() {
            if (currentCourses.length === 0) {
                sylContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No subjects recorded.</p>`;
                return;
            }
            sylContainer.innerHTML = currentCourses.map(c => `
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between;">
                        <strong>${c.code}: ${c.name}</strong>
                        <span style="color: var(--accent);">${c.program}</span>
                    </div>
                    <div style="color: var(--text-muted); margin-top: 4px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${c.syllabus.substring(0, 100)}...
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="editCourseInline(${JSON.stringify(c).replace(/"/g, '&quot;')})" style="padding: 2px 6px; font-size: 10px; margin-top: 6px;">Load Info</button>
                </div>
            `).join("");
        }
        renderCoursesList();

        window.editCourseInline = function(c) {
            sylCode.value = c.code;
            sylName.value = c.name;
            sylProg.value = c.program;
            sylDetail.value = c.syllabus;
            sylCode.readOnly = true;
        };

        sylForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const code = sylCode.value.trim();
            const name = sylName.value.trim();
            const program = sylProg.value;
            const syllabus = sylDetail.value.trim();

            try {
                const res = await fetch('/api/courses/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, name, program, syllabus })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    sylForm.reset();
                    sylCode.readOnly = false;
                    const reload = await fetch('/api/courses');
                    const reloadData = await reload.json();
                    currentCourses = reloadData.courses || [];
                    renderCoursesList();
                } else {
                    alert(data.error);
                }
            } catch (err) {
                alert("Failed to save course.");
            }
        });

        const asgForm = document.getElementById("assignment-form");
        const asgProg = document.getElementById("asg-program");
        const asgClass = document.getElementById("asg-class");
        const asgSubj = document.getElementById("asg-subject");
        const asgDue = document.getElementById("asg-due");
        const asgTitle = document.getElementById("asg-title");
        const asgDesc = document.getElementById("asg-desc");
        const asgFile = document.getElementById("asg-file");
        const asgContainer = document.getElementById("asg-list-container");

        let currentAssignments = [...allAssignments];

        function renderAssignmentsList() {
            if (currentAssignments.length === 0) {
                asgContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No assignments posted.</p>`;
                return;
            }
            asgContainer.innerHTML = currentAssignments.map(a => `
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 12px; position: relative;">
                    <strong>${a.title}</strong>
                    <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">
                        Subject: ${a.subject} | Sem: ${a.class_name} | Program: ${a.program}
                    </div>
                    <div style="color: var(--warning); font-size: 11px; margin-top: 2px;">
                        Due Date: ${a.due_date}
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="deleteAssignment(${a.id})" style="padding: 2px 6px; font-size: 10px; position: absolute; right: 10px; top: 10px;">Delete</button>
                </div>
            `).join("");
        }
        renderAssignmentsList();

        window.deleteAssignment = async function(id) {
            if (!confirm("Delete this assignment?")) return;
            try {
                const res = await fetch('/api/assignments/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    const reload = await fetch('/api/assignments');
                    const reloadData = await reload.json();
                    currentAssignments = reloadData.assignments || [];
                    renderAssignmentsList();
                }
            } catch (err) {
                alert("Failed to delete assignment.");
            }
        };

        function setupDropdowns(programSelect, classSelect, subjectSelect) {
            const loadFormClasses = (prog) => {
                if (prog === 'M.Com') {
                    classSelect.innerHTML = `
                        <option value="M.Com. Sem-I">M.Com. Sem-I</option>
                        <option value="M.Com. Sem-II">M.Com. Sem-II</option>
                        <option value="M.Com. Sem-III">M.Com. Sem-III</option>
                        <option value="M.Com. Sem-IV">M.Com. Sem-IV</option>
                    `;
                } else if (prog === 'B.Com (Professional)') {
                    classSelect.innerHTML = `
                        <option value="B.Com. Prof. Sem-I">B.Com. Prof. Sem-I</option>
                        <option value="B.Com. Prof. Sem-II">B.Com. Prof. Sem-II</option>
                        <option value="B.Com. Prof. Sem-III">B.Com. Prof. Sem-III</option>
                        <option value="B.Com. Prof. Sem-IV">B.Com. Prof. Sem-IV</option>
                        <option value="B.Com. Prof. Sem-V">B.Com. Prof. Sem-V</option>
                        <option value="B.Com. Prof. Sem-VI">B.Com. Prof. Sem-VI</option>
                    `;
                } else {
                    classSelect.innerHTML = `
                        <option value="B.Com. Sem-I">B.Com. Sem-I</option>
                        <option value="B.Com. Sem-II">B.Com. Sem-II</option>
                        <option value="B.Com. Sem-III">B.Com. Sem-III</option>
                        <option value="B.Com. Sem-IV">B.Com. Sem-IV</option>
                        <option value="B.Com. Sem-V" selected>B.Com. Sem-V</option>
                        <option value="B.Com. Sem-VI">B.Com. Sem-VI</option>
                    `;
                }
            };

            const loadFormSubjects = async (prog) => {
                subjectSelect.innerHTML = `<option value="">Loading subjects...</option>`;
                try {
                    const res = await fetch(`/api/subjects?program=${encodeURIComponent(prog)}`);
                    const data = await res.json();
                    const subjects = data.subjects || [];
                    if (subjects.length === 0) {
                        subjectSelect.innerHTML = `<option value="Corporate Accounting">Corporate Accounting</option><option value="Financial Management">Financial Management</option>`;
                    } else {
                        subjectSelect.innerHTML = subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
                    }
                } catch (e) {
                    subjectSelect.innerHTML = `<option value="Corporate Accounting">Corporate Accounting</option>`;
                }
            };

            programSelect.addEventListener("change", (e) => {
                loadFormClasses(e.target.value);
                loadFormSubjects(e.target.value);
            });

            loadFormClasses(programSelect.value);
            loadFormSubjects(programSelect.value);
        }

        setupDropdowns(asgProg, asgClass, asgSubj);

        asgForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const program = asgProg.value;
            const class_name = asgClass.value;
            const subject = asgSubj.value;
            const due_date = asgDue.value;
            const title = asgTitle.value.trim();
            const description = asgDesc.value.trim();

            const file = asgFile.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    const file_data = evt.target.result;
                    await submitAssignmentUpload(title, description, due_date, file.name, file_data, program, class_name, subject);
                };
                reader.readAsDataURL(file);
            } else {
                submitAssignmentUpload(title, description, due_date, null, null, program, class_name, subject);
            }
        });

        async function submitAssignmentUpload(title, description, due_date, file_name, file_data, program, class_name, subject) {
            try {
                const res = await fetch('/api/assignments/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, due_date, file_name, file_data, program, class_name, subject })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    asgForm.reset();
                    setupDropdowns(asgProg, asgClass, asgSubj);
                    const reload = await fetch('/api/assignments');
                    const reloadData = await reload.json();
                    currentAssignments = reloadData.assignments || [];
                    renderAssignmentsList();
                } else {
                    alert(data.error);
                }
            } catch (err) {
                alert("Failed to upload assignment.");
            }
        }

        const matForm = document.getElementById("material-form");
        const matProg = document.getElementById("mat-program");
        const matClass = document.getElementById("mat-class");
        const matSubj = document.getElementById("mat-subject");
        const matTitle = document.getElementById("mat-title");
        const matDesc = document.getElementById("mat-desc");
        const matFile = document.getElementById("mat-file");
        const matContainer = document.getElementById("mat-list-container");

        let currentMaterials = [...allMaterials];
        function renderMaterialsList() {
            if (currentMaterials.length === 0) {
                matContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No study resources posted.</p>`;
                return;
            }
            matContainer.innerHTML = currentMaterials.map(m => `
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 12px; position: relative;">
                    <strong>${m.title}</strong>
                    <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">
                        Subject: ${m.subject} | Sem: ${m.class_name} | Program: ${m.program}
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="deleteMaterial(${m.id})" style="padding: 2px 6px; font-size: 10px; position: absolute; right: 10px; top: 10px;">Delete</button>
                </div>
            `).join("");
        }
        renderMaterialsList();

        window.deleteMaterial = async function(id) {
            if (!confirm("Delete this study material?")) return;
            try {
                const res = await fetch('/api/study-materials/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    const reload = await fetch('/api/study-materials');
                    const reloadData = await reload.json();
                    currentMaterials = reloadData.materials || [];
                    renderMaterialsList();
                }
            } catch (err) {
                alert("Failed to delete resource.");
            }
        };

        setupDropdowns(matProg, matClass, matSubj);

        matForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const program = matProg.value;
            const class_name = matClass.value;
            const subject = matSubj.value;
            const title = matTitle.value.trim();
            const description = matDesc.value.trim();

            const file = matFile.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    const file_data = evt.target.result;
                    await submitMaterialUpload(title, description, file.name, file_data, program, class_name, subject);
                };
                reader.readAsDataURL(file);
            } else {
                alert("Attachment file is required for study materials.");
            }
        });

        async function submitMaterialUpload(title, description, file_name, file_data, program, class_name, subject) {
            try {
                const res = await fetch('/api/study-materials/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, file_name, file_data, program, class_name, subject })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    matForm.reset();
                    setupDropdowns(matProg, matClass, matSubj);
                    const reload = await fetch('/api/study-materials');
                    const reloadData = await reload.json();
                    currentMaterials = reloadData.materials || [];
                    renderMaterialsList();
                } else {
                    alert(data.error);
                }
            } catch (err) {
                alert("Failed to upload study material.");
            }
        }

        const marksForm = document.getElementById("marks-form");
        const mrkProg = document.getElementById("mrk-program");
        const mrkClass = document.getElementById("mrk-class");
        const mrkDiv = document.getElementById("mrk-division");
        const mrkStudent = document.getElementById("mrk-student-sel");
        const mrkSubj = document.getElementById("mrk-subject");
        const mrkExam = document.getElementById("mrk-exam");
        const mrkObtained = document.getElementById("mrk-obtained");
        const mrkTotal = document.getElementById("mrk-total");
        const mrkLogTbody = document.getElementById("mrk-log-tbody");
        const mrkLogTitle = document.getElementById("mrk-log-title");

        function loadMarksClasses(prog) {
            if (prog === 'M.Com') {
                mrkClass.innerHTML = `
                    <option value="M.Com. Sem-I">M.Com. Sem-I</option>
                    <option value="M.Com. Sem-II">M.Com. Sem-II</option>
                    <option value="M.Com. Sem-III">M.Com. Sem-III</option>
                    <option value="M.Com. Sem-IV">M.Com. Sem-IV</option>
                `;
            } else if (prog === 'B.Com (Professional)') {
                mrkClass.innerHTML = `
                    <option value="B.Com. Prof. Sem-I">B.Com. Prof. Sem-I</option>
                    <option value="B.Com. Prof. Sem-II">B.Com. Prof. Sem-II</option>
                    <option value="B.Com. Prof. Sem-III">B.Com. Prof. Sem-III</option>
                    <option value="B.Com. Prof. Sem-IV">B.Com. Prof. Sem-IV</option>
                    <option value="B.Com. Prof. Sem-V">B.Com. Prof. Sem-V</option>
                    <option value="B.Com. Prof. Sem-VI">B.Com. Prof. Sem-VI</option>
                `;
            } else {
                mrkClass.innerHTML = `
                    <option value="B.Com. Sem-I">B.Com. Sem-I</option>
                    <option value="B.Com. Sem-II">B.Com. Sem-II</option>
                    <option value="B.Com. Sem-III">B.Com. Sem-III</option>
                    <option value="B.Com. Sem-IV">B.Com. Sem-IV</option>
                    <option value="B.Com. Sem-V" selected>B.Com. Sem-V</option>
                    <option value="B.Com. Sem-VI">B.Com. Sem-VI</option>
                `;
            }
        }

        async function loadMarksSubjects(prog) {
            mrkSubj.innerHTML = `<option value="">Loading...</option>`;
            try {
                const res = await fetch(`/api/subjects?program=${encodeURIComponent(prog)}`);
                const data = await res.json();
                const subjects = data.subjects || [];
                if (subjects.length === 0) {
                    mrkSubj.innerHTML = `<option value="Corporate Accounting">Corporate Accounting</option><option value="Financial Management">Financial Management</option>`;
                } else {
                    mrkSubj.innerHTML = subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
                }
            } catch (e) {
                mrkSubj.innerHTML = `<option value="Corporate Accounting">Corporate Accounting</option>`;
            }
        }

        function populateStudentsFilter() {
            const pVal = mrkProg.value;
            const cVal = mrkClass.value;
            const dVal = mrkDiv.value;

            const matchedStudents = allStudents.filter(s => {
                const matchProg = (s.program === pVal);
                const matchClass = (s.class || '').startsWith(cVal);
                const matchDiv = (s.division === dVal);
                return matchProg && matchClass && matchDiv;
            });

            if (matchedStudents.length === 0) {
                mrkStudent.innerHTML = `<option value="">No students match filters</option>`;
                mrkLogTbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); padding: 12px;">No student records found.</td></tr>`;
            } else {
                mrkStudent.innerHTML = `<option value="">-- Select Student --</option>` + matchedStudents.map(s => `
                    <option value="${s.id}">${s.username} - ${s.name}</option>
                `).join("");
            }
        }

        mrkProg.addEventListener("change", (e) => {
            loadMarksClasses(e.target.value);
            loadMarksSubjects(e.target.value);
            populateStudentsFilter();
        });
        mrkClass.addEventListener("change", populateStudentsFilter);
        mrkDiv.addEventListener("change", populateStudentsFilter);

        mrkStudent.addEventListener("change", async (e) => {
            const studentId = e.target.value;
            if (!studentId) {
                mrkLogTbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); padding: 12px;">Select a student from the filters list to inspect their record.</td></tr>`;
                mrkLogTitle.textContent = "Student Grades Log";
                return;
            }

            const chosenText = mrkStudent.options[mrkStudent.selectedIndex].text;
            mrkLogTitle.textContent = `Grades Log: ${chosenText}`;
            await loadStudentGradesLog(studentId);
        });

        async function loadStudentGradesLog(studentId) {
            mrkLogTbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); padding: 12px;">Loading grades...</td></tr>`;
            try {
                const res = await fetch(`/api/marks/${studentId}`);
                const data = await res.json();
                const marksList = data.marks || [];

                if (marksList.length === 0) {
                    mrkLogTbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); padding: 12px;">No marks recorded yet for this student.</td></tr>`;
                } else {
                    mrkLogTbody.innerHTML = marksList.map(m => `
                        <tr>
                            <td><strong>${m.subject}</strong></td>
                            <td>${m.exam_name}</td>
                            <td><strong style="color: var(--accent);">${m.marks_obtained}</strong> / ${m.marks_total}</td>
                            <td>${((m.marks_obtained / m.marks_total) * 100).toFixed(0)}%</td>
                        </tr>
                    `).join("");
                }
            } catch (err) {
                mrkLogTbody.innerHTML = `<tr><td colspan="4" style="color: var(--danger); padding: 12px;">Failed to load marks.</td></tr>`;
            }
        }

        loadMarksClasses(mrkProg.value);
        loadMarksSubjects(mrkProg.value);
        populateStudentsFilter();

        marksForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const student_id = mrkStudent.value;
            if (!student_id) {
                alert("Please select a student from the dropdown.");
                return;
            }

            const subject = mrkSubj.value;
            const exam_name = mrkExam.value;
            const marks_obtained = mrkObtained.value;
            const marks_total = mrkTotal.value;

            try {
                const res = await fetch('/api/marks/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: parseInt(student_id), subject, exam_name, marks_obtained, marks_total })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    mrkObtained.value = "";
                    await loadStudentGradesLog(student_id);
                } else {
                    alert(data.error);
                }
            } catch (err) {
                alert("Failed to save grade entry.");
            }
        });

    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="glass-card text-center"><p style="color: var(--danger);">Failed to load coursework manager console.</p></div>`;
    }
};

// Check session in LocalStorage on startup after all functions and views are declared
const storedUser = localStorage.getItem("es_current_user");
if (storedUser) {
    try {
        currentUser = JSON.parse(storedUser);
    } catch (e) {
        localStorage.removeItem("es_current_user");
    }
    if (currentUser) {
        try {
            initializeDashboard();
        } catch (err) {
            console.error("Error initializing dashboard on load:", err);
        }
    }
}




// ==========================================
// Lecture History and Reports Management Modules
// ==========================================

window.renderTeacherLecture_history = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        const res = await fetch(`/api/attendance/sessions?creator_id=${currentUser.id}`);
        const data = await res.json();
        const sessions = data.sessions || [];

        let rowsHTML = sessions.map(s => {
            const dateStr = s.created_at ? new Date(s.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${s.subject}</strong></td>
                    <td>${s.class_name} (Div ${s.division})</td>
                    <td>${s.lecture_slot || 'N/A'}</td>
                    <td>
                        <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); padding: 4px 8px; border-radius: 6px; font-weight: 600;">P: ${s.present_count}</span>
                        <span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); padding: 4px 8px; border-radius: 6px; font-weight: 600; margin-left: 4px;">A: ${s.absent_count}</span>
                        ${s.flagged_count > 0 ? `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--warning); padding: 4px 8px; border-radius: 6px; font-weight: 600; margin-left: 4px;">F: ${s.flagged_count}</span>` : ''}
                    </td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="window.editSessionRoster(${s.id}, '${s.class_name}', '${s.subject}', '${s.division}')" style="padding: 4px 8px; font-size: 11px; margin-right: 6px; cursor: pointer;">
                            <i class="fa-solid fa-user-pen"></i> Edit
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteSession(${s.id})" style="padding: 4px 8px; font-size: 11px; cursor: pointer;">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;">
                    <h3 class="card-title"><i class="fa-solid fa-clock-rotate-left mr-8"></i> Manage Taken Lectures</h3>
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="window.showOfflineAttendanceImporter()" style="padding: 6px 12px; font-size: 12px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 6px; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #818cf8; margin: 0; cursor: pointer;">
                            <i class="fa-solid fa-file-import"></i> Import Offline Attendance
                        </button>
                        <input type="text" id="teacher-history-search" class="form-control" placeholder="Search lectures..." style="width: 220px; font-size: 12px; height: 32px; padding: 4px 8px; margin: 0;">
                        <span class="attendance-status-pill status-active">${sessions.length} Lectures Taken</span>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Subject</th>
                                <th>Class & Division</th>
                                <th>Lecture Slot</th>
                                <th>Attendance Summary</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="teacher-history-tbody">
                            ${rowsHTML.length > 0 ? rowsHTML : `<tr><td colspan="6" style="color: var(--text-muted); padding: 24px;">No lecture sessions recorded yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const historySearchInput = document.getElementById("teacher-history-search");
        if (historySearchInput) {
            historySearchInput.addEventListener("input", (e) => {
                const q = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById("teacher-history-tbody");
                if (!tbody) return;
                const rows = tbody.querySelectorAll("tr");
                rows.forEach(tr => {
                    const text = tr.innerText.toLowerCase();
                    if (!q || text.includes(q)) {
                        tr.style.display = "";
                    } else {
                        tr.style.display = "none";
                    }
                });
            });
        }
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="alert alert-danger">Failed to load lecture history.</div>`;
    }
};

window.deleteSession = async function(sessionId) {
    if (!confirm("Are you sure you want to delete this lecture session? This will permanently erase the session and all student attendance marks associated with it.")) return;
    try {
        const res = await fetch(`/api/attendance/session/${sessionId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert("Lecture session deleted successfully.");
            if (currentUser.role === 'admin') {
                window.renderAdminAdmin_lectures();
            } else {
                window.renderTeacherLecture_history();
            }
        } else {
            alert(data.error || "Failed to delete session.");
        }
    } catch (err) {
        console.error(err);
        alert("An error occurred while deleting the session.");
    }
};

window.editSessionRoster = async function(sessionId, className, subject, division) {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        const studentsRes = await fetch(`/api/students/list?class_name=${encodeURIComponent(className)}&division=${encodeURIComponent(division)}`);
        const studentsData = await studentsRes.json();
        const students = studentsData.students || [];

        const recordsRes = await fetch(`/api/attendance/session/${sessionId}/records`);
        const recordsData = await recordsRes.json();
        const records = recordsData.records || [];

        const recordsMap = {};
        records.forEach(r => { recordsMap[r.student_id] = r.status; });

        let rosterHTML = students.map(s => {
            const currentStatus = recordsMap[s.id] || 'absent';
            return `
                <tr>
                    <td><strong>${s.username.replace(/^(I|II|III|IV|V|VI)/, '')}</strong></td>
                    <td class="text-left">${s.name}</td>
                    <td>
                        <select class="form-control" onchange="window.updateStudentAttendanceInSession(${sessionId}, ${s.id}, this.value)" style="width: 130px; margin: 0 auto; padding: 6px; border-radius: 8px;">
                            <option value="present" ${currentStatus === 'present' ? 'selected' : ''}>Present</option>
                            <option value="absent" ${currentStatus === 'absent' ? 'selected' : ''}>Absent</option>
                            <option value="flagged" ${currentStatus === 'flagged' ? 'selected' : ''}>Flagged</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card">
                <div class="card-header-flex mb-16">
                    <div>
                        <h3 class="card-title"><i class="fa-solid fa-user-pen mr-8"></i> Edit Lecture Attendance</h3>
                        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                            ${subject} | ${className} (Div ${division})
                        </p>
                    </div>
                    <button class="btn btn-secondary" onclick="window.backToLectureHistory()" style="padding: 8px 16px; cursor: pointer;">
                        <i class="fa-solid fa-arrow-left mr-8"></i> Back to Lectures
                    </button>
                </div>

                <!-- Dedicated Search Engine Box -->
                <div style="background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 10px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);">
                    <i class="fa-solid fa-magnifying-glass" style="color: #64748b; font-size: 14px;"></i>
                    <input type="text" id="roster-student-search" class="form-control" placeholder="Search student name or roll number..." style="background: transparent !important; border: none !important; color: #0f172a !important; padding: 0 !important; margin: 0 !important; height: auto !important; font-size: 13px !important; box-shadow: none !important; width: 100%;">
                </div>

                <div class="table-responsive">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Roll No</th>
                                <th class="text-left">Student Name</th>
                                <th>Attendance Status</th>
                            </tr>
                        </thead>
                        <tbody id="roster-tbody">
                            ${rosterHTML.length > 0 ? rosterHTML : `<tr><td colspan="3" style="color: var(--text-muted); padding: 24px;">No students found for this class division.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const rosterSearchInput = document.getElementById("roster-student-search");
        if (rosterSearchInput) {
            rosterSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById("roster-tbody");
                if (!tbody) return;
                const rows = tbody.querySelectorAll("tr");
                rows.forEach(tr => {
                    const text = tr.innerText.toLowerCase();
                    if (!q || text.includes(q)) {
                        tr.style.display = "";
                    } else {
                        tr.style.display = "none";
                    }
                });
            });
        }
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="alert alert-danger">Failed to load attendance editor.</div>`;
    }
};

window.updateStudentAttendanceInSession = async function(sessionId, studentId, status) {
    try {
        const res = await fetch('/api/attendance/mark-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, student_id: studentId, status })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error || "Failed to update attendance status.");
        }
    } catch (err) {
        console.error(err);
        alert("Network error updating attendance.");
    }
};

window.backToLectureHistory = function() {
    if (currentUser.role === 'admin') {
        window.renderAdminAdmin_lectures();
    } else {
        window.renderTeacherLecture_history();
    }
};

window.renderAdminAdmin_lectures = async function() {
    dynamicContentArea.innerHTML = `<div class="text-center" style="padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i></div>`;

    try {
        const teachersRes = await fetch('/api/users');
        const teachersData = await teachersRes.json();
        const teachers = (teachersData.users || []).filter(u => u.role === 'teacher');

        const sessionsRes = await fetch('/api/attendance/sessions');
        const sessionsData = await sessionsRes.json();
        const allSessions = sessionsData.sessions || [];

        window.renderTeacherWiseLecturesTable = function(selectedTeacherId) {
            const filteredSessions = selectedTeacherId ? allSessions.filter(s => s.creator_id === parseInt(selectedTeacherId)) : allSessions;

            let rowsHTML = filteredSessions.map(s => {
                const dateStr = s.created_at ? new Date(s.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
                return `
                    <tr>
                        <td><strong>${s.creator_name}</strong></td>
                        <td>${dateStr}</td>
                        <td><strong>${s.subject}</strong></td>
                        <td>${s.class_name} (Div ${s.division})</td>
                        <td>${s.lecture_slot || 'N/A'}</td>
                        <td>
                            <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); padding: 4px 8px; border-radius: 6px; font-weight: 600;">P: ${s.present_count}</span>
                            <span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); padding: 4px 8px; border-radius: 6px; font-weight: 600; margin-left: 4px;">A: ${s.absent_count}</span>
                            ${s.flagged_count > 0 ? `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--warning); padding: 4px 8px; border-radius: 6px; font-weight: 600; margin-left: 4px;">F: ${s.flagged_count}</span>` : ''}
                        </td>
                        <td>
                            <button class="btn btn-primary btn-sm" onclick="window.editSessionRoster(${s.id}, '${s.class_name}', '${s.subject}', '${s.division}')" style="padding: 4px 8px; font-size: 11px; margin-right: 6px; cursor: pointer;">
                                <i class="fa-solid fa-user-pen"></i> Edit
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.deleteSession(${s.id})" style="padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                <i class="fa-solid fa-trash-can"></i> Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join("");

            document.getElementById("admin-lectures-tbody").innerHTML = rowsHTML.length > 0 ? rowsHTML : `<tr><td colspan="7" style="color: var(--text-muted); padding: 24px;">No lecture sessions recorded for the selected filter.</td></tr>`;
            document.getElementById("admin-total-lectures-badge").textContent = `${filteredSessions.length} Lectures Taken`;
        };

        let teacherOptionsHTML = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join("");

        dynamicContentArea.innerHTML = `
            <div class="glass-card mb-24">
                <h3 class="card-title mb-16"><i class="fa-solid fa-filter mr-8"></i> Filter by Faculty Member</h3>
                <div class="form-group" style="max-width: 400px; margin-bottom: 0;">
                    <select class="form-control" onchange="window.renderTeacherWiseLecturesTable(this.value)" style="padding: 10px; border-radius: 10px;">
                        <option value="">All Faculty Members</option>
                        ${teacherOptionsHTML}
                    </select>
                </div>
            </div>

            <div class="glass-card">
                <div class="card-header-flex mb-16" style="flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;">
                    <h3 class="card-title"><i class="fa-solid fa-chalkboard-user mr-8"></i> Faculty Lectures Report</h3>
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="window.showOfflineAttendanceImporter()" style="padding: 6px 12px; font-size: 12px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 6px; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #818cf8; margin: 0; cursor: pointer;">
                            <i class="fa-solid fa-file-import"></i> Import Offline Attendance
                        </button>
                        <input type="text" id="admin-lectures-search" class="form-control" placeholder="Search lectures..." style="width: 220px; font-size: 12px; height: 32px; padding: 4px 8px; margin: 0;">
                        <span class="attendance-status-pill status-active" id="admin-total-lectures-badge">${allSessions.length} Lectures Taken</span>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="custom-table text-center">
                        <thead>
                            <tr>
                                <th>Faculty Name</th>
                                <th>Date & Time</th>
                                <th>Subject</th>
                                <th>Class & Division</th>
                                <th>Lecture Slot</th>
                                <th>Attendance Summary</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-lectures-tbody">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const lecturesSearchInput = document.getElementById("admin-lectures-search");
        if (lecturesSearchInput) {
            lecturesSearchInput.addEventListener("input", (e) => {
                const q = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById("admin-lectures-tbody");
                if (!tbody) return;
                const rows = tbody.querySelectorAll("tr");
                rows.forEach(tr => {
                    const text = tr.innerText.toLowerCase();
                    if (!q || text.includes(q)) {
                        tr.style.display = "";
                    } else {
                        tr.style.display = "none";
                    }
                });
            });
        }

        window.renderTeacherWiseLecturesTable("");
    } catch (err) {
        console.error(err);
        dynamicContentArea.innerHTML = `<div class="alert alert-danger">Failed to load admin lectures report.</div>`;
    }
};

window.checkStudentLockdownRecovery = async function() {
    if (currentUser && currentUser.role === 'student') {
        try {
            const res = await fetch(`/api/attendance/student/${currentUser.id}/active-checkin`);
            const data = await res.json();
            if (data.success && data.active && data.record) {
                const rec = data.record;
                if (rec.status === 'flagged' || rec.status === 'FLAGGED') {
                    window.exitAttendanceLockdown(false);
                } else {
                    window.startAttendanceLockdown(rec.session_id);
                    if (rec.status === 'present') {
                        setTimeout(() => {
                            const statusLabel = document.getElementById("lockdown-status-label");
                            if (statusLabel) {
                                statusLabel.textContent = "VERIFIED (PRESENT)";
                                statusLabel.style.color = "var(--success)";
                            }
                            const standbyArea = document.getElementById("lockdown-status-area");
                            if (standbyArea) {
                                standbyArea.innerHTML = `
                                    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 24px; text-align: center;">
                                        <i class="fa-solid fa-circle-check fa-beat" style="font-size: 56px; color: var(--success); margin-bottom: 16px;"></i>
                                        <h3 style="color: var(--success); margin-bottom: 8px;">Verification Successful!</h3>
                                        <p style="font-size: 15px; font-weight: 600; color: #ffffff;">Status: PRESENT</p>
                                        <p style="color: var(--text-muted); font-size: 13px; max-width: 400px; margin: 12px auto 0;">
                                            Please remain on this screen. Fullscreen anti-tamper tracking is still active.
                                        </p>
                                        <div style="margin-top: 24px;">
                                            <i class="fa-solid fa-spinner fa-spin-pulse" style="font-size: 24px; color: var(--success); margin-bottom: 8px;"></i>
                                            <p style="font-size: 12px; color: var(--text-muted);">Waiting for the instructor to close the session...</p>
                                        </div>
                                    </div>
                                `;
                            }
                        }, 1000);
                    } else if (rec.verification_started === 1) {
                        setTimeout(() => {
                            const event = new MessageEvent('VERIFICATION_STARTED', { data: '' });
                            if (activeSse) activeSse.dispatchEvent(event);
                        }, 1000);
                    }
                }
            }
        } catch (e) {
            console.error("Lockdown recovery check failed:", e);
        }
    }
};

// Active session search event delegation
document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "active-session-search") {
        const qVal = e.target.value.toLowerCase().trim();
        const tbody = document.getElementById("checked-in-records-list");
        if (!tbody) return;
        const rows = tbody.querySelectorAll("tr");
        rows.forEach(tr => {
            const text = tr.innerText.toLowerCase();
            if (!qVal || text.includes(qVal)) {
                tr.style.display = "";
            } else {
                tr.style.display = "none";
            }
        });
    }
});

// Import Offline Attendance Sheet Helper (Excel/CSV Parser)
window.showOfflineAttendanceImporter = async function() {
    if (!window.XLSX) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        document.head.appendChild(script);
    }
    
    generalModalTitle.textContent = "Import Offline Attendance Sheet (Excel/CSV)";
    generalModalBody.innerHTML = `<div class="text-center" style="padding: 24px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary);"></i> Loading filters...</div>`;
    generalModal.classList.add("active");
    
    try {
        const res = await fetch('/api/attendance/analytics');
        const filterData = await res.json();
        if (!filterData.success) {
            generalModalBody.innerHTML = `<p style="color: var(--danger); padding: 16px;">Failed to load filter metadata.</p>`;
            return;
        }

        const classes = filterData.classes || [];
        const divisions = filterData.divisions || [];
        const subjects = filterData.subjects || [];

        generalModalBody.innerHTML = `
            <form id="offline-import-form" style="display: flex; flex-direction: column; gap: 16px; font-size: 13px; text-align: left; padding: 4px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label><strong>Class / Semester</strong></label>
                        <select id="offline-class" class="form-control" required style="padding: 8px;">
                            ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label><strong>Division</strong></label>
                        <select id="offline-division" class="form-control" required style="padding: 8px;">
                            ${divisions.map(d => `<option value="${d}">Division ${d}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label><strong>Subject</strong></label>
                    <select id="offline-subject" class="form-control" required style="padding: 8px;">
                        ${subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label><strong>Lecture Date</strong></label>
                        <input type="date" id="offline-date" class="form-control" required style="padding: 8px;">
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label><strong>Lecture Slot</strong></label>
                        <select id="offline-slot" class="form-control" required style="padding: 8px;">
                            <option value="Lecture 1">Lecture 1</option>
                            <option value="Lecture 2">Lecture 2</option>
                            <option value="Lecture 3">Lecture 3</option>
                            <option value="Lecture 4">Lecture 4</option>
                            <option value="Lecture 5">Lecture 5</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label><strong>Choose Excel or CSV File</strong></label>
                    <input type="file" id="offline-file" accept=".csv,.xlsx,.xls" class="form-control" required style="padding: 6px;">
                    <span style="font-size: 11px; color: var(--text-muted);">
                        The sheet must list the **Roll Numbers** of present students. The system will automatically mark them as present and others as absent.
                    </span>
                </div>

                <div id="offline-preview" style="display: none; padding: 12px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; max-height: 120px; overflow-y: auto;">
                    <strong>File Preview:</strong>
                    <div id="offline-preview-text" style="font-size: 12px; margin-top: 4px; color: var(--text-muted); word-break: break-all;"></div>
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top: 10px; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; width: 100%;">
                    <i class="fa-solid fa-cloud-arrow-up"></i> Import & Save Attendance
                </button>
            </form>
        `;

        // Set default date to today
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById("offline-date").value = todayStr;

        const fileInput = document.getElementById("offline-file");
        const previewDiv = document.getElementById("offline-preview");
        const previewText = document.getElementById("offline-preview-text");

        let extractedRolls = [];

        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'csv') {
                reader.onload = (evt) => {
                    const text = evt.target.result;
                    const lines = text.split(/\r?\n/);
                    extractedRolls = [];

                    lines.forEach((line) => {
                        const cols = line.split(',');
                        cols.forEach(col => {
                            const val = col.trim().replace(/^["']|["']$/g, '');
                            if (/^\d+$/.test(val)) {
                                const num = parseInt(val);
                                if (num > 0 && num < 1000 && !extractedRolls.includes(num)) {
                                    extractedRolls.push(num);
                                }
                            }
                        });
                    });

                    extractedRolls.sort((a, b) => a - b);
                    previewDiv.style.display = "block";
                    previewText.textContent = `Found ${extractedRolls.length} present student roll numbers: ${extractedRolls.join(', ')}`;
                };
                reader.readAsText(file);
            } else if (extension === 'xlsx' || extension === 'xls') {
                if (!window.XLSX) {
                    alert("Initializing Excel parser... Please select the file again in a second.");
                    return;
                }
                reader.onload = (evt) => {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    extractedRolls = [];
                    jsonData.forEach(row => {
                        if (Array.isArray(row)) {
                            row.forEach(cell => {
                                const val = String(cell).trim();
                                if (/^\d+$/.test(val)) {
                                    const num = parseInt(val);
                                    if (num > 0 && num < 1000 && !extractedRolls.includes(num)) {
                                        extractedRolls.push(num);
                                    }
                                }
                            });
                        }
                    });

                    extractedRolls.sort((a, b) => a - b);
                    previewDiv.style.display = "block";
                    previewText.textContent = `Found ${extractedRolls.length} present student roll numbers: ${extractedRolls.join(', ')}`;
                };
                reader.readAsArrayBuffer(file);
            }
        });

        const form = document.getElementById("offline-import-form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (extractedRolls.length === 0) {
                alert("No student roll numbers could be extracted from this file. Please verify the file content.");
                return;
            }

            const className = document.getElementById("offline-class").value;
            const division = document.getElementById("offline-division").value;
            const subject = document.getElementById("offline-subject").value;
            const date = document.getElementById("offline-date").value;
            const slot = document.getElementById("offline-slot").value;

            let program = "B.Com (Regular)";
            if (className.includes("Prof")) {
                program = "B.Com (Professional)";
            } else if (className.includes("M.Com") || className.includes("MCom")) {
                program = "M.Com";
            }

            if (!confirm(`Import attendance for ${extractedRolls.length} present students in class ${className} Division ${division}? This will record the lecture as taken.`)) {
                return;
            }

            const submitBtn = form.querySelector("button[type='submit']");
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

            try {
                const importRes = await fetch('/api/attendance/session/import-offline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        class_name: className,
                        division,
                        subject,
                        program,
                        date,
                        slot,
                        present_rolls: extractedRolls
                    })
                });

                const importData = await importRes.json();
                if (importData.success) {
                    alert("Attendance successfully imported!");
                    generalModal.classList.remove("active");
                    if (currentUser.role === 'admin') {
                        window.renderAdminAdmin_lectures();
                    } else {
                        window.renderTeacherLecture_history();
                    }
                } else {
                    alert(importData.error || "Failed to import attendance.");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Import & Save Attendance`;
                }
            } catch (err) {
                console.error(err);
                alert("Network error submitting offline attendance.");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Import & Save Attendance`;
            }
        });

    } catch (err) {
        console.error(err);
        generalModalBody.innerHTML = `<p style="color: var(--danger); padding: 16px;">Failed to initialize importer.</p>`;
    }
};

