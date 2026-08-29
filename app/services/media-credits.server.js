import db from "../db.server";

export class InsufficientMediaCreditsError extends Error {
  constructor() {
    super("No photo credits are available.");
    this.name = "InsufficientMediaCreditsError";
  }
}

export async function getMediaCreditAccount(shop) {
  return db.mediaCreditAccount.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export async function getRecentMediaCreditTransactions(shop, limit = 10) {
  const safeLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), 50)
    : 10;

  return db.mediaCreditTransaction.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
}

export async function grantMediaCredits({
  shop,
  amount,
  type = "manual_grant",
  externalReference,
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Credit grant amount must be a positive whole number.");
  }

  return db.$transaction(async (transactionDb) => {
    const account = await transactionDb.mediaCreditAccount.upsert({
      where: { shop },
      create: { shop },
      update: {},
    });

    const updatedAccount = await transactionDb.mediaCreditAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: amount },
        ...(type === "purchase"
          ? { lifetimePurchased: { increment: amount } }
          : {}),
      },
    });

    await transactionDb.mediaCreditTransaction.create({
      data: {
        accountId: account.id,
        shop,
        type,
        amount,
        externalReference,
      },
    });

    return updatedAccount;
  });
}

export async function reserveMediaCredit({
  shop,
  processingType,
  requestId,
}) {
  if (!requestId) {
    throw new Error("A processing request ID is required.");
  }

  return db.$transaction(async (transactionDb) => {
    const account = await transactionDb.mediaCreditAccount.upsert({
      where: { shop },
      create: { shop },
      update: {},
    });

    const balanceUpdate = await transactionDb.mediaCreditAccount.updateMany({
      where: {
        id: account.id,
        balance: { gte: 1 },
      },
      data: {
        balance: { decrement: 1 },
        lifetimeUsed: { increment: 1 },
      },
    });

    if (balanceUpdate.count !== 1) {
      throw new InsufficientMediaCreditsError();
    }

    const creditTransaction =
      await transactionDb.mediaCreditTransaction.create({
        data: {
          accountId: account.id,
          shop,
          type: "usage",
          amount: -1,
          processingType,
          requestId,
          status: "reserved",
        },
      });

    const updatedAccount =
      await transactionDb.mediaCreditAccount.findUniqueOrThrow({
        where: { id: account.id },
      });

    return {
      account: updatedAccount,
      transaction: creditTransaction,
    };
  });
}

export async function completeMediaCredit(requestId) {
  await db.mediaCreditTransaction.updateMany({
    where: {
      requestId,
      status: "reserved",
    },
    data: {
      status: "completed",
    },
  });
}

export async function refundMediaCredit(requestId) {
  return db.$transaction(async (transactionDb) => {
    const usageTransaction =
      await transactionDb.mediaCreditTransaction.findUnique({
        where: { requestId },
      });

    if (!usageTransaction || usageTransaction.status !== "reserved") {
      return null;
    }

    await transactionDb.mediaCreditTransaction.update({
      where: { id: usageTransaction.id },
      data: { status: "refunded" },
    });

    const updatedAccount = await transactionDb.mediaCreditAccount.update({
      where: { id: usageTransaction.accountId },
      data: {
        balance: { increment: 1 },
        lifetimeUsed: { decrement: 1 },
      },
    });

    await transactionDb.mediaCreditTransaction.create({
      data: {
        accountId: usageTransaction.accountId,
        shop: usageTransaction.shop,
        type: "refund",
        amount: 1,
        processingType: usageTransaction.processingType,
        externalReference: `refund:${usageTransaction.id}`,
        status: "completed",
      },
    });

    return updatedAccount;
  });
}