<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private PDO $pdo;

    private function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public static function fromEnv(): self
    {
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $port = getenv('DB_PORT') ?: '3306';
        $name = getenv('DB_NAME') ?: 'lab_inventory';
        $user = getenv('DB_USER') ?: 'lab';
        $pass = getenv('DB_PASSWORD') ?: 'lab';

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);

        try {
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            return new self($pdo);
        } catch (PDOException $e) {
            throw new RuntimeException('Database connection failed', 0, $e);
        }
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }
}
