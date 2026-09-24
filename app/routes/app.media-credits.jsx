import {
  useActionData,
  useLoaderData,
  Form,
  useNavigation,
} from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { MEDIA_CREDIT_PACKS, getMediaCreditPackByName } from "../services/media-credit-packs";
import {
  getMediaCreditAccount,
  getRecentMediaCreditTransactions,
  grantMediaCredits,
} from "../services/media-credits.server";
import styles from "../styles/media-tools.module.css";

const CREDIT_TYPE_LABELS = {
  manual_grant: "Credits added manually",
  monthly_allowance: "Monthly credits added",
  purchase: "Additional credits purchased",
  refund: "Processing credit refunded",
  usage: "Video processing",
};

const PROCESSING_TYPE_LABELS = {
  cleanup: "Watermark or overlay removal",
  translate: "Visible text translation",
};

function formatCreditAmount(amount) {
  return amount > 0 ? `+${amount}` : String(amount);
}

function formatTransactionDate(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTransactionStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function reconcileApprovedPurchases(admin, shop) {
  const response = await admin.graphql(`#graphql
    query RecentVideoCreditPurchases {
      currentAppInstallation {
        oneTimePurchases(first: 20, reverse: true) {
          nodes { id name status test price { amount currencyCode } }
        }
      }
    }
  `);
  const result = await response.json();
  if (result.errors?.length) {
    throw new Error("Shopify could not verify the video-credit purchase.");
  }
  for (const purchase of result.data?.currentAppInstallation?.oneTimePurchases?.nodes || []) {
    const pack = getMediaCreditPackByName(purchase.name);
    if (
      purchase.status !== "ACTIVE" || !purchase.id || !pack ||
      Number(purchase.price?.amount) !== Number(pack.price) ||
      purchase.price?.currencyCode !== pack.currencyCode ||
      (shop === "geanos-app-development.myshopify.com" && !purchase.test)
    ) continue;
    try {
      await grantMediaCredits({
        shop, amount: pack.credits, type: "purchase", externalReference: purchase.id,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
  }
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("purchase") === "returned") {
    await reconcileApprovedPurchases(admin, session.shop);
  }

  const [account, transactions] = await Promise.all([
    getMediaCreditAccount(session.shop),
    getRecentMediaCreditTransactions(session.shop, 10),
  ]);

  return {
    account: {
      balance: account.balance,
      lifetimePurchased: account.lifetimePurchased,
      lifetimeUsed: account.lifetimeUsed,
      monthlyAllowance: account.monthlyAllowance,
      rolloverEnabled: account.rolloverEnabled,
    },
    purchaseReturned:
      requestUrl.searchParams.get("purchase") === "returned",
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      createdAt: transaction.createdAt.toISOString(),
      processingType: transaction.processingType,
      status: transaction.status,
      type: transaction.type,
    })),
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const packId = formData.get("packId");
  const pack = MEDIA_CREDIT_PACKS[packId];

  if (!pack) {
    return {
      error: "The selected video-credit pack is not available.",
    };
  }

  const requestUrl = new URL(request.url);
  const returnAddress = new URL("/app/media-credits", requestUrl);
  returnAddress.searchParams.set("purchase", "returned");
  returnAddress.searchParams.set("shop", session.shop);
  const host = requestUrl.searchParams.get("host");
  if (host) {
    returnAddress.searchParams.set("host", host);
    returnAddress.searchParams.set("embedded", "1");
  }
  const returnUrl = returnAddress.toString();

  const response = await admin.graphql(
    `#graphql
      mutation CreatePhotoCreditPurchase(
        $name: String!
        $price: MoneyInput!
        $returnUrl: URL!
        $test: Boolean!
      ) {
        appPurchaseOneTimeCreate(
          name: $name
          price: $price
          returnUrl: $returnUrl
          test: $test
        ) {
          appPurchaseOneTime {
            id
            name
            status
            test
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        name: pack.name,
        price: {
          amount: pack.price,
          currencyCode: pack.currencyCode,
        },
        returnUrl,
        test:
          session.shop === "geanos-app-development.myshopify.com",
      },
    },
  );

  const responseJson = await response.json();
  const purchaseResult =
    responseJson.data?.appPurchaseOneTimeCreate;
  const userErrors = purchaseResult?.userErrors || [];

  if (userErrors.length > 0) {
    return {
      error: userErrors.map((error) => error.message).join(" "),
    };
  }

  if (!purchaseResult?.confirmationUrl) {
    return {
      error:
        "Shopify did not provide a purchase approval link. Please try again.",
    };
  }

  return { confirmationUrl: purchaseResult.confirmationUrl };
}

export default function MediaCredits() {
  const { account, purchaseReturned, transactions } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const creditPacks = Object.values(MEDIA_CREDIT_PACKS);

  return (
    <s-page heading="Video Credit Management">
      <section className={styles.mediaCard}>
        <s-button href="/app/media-tools" variant="primary">
          Back to Video Tools
        </s-button>
      </section>

      {purchaseReturned && (
        <section className={styles.mediaCard}>
          <s-banner tone="info">
            Shopify has returned you to Video Fixer. Credits are added
            after Shopify confirms an approved purchase. Refresh this page
            if the updated balance does not appear immediately.
          </s-banner>
        </section>
      )}

      {actionData?.error && (
        <section className={styles.mediaCard}>
          <s-banner tone="critical">{actionData.error}</s-banner>
        </section>
      )}

      <section className={styles.mediaCard}>
        <s-heading>Available Video Credits</s-heading>

        <s-heading>{account.balance} credits available</s-heading>

        <s-paragraph>
          Each successfully completed watermark-removal or translation
          process uses 1 video credit. Failed processing attempts are
          refunded automatically.
        </s-paragraph>

        {account.balance < 1 && (
          <s-banner tone="warning">
            No video credits are currently available. Purchase or add
            credits before starting video processing.
          </s-banner>
        )}
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Credit Account</s-heading>

        <s-unordered-list>
          <s-list-item>
            Monthly allowance:{" "}
            {account.monthlyAllowance > 0
              ? `${account.monthlyAllowance} credits`
              : "Not configured"}
          </s-list-item>

          <s-list-item>
            Unused credit rollover:{" "}
            {account.rolloverEnabled ? "Enabled" : "Not enabled"}
          </s-list-item>

          <s-list-item>
            Lifetime credits purchased: {account.lifetimePurchased}
          </s-list-item>

          <s-list-item>
            Lifetime credits used: {account.lifetimeUsed}
          </s-list-item>
        </s-unordered-list>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Recent Credit Activity</s-heading>

        {transactions.length === 0 ? (
          <s-paragraph>
            No credit activity has been recorded yet.
          </s-paragraph>
        ) : (
          <s-unordered-list>
            {transactions.map((transaction) => {
              const activityLabel =
                transaction.type === "usage"
                  ? PROCESSING_TYPE_LABELS[
                      transaction.processingType
                    ] || "Video processing"
                  : CREDIT_TYPE_LABELS[transaction.type] ||
                    "Credit adjustment";

              return (
                <s-list-item key={transaction.id}>
                  {formatTransactionDate(transaction.createdAt)} {" - "}
                  {activityLabel} {" - "}
                  {formatCreditAmount(transaction.amount)} credit
                  {Math.abs(transaction.amount) === 1 ? "" : "s"} {" - "}
                  {formatTransactionStatus(transaction.status)}
                </s-list-item>
              );
            })}
          </s-unordered-list>
        )}
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Buy More Credits</s-heading>

        <s-paragraph>
          Purchase additional video credits securely through Shopify.
          Credit packs are one-time purchases and unused credits remain
          available because rollover is enabled.
        </s-paragraph>
      </section>

      {creditPacks.map((pack) => (
        <section className={styles.mediaCard} key={pack.id}>
          <s-heading>{pack.displayName}</s-heading>
          <s-heading>${pack.price}</s-heading>

          <s-paragraph>USD</s-paragraph>

          <s-paragraph>
            Save ${pack.savings} compared with the standard value of
            $2.00 USD per credit.
          </s-paragraph>

          <Form method="post">
            <input type="hidden" name="packId" value={pack.id} />
            <s-button type="submit" variant="primary" disabled={navigation.state !== "idle"}>
              Buy {pack.credits} Credits
            </s-button>
          </Form>
        </section>
      ))}

      {actionData?.confirmationUrl && (
        <section className={styles.mediaCard}>
          <s-banner tone="info">
            Continue to Shopify to review and approve this one-time video-credit purchase.
          </s-banner>
          <s-button href={actionData.confirmationUrl} target="_top" variant="primary">
            Continue to Shopify approval
          </s-button>
        </section>
      )}
    </s-page>
  );
}

