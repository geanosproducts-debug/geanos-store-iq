import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const shop = process.argv[2];
const amount = Number(process.argv[3]);
const type = process.argv[4] || "manual_grant";

if (!shop) {
  console.error("Please provide the Shopify store address.");
  process.exitCode = 1;
} else if (!Number.isInteger(amount) || amount <= 0) {
  console.error("Please provide a positive whole number of credits.");
  process.exitCode = 1;
} else {
  try {
    const account = await db.$transaction(async (transactionDb) => {
      const existingAccount =
        await transactionDb.mediaCreditAccount.upsert({
          where: { shop },
          create: { shop },
          update: {},
        });

      const updatedAccount =
        await transactionDb.mediaCreditAccount.update({
          where: { id: existingAccount.id },
          data: {
            balance: { increment: amount },
            ...(type === "purchase"
              ? { lifetimePurchased: { increment: amount } }
              : {}),
          },
        });

      await transactionDb.mediaCreditTransaction.create({
        data: {
          accountId: existingAccount.id,
          shop,
          type,
          amount,
          status: "completed",
          externalReference: `${type}:${shop}:${Date.now()}`,
        },
      });

      return updatedAccount;
    });

    console.log(
      `Added ${amount} photo credits to ${shop}. New balance: ${account.balance}`,
    );
  } catch (error) {
    console.error("Unable to add photo credits:", error);
    process.exitCode = 1;
  }
}

await db.$disconnect();