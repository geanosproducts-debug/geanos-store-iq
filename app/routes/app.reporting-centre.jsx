import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const currentYear = new Date().getUTCFullYear();
  const annualStartDate = `${currentYear}-01-01`;
  const orderQuery = `processed_at:>=${annualStartDate}`;

  const products = [];
let productCursor = null;
let hasMoreProducts = true;

while (hasMoreProducts) {
  const response = await admin.graphql(
    `#graphql
      query ReportingCentreProducts($productCursor: String) {
        products(first: 250, after: $productCursor) {
          nodes {
            id
            title
            status
            handle
            totalInventory
            tracksInventory
            description
            updatedAt
            vendor
            productType
            featuredMedia {
              alt
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    {
      variables: {
        productCursor,
      },
    },
  );

  const data = await response.json();
  const productConnection = data.data.products;

  products.push(...productConnection.nodes);

  hasMoreProducts = productConnection.pageInfo.hasNextPage;
  productCursor = productConnection.pageInfo.endCursor;
}
  const orders = [];
  let orderCursor = null;
  let hasMoreOrders = true;

  while (hasMoreOrders) {
    const response = await admin.graphql(
      `#graphql
        query ReportingCentreOrders(
          $orderCursor: String
          $orderQuery: String!
        ) {
          orders(
            first: 100
            after: $orderCursor
            sortKey: PROCESSED_AT
            reverse: true
            query: $orderQuery
          ) {
            nodes {
              id
              processedAt
              test
              cancelledAt
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        variables: {
          orderCursor,
          orderQuery,
        },
      },
    );

    const data = await response.json();
    const orderConnection = data.data.orders;

    orders.push(...orderConnection.nodes);

    hasMoreOrders = orderConnection.pageInfo.hasNextPage;
    orderCursor = orderConnection.pageInfo.endCursor;
  }

 return {
  products,
  orders,
  generatedAt: new Date().toISOString(),
};
}

function getPeriodStart(period) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  if (period === "Weekly") {
    const daysSinceMonday = (startDate.getDay() + 6) % 7;
    startDate.setDate(startDate.getDate() - daysSinceMonday);
  }

  if (period === "Monthly") {
    startDate.setDate(1);
  }

  if (period === "Quarterly") {
    const quarterStartMonth = Math.floor(startDate.getMonth() / 3) * 3;
    startDate.setMonth(quarterStartMonth, 1);
  }

  if (period === "Annual") {
    startDate.setMonth(0, 1);
  }

  return startDate;
}

function formatReportDate(date) {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ReportingCentre() {
const { products, orders, generatedAt } = useLoaderData();
const [selectedPeriod, setSelectedPeriod] = useState("Weekly");

const reportStartDate = getPeriodStart(selectedPeriod);
const reportEndDate = new Date();
const activeProducts = products.filter(
  (product) => product.status === "ACTIVE",
);

const trackedProducts = activeProducts.filter(
  (product) => product.tracksInventory,
);

const totalInventory = trackedProducts.reduce(
  (total, product) => total + (product.totalInventory ?? 0),
  0,
);

const outOfStockProducts = trackedProducts.filter(
  (product) => (product.totalInventory ?? 0) <= 0,
);

const lowStockProducts = trackedProducts.filter(
  (product) =>
    (product.totalInventory ?? 0) > 0 &&
    (product.totalInventory ?? 0) <= 10,
);

const highStockProducts = trackedProducts.filter(
  (product) => (product.totalInventory ?? 0) >= 50,
);

const validOrders = orders.filter(
  (order) => !order.test && !order.cancelledAt,
);

const reportOrders = validOrders.filter((order) => {
  const processedAt = new Date(order.processedAt);

  return processedAt >= reportStartDate && processedAt <= reportEndDate;
});

const reportRevenue = reportOrders.reduce(
  (total, order) =>
    total +
    Number(order.currentTotalPriceSet?.shopMoney?.amount || 0),
  0,
);

const reportCurrency =
  reportOrders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ||
  validOrders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ||
  "AUD";

const averageOrderValue =
  reportOrders.length > 0 ? reportRevenue / reportOrders.length : 0;

const formattedGeneratedAt = new Date(generatedAt).toLocaleString("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
});

  return (
    <s-page heading="Reporting Centre">
      <s-section heading="Business Reports">
        <s-paragraph>
          Create clear business reports using the analysis and intelligence
          collected throughout GEANOS Store IQ.
        </s-paragraph>
      </s-section>

      <s-section heading="Reporting Periods">
        <s-paragraph>
          Select the calendar period to be covered by the business report.
        </s-paragraph>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <s-button onClick={() => setSelectedPeriod("Weekly")}>
            Weekly Report
          </s-button>

          <s-button onClick={() => setSelectedPeriod("Monthly")}>
            Monthly Report
          </s-button>

          <s-button onClick={() => setSelectedPeriod("Quarterly")}>
            Quarterly Report
          </s-button>

          <s-button onClick={() => setSelectedPeriod("Annual")}>
            Annual Report
          </s-button>
        </div>

        <div style={{ marginTop: "16px" }}>
          <s-paragraph>
            Selected reporting period: <strong>{selectedPeriod}</strong>
          </s-paragraph>

          <s-paragraph>
            Report dates:{" "}
            <strong>
              {formatReportDate(reportStartDate)} to{" "}
              {formatReportDate(reportEndDate)}
            </strong>
          </s-paragraph>
        </div>
      </s-section>
     <s-section heading={`${selectedPeriod} Sales Summary`}>
  <s-paragraph>
    Active products: <strong>{activeProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
    Inventory-tracked products: <strong>{trackedProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
    Total available inventory: <strong>{totalInventory}</strong>
  </s-paragraph>

  <s-paragraph>
    Out-of-stock products: <strong>{outOfStockProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
    Low-stock products: <strong>{lowStockProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
    High-stock products: <strong>{highStockProducts.length}</strong>
  </s-paragraph>
</s-section>
      <s-section heading={`${selectedPeriod} Sales Summary`}>
  <s-paragraph>
    Report generated: <strong>{formattedGeneratedAt}</strong>
  </s-paragraph>

  <s-paragraph>
    Completed non-test orders: <strong>{reportOrders.length}</strong>
  </s-paragraph>

  <s-paragraph>
    Revenue:{" "}
    <strong>
      {new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: reportCurrency,
      }).format(reportRevenue)}
    </strong>
  </s-paragraph>

  <s-paragraph>
    Average order value:{" "}
    <strong>
      {new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: reportCurrency,
      }).format(averageOrderValue)}
    </strong>
  </s-paragraph>
</s-section>

      <s-section heading="Report Exports">
        <s-paragraph>
          Reports will include executive summaries and options to export to
          PDF and Excel.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}