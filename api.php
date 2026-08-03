<?php
// api.php - Unified PHP API Router for EduSphere (tolani.edu)

// Start session for state and authentication
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

// If preflight OPTIONS request, exit immediately
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// Include database connection
require_once __DIR__ . '/db.php';

// Parse query route path
$route = $_GET['route'] ?? '';
if (empty($route)) {
    $route = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
}

// Normalize route: strip everything before and including 'api/' to support subdirectories and custom web server setups
$apiPos = strpos($route, 'api/');
if ($apiPos !== false) {
    $route = substr($route, $apiPos + 4);
}
$route = trim($route, '/');

$method = $_SERVER['REQUEST_METHOD'];

// Set default response headers to JSON
header('Content-Type: application/json');

// --- ROUTER HANDLERS ---

// 1. Auth Login Handler
if (($route === 'login' || $route === 'auth/login') && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';
    
    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Username and Password are required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if ($user && $user['password'] === $password) {
        // Authenticated successfully: Save user to session
        $_SESSION['user'] = [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'gender' => $user['gender'],
            'category' => $user['category'],
            'subject' => $user['subject'],
            'class' => $user['class'],
            'division' => $user['division'],
            'program' => $user['program'],
            'year' => $user['year'],
            'semester' => $user['semester']
        ];
        
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid username or password.']);
    }
    exit;
}

// 2. Get Current Auth Session Handler
if (($route === 'session' || $route === 'auth/session') && $method === 'GET') {
    if (isset($_SESSION['user'])) {
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Not authenticated.']);
    }
    exit;
}

// 3. Logout Handler
if (($route === 'logout' || $route === 'auth/logout') && $method === 'POST') {
    session_destroy();
    echo json_encode(['success' => true, 'message' => 'Logged out successfully.']);
    exit;
}

// 4. Get Faculty/Admin Users list (for filtering reports)
if ($route === 'users' && $method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM users");
    $users = $stmt->fetchAll();
    echo json_encode(['success' => true, 'users' => $users]);
    exit;
}

// 5. Get Student Roster Handler
if ($route === 'students/list' && $method === 'GET') {
    $class_name = $_GET['class_name'] ?? '';
    $division = $_GET['division'] ?? '';
    
    if (!$class_name || !$division) {
        http_response_code(400);
        echo json_encode(['error' => 'Class Name and Division are required.']);
        exit;
    }
    
    if ($division === 'All') {
        $stmt = $pdo->prepare("SELECT id, name, username, gender, division FROM users WHERE role = 'student' AND class = ?");
        $stmt->execute([$class_name]);
    } else {
        $stmt = $pdo->prepare("SELECT id, name, username, gender, division FROM users WHERE role = 'student' AND class = ? AND division = ?");
        $stmt->execute([$class_name, $division]);
    }
    $students = $stmt->fetchAll();
    
    // Derive roll number and sort numerically
    foreach ($students as &$s) {
        $roll = preg_replace('/^(VI|IV|III|II|I|V)/i', '', $s['username']);
        $roll = preg_replace('/P$/i', '', $roll);
        $s['roll_no'] = trim($roll);
    }
    unset($s);
    
    usort($students, function($a, $b) {
        return (int)$a['roll_no'] - (int)$b['roll_no'];
    });
    
    echo json_encode(['success' => true, 'students' => $students]);
    exit;
}

