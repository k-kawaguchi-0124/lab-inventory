import Fastify from "fastify";
import { PrismaClient, TargetType, ActionType, Prisma } from "@prisma/client";
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
  const system = await prisma.user.upsert({
    where: { email: "system@local" },
    update: {},
    create: {
      name: "SYSTEM",
      email: "system@local",
      role: "ADMIN",
    },
    select: { id: true },
  });
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

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))].sort((a, b) => a.localeCompare(b, "ja"));
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

app.delete("/users/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true },
  });
  if (!user) return reply.status(404).send({ error: "User not found." });
  if (user.email === "system@local") {
    return reply.status(400).send({ error: "SYSTEM user cannot be deleted." });
  }

  const holdingCount = await prisma.asset.count({
    where: { currentUserId: params.id, status: "CHECKED_OUT" },
  });
  if (holdingCount > 0) {
    return reply.status(400).send({ error: "User has checked-out assets. Check in assets first." });
  }

  await prisma.user.delete({
    where: { id: params.id },
  });

  return reply.send({ ok: true });
});

app.get("/asset-categories", async () => {
  const [masterRows, assetRows] = await Promise.all([
    prisma.assetCategoryMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.asset.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
      take: 1000,
    }),
  ]);
  return { items: uniqueSorted([...masterRows.map((x) => x.name), ...assetRows.map((x) => x.category)]) };
});

app.get("/asset-budgets", async () => {
  const [masterRows, assetRows] = await Promise.all([
    prisma.assetBudgetMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.asset.findMany({
      where: { budgetCode: { not: null } },
      select: { budgetCode: true },
      distinct: ["budgetCode"],
      orderBy: { budgetCode: "asc" },
      take: 1000,
    }),
  ]);
  return {
    items: uniqueSorted([
      ...masterRows.map((x) => x.name),
      ...assetRows.map((x) => x.budgetCode).filter((x): x is string => Boolean(x && x.trim())),
    ]),
  };
});

app.get("/consumable-categories", async () => {
  const [masterRows, consumableRows] = await Promise.all([
    prisma.consumableCategoryMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.consumable.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
      take: 1000,
    }),
  ]);
  return { items: uniqueSorted([...masterRows.map((x) => x.name), ...consumableRows.map((x) => x.category)]) };
});

app.get("/masters", async () => {
  const [
    assetCategoryMasters,
    assetCategoriesInUse,
    assetBudgetMasters,
    assetBudgetsInUse,
    consumableCategoryMasters,
    consumableCategoriesInUse,
    locations,
    assetLocationCounts,
    consumableLocationCounts,
    locationChildrenCounts,
  ] = await Promise.all([
    prisma.assetCategoryMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2000 }),
    prisma.asset.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.assetBudgetMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2000 }),
    prisma.asset.groupBy({
      by: ["budgetCode"],
      where: { budgetCode: { not: null } },
      _count: { _all: true },
    }),
    prisma.consumableCategoryMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2000 }),
    prisma.consumable.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2000 }),
    prisma.asset.groupBy({ by: ["currentLocationId"], _count: { _all: true } }),
    prisma.consumable.groupBy({ by: ["locationId"], _count: { _all: true } }),
    prisma.location.groupBy({ by: ["parentId"], where: { parentId: { not: null } }, _count: { _all: true } }),
  ]);

  const assetCategoryUseMap = new Map(assetCategoriesInUse.map((x) => [x.category, x._count._all]));
  const assetBudgetUseMap = new Map(
    assetBudgetsInUse
      .filter((x) => x.budgetCode && x.budgetCode.trim().length > 0)
      .map((x) => [x.budgetCode as string, x._count._all]),
  );
  const consumableCategoryUseMap = new Map(consumableCategoriesInUse.map((x) => [x.category, x._count._all]));
  const assetLocationCountMap = new Map(assetLocationCounts.map((x) => [x.currentLocationId, x._count._all]));
  const consumableLocationCountMap = new Map(consumableLocationCounts.map((x) => [x.locationId, x._count._all]));
  const locationChildrenCountMap = new Map(
    locationChildrenCounts
      .filter((x) => x.parentId)
      .map((x) => [x.parentId as string, x._count._all]),
  );

  const assetCategoryNames = uniqueSorted([...assetCategoryMasters.map((x) => x.name), ...assetCategoryUseMap.keys()]);
  const assetBudgetNames = uniqueSorted([...assetBudgetMasters.map((x) => x.name), ...assetBudgetUseMap.keys()]);
  const consumableCategoryNames = uniqueSorted([
    ...consumableCategoryMasters.map((x) => x.name),
    ...consumableCategoryUseMap.keys(),
  ]);

  return {
    assetCategories: assetCategoryNames.map((name) => ({ name, usageCount: assetCategoryUseMap.get(name) ?? 0 })),
    assetBudgets: assetBudgetNames.map((name) => ({ name, usageCount: assetBudgetUseMap.get(name) ?? 0 })),
    consumableCategories: consumableCategoryNames.map((name) => ({ name, usageCount: consumableCategoryUseMap.get(name) ?? 0 })),
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      assetCount: assetLocationCountMap.get(loc.id) ?? 0,
      consumableCount: consumableLocationCountMap.get(loc.id) ?? 0,
      childCount: locationChildrenCountMap.get(loc.id) ?? 0,
    })),
  };
});

