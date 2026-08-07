import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query AdvisorProducts {
        products(first: 100) {
          nodes {
            id
            title
            status
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
        }
          orders(first: 100, sortKey: PROCESSED_AT, reverse: true) {
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
}
      }
    `,
  );

  const data = await response.json();

  return {
    products: data.data.products.nodes,
    orders: data.data.orders.nodes,
  };
}

export default function AiBusinessAdvisor() {
  const { products, orders } = useLoaderData();
  const validOrders = orders.filter(
    
  (order) => !order.test && !order.cancelledAt,
  );

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
const recentOrders = validOrders.filter(
  (order) => new Date(order.processedAt).getTime() >= thirtyDaysAgo,
);

const recentRevenue = recentOrders.reduce(
  (total, order) =>
    total + Number(order.currentTotalPriceSet.shopMoney.amount || 0),
  0,
);

const averageOrderValue =
  recentOrders.length > 0 ? recentRevenue / recentOrders.length : 0;

  const salesCurrency =
  recentOrders[0]?.currentTotalPriceSet.shopMoney.currencyCode || "";

  const activeProducts = products.filter(
    (product) => product.status === "ACTIVE",
  );

    const inventoryTrackedProducts = activeProducts.filter(
    (product) => product.tracksInventory,
  );
  
  const outOfStockProducts = inventoryTrackedProducts.filter(
    (product) => (product.totalInventory ?? 0) <= 0,
  );

 const lowStockProducts = inventoryTrackedProducts.filter(
    (product) =>
      (product.totalInventory ?? 0) > 0 &&
      (product.totalInventory ?? 0) <= 10,
  );

  const highStockProducts = inventoryTrackedProducts.filter(
    (product) => (product.totalInventory ?? 0) >= 50,
  );

  const missingDescriptionProducts = activeProducts.filter(
  (product) => !product.description?.trim(),
);

const staleProducts = activeProducts.filter(
  (product) =>
    Date.now() - new Date(product.updatedAt).getTime() >
    90 * 24 * 60 * 60 * 1000,
);

const missingVendorProducts = activeProducts.filter(
  (product) => !product.vendor?.trim(),
);

const missingProductTypeProducts = activeProducts.filter(
  (product) => !product.productType?.trim(),
);

const duplicateTitleGroups = Object.values(
  activeProducts.reduce((groups, product) => {
    const title = product.title.trim().toLowerCase();

    groups[title] = groups[title] || [];
    groups[title].push(product);

    return groups;
  }, {}),
).filter((group) => group.length > 1);
const missingImageProducts = activeProducts.filter(
  (product) => !product.featuredMedia,
);

const missingImageAltProducts = activeProducts.filter(
  (product) =>
    product.featuredMedia && !product.featuredMedia.alt?.trim(),
)

const priorityRecommendations = [];
if (recentOrders.length === 0) {
  priorityRecommendations.push(
    "No completed non-test sales in the last 30 days. Focus on qualified traffic and conversion activity.",
  );
}

if (outOfStockProducts.length > 0) {
  priorityRecommendations.push(
    `Restock or review ${outOfStockProducts.length} out-of-stock products.`,
  );
}

if (lowStockProducts.length > 0) {
  priorityRecommendations.push(
  `Low-stock watch list: ${lowStockProducts.length}. Review products with 10 units or fewer before stock runs out.`
  );
}

if (missingImageProducts.length > 0) {
  priorityRecommendations.push(
    `Add featured images to ${missingImageProducts.length} products.`,
  );
}

if (missingDescriptionProducts.length > 0) {
  priorityRecommendations.push(
    `Add descriptions to ${missingDescriptionProducts.length} products.`,
  );
}

if (staleProducts.length > 0) {
  priorityRecommendations.push(
    `Review ${staleProducts.length} products that have not been updated in 90 days.`,
  );
}

if (missingProductTypeProducts.length > 0) {
  priorityRecommendations.push(
    `Assign product types to ${missingProductTypeProducts.length} products.`,
  );
}

if (duplicateTitleGroups.length > 0) {
  priorityRecommendations.push(
    `Review ${duplicateTitleGroups.length} potential duplicate product groups.`,
  );
}

if (highStockProducts.length > 0) {
  priorityRecommendations.push(
    `Consider promotions for ${highStockProducts.length} high-stock products.`,
  );
}
  return (
    <s-page heading="AI Business Advisor">
      <s-section heading="Business Recommendations">
        {priorityRecommendations.map((recommendation, index) => (
  <s-paragraph key={recommendation}>
    Priority {index + 1}: {recommendation}
  </s-paragraph>
))}
      </s-section>

      <s-section heading="Inventory Priorities">
        <s-paragraph>
          {outOfStockProducts.length > 0
            ? `High priority: ${outOfStockProducts.length} active products are out of stock. Review these products for restocking or whether they should remain active.`
            : "No active products are currently out of stock."}
        </s-paragraph>
             {outOfStockProducts.map((product) => (
          <s-paragraph key={product.id}>
            Out of stock: {product.title}
          </s-paragraph>
        ))}
        <s-paragraph>
          {lowStockProducts.length > 0
            ? `Watch list: ${lowStockProducts.length} active products have 10 units or fewer remaining. Review these before they sell out.`
            : "No active products are currently in the low-stock range."}
        </s-paragraph>
{lowStockProducts.map((product) => (
  <s-paragraph key={product.id}>
    Low stock: {product.title} — {product.totalInventory} remaining
  </s-paragraph>
))}
        <s-paragraph>
          {highStockProducts.length > 0
            ? `Opportunity: ${highStockProducts.length} active products have 50 units or more. Consider featuring these products in promotions to help move available stock.`
            : "No active products currently require a high-stock promotion review."}
        </s-paragraph>
        {highStockProducts.map((product) => (
  <s-paragraph key={product.id}>
    High stock: {product.title} — {product.totalInventory} available
  </s-paragraph>
))}
      </s-section>
      <s-section heading="Product Priorities">

  <s-paragraph>
    {missingDescriptionProducts.length > 0
      ? `Review: ${missingDescriptionProducts.length} active products are missing a description.`
      : "All active products currently have descriptions."}

  </s-paragraph>
  {missingDescriptionProducts.map((product) => (
  <s-paragraph key={product.id}>
    Missing description: {product.title}
  </s-paragraph>
))}

<s-paragraph>
  {staleProducts.length > 0
    ? `Freshness review: ${staleProducts.length} active products have not been updated in the last 90 days.`
    : "No active products currently require a 90-day freshness review."}
</s-paragraph>

<s-paragraph>
  {missingVendorProducts.length > 0
    ? `Organisation review: ${missingVendorProducts.length} active products have no vendor.`
    : "All active products currently have a vendor."}
</s-paragraph>

<s-paragraph>
  {missingProductTypeProducts.length > 0
    ? `Organisation review: ${missingProductTypeProducts.length} active products have no product type.`
    : "All active products currently have a product type."}
</s-paragraph>

{missingProductTypeProducts.map((product) => (
  <s-paragraph key={product.id}>
    Missing product type: {product.title}
  </s-paragraph>
))}

<s-paragraph>
  {duplicateTitleGroups.length > 0
    ? `Potential duplicate product groups found: ${duplicateTitleGroups.length}.`
    : "No potential duplicate product titles found."}
</s-paragraph>

{duplicateTitleGroups.map((group) => (
  <s-paragraph key={group[0].id}>
    Potential duplicate: {group[0].title} — {group.length} products
  </s-paragraph>
))}
  
</s-section>
<s-section heading="Store Health Priorities">
  
    {missingImageProducts.map((product) => (
  <s-paragraph key={product.id}>
    Missing featured image: {product.title}
  </s-paragraph>
))}
<s-paragraph>
    {missingImageProducts.length > 0
      ? `Review: ${missingImageProducts.length} active products have no featured image.`
      : "All active products currently have a featured image."}
  </s-paragraph>

  <s-paragraph>
    {missingImageAltProducts.length > 0
      ? `SEO priority: ${missingImageAltProducts.length} active products have a featured image without alt text.`
      : "All active featured images currently have alt text."}
  </s-paragraph>
  </s-section>
<s-section heading="Sales Priorities">
  <s-paragraph>
    Completed non-test orders in the last 30 days: {recentOrders.length}
  </s-paragraph>

  <s-paragraph>
    {recentOrders.length > 0
      ? `30-day revenue: ${salesCurrency} ${recentRevenue.toFixed(2)}`
      : "No completed non-test sales were recorded in the last 30 days."}
  </s-paragraph>

  <s-paragraph>
    {recentOrders.length > 0
      ? `Average order value: ${salesCurrency} ${averageOrderValue.toFixed(2)}`
      : "Sales priority: focus on product readiness, traffic, and conversion activity."}
  </s-paragraph>
</s-section>
</s-page>
  );
}