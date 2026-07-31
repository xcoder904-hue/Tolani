CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    gender VARCHAR(20),
    category VARCHAR(100),
    subject VARCHAR(100),
    class VARCHAR(100),
    department VARCHAR(100),
    division VARCHAR(100),
    program VARCHAR(100),
    year VARCHAR(50),
    semester VARCHAR(50),
    fee_due DOUBLE DEFAULT 0,
    fee_paid DOUBLE DEFAULT 0,
    fee_total DOUBLE DEFAULT 0,
    profile_locked INT DEFAULT 0,
    password_locked INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    program VARCHAR(255) NOT NULL,
    year VARCHAR(100) NOT NULL,
    semester VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timetables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    program VARCHAR(255) NOT NULL,
    day VARCHAR(50) NOT NULL,
    slot_1 VARCHAR(255) DEFAULT '',
    slot_2 VARCHAR(255) DEFAULT '',
    slot_3 VARCHAR(255) DEFAULT '',
    slot_4 VARCHAR(255) DEFAULT '',
    UNIQUE(program, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    program VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_lectures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(50) NOT NULL,
    program VARCHAR(255) NOT NULL,
    division VARCHAR(100) NOT NULL,
    slot VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    original_teacher VARCHAR(255) NOT NULL,
    status VARCHAR(100) NOT NULL,
    substitute_teacher VARCHAR(255) DEFAULT '',
    combined_division VARCHAR(255) DEFAULT '',
    notes TEXT DEFAULT '',
    UNIQUE(date, program, division, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    creator_id INT NOT NULL,
    class_name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    division VARCHAR(100) NOT NULL,
    program VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at VARCHAR(100) NOT NULL,
    is_active INT DEFAULT 1,
    require_gps INT DEFAULT 0,
    creator_lat REAL,
    creator_lon REAL,
    is_rolling INT DEFAULT 0,
    geofence_radius INT DEFAULT 50,
    lecture_slot VARCHAR(100) DEFAULT 'Lecture 1',
    secret_key VARCHAR(100),
    duration_minutes INT DEFAULT 0,
    status VARCHAR(100) DEFAULT 'ACTIVE',
    code2 VARCHAR(100),
    secret_key2 VARCHAR(100),
    verification_started INT DEFAULT 0,
    FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    student_id INT NOT NULL,
    device_id VARCHAR(255),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(100) DEFAULT 'present',
    violations_count INT DEFAULT 0,
    violation_logs TEXT,
    FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(session_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    program VARCHAR(255) NOT NULL,
    syllabus TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    file_path VARCHAR(255),
    program VARCHAR(255) NOT NULL,
    class_name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS study_materials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_name VARCHAR(255),
    file_path VARCHAR(255),
    program VARCHAR(255) NOT NULL,
    class_name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marks_registry (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    exam_name VARCHAR(255) NOT NULL,
    marks_obtained INT NOT NULL,
    marks_total INT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
