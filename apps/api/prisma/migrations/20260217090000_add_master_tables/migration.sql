-- Master tables for category/budget management
CREATE TABLE "AssetCategoryMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetCategoryMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetBudgetMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetBudgetMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsumableCategoryMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsumableCategoryMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetCategoryMaster_name_key" ON "AssetCategoryMaster"("name");
CREATE UNIQUE INDEX "AssetBudgetMaster_name_key" ON "AssetBudgetMaster"("name");
CREATE UNIQUE INDEX "ConsumableCategoryMaster_name_key" ON "ConsumableCategoryMaster"("name");

-- backfill from existing domain data
INSERT INTO "AssetCategoryMaster" ("id", "name", "createdAt", "updatedAt")
SELECT 'acm_' || md5("category"), "category", NOW(), NOW()
FROM (
  SELECT DISTINCT "category"
  FROM "Asset"
  WHERE "category" IS NOT NULL AND btrim("category") <> ''
) s;

INSERT INTO "AssetBudgetMaster" ("id", "name", "createdAt", "updatedAt")
SELECT 'abm_' || md5("budgetCode"), "budgetCode", NOW(), NOW()
FROM (
  SELECT DISTINCT "budgetCode"
  FROM "Asset"
  WHERE "budgetCode" IS NOT NULL AND btrim("budgetCode") <> ''
) s;

INSERT INTO "ConsumableCategoryMaster" ("id", "name", "createdAt", "updatedAt")
SELECT 'ccm_' || md5("category"), "category", NOW(), NOW()
FROM (
  SELECT DISTINCT "category"
  FROM "Consumable"
  WHERE "category" IS NOT NULL AND btrim("category") <> ''
) s;