app.post("/masters/asset-categories", async (req, reply) => {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.assetCategoryMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true },
    });
    return reply.status(201).send(created);
  } catch (e: any) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Category already exists." });
    throw e;
  }
});

app.put("/masters/asset-categories", async (req, reply) => {
  const body = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });

  const [usageCount, masterExists] = await Promise.all([
    prisma.asset.count({ where: { category: from } }),
    prisma.assetCategoryMaster.count({ where: { name: from } }),
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Category not found." });

  await prisma.$transaction(async (tx) => {
    await tx.asset.updateMany({
      where: { category: from },
      data: { category: to, lastActivityAt: new Date() },
    });
    await tx.assetCategoryMaster.deleteMany({ where: { name: from } });
    await tx.assetCategoryMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to },
    });
  });

  return reply.send({ ok: true });
});

app.delete("/masters/asset-categories/:name", async (req, reply) => {
  const params = z.object({ name: z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.asset.count({ where: { category: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Category is in use by assets." });
  }
  await prisma.assetCategoryMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});

app.post("/masters/asset-budgets", async (req, reply) => {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.assetBudgetMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true },
    });
    return reply.status(201).send(created);
  } catch (e: any) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Budget already exists." });
    throw e;
  }
});

app.put("/masters/asset-budgets", async (req, reply) => {
  const body = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });

  const [usageCount, masterExists] = await Promise.all([
    prisma.asset.count({ where: { budgetCode: from } }),
    prisma.assetBudgetMaster.count({ where: { name: from } }),
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Budget not found." });

  await prisma.$transaction(async (tx) => {
    await tx.asset.updateMany({
      where: { budgetCode: from },
      data: { budgetCode: to, lastActivityAt: new Date() },
    });
    await tx.assetBudgetMaster.deleteMany({ where: { name: from } });
    await tx.assetBudgetMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to },
    });
  });

  return reply.send({ ok: true });
});

app.delete("/masters/asset-budgets/:name", async (req, reply) => {
  const params = z.object({ name: z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.asset.count({ where: { budgetCode: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Budget is in use by assets." });
  }
  await prisma.assetBudgetMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});

app.post("/masters/consumable-categories", async (req, reply) => {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.consumableCategoryMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true },
    });
    return reply.status(201).send(created);
  } catch (e: any) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Category already exists." });
    throw e;
  }
});

app.put("/masters/consumable-categories", async (req, reply) => {
  const body = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });

  const [usageCount, masterExists] = await Promise.all([
    prisma.consumable.count({ where: { category: from } }),
    prisma.consumableCategoryMaster.count({ where: { name: from } }),
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Category not found." });

  await prisma.$transaction(async (tx) => {
    await tx.consumable.updateMany({
      where: { category: from },
      data: { category: to, lastActivityAt: new Date() },
    });
    await tx.consumableCategoryMaster.deleteMany({ where: { name: from } });
    await tx.consumableCategoryMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to },
    });
  });

  return reply.send({ ok: true });
});

app.delete("/masters/consumable-categories/:name", async (req, reply) => {
  const params = z.object({ name: z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.consumable.count({ where: { category: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Category is in use by consumables." });
  }
  await prisma.consumableCategoryMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});

app.post("/masters/locations", async (req, reply) => {
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
    select: { id: true, name: true },
  });
  return reply.status(201).send(created);
});

app.put("/masters/locations/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1),
      note: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
    })
    .parse(req.body);

  const updated = await prisma.location.update({
    where: { id: params.id },
    data: {
      name: body.name.trim(),
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
    },
    select: { id: true, name: true },
  });
  return reply.send(updated);
});

