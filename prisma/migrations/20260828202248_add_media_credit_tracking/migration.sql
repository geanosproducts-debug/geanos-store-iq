-- CreateTable
CREATE TABLE "MediaCreditAccount" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "monthlyAllowance" INTEGER NOT NULL DEFAULT 0,
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
    "lifetimeUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCreditTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "processingType" TEXT,
    "requestId" TEXT,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaCreditAccount_shop_key" ON "MediaCreditAccount"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCreditTransaction_requestId_key" ON "MediaCreditTransaction"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCreditTransaction_externalReference_key" ON "MediaCreditTransaction"("externalReference");

-- CreateIndex
CREATE INDEX "MediaCreditTransaction_shop_createdAt_idx" ON "MediaCreditTransaction"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "MediaCreditTransaction_accountId_createdAt_idx" ON "MediaCreditTransaction"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaCreditTransaction" ADD CONSTRAINT "MediaCreditTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MediaCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
