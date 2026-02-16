import Fastify from "fastify";
import { PrismaClient, TargetType, ActionType } from "@prisma/client";
import { z, ZodError } from "zod";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "Invalid request.",
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return reply.status(500).send({ error: "Internal Server Error" });
});

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

app.get("/users", async () => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
    take: 200,
  });
  return users;
});

app.post("/users", async (req, reply) => {
  const body = z
    .object({
      name: z.string().min(1),
      role: z.enum(["ADMIN", "MEMBER"]).optional(),
    })
    .parse(req.body);

  try {
    const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "user";
    const syntheticEmail = `${safeName}-${Date.now()}@local`;
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: syntheticEmail,
        role: body.role ?? "MEMBER",
      },
      select: { id: true, name: true, role: true, createdAt: true },
    });
    return reply.status(201).send(created);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return reply.status(409).send({ error: "User already exists." });
    }
    throw e;
  }
});

app.get("/users/:id/assets", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true },
  });
  if (!user) return reply.status(404).send({ error: "User not found." });

  const assets = await prisma.asset.findMany({
    where: { currentUserId: params.id, status: "CHECKED_OUT" },
    orderBy: { updatedAt: "desc" },
    include: {
      currentLocation: { select: { id: true, name: true } },
    },
    take: 500,
  });

  return {
    user,
    count: assets.length,
    assets,
  };
});

app.get("/asset-categories", async () => {
  const rows = await prisma.asset.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
    take: 500,
  });
  return { items: rows.map((x) => x.category) };
});

app.get("/asset-budgets", async () => {
  const rows = await prisma.asset.findMany({
    where: { budgetCode: { not: null } },
    select: { budgetCode: true },
    distinct: ["budgetCode"],
    orderBy: { budgetCode: "asc" },
    take: 500,
  });
  return { items: rows.map((x) => x.budgetCode).filter((x): x is string => Boolean(x && x.trim())) };
});

app.get("/locations", async () => {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, note: true, parentId: true },
    take: 500,
  });
  return locations;
});

app.post("/locations", async (req, reply) => {
  const body = z
    .object({
      name: z.string().min(1),
      note: z.string().optional(),
      parentId: z.string().optional(),
    })
    .parse(req.body);

  const created = await prisma.location.create({
    data: {
      name: body.name.trim(),
      ...(body.note ? { note: body.note } : {}),
      ...(body.parentId ? { parentId: body.parentId } : {}),
    },
    select: { id: true, name: true, note: true, parentId: true },
  });

  return reply.status(201).send(created);
});

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
      budgetCode: z.string().optional(),
      purchasedAt: z.coerce.date().optional(),
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
        ...(body.budgetCode ? { budgetCode: body.budgetCode } : {}),
        ...(body.purchasedAt ? { purchasedAt: body.purchasedAt } : {}),
        ...(body.note ? { note: body.note } : {}),
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

app.post("/assets/:id/checkout", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const body = z
    .object({
      userId: z.string().min(1),
      locationId: z.string().min(1),
      note: z.string().optional(),
    })
    .parse(req.body);

  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        currentLocationId: true,
        currentUserId: true,
      },
    });

    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }

    // 更新
    const updated = await tx.asset.update({
      where: { id: params.id },
      data: {
        status: "CHECKED_OUT",
        currentUserId: body.userId,
        currentLocationId: body.locationId,
        lastActivityAt: new Date(),
      },
    });

    // ログ
    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: updated.id,
        action: "CHECKOUT",
        fromLocationId: current.currentLocationId,
        toLocationId: body.locationId,
        fromUserId: current.currentUserId,
        toUserId: body.userId,
        note: body.note,
      },
    });

    return updated;
  });

  // transaction内で reply.status を触った場合に備えて
  if ("error" in result) return reply.send(result);

  return reply.send(result);
});

app.post("/assets/:id/checkin", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const body = z
    .object({
      locationId: z.string().min(1), // 返却先（共通棚など）
      note: z.string().optional(),
    })
    .parse(req.body);

  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        currentLocationId: true,
        currentUserId: true,
        status: true,
      },
    });

    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }

    const updated = await tx.asset.update({
      where: { id: params.id },
      data: {
        status: "AVAILABLE",
        currentUserId: null,
        currentLocationId: body.locationId,
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: updated.id,
        action: "CHECKIN",
        fromLocationId: current.currentLocationId,
        toLocationId: body.locationId,
        fromUserId: current.currentUserId,
        toUserId: null,
        note: body.note,
      },
    });

    return updated;
  });

  if ("error" in result) return reply.send(result);
  return reply.send(result);
});

