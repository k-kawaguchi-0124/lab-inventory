# Lab Inventory System

研究室の備品・消耗品を管理する Web アプリケーションです。  
シリアルのみを物品に貼り、Web から検索・貸出/返却・編集・在庫更新を行います。

## 技術スタック

- API: Node.js + TypeScript + Fastify + Prisma + PostgreSQL
- Web: React + Vite + TypeScript
- Infra (dev): Docker Compose (PostgreSQL / MinIO)

## Apache + PHP + MariaDB への移行ブランチについて

このブランチ（`feature/php-apache-mariadb-migration`）では、Apache/PHP/MariaDB 運用へ移行するための土台を追加しています。

- 仕様書: `docs/php-mariadb-migration-spec.md`
- PHP API 雛形: `apps/api-php/`
- MariaDB スキーマ案: `apps/api-php/sql/schema.sql`

## 主な機能（最新版）

### 備品（Asset）

- シリアル予約: `POST /serials/reserve?type=ASSET`
- 登録: `POST /assets`
- 編集: `PUT /assets/:id`（シリアルは編集不可）
- 削除: `DELETE /assets/:id`（貸出中は削除不可）
- 貸出: `POST /assets/:id/checkout`
- 返却: `POST /assets/:id/checkin`
- 移動: `POST /assets/:id/move`（APIは維持）
- 検索/一覧: `GET /assets`

### 消耗品（Consumable）

- シリアル予約: `POST /serials/reserve?type=CONSUMABLE`
- 登録: `POST /consumables`
- 在庫一覧: `GET /consumables`
- 在庫増減: `POST /consumables/:id/adjust`
  - 数量は整数（小数なし）
  - `+/-` ボタンで直接更新
  - 0 でもデータは残る

### 長期未更新

- 一覧: `GET /stale?days=180&type=ASSET|CONSUMABLE|ALL`
- 統計: `GET /stats?staleDays=180`

### ユーザ

- 一覧/登録/削除: `GET /users`, `POST /users`, `DELETE /users/:id`
- ユーザ別貸出一覧: `GET /users/:id/assets`
- `SYSTEM` ユーザは内部用（UI非表示・削除不可）

### マスタ管理

- 画面: `/masters`
- 管理対象:
  - 備品カテゴリ
  - 備品予算
  - 消耗品カテゴリ
  - 保管場所
- 追加/名称変更/削除（使用中は削除不可）

## UI 方針（現在）

- トップナビ順: `物品一覧 / 新規登録 / 消耗品 / 長期未更新 / ユーザ / マスタ管理`
- 新規追加系（カテゴリ/予算/保管場所）は通常非表示
- 各入力欄の下に `＋ 新しい...を追加` を配置し、必要時のみ展開

## リポジトリ構成

```text
lab-inventory/
  docker/
    docker-compose.dev.yml
  deploy/
    systemd/
  apps/
    api/
      prisma/
      src/
    web/
      src/
```

## ローカル開発手順

### 1. 必要ソフト

- Node.js 20 以上
- Docker / Docker Compose
- Git

### 2. 取得

```bash
git clone https://github.com/k-kawaguchi-0124/lab-inventory.git
cd lab-inventory
```

### 3. DB / MinIO 起動

```bash
docker compose -f docker/docker-compose.dev.yml up -d
docker compose -f docker/docker-compose.dev.yml ps
```

### 4. API セットアップ

```bash
cd apps/api
npm install
```

`apps/api/.env` を作成:

```env
DATABASE_URL="postgresql://lab:lab@localhost:5432/lab_inventory"
```

Prisma 適用:

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

API 起動:

```bash
npm run dev
```

確認:

```bash
curl http://localhost:3000/health
```

### 5. Web セットアップ

別ターミナル:

```bash
cd apps/web
npm install
npm run dev -- --host 0.0.0.0
```

アクセス:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## systemd で常駐運用

`deploy/systemd` にユニットと補助スクリプトを用意しています。

### サービス導入

```bash
cd /opt/lab-inventory
./deploy/systemd/install-services.sh
```

### 起動/停止

