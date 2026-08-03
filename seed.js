const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'database.db');
const ROSTER_PATH = path.join(__dirname, 'q', 'students_data.js');

console.log('Starting Database Initialization & Seeding...');

const { loadDatabaseFromMongo, saveDatabaseToMongo } = require('./mongoSync');

async function main() {
    // Pull latest state from MongoDB Atlas if active
    await loadDatabaseFromMongo();

    // 1. Initialize SQLite Database
    let db;
    try {
        db = new DatabaseSync(DB_PATH);
        console.log('Connected to SQLite database at:', DB_PATH);
    } catch (err) {
        console.error('Failed to connect to database:', err);
        process.exit(1);
    }

    // Check if database is already initialized and has users
    let isSeeded = false;
try {
    const stmt = db.prepare("SELECT count(*) as count FROM users");
    const row = stmt.get();
    if (row && row.count > 0) {
        isSeeded = true;
    }
} catch (e) {
    // Table doesn't exist yet, we must seed
}

if (isSeeded && !process.argv.includes('--force')) {
    console.log('Database already initialized. Skipping seeding to prevent data loss.');
    process.exit(0);
}

// 2. Create Schema Tables
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(`
    DROP TABLE IF EXISTS attendance_records;
    DROP TABLE IF EXISTS attendance_sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS subjects;
    DROP TABLE IF EXISTS timetables;
    DROP TABLE IF EXISTS notices;
    DROP TABLE IF EXISTS daily_lectures;
    DROP TABLE IF EXISTS courses;
    DROP TABLE IF EXISTS assignments;
    DROP TABLE IF EXISTS study_materials;
    DROP TABLE IF EXISTS marks_registry;

    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        gender TEXT,
        category TEXT,
        subject TEXT,
        class TEXT,
        department TEXT,
        division TEXT,
        program TEXT,
        year TEXT,
        semester TEXT,
        fee_due REAL DEFAULT 0,
        fee_paid REAL DEFAULT 0,
        fee_total REAL DEFAULT 0
    );

    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        program TEXT NOT NULL,
        year TEXT NOT NULL,
        semester TEXT NOT NULL
    );

    CREATE TABLE timetables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program TEXT NOT NULL,
        day TEXT NOT NULL,
        slot_1 TEXT DEFAULT '',
        slot_2 TEXT DEFAULT '',
        slot_3 TEXT DEFAULT '',
        slot_4 TEXT DEFAULT '',
        UNIQUE(program, day)
    );

    CREATE TABLE notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        program TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE daily_lectures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        program TEXT NOT NULL,
        division TEXT NOT NULL,
        slot TEXT NOT NULL,
        subject TEXT NOT NULL,
        original_teacher TEXT NOT NULL,
        status TEXT NOT NULL,
        substitute_teacher TEXT DEFAULT '',
        combined_division TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        UNIQUE(date, program, division, slot)
    );

    CREATE TABLE attendance_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        creator_id INTEGER NOT NULL,
        class_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        division TEXT NOT NULL,
        program TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        require_gps INTEGER DEFAULT 0,
        creator_lat REAL,
        creator_lon REAL,
        is_rolling INTEGER DEFAULT 0,
        geofence_radius INTEGER DEFAULT 50,
        FOREIGN KEY(creator_id) REFERENCES users(id)
    );

    CREATE TABLE attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        device_id TEXT,
        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'present',
        FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
        FOREIGN KEY(student_id) REFERENCES users(id),
        UNIQUE(session_id, student_id)
    );

    CREATE TABLE courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        program TEXT NOT NULL,
        syllabus TEXT DEFAULT ''
    );

    CREATE TABLE assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        due_date TEXT NOT NULL,
        file_name TEXT,
        file_path TEXT,
        program TEXT NOT NULL,
        class_name TEXT NOT NULL,
        subject TEXT NOT NULL
    );

    CREATE TABLE study_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        file_name TEXT,
        file_path TEXT,
        program TEXT NOT NULL,
        class_name TEXT NOT NULL,
        subject TEXT NOT NULL
    );

    CREATE TABLE marks_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        exam_name TEXT NOT NULL,
        marks_obtained INTEGER NOT NULL,
        marks_total INTEGER NOT NULL,
        FOREIGN KEY(student_id) REFERENCES users(id)
    );
`);
console.log('Database tables created successfully.');

// 3. Load Student Data from q/students directory
const studentsDirectory = path.join(__dirname, 'q', 'students');
let studentsList = [];
try {
    if (fs.existsSync(studentsDirectory)) {
        const files = fs.readdirSync(studentsDirectory);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const filePath = path.join(studentsDirectory, file);
                const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const program = fileData.program || 'B.Com (Regular)';
                const year = fileData.year || '1st Year';
                const semester = fileData.semester || 'Semester 1';
                const fileDivision = fileData.division || 'A';
                const fileStudents = fileData.students || [];
                
                fileStudents.forEach(s => {
                    const isSem1 = semester === 'Semester 1';
                    studentsList.push({
                        username: s.rollNo ? s.rollNo.toString().trim() : (s.username ? s.username.toString().trim() : ""),
                        password: isSem1 ? (s.rollNo ? s.rollNo.toString().trim() : "") : (s.spdid ? s.spdid.toString().trim() : (s.password ? s.password.toString().trim() : "")),
                        name: s.name,
                        gender: s.gender || 'Male',
                        category: s.category || 'General',
                        phone: s.phone || null,
                        email: s.email || null,
                        subject: s.subject || 'Commerce',
                        class: s.class || 'B.Com. Sem-I',
                        program: program,
                        year: year,
                        semester: semester,
                        division: s.division || fileDivision
                    });
                });
                console.log(`Loaded ${fileStudents.length} students from ${file} (${program} - ${semester}).`);
            }
        });
    } else {
        console.warn("q/students directory not found.");
    }
    console.log(`Total students loaded from all rosters: ${studentsList.length}`);
} catch (err) {
    console.error('Failed to read or parse student roster files:', err);
    process.exit(1);
}

