import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import writeExcelFile from "write-excel-file/browser";
import { jsPDF } from "jspdf";
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

const missingDescriptionProducts = activeProducts.filter(
  (product) => !product.description?.trim(),
);

const missingImageProducts = activeProducts.filter(
  (product) => !product.featuredMedia,
);

const missingImageAltProducts = activeProducts.filter(
  (product) =>
    product.featuredMedia && !product.featuredMedia.alt?.trim(),
);

const missingVendorProducts = activeProducts.filter(
  (product) => !product.vendor?.trim(),
);

const missingProductTypeProducts = activeProducts.filter(
  (product) => !product.productType?.trim(),
);

const staleProducts = activeProducts.filter(
  (product) =>
    Date.now() - new Date(product.updatedAt).getTime() >
    90 * 24 * 60 * 60 * 1000,
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

 const exportToExcel = async () => {
  const reportRows = [
    [
      {
        value: "GEANOS Store IQ Business Report",
        fontWeight: "bold",
        fontSize: 16,
      },
      { value: "" },
    ],
    [
      { value: "Reporting period", fontWeight: "bold" },
      { value: selectedPeriod },
    ],
    [
      { value: "Report dates", fontWeight: "bold" },
      {
        value: `${formatReportDate(reportStartDate)} to ${formatReportDate(
          reportEndDate,
        )}`,
      },
    ],
    [
      { value: "Report generated", fontWeight: "bold" },
      { value: formattedGeneratedAt },
    ],
    [{ value: "" }, { value: "" }],
    [
      {
        value: "Sales Summary",
        fontWeight: "bold",
        backgroundColor: "#E8F0FE",
      },
      { value: "" },
    ],
    [
      { value: "Completed non-test orders" },
      { value: reportOrders.length, type: Number },
    ],
    [
      { value: `Revenue (${reportCurrency})` },
      { value: reportRevenue, type: Number },
    ],
    [
      { value: `Average order value (${reportCurrency})` },
      { value: averageOrderValue, type: Number },
    ],
    [{ value: "" }, { value: "" }],
    [
      {
        value: "Current Inventory Snapshot",
        fontWeight: "bold",
        backgroundColor: "#E8F0FE",
      },
      { value: "" },
    ],
    [{ value: "Active products" }, { value: activeProducts.length, type: Number }],
    [
      { value: "Inventory-tracked products" },
      { value: trackedProducts.length, type: Number },
    ],
    [
      { value: "Total available inventory" },
     { value: totalInventory, type: Number, format: "#,##0" },
    ],
    [
      { value: "Out-of-stock products" },
      { value: outOfStockProducts.length, type: Number },
    ],
    [
      { value: "Low-stock products" },
      { value: lowStockProducts.length, type: Number },
    ],
    [
      { value: "High-stock products" },
      { value: highStockProducts.length, type: Number },
    ],
    [{ value: "" }, { value: "" }],
    [
      {
        value: "Product Health Summary",
        fontWeight: "bold",
        backgroundColor: "#E8F0FE",
      },
      { value: "" },
    ],
    [
      { value: "Products missing descriptions" },
      { value: missingDescriptionProducts.length, type: Number },
    ],
    [
      { value: "Products missing featured images" },
      { value: missingImageProducts.length, type: Number },
    ],
    [
      { value: "Featured images missing alt text" },
      { value: missingImageAltProducts.length, type: Number },
    ],
    [
      { value: "Products missing vendors" },
      { value: missingVendorProducts.length, type: Number },
    ],
    [
      { value: "Products missing product types" },
      { value: missingProductTypeProducts.length, type: Number },
    ],
    [
      { value: "Products not updated within 90 days" },
      { value: staleProducts.length, type: Number },
    ],
  ];

  const fileDate = reportEndDate.toISOString().slice(0, 10);
  const fileName = `GEANOS ${selectedPeriod} Report ${fileDate}.xlsx`;

  await writeExcelFile(reportRows, {
    columns: [{ width: 38 }, { width: 32 }],
  }).toFile(fileName);
};
const exportToPdf = () => {
  const document = new jsPDF();
  const pageWidth = document.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 30;
  let verticalPosition = 18;

  const addText = (
    text,
    { bold = false, size = 11, gap = 7 } = {},
  ) => {
    document.setFont("helvetica", bold ? "bold" : "normal");
    document.setFontSize(size);

    const lines = document.splitTextToSize(String(text), contentWidth);
    const requiredHeight = lines.length * 6 + gap;

    if (verticalPosition + requiredHeight > 280) {
      document.addPage();
      verticalPosition = 18;
    }

    document.text(lines, 15, verticalPosition);
    verticalPosition += requiredHeight;
  };

  const formattedRevenue = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: reportCurrency,
  }).format(reportRevenue);

  const formattedAverageOrderValue = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: reportCurrency,
  }).format(averageOrderValue);

  addText("GEANOS Store IQ Business Report", {
    bold: true,
    size: 18,
    gap: 10,
  });

  addText(`Reporting period: ${selectedPeriod}`, { bold: true });
  addText(
    `Report dates: ${formatReportDate(
      reportStartDate,
    )} to ${formatReportDate(reportEndDate)}`,
  );
  addText(`Report generated: ${formattedGeneratedAt}`, { gap: 10 });

  addText("Executive Summary", {
    bold: true,
    size: 14,
  });

  addText(
    `${reportOrders.length} completed non-test orders generated ${formattedRevenue} in revenue during this reporting period.`,
  );

 addText(
  `${trackedProducts.length} active products are inventory-tracked, with ${totalInventory.toLocaleString("en-AU")} total units available. ${outOfStockProducts.length} products are out of stock and ${lowStockProducts.length} ${
    lowStockProducts.length === 1 ? "is" : "are"
  } low in stock.`,
  );

  addText(
    `${missingDescriptionProducts.length} products are missing descriptions, ${missingImageProducts.length} are missing featured images, and ${missingProductTypeProducts.length} are missing product types.`,
    { gap: 10 },
  );

  addText("Sales Summary", {
    bold: true,
    size: 14,
  });

  addText(`Completed non-test orders: ${reportOrders.length}`);
  addText(`Revenue: ${formattedRevenue}`);
  addText(`Average order value: ${formattedAverageOrderValue}`, {
    gap: 10,
  });
