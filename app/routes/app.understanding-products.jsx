import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
export const loader = async ({ request }) => {
const { admin } = await authenticate.admin(request);
const products = [];
let cursor = null;
let hasNextPage = true;

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

return {
  products: responseJson.data.products.nodes,
};
};
export default function UnderstandingProductsPage() {
    const { products } = useLoaderData();
    const activeProductCount = products.filter(
  (product) => product.status === "ACTIVE",
).length;
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