// 6. Bulk Manual Phone Check-in Assistant Handler
if ($route === 'attendance/session/bulk-checkin' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $session_code = $input['session_code'] ?? '';
    $roll_numbers = $input['roll_numbers'] ?? [];
    
    if (!$session_code || !is_array($roll_numbers)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required session code or roll numbers.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE code = ?");
    $stmt->execute([$session_code]);
    $session = $stmt->fetch();
    
    if (!$session) {
        http_response_code(404);
        echo json_encode(['error' => 'Session not found.']);
        exit;
    }
    
    // Fetch all student options in the class/division
    if ($session['division'] === 'All') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE role = 'student' AND class = ?");
        $stmt->execute([$session['class_name']]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE role = 'student' AND class = ? AND (division = ? OR division = 'B.Com (Regular)')");
        $stmt->execute([$session['class_name'], $session['division']]);
    }
    $students = $stmt->fetchAll();
    
    $added = [];
    $invalid = [];
    $alreadyPresent = [];
    
    $pdo->beginTransaction();
    try {
        foreach ($roll_numbers as $roll) {
            $cleanRoll = trim($roll);
            if (!$cleanRoll) continue;
            
            $matchedUser = null;
            foreach ($students as $s) {
                $rollPart = preg_replace('/^(VI|IV|III|II|I|V)/i', '', $s['username']);
                $rollPart = preg_replace('/P$/i', '', $rollPart);
                $rollPart = trim($rollPart);
                
                if ($rollPart === $cleanRoll || strtolower($s['username']) === strtolower($cleanRoll)) {
                    $matchedUser = $s;
                    break;
                }
            }
            
            if (!$matchedUser) {
                $invalid[] = $cleanRoll;
                continue;
            }
            
            $checkStmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?");
            $checkStmt->execute([$session['id'], $matchedUser['id']]);
            $existing = $checkStmt->fetch();
            
            if ($existing) {
                $alreadyPresent[] = $cleanRoll;
                continue;
            }
            
            // Insert attendance record
            $markedAt = date('Y-m-d H:i:s');
            $insertStmt = $pdo->prepare("INSERT INTO attendance_records (session_id, student_id, device_id, status, marked_at) VALUES (?, ?, 'MANUAL_PHONE', 'present', ?)");
            $insertStmt->execute([$session['id'], $matchedUser['id'], $markedAt]);
            $added[] = $cleanRoll;
        }
        $pdo->commit();
        
        echo json_encode([
            'success' => true,
            'added' => $added,
            'invalid' => $invalid,
            'alreadyPresent' => $alreadyPresent,
            'message' => 'Bulk manual phone check-in process completed.'
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// 7. Close Session Handler
if ($route === 'attendance/session/close' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? '';
    
    if (!$code) {
        http_response_code(400);
        echo json_encode(['error' => 'Session code is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE code = ?");
    $stmt->execute([$code]);
    $session = $stmt->fetch();
    
    if (!$session) {
        http_response_code(404);
        echo json_encode(['error' => 'No active session found with this code.']);
        exit;
    }
    
    $pdo->prepare("UPDATE attendance_sessions SET is_active = 0, status = 'CLOSED' WHERE id = ?")->execute([$session['id']]);
    
    if ((int)$session['verification_started'] === 1) {
        $pdo->prepare("UPDATE attendance_records SET status = 'absent' WHERE session_id = ? AND (status = 'pending' OR status = 'PENDING')")->execute([$session['id']]);
    } else {
        $pdo->prepare("UPDATE attendance_records SET status = 'present' WHERE session_id = ? AND (status = 'pending' OR status = 'PENDING')")->execute([$session['id']]);
    }
    
    echo json_encode(['success' => true, 'message' => 'Attendance session successfully closed.']);
    exit;
}

// 16. Import Offline Attendance Sheet Handler
if ($route === 'attendance/session/import-offline' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $class_name = $input['class_name'] ?? '';
    $division = $input['division'] ?? '';
    $subject = $input['subject'] ?? '';
    $program = $input['program'] ?? '';
    $date = $input['date'] ?? '';
    $slot = $input['slot'] ?? '';
    $present_rolls = $input['present_rolls'] ?? [];
    $creator_id = $_SESSION['user']['id'] ?? 1;

    if (!$class_name || !$division || !$subject || !$date || !$slot || !is_array($present_rolls)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required metadata or roll numbers.']);
        exit;
    }

    $pdo->beginTransaction();
    try {
        $code = 'OFFLINE-' . rand(100000, 999999);
        $createdAt = "$date 10:00:00";
        $expiresAt = "$date 11:00:00";

        // Insert session
        $stmt = $pdo->prepare("
            INSERT INTO attendance_sessions (code, creator_id, class_name, subject, division, program, created_at, expires_at, is_active, status, lecture_slot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'CLOSED', ?)
        ");
        $stmt->execute([$code, $creator_id, $class_name, $subject, $division, $program, $createdAt, $expiresAt, $slot]);
        
        $sessionId = $pdo->lastInsertId();

        // Fetch students
        if ($division === 'All') {
            $stmt = $pdo->prepare("SELECT id, username FROM users WHERE role = 'student' AND class = ?");
            $stmt->execute([$class_name]);
        } else {
            $stmt = $pdo->prepare("SELECT id, username FROM users WHERE role = 'student' AND class = ? AND (division = ? OR division = 'B.Com (Regular)')");
            $stmt->execute([$class_name, $division]);
        }
        $students = $stmt->fetchAll();

        // Insert attendance records
        $insertStmt = $pdo->prepare("
            INSERT INTO attendance_records (session_id, student_id, device_id, status, marked_at)
            VALUES (?, ?, 'OFFLINE_IMPORT', ?, ?)
        ");

        foreach ($students as $student) {
            $rollPart = preg_replace('/^(VI|IV|III|II|I|V)/i', '', $student['username']);
            $rollPart = preg_replace('/P$/i', '', $rollPart);
            $rollPart = trim($rollPart);

            $isPresent = false;
            foreach ($present_rolls as $roll) {
                $cleanRoll = trim($roll);
                if ($rollPart === $cleanRoll || strtolower($student['username']) === strtolower($cleanRoll)) {
                    $isPresent = true;
                    break;
                }
            }

            $status = $isPresent ? 'present' : 'absent';
            $insertStmt->execute([$sessionId, (int)$student['id'], $status, $createdAt]);
        }

        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Offline attendance sheet successfully imported.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// 8. Taken Lectures History Handler
if ($route === 'attendance/sessions' && $method === 'GET') {
    $creator_id = $_GET['creator_id'] ?? null;
    $class_name = $_GET['class_name'] ?? null;
    $division = $_GET['division'] ?? null;
    
    $sql = "
        SELECT s.id, s.code, s.class_name, s.subject, s.division, s.program, s.created_at, s.is_active, s.lecture_slot, u.name as creator_name,
          (SELECT count(*) FROM attendance_records WHERE session_id = s.id AND status = 'present') as present_count,
          ((SELECT count(*) FROM users WHERE role = 'student' AND class = s.class_name AND (s.division = 'All' OR division = s.division)) - 
           (SELECT count(*) FROM attendance_records WHERE session_id = s.id AND (status = 'present' OR status = 'flagged'))) as absent_count,
          (SELECT count(*) FROM attendance_records WHERE session_id = s.id AND status = 'flagged') as flagged_count
        FROM attendance_sessions s
        JOIN users u ON s.creator_id = u.id
    ";
    
    $params = [];
    $conditions = [];
    if ($creator_id) {
        $conditions[] = " s.creator_id = ? ";
        $params[] = (int)$creator_id;
    }
    if ($class_name) {
        $conditions[] = " s.class_name = ? ";
        $params[] = $class_name;
    }
    if ($division) {
        $conditions[] = " s.division = ? ";
        $params[] = $division;
    }
    if (count($conditions) > 0) {
        $sql .= " WHERE " . implode(" AND ", $conditions);
    }
    $sql .= " ORDER BY s.created_at DESC ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $sessions = $stmt->fetchAll();
    
    echo json_encode(['success' => true, 'sessions' => $sessions]);
    exit;
}

// 9. Session Records Interchangeable GET Handler
if (preg_match('/^attendance\/session\/([^\/]+)\/records$/', $route, $matches)) {
    $codeOrId = $matches[1];
    $session = null;
    
    if (ctype_digit($codeOrId)) {
        $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE id = ?");
        $stmt->execute([$codeOrId]);
        $session = $stmt->fetch();
    }
    if (!$session) {
        $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE code = ?");
        $stmt->execute([$codeOrId]);
        $session = $stmt->fetch();
    }
    
    if (!$session) {
        http_response_code(404);
        echo json_encode(['error' => 'Session not found.']);
        exit;
    }
    
    $stmt = $pdo->prepare("
        SELECT r.id, r.marked_at, u.name, u.username as roll_number, u.username as roll_no, u.division, u.gender, r.status, r.violations_count, r.violation_logs
        FROM attendance_records r
        JOIN users u ON r.student_id = u.id
        WHERE r.session_id = ?
        ORDER BY r.marked_at DESC
    ");
    $stmt->execute([$session['id']]);
    $records = $stmt->fetchAll();
    
    echo json_encode([
        'success' => true,
        'session' => $session,
        'records' => $records
    ]);
    exit;
}

// 10. Mark Manual Attendance Status Override Handler
if ($route === 'attendance/mark-manual' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $session_id = $input['session_id'] ?? '';
    $student_id = $input['student_id'] ?? '';
    $status = $input['status'] ?? '';
    
    if (!$session_id || !$student_id || !$status) {
        http_response_code(400);
        echo json_encode(['error' => 'Session ID, Student ID, and Status are required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?");
    $stmt->execute([$session_id, $student_id]);
    $check = $stmt->fetch();
    $markedAt = date('Y-m-d H:i:s');
    
    if (!$check) {
        $insert = $pdo->prepare("INSERT INTO attendance_records (session_id, student_id, device_id, status, marked_at) VALUES (?, ?, 'MANUAL', ?, ?)");
        $insert->execute([$session_id, $student_id, strtolower($status), $markedAt]);
    } else {
        $update = $pdo->prepare("UPDATE attendance_records SET status = ?, marked_at = ? WHERE session_id = ? AND student_id = ?");
        $update->execute([strtolower($status), $markedAt, $session_id, $student_id]);
    }
    
    echo json_encode(['success' => true, 'message' => "Student attendance updated to $status."]);
    exit;
}

// 11. Profile Settings Update Handler
if ($route === 'teacher/update-profile' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';
    $email = $input['email'] ?? '';
    $phone = $input['phone'] ?? '';
    $gender = $input['gender'] ?? '';
    $department = $input['department'] ?? '';
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'User ID is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("UPDATE users SET email = ?, phone = ?, gender = ?, department = ? WHERE id = ?");
    $stmt->execute([$email, $phone, $gender, $department, $id]);
    
    // Sync to PHP Session if modifying current user
    if (isset($_SESSION['user']) && (int)$_SESSION['user']['id'] === (int)$id) {
        $_SESSION['user']['email'] = $email;
        $_SESSION['user']['phone'] = $phone;
        $_SESSION['user']['gender'] = $gender;
        $_SESSION['user']['department'] = $department;
    }
    
    echo json_encode(['success' => true, 'message' => 'Profile updated successfully.']);
    exit;
}

// 12. Storage Diagnostics Handler
if ($route === 'admin/storage-info' && $method === 'GET') {
    $db_file = __DIR__ . '/database.db';
    $uploads_dir = __DIR__ . '/uploads';
    
    $db_size = file_exists($db_file) ? filesize($db_file) : 0;
    
    $uploads_size = 0;
    $files_list = [];
    if (is_dir($uploads_dir)) {
        $files = scandir($uploads_dir);
        foreach ($files as $f) {
            if ($f === '.' || $f === '..') continue;
            $fpath = $uploads_dir . '/' . $f;
            $fsize = file_exists($fpath) ? filesize($fpath) : 0;
            $uploads_size += $fsize;
            $files_list[] = [
                'name' => $f,
                'size' => $fsize,
                'path' => '/uploads/' . $f
            ];
        }
    }
    
    echo json_encode([
        'success' => true,
        'db_size' => $db_size,
        'uploads_size' => $uploads_size,
        'files' => $files_list
    ]);
    exit;
}

// 13. Professor SSE Stream Handler
if (preg_match('/^attendance\/session\/([^\/]+)\/professor-stream$/', $route, $matches)) {
    $sessionId = $matches[1];
    
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    ob_implicit_flush(true);
    
    $last_check = date('Y-m-d H:i:s');
    
    while (true) {
        if (connection_aborted()) {
            break;
        }
        
        $stmt = $pdo->prepare("
            SELECT r.id, r.marked_at, u.name, u.username as roll_no, u.division, u.gender, r.status, r.student_id
            FROM attendance_records r
            JOIN users u ON r.student_id = u.id
            WHERE r.session_id = ? AND r.marked_at > ?
            ORDER BY r.marked_at ASC
        ");
        $stmt->execute([$sessionId, $last_check]);
        $newRecords = $stmt->fetchAll();
        
        if (count($newRecords) > 0) {
            foreach ($newRecords as $r) {
                echo "event: STUDENT_JOINED\n";
                echo "data: " . json_encode([
                    'student_id' => (int)$r['student_id'],
                    'name' => $r['name'],
                    'roll_no' => $r['roll_no'],
                    'gender' => $r['gender'],
                    'division' => $r['division'],
                    'status' => $r['status']
                ]) . "\n\n";
                
                $last_check = $r['marked_at'];
            }
        }
        
        echo "event: ping\n";
        echo "data: " . json_encode(['time' => time()]) . "\n\n";
        
        sleep(2);
    }
    exit;
}

// 14. Student SSE Stream Handler
if (preg_match('/^attendance\/session\/([^\/]+)\/student-stream$/', $route, $matches)) {
    $sessionId = $matches[1];
    
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    ob_implicit_flush(true);
    
    $last_verification_started = 0;
    $last_is_active = 1;
    
    $stmt = $pdo->prepare("SELECT is_active, verification_started FROM attendance_sessions WHERE id = ?");
    $stmt->execute([$sessionId]);
    $initial = $stmt->fetch();
    if ($initial) {
        $last_verification_started = (int)$initial['verification_started'];
        $last_is_active = (int)$initial['is_active'];
    }
    
    while (true) {
        if (connection_aborted()) {
            break;
        }
        
        $stmt = $pdo->prepare("SELECT is_active, verification_started FROM attendance_sessions WHERE id = ?");
        $stmt->execute([$sessionId]);
        $current = $stmt->fetch();
        
        if ($current) {
            $current_verification = (int)$current['verification_started'];
            $current_active = (int)$current['is_active'];
            
            if ($current_verification === 1 && $last_verification_started === 0) {
                echo "event: VERIFICATION_STARTED\n";
                echo "data: " . json_encode(['message' => 'Verification phase started']) . "\n\n";
                $last_verification_started = 1;
            }
            
            if ($current_active === 0 && $last_is_active === 1) {
                echo "event: SESSION_CLOSED\n";
                echo "data: " . json_encode(['message' => 'Attendance session completed.']) . "\n\n";
                $last_is_active = 0;
            }
        }
        
        echo "event: ping\n";
        echo "data: " . json_encode(['time' => time()]) . "\n\n";
        
        sleep(2);
    }
    exit;
}

// 15. Attendance Analytics Handler (Start Date and End Date range)
if ($route === 'attendance/analytics' && $method === 'GET') {
    $class_name = $_GET['class_name'] ?? '';
    $division = $_GET['division'] ?? '';
    $subject = $_GET['subject'] ?? '';
    $start_date = $_GET['start_date'] ?? '';
    $end_date = $_GET['end_date'] ?? '';
    
    // Get distinct dropdown filters
    $stmt = $pdo->query("SELECT DISTINCT class FROM users WHERE role = 'student' AND class IS NOT NULL");
    $classes = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $stmt = $pdo->query("SELECT DISTINCT division FROM users WHERE role = 'student' AND division IS NOT NULL");
    $divisions = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $stmt = $pdo->query("SELECT DISTINCT name FROM subjects");
    $subjects = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (!$class_name && count($classes) > 0) $class_name = $classes[0];
    if (!$division && count($divisions) > 0) $division = $divisions[0];
    if (!$subject && count($subjects) > 0) $subject = $subjects[0];
    
    if (!$class_name || !$division || !$subject) {
        echo json_encode([
            'success' => true,
            'classes' => $classes,
            'divisions' => $divisions,
            'subjects' => $subjects,
            'students' => [],
            'metrics' => [
                'totalStudents' => 0,
                'totalLectures' => 0,
                'totalPresent' => 0,
                'totalAbsent' => 0,
                'overallAttendance' => 0
            ],
            'monthlyOverview' => [],
            'distribution' => [
                'excellent' => 0,
                'good' => 0,
                'average' => 0,
                'needsImprove' => 0
            ]
        ]);
        exit;
    }
    
    // Fetch all active students in class and division
    $stmt = $pdo->prepare("SELECT id, name, username, gender FROM users WHERE role = 'student' AND class = ? AND division = ?");
    $stmt->execute([$class_name, $division]);
    $students = $stmt->fetchAll();
    
    // Derive roll number and sort students numerically
    foreach ($students as &$s) {
        $roll = preg_replace('/^(VI|IV|III|II|I|V)/i', '', $s['username']);
        $roll = preg_replace('/P$/i', '', $roll);
        $s['roll_no'] = trim($roll);
    }
    unset($s);
    
    usort($students, function($a, $b) {
        return (int)$a['roll_no'] - (int)$b['roll_no'];
    });
    
    // Fetch all sessions matching filters and date range
    $sql = "SELECT id, created_at FROM attendance_sessions WHERE class_name = ? AND division = ? AND subject = ?";
    $params = [$class_name, $division, $subject];
    
    if ($start_date) {
        $sql .= " AND created_at >= ? ";
        $params[] = $start_date . ' 00:00:00';
    }
    if ($end_date) {
        $sql .= " AND created_at <= ? ";
        $params[] = $end_date . ' 23:59:59';
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $sessions = $stmt->fetchAll();
    
    $totalLectures = count($sessions);
    $sessionIds = array_map(function($s) { return (int)$s['id']; }, $sessions);
    
    $totalPresent = 0;
    $totalAbsent = 0;
    $studentStats = [];
    
    $excellentCount = 0;
    $goodCount = 0;
    $averageCount = 0;
    $needsImproveCount = 0;
    
    foreach ($students as $student) {
        $presentCount = 0;
        if ($totalLectures > 0 && count($sessionIds) > 0) {
            $placeholders = implode(',', array_fill(0, count($sessionIds), '?'));
            $query = "SELECT COUNT(*) as count FROM attendance_records WHERE student_id = ? AND status = 'present' AND session_id IN ($placeholders)";
            $stmt = $pdo->prepare($query);
            $stmt->execute(array_merge([(int)$student['id']], $sessionIds));
            $res = $stmt->fetch();
            $presentCount = $res ? (int)$res['count'] : 0;
        }
        
        $absentCount = $totalLectures - $presentCount;
        $percentage = $totalLectures > 0 ? (($presentCount / $totalLectures) * 100) : 0;
        
        $status = 'Needs Improve';
        if ($percentage >= 90) {
            $status = 'Excellent';
            $excellentCount++;
        } else if ($percentage >= 75) {
            $status = 'Good';
            $goodCount++;
        } else if ($percentage >= 60) {
            $status = 'Average';
            $averageCount++;
        } else {
            $needsImproveCount++;
        }
        
        $totalPresent += $presentCount;
        $totalAbsent += $absentCount;
        
        $studentStats[] = [
            'rollNo' => $student['roll_no'],
            'name' => $student['name'],
            'gender' => $student['gender'],
            'totalLectures' => $totalLectures,
            'present' => $presentCount,
            'absent' => $absentCount,
            'percentage' => round($percentage, 2),
            'status' => $status
        ];
    }
    
    $totalStudents = count($students);
    $overallAttendance = ($totalStudents > 0 && $totalLectures > 0) 
        ? (($totalPresent / ($totalStudents * $totalLectures)) * 100) 
        : 0;
        
    // Calculate Monthly Overview (Apr to Mar)
    $academicMonths = [
        ['name' => "Apr", 'num' => "04"], ['name' => "May", 'num' => "05"], ['name' => "Jun", 'num' => "06"],
        ['name' => "Jul", 'num' => "07"], ['name' => "Aug", 'num' => "08"], ['name' => "Sep", 'num' => "09"],
        ['name' => "Oct", 'num' => "10"], ['name' => "Nov", 'num' => "11"], ['name' => "Dec", 'num' => "12"],
        ['name' => "Jan", 'num' => "01"], ['name' => "Feb", 'num' => "02"], ['name' => "Mar", 'num' => "03"]
    ];
    
    $monthlyOverview = [];
    foreach ($academicMonths as $monthObj) {
        $monthSessions = array_filter($sessions, function($s) use ($monthObj) {
            return strpos($s['created_at'], '-' . $monthObj['num'] . '-') !== false;
        });
        
        $monthAttendance = 0;
        if (count($monthSessions) > 0 && $totalStudents > 0) {
            $mSessionIds = array_map(function($s) { return (int)$s['id']; }, $monthSessions);
            $placeholders = implode(',', array_fill(0, count($mSessionIds), '?'));
            $query = "SELECT COUNT(*) as count FROM attendance_records WHERE status = 'present' AND session_id IN ($placeholders)";
            $stmt = $pdo->prepare($query);
            $stmt->execute($mSessionIds);
            $res = $stmt->fetch();
            $presentInMonth = $res ? (int)$res['count'] : 0;
            $monthAttendance = round(($presentInMonth / ($totalStudents * count($monthSessions))) * 100);
        } else {
            $monthAttendance = rand(75, 95);
        }
        
        $monthlyOverview[] = [
            'month' => $monthObj['name'],
            'percentage' => (int)$monthAttendance
        ];
    }
    
    echo json_encode([
        'success' => true,
        'classes' => $classes,
        'divisions' => $divisions,
        'subjects' => $subjects,
        'students' => $studentStats,
        'metrics' => [
            'totalStudents' => $totalStudents,
            'totalLectures' => $totalLectures,
            'totalPresent' => $totalPresent,
            'totalAbsent' => $totalAbsent,
            'overallAttendance' => round($overallAttendance, 2)
        ],
        'monthlyOverview' => $monthlyOverview,
        'distribution' => [
            'excellent' => $excellentCount,
            'good' => $goodCount,
            'average' => $averageCount,
            'needsImprove' => $needsImproveCount
        ]
    ]);
    exit;
}

// 16. Delete Active Session and Records
if (preg_match('/^attendance\/session\/(\d+)$/', $route, $matches) && $method === 'DELETE') {
    $sessionId = (int)$matches[1];
    $pdo->prepare('DELETE FROM attendance_records WHERE session_id = ?')->execute([$sessionId]);
    $pdo->prepare('DELETE FROM attendance_sessions WHERE id = ?')->execute([$sessionId]);
    echo json_encode(['success' => true, 'message' => 'Lecture session and attendance records deleted successfully.']);
    exit;
}

// 17. Subjects Management Handlers
if ($route === 'subjects' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM subjects WHERE program = ? ORDER BY id ASC');
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM subjects ORDER BY program ASC, id ASC');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'subjects' => $rows]);
    exit;
}

if ($route === 'subjects/add' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? '';
    $code = $input['code'] ?? '';
    $program = $input['program'] ?? '';
    $year = $input['year'] ?? '1st Year';
    $semester = $input['semester'] ?? 'Semester 1';
    
    if (!$name || !$code || !$program) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required subject parameters (name, code, program).']);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("INSERT INTO subjects (name, code, program, year, semester) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$name, $code, $program, $year, $semester]);
        echo json_encode(['success' => true, 'message' => "Subject '$name' registered successfully."]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to register subject. Code may already exist.']);
    }
    exit;
}

if ($route === 'subjects/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Subject ID is required.']);
        exit;
    }
    $pdo->prepare('DELETE FROM subjects WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Subject deleted successfully.']);
    exit;
}

// 18. Notices Management Handlers
if ($route === 'notices' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    if ($program) {
        $stmt = $pdo->prepare("SELECT * FROM notices WHERE program = ? OR program = 'All' ORDER BY created_at DESC");
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM notices ORDER BY created_at DESC');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'notices' => $rows]);
    exit;
}

if ($route === 'notices/add' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $title = $input['title'] ?? '';
    $content = $input['content'] ?? '';
    $program = $input['program'] ?? '';
    
    if (!$title || !$content || !$program) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required notice parameters.']);
        exit;
    }
    
    $stmt = $pdo->prepare('INSERT INTO notices (title, content, program) VALUES (?, ?, ?)');
    $stmt->execute([$title, $content, $program]);
    echo json_encode(['success' => true, 'message' => 'Notice posted successfully.']);
    exit;
}

if ($route === 'notices/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Notice ID is required.']);
        exit;
    }
    $pdo->prepare('DELETE FROM notices WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Notice deleted successfully.']);
    exit;
}

// 19. Timetables Management Handlers
if ($route === 'timetables' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM timetables WHERE program = ?');
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM timetables');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'timetables' => $rows]);
    exit;
}

if ($route === 'timetables/save' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $program = $input['program'] ?? '';
    $day = $input['day'] ?? '';
    $slot_1 = $input['slot_1'] ?? '';
    $slot_2 = $input['slot_2'] ?? '';
    $slot_3 = $input['slot_3'] ?? '';
    $slot_4 = $input['slot_4'] ?? '';
    
    if (!$program || !$day) {
        http_response_code(400);
        echo json_encode(['error' => 'Program and day parameters are required.']);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO timetables (program, day, slot_1, slot_2, slot_3, slot_4)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                slot_1 = VALUES(slot_1),
                slot_2 = VALUES(slot_2),
                slot_3 = VALUES(slot_3),
                slot_4 = VALUES(slot_4)
        ");
        $stmt->execute([$program, $day, $slot_1, $slot_2, $slot_3, $slot_4]);
        echo json_encode(['success' => true, 'message' => "Timetable for $program ($day) updated successfully."]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save timetable settings: ' . $e->getMessage()]);
    }
    exit;
}

// 20. Daily Lectures Override Handlers
if ($route === 'daily-lectures' && $method === 'GET') {
    $date = $_GET['date'] ?? '';
    $program = $_GET['program'] ?? '';
    $division = $_GET['division'] ?? '';
    if (!$date) {
        http_response_code(400);
        echo json_encode(['error' => 'Date (YYYY-MM-DD) is required.']);
        exit;
    }
    
    if ($program && $division) {
        $stmt = $pdo->prepare('SELECT * FROM daily_lectures WHERE date = ? AND program = ? AND division = ?');
        $stmt->execute([$date, $program, $division]);
    } else if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM daily_lectures WHERE date = ? AND program = ?');
        $stmt->execute([$date, $program]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM daily_lectures WHERE date = ?');
        $stmt->execute([$date]);
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'lectures' => $rows]);
    exit;
}

if ($route === 'daily-lectures/save' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $date = $input['date'] ?? '';
    $program = $input['program'] ?? '';
    $division = $input['division'] ?? '';
    $slot = $input['slot'] ?? '';
    $subject = $input['subject'] ?? '';
    $original_teacher = $input['original_teacher'] ?? '';
    $status = $input['status'] ?? '';
    $substitute_teacher = $input['substitute_teacher'] ?? '';
    $combined_division = $input['combined_division'] ?? '';
    $notes = $input['notes'] ?? '';
    
    if (!$date || !$program || !$division || !$slot || !$status) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required override parameters.']);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO daily_lectures (date, program, division, slot, subject, original_teacher, status, substitute_teacher, combined_division, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                subject = VALUES(subject),
                original_teacher = VALUES(original_teacher),
                status = VALUES(status),
                substitute_teacher = VALUES(substitute_teacher),
                combined_division = VALUES(combined_division),
                notes = VALUES(notes)
        ");
        $stmt->execute([$date, $program, $division, $slot, $subject, $original_teacher, $status, $substitute_teacher, $combined_division, $notes]);
        echo json_encode(['success' => true, 'message' => 'Lecture adjustment updated successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save lecture override.']);
    }
    exit;
}

if ($route === 'daily-lectures/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Adjustment ID is required.']);
        exit;
    }
    $pdo->prepare('DELETE FROM daily_lectures WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Lecture adjustment reverted to default.']);
    exit;
}

// 21. Courses & Syllabus Handlers
if ($route === 'courses' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM courses WHERE program = ?');
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM courses');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'courses' => $rows]);
    exit;
}

if ($route === 'courses/save' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? '';
    $name = $input['name'] ?? '';
    $program = $input['program'] ?? '';
    $syllabus = $input['syllabus'] ?? '';
    
    if (!$code || !$name || !$program) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required course fields.']);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO courses (code, name, program, syllabus)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                program = VALUES(program),
                syllabus = VALUES(syllabus)
        ");
        $stmt->execute([$code, $name, $program, $syllabus]);
        echo json_encode(['success' => true, 'message' => 'Course details saved successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save course details.']);
    }
    exit;
}

// 22. Assignments Handlers
if ($route === 'assignments' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    $class_name = $_GET['class_name'] ?? '';
    if ($program && $class_name) {
        $stmt = $pdo->prepare('SELECT * FROM assignments WHERE program = ? AND class_name = ?');
        $stmt->execute([$program, $class_name]);
    } else if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM assignments WHERE program = ?');
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM assignments');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'assignments' => $rows]);
    exit;
}

if ($route === 'assignments/upload' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $title = $input['title'] ?? '';
    $description = $input['description'] ?? '';
    $due_date = $input['due_date'] ?? '';
    $file_name = $input['file_name'] ?? '';
    $file_data = $input['file_data'] ?? '';
    $program = $input['program'] ?? '';
    $class_name = $input['class_name'] ?? '';
    $subject = $input['subject'] ?? '';
    
    if (!$title || !$due_date || !$program || !$class_name || !$subject) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required assignment fields.']);
        exit;
    }
    
    $filePath = null;
    if ($file_name && $file_data) {
        try {
            $base64Data = preg_replace('/^data:.*;base64,/', '', $file_data);
            $uploads_dir = __DIR__ . '/uploads';
            if (!is_dir($uploads_dir)) {
                mkdir($uploads_dir, 0755, true);
            }
            $cleanFileName = time() . '_' . basename($file_name);
            $fullPath = $uploads_dir . '/' . $cleanFileName;
            file_put_contents($fullPath, base64_decode($base64Data));
            $filePath = '/uploads/' . $cleanFileName;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save uploaded attachment.']);
            exit;
        }
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO assignments (title, description, due_date, file_name, file_path, program, class_name, subject)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$title, $description, $due_date, $file_name ? $file_name : null, $filePath, $program, $class_name, $subject]);
        echo json_encode(['success' => true, 'message' => 'Assignment uploaded successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create assignment record: ' . $e->getMessage()]);
    }
    exit;
}

if ($route === 'assignments/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Assignment ID is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare('SELECT file_path FROM assignments WHERE id = ?');
    $stmt->execute([$id]);
    $item = $stmt->fetch();
    if ($item && $item['file_path']) {
        $fullPath = __DIR__ . $item['file_path'];
        if (file_exists($fullPath)) {
            @unlink($fullPath);
        }
    }
    $pdo->prepare('DELETE FROM assignments WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Assignment deleted successfully.']);
    exit;
}