document.addPage();
verticalPosition = 18;

  addText("Current Inventory Snapshot", {
    bold: true,
    size: 14,
  });

  addText(`Active products: ${activeProducts.length}`);
  addText(`Inventory-tracked products: ${trackedProducts.length}`);
  addText(
  `Total available inventory: ${totalInventory.toLocaleString("en-AU")}`,
);
  addText(`Out-of-stock products: ${outOfStockProducts.length}`);
  addText(`Low-stock products: ${lowStockProducts.length}`);
  addText(`High-stock products: ${highStockProducts.length}`, {
    gap: 10,
  });

  addText("Product Health Summary", {
    bold: true,
    size: 14,
  });

  addText(
    `Products missing descriptions: ${missingDescriptionProducts.length}`,
  );
  addText(
    `Products missing featured images: ${missingImageProducts.length}`,
  );
  addText(
    `Featured images missing alt text: ${missingImageAltProducts.length}`,
  );
  addText(`Products missing vendors: ${missingVendorProducts.length}`);
  addText(
    `Products missing product types: ${missingProductTypeProducts.length}`,
  );
  addText(`Products not updated within 90 days: ${staleProducts.length}`);

  const fileDate = reportEndDate.toISOString().slice(0, 10);
  const fileName = `GEANOS ${selectedPeriod} Report ${fileDate}.pdf`;

  document.save(fileName);
};
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
    <s-section heading={`${selectedPeriod} Executive Summary`}>
  <s-paragraph>
    This report covers the calendar period from{" "}
    <strong>{formatReportDate(reportStartDate)}</strong> to{" "}
    <strong>{formatReportDate(reportEndDate)}</strong> using live Store IQ
    data.
  </s-paragraph>

  <s-paragraph>
    Sales performance: <strong>{reportOrders.length}</strong> completed
    non-test orders generated{" "}
    <strong>
      {new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: reportCurrency,
      }).format(reportRevenue)}
    </strong>{" "}
    in revenue.
  </s-paragraph>

  <s-paragraph>
  Inventory position: <strong>{trackedProducts.length}</strong> active
  products are inventory-tracked, with{" "}
  <strong>{totalInventory.toLocaleString("en-AU")}</strong> total units
  available.{" "}
  <strong>{outOfStockProducts.length}</strong> products are out of stock
  and <strong>{lowStockProducts.length}</strong>{" "}
  {lowStockProducts.length === 1 ? "is" : "are"} low in stock.
</s-paragraph>

  <s-paragraph>
    Product health:{" "}
    <strong>{missingDescriptionProducts.length}</strong> products are missing
    descriptions, <strong>{missingImageProducts.length}</strong> are missing
    featured images, and{" "}
    <strong>{missingProductTypeProducts.length}</strong> are missing product
    types.
  </s-paragraph>

  <s-paragraph>
    <strong>Recommended focus: </strong>
    {reportOrders.length === 0
      ? "Prioritise qualified traffic and conversion activity while resolving the most important inventory and product-quality issues."
      : outOfStockProducts.length > 0
        ? "Review out-of-stock products first, then use the sales results to guide replenishment and promotion decisions."
        : "Use the sales results to strengthen successful products while continuing to improve product information and inventory coverage."}
  </s-paragraph>
</s-section> 
<s-section heading={`${selectedPeriod} Sales Summary`}>
  <s-paragraph>
    Active products: <strong>{activeProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
    Inventory-tracked products: <strong>{trackedProducts.length}</strong>
  </s-paragraph>

  <s-paragraph>
Total available inventory:{" "}
<strong>{totalInventory.toLocaleString("en-AU")}</strong>
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
        <s-button onClick={exportToExcel}>
  Export to Excel
</s-button>
<s-button onClick={exportToPdf}>
  Export to PDF
</s-button>
      </s-section>
    </s-page>
  );
}