import {
  redirect,
  useActionData,
  useLoaderData,
  useSubmit,
} from "react-router";
import { authenticate } from "../shopify.server";
import { MEDIA_CREDIT_PACKS } from "../services/media-credit-packs";
import {
  getMediaCreditAccount,
  getRecentMediaCreditTransactions,
} from "../services/media-credits.server";
import styles from "../styles/media-tools.module.css";

const CREDIT_TYPE_LABELS = {
  manual_grant: "Credits added manually",
  monthly_allowance: "Monthly credits added",
  purchase: "Additional credits purchased",
  refund: "Processing credit refunded",
  usage: "Photo processing",
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

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);

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
      requestUrl.searchParams.get("purchase") === "approved",
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
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const packId = formData.get("packId");
  const pack = MEDIA_CREDIT_PACKS[packId];

  if (!pack) {
    return {
      error: "The selected photo-credit pack is not available.",
    };
  }

  const returnUrl = new URL(
    "/app/media-credits?purchase=approved",
    request.url,
  ).toString();

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
          process.env.SHOPIFY_BILLING_TEST === "true" ||
          process.env.NODE_ENV !== "production",
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

  throw redirect(purchaseResult.confirmationUrl);
}

export default function MediaCredits() {
  const { account, purchaseReturned, transactions } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const creditPacks = Object.values(MEDIA_CREDIT_PACKS);

  return (
    <s-page heading="Photo Credit Management">
      <section className={styles.mediaCard}>
        <s-button href="/app/media-tools" variant="primary">
          ← Back to Media Tools
        </s-button>
      </section>

      {purchaseReturned && (
        <section className={styles.mediaCard}>
          <s-banner tone="success">
            Shopify has returned you to GEANOS Store IQ. Approved photo
            credits are added automatically when Shopify confirms the
            purchase. Refresh this page if the updated balance does not
            appear immediately.
          </s-banner>
        </section>
      )}

      {actionData?.error && (
        <section className={styles.mediaCard}>
          <s-banner tone="critical">{actionData.error}</s-banner>
        </section>
      )}

      <section className={styles.mediaCard}>
        <s-heading>Available Photo Credits</s-heading>

        <s-heading>{account.balance} credits available</s-heading>

        <s-paragraph>
          Each successfully completed watermark-removal or translation
          process uses 1 photo credit. Failed processing attempts are
          refunded automatically.
        </s-paragraph>

        {account.balance < 1 && (
          <s-banner tone="warning">
            No photo credits are currently available. Purchase or add
            credits before starting photo processing.
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
                    ] || "Photo processing"
                  : CREDIT_TYPE_LABELS[transaction.type] ||
                    "Credit adjustment";

              return (
                <s-list-item key={transaction.id}>
                  {formatTransactionDate(transaction.createdAt)} —{" "}
                  {activityLabel} —{" "}
                  {formatCreditAmount(transaction.amount)} credit
                  {Math.abs(transaction.amount) === 1 ? "" : "s"} —{" "}
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
          Purchase additional photo credits securely through Shopify.
          Credit packs are one-time purchases and unused credits remain
          available because rollover is enabled.
        </s-paragraph>
      </section>

      {creditPacks.map((pack) => (
        <section className={styles.mediaCard} key={pack.id}>
          <s-heading>{pack.credits}-Credit Pack</s-heading>
          <s-heading>${pack.price}</s-heading>

          <s-paragraph>USD</s-paragraph>

          <s-paragraph>
            Save ${pack.savings} compared with the standard value of
            $1.00 per credit.
          </s-paragraph>

          <s-button
            onClick={() =>
              submit(
                { packId: pack.id },
                { method: "post" },
              )
            }
            variant="primary"
          >
            Buy {pack.credits} Credits
          </s-button>
        </section>
      ))}
    </s-page>
  );
}