app.post("/assets/:id/move", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const body = z
    .object({
      locationId: z.string().min(1),
      note: z.string().optional(),
    })
    .parse(req.body);

  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        currentLocationId: true,
        currentUserId: true,
        status: true,
      },
    });

    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }

    const updated = await tx.asset.update({
      where: { id: params.id },
      data: {
        currentLocationId: body.locationId,
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: updated.id,
        action: "MOVE",
        fromLocationId: current.currentLocationId,
        toLocationId: body.locationId,
        fromUserId: current.currentUserId,
        toUserId: current.currentUserId,
        note: body.note,
      },
    });

    return updated;
  });

  if ("error" in result) return reply.send(result);
  return reply.send(result);
});

app.get("/assets/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
  });

  if (!asset) return reply.status(404).send({ error: "Asset not found." });
  return reply.send(asset);
});

app.put("/assets/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      locationId: z.string().min(1).optional(),
      budgetCode: z.string().nullable().optional(),
      purchasedAt: z.coerce.date().nullable().optional(),
      note: z.string().nullable().optional(),
    })
    .parse(req.body);

  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: { id: true, currentLocationId: true },
    });
    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }

    const data: any = { lastActivityAt: new Date() };
    if (body.name !== undefined) data.name = body.name;
    if (body.category !== undefined) data.category = body.category;
    if (body.locationId !== undefined) data.currentLocationId = body.locationId;
    if (body.budgetCode !== undefined) data.budgetCode = body.budgetCode;
    if (body.purchasedAt !== undefined) data.purchasedAt = body.purchasedAt;
    if (body.note !== undefined) data.note = body.note;

    const updated = await tx.asset.update({
      where: { id: params.id },
      data,
    });

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: updated.id,
        action: "EDIT",
        fromLocationId: current.currentLocationId,
        toLocationId: updated.currentLocationId,
        note: "asset metadata updated",
      },
    });

    return updated;
  });

  if ("error" in result) return reply.send(result);
  return reply.send(result);
});

// 開発検証用: 最終更新日時を過去日に変更
app.post("/dev/assets/:id/backdate", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      date: z.string().optional(), // ISO文字列推奨
      daysAgo: z.coerce.number().int().min(1).max(3650).optional(),
    })
    .parse(req.body);

  const targetDate =
    body.date ? new Date(body.date) : new Date(Date.now() - (body.daysAgo ?? 180) * 24 * 60 * 60 * 1000);
  if (Number.isNaN(targetDate.getTime())) {
    return reply.status(400).send({ error: "Invalid date." });
  }

  const updated = await prisma.asset.update({
    where: { id: params.id },
    data: { lastActivityAt: targetDate },
    select: { id: true, serial: true, name: true, lastActivityAt: true },
  });

  return reply.send(updated);
});

app.get("/assets", async (req) => {
  const q = z
    .object({
      query: z.string().optional(),
      status: z.enum(["AVAILABLE", "CHECKED_OUT", "BROKEN", "DISPOSED"]).optional(),
      locationId: z.string().optional(),
      userId: z.string().optional(),
      take: z.coerce.number().int().min(1).max(200).optional(),
    })
    .parse(req.query);

  const take = q.take ?? 50;

  const where: any = {};

  if (q.status) where.status = q.status;
  if (q.locationId) where.currentLocationId = q.locationId;
  if (q.userId) where.currentUserId = q.userId;

  if (q.query && q.query.trim().length > 0) {
    const term = q.query.trim();
    where.OR = [
      { serial: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
      { budgetCode: { contains: term, mode: "insensitive" } },
    ];
  }

  const assets = await prisma.asset.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      currentLocation: { select: { id: true, name: true } },
      currentUser: { select: { id: true, name: true } },
    },
  });

  return assets;
});

app.get("/stats", async (req) => {
  const q = z
    .object({
      staleDays: z
        .preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(3650))
        .optional(),
    })
    .parse(req.query);

  const staleDays = q.staleDays ?? 180;
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const [checkedOutCount, staleAssetCount, staleConsumableCount] = await Promise.all([
    prisma.asset.count({ where: { status: "CHECKED_OUT" } }),
    prisma.asset.count({ where: { lastActivityAt: { lt: threshold } } }),
    prisma.consumable.count({ where: { lastActivityAt: { lt: threshold } } }),
  ]);

  return {
    checkedOutCount,
    staleDays,
    staleCount: staleAssetCount + staleConsumableCount,
    staleAssetCount,
    staleConsumableCount,
  };
});