// 23. Study Materials Handlers
if ($route === 'study-materials' && $method === 'GET') {
    $program = $_GET['program'] ?? '';
    $class_name = $_GET['class_name'] ?? '';
    if ($program && $class_name) {
        $stmt = $pdo->prepare('SELECT * FROM study_materials WHERE program = ? AND class_name = ?');
        $stmt->execute([$program, $class_name]);
    } else if ($program) {
        $stmt = $pdo->prepare('SELECT * FROM study_materials WHERE program = ?');
        $stmt->execute([$program]);
    } else {
        $stmt = $pdo->query('SELECT * FROM study_materials');
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'materials' => $rows]);
    exit;
}

if ($route === 'study-materials/upload' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $title = $input['title'] ?? '';
    $description = $input['description'] ?? '';
    $file_name = $input['file_name'] ?? '';
    $file_data = $input['file_data'] ?? '';
    $program = $input['program'] ?? '';
    $class_name = $input['class_name'] ?? '';
    $subject = $input['subject'] ?? '';
    
    if (!$title || !$program || !$class_name || !$subject) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields.']);
        exit;
    }
    
    $filePath = null;
    if ($file_name && $file_data) {
        try {
            $base64Data = preg_replace('/^data:.*;base64,/', '', $file_data);
            $uploads_dir = __DIR__ . '/uploads';
            if (!is_dir($uploads_dir)) {
                mkdir($uploads_dir, 0755, true);
            }
            $cleanFileName = time() . '_' . basename($file_name);
            $fullPath = $uploads_dir . '/' . $cleanFileName;
            file_put_contents($fullPath, base64_decode($base64Data));
            $filePath = '/uploads/' . $cleanFileName;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save uploaded attachment.']);
            exit;
        }
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO study_materials (title, description, file_name, file_path, program, class_name, subject)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$title, $description, $file_name ? $file_name : null, $filePath, $program, $class_name, $subject]);
        echo json_encode(['success' => true, 'message' => 'Study material uploaded successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create study material record.']);
    }
    exit;
}

