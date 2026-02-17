# API (PHP + MariaDB) Draft

このディレクトリは `Apache + PHP + MariaDB` 向けに移行するための新API実装の土台です。

## 現在の状態

- ルーティングの最小実装
  - `GET /health`
  - `GET /version`
  - `GET /users`
  - `POST /users`
  - `GET /assets`
- MariaDB 接続クラス（PDO）
- MariaDB 用のドラフトスキーマ（`sql/schema.sql`）

## 起動（開発）

```bash
cd apps/api-php
php -S 0.0.0.0:3001 -t public
```

確認:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/version
```

## 環境変数

- `DB_HOST` (default: `127.0.0.1`)
- `DB_PORT` (default: `3306`)
- `DB_NAME` (default: `lab_inventory`)
- `DB_USER` (default: `lab`)
- `DB_PASSWORD` (default: `lab`)

## 重要

この実装は移行開始時点の雛形です。既存 Node.js API の全エンドポイント互換には未到達です。