app.get("/stale", async (req) => {
  const q = z
    .object({
      days: z
        .preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(3650))
        .optional(),
      type: z.enum(["ASSET", "CONSUMABLE", "ALL"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .parse(req.query);

  const days = q.days ?? 180;
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  const type = q.type ?? "ALL";

  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const toDaysSince = (d: Date) =>
    Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000));

  const takeForMerge = Math.min(500, offset + limit);

  const results: any[] = [];

  if (type === "ASSET" || type === "ALL") {
    const assets = await prisma.asset.findMany({
      where: { lastActivityAt: { lt: threshold } },
      orderBy: { lastActivityAt: "asc" },
      take: takeForMerge,
      include: {
        currentLocation: { select: { name: true } },
        currentUser: { select: { name: true } },
      },
    });

    for (const a of assets) {
      results.push({
        type: "ASSET",
        id: a.id,
        serial: a.serial,
        name: a.name,
        category: a.category,
        status: a.status,
        location: a.currentLocation?.name ?? null,
        user: a.currentUser ? { name: a.currentUser.name } : null,
        lastActivityAt: a.lastActivityAt,
        daysSince: toDaysSince(a.lastActivityAt),
      });
    }
  }

  if (type === "CONSUMABLE" || type === "ALL") {
    const consumables = await prisma.consumable.findMany({
      where: { lastActivityAt: { lt: threshold } },
      orderBy: { lastActivityAt: "asc" },
      take: takeForMerge,
      include: {
        location: { select: { name: true } },
      },
    });

    for (const c of consumables) {
      results.push({
        type: "CONSUMABLE",
        id: c.id,
        serial: c.serial,
        name: c.name,
        category: c.category,
        unit: c.unit,
        currentQty: c.currentQty,
        reorderThreshold: c.reorderThreshold,
        location: c.location?.name ?? null,
        lastActivityAt: c.lastActivityAt,
        daysSince: toDaysSince(c.lastActivityAt),
      });
    }
  }

  results.sort((a, b) => b.daysSince - a.daysSince);

  const paged = results.slice(offset, offset + limit);

  return {
    meta: { days, type, limit, offset, returned: paged.length, totalApprox: results.length },
    items: paged,
  };
});


app.post("/alerts/rebuild", async (req) => {
  const q = z.object({ days: z.coerce.number().int().min(1).max(3650).optional() }).parse(req.query);
  const days = q.days ?? 180;
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const staleAssets = await prisma.asset.findMany({
    where: { lastActivityAt: { lt: threshold } },
    select: { id: true, serial: true, name: true, lastActivityAt: true },
    take: 1000,
  });

  const staleConsumables = await prisma.consumable.findMany({
    where: { lastActivityAt: { lt: threshold } },
    select: { id: true, serial: true, name: true, lastActivityAt: true },
    take: 1000,
  });

  const makeBody = (d: Date) => `last update: ${d.toISOString()}`;

  // upsert alerts
  for (const a of staleAssets) {
    await prisma.alert.upsert({
      where: { type_targetType_targetId: { type: "STALE", targetType: "ASSET", targetId: a.id } },
      update: {
        title: `未更新(備品): ${a.name} (${a.serial})`,
        body: makeBody(a.lastActivityAt),
        // 既読は維持したいので isRead は触らない
      },
      create: {
        type: "STALE",
        targetType: "ASSET",
        targetId: a.id,
        title: `未更新(備品): ${a.name} (${a.serial})`,
        body: makeBody(a.lastActivityAt),
      },
    });
  }

  for (const c of staleConsumables) {
    await prisma.alert.upsert({
      where: { type_targetType_targetId: { type: "STALE", targetType: "CONSUMABLE", targetId: c.id } },
      update: {
        title: `未更新(消耗品): ${c.name} (${c.serial})`,
        body: makeBody(c.lastActivityAt),
      },
      create: {
        type: "STALE",
        targetType: "CONSUMABLE",
        targetId: c.id,
        title: `未更新(消耗品): ${c.name} (${c.serial})`,
        body: makeBody(c.lastActivityAt),
      },
    });
  }

  return {
    days,
    createdOrUpdated: staleAssets.length + staleConsumables.length,
  };
});

app.get("/alerts/unread-count", async () => {
  const now = new Date();
  const count = await prisma.alert.count({
    where: {
      isRead: false,
      OR: [{ snoozeUntil: null }, { snoozeUntil: { lt: now } }],
    },
  });
  return { count };
});

app.get("/alerts", async (req) => {
  const q = z.object({ isRead: z.coerce.boolean().optional() }).parse(req.query);
  const now = new Date();

  const alerts = await prisma.alert.findMany({
    where: {
      isRead: q.isRead ?? false,
      OR: [{ snoozeUntil: null }, { snoozeUntil: { lt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return alerts;
});

app.post("/alerts/:id/read", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const updated = await prisma.alert.update({
    where: { id: params.id },
    data: { isRead: true },
  });
  return reply.send(updated);
});


app.listen({ port: 3000, host: "0.0.0.0" }).then(() => {
  console.log("API listening on :3000");
});