app.delete("/masters/locations/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);

  const [assetCount, consumableCount, childCount] = await Promise.all([
    prisma.asset.count({ where: { currentLocationId: params.id } }),
    prisma.consumable.count({ where: { locationId: params.id } }),
    prisma.location.count({ where: { parentId: params.id } }),
  ]);
  if (assetCount > 0 || consumableCount > 0 || childCount > 0) {
    return reply.status(400).send({ error: "Location is in use and cannot be deleted." });
  }

  await prisma.location.delete({ where: { id: params.id } });
  return reply.send({ ok: true });
});

app.post("/consumables", async (req, reply) => {
  const body = z
    .object({
      serial: z.string().min(3),
      name: z.string().min(1),
      category: z.string().min(1),
      unit: z.enum(["個", "本"]),
      currentQty: z.coerce.number().int().min(0),
      reorderThreshold: z.coerce.number().int().min(0),
      locationId: z.string().min(1),
      note: z.string().optional(),
    })
    .parse(req.body);

  const reservation = await prisma.serialReservation.findUnique({
    where: { serial: body.serial },
  });

  if (!reservation) {
    return reply.status(400).send({ error: "Serial is not reserved." });
  }
  if (reservation.type !== TargetType.CONSUMABLE) {
    return reply.status(400).send({ error: "Serial type mismatch." });
  }
  if (reservation.expiresAt.getTime() < Date.now()) {
    return reply.status(400).send({ error: "Serial reservation expired." });
  }

  const actorId = await getSystemUserId();

  const created = await prisma.$transaction(async (tx) => {
    await tx.consumableCategoryMaster.upsert({
      where: { name: body.category },
      update: {},
      create: { name: body.category },
    });

    const consumable = await tx.consumable.create({
      data: {
        serial: body.serial,
        name: body.name,
        category: body.category,
        unit: body.unit,
        currentQty: new Prisma.Decimal(body.currentQty),
        reorderThreshold: new Prisma.Decimal(body.reorderThreshold),
        locationId: body.locationId,
        ...(body.note ? { note: body.note } : {}),
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "CONSUMABLE",
        targetId: consumable.id,
        action: "CREATE",
        note: "consumable created",
      },
    });

    await tx.serialReservation.delete({ where: { serial: body.serial } });

    return consumable;
  });

  return reply.status(201).send(created);
});

app.get("/consumables", async (req) => {
  const q = z
    .object({
      query: z.string().optional(),
      locationId: z.string().optional(),
      needsReorder: z.coerce.boolean().optional(),
      take: z.coerce.number().int().min(1).max(300).optional(),
    })
    .parse(req.query);

  const take = q.take ?? 200;
  const where: any = {};
  if (q.locationId) where.locationId = q.locationId;
  if (q.query && q.query.trim().length > 0) {
    const term = q.query.trim();
    where.OR = [
      { serial: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
    ];
  }

  const items = await prisma.consumable.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: {
      location: { select: { id: true, name: true } },
    },
  });

  const mapped = items.map((c) => ({
    ...c,
    needsReorder: new Prisma.Decimal(c.currentQty).lte(c.reorderThreshold),
  }));

  if (q.needsReorder === true) {
    return mapped.filter((x) => x.needsReorder);
  }
  return mapped;
});