```bash
sudo systemctl start lab-inventory-api.service
sudo systemctl start lab-inventory-web.service

sudo systemctl stop lab-inventory-api.service
sudo systemctl stop lab-inventory-web.service
```

### 状態/ログ確認

```bash
systemctl status lab-inventory-api.service --no-pager
systemctl status lab-inventory-web.service --no-pager

journalctl -u lab-inventory-api.service -f
journalctl -u lab-inventory-web.service -f
```

### 更新反映（推奨）

```bash
cd /opt/lab-inventory
./deploy/systemd/update-and-restart.sh
```

このスクリプトは以下を実行します。

- `git fetch` / `git pull --ff-only`
- API/Web の依存更新
- `npx prisma migrate deploy`
- API/Web サービス再起動

## Git 更新をサーバへ反映する手順

### A. 開発PC側

```bash
cd <your-local-repo>/lab-inventory
git add -A
git commit -m "your message"
git push origin main
```

### B. サーバ側

```bash
cd /opt/lab-inventory
./deploy/systemd/update-and-restart.sh
```

### C. 反映確認

```bash
curl http://localhost:3000/health
curl -i http://localhost:3000/masters
systemctl status lab-inventory-api.service --no-pager
systemctl status lab-inventory-web.service --no-pager
```

## トラブルシュート

### `/masters` が HTTP 500

多くは DB マイグレーション未適用です。

```bash
cd /opt/lab-inventory/apps/api
npx prisma migrate deploy
npx prisma generate
sudo systemctl restart lab-inventory-api.service
```

### Prisma: `DATABASE_URL` がない

`apps/api/.env` に `DATABASE_URL` を設定してください。

### DB 認証エラー（P1000）

- `DATABASE_URL` のユーザ/パスワードを確認
- `docker compose -f docker/docker-compose.dev.yml up -d` でDBが起動しているか確認

### APIが起動していない（Connection refused）

```bash
systemctl status lab-inventory-api.service --no-pager
journalctl -u lab-inventory-api.service -n 200 --no-pager
ss -ltnp | grep 3000
```

## API エンドポイント（抜粋）

```text
GET  /health
GET  /stats?staleDays=180
GET  /stale?days=180&type=ASSET

POST /serials/reserve?type=ASSET
POST /serials/reserve?type=CONSUMABLE

POST   /assets
PUT    /assets/:id
DELETE /assets/:id
GET    /assets?query=...
POST   /assets/:id/checkout
POST   /assets/:id/checkin
POST   /assets/:id/move

POST /consumables
GET  /consumables
POST /consumables/:id/adjust

GET    /users
POST   /users
DELETE /users/:id
GET    /users/:id/assets

GET /asset-categories
GET /asset-budgets
GET /consumable-categories

GET    /masters
POST   /masters/asset-categories
PUT    /masters/asset-categories
DELETE /masters/asset-categories/:name
POST   /masters/asset-budgets
PUT    /masters/asset-budgets
DELETE /masters/asset-budgets/:name
POST   /masters/consumable-categories
PUT    /masters/consumable-categories
DELETE /masters/consumable-categories/:name
POST   /masters/locations
PUT    /masters/locations/:id
DELETE /masters/locations/:id
```

## 補足

- Web 開発時は Vite proxy により `/api/*` が `http://localhost:3000` に転送されます。
- 本番運用は Vite dev サーバ直公開ではなく、前段リバースプロキシ（Nginx/Apache）を推奨します。
- API の `SYSTEM` ユーザ（`system@local`）は起動時に自動作成されます。

### `/xxxx/` 配下での運用（Apache サブパス）

`https://example.com/xxxx/` で配信する場合は、Webビルド時にベースパスを指定してください。

```bash
cd apps/web
VITE_APP_BASE=/xxxx/ npm run build
```

API はデフォルトで `/xxxx/api` を参照します（`VITE_API_BASE` 未指定時）。

Apache 側は以下の2点を設定します。

- `/xxxx` を `apps/web/dist` に向ける（SPA fallbackあり）
- `/xxxx/api` を `http://127.0.0.1:3000/` へ `ProxyPass`
