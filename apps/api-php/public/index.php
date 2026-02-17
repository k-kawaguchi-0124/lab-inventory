<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Database.php';

use App\Database;

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Apache reverse proxy で /api プレフィックスが付く場合を吸収
if (str_starts_with($path, '/api/')) {
    $path = substr($path, 4);
} elseif ($path === '/api') {
    $path = '/';
}

function sendJson(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function sendList(array $rows, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
    exit;
}

function sendError(string $message, int $status = 400): void
{
    sendJson(['error' => $message], $status);
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        sendError('Invalid JSON body.', 400);
    }
    return $decoded;
}

try {
    $db = Database::fromEnv();
    $pdo = $db->pdo();

    if ($method === 'GET' && $path === '/health') {
        sendJson(['ok' => true]);
    }

    if ($method === 'GET' && $path === '/version') {
        sendJson([
            'runtime' => 'php',
            'database' => 'mariadb',
            'api' => 'lab-inventory-php',
        ]);
    }

    if ($method === 'GET' && $path === '/users') {
        $stmt = $pdo->query('SELECT id, name, role FROM users ORDER BY name ASC LIMIT 200');
        $rows = $stmt->fetchAll();

        $items = array_map(static function (array $r): array {
            return [
                'id' => (string)$r['id'],
                'name' => (string)$r['name'],
                'role' => (string)$r['role'],
            ];
        }, $rows);

        sendList($items);
    }

    if ($method === 'POST' && $path === '/users') {
        $body = readJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        $role = (string)($body['role'] ?? 'MEMBER');

        if ($name === '') {
            sendError('name is required.', 400);
        }
        if ($role !== 'ADMIN' && $role !== 'MEMBER') {
            sendError('role must be ADMIN or MEMBER.', 400);
        }

        $stmt = $pdo->prepare('INSERT INTO users(name, role) VALUES(:name, :role)');
        $stmt->execute([
            ':name' => $name,
            ':role' => $role,
        ]);

        $id = (string)$pdo->lastInsertId();
        $createdStmt = $pdo->prepare('SELECT id, name, role, created_at FROM users WHERE id = :id');
        $createdStmt->execute([':id' => $id]);
        $created = $createdStmt->fetch();

        sendJson([
            'id' => (string)$created['id'],
            'name' => (string)$created['name'],
            'role' => (string)$created['role'],
            'createdAt' => (string)$created['created_at'],
        ], 201);
    }

    if ($method === 'GET' && $path === '/assets') {
        $query = trim((string)($_GET['query'] ?? ''));
        $status = trim((string)($_GET['status'] ?? ''));
        $take = (int)($_GET['take'] ?? 50);
        if ($take < 1) $take = 1;
        if ($take > 200) $take = 200;

        $where = [];
        $params = [];

        if ($status !== '') {
            $where[] = 'a.status = :status';
            $params[':status'] = $status;
        }

        if ($query !== '') {
            $where[] = '(a.serial LIKE :q OR a.name LIKE :q OR a.category LIKE :q OR a.budget_code LIKE :q)';
            $params[':q'] = '%' . $query . '%';
        }

        $sql = 'SELECT
                a.id,
                a.serial,
                a.name,
                a.category,
                a.status,
                a.budget_code,
                a.purchased_at,
                a.last_activity_at,
                a.current_location_id,
                a.current_user_id,
                l.id AS location_id,
                l.name AS location_name,
                u.id AS user_id,
                u.name AS user_name
            FROM assets a
            LEFT JOIN locations l ON l.id = a.current_location_id
            LEFT JOIN users u ON u.id = a.current_user_id';

        if (count($where) > 0) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $sql .= ' ORDER BY a.updated_at DESC LIMIT :take';

        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':take', $take, PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll();

        $items = array_map(static function (array $r): array {
            return [
                'id' => (string)$r['id'],
                'serial' => (string)$r['serial'],
                'name' => (string)$r['name'],
                'category' => (string)$r['category'],
                'status' => (string)$r['status'],
                'budgetCode' => $r['budget_code'] !== null ? (string)$r['budget_code'] : null,
                'purchasedAt' => $r['purchased_at'] !== null ? (string)$r['purchased_at'] : null,
                'lastActivityAt' => (string)$r['last_activity_at'],
                'currentLocationId' => (string)$r['current_location_id'],
                'currentUserId' => $r['current_user_id'] !== null ? (string)$r['current_user_id'] : null,
                'currentLocation' => $r['location_id'] !== null
                    ? [
                        'id' => (string)$r['location_id'],
                        'name' => (string)$r['location_name'],
                    ]
                    : null,
                'currentUser' => $r['user_id'] !== null
                    ? [
                        'id' => (string)$r['user_id'],
                        'name' => (string)$r['user_name'],
                    ]
                    : null,
            ];
        }, $rows);

        sendList($items);
    }

    sendError('Not Found', 404);
} catch (Throwable $e) {
    sendError('Internal Server Error', 500);
}