if ($route === 'study-materials/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Material ID is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare('SELECT file_path FROM study_materials WHERE id = ?');
    $stmt->execute([$id]);
    $item = $stmt->fetch();
    if ($item && $item['file_path']) {
        $fullPath = __DIR__ . $item['file_path'];
        if (file_exists($fullPath)) {
            @unlink($fullPath);
        }
    }
    $pdo->prepare('DELETE FROM study_materials WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Study material deleted successfully.']);
    exit;
}

// 24. Marks Registry Handlers
if (preg_match('/^marks\/([^\/]+)$/', $route, $matches)) {
    $student_id = $matches[1];
    $stmt = $pdo->prepare("
        SELECT m.id, m.subject, m.exam_name, m.marks_obtained, m.marks_total, u.name as student_name
        FROM marks_registry m
        JOIN users u ON m.student_id = u.id
        WHERE m.student_id = ?
    ");
    $stmt->execute([$student_id]);
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'marks' => $rows]);
    exit;
}

if ($route === 'marks/save' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $student_id = $input['student_id'] ?? '';
    $subject = $input['subject'] ?? '';
    $exam_name = $input['exam_name'] ?? '';
    $marks_obtained = $input['marks_obtained'] ?? 0;
    $marks_total = $input['marks_total'] ?? 0;
    
    if (!$student_id || !$subject || !$exam_name || $marks_obtained === null || !$marks_total) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required marks fields.']);
        exit;
    }
    
    $stmt = $pdo->prepare('SELECT id FROM marks_registry WHERE student_id = ? AND subject = ? AND exam_name = ?');
    $stmt->execute([$student_id, $subject, $exam_name]);
    $existing = $stmt->fetch();
    
    if ($existing) {
        $pdo->prepare('UPDATE marks_registry SET marks_obtained = ?, marks_total = ? WHERE id = ?')
             ->execute([(int)$marks_obtained, (int)$marks_total, $existing['id']]);
    } else {
        $pdo->prepare('INSERT INTO marks_registry (student_id, subject, exam_name, marks_obtained, marks_total) VALUES (?, ?, ?, ?, ?)')
             ->execute([$student_id, $subject, $exam_name, (int)$marks_obtained, (int)$marks_total]);
    }
    echo json_encode(['success' => true, 'message' => 'Marks saved successfully.']);
    exit;
}

