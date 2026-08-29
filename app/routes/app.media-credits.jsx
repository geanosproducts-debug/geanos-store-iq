import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMediaCreditAccount,
  getRecentMediaCreditTransactions,
} from "../services/media-credits.server";

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

export default function MediaCredits() {
  const { account, transactions } = useLoaderData();

  return (
    <s-page heading="Photo Credit Management">
      <s-section>
        <s-button href="/app/media-tools">
          ← Back to Media Tools
        </s-button>
      </s-section>

      <s-section heading="Available Photo Credits">
        <s-heading>{account.balance} credits available</s-heading>

        <s-paragraph>
          Each successfully completed watermark-removal or translation process
          uses 1 photo credit. Failed processing attempts are refunded
          automatically.
        </s-paragraph>

        {account.balance < 1 && (
          <s-banner tone="warning">
            No photo credits are currently available. Purchase or add credits
            before starting photo processing.
          </s-banner>
        )}
      </s-section>

      <s-section heading="Credit Account">
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
      </s-section>

      <s-section heading="Recent Credit Activity">
        {transactions.length === 0 ? (
          <s-paragraph>No credit activity has been recorded yet.</s-paragraph>
        ) : (
          <s-unordered-list>
            {transactions.map((transaction) => {
                            const activityLabel =
                transaction.type === "usage"
                  ? PROCESSING_TYPE_LABELS[transaction.processingType] ||
                    "Photo processing"
                  : CREDIT_TYPE_LABELS[transaction.type] ||
                    "Credit adjustment";

              return (
                <s-list-item key={transaction.id}>
                  {formatTransactionDate(transaction.createdAt)} —{" "}
                  {activityLabel} — {formatCreditAmount(transaction.amount)}{" "}
                  credit{Math.abs(transaction.amount) === 1 ? "" : "s"} —{" "}
                  {formatTransactionStatus(transaction.status)}
                </s-list-item>
              );
            })}
          </s-unordered-list>
        )}
      </s-section>

      <s-section heading="Buy More Credits">
        <s-paragraph>
          Additional photo-credit packs will be purchased securely through
          Shopify Billing. This payment connection will be completed in the
          next billing build.
        </s-paragraph>

        <s-button disabled>
          Buy More Credits - Next Build
        </s-button>
      </s-section>
    </s-page>
  );
}