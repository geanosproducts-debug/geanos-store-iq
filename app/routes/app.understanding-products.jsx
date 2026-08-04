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
  const response = await admin.graphql(
    `#graphql
      query UnderstandingProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          nodes {
            id
            title
            handle
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

  const responseJson = await response.json();
  const productPage = responseJson.data.products;

  products.push(...productPage.nodes);
  hasNextPage = productPage.pageInfo.hasNextPage;
  cursor = productPage.pageInfo.endCursor;
}
while (hasNextOrderPage) {
  const ordersResponse = await admin.graphql(
    `#graphql
      query UnderstandingProductSales($cursor: String) {
        orders(first: 50, after: $cursor) {
          nodes {
            id
            createdAt
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

return { products, orders };
};
export default function UnderstandingProductsPage() {
    const { products, orders } = useLoaderData();
    const soldProductIds = new Set(
  orders
    .flatMap((order) => order.lineItems.nodes)
    .map((lineItem) => lineItem.product?.id)
    .filter(Boolean),
);
const unitsSoldByProduct = orders.reduce((totals, order) => {
  order.lineItems.nodes.forEach((lineItem) => {
    const productId = lineItem.product?.id;

    if (productId) {
      totals[productId] =
        (totals[productId] || 0) + lineItem.quantity;
    }
  });

  return totals;
}, {});
const productsWithStockButNoSales = products.filter(
  (product) =>
    product.status === "ACTIVE" &&
    product.totalInventory > 0 &&
    !soldProductIds.has(product.id),
);
const productsWithSales = products.filter(
  (product) =>
    product.status === "ACTIVE" &&
    (unitsSoldByProduct[product.id] || 0) > 0,
);
const totalUnitsSold = productsWithSales.reduce(
  (total, product) =>
    total + (unitsSoldByProduct[product.id] || 0),
  0,
);

const averageUnitsSold =
  productsWithSales.length > 0
    ? Math.round((totalUnitsSold / productsWithSales.length) * 10) / 10
    : 0;
    const slowSellingProducts = productsWithSales.filter(
  (product) =>
    (unitsSoldByProduct[product.id] || 0) < averageUnitsSold,
);
const fastSellingProducts = productsWithSales.filter(
  (product) =>
    (unitsSoldByProduct[product.id] || 0) > averageUnitsSold,
);
const averageSellingProducts = productsWithSales.filter(
  (product) =>
    (unitsSoldByProduct[product.id] || 0) === averageUnitsSold,
);
const reorderProducts = productsWithSales.filter((product) => {
  const unitsSold = unitsSoldByProduct[product.id] || 0;

  return product.totalInventory <= unitsSold;
});

const productRecommendations = products
  .filter((product) => product.status === "ACTIVE")
  .map((product) => {
    const unitsSold = unitsSoldByProduct[product.id] || 0;
    let recommendation = "Maintain current stock and monitor performance.";

    if (!product.tracksInventory) {
  recommendation = "Inventory tracking is disabled for this product.";
} else if (product.totalInventory <= 0) {
      recommendation = "Restock this product before promoting it.";
    } else if (unitsSold > 0 && product.totalInventory <= unitsSold) {
      recommendation = "Reorder based on recent sales and remaining stock.";
    } else if (unitsSold === 0 && product.totalInventory >= 50) {
      recommendation =
        "Review pricing or promotion because stock is high with no recent sales.";
    } else if (unitsSold === 0) {
      recommendation =
        "Consider additional marketing because no recent sales were recorded.";
    } else if (unitsSold > averageUnitsSold) {
      recommendation =
        "Monitor inventory closely because this product is selling above average.";
    } else if (unitsSold < averageUnitsSold) {
      recommendation =
        "Review this product because it is selling below the store average.";
    }

    return {
      ...product,
      unitsSold,
      recommendation,
    };
  });
    const vendorCount = new Set(
  products.map((product) => product.vendor).filter(Boolean),
).size;
const productTypeCount = new Set(
  products.map((product) => product.productType).filter(Boolean),
).size;
const productsByVendor = products.reduce((counts, product) => {
  const vendor = product.vendor?.trim() || "No vendor";
  counts[vendor] = (counts[vendor] || 0) + 1;

  return counts;
}, {});
const productsByType = products.reduce((counts, product) => {
  const productType = product.productType?.trim() || "No product type";
  counts[productType] = (counts[productType] || 0) + 1;

  return counts;
}, {});
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
const staleProducts = products.filter(
  (product) => new Date(product.updatedAt) < ninetyDaysAgo,
);
const recentlyCreatedProducts = products.filter(
  (product) => new Date(product.createdAt) >= ninetyDaysAgo,
);
const totalActiveInventory = products
  .filter((product) => product.status === "ACTIVE")
  .reduce((total, product) => total + (product.totalInventory ?? 0), 0);
    const activeProductCount = products.filter(
  (product) => product.status === "ACTIVE",
).length;
const averageActiveInventory =
  activeProductCount > 0
    ? Math.round((totalActiveInventory / activeProductCount) * 10) / 10
    : 0;
    const highStockProducts = products.filter(
  (product) =>
    product.status === "ACTIVE" && product.totalInventory >= 50,
);
const draftProductCount = products.filter(
  (product) => product.status === "DRAFT",
).length;
const archivedProductCount = products.filter(
  (product) => product.status === "ARCHIVED",
).length;
const outOfStockProducts = products.filter(
  (product) =>
    product.status === "ACTIVE" &&
product.tracksInventory &&
product.totalInventory <= 0,
);
const outOfStockProductCount = outOfStockProducts.length;
const lowStockProducts = products.filter(
  (product) =>
    product.status === "ACTIVE" &&
    product.totalInventory > 0 &&
    product.totalInventory <= 10,
);
const lowStockProductCount = lowStockProducts.length;
const adequatelyStockedProducts = products.filter(
  (product) =>
    product.status === "ACTIVE" && product.totalInventory > 10,
);
const adequatelyStockedProductCount = adequatelyStockedProducts.length;
  return (
    <s-page heading="Understanding the Products">
      <s-section heading="Product Understanding Overview">
        <s-paragraph>
          Analyse your Shopify products to understand their performance,
          strengths, weaknesses, and opportunities.
        </s-paragraph>
       <s-paragraph>
  Above-average selling products: {fastSellingProducts.length}
</s-paragraph>

<s-paragraph>
  Active products: {activeProductCount}
</s-paragraph>

<s-paragraph>
  Active products adequately stocked: {adequatelyStockedProductCount}
</s-paragraph>

<s-paragraph>
  Active products out of stock: {outOfStockProductCount}
</s-paragraph>

<s-paragraph>
  Active products with high stock: {highStockProducts.length}
</s-paragraph>

<s-paragraph>
  Active products with low stock: {lowStockProductCount}
</s-paragraph>

<s-paragraph>
  Active products with stock but no sales:{" "}
  {productsWithStockButNoSales.length}
</s-paragraph>

<s-paragraph>
  Archived products: {archivedProductCount}
</s-paragraph>

<s-paragraph>
  Average inventory per active product: {averageActiveInventory}
</s-paragraph>

<s-paragraph>
  Average-selling products: {averageSellingProducts.length}
</s-paragraph>

<s-paragraph>
  Average units sold per selling product: {averageUnitsSold}
</s-paragraph>

<s-paragraph>
  Below-average selling products: {slowSellingProducts.length}
</s-paragraph>

<s-paragraph>
  Draft products: {draftProductCount}
</s-paragraph>

<s-paragraph>
  Orders analysed from the last 60 days: {orders.length}
</s-paragraph>

<s-paragraph>
  Product types represented: {productTypeCount}
</s-paragraph>

<s-paragraph>
  Product vendors represented: {vendorCount}
</s-paragraph>

<s-paragraph>
  Products created in the last 90 days: {recentlyCreatedProducts.length}
</s-paragraph>

<s-paragraph>
  Products not updated in 90 days: {staleProducts.length}
</s-paragraph>

<s-paragraph>
  Products recommended for reorder: {reorderProducts.length}
</s-paragraph>

<s-paragraph>
  Total active inventory units: {totalActiveInventory}
</s-paragraph>

<s-paragraph>
  Total products analysed: {products.length}
</s-paragraph>

<s-paragraph>
  Total units sold in the last 60 days: {totalUnitsSold}
</s-paragraph>
</s-section>
      
      <s-section heading="Products by Vendor">
  <s-stack direction="block" gap="base">
    {Object.entries(productsByVendor)
  .sort(([vendorA], [vendorB]) => vendorA.localeCompare(vendorB))
  .map(([vendor, count]) => (
      <s-paragraph key={vendor}>
       {vendor}: {count} {count === 1 ? "product" : "products"}
      </s-paragraph>
    ))}
  </s-stack>
</s-section>

<s-section heading="Products by Product Type">
  <s-stack direction="block" gap="base">
   {Object.entries(productsByType)
  .sort(([typeA], [typeB]) => typeA.localeCompare(typeB))
  .map(([productType, count]) => (
      <s-paragraph key={productType}>
     {productType}: {count} {count === 1 ? "product" : "products"}
      </s-paragraph>
    ))}
  </s-stack>

</s-section>
{productsWithStockButNoSales.length > 0 && (
  <s-section heading="Active Products With Stock But No Sales">
    <s-stack direction="block" gap="base">
     {[...productsWithStockButNoSales]
  .sort((a, b) => a.title.localeCompare(b.title))
  .map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Inventory: {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}

{slowSellingProducts.length > 0 && (
  <s-section heading="Below-Average Selling Products">
    <s-stack direction="block" gap="base">
      {slowSellingProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Units sold:{" "}
          {unitsSoldByProduct[product.id] || 0} — Inventory:{" "}
          {product.totalInventory}
        </s-link>
      ))}
    </s-stack>

  </s-section>
)}{averageSellingProducts.length > 0 && (
  <s-section heading="Average-Selling Products">
    <s-stack direction="block" gap="base">
      {averageSellingProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Units sold:{" "}
          {unitsSoldByProduct[product.id] || 0} — Inventory:{" "}
          {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}

{fastSellingProducts.length > 0 && (
  <s-section heading="Above-Average Selling Products">
    <s-stack direction="block" gap="base">
      {fastSellingProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Units sold:{" "}
          {unitsSoldByProduct[product.id] || 0} — Inventory:{" "}
          {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
{reorderProducts.length > 0 && (
  <s-section heading="Products Recommended for Reorder">
    <s-stack direction="block" gap="base">
      {reorderProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Units sold:{" "}
          {unitsSoldByProduct[product.id] || 0} — Inventory:{" "}
          {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}

      {outOfStockProducts.length > 0 && (
  <s-section heading="Active Products Out of Stock">
    <s-stack direction="block" gap="base">
      {outOfStockProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Inventory: {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
{lowStockProducts.length > 0 && (
  <s-section heading="Active Products With Low Stock">
    <s-stack direction="block" gap="base">
      {lowStockProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Inventory: {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
{adequatelyStockedProducts.length > 0 && (
  <s-section heading="Active Products Adequately Stocked">
    <s-stack direction="block" gap="base">
      {adequatelyStockedProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Inventory: {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}

{highStockProducts.length > 0 && (
  <s-section heading="Active Products With High Stock">
    <s-stack direction="block" gap="base">
      {highStockProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title} — Inventory: {product.totalInventory}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
<s-section heading="Product Recommendations">
  <s-stack direction="block" gap="base">
    {[...productRecommendations]
  .sort((a, b) => a.title.localeCompare(b.title))
  .map((product) => (
      <s-paragraph key={product.id}>
        <s-link href={`/app/products/${product.handle}`}>
          {product.title}
        </s-link>
        {" — Inventory: "}
        {product.totalInventory}
        {" — Units sold: "}
        {product.unitsSold}
        {" — Recommendation: "}
        {product.recommendation}
      </s-paragraph>
    ))}
  </s-stack>
</s-section>
    </s-page>
  );
}