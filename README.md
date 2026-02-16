# Lab Inventory System

研究室の備品・消耗品を管理するための Web アプリケーションです。  
シリアル管理、貸出/返却、長期未更新一覧、ユーザ管理をブラウザから操作できます。

## 技術スタック

- API: Node.js + TypeScript + Fastify + Prisma + PostgreSQL
- Web: React + Vite + TypeScript
- Infra (dev): Docker Compose (PostgreSQL / MinIO)

## 主な機能（現状）

### API

- シリアル予約: `POST /serials/reserve?type=ASSET|CONSUMABLE`
- 備品登録: `POST /assets`
- 備品編集: `PUT /assets/:id`（シリアルは更新不可）
- 貸出: `POST /assets/:id/checkout`
- 返却: `POST /assets/:id/checkin`
- 移動: `POST /assets/:id/move`
- 備品検索: `GET /assets`
- 長期未更新一覧: `GET /stale?days=180&type=ASSET|CONSUMABLE|ALL`
- 統計: `GET /stats?staleDays=180`
- ユーザ一覧/登録: `GET /users`, `POST /users`
- ユーザ別貸出一覧: `GET /users/:id/assets`
- カテゴリ候補: `GET /asset-categories`
- 予算候補: `GET /asset-budgets`

### Web

- Home ダッシュボード（統計・検索導線・運用アクション）
- 物品一覧ページ
- 検索結果ページ（編集/貸出/返却導線）
- 長期未更新一覧ページ
- 備品の新規登録/編集ページ
  - カテゴリ: 選択式 + 新規追加
  - 予算: 選択式 + 新規追加
- ユーザ管理ページ（登録 + ユーザ別貸出中一覧）

## リポジトリ構成

```text
lab-inventory/
  docker/
    docker-compose.dev.yml
  apps/
    api/
      prisma/
      src/
    web/
      src/
```

## ローカル開発手順

### 1. 依存

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

## Proxmox LXC での構築手順

### 1. LXC 作成

- テンプレート: Ubuntu 22.04 または Debian 12
- 推奨: 2 vCPU / 4GB RAM / 20GB+

### 2. LXC 設定（Docker 用）

Proxmox ホストで `/etc/pve/lxc/<CTID>.conf` に以下を設定:

```conf
features: nesting=1,keyctl=1
```

必要に応じて:

```conf
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: a
lxc.mount.auto: proc:rw sys:rw
```

設定後、コンテナを再起動。

### 3. コンテナ内セットアップ

```bash
apt update && apt -y upgrade
apt install -y git curl ca-certificates gnupg lsb-release docker.io docker-compose-plugin
systemctl enable --now docker
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### 4. アプリ配置と起動

```bash
cd /opt
git clone https://github.com/k-kawaguchi-0124/lab-inventory.git
cd lab-inventory
docker compose -f docker/docker-compose.dev.yml up -d
```

以降は「ローカル開発手順」の API/Web 起動手順と同じです。

## 主要 API エンドポイント（抜粋）

```text
GET  /health
GET  /stats?staleDays=180
GET  /stale?days=180&type=ASSET

POST /serials/reserve?type=ASSET
POST /assets
PUT  /assets/:id
GET  /assets?query=...
POST /assets/:id/checkout
POST /assets/:id/checkin
POST /assets/:id/move

GET  /users
POST /users
GET  /users/:id/assets

GET  /asset-categories
GET  /asset-budgets
```

## 補足

- Web 開発時は Vite proxy により `/api/*` が `http://localhost:3000` に転送されます。
- Preview/本番向けには `VITE_API_BASE` で API 接続先を指定できます（`apps/web/src/lib/api.ts`）。
