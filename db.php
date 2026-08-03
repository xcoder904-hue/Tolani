<?php
// db.php - MySQL Database Connection Configuration using PDO

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$db   = getenv('DB_NAME') ?: 'edusphere';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;port=$port;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
     // Return JSON error response if database connection fails
     header('Content-Type: application/json');
     http_response_code(500);
     echo json_encode([
          'success' => false,
          'error' => 'Database connection failed: ' . $e->getMessage()
      ]);
     exit;
}

// Helper function to calculate distance using Haversine formula
function getDistanceKm($lat1, $lon1, $lat2, $lon2) {
    $R = 6371; // Earth radius in km
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * 
         sin($dLon / 2) * sin($dLon / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $R * $c;
}

// Helper function to emulate JS djb2 15-second hashing for OTP codes
function get15SecondHash($secretKey, $timeWindow) {
    $input = $secretKey . "_" . $timeWindow;
    $hash = 5381;
    for ($i = 0; $i < strlen($input); $i++) {
        $hash = (($hash * 33) & 0xFFFFFFFF) + ord($input[$i]);
        $hash = $hash & 0xFFFFFFFF;
    }
    $num = ($hash % 900000) + 100000;
    return (string)$num;
}
