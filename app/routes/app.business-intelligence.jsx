import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
       const products = [];
  let cursor = null;
  let hasNextPage = true;
  const orders = [];
let orderCursor = null;
let hasNextOrderPage = true;
while (hasNextPage) {
  const productsResponse = await admin.graphql(
    `#graphql
    query BusinessIntelligenceProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        nodes {
          id
          title
          status
          vendor
          productType
          totalInventory
          tracksInventory
          createdAt
          updatedAt
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
        cursor,
      },
    },
  );

  const productsResponseJson = await productsResponse.json();
  const productPage = productsResponseJson.data.products;

  products.push(...productPage.nodes);
  hasNextPage = productPage.pageInfo.hasNextPage;
  cursor = productPage.pageInfo.endCursor;
  while (hasNextOrderPage) {
  const ordersResponse = await admin.graphql(
    `#graphql
    query BusinessIntelligenceOrders($cursor: String) {
      orders(first: 50, after: $cursor) {
        nodes {
          id
          createdAt
          customerJourneySummary {
  customerOrderIndex
  daysToConversion
}
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 250) {
            nodes {
              quantity
              product {
                id
              }
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
        cursor: orderCursor,
      },
    },
  );

  const ordersResponseJson = await ordersResponse.json();
  const orderPage = ordersResponseJson.data.orders;

  orders.push(...orderPage.nodes);
  hasNextOrderPage = orderPage.pageInfo.hasNextPage;
  orderCursor = orderPage.pageInfo.endCursor;
}
}
  const response = await admin.graphql(`
    #graphql
    query BusinessIntelligence {
      shop {
        name
        currencyCode
      }
    }
  `);

  const { data } = await response.json();

  return {
      orders,
      products,
    shop: data.shop,
  };
};
export default function BusinessIntelligence() {
    const { shop, products, orders } = useLoaderData();
    const activeProducts = products.filter(
  (product) => product.status === "ACTIVE",
);
const activeProductRate =
  products.length > 0 ? (activeProducts.length / products.length) * 100 : 0;
 const activeOutOfStockProducts = activeProducts.filter(
  (product) => product.tracksInventory && product.totalInventory <= 0,
);

const activeLowStockProducts = activeProducts.filter(
  (product) =>
    product.tracksInventory &&
    product.totalInventory > 0 &&
    product.totalInventory <= 10,
);
const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

const staleActiveProducts = activeProducts.filter(
  (product) => new Date(product.updatedAt) < ninetyDaysAgo,
);
const stockRiskProductCount =
  activeOutOfStockProducts.length + activeLowStockProducts.length;

const stockRiskRate =
  activeProducts.length > 0
    ? (stockRiskProductCount / activeProducts.length) * 100
    : 0;

const totalRevenue = orders.reduce(
  (total, order) =>
    total + Number(order.currentTotalPriceSet.shopMoney.amount),
  0,
);
const averageOrderValue =
  orders.length > 0 ? totalRevenue / orders.length : 0;

  const averageRevenuePerDay = totalRevenue / 60;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
const currentPeriodOrders = orders.filter(
  (order) => new Date(order.createdAt) >= thirtyDaysAgo,
);

const previousPeriodOrders = orders.filter(
  
  (order) =>
    new Date(order.createdAt) >= sixtyDaysAgo &&
    new Date(order.createdAt) < thirtyDaysAgo,
);

const currentPeriodRevenue = currentPeriodOrders.reduce(
  (total, order) =>
    total + Number(order.currentTotalPriceSet.shopMoney.amount),
  0,
);

const previousPeriodRevenue = previousPeriodOrders.reduce(
  (total, order) =>
    total + Number(order.currentTotalPriceSet.shopMoney.amount),
  0,
);

const revenueGrowthRate =
  previousPeriodRevenue > 0
    ? ((currentPeriodRevenue - previousPeriodRevenue) /
        previousPeriodRevenue) *
      100
    : null;

    const orderGrowthRate =
  previousPeriodOrders.length > 0
    ? ((currentPeriodOrders.length - previousPeriodOrders.length) /
        previousPeriodOrders.length) *
      100
    : null;
  
const customerOrders = orders.filter(
  (order) => order.customerJourneySummary?.customerOrderIndex != null,
);

const newCustomerOrders = customerOrders.filter(
  (order) => order.customerJourneySummary.customerOrderIndex === 1,
);
const returningCustomerOrders = customerOrders.filter(
  (order) => order.customerJourneySummary.customerOrderIndex > 1,
)
const returningCustomerOrderRate =
  customerOrders.length > 0
    ? (returningCustomerOrders.length / customerOrders.length) * 100
    : null;

    const conversionOrders = customerOrders.filter(
  (order) => order.customerJourneySummary?.daysToConversion != null,
);
const averageDaysToConversion =
  conversionOrders.length > 0
    ? conversionOrders.reduce(
        (total, order) =>
          total + order.customerJourneySummary.daysToConversion,
        0,
      ) / conversionOrders.length
    : null;

  return (
    <s-page heading="Business Intelligence">
            <s-button href="/app/business-analysis" variant="tertiary">
        ← Back to Business Analysis
      </s-button>
      <s-section heading="Business Intelligence Overview">
        <s-paragraph>
          Analyse your Shopify business as a whole to identify health, risks,
          opportunities, growth, and priorities.
        </s-paragraph>
                <s-paragraph>
          Store: {shop.name}
        </s-paragraph>
        <s-paragraph>
  Total products analysed: {products.length}
</s-paragraph>
      </s-section>
      <s-section heading="Revenue Analysis">
  <s-paragraph>
    Total revenue: {shop.currencyCode} {totalRevenue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Orders analysed: {orders.length}
  </s-paragraph>
  <s-paragraph>
    Average order value: {shop.currencyCode} {averageOrderValue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Average revenue per day: {shop.currencyCode} {averageRevenuePerDay.toFixed(2)}
  </s-paragraph>
</s-section>
      <s-section heading="Growth Analysis">
  <s-paragraph>
    Revenue - last 30 days: {shop.currencyCode} {currentPeriodRevenue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Revenue - previous 30 days: {shop.currencyCode} {previousPeriodRevenue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Revenue growth: {revenueGrowthRate !== null ? `${revenueGrowthRate.toFixed(1)}%` : "Not enough previous-period data"}
  </s-paragraph>
  <s-paragraph>
    Orders - last 30 days: {currentPeriodOrders.length}
  </s-paragraph>
  <s-paragraph>
    Orders - previous 30 days: {previousPeriodOrders.length}
  </s-paragraph>
  <s-paragraph>
    Order growth: {orderGrowthRate !== null ? `${orderGrowthRate.toFixed(1)}%` : "Not enough previous-period data"}
  </s-paragraph>
</s-section>
<s-section heading="Customer Behaviour">
  <s-paragraph>
    Customer orders analysed: {customerOrders.length}
  </s-paragraph>
  <s-paragraph>
    New-customer orders: {newCustomerOrders.length}
  </s-paragraph>
  <s-paragraph>
    Returning-customer orders: {returningCustomerOrders.length}
  </s-paragraph>
  <s-paragraph>
    Returning-customer order rate: {returningCustomerOrderRate !== null ? `${returningCustomerOrderRate.toFixed(1)}%` : "Not enough customer data"}
  </s-paragraph>
  <s-paragraph>
    Average days to conversion: {averageDaysToConversion !== null ? averageDaysToConversion.toFixed(1) : "Not enough conversion data"}
  </s-paragraph>
</s-section>
        <s-section heading="Business Health">
  <s-paragraph>
    Active products: {activeProducts.length}
  </s-paragraph>
  <s-paragraph>
    Active product rate: {activeProductRate.toFixed(1)}%
  </s-paragraph>
  <s-paragraph>
    Active products out of stock: {activeOutOfStockProducts.length}
  </s-paragraph>
  <s-paragraph>
    Active products low in stock: {activeLowStockProducts.length}
  </s-paragraph>
  <s-paragraph>
    Active products not updated in 90 days: {staleActiveProducts.length}
  </s-paragraph>
  <s-paragraph>
    Orders analysed from the last 60 days: {orders.length}
  </s-paragraph>
</s-section>
<s-section heading="Key Performance Indicators">
  <s-paragraph>
    Revenue - last 30 days: {shop.currencyCode} {currentPeriodRevenue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Orders - last 30 days: {currentPeriodOrders.length}
  </s-paragraph>
  <s-paragraph>
    Average order value: {shop.currencyCode} {averageOrderValue.toFixed(2)}
  </s-paragraph>
  <s-paragraph>
    Revenue growth: {revenueGrowthRate !== null ? `${revenueGrowthRate.toFixed(1)}%` : "Not enough previous-period data"}
  </s-paragraph>
  <s-paragraph>
    Returning-customer order rate: {returningCustomerOrderRate !== null ? `${returningCustomerOrderRate.toFixed(1)}%` : "Not enough customer data"}
  </s-paragraph>
  <s-paragraph>
    Active product rate: {activeProductRate.toFixed(1)}%
  </s-paragraph>
  <s-paragraph>
    Stock risk rate: {stockRiskRate.toFixed(1)}%
  </s-paragraph>
</s-section>
    </s-page>
  );
}