import Fastify from "fastify";
import { PrismaClient, TargetType, ActionType } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

async function getSystemUserId() {
  const system = await prisma.user.findUnique({
    where: { email: "system@local" },
    select: { id: true },
  });
  if (!system) {
    throw new Error('SYSTEM user not found. Run "npx prisma db seed".');
  }
  return system.id;
}


/**
 * チェック桁（簡易）
 * - 数字列の各桁を足して 10 で割った余り
 * - 入力ミス検出の最低限
 */
function calcCheckDigit(num: string) {
  let sum = 0;
  for (const ch of num) sum += Number(ch);
  return String(sum % 10);
}

/**
 * シリアル形式（例）
 * - prefix(2桁年) + 6桁連番 + "-" + チェック桁
 *   例: 26000001-7
 */
function formatSerial(prefix: string, seq: number) {
  const body = `${prefix}${String(seq).padStart(6, "0")}`;
  return `${body}-${calcCheckDigit(body)}`;
}

app.get("/health", async () => ({ ok: true }));

/**
 * シリアル予約
 * POST /serials/reserve?type=ASSET|CONSUMABLE
 * - 予約期限: 15分
 */
app.post("/serials/reserve", async (req, reply) => {
  const q = z.object({ type: z.enum(["ASSET", "CONSUMABLE"]) }).parse(req.query);

  // 年度prefixはひとまず「西暦下2桁」
  const year2 = String(new Date().getFullYear()).slice(-2);
  const prefix = `${q.type}-${year2}`; // counter用（タイプ別に衝突しない）

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    // counter を行ロック的に更新
    const counter = await tx.serialCounter.upsert({
      where: { prefix },
      create: { prefix, nextValue: 1 },
      update: {},
    });

    const seq = counter.nextValue;

    // 次回用にインクリメント
    await tx.serialCounter.update({
      where: { prefix },
      data: { nextValue: seq + 1 },
    });

    const serial = formatSerial(year2, seq);

    // 予約を作成（既にあれば例外になる）
    await tx.serialReservation.create({
      data: {
        serial,
        type: q.type as TargetType,
        // 認証未実装なので仮の user を作らず、reservedBy に固定値
        // 将来ログイン導入後、req.user.id に置き換え
        reservedBy: await getSystemUserId(),
        expiresAt,
      },
    });

    return { serial, expiresAt };
  });

  return reply.send(result);
});

/**
 * 備品作成
 * POST /assets
 * body: serial, name, category, locationId, note?
 */
app.post("/assets", async (req, reply) => {
  const body = z
    .object({
      serial: z.string().min(3),
      name: z.string().min(1),
      category: z.string().min(1),
      locationId: z.string().min(1),
      note: z.string().optional(),
    })
    .parse(req.body);

  // 予約確認（期限切れ or type違いを弾く）
  const reservation = await prisma.serialReservation.findUnique({
    where: { serial: body.serial },
  });

  if (!reservation) {
    return reply.status(400).send({ error: "Serial is not reserved." });
  }
  if (reservation.type !== TargetType.ASSET) {
    return reply.status(400).send({ error: "Serial type mismatch." });
  }
  if (reservation.expiresAt.getTime() < Date.now()) {
    return reply.status(400).send({ error: "Serial reservation expired." });
  }

  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.asset.create({
      data: {
        serial: body.serial,
        name: body.name,
        category: body.category,
        currentLocationId: body.locationId,
        note: body.note,
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        actorId: await getSystemUserId(),
        targetType: TargetType.ASSET,
        targetId: created.id,
        action: ActionType.CREATE,
        note: "created",
      },
    });

    // 予約は確定したので削除（再利用防止）
    await tx.serialReservation.delete({ where: { serial: body.serial } });

    return created;
  });

  return reply.status(201).send(asset);
});

app.listen({ port: 3000, host: "0.0.0.0" }).then(() => {
  console.log("API listening on :3000");
});
