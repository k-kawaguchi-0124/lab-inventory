# Apache + PHP + MariaDB 移行仕様（ドラフト）

## 目的

既存の `Node.js + Prisma + PostgreSQL` 構成を、`Apache + PHP + MariaDB` で運用できる構成へ段階移行する。

## 方針

1. 既存機能を API 互換で PHP 側へ順次移植
2. Web 側の API 呼び出しパスは維持（`/api/...`）
3. Apache を前段に置き、`/api` を PHP 実装へルーティング
4. 既存 Node API は並行稼働して比較検証する

## 構成（移行後）

- Apache: 80/443 受け口
- PHP API: Apache + PHP-FPM
- DB: MariaDB
- Web: React build (`apps/web/dist`) を Apache で静的配信

## API 移行優先順位

1. 基本監視
- `GET /health`
- `GET /stats`
- `GET /stale`

2. マスタ
- `GET /masters`
- `POST/PUT/DELETE /masters/...`
- `GET /asset-categories`
- `GET /asset-budgets`
- `GET /consumable-categories`

3. 備品
- `GET /assets`
- `GET /assets/:id`
- `POST /assets`
- `PUT /assets/:id`
- `DELETE /assets/:id`
- `POST /assets/:id/checkout`
- `POST /assets/:id/checkin`

4. 消耗品
- `GET /consumables`
- `POST /consumables`
- `POST /consumables/:id/adjust`

5. ユーザ
- `GET /users`
- `POST /users`
- `DELETE /users/:id`
- `GET /users/:id/assets`

## DB 移行

- 新規 MariaDB スキーマを `apps/api-php/sql/schema.sql` に定義
- 既存 PostgreSQL データは CSV 経由で段階移行
- ID 型は MariaDB 側で `BIGINT UNSIGNED` に統一

## Apache 設定イメージ

```apache
<VirtualHost *:80>
    ServerName inventory.example.local

    DocumentRoot /opt/lab-inventory/apps/web/dist

    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/api/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:9000/
    ProxyPassReverse /api http://127.0.0.1:9000/
</VirtualHost>
```

## 完了条件

- 主要機能の API 互換確認（Web 操作が全て成功）
- `/health`, `/stats`, `/stale`, `/masters`, `/assets`, `/consumables`, `/users` の疎通
- 運用手順を README に反映

