# Lab Inventory System

研究室の備品・消耗品を管理するためのWebシステムです。

---

# 🛠 開発環境（MacBook向けセットアップ手順）

この手順どおりに進めれば、ローカル環境でAPIとDBを起動できます。

---

# 0. 事前準備

以下をインストールしてください。

## 必須

- Node.js（LTS推奨）
  https://nodejs.org/

- Docker Desktop for Mac
  https://www.docker.com/products/docker-desktop/

- Git
  https://git-scm.com/

インストール後、以下で確認できます：

```bash
node -v
npm -v
docker -v
git -v
```

---

# 1. リポジトリを取得

```bash
git clone https://github.com/あなたのアカウント/lab-inventory.git
cd lab-inventory
```

---

# 2. Dockerを起動

Docker Desktop を起動してください。

起動確認：

```bash
docker info
```

---

# 3. データベースとMinIOを起動

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

起動確認：

```bash
docker compose -f docker/docker-compose.dev.yml ps
```

以下のように `db` と `minio` が `Up` になっていればOKです。

---

# 4. APIのセットアップ

```bash
cd apps/api
npm install
```

---

# 5. 環境変数を設定

`.env` ファイルを作成します。

```bash
cp .env.example .env 2>/dev/null || true
```

`.env` の中身を以下にしてください：

```env
DATABASE_URL="postgresql://postgres:example@localhost:5432/labinv?schema=public"
```

---

# 6. PrismaでDBを初期化

```bash
npx prisma db push
```

以下のように表示されれば成功です：

```
The database is already in sync with the Prisma schema.
```

---

# 7. APIを起動

```bash
npm run dev
```

ブラウザで以下を開いてください：

http://localhost:3000/health

以下が表示されれば成功です：

```
{"ok":true}
```

---

# 📁 ディレクトリ構成

```
lab-inventory/
  docker/
    docker-compose.dev.yml
  apps/
    api/
      prisma/
      src/
      package.json
```

---

# 🔄 開発時の基本コマンド

## DBを起動

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

## APIを起動

```bash
cd apps/api
npm run dev
```

## DBを停止

```bash
docker compose -f docker/docker-compose.dev.yml down
```

---

# ⚠️ よくあるトラブル

## ポート5432が使用中

ローカルにPostgreSQLが入っている場合は停止してください。

---

## DB接続エラー

- Dockerが起動しているか確認
- `docker compose ps` で `db` がUpか確認
- `.env` の DATABASE_URL が正しいか確認

---

# 🚀 今後の予定

- Prismaスキーマ拡張（備品/消耗品/写真/履歴）
- シリアル自動採番実装
- 貸出・返却API実装
- フロントエンド実装

---

# 👥 チーム開発ルール（簡易版）

- mainブランチには直接pushしない
- feature/◯◯ ブランチを作る
- Pull Requestを出してレビュー後にマージ

---

以上で開発環境構築は完了です。
