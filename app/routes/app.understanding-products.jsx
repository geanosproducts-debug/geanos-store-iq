import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
export const loader = async ({ request }) => {
const { admin } = await authenticate.admin(request);
const products = [];
let cursor = null;
let hasNextPage = true;

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

return { products };
};
export default function UnderstandingProductsPage() {
    const { products } = useLoaderData();
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
const draftProductCount = products.filter(
  (product) => product.status === "DRAFT",
).length;
const archivedProductCount = products.filter(
  (product) => product.status === "ARCHIVED",
).length;
const outOfStockProducts = products.filter(
  (product) =>
    product.status === "ACTIVE" && product.totalInventory <= 0,
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
  Total products analysed: {products.length}
</s-paragraph>
<s-paragraph>
  Product vendors represented: {vendorCount}
</s-paragraph>
<s-paragraph>
  Product types represented: {productTypeCount}
</s-paragraph>
<s-paragraph>
  Active products: {activeProductCount}
</s-paragraph>
<s-paragraph>
  Draft products: {draftProductCount}
</s-paragraph>
<s-paragraph>
  Archived products: {archivedProductCount}
</s-paragraph>
<s-paragraph>
  Active products out of stock: {outOfStockProductCount}
</s-paragraph>
<s-paragraph>
  Active products with low stock: {lowStockProductCount}
</s-paragraph>
<s-paragraph>
  Active products adequately stocked: {adequatelyStockedProductCount}
</s-paragraph>
<s-paragraph>
  Products not updated in 90 days: {staleProducts.length}
</s-paragraph>
<s-paragraph>
  Products created in the last 90 days: {recentlyCreatedProducts.length}
</s-paragraph>
<s-paragraph>
  Average inventory per active product: {averageActiveInventory}
</s-paragraph>
<s-paragraph>
  Total active inventory units: {totalActiveInventory}
</s-paragraph>
      </s-section>
      
      <s-section heading="Products by Vendor">
  <s-stack direction="block" gap="base">
    {Object.entries(productsByVendor).map(([vendor, count]) => (
      <s-paragraph key={vendor}>
       {vendor}: {count} {count === 1 ? "product" : "products"}
      </s-paragraph>
    ))}
  </s-stack>
</s-section>
<s-section heading="Products by Product Type">
  <s-stack direction="block" gap="base">
    {Object.entries(productsByType).map(([productType, count]) => (
      <s-paragraph key={productType}>
     {productType}: {count} {count === 1 ? "product" : "products"}
      </s-paragraph>
    ))}
  </s-stack>
</s-section>
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
    </s-page>
  );
}