// 25. Settings Handlers (Drive, Fees, Profile Edit Permissions)
if ($route === 'settings/drive' && $method === 'GET') {
    $stmt = $pdo->prepare("SELECT value FROM settings WHERE `key` = 'google_drive_script_url'");
    $stmt->execute();
    $row = $stmt->fetch();
    echo json_encode(['success' => true, 'url' => $row ? $row['value'] : '']);
    exit;
}

if ($route === 'settings/drive' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $url = $input['url'] ?? '';
    $stmt = $pdo->prepare("
        INSERT INTO settings (`key`, value) VALUES ('google_drive_script_url', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
    ");
    $stmt->execute([$url]);
    echo json_encode(['success' => true, 'message' => 'Drive settings saved.']);
    exit;
}

if ($route === 'settings/fees' && $method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM settings');
    $rows = $stmt->fetchAll();
    $settingsMap = [];
    foreach ($rows as $r) {
        $settingsMap[$r['key']] = $r['value'];
    }
    echo json_encode([
        'success' => true,
        'fees' => [
            'fee_baseline_bcom_regular_boy' => $settingsMap['fee_baseline_bcom_regular_boy'] ?? '6200',
            'fee_baseline_bcom_regular_girl' => $settingsMap['fee_baseline_bcom_regular_girl'] ?? '5200',
            'fee_baseline_bcom_professional_boy' => $settingsMap['fee_baseline_bcom_professional_boy'] ?? '9500',
            'fee_baseline_bcom_professional_girl' => $settingsMap['fee_baseline_bcom_professional_girl'] ?? '8500',
            'fee_baseline_mcom_boy' => $settingsMap['fee_baseline_mcom_boy'] ?? '12000',
            'fee_baseline_mcom_girl' => $settingsMap['fee_baseline_mcom_girl'] ?? '11000',
            'fee_penalty' => $settingsMap['fee_penalty'] ?? '150'
        ]
    ]);
    exit;
}

if ($route === 'settings/fees' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $fees = $input['fees'] ?? null;
    if (!$fees) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing fees settings object.']);
        exit;
    }
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO settings (`key`, value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        ");
        foreach ($fees as $key => $val) {
            $stmt->execute([$key, strval($val)]);
        }
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Fees baseline configuration saved successfully.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save fees configuration.']);
    }
    exit;
}

if ($route === 'settings/profile-permissions' && $method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM settings');
    $rows = $stmt->fetchAll();
    $settingsMap = [];
    foreach ($rows as $r) {
        $settingsMap[$r['key']] = $r['value'];
    }
    echo json_encode([
        'success' => true,
        'allow_student_profile_edit' => ($settingsMap['allow_student_profile_edit'] ?? '') !== 'false',
        'allow_teacher_profile_edit' => ($settingsMap['allow_teacher_profile_edit'] ?? '') !== 'false'
    ]);
    exit;
}

if ($route === 'settings/profile-permissions' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $allow_student_profile_edit = $input['allow_student_profile_edit'] ?? true;
    $allow_teacher_profile_edit = $input['allow_teacher_profile_edit'] ?? true;
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO settings (`key`, value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        ");
        $stmt->execute(['allow_student_profile_edit', $allow_student_profile_edit ? 'true' : 'false']);
        $stmt->execute(['allow_teacher_profile_edit', $allow_teacher_profile_edit ? 'true' : 'false']);
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Profile edit permissions saved successfully.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save permissions.']);
    }
    exit;
}

// 26. Admin User Management Handlers (add, edit, delete)
if ($route === 'users/add' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';
    $role = $input['role'] ?? 'student';
    $name = $input['name'] ?? '';
    $email = $input['email'] ?? null;
    $phone = $input['phone'] ?? null;
    $division = $input['division'] ?? 'A';
    $class_name = $input['class_name'] ?? '';
    $department = $input['department'] ?? 'B.Com (NEP)';
    $program = $input['program'] ?? 'B.Com (Regular)';
    $year = $input['year'] ?? '1st Year';
    $semester = $input['semester'] ?? 'Semester 1';
    $gender = $input['gender'] ?? 'Male';
    $subject = $input['subject'] ?? null;
    
    if (!$username || !$password || !$role || !$name) {
        http_response_code(400);
        echo json_encode(['error' => 'Username, Password, Role, and Name are required.']);
        exit;
    }
    
    $finalProgram = $program;
    $finalSemester = $semester;
    $finalGender = $gender;
    if ($role === 'student') {
        if ($class_name) {
            if (strpos($class_name, 'Sem-I') !== false || strpos($class_name, 'Sem 1') !== false) { $finalSemester = 'Semester 1'; }
            else if (strpos($class_name, 'Sem-III') !== false) { $finalSemester = 'Semester 3'; }
            else if (strpos($class_name, 'Sem-V') !== false) { $finalSemester = 'Semester 5'; }
            
            if (strpos($class_name, 'Prof') !== false) { $finalProgram = 'B.Com (Professional)'; }
            else if (strpos($class_name, 'M.Com') !== false || strpos($class_name, 'MCom') !== false) { $finalProgram = 'M.Com'; }
            else { $finalProgram = 'B.Com (Regular)'; }
        }
    }
    
    $finalClass = $class_name ?: 'B.Com. Sem-I';
    if ($role === 'student') {
        if ($finalProgram === 'B.Com (Professional)') {
            if ($finalSemester === 'Semester 1') $finalClass = 'B.Com. Prof. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'B.Com. Prof. Sem-III';
            else if ($finalSemester === 'Semester 5') $finalClass = 'B.Com. Prof. Sem-V';
        } else if ($finalProgram === 'M.Com') {
            if ($finalSemester === 'Semester 1') $finalClass = 'M.Com. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'M.Com. Sem-III';
        } else {
            if ($finalSemester === 'Semester 1') $finalClass = 'B.Com. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'B.Com. Sem-III';
            else if ($finalSemester === 'Semester 5') $finalClass = 'B.Com. Sem-V';
        }
    }
    
    $feeDue = 0;
    $feeTotal = 0;
    if ($role === 'student') {
        $progLower = strtolower($finalProgram);
        $genderLower = strtolower($finalGender);
        if (strpos($progLower, 'professional') !== false) {
            $feeDue = ($genderLower === 'female') ? 8500 : 9500;
        } else if (strpos($progLower, 'm.com') !== false || strpos($progLower, 'mcom') !== false) {
            $feeDue = ($genderLower === 'female') ? 11000 : 12000;
        } else {
            $feeDue = ($genderLower === 'female') ? 5200 : 6200;
        }
        $feeTotal = $feeDue;
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO users (username, password, role, name, email, phone, division, class, department, program, year, semester, gender, fee_due, fee_paid, fee_total, subject)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ");
        $stmt->execute([
            $username, $password, $role, $name, $email, $phone, 
            $division, $finalClass, $department, $finalProgram, $year, $finalSemester, $gender, $feeDue, $feeTotal, $subject
        ]);
        echo json_encode(['success' => true, 'message' => 'User added successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to add user. Username may already exist.']);
    }
    exit;
}

if ($route === 'users/edit' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    $username = $input['username'] ?? '';
    $name = $input['name'] ?? '';
    $email = $input['email'] ?? null;
    $phone = $input['phone'] ?? null;
    $division = $input['division'] ?? 'A';
    $class_name = $input['class_name'] ?? '';
    $department = $input['department'] ?? 'B.Com (NEP)';
    $program = $input['program'] ?? 'B.Com (Regular)';
    $year = $input['year'] ?? '1st Year';
    $semester = $input['semester'] ?? 'Semester 1';
    $gender = $input['gender'] ?? 'Male';
    $password = $input['password'] ?? '';
    $subject = $input['subject'] ?? null;
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT role, username, program, semester, class FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found.']);
        exit;
    }
    
    $finalRole = $existing['role'];
    $finalProgram = $program ?: ($existing['program'] ?: 'B.Com (Regular)');
    $finalSemester = $semester ?: ($existing['semester'] ?: 'Semester 1');
    $finalClass = $class_name;
    
    if ($finalRole === 'student') {
        if ($finalProgram === 'B.Com (Professional)') {
            if ($finalSemester === 'Semester 1') $finalClass = 'B.Com. Prof. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'B.Com. Prof. Sem-III';
            else if ($finalSemester === 'Semester 5') $finalClass = 'B.Com. Prof. Sem-V';
        } else if ($finalProgram === 'M.Com') {
            if ($finalSemester === 'Semester 1') $finalClass = 'M.Com. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'M.Com. Sem-III';
        } else {
            if ($finalSemester === 'Semester 1') $finalClass = 'B.Com. Sem-I';
            else if ($finalSemester === 'Semester 3') $finalClass = 'B.Com. Sem-III';
            else if ($finalSemester === 'Semester 5') $finalClass = 'B.Com. Sem-V';
        }
    } else {
        $finalClass = $finalClass ?: ($existing['class'] ?: 'B.Com. Sem-I');
    }
    
    $finalUsername = $username ? trim($username) : $existing['username'];
    
    if ($finalUsername !== $existing['username']) {
        $stmt = $pdo->prepare("SELECT count(*) as count FROM users WHERE username = ?");
        $stmt->execute([$finalUsername]);
        $dup = $stmt->fetch();
        if ($dup && (int)$dup['count'] > 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Username already taken by another account.']);
            exit;
        }
    }
    
    $query = "UPDATE users SET username = ?, name = ?, email = ?, phone = ?, division = ?, class = ?, department = ?, program = ?, year = ?, semester = ?, gender = ?, subject = ?";
    $params = [$finalUsername, $name, $email, $phone, $division, $finalClass, $department, $finalProgram, $year, $finalSemester, $gender, $subject];
    
    if ($password && trim($password) !== '') {
        $query .= ", password = ?";
        $params[] = trim($password);
    }
    
    $query .= " WHERE id = ?";
    $params[] = $id;
    
    try {
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        echo json_encode(['success' => true, 'message' => 'User updated successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update user.']);
    }
    exit;
}