app.post("/consumables/:id/adjust", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      delta: z.coerce.number().int(),
      note: z.string().optional(),
    })
    .parse(req.body);

  if (body.delta === 0) return reply.send({ ok: true });

  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.consumable.findUnique({
      where: { id: params.id },
      select: { id: true, currentQty: true, locationId: true },
    });
    if (!current) {
      reply.status(404);
      return { error: "Consumable not found." };
    }

    const next = new Prisma.Decimal(current.currentQty).plus(body.delta);
    if (next.lt(0)) {
      reply.status(400);
      return { error: "Quantity cannot be negative." };
    }

    const updated = await tx.consumable.update({
      where: { id: params.id },
      data: {
        currentQty: next,
        lastActivityAt: new Date(),
      },
      include: {
        location: { select: { id: true, name: true } },
      },
    });

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "CONSUMABLE",
        targetId: updated.id,
        action: "QTY_CHANGE",
        qtyDelta: new Prisma.Decimal(body.delta),
        toLocationId: current.locationId,
        note: body.note,
      },
    });

    return {
      ...updated,
      needsReorder: new Prisma.Decimal(updated.currentQty).lte(updated.reorderThreshold),
    };
  });

  if ("error" in result) return reply.send(result);
  return reply.send(result);
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

  // 年度prefixは「西暦下2桁」。
  // シリアル文字列は type を含まないため、カウンタはタイプ別に分けず共通化して衝突を防ぐ。
  const year2 = String(new Date().getFullYear()).slice(-2);
  const prefix = `${year2}`;

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // 同時実行競合で一時的にユニーク制約に触れる場合があるため、数回リトライする。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // counter を行ロック的に更新
        const counter = await tx.serialCounter.upsert({
          where: { prefix },
          create: { prefix, nextValue: 1 },
          update: {},
        });

        let seq = counter.nextValue;
        let serial = formatSerial(year2, seq);

        // 既存データ（予約/備品/消耗品）と衝突しないシリアルを探す
        // 既存環境で採番方式が変わった後でも重複による500を防ぐ
        while (true) {
          const [reserved, asset, consumable] = await Promise.all([
            tx.serialReservation.findUnique({ where: { serial }, select: { serial: true } }),
            tx.asset.findUnique({ where: { serial }, select: { id: true } }),
            tx.consumable.findUnique({ where: { serial }, select: { id: true } }),
          ]);

          if (!reserved && !asset && !consumable) break;

          seq += 1;
          serial = formatSerial(year2, seq);
        }

        // 次回用にインクリメント
        await tx.serialCounter.update({
          where: { prefix },
          data: { nextValue: seq + 1 },
        });

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
    } catch (e: any) {
      // Prisma unique constraint error
      if (e?.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }

  return reply.status(500).send({ error: "Serial reservation failed." });
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
    await tx.assetCategoryMaster.upsert({
      where: { name: body.category },
      update: {},
      create: { name: body.category },
    });
    if (body.budgetCode && body.budgetCode.trim().length > 0) {
      await tx.assetBudgetMaster.upsert({
        where: { name: body.budgetCode.trim() },
        update: {},
        create: { name: body.budgetCode.trim() },
      });
    }

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

app.get("/assets/:id/timeline", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!asset) return reply.status(404).send({ error: "Asset not found." });

  const logs = await prisma.activityLog.findMany({
    where: { targetType: "ASSET", targetId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: { select: { id: true, name: true } },
    },
  });

  const locationIds = new Set<string>();
  const userIds = new Set<string>();
  for (const l of logs) {
    if (l.fromLocationId) locationIds.add(l.fromLocationId);
    if (l.toLocationId) locationIds.add(l.toLocationId);
    if (l.fromUserId) userIds.add(l.fromUserId);
    if (l.toUserId) userIds.add(l.toUserId);
  }

  const [locations, users] = await Promise.all([
    locationIds.size
      ? prisma.location.findMany({
          where: { id: { in: [...locationIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    userIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const locMap = new Map(locations.map((x) => [x.id, x]));
  const userMap = new Map(users.map((x) => [x.id, x]));

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    note: l.note,
    createdAt: l.createdAt,
    actor: l.actor,
    fromLocation: l.fromLocationId ? locMap.get(l.fromLocationId) ?? null : null,
    toLocation: l.toLocationId ? locMap.get(l.toLocationId) ?? null : null,
    fromUser: l.fromUserId ? userMap.get(l.fromUserId) ?? null : null,
    toUser: l.toUserId ? userMap.get(l.toUserId) ?? null : null,
    qtyDelta: l.qtyDelta,
  }));
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
    if (body.category !== undefined) {
      await tx.assetCategoryMaster.upsert({
        where: { name: body.category },
        update: {},
        create: { name: body.category },
      });
      data.category = body.category;
    }
    if (body.locationId !== undefined) data.currentLocationId = body.locationId;
    if (body.budgetCode !== undefined) {
      if (body.budgetCode && body.budgetCode.trim().length > 0) {
        await tx.assetBudgetMaster.upsert({
          where: { name: body.budgetCode.trim() },
          update: {},
          create: { name: body.budgetCode.trim() },
        });
      }
      data.budgetCode = body.budgetCode;
    }
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

app.delete("/assets/:id", async (req, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const actorId = await getSystemUserId();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, currentLocationId: true, currentUserId: true },
    });
    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }
    if (current.status === "CHECKED_OUT") {
      reply.status(400);
      return { error: "Checked-out asset cannot be deleted. Check in first." };
    }

    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: current.id,
        action: "STATUS_CHANGE",
        fromLocationId: current.currentLocationId,
        toLocationId: current.currentLocationId,
        fromUserId: current.currentUserId,
        toUserId: current.currentUserId,
        note: "asset deleted",
      },
    });

    await tx.asset.delete({ where: { id: params.id } });
    return { ok: true };
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


async function start() {
  await getSystemUserId();
  await app.listen({ port: 3000, host: "0.0.0.0" });
  console.log("API listening on :3000");
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
