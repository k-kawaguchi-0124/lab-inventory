-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'CHECKED_OUT', 'BROKEN', 'DISPOSED');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('ASSET', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('ASSET', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CREATE', 'EDIT', 'CHECKOUT', 'CHECKIN', 'MOVE', 'QTY_CHANGE', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentLocationId" TEXT NOT NULL,
    "currentUserId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "budgetCode" TEXT,
    "vendor" TEXT,
    "note" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumable" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reorderThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "locationId" TEXT NOT NULL,
    "note" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "ActionType" NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "qtyDelta" DECIMAL(65,30),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialCounter" (
    "prefix" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialCounter_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "SerialReservation" (
    "serial" TEXT NOT NULL,
    "type" "TargetType" NOT NULL,
    "reservedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerialReservation_pkey" PRIMARY KEY ("serial")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_serial_key" ON "Asset"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Consumable_serial_key" ON "Consumable"("serial");

-- CreateIndex
CREATE INDEX "Photo_ownerType_ownerId_idx" ON "Photo"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "ActivityLog_targetType_targetId_idx" ON "ActivityLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "SerialReservation_expiresAt_idx" ON "SerialReservation"("expiresAt");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentUserId_fkey" FOREIGN KEY ("currentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumable" ADD CONSTRAINT "Consumable_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialReservation" ADD CONSTRAINT "SerialReservation_reservedBy_fkey" FOREIGN KEY ("reservedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