// 4. Seeding Transaction
db.exec('BEGIN TRANSACTION');

try {
    // --- Seed Settings (Gender-Based Baseline Fees) ---
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('fee_baseline_bcom_regular_boy', '6200');
    insertSetting.run('fee_baseline_bcom_regular_girl', '5200');
    insertSetting.run('fee_baseline_bcom_professional_boy', '9500');
    insertSetting.run('fee_baseline_bcom_professional_girl', '8500');
    insertSetting.run('fee_baseline_mcom_boy', '12000');
    insertSetting.run('fee_baseline_mcom_girl', '11000');
    insertSetting.run('fee_penalty', '150');
    console.log('Baseline fees settings seeded.');

    // --- Seed Subjects ---
    const insertSubject = db.prepare('INSERT INTO subjects (name, code, program, year, semester) VALUES (?, ?, ?, ?, ?)');
    
    // B.Com (Regular)
    insertSubject.run('Financial Accounting', 'BC-101', 'B.Com (Regular)', '1st Year', 'Semester 1');
    insertSubject.run('Business Organisation', 'BC-102', 'B.Com (Regular)', '1st Year', 'Semester 1');
    insertSubject.run('Microeconomics', 'BC-103', 'B.Com (Regular)', '1st Year', 'Semester 1');
    insertSubject.run('Business Communication', 'BC-104', 'B.Com (Regular)', '1st Year', 'Semester 2');
    insertSubject.run('Principles of Management', 'BC-201', 'B.Com (Regular)', '1st Year', 'Semester 2');

    // B.Com (Professional)
    insertSubject.run('Corporate Accounting', 'BCP-101', 'B.Com (Professional)', '1st Year', 'Semester 1');
    insertSubject.run('Financial Management', 'BCP-102', 'B.Com (Professional)', '1st Year', 'Semester 1');
    insertSubject.run('Auditing & Assurance', 'BCP-103', 'B.Com (Professional)', '1st Year', 'Semester 1');
    insertSubject.run('Direct Tax', 'BCP-201', 'B.Com (Professional)', '1st Year', 'Semester 2');
    insertSubject.run('Cost Accounting', 'BCP-202', 'B.Com (Professional)', '1st Year', 'Semester 2');
    insertSubject.run('Advance Financial Accounting', 'DSC-MP 301 A', 'B.Com (Professional)', '2nd Year', 'Semester 3');

    // M.Com
    insertSubject.run('Managerial Economics', 'MC-101', 'M.Com', '1st Year', 'Semester 1');
    insertSubject.run('Research Methodology', 'MC-102', 'M.Com', '1st Year', 'Semester 1');
    insertSubject.run('Strategic Cost Management', 'MC-103', 'M.Com', '1st Year', 'Semester 2');
    insertSubject.run('Quantitative Techniques', 'MC-201', 'M.Com', '1st Year', 'Semester 2');
    console.log('Course subjects seeded.');

    // --- Seed Timetables ---
    const insertTimetable = db.prepare(`
        INSERT INTO timetables (program, day, slot_1, slot_2, slot_3, slot_4)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Timetable definitions
    const schedules = {
        'B.Com (Regular)': [
            ['Monday', 'Financial Accounting (Dr. Thapa)', 'Microeconomics (Prof. Mehta)', 'Business Organisation (Dr. R. K.)', 'Statistics (Prof. Sarah Jenkins)'],
            ['Tuesday', 'Financial Accounting (Dr. Thapa)', 'Microeconomics (Prof. Mehta)', 'Statistics (Prof. Sarah Jenkins)', 'Free Slot'],
            ['Wednesday', 'Business Organisation (Dr. R. K.)', 'Microeconomics (Prof. Mehta)', 'Free Slot', 'Financial Accounting (Dr. Thapa)'],
            ['Thursday', 'Financial Accounting (Dr. Thapa)', 'Microeconomics (Prof. Mehta)', 'Statistics (Prof. Sarah Jenkins)', 'Free Slot'],
            ['Friday', 'Microeconomics (Prof. Mehta)', 'Statistics (Prof. Sarah Jenkins)', 'Business Organisation (Dr. R. K.)', 'Principles of Management (Prof. Mehta)'],
            ['Saturday', 'Microeconomics (Prof. Mehta)', 'Business Organisation (Dr. R. K.)', 'Principles of Management (Prof. Mehta)', 'Free Slot']
        ],
        'B.Com (Professional)': [
            ['Monday', 'Corporate Accounting (Dr. Trivedi)', 'Financial Management (Prof. Joshi)', 'Auditing & Assurance (CA Patel)', 'Direct Tax (Prof. Sarah Jenkins)'],
            ['Tuesday', 'Corporate Accounting (Dr. Trivedi)', 'Financial Management (Prof. Joshi)', 'Direct Tax (Prof. Sarah Jenkins)', 'Free Slot'],
            ['Wednesday', 'Auditing & Assurance (CA Patel)', 'Financial Management (Prof. Joshi)', 'Free Slot', 'Corporate Accounting (Dr. Trivedi)'],
            ['Thursday', 'Corporate Accounting (Dr. Trivedi)', 'Financial Management (Prof. Joshi)', 'Direct Tax (Prof. Sarah Jenkins)', 'Free Slot'],
            ['Friday', 'Financial Management (Prof. Joshi)', 'Direct Tax (Prof. Sarah Jenkins)', 'Auditing & Assurance (CA Patel)', 'Cost Accounting (Prof. Joshi)'],
            ['Saturday', 'Financial Management (Prof. Joshi)', 'Auditing & Assurance (CA Patel)', 'Cost Accounting (Prof. Joshi)', 'Free Slot']
        ],
        'M.Com': [
            ['Monday', 'Managerial Economics (Dr. Shah)', 'Research Methodology (Prof. Vyas)', 'Strategic Cost Management (Dr. Dave)', 'Quantitative Techniques (Prof. Jadeja)'],
            ['Tuesday', 'Managerial Economics (Dr. Shah)', 'Research Methodology (Prof. Vyas)', 'Quantitative Techniques (Prof. Jadeja)', 'Free Slot'],
            ['Wednesday', 'Strategic Cost Management (Dr. Dave)', 'Research Methodology (Prof. Vyas)', 'Free Slot', 'Managerial Economics (Dr. Shah)'],
            ['Thursday', 'Managerial Economics (Dr. Shah)', 'Research Methodology (Prof. Vyas)', 'Quantitative Techniques (Prof. Jadeja)', 'Free Slot'],
            ['Friday', 'Research Methodology (Prof. Vyas)', 'Quantitative Techniques (Prof. Jadeja)', 'Strategic Cost Management (Dr. Dave)', 'Corporate Governance (Dr. Shah)'],
            ['Saturday', 'Research Methodology (Prof. Vyas)', 'Strategic Cost Management (Dr. Dave)', 'Corporate Governance (Dr. Shah)', 'Free Slot']
        ]
    };

    for (const [program, rows] of Object.entries(schedules)) {
        rows.forEach(([day, s1, s2, s3, s4]) => {
            insertTimetable.run(program, day, s1, s2, s3, s4);
        });
    }
    console.log('Course timetables seeded.');

    // --- Seed Notices ---
    const insertNotice = db.prepare('INSERT INTO notices (title, content, program) VALUES (?, ?, ?)');
    insertNotice.run('Orientation Program', 'Welcome to the B.Com (Regular) program. The orientation session for Sem-I is next Monday in Room 101.', 'B.Com (Regular)');
    insertNotice.run('Professional Training Workshop', 'An exclusive Direct Tax workshop is scheduled for B.Com (Professional) students this Saturday.', 'B.Com (Professional)');
    insertNotice.run('Research Dissertation Seminar', 'M.Com students must choose their dissertation topics by the end of this week. Contact Prof. Vyas.', 'M.Com');
    insertNotice.run('Mid-Semester Examinations', 'Mid-sem exams for all streams will commence from the 1st of next month. Timetable will be released shortly.', 'All');
    console.log('Notice board announcements seeded.');

    // --- Seed Admin & Teacher ---
    const insertUser = db.prepare(`
        INSERT INTO users (
            username, password, role, name, email, phone, gender, category, 
            subject, class, department, division, program, year, semester, 
            fee_due, fee_paid, fee_total
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `);

    // Insert Admin (Overall)
    insertUser.run(
        'admin',
        'okokokok',
        'admin',
        'Admin Principal',
        'daveneel1405@gmail.com',
        '+91 99999 88888',
        'Male',
        'General',
        'All',
        'All',
        'Administration',
        'All',
        'B.Com (Regular)',
        'N/A',
        'N/A',
        0, 0, 0
    );

    // Seed the 26 correct teachers
    const teachersList = [
        ['abb', 'Mrs. A. V. Bharathi', 'MD/ECO', 'Commerce & Accountancy'],
        ['dj', 'Prof. D. J. Jadeja', 'Env. Sci.', 'English Department'],
        ['drm', 'Dr. D. R. Maheshwari', 'AEC/ENG', 'English Department'],
        ['rk', 'Dr. R. K. Thapa', 'Business Organisation', 'Commerce & Accountancy'],
        ['drthapa', 'Prof. P. M. Thapa', 'Financial Accounting', 'Commerce & Accountancy'],
        ['gd', 'Dr. Gaurav Thakor', 'MIC/BA', 'Physical Education'],
        ['hng', 'Prof. H. N. G.', 'BUSI. A/C', 'Commerce & Accountancy'],
        ['jkr', 'Prof. J. K. R.', 'SEC/SM', 'Commerce & Accountancy'],
        ['jr', 'Prof. J. R.', 'SEC', 'Commerce & Accountancy'],
        ['jrr', 'Dr. Jagdish R. Raiyani', 'Commerce', 'Commerce & Accountancy'],
        ['khk', 'Dr. Kamal H. Kharecha', 'BUSI. A/C', 'Commerce & Accountancy'],
        ['krt', 'Prof. K. R. Trivedi', 'MIC/Stats', 'Commerce & Accountancy'],
        ['kt', 'Prof. K. T. Mehta', 'Commerce', 'Commerce & Accountancy'],
        ['kvm', 'Dr. Kalpesh V. Machhar', 'AEC/ENG', 'English Department'],
        ['mg', 'Prof. M. G.', 'Commerce', 'Commerce & Accountancy'],
        ['mkp', 'Dr. Manish K. Pandya', 'Env. Sci.', 'English Department'],
        ['pbc', 'Dr. Peena B. Chauhan', 'MIC/BA', 'Commerce & Accountancy'],
        ['pkt', 'Prof. P. K. Trivedi', 'FIN. A/C', 'Commerce & Accountancy'],
        ['pmc', 'Prof. P. M. Chauhan', 'Commerce', 'Commerce & Accountancy'],
        ['pmt', 'Prof. P. M. Thapa', 'MD/ECO', 'Commerce & Accountancy'],
        ['teacher', 'Prof. Sarah Jenkins', 'Statistics', 'Commerce & Accountancy'],
        ['rm', 'Prof. R. M.', 'SEC', 'Commerce & Accountancy'],
        ['sap', 'Prof. S. A. Patel', 'BUSI. A/C', 'Commerce & Accountancy'],
        ['sda', 'Mr. Dhirubha P. Sodha', 'Cost A/C', 'Commerce & Accountancy'],
        ['sjt', 'Prof. S. J. Trivedi', 'TAX P.', 'Commerce & Accountancy'],
        ['ta', 'Prof. T. A.', 'BUSI. A/C', 'Commerce & Accountancy']
    ];

    for (const t of teachersList) {
        const username = t[0];
        const name = t[1];
        const subject = t[2];
        const dept = t[3];
        const email = username + '@tcc.ac.in';
        const phone = '+91 99000 00000';
        
        insertUser.run(
            username,
            '1405',
            'teacher',
            name,
            email,
            phone,
            'Male',
            'General',
            subject,
            'All',
            dept,
            'All',
            'B.Com (Regular)',
            'N/A',
            'N/A',
            0, 0, 0
        );
    }
    console.log('Admin and 26 Faculty members seeded.');

    // --- Seed Students dynamically loaded from JSON files ---
    studentsList.forEach((s) => {
        const username = s.username;
        const password = s.password;
        const gender = s.gender || 'Male';
        const division = s.division || 'A';

        // Gender-based fees
        let baselineFee = 6200;
        const prog = (s.program || '').toLowerCase();
        const g = (s.gender || '').toLowerCase();
        if (prog.includes('professional')) {
            baselineFee = g === 'female' ? 8500 : 9500;
        } else if (prog.includes('m.com') || prog.includes('mcom')) {
            baselineFee = g === 'female' ? 11000 : 12000;
        } else {
            baselineFee = g === 'female' ? 5200 : 6200;
        }

        insertUser.run(
            username,
            password,
            'student',
            s.name || 'Student ' + username,
            s.email || null,
            s.phone || null,
            gender,
            s.category || 'General',
            s.subject || 'Commerce',
            s.class || 'B.Com. Sem-I',
            s.program,
            division,
            s.program,
            s.year,
            s.semester,
            baselineFee,
            0,
            baselineFee
        );
    });

    // Seed Courses & Syllabus
    const insertCourse = db.prepare("INSERT INTO courses (code, name, program, syllabus) VALUES (?, ?, ?, ?)");
    insertCourse.run("BCP-501", "Corporate Accounting", "B.Com (Professional)", "Module 1: Holding Company Accounts.\nModule 2: Amalgamation & External Reconstruction.\nModule 3: Valuation of Shares & Goodwill.\nModule 4: Liquidator's Final Statement of Accounts.");
    insertCourse.run("BCP-502", "Financial Management", "B.Com (Professional)", "Module 1: Capital Budgeting Decisions.\nModule 2: Cost of Capital & Leverage.\nModule 3: Dividend Policy Decisions.\nModule 4: Working Capital Management.");
    insertCourse.run("BCP-503", "Auditing & Assurance", "B.Com (Professional)", "Module 1: Audit Framework & Standards.\nModule 2: Internal Control & Risk Assessment.\nModule 3: Vouching & Verification of Assets.\nModule 4: Audit Reports & Certifications.");
    insertCourse.run("BCP-504", "Direct Tax", "B.Com (Professional)", "Module 1: Basic concepts & residential status.\nModule 2: Heads of Income (Salary, House Property).\nModule 3: Profits & Gains of Business or Profession.\nModule 4: Computation of Total Income & Tax Liability.");

    // Seed Assignments
    const insertAssignment = db.prepare("INSERT INTO assignments (title, description, due_date, file_name, file_path, program, class_name, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    insertAssignment.run("Holding Company Problems Sheet", "Please complete questions 1 to 5 from Chapter 3 and submit standard calculations.", "2026-07-25", "holding_company_practice.pdf", "/uploads/holding_company_practice.pdf", "B.Com (Professional)", "B.Com. Sem-V", "Corporate Accounting");
    insertAssignment.run("Capital Budgeting Case Study", "Analyze the NPV and IRR cashflows for the project scenarios in the case document.", "2026-07-28", "capital_budgeting_scenarios.pdf", "/uploads/capital_budgeting_scenarios.pdf", "B.Com (Professional)", "B.Com. Sem-V", "Financial Management");

    // Seed Study Materials
    const insertMaterial = db.prepare("INSERT INTO study_materials (title, description, file_name, file_path, program, class_name, subject) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insertMaterial.run("Amalgamation Lecture Handout", "Classroom slides covering accounting treatment for Amalgamation in the nature of purchase vs merger.", "amalgamation_slides.pdf", "/uploads/amalgamation_slides.pdf", "B.Com (Professional)", "B.Com. Sem-V", "Corporate Accounting");
    insertMaterial.run("Levrages and FM Formulas Sheet", "Quick reference PDF listing formulas for Operating Leverage, Financial Leverage, and Combined Leverage.", "leverage_formulas.pdf", "/uploads/leverage_formulas.pdf", "B.Com (Professional)", "B.Com. Sem-V", "Financial Management");

    // Seed Marks for Students 3 and 4 (Aaditya & Abhishek)
    const insertMark = db.prepare("INSERT INTO marks_registry (student_id, subject, exam_name, marks_obtained, marks_total) VALUES (?, ?, ?, ?, ?)");
    // Student 3 (roll 1) marks
    insertMark.run(3, "Corporate Accounting", "Internal Test 1", 24, 30);
    insertMark.run(3, "Corporate Accounting", "Mid-Semester Exam", 58, 70);
    insertMark.run(3, "Financial Management", "Internal Test 1", 26, 30);
    insertMark.run(3, "Financial Management", "Mid-Semester Exam", 62, 70);
    // Student 4 (roll 2) marks
    insertMark.run(4, "Corporate Accounting", "Internal Test 1", 22, 30);
    insertMark.run(4, "Corporate Accounting", "Mid-Semester Exam", 52, 70);
    insertMark.run(4, "Financial Management", "Internal Test 1", 25, 30);
    insertMark.run(4, "Financial Management", "Mid-Semester Exam", 60, 70);

    db.exec('COMMIT');
    console.log(`Database transaction completed. Successfully seeded ${studentsList.length} students and course management resources.`);
} catch (err) {
    db.exec('ROLLBACK');
    console.error('Error seeding database, transaction rolled back:', err);
    process.exit(1);
}

    console.log('Seeding finished successfully.');
    db.close();

    // Sync seeded database to MongoDB Atlas
    await saveDatabaseToMongo();
    console.log("Seeded database successfully synced to MongoDB Atlas.");
    process.exit(0);
}

main().catch(err => {
    console.error("Critical seeder failure:", err);
    process.exit(1);
});
