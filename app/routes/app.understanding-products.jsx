import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
export const loader = async ({ request }) => {
const { admin } = await authenticate.admin(request);

 const response = await admin.graphql(
  `#graphql
    query UnderstandingProducts {
      products(first: 50) {
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
      }
    }
  `,
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
const outOfStockProductCount = products.filter(
  (product) =>
    product.status === "ACTIVE" && product.totalInventory <= 0,
).length;
const lowStockProductCount = products.filter(
  (product) =>
    product.status === "ACTIVE" &&
    product.totalInventory > 0 &&
    product.totalInventory <= 10,
).length;
const adequatelyStockedProductCount = products.filter(
  (product) =>
    product.status === "ACTIVE" && product.totalInventory > 10,
).length;
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
    </s-page>
  );
}