if ($route === 'users/delete' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID is required.']);
        exit;
    }
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'User deleted successfully.']);
    exit;
}

// 27. Diagnostics & Admin Maintenance Handlers
if ($route === 'diagnostics' && $method === 'GET') {
    $mysqlVer = $pdo->query('select version()')->fetchColumn();
    echo json_encode([
        'success' => true,
        'status' => 'healthy',
        'database' => 'connected',
        'mysql_version' => $mysqlVer,
        'php_version' => PHP_VERSION,
        'uploads_directory' => is_dir(__DIR__ . '/uploads') ? 'writable' : 'missing'
    ]);
    exit;
}

if ($route === 'admin/clean-storage' && $method === 'POST') {
    $activeFiles = [];
    $stmt = $pdo->query("SELECT file_path FROM assignments WHERE file_path IS NOT NULL");
    while ($path = $stmt->fetchColumn()) {
        $activeFiles[] = basename($path);
    }
    $stmt = $pdo->query("SELECT file_path FROM study_materials WHERE file_path IS NOT NULL");
    while ($path = $stmt->fetchColumn()) {
        $activeFiles[] = basename($path);
    }
    
    $cleanedCount = 0;
    $uploads_dir = __DIR__ . '/uploads';
    if (is_dir($uploads_dir)) {
        $files = scandir($uploads_dir);
        foreach ($files as $f) {
            if ($f === '.' || $f === '..') continue;
            if (!in_array($f, $activeFiles)) {
                @unlink($uploads_dir . '/' . $f);
                $cleanedCount++;
            }
        }
    }
    echo json_encode(['success' => true, 'message' => "Storage cleaned successfully. Deleted $cleanedCount orphan files."]);
    exit;
}

if ($route === 'admin/delete-file' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $file_path = $input['file_path'] ?? '';
    if ($file_path) {
        $fullPath = __DIR__ . $file_path;
        if (file_exists($fullPath)) {
            @unlink($fullPath);
            echo json_encode(['success' => true, 'message' => 'File deleted successfully.']);
            exit;
        }
    }
    http_response_code(400);
    echo json_encode(['error' => 'File not found.']);
    exit;
}

if ($route === 'admin/clear-database' && $method === 'POST') {
    $pdo->beginTransaction();
    try {
        $pdo->query("DELETE FROM attendance_records");
        $pdo->query("DELETE FROM attendance_sessions");
        $pdo->query("DELETE FROM daily_lectures");
        $pdo->query("DELETE FROM marks_registry");
        $pdo->query("DELETE FROM study_materials");
        $pdo->query("DELETE FROM assignments");
        $pdo->query("DELETE FROM notices");
        $pdo->query("DELETE FROM timetables");
        $pdo->query("DELETE FROM users WHERE role != 'admin'");
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'All database transaction records and student/faculty profiles cleared. System reverted to original clean state.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to clear database.']);
    }
    exit;
}

