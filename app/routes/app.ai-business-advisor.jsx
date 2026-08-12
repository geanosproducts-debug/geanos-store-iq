import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const products = [];
  let productCursor = null;
  let hasMoreProducts = true;

  while (hasMoreProducts) {
    const response = await admin.graphql(
      `#graphql
        query AdvisorProducts($productCursor: String) {
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
  let hasMoreOrders = false;

  while (hasMoreOrders) {
    const response = await admin.graphql(
      `#graphql
        query AdvisorOrders($orderCursor: String) {
          orders(
            first: 100
            after: $orderCursor
            sortKey: PROCESSED_AT
            reverse: true
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
        },
      },
    );

    const data = await response.json();
const orderConnection = data.data.orders;

orders.push(...orderConnection.nodes);

const oldestOrderOnPage = orderConnection.nodes.at(-1);
const reachedThirtyDayCutoff =
  oldestOrderOnPage &&
  new Date(oldestOrderOnPage.processedAt).getTime() <
    Date.now() - 30 * 24 * 60 * 60 * 1000;

hasMoreOrders =
  orderConnection.pageInfo.hasNextPage && !reachedThirtyDayCutoff;

orderCursor = orderConnection.pageInfo.endCursor;
  }

  return {
    products,
    orders,
     generatedAt: new Date().toISOString(),
  };
}
  export default function AiBusinessAdvisor() {
  const { products, orders, generatedAt } = useLoaderData();
  const analysisGeneratedAt = new Date(generatedAt).toLocaleString("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
    timeZone: "Australia/Brisbane",
});

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
        <s-paragraph>
  <strong>HOW TO READ THESE PRIORITIES</strong>
</s-paragraph>

<s-paragraph>
  <strong>Immediate:</strong> Act now. <strong>Soon:</strong> Plan next.{" "}
  <strong>Opportunity:</strong> Potential growth.
</s-paragraph>

        {priorityRecommendations.map((recommendation, index) => (
  <s-paragraph key={recommendation}>
   <strong>
  {recommendation.startsWith("Consider promotions")
    ? "Opportunity"
    : index === 0
      ? "Immediate"
      : "Soon"}
  :
</strong>{" "}
Priority {index + 1}: {recommendation}
  </s-paragraph>
))}

<s-paragraph>
  <strong>OPEN THE RELEVANT STORE IQ WORKSPACE</strong>
</s-paragraph>
<s-button href="/app/inventory">
  Open Inventory Intelligence
</s-button>

<s-button href="/app/store-health">
  Open Store Health & SEO Bot
</s-button>

<s-button href="/app/understanding-products">
  Open Product Understanding
</s-button>

<s-button href="/app/seasonal-marketing-intelligence">
  Open Seasonal & Marketing Intelligence
</s-button>

<s-button href="/app/business-analysis">
  Open Business Analysis
</s-button>
      </s-section>
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: "16px",
    alignItems: "start",
  }}
>
      <s-section heading="Inventory Priorities">
        <s-paragraph>
          {outOfStockProducts.length > 0
            ? `High priority: ${outOfStockProducts.length} active products are out of stock. Review these products for restocking or whether they should remain active.`
            : "No active products are currently out of stock."}
        </s-paragraph>
            {outOfStockProducts.slice(0, 10).map((product) => (
         <s-paragraph key={product.id}>
  <s-button href={`/app/products/${product.handle}`}>
  Out of stock: {product.title}
</s-button>
</s-paragraph>
        ))}
        {outOfStockProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {outOfStockProducts.length - 10} out-of-stock products
    </summary>

    {outOfStockProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
    <s-button href={`/app/products/${product.handle}`}>
  Out of stock: {product.title}
</s-button>
      </s-paragraph>
    ))}
  </details>
)}
        <s-paragraph>
  <strong>
    {lowStockProducts.length > 0
      ? `Watch list: ${lowStockProducts.length} active products have 10 units or fewer remaining. Review these before they sell out.`
      : "No active products are currently in the low-stock range."}
  </strong>
</s-paragraph>
{lowStockProducts.slice(0, 10).map((product) => (
  <s-paragraph key={product.id}>
 <s-button href={`/app/products/${product.handle}`}>
  Low stock: {product.title} — {product.totalInventory} remaining
</s-button>
</s-paragraph>
))}
{lowStockProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {lowStockProducts.length - 10} low-stock products
    </summary>

    {lowStockProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
       <s-button href={`/app/products/${product.handle}`}>
  Low stock: {product.title} — {product.totalInventory} remaining
</s-button>
      </s-paragraph>
    ))}
  </details>
)}
        <s-paragraph>
          {highStockProducts.length > 0
            ? `Opportunity: ${highStockProducts.length} active products have 50 units or more. Consider featuring these products in promotions to help move available stock.`
            : "No active products currently require a high-stock promotion review."}
        </s-paragraph>
        {highStockProducts.slice(0, 10).map((product) => (
  <s-paragraph key={product.id}>
   <s-button href={`/app/products/${product.handle}`}>
  High stock: {product.title} — {product.totalInventory} available
</s-button>
  </s-paragraph>
))}

{highStockProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {highStockProducts.length - 10} high-stock products
    </summary>

    {highStockProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
        High stock: {product.title} — {product.totalInventory} available
      </s-paragraph>
    ))}
  </details>
)}
{highStockProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {highStockProducts.length - 10} high-stock products
    </summary>

    {highStockProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
        <s-button href={`/app/products/${product.handle}`}>
          High stock: {product.title} — {product.totalInventory} available
        </s-button>
      </s-paragraph>
    ))}
  </details>
)}
      </s-section>
      <s-section heading="Product Priorities">

  <s-paragraph>
    {missingDescriptionProducts.length > 0
      ? `Review: ${missingDescriptionProducts.length} active products are missing a description.`
      : "All active products currently have descriptions."}

  </s-paragraph>
 {missingDescriptionProducts.slice(0, 10).map((product) => (
  <s-paragraph key={product.id}>
    <s-button href={`/app/products/${product.handle}`}>
  Missing description: {product.title}
</s-button>
  </s-paragraph>
))}
{missingDescriptionProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {missingDescriptionProducts.length - 10} products missing descriptions
    </summary>

    {missingDescriptionProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
       <s-button href={`/app/products/${product.handle}`}>
  Missing description: {product.title}
</s-button>
      </s-paragraph>
    ))}
  </details>
)}
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

{missingProductTypeProducts.slice(0, 10).map((product) => (
  <s-paragraph key={product.id}>
  <s-button href={`/app/products/${product.handle}`}>
  Missing product type: {product.title}
</s-button>
  </s-paragraph>
))}
{missingProductTypeProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {missingProductTypeProducts.length - 10} products missing product types
    </summary>

    {missingProductTypeProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
        <s-button href={`/app/products/${product.handle}`}>
          Missing product type: {product.title}
        </s-button>
      </s-paragraph>
    ))}
  </details>
)}

{missingProductTypeProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {missingProductTypeProducts.length - 10} products missing a product type
    </summary>

    {missingProductTypeProducts.slice(10).map((product) => (
      <s-paragraph key={product.id}>
        Missing product type: {product.title}
      </s-paragraph>
    ))}
  </details>
)}
<s-paragraph>
  {duplicateTitleGroups.length > 0
    ? `Potential duplicate product groups found: ${duplicateTitleGroups.length}.`
    : "No potential duplicate product titles found."}
</s-paragraph>

{duplicateTitleGroups.map((group) => (
  <s-paragraph key={group[0].id}>
    Potential duplicate: {group[0].title} — {group.length} products
    {group.map((product, index) => (
      <s-button
        key={product.id}
        href={`/app/products/${product.handle}`}
      >
        Open product {index + 1}
      </s-button>
    ))}
  </s-paragraph>
))}
{duplicateTitleGroups.length > 10 && (
  <details>
    <summary>
      Show remaining {duplicateTitleGroups.length - 10} potential duplicate groups
    </summary>

    {duplicateTitleGroups.slice(10).map((group) => (
      <s-paragraph key={group[0].id}>
        Potential duplicate: {group[0].title} — {group.length} products
      </s-paragraph>
    ))}
  </details>
)}
</s-section>
</div>
<s-section heading="Store Health Priorities">
  
    {missingImageProducts.slice(0, 10).map((product) => (
  <s-paragraph key={product.id}>
    <s-button href={`/app/products/${product.handle}`}>
  Missing featured image: {product.title}
</s-button>
  </s-paragraph>
))}
{missingImageProducts.length > 10 && (
  <details>
    <summary>
      Show remaining {missingImageProducts.length - 10} products missing a featured image
    </summary>

   {missingImageProducts.slice(10).map((product) => (
  <s-paragraph key={product.id}>
    <s-button href={`/app/products/${product.handle}`}>
      Missing featured image: {product.title}
    </s-button>
  </s-paragraph>
))}
  </details>
)}
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
  Sales data is temporarily unavailable while Shopify order access is being activated.
</s-paragraph>
</s-section>
</s-page>
  );
}