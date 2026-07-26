import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
const ACTIVE_PRODUCTS_QUERY = `#graphql
  query ActiveProducts {
    products(first: 50, query: "status:active") {
      nodes {
        id
        title
        handle
        vendor
        productType
        description
        totalInventory
        featuredImage {
          url
          altText
        }
      }
    }
  }
`;
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(ACTIVE_PRODUCTS_QUERY);
  const result = await response.json();

  return result.data.products.nodes;
}
export default function DuplicatedProductsPage() {
  const products = useLoaderData();

  return (
    <s-page heading="Duplicated Products">
      <s-section heading="Active Product Scan">
        <s-card padding="base">
          <s-text>
            This page will scan active products and identify possible duplicates.
          </s-text>
          <s-text>
  Active products found: {products.length}
</s-text>
        </s-card>
      </s-section>
    </s-page>
  );
}