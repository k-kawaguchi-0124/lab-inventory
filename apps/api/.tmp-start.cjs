"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_fastify = __toESM(require("fastify"));
var import_client = require("@prisma/client");
var import_zod = require("zod");
const prisma = new import_client.PrismaClient();
const app = (0, import_fastify.default)({ logger: true });
app.setErrorHandler((error, _req, reply) => {
  if (error instanceof import_zod.ZodError) {
    return reply.status(400).send({
      error: "Invalid request.",
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
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
      role: "ADMIN"
    },
    select: { id: true }
  });
  return system.id;
}
function calcCheckDigit(num) {
  let sum = 0;
  for (const ch of num) sum += Number(ch);
  return String(sum % 10);
}
function formatSerial(prefix, seq) {
  const body = `${prefix}${String(seq).padStart(6, "0")}`;
  return `${body}-${calcCheckDigit(body)}`;
}
function uniqueSorted(values) {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))].sort((a, b) => a.localeCompare(b, "ja"));
}
let serialReservationClientIdColumnExistsCache = null;
function isMissingClientIdColumnError(error) {
  if (error instanceof import_client.Prisma.PrismaClientKnownRequestError && error.code === "P2022") return true;
  if (error instanceof Error && error.message.includes("clientId")) return true;
  return false;
}
async function hasSerialReservationClientIdColumn() {
  if (serialReservationClientIdColumnExistsCache !== null) return serialReservationClientIdColumnExistsCache;
  try {
    const rows = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'SerialReservation'
          AND column_name = 'clientId'
      ) AS "exists"
    `;
    serialReservationClientIdColumnExistsCache = Boolean(rows[0]?.exists);
  } catch {
    serialReservationClientIdColumnExistsCache = false;
  }
  return serialReservationClientIdColumnExistsCache;
}
app.get("/health", async () => ({ ok: true }));
app.get("/users", async () => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
    take: 200
  });
  return users;
});
app.post("/users", async (req, reply) => {
  const body = import_zod.z.object({
    name: import_zod.z.string().min(1),
    role: import_zod.z.enum(["ADMIN", "MEMBER"]).optional()
  }).parse(req.body);
  try {
    const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "user";
    const syntheticEmail = `${safeName}-${Date.now()}@local`;
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: syntheticEmail,
        role: body.role ?? "MEMBER"
      },
      select: { id: true, name: true, role: true, createdAt: true }
    });
    return reply.status(201).send(created);
  } catch (e) {
    if (e?.code === "P2002") {
      return reply.status(409).send({ error: "User already exists." });
    }
    throw e;
  }
});
app.get("/users/:id/assets", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true }
  });
  if (!user) return reply.status(404).send({ error: "User not found." });
  const assets = await prisma.asset.findMany({
    where: { currentUserId: params.id, status: "CHECKED_OUT" },
    orderBy: { updatedAt: "desc" },
    include: {
      currentLocation: { select: { id: true, name: true } }
    },
    take: 500
  });
  return {
    user,
    count: assets.length,
    assets
  };
});
app.delete("/users/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true }
  });
  if (!user) return reply.status(404).send({ error: "User not found." });
  if (user.email === "system@local") {
    return reply.status(400).send({ error: "SYSTEM user cannot be deleted." });
  }
  const holdingCount = await prisma.asset.count({
    where: { currentUserId: params.id, status: "CHECKED_OUT" }
  });
  if (holdingCount > 0) {
    return reply.status(400).send({ error: "User has checked-out assets. Check in assets first." });
  }
  await prisma.user.delete({
    where: { id: params.id }
  });
  return reply.send({ ok: true });
});
app.get("/asset-categories", async () => {
  const [masterRows, assetRows] = await Promise.all([
    prisma.assetCategoryMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1e3
    }),
    prisma.asset.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
      take: 1e3
    })
  ]);
  return { items: uniqueSorted([...masterRows.map((x) => x.name), ...assetRows.map((x) => x.category)]) };
});
app.get("/asset-budgets", async () => {
  const [masterRows, assetRows] = await Promise.all([
    prisma.assetBudgetMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1e3
    }),
    prisma.asset.findMany({
      where: { budgetCode: { not: null } },
      select: { budgetCode: true },
      distinct: ["budgetCode"],
      orderBy: { budgetCode: "asc" },
      take: 1e3
    })
  ]);
  return {
    items: uniqueSorted([
      ...masterRows.map((x) => x.name),
      ...assetRows.map((x) => x.budgetCode).filter((x) => Boolean(x && x.trim()))
    ])
  };
});
app.get("/consumable-categories", async () => {
  const [masterRows, consumableRows] = await Promise.all([
    prisma.consumableCategoryMaster.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 1e3
    }),
    prisma.consumable.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
      take: 1e3
    })
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
    locationChildrenCounts
  ] = await Promise.all([
    prisma.assetCategoryMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2e3 }),
    prisma.asset.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.assetBudgetMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2e3 }),
    prisma.asset.groupBy({
      by: ["budgetCode"],
      where: { budgetCode: { not: null } },
      _count: { _all: true }
    }),
    prisma.consumableCategoryMaster.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 2e3 }),
    prisma.consumable.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2e3 }),
    prisma.asset.groupBy({ by: ["currentLocationId"], _count: { _all: true } }),
    prisma.consumable.groupBy({ by: ["locationId"], _count: { _all: true } }),
    prisma.location.groupBy({ by: ["parentId"], where: { parentId: { not: null } }, _count: { _all: true } })
  ]);
  const assetCategoryUseMap = new Map(assetCategoriesInUse.map((x) => [x.category, x._count._all]));
  const assetBudgetUseMap = new Map(
    assetBudgetsInUse.filter((x) => x.budgetCode && x.budgetCode.trim().length > 0).map((x) => [x.budgetCode, x._count._all])
  );
  const consumableCategoryUseMap = new Map(consumableCategoriesInUse.map((x) => [x.category, x._count._all]));
  const assetLocationCountMap = new Map(assetLocationCounts.map((x) => [x.currentLocationId, x._count._all]));
  const consumableLocationCountMap = new Map(consumableLocationCounts.map((x) => [x.locationId, x._count._all]));
  const locationChildrenCountMap = new Map(
    locationChildrenCounts.filter((x) => x.parentId).map((x) => [x.parentId, x._count._all])
  );
  const assetCategoryNames = uniqueSorted([...assetCategoryMasters.map((x) => x.name), ...assetCategoryUseMap.keys()]);
  const assetBudgetNames = uniqueSorted([...assetBudgetMasters.map((x) => x.name), ...assetBudgetUseMap.keys()]);
  const consumableCategoryNames = uniqueSorted([
    ...consumableCategoryMasters.map((x) => x.name),
    ...consumableCategoryUseMap.keys()
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
      childCount: locationChildrenCountMap.get(loc.id) ?? 0
    }))
  };
});
app.post("/masters/asset-categories", async (req, reply) => {
  const body = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.assetCategoryMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true }
    });
    return reply.status(201).send(created);
  } catch (e) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Category already exists." });
    throw e;
  }
});
app.put("/masters/asset-categories", async (req, reply) => {
  const body = import_zod.z.object({ from: import_zod.z.string().min(1), to: import_zod.z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });
  const [usageCount, masterExists] = await Promise.all([
    prisma.asset.count({ where: { category: from } }),
    prisma.assetCategoryMaster.count({ where: { name: from } })
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Category not found." });
  await prisma.$transaction(async (tx) => {
    await tx.asset.updateMany({
      where: { category: from },
      data: { category: to, lastActivityAt: /* @__PURE__ */ new Date() }
    });
    await tx.assetCategoryMaster.deleteMany({ where: { name: from } });
    await tx.assetCategoryMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to }
    });
  });
  return reply.send({ ok: true });
});
app.delete("/masters/asset-categories/:name", async (req, reply) => {
  const params = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.asset.count({ where: { category: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Category is in use by assets." });
  }
  await prisma.assetCategoryMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});
app.post("/masters/asset-budgets", async (req, reply) => {
  const body = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.assetBudgetMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true }
    });
    return reply.status(201).send(created);
  } catch (e) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Budget already exists." });
    throw e;
  }
});
app.put("/masters/asset-budgets", async (req, reply) => {
  const body = import_zod.z.object({ from: import_zod.z.string().min(1), to: import_zod.z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });
  const [usageCount, masterExists] = await Promise.all([
    prisma.asset.count({ where: { budgetCode: from } }),
    prisma.assetBudgetMaster.count({ where: { name: from } })
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Budget not found." });
  await prisma.$transaction(async (tx) => {
    await tx.asset.updateMany({
      where: { budgetCode: from },
      data: { budgetCode: to, lastActivityAt: /* @__PURE__ */ new Date() }
    });
    await tx.assetBudgetMaster.deleteMany({ where: { name: from } });
    await tx.assetBudgetMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to }
    });
  });
  return reply.send({ ok: true });
});
app.delete("/masters/asset-budgets/:name", async (req, reply) => {
  const params = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.asset.count({ where: { budgetCode: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Budget is in use by assets." });
  }
  await prisma.assetBudgetMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});
app.post("/masters/consumable-categories", async (req, reply) => {
  const body = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.body);
  try {
    const created = await prisma.consumableCategoryMaster.create({
      data: { name: body.name.trim() },
      select: { id: true, name: true }
    });
    return reply.status(201).send(created);
  } catch (e) {
    if (e?.code === "P2002") return reply.status(409).send({ error: "Category already exists." });
    throw e;
  }
});
app.put("/masters/consumable-categories", async (req, reply) => {
  const body = import_zod.z.object({ from: import_zod.z.string().min(1), to: import_zod.z.string().min(1) }).parse(req.body);
  const from = body.from.trim();
  const to = body.to.trim();
  if (from === to) return reply.send({ ok: true });
  const [usageCount, masterExists] = await Promise.all([
    prisma.consumable.count({ where: { category: from } }),
    prisma.consumableCategoryMaster.count({ where: { name: from } })
  ]);
  if (usageCount === 0 && masterExists === 0) return reply.status(404).send({ error: "Category not found." });
  await prisma.$transaction(async (tx) => {
    await tx.consumable.updateMany({
      where: { category: from },
      data: { category: to, lastActivityAt: /* @__PURE__ */ new Date() }
    });
    await tx.consumableCategoryMaster.deleteMany({ where: { name: from } });
    await tx.consumableCategoryMaster.upsert({
      where: { name: to },
      update: {},
      create: { name: to }
    });
  });
  return reply.send({ ok: true });
});
app.delete("/masters/consumable-categories/:name", async (req, reply) => {
  const params = import_zod.z.object({ name: import_zod.z.string().min(1) }).parse(req.params);
  const name = decodeURIComponent(params.name).trim();
  const usageCount = await prisma.consumable.count({ where: { category: name } });
  if (usageCount > 0) {
    return reply.status(400).send({ error: "Category is in use by consumables." });
  }
  await prisma.consumableCategoryMaster.deleteMany({ where: { name } });
  return reply.send({ ok: true });
});
app.post("/masters/locations", async (req, reply) => {
  const body = import_zod.z.object({
    name: import_zod.z.string().min(1),
    note: import_zod.z.string().optional(),
    parentId: import_zod.z.string().optional()
  }).parse(req.body);
  const created = await prisma.location.create({
    data: {
      name: body.name.trim(),
      ...body.note ? { note: body.note } : {},
      ...body.parentId ? { parentId: body.parentId } : {}
    },
    select: { id: true, name: true }
  });
  return reply.status(201).send(created);
});
app.put("/masters/locations/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    name: import_zod.z.string().min(1),
    note: import_zod.z.string().nullable().optional(),
    parentId: import_zod.z.string().nullable().optional()
  }).parse(req.body);
  const updated = await prisma.location.update({
    where: { id: params.id },
    data: {
      name: body.name.trim(),
      ...body.note !== void 0 ? { note: body.note } : {},
      ...body.parentId !== void 0 ? { parentId: body.parentId } : {}
    },
    select: { id: true, name: true }
  });
  return reply.send(updated);
});
app.delete("/masters/locations/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const [assetCount, consumableCount, childCount] = await Promise.all([
    prisma.asset.count({ where: { currentLocationId: params.id } }),
    prisma.consumable.count({ where: { locationId: params.id } }),
    prisma.location.count({ where: { parentId: params.id } })
  ]);
  if (assetCount > 0 || consumableCount > 0 || childCount > 0) {
    return reply.status(400).send({ error: "Location is in use and cannot be deleted." });
  }
  await prisma.location.delete({ where: { id: params.id } });
  return reply.send({ ok: true });
});
app.post("/consumables", async (req, reply) => {
  const body = import_zod.z.object({
    serial: import_zod.z.string().min(3),
    name: import_zod.z.string().min(1),
    category: import_zod.z.string().min(1),
    unit: import_zod.z.enum(["\u500B", "\u672C"]),
    currentQty: import_zod.z.coerce.number().int().min(0),
    reorderThreshold: import_zod.z.coerce.number().int().min(0),
    locationId: import_zod.z.string().min(1),
    note: import_zod.z.string().optional()
  }).parse(req.body);
  const reservation = await prisma.serialReservation.findUnique({
    where: { serial: body.serial }
  });
  if (!reservation) {
    return reply.status(400).send({ error: "Serial is not reserved." });
  }
  if (reservation.type !== import_client.TargetType.CONSUMABLE) {
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
      create: { name: body.category }
    });
    const consumable = await tx.consumable.create({
      data: {
        serial: body.serial,
        name: body.name,
        category: body.category,
        unit: body.unit,
        currentQty: new import_client.Prisma.Decimal(body.currentQty),
        reorderThreshold: new import_client.Prisma.Decimal(body.reorderThreshold),
        locationId: body.locationId,
        ...body.note ? { note: body.note } : {},
        lastActivityAt: /* @__PURE__ */ new Date()
      }
    });
    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "CONSUMABLE",
        targetId: consumable.id,
        action: "CREATE",
        note: "consumable created"
      }
    });
    await tx.serialReservation.delete({ where: { serial: body.serial } });
    return consumable;
  });
  return reply.status(201).send(created);
});
app.get("/consumables", async (req) => {
  const q = import_zod.z.object({
    query: import_zod.z.string().optional(),
    locationId: import_zod.z.string().optional(),
    needsReorder: import_zod.z.coerce.boolean().optional(),
    take: import_zod.z.coerce.number().int().min(1).max(300).optional()
  }).parse(req.query);
  const take = q.take ?? 200;
  const where = {};
  if (q.locationId) where.locationId = q.locationId;
  if (q.query && q.query.trim().length > 0) {
    const term = q.query.trim();
    where.OR = [
      { serial: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } }
    ];
  }
  const items = await prisma.consumable.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: {
      location: { select: { id: true, name: true } }
    }
  });
  const mapped = items.map((c) => ({
    ...c,
    needsReorder: new import_client.Prisma.Decimal(c.currentQty).lte(c.reorderThreshold)
  }));
  if (q.needsReorder === true) {
    return mapped.filter((x) => x.needsReorder);
  }
  return mapped;
});
app.post("/consumables/:id/adjust", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    delta: import_zod.z.coerce.number().int(),
    note: import_zod.z.string().optional()
  }).parse(req.body);
  if (body.delta === 0) return reply.send({ ok: true });
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.consumable.findUnique({
      where: { id: params.id },
      select: { id: true, currentQty: true, locationId: true }
    });
    if (!current) {
      reply.status(404);
      return { error: "Consumable not found." };
    }
    const next = new import_client.Prisma.Decimal(current.currentQty).plus(body.delta);
    if (next.lt(0)) {
      reply.status(400);
      return { error: "Quantity cannot be negative." };
    }
    const updated = await tx.consumable.update({
      where: { id: params.id },
      data: {
        currentQty: next,
        lastActivityAt: /* @__PURE__ */ new Date()
      },
      include: {
        location: { select: { id: true, name: true } }
      }
    });
    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "CONSUMABLE",
        targetId: updated.id,
        action: "QTY_CHANGE",
        qtyDelta: new import_client.Prisma.Decimal(body.delta),
        toLocationId: current.locationId,
        note: body.note
      }
    });
    return {
      ...updated,
      needsReorder: new import_client.Prisma.Decimal(updated.currentQty).lte(updated.reorderThreshold)
    };
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.get("/locations", async () => {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, note: true, parentId: true },
    take: 500
  });
  return locations;
});
app.post("/locations", async (req, reply) => {
  const body = import_zod.z.object({
    name: import_zod.z.string().min(1),
    note: import_zod.z.string().optional(),
    parentId: import_zod.z.string().optional()
  }).parse(req.body);
  const created = await prisma.location.create({
    data: {
      name: body.name.trim(),
      ...body.note ? { note: body.note } : {},
      ...body.parentId ? { parentId: body.parentId } : {}
    },
    select: { id: true, name: true, note: true, parentId: true }
  });
  return reply.status(201).send(created);
});
app.post("/serials/reserve", async (req, reply) => {
  const q = import_zod.z.object({ type: import_zod.z.enum(["ASSET", "CONSUMABLE"]) }).parse(req.query);
  let supportsClientId = await hasSerialReservationClientIdColumn();
  const clientIdHeader = Array.isArray(req.headers["x-client-id"]) ? req.headers["x-client-id"][0] : req.headers["x-client-id"];
  const normalizedClientId = typeof clientIdHeader === "string" ? clientIdHeader.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
  const clientId = supportsClientId && normalizedClientId.length > 0 ? normalizedClientId : null;
  const year2 = String((/* @__PURE__ */ new Date()).getFullYear()).slice(-2);
  const prefix = `${year2}`;
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1e3);
  const systemUserId = await getSystemUserId();
  if (supportsClientId && clientId) {
    try {
      const reusable = await prisma.serialReservation.findFirst({
        where: {
          type: q.type,
          reservedBy: systemUserId,
          clientId,
          expiresAt: { gte: now }
        },
        orderBy: { createdAt: "desc" }
      });
      if (reusable) {
        await prisma.serialReservation.update({
          where: { serial: reusable.serial },
          data: { expiresAt }
        });
        return reply.send({ serial: reusable.serial, expiresAt });
      }
    } catch (e) {
      if (!isMissingClientIdColumnError(e)) throw e;
      supportsClientId = false;
      serialReservationClientIdColumnExistsCache = false;
    }
  }
  for (let reuseAttempt = 0; reuseAttempt < 5; reuseAttempt += 1) {
    const reusableExpired = await prisma.serialReservation.findFirst({
      where: {
        type: q.type,
        expiresAt: { lt: now }
      },
      orderBy: { createdAt: "asc" }
    });
    if (!reusableExpired) break;
    const updated = await prisma.serialReservation.updateMany({
      where: {
        serial: reusableExpired.serial,
        expiresAt: { lt: now }
      },
      data: {
        reservedBy: systemUserId,
        ...supportsClientId ? { clientId } : {},
        expiresAt
      }
    });
    if (updated.count === 1) {
      return reply.send({ serial: reusableExpired.serial, expiresAt });
    }
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const counter = await tx.serialCounter.upsert({
          where: { prefix },
          create: { prefix, nextValue: 1 },
          update: {}
        });
        let seq = counter.nextValue;
        let serial = formatSerial(year2, seq);
        while (true) {
          const [reserved, asset, consumable] = await Promise.all([
            tx.serialReservation.findUnique({ where: { serial }, select: { serial: true } }),
            tx.asset.findUnique({ where: { serial }, select: { id: true } }),
            tx.consumable.findUnique({ where: { serial }, select: { id: true } })
          ]);
          if (!reserved && !asset && !consumable) break;
          seq += 1;
          serial = formatSerial(year2, seq);
        }
        await tx.serialCounter.update({
          where: { prefix },
          data: { nextValue: seq + 1 }
        });
        await tx.serialReservation.create({
          data: {
            serial,
            type: q.type,
            // 認証未実装なので仮の user を作らず、reservedBy に固定値
            // 将来ログイン導入後、req.user.id に置き換え
            reservedBy: systemUserId,
            ...supportsClientId ? { clientId } : {},
            expiresAt
          }
        });
        return { serial, expiresAt };
      });
      return reply.send(result);
    } catch (e) {
      if (supportsClientId && isMissingClientIdColumnError(e)) {
        supportsClientId = false;
        serialReservationClientIdColumnExistsCache = false;
        attempt -= 1;
        continue;
      }
      if (e?.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  return reply.status(500).send({ error: "Serial reservation failed." });
});
app.post("/assets", async (req, reply) => {
  const body = import_zod.z.object({
    serial: import_zod.z.string().min(3),
    name: import_zod.z.string().min(1),
    category: import_zod.z.string().min(1),
    locationId: import_zod.z.string().min(1),
    budgetCode: import_zod.z.string().optional(),
    purchasedAt: import_zod.z.coerce.date().optional(),
    note: import_zod.z.string().optional()
  }).parse(req.body);
  const reservation = await prisma.serialReservation.findUnique({
    where: { serial: body.serial }
  });
  if (!reservation) {
    return reply.status(400).send({ error: "Serial is not reserved." });
  }
  if (reservation.type !== import_client.TargetType.ASSET) {
    return reply.status(400).send({ error: "Serial type mismatch." });
  }
  if (reservation.expiresAt.getTime() < Date.now()) {
    return reply.status(400).send({ error: "Serial reservation expired." });
  }
  const asset = await prisma.$transaction(async (tx) => {
    await tx.assetCategoryMaster.upsert({
      where: { name: body.category },
      update: {},
      create: { name: body.category }
    });
    if (body.budgetCode && body.budgetCode.trim().length > 0) {
      await tx.assetBudgetMaster.upsert({
        where: { name: body.budgetCode.trim() },
        update: {},
        create: { name: body.budgetCode.trim() }
      });
    }
    const created = await tx.asset.create({
      data: {
        serial: body.serial,
        name: body.name,
        category: body.category,
        currentLocationId: body.locationId,
        ...body.budgetCode ? { budgetCode: body.budgetCode } : {},
        ...body.purchasedAt ? { purchasedAt: body.purchasedAt } : {},
        ...body.note ? { note: body.note } : {},
        lastActivityAt: /* @__PURE__ */ new Date()
      }
    });
    await tx.activityLog.create({
      data: {
        actorId: await getSystemUserId(),
        targetType: import_client.TargetType.ASSET,
        targetId: created.id,
        action: import_client.ActionType.CREATE,
        note: "created"
      }
    });
    await tx.serialReservation.delete({ where: { serial: body.serial } });
    return created;
  });
  return reply.status(201).send(asset);
});
app.post("/assets/:id/checkout", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    userId: import_zod.z.string().min(1),
    locationId: import_zod.z.string().min(1),
    note: import_zod.z.string().optional()
  }).parse(req.body);
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        currentLocationId: true,
        currentUserId: true
      }
    });
    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }
    const updated = await tx.asset.update({
      where: { id: params.id },
      data: {
        status: "CHECKED_OUT",
        currentUserId: body.userId,
        currentLocationId: body.locationId,
        lastActivityAt: /* @__PURE__ */ new Date()
      }
    });
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
        note: body.note
      }
    });
    return updated;
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.post("/assets/:id/checkin", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    locationId: import_zod.z.string().min(1),
    // 返却先（共通棚など）
    note: import_zod.z.string().optional()
  }).parse(req.body);
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        currentLocationId: true,
        currentUserId: true,
        status: true
      }
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
        lastActivityAt: /* @__PURE__ */ new Date()
      }
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
        note: body.note
      }
    });
    return updated;
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.post("/assets/:id/move", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    locationId: import_zod.z.string().min(1),
    note: import_zod.z.string().optional()
  }).parse(req.body);
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        currentLocationId: true,
        currentUserId: true,
        status: true
      }
    });
    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }
    const updated = await tx.asset.update({
      where: { id: params.id },
      data: {
        currentLocationId: body.locationId,
        lastActivityAt: /* @__PURE__ */ new Date()
      }
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
        note: body.note
      }
    });
    return updated;
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.get("/assets/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const asset = await prisma.asset.findUnique({
    where: { id: params.id }
  });
  if (!asset) return reply.status(404).send({ error: "Asset not found." });
  return reply.send(asset);
});
app.get("/assets/:id/timeline", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!asset) return reply.status(404).send({ error: "Asset not found." });
  const logs = await prisma.activityLog.findMany({
    where: { targetType: "ASSET", targetId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: { select: { id: true, name: true } }
    }
  });
  const locationIds = /* @__PURE__ */ new Set();
  const userIds = /* @__PURE__ */ new Set();
  for (const l of logs) {
    if (l.fromLocationId) locationIds.add(l.fromLocationId);
    if (l.toLocationId) locationIds.add(l.toLocationId);
    if (l.fromUserId) userIds.add(l.fromUserId);
    if (l.toUserId) userIds.add(l.toUserId);
  }
  const [locations, users] = await Promise.all([
    locationIds.size ? prisma.location.findMany({
      where: { id: { in: [...locationIds] } },
      select: { id: true, name: true }
    }) : Promise.resolve([]),
    userIds.size ? prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true }
    }) : Promise.resolve([])
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
    qtyDelta: l.qtyDelta
  }));
});
app.put("/assets/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    name: import_zod.z.string().min(1).optional(),
    category: import_zod.z.string().min(1).optional(),
    locationId: import_zod.z.string().min(1).optional(),
    budgetCode: import_zod.z.string().nullable().optional(),
    purchasedAt: import_zod.z.coerce.date().nullable().optional(),
    note: import_zod.z.string().nullable().optional()
  }).parse(req.body);
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: { id: true, currentLocationId: true }
    });
    if (!current) {
      reply.status(404);
      return { error: "Asset not found." };
    }
    const data = { lastActivityAt: /* @__PURE__ */ new Date() };
    if (body.name !== void 0) data.name = body.name;
    if (body.category !== void 0) {
      await tx.assetCategoryMaster.upsert({
        where: { name: body.category },
        update: {},
        create: { name: body.category }
      });
      data.category = body.category;
    }
    if (body.locationId !== void 0) data.currentLocationId = body.locationId;
    if (body.budgetCode !== void 0) {
      if (body.budgetCode && body.budgetCode.trim().length > 0) {
        await tx.assetBudgetMaster.upsert({
          where: { name: body.budgetCode.trim() },
          update: {},
          create: { name: body.budgetCode.trim() }
        });
      }
      data.budgetCode = body.budgetCode;
    }
    if (body.purchasedAt !== void 0) data.purchasedAt = body.purchasedAt;
    if (body.note !== void 0) data.note = body.note;
    const updated = await tx.asset.update({
      where: { id: params.id },
      data
    });
    await tx.activityLog.create({
      data: {
        actorId,
        targetType: "ASSET",
        targetId: updated.id,
        action: "EDIT",
        fromLocationId: current.currentLocationId,
        toLocationId: updated.currentLocationId,
        note: "asset metadata updated"
      }
    });
    return updated;
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.delete("/assets/:id", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const actorId = await getSystemUserId();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, currentLocationId: true, currentUserId: true }
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
        note: "asset deleted"
      }
    });
    await tx.asset.delete({ where: { id: params.id } });
    return { ok: true };
  });
  if ("error" in result) return reply.send(result);
  return reply.send(result);
});
app.post("/dev/assets/:id/backdate", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const body = import_zod.z.object({
    date: import_zod.z.string().optional(),
    // ISO文字列推奨
    daysAgo: import_zod.z.coerce.number().int().min(1).max(3650).optional()
  }).parse(req.body);
  const targetDate = body.date ? new Date(body.date) : new Date(Date.now() - (body.daysAgo ?? 180) * 24 * 60 * 60 * 1e3);
  if (Number.isNaN(targetDate.getTime())) {
    return reply.status(400).send({ error: "Invalid date." });
  }
  const updated = await prisma.asset.update({
    where: { id: params.id },
    data: { lastActivityAt: targetDate },
    select: { id: true, serial: true, name: true, lastActivityAt: true }
  });
  return reply.send(updated);
});
app.get("/assets", async (req) => {
  const q = import_zod.z.object({
    query: import_zod.z.string().optional(),
    status: import_zod.z.enum(["AVAILABLE", "CHECKED_OUT", "BROKEN", "DISPOSED"]).optional(),
    locationId: import_zod.z.string().optional(),
    userId: import_zod.z.string().optional(),
    take: import_zod.z.coerce.number().int().min(1).max(200).optional()
  }).parse(req.query);
  const take = q.take ?? 50;
  const where = {};
  if (q.status) where.status = q.status;
  if (q.locationId) where.currentLocationId = q.locationId;
  if (q.userId) where.currentUserId = q.userId;
  if (q.query && q.query.trim().length > 0) {
    const term = q.query.trim();
    where.OR = [
      { serial: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
      { budgetCode: { contains: term, mode: "insensitive" } }
    ];
  }
  const assets = await prisma.asset.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      currentLocation: { select: { id: true, name: true } },
      currentUser: { select: { id: true, name: true } }
    }
  });
  return assets;
});
app.get("/stats", async (req) => {
  const q = import_zod.z.object({
    staleDays: import_zod.z.preprocess((v) => v === "" ? void 0 : v, import_zod.z.coerce.number().int().min(1).max(3650)).optional()
  }).parse(req.query);
  const staleDays = q.staleDays ?? 180;
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1e3);
  const [checkedOutCount, staleAssetCount, staleConsumableCount] = await Promise.all([
    prisma.asset.count({ where: { status: "CHECKED_OUT" } }),
    prisma.asset.count({ where: { lastActivityAt: { lt: threshold } } }),
    prisma.consumable.count({ where: { lastActivityAt: { lt: threshold } } })
  ]);
  return {
    checkedOutCount,
    staleDays,
    staleCount: staleAssetCount + staleConsumableCount,
    staleAssetCount,
    staleConsumableCount
  };
});
app.get("/stale", async (req) => {
  const q = import_zod.z.object({
    days: import_zod.z.preprocess((v) => v === "" ? void 0 : v, import_zod.z.coerce.number().int().min(1).max(3650)).optional(),
    type: import_zod.z.enum(["ASSET", "CONSUMABLE", "ALL"]).optional(),
    limit: import_zod.z.coerce.number().int().min(1).max(200).optional(),
    offset: import_zod.z.coerce.number().int().min(0).optional()
  }).parse(req.query);
  const days = q.days ?? 180;
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  const type = q.type ?? "ALL";
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
  const now = Date.now();
  const toDaysSince = (d) => Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1e3));
  const takeForMerge = Math.min(500, offset + limit);
  const results = [];
  if (type === "ASSET" || type === "ALL") {
    const assets = await prisma.asset.findMany({
      where: { lastActivityAt: { lt: threshold } },
      orderBy: { lastActivityAt: "asc" },
      take: takeForMerge,
      include: {
        currentLocation: { select: { name: true } },
        currentUser: { select: { name: true } }
      }
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
        daysSince: toDaysSince(a.lastActivityAt)
      });
    }
  }
  if (type === "CONSUMABLE" || type === "ALL") {
    const consumables = await prisma.consumable.findMany({
      where: { lastActivityAt: { lt: threshold } },
      orderBy: { lastActivityAt: "asc" },
      take: takeForMerge,
      include: {
        location: { select: { name: true } }
      }
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
        daysSince: toDaysSince(c.lastActivityAt)
      });
    }
  }
  results.sort((a, b) => b.daysSince - a.daysSince);
  const paged = results.slice(offset, offset + limit);
  return {
    meta: { days, type, limit, offset, returned: paged.length, totalApprox: results.length },
    items: paged
  };
});
app.post("/alerts/rebuild", async (req) => {
  const q = import_zod.z.object({ days: import_zod.z.coerce.number().int().min(1).max(3650).optional() }).parse(req.query);
  const days = q.days ?? 180;
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
  const staleAssets = await prisma.asset.findMany({
    where: { lastActivityAt: { lt: threshold } },
    select: { id: true, serial: true, name: true, lastActivityAt: true },
    take: 1e3
  });
  const staleConsumables = await prisma.consumable.findMany({
    where: { lastActivityAt: { lt: threshold } },
    select: { id: true, serial: true, name: true, lastActivityAt: true },
    take: 1e3
  });
  const makeBody = (d) => `last update: ${d.toISOString()}`;
  for (const a of staleAssets) {
    await prisma.alert.upsert({
      where: { type_targetType_targetId: { type: "STALE", targetType: "ASSET", targetId: a.id } },
      update: {
        title: `\u672A\u66F4\u65B0(\u5099\u54C1): ${a.name} (${a.serial})`,
        body: makeBody(a.lastActivityAt)
        // 既読は維持したいので isRead は触らない
      },
      create: {
        type: "STALE",
        targetType: "ASSET",
        targetId: a.id,
        title: `\u672A\u66F4\u65B0(\u5099\u54C1): ${a.name} (${a.serial})`,
        body: makeBody(a.lastActivityAt)
      }
    });
  }
  for (const c of staleConsumables) {
    await prisma.alert.upsert({
      where: { type_targetType_targetId: { type: "STALE", targetType: "CONSUMABLE", targetId: c.id } },
      update: {
        title: `\u672A\u66F4\u65B0(\u6D88\u8017\u54C1): ${c.name} (${c.serial})`,
        body: makeBody(c.lastActivityAt)
      },
      create: {
        type: "STALE",
        targetType: "CONSUMABLE",
        targetId: c.id,
        title: `\u672A\u66F4\u65B0(\u6D88\u8017\u54C1): ${c.name} (${c.serial})`,
        body: makeBody(c.lastActivityAt)
      }
    });
  }
  return {
    days,
    createdOrUpdated: staleAssets.length + staleConsumables.length
  };
});
app.get("/alerts/unread-count", async () => {
  const now = /* @__PURE__ */ new Date();
  const count = await prisma.alert.count({
    where: {
      isRead: false,
      OR: [{ snoozeUntil: null }, { snoozeUntil: { lt: now } }]
    }
  });
  return { count };
});
app.get("/alerts", async (req) => {
  const q = import_zod.z.object({ isRead: import_zod.z.coerce.boolean().optional() }).parse(req.query);
  const now = /* @__PURE__ */ new Date();
  const alerts = await prisma.alert.findMany({
    where: {
      isRead: q.isRead ?? false,
      OR: [{ snoozeUntil: null }, { snoozeUntil: { lt: now } }]
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return alerts;
});
app.post("/alerts/:id/read", async (req, reply) => {
  const params = import_zod.z.object({ id: import_zod.z.string().min(1) }).parse(req.params);
  const updated = await prisma.alert.update({
    where: { id: params.id },
    data: { isRead: true }
  });
  return reply.send(updated);
});
async function start() {
  await getSystemUserId();
  await app.listen({ port: 3e3, host: "0.0.0.0" });
  console.log("API listening on :3000");
}
start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
