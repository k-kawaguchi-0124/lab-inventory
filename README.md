# Lab Inventory System

研究室の備品・消耗品を管理するためのWebアプリケーションです。

---

# 🚀 現在の機能

## API (Fastify + Prisma)

- シリアル自動採番（予約）
- 備品登録
- 貸出 (checkout)
- 返却 (checkin)
- 移動 (move)
- 検索 API
- 半年未更新（滞留）一覧 API

## Web (React + Vite)

- 滞留一覧表示
- days / type フィルタ
- 更新ボタン

---

# 🧰 開発環境

## 必要なもの

- Node.js (LTS)
- Docker Desktop
- Git

---

# 📦 初回セットアップ（Mac / WSL 共通）

## 1. リポジトリ取得

```bash
git clone https://github.com/あなたのアカウント/lab-inventory.git
cd lab-inventory
```

---

## 2. DB起動

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

確認：

```bash
docker compose -f docker/docker-compose.dev.yml ps
```

---

## 3. APIセットアップ

```bash
cd apps/api
npm install
```

### 環境変数

`.env` を作成：

```env
DATABASE_URL="postgresql://postgres:example@localhost:5432/labinv?schema=public"
```

### DBマイグレーション

```bash
npx prisma migrate dev
npx prisma db seed
```

### API起動

```bash
npm run dev
```

→ http://localhost:3000/health

---

## 4. Webセットアップ

別ターミナルで：

```bash
cd apps/web
npm install
npm run dev
```

→ http://localhost:5173

---

# 🔎 API一覧

## シリアル予約

```
POST /serials/reserve?type=ASSET
```

## 備品登録

```
POST /assets
```

## 貸出

```
POST /assets/:id/checkout
```

## 返却

```
POST /assets/:id/checkin
```

## 移動

```
POST /assets/:id/move
```

## 検索

```
GET /assets?query=XXXX
```

## 滞留一覧

```
GET /stale?days=180&type=ASSET
```

---

# 📁 ディレクトリ構成

```
lab-inventory/
  docker/
  apps/
    api/
      prisma/
      src/
    web/
```

---

# 🛣 今後の予定

- 消耗品 CRUD
- 写真アップロード (MinIO)
- 詳細ページ
- 認証（ユーザー管理）
- PWA対応（スマホ最適化）
- 通知UI（未確認バッジ）

---

# 👥 開発ルール

- main 直push禁止
- feature/xxx ブランチで作業
- Pull Requestでレビュー後マージ

---

以上。