if ($route === 'sql' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $query = $input['query'] ?? '';
    if (!$query) {
        http_response_code(400);
        echo json_encode(['error' => 'Query parameter is required.']);
        exit;
    }
    
    $lower = strtolower($query);
    if (strpos($lower, 'drop') !== false || strpos($lower, 'truncate') !== false) {
        http_response_code(403);
        echo json_encode(['error' => 'DROP or TRUNCATE commands are prohibited.']);
        exit;
    }
    
    try {
        $stmt = $pdo->query($query);
        if (strpos($lower, 'select') === 0 || strpos($lower, 'show') === 0 || strpos($lower, 'describe') === 0 || strpos($lower, 'explain') === 0) {
            $rows = $stmt->fetchAll();
            echo json_encode(['success' => true, 'results' => $rows]);
        } else {
            echo json_encode(['success' => true, 'affected_rows' => $stmt->rowCount()]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// 28. Student Active Checkin & Attendance History Handlers
if (preg_match('/^attendance\/student\/([^\/]+)\/active-checkin$/', $route, $matches)) {
    $studentId = $matches[1];
    $now = date('Y-m-d H:i:s');
    
    $stmt = $pdo->prepare("
        SELECT r.*, s.subject, s.created_at as session_start
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        WHERE r.student_id = ? AND s.is_active = 1 AND s.expires_at > ?
    ");
    $stmt->execute([$studentId, $now]);
    $record = $stmt->fetch();
    
    if ($record) {
        echo json_encode(['success' => true, 'active' => true, 'record' => $record]);
    } else {
        echo json_encode(['success' => true, 'active' => false]);
    }
    exit;
}

if (preg_match('/^attendance\/student\/([^\/]+)\/history$/', $route, $matches)) {
    $studentId = $matches[1];
    $stmt = $pdo->prepare("
        SELECT r.marked_at, s.subject, s.class_name, s.code, r.status
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        WHERE r.student_id = ?
        ORDER BY r.marked_at DESC
    ");
    $stmt->execute([$studentId]);
    $records = $stmt->fetchAll();
    echo json_encode(['success' => true, 'records' => $records]);
    exit;
}

if ($route === 'attendance/history' && $method === 'GET') {
    $creator_id = $_GET['creator_id'] ?? null;
    $sql = "
        SELECT r.id, r.marked_at, u.username as roll_no, u.name as student_name, 
               u.gender, u.program, u.class as student_class, u.division as student_division,
               s.subject, s.class_name as session_class, s.division as session_division,
               s.code as session_code, t.name as teacher_name
        FROM attendance_records r
        JOIN users u ON r.student_id = u.id
        JOIN attendance_sessions s ON r.session_id = s.id
        JOIN users t ON s.creator_id = t.id
    ";
    $params = [];
    if ($creator_id) {
        $sql .= " WHERE s.creator_id = ? ";
        $params[] = (int)$creator_id;
    }
    $sql .= " ORDER BY r.marked_at DESC ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $records = $stmt->fetchAll();
    echo json_encode(['success' => true, 'records' => $records]);
    exit;
}

// 29. Profile Modification & Session Control Handlers
if ($route === 'student/update-profile' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    $email = $input['email'] ?? '';
    $phone = $input['phone'] ?? '';
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Student ID is required.']);
        exit;
    }
    
    $permStmt = $pdo->query("SELECT value FROM settings WHERE `key` = 'allow_student_profile_edit'");
    $allow = $permStmt->fetchColumn();
    if ($allow === 'false') {
        http_response_code(403);
        echo json_encode(['error' => 'Profile editing is disabled by college administrator.']);
        exit;
    }
    
    $stmt = $pdo->prepare("UPDATE users SET email = ?, phone = ? WHERE id = ?");
    $stmt->execute([$email, $phone, $id]);
    
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    
    echo json_encode(['success' => true, 'message' => 'Profile updated successfully.', 'user' => $user]);
    exit;
}

if ($route === 'student/update-password' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    $current_password = $input['current_password'] ?? '';
    $new_password = $input['new_password'] ?? '';
    
    if (!$id || !$current_password || !$new_password) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing password parameters.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $cur = $stmt->fetchColumn();
    
    if ($cur !== $current_password) {
        http_response_code(400);
        echo json_encode(['error' => 'Incorrect current password.']);
        exit;
    }
    
    $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->execute([$new_password, $id]);
    echo json_encode(['success' => true, 'message' => 'Password updated successfully.']);
    exit;
}

if ($route === 'attendance/create' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $creator_id = $input['creator_id'] ?? null;
    $class_name = $input['class_name'] ?? '';
    $subject = $input['subject'] ?? '';
    $division = $input['division'] ?? '';
    $program = $input['program'] ?? '';
    $duration_minutes = $input['duration_minutes'] ?? 10;
    $require_gps = $input['require_gps'] ?? false;
    $creator_lat = $input['creator_lat'] ?? null;
    $creator_lon = $input['creator_lon'] ?? null;
    $is_rolling = $input['is_rolling'] ?? false;
    $geofence_radius = $input['geofence_radius'] ?? 50;
    $lecture_slot = $input['lecture_slot'] ?? 'Lecture 1';
    
    if (!$creator_id || !$class_name || !$subject || !$division || !$program) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required session parameters.']);
        exit;
    }
    
    $code = (string)rand(100000, 999999);
    $expiresAt = date('Y-m-d H:i:s', time() + ($duration_minutes * 60));
    $secretKey = strtoupper(substr(md5(uniqid(rand(), true)), 0, 8));
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO attendance_sessions (code, creator_id, class_name, subject, division, program, expires_at, require_gps, creator_lat, creator_lon, is_rolling, geofence_radius, lecture_slot, secret_key, duration_minutes, status, verification_started)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0)
        ");
        $stmt->execute([
            $code, $creator_id, $class_name, $subject, $division, $program, $expiresAt,
            $require_gps ? 1 : 0, $creator_lat, $creator_lon, $is_rolling ? 1 : 0, $geofence_radius, $lecture_slot,
            $secretKey, $duration_minutes
        ]);
        $sessionId = $pdo->lastInsertId();
        
        $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE id = ?");
        $stmt->execute([$sessionId]);
        $sess = $stmt->fetch();
        
        echo json_encode(['success' => true, 'session' => $sess]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create active session: ' . $e->getMessage()]);
    }
    exit;
}

if ($route === 'attendance/session/violate' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $session_id = $input['session_id'] ?? null;
    $student_id = $input['student_id'] ?? null;
    $violation_type = $input['violation_type'] ?? 'tab_focus_lost';
    
    if (!$session_id || !$student_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing parameters.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?");
    $stmt->execute([$session_id, $student_id]);
    $rec = $stmt->fetch();
    
    if ($rec) {
        $count = (int)$rec['violations_count'] + 1;
        $logs = $rec['violation_logs'] ? json_decode($rec['violation_logs'], true) : [];
        $logs[] = [
            'timestamp' => date('Y-m-d H:i:s'),
            'type' => $violation_type
        ];
        
        $pdo->prepare("UPDATE attendance_records SET violations_count = ?, violation_logs = ? WHERE id = ?")
             ->execute([$count, json_encode($logs), $rec['id']]);
             
        echo json_encode(['success' => true, 'violations_count' => $count]);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Record not found.']);
    }
    exit;
}

if ($route === 'attendance/session/start-verification' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? '';
    
    if (!$code) {
        http_response_code(400);
        echo json_encode(['error' => 'Code parameter is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE code = ? AND is_active = 1");
    $stmt->execute([$code]);
    $sess = $stmt->fetch();
    
    if (!$sess) {
        http_response_code(404);
        echo json_encode(['error' => 'Active session not found.']);
        exit;
    }
    
    $code2 = (string)rand(100000, 999999);
    $pdo->prepare("UPDATE attendance_sessions SET verification_started = 1, code2 = ? WHERE id = ?")
         ->execute([$code2, $sess['id']]);
         
    echo json_encode(['success' => true, 'code2' => $code2]);
    exit;
}

if ($route === 'attendance/session/rotate' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? '';
    
    if (!$code) {
        http_response_code(400);
        echo json_encode(['error' => 'Code parameter is required.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_sessions WHERE code = ? AND is_active = 1");
    $stmt->execute([$code]);
    $sess = $stmt->fetch();
    
    if (!$sess) {
        http_response_code(404);
        echo json_encode(['error' => 'Active session not found.']);
        exit;
    }
    
    $newCode = (string)rand(100000, 999999);
    $pdo->prepare("UPDATE attendance_sessions SET code = ? WHERE id = ?")->execute([$newCode, $sess['id']]);
    echo json_encode(['success' => true, 'new_code' => $newCode]);
    exit;
}

if ($route === 'attendance/verify-code2' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code2 = $input['code2'] ?? '';
    $student_id = $input['student_id'] ?? null;
    
    if (!$code2 || !$student_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Code2 and Student ID are required.']);
        exit;
    }
    
    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare("
        SELECT * FROM attendance_sessions 
        WHERE code2 = ? AND is_active = 1 AND expires_at > ?
    ");
    $stmt->execute([$code2, $now]);
    $sess = $stmt->fetch();
    
    if (!$sess) {
        http_response_code(400);
        echo json_encode(['error' => 'Incorrect verification code or session has expired.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?");
    $stmt->execute([$sess['id'], $student_id]);
    $rec = $stmt->fetch();
    
    if (!$rec) {
        http_response_code(400);
        echo json_encode(['error' => 'Check-in record not found for this session.']);
        exit;
    }
    
    $pdo->prepare("UPDATE attendance_records SET status = 'present' WHERE id = ?")->execute([$rec['id']]);
    echo json_encode(['success' => true, 'message' => 'Verification successful! Attendance marked.']);
    exit;
}

if ($route === 'attendance/check-in' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? '';
    $student_id = $input['student_id'] ?? null;
    $device_id = $input['device_id'] ?? '';
    $student_lat = $input['student_lat'] ?? null;
    $student_lon = $input['student_lon'] ?? null;
    $student_accuracy = $input['student_accuracy'] ?? 0;
    
    if (!$code || !$student_id || !$device_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing code, student_id, or device_id.']);
        exit;
    }
    
    $now = date('Y-m-d H:i:s');
    $session = null;
    
    if (strpos($code, ':') !== false) {
        $parts = explode(':', $code);
        $sessionId = (int)$parts[0];
        $hash = $parts[1];
        
        $stmt = $pdo->prepare("
            SELECT * FROM attendance_sessions 
            WHERE id = ? AND is_active = 1 AND expires_at > ?
        ");
        $stmt->execute([$sessionId, $now]);
        $s = $stmt->fetch();
        
        if ($s && $s['secret_key']) {
            $timeWindow = floor(time() / 15);
            $expectedCurrent = get15SecondHash($s['secret_key'], $timeWindow);
            $expectedPrev = get15SecondHash($s['secret_key'], $timeWindow - 1);
            if ($hash === $expectedCurrent || $hash === $expectedPrev) {
                $session = $s;
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Attendance QR Code has expired. Please scan the updated QR Code.']);
                exit;
            }
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT * FROM attendance_sessions 
            WHERE code = ? AND is_active = 1 AND expires_at > ?
        ");
        $stmt->execute([$code, $now]);
        $session = $stmt->fetch();
    }
    
    if (!$session) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid, closed, or expired attendance code.']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND device_id = ?");
    $stmt->execute([$session['id'], $device_id]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'Security Alert: This device has already marked attendance for another student. Proxy attendance is strictly prohibited.']);
        exit;
    }
    
    if ($session['require_gps']) {
        if ($student_lat === null || $student_lon === null) {
            http_response_code(400);
            echo json_encode(['error' => 'GPS Geofencing is enabled. You must share your location coordinates to complete check-in.']);
            exit;
        }
        
        $CAMPUS_LAT = 23.0765;
        $CAMPUS_LON = 70.1537;
        
        $refLat = $CAMPUS_LAT;
        $refLon = $CAMPUS_LON;
        $targetName = "the college campus";
        
        if ($session['creator_lat'] !== null && $session['creator_lon'] !== null) {
            $refLat = (double)$session['creator_lat'];
            $refLon = (double)$session['creator_lon'];
            $targetName = "the instructor's device";
        }
        
        $distance = getDistanceKm($refLat, $refLon, $student_lat, $student_lon);
        $distanceMeters = $distance * 1000;
        $radiusMeters = (int)$session['geofence_radius'] ?: 50;
        
        $errorMargin = min((double)$student_accuracy, 30.0);
        $adjustedDistance = max(0.0, $distanceMeters - $errorMargin);
        
        if ($adjustedDistance > $radiusMeters) {
            http_response_code(403);
            echo json_encode(['error' => "Geofencing failure. You must be in close proximity to $targetName (within {$radiusMeters}m) to check in. (Calculated distance: " . round($distanceMeters) . "m, error margin: -" . round($errorMargin) . "m)."]);
            exit;
        }
    }
    
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND role = 'student'");
    $stmt->execute([$student_id]);
    $student = $stmt->fetch();
    
    if (!$student) {
        http_response_code(404);
        echo json_encode(['error' => 'Student record not found.']);
        exit;
    }
    
    if ($session['program'] && $session['program'] !== $student['program']) {
        http_response_code(403);
        echo json_encode(['error' => "Program mismatch. This code is only for {$session['program']}, but you are in {$student['program']}."]);
        exit;
    }
    
    if ($session['class_name'] && strpos($student['class'], $session['class_name']) !== 0) {
        http_response_code(403);
        echo json_encode(['error' => "Class/Semester mismatch. This session is for {$session['class_name']}, but you are enrolled in {$student['class']}."]);
        exit;
    }
    
    if ($session['division'] !== 'All' && $session['division'] !== $student['division']) {
        http_response_code(403);
        echo json_encode(['error' => "Division mismatch. This code is only for Division {$session['division']}, but you are in Division {$student['division']}."]);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?");
    $stmt->execute([$session['id'], $student['id']]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'You have already checked in for this session.']);
        exit;
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO attendance_records (session_id, student_id, device_id, status, marked_at)
        VALUES (?, ?, ?, 'pending', ?)
    ");
    $stmt->execute([$session['id'], $student['id'], $device_id, $now]);
    
    echo json_encode([
        'success' => true,
        'session_id' => $session['id'],
        'message' => "Check-in successful! Present marked for {$session['subject']} ({$session['class_name']})."
    ]);
    exit;
}

// 30. Text Roster File Ingestion Handlers (Sem1, Sem3/Sem5, Professional Sem3/Sem5)
if ($route === 'admin/import-sem1' && $method === 'POST') {
    $filePath = __DIR__ . '/bcom_regular_sem1.txt';
    if (!file_exists($filePath)) {
        http_response_code(400);
        echo json_encode(['error' => 'Roster text file not found.']);
        exit;
    }
    
    $ocrText = file_get_contents($filePath);
    $lines = explode("\n", trim($ocrText));
    
    $pdo->beginTransaction();
    try {
        $insertUser = $pdo->prepare("
            INSERT INTO users (
                username, password, role, name, email, phone, gender, category, 
                subject, class, department, division, program, year, semester, 
                fee_due, fee_paid, fee_total
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ");
        
        $program = "B.Com (Regular)";
        $year = "1st Year";
        $semester = "Semester 1";
        $count = 0;
        
        foreach ($lines as $line) {
            $parts = preg_split('/\s+/', trim($line));
            if (count($parts) < 4) continue;
            
            $srNo = (int)$parts[0];
            $subjectCode = $parts[count($parts) - 1];
            
            $nameParts = array_slice($parts, 2, count($parts) - 3);
            $name = implode(' ', $nameParts);
            
            $division = 'A';
            $username = (string)$srNo;
            $password = (string)$srNo;
            
            $subject = 'Commerce';
            if ($subjectCode === 'STAT') {
                $subject = 'Statistics';
                $division = ($srNo <= 190) ? 'A' : 'B';
            } else if ($subjectCode === 'BA') {
                $subject = 'Business Administration';
                if ($srNo >= 351 && $srNo <= 400) $division = 'B';
                else if ($srNo >= 401 && $srNo <= 590) $division = 'C';
                else if ($srNo >= 591 && $srNo <= 780) $division = 'D';
                else $division = 'E';
            } else if ($subjectCode === 'CA') {
                $subject = 'Computer Applications';
                $division = ($srNo >= 901 && $srNo <= 1020) ? 'E' : 'F';
            }
            
            $gender = 'Male';
            $nameLower = strtolower($name);
            if (
                preg_match('/(ben|kumari|a|i|y)$/i', $nameLower) ||
                strpos($nameLower, 'kumari') !== false ||
                strpos($nameLower, 'devi') !== false ||
                strpos($nameLower, 'ba') !== false
            ) {
                if (!preg_match('/(kumar|sinh|bhai|ji)$/i', $nameLower)) {
                    $gender = 'Female';
                }
            }
            
            $baselineFee = ($gender === 'Female') ? 5000 : 6000;
            
            $insertUser->execute([
                $username, $password, 'student', $name,
                "{$username}@tolani.edu",
                "+91 99000 0" . str_pad($username, 4, '0', STR_PAD_LEFT),
                $gender, 'General', $subject, 'B.Com. Sem-I', 'Commerce Department',
                $division, $program, $year, $semester, $baselineFee, 0, $baselineFee
            ]);
            $count++;
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => "Successfully imported $count students to B.Com Regular Sem 1."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Import failed: ' . $e->getMessage()]);
    }
    exit;
}

if ($route === 'admin/import-sem3-sem5' && $method === 'POST') {
    $filePathSem3 = __DIR__ . '/bcom_regular_sem3.txt';
    $filePathSem5 = __DIR__ . '/bcom_regular_sem5.txt';
    
    if (!file_exists($filePathSem3) || !file_exists($filePathSem5)) {
        http_response_code(400);
        echo json_encode(['error' => 'Roster files not found.']);
        exit;
    }
    
    $pdo->beginTransaction();
    try {
        $insertUser = $pdo->prepare("
            INSERT INTO users (
                username, password, role, name, email, phone, gender, category, 
                subject, class, department, division, program, year, semester, 
                fee_due, fee_paid, fee_total
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ");
        
        $program = "B.Com (Regular)";
        $countSem3 = 0;
        $countSem5 = 0;
        
        // 1. Process Semester 3
        $linesSem3 = explode("\n", trim(file_get_contents($filePathSem3)));
        foreach ($linesSem3 as $line) {
            $parts = preg_split('/\s+/', trim($line));
            if (count($parts) < 4) continue;
            
            $rollNo = (int)$parts[0];
            $enrollmentNo = $parts[1];
            $spdid = $parts[2];
            $name = implode(' ', array_slice($parts, 3));
            
            $username = $spdid;
            $password = $spdid;
            
            $division = 'A';
            if ($rollNo >= 1 && $rollNo <= 190) $division = 'A';
            else if (($rollNo >= 191 && $rollNo <= 322) || ($rollNo >= 401 && $rollNo <= 450)) $division = 'B';
            else if ($rollNo >= 451 && $rollNo <= 640) $division = 'C';
            else if ($rollNo >= 641 && $rollNo <= 830) $division = 'D';
            else if ($rollNo >= 831 && $rollNo <= 1021) $division = 'E';
            
            $gender = 'Male';
            $nameLower = strtolower($name);
            if (
                preg_match('/(ben|kumari|a|i|y)$/i', $nameLower) ||
                strpos($nameLower, 'kumari') !== false ||
                strpos($nameLower, 'devi') !== false ||
                strpos($nameLower, 'ba') !== false
            ) {
                if (!preg_match('/(kumar|sinh|bhai|ji)$/i', $nameLower)) {
                    $gender = 'Female';
                }
            }
            
            $baselineFee = ($gender === 'Female') ? 5000 : 6000;
            
            $insertUser->execute([
                $username, $password, 'student', $name,
                "{$username}@tolani.edu",
                "+91 99000 0" . str_pad((string)$rollNo, 4, '0', STR_PAD_LEFT),
                $gender, 'General', 'Commerce', 'B.Com. Sem-III', 'Commerce Department',
                $division, $program, '2nd Year', 'Semester 3', $baselineFee, 0, $baselineFee
            ]);
            $countSem3++;
        }
        
        // 2. Process Semester 5
        $linesSem5 = explode("\n", trim(file_get_contents($filePathSem5)));
        foreach ($linesSem5 as $line) {
            $parts = preg_split('/\s+/', trim($line));
            if (count($parts) < 4) continue;
            
            $rollNo = (int)$parts[0];
            $enrollmentNo = $parts[1];
            $spdid = $parts[2];
            $name = implode(' ', array_slice($parts, 3));
            
            $username = $spdid;
            $password = $spdid;
            
            $division = 'A';
            if ($rollNo >= 1 && $rollNo <= 200) $division = 'A';
            else if (($rollNo >= 201 && $rollNo <= 307) || ($rollNo >= 351 && $rollNo <= 500)) $division = 'B';
            else if ($rollNo >= 501 && $rollNo <= 725) $division = 'C';
            else if ($rollNo >= 726 && $rollNo <= 954) $division = 'D';
            
            $gender = 'Male';
            $nameLower = strtolower($name);
            if (
                preg_match('/(ben|kumari|a|i|y)$/i', $nameLower) ||
                strpos($nameLower, 'kumari') !== false ||
                strpos($nameLower, 'devi') !== false ||
                strpos($nameLower, 'ba') !== false
            ) {
                if (!preg_match('/(kumar|sinh|bhai|ji)$/i', $nameLower)) {
                    $gender = 'Female';
                }
            }
            
            $baselineFee = ($gender === 'Female') ? 5000 : 6000;
            
            $insertUser->execute([
                $username, $password, 'student', $name,
                "{$username}@tolani.edu",
                "+91 98000 0" . str_pad((string)$rollNo, 4, '0', STR_PAD_LEFT),
                $gender, 'General', 'Commerce', 'B.Com. Sem-V', 'Commerce Department',
                $division, $program, '3rd Year', 'Semester 5', $baselineFee, 0, $baselineFee
            ]);
            $countSem5++;
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => "Successfully imported $countSem3 Sem 3 students and $countSem5 Sem 5 students."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Import failed: ' . $e->getMessage()]);
    }
    exit;
}

if ($route === 'admin/import-prof-sem3-sem5' && $method === 'POST') {
    $filePathSem3 = __DIR__ . '/bcom_prof_sem3_raw.txt';
    $filePathSem5 = __DIR__ . '/bcom_prof_sem5_raw.txt';
    
    if (!file_exists($filePathSem3) || !file_exists($filePathSem5)) {
        http_response_code(400);
        echo json_encode(['error' => 'Roster files not found.']);
        exit;
    }
    
    $pdo->beginTransaction();
    try {
        $insertUser = $pdo->prepare("
            INSERT INTO users (
                username, password, role, name, email, phone, gender, category, 
                subject, class, department, division, program, year, semester, 
                fee_due, fee_paid, fee_total
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ");
        
        $feeBoy = 9500;
        $feeGirl = 8500;
        $stmt = $pdo->query("SELECT value FROM settings WHERE `key` = 'fee_baseline_bcom_professional_boy'");
        $val = $stmt->fetchColumn();
        if ($val) $feeBoy = (double)$val;
        $stmt = $pdo->query("SELECT value FROM settings WHERE `key` = 'fee_baseline_bcom_professional_girl'");
        $val = $stmt->fetchColumn();
        if ($val) $feeGirl = (double)$val;
        
        $program = "B.Com (Professional)";
        $countSem3 = 0;
        $countSem5 = 0;
        
        // 1. Process Semester 3
        $linesSem3 = explode("\n", trim(file_get_contents($filePathSem3)));
        foreach ($linesSem3 as $line) {
            $parts = preg_split('/\s+/', trim($line));
            if (count($parts) < 7) continue;
            
            $rollNo = (int)$parts[0];
            $enrollmentNo = $parts[1];
            $spdid = $parts[2];
            $gender = $parts[3];
            $category = $parts[count($parts) - 1];
            $phone = $parts[count($parts) - 2];
            $email = $parts[count($parts) - 3];
            
            $nameParts = array_slice($parts, 4, count($parts) - 7);
            $name = implode(' ', $nameParts);
            
            $username = $spdid;
            $password = $spdid;
            $division = 'A';
            $subject = 'Commerce';
            
            $baselineFee = ($gender === 'Female') ? $feeGirl : $feeBoy;
            
            $insertUser->execute([
                $username, $password, 'student', $name, $email, $phone,
                $gender, $category, $subject, 'B.Com. Prof. Sem-III', 'Commerce Department',
                $division, $program, '2nd Year', 'Semester 3', $baselineFee, 0, $baselineFee
            ]);
            $countSem3++;
        }
        
        // 2. Process Semester 5
        $linesSem5 = explode("\n", trim(file_get_contents($filePathSem5)));
        foreach ($linesSem5 as $line) {
            $parts = preg_split('/\s+/', trim($line));
            if (count($parts) < 6) continue;
            
            $rollNo = (int)$parts[0];
            $spdid = $parts[1];
            $gender = $parts[2];
            $category = $parts[3];
            $phone = $parts[count($parts) - 1];
            $email = $parts[count($parts) - 2];
            
            $nameParts = array_slice($parts, 4, count($parts) - 6);
            $name = implode(' ', $nameParts);
            
            $username = $spdid;
            $password = $spdid;
            $division = 'A';
            $subject = 'Commerce';
            
            $baselineFee = ($gender === 'Female') ? $feeGirl : $feeBoy;
            
            $insertUser->execute([
                $username, $password, 'student', $name, $email, $phone,
                $gender, $category, $subject, 'B.Com. Prof. Sem-V', 'Commerce Department',
                $division, $program, '3rd Year', 'Semester 5', $baselineFee, 0, $baselineFee
            ]);
            $countSem5++;
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => "Successfully imported $countSem3 Sem 3 students and $countSem5 Sem 5 students for Professional program."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Import failed: ' . $e->getMessage()]);
    }
    exit;
}

// Fallback: 404 Route Not Found
http_response_code(404);
echo json_encode(['success' => false, 'error' => 'API Route not found: ' . $route]);
exit;
