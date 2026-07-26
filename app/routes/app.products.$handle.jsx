import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const PRODUCT_QUERY = `#graphql
query ProductByHandle($handle: String!) {
  productByHandle(handle: $handle) {
    id
    title
    handle
    vendor
    productType
    status
    totalInventory
    tags
    createdAt
    updatedAt
    tags
   featuredImage {
  url
  altText
}
priceRangeV2 {
  minVariantPrice {
    amount
    currencyCode
  }
  maxVariantPrice {
    amount
    currencyCode
  }
}
}
}
`;

export async function loader({ request, params }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: {
      handle: params.handle,
    },
  });

  const result = await response.json();

  return result.data.productByHandle;
}

export default function ProductIntelligencePage() {
  const product = useLoaderData();

  return (
  <s-page heading="Product Intelligence">
    <s-section heading="Product Overview">
      <s-card>
       <s-stack direction="block">
  <s-heading>{product.title}</s-heading>
  {product.featuredImage && (
  <img
    src={product.featuredImage.url}
    alt={product.featuredImage.altText || product.title}
       style={{    
        width: "220px",
      height: "220px",
      objectFit: "cover",
      borderRadius: "8px",
    }}
  />
)}

  <s-text>
    <strong>Vendor:</strong> {product.vendor}
  </s-text>

  <s-text>
    <strong>Product Type:</strong> {product.productType || "Not assigned"}
  </s-text>

  <s-text>
    <strong>Status:</strong> {product.status}
  </s-text>  <s-text>
    <strong>Handle:</strong> {product.handle}
  </s-text>

  <s-text>
    <strong>Tags:</strong>{" "}
    {product.tags?.length
      ? product.tags.join(", ")
      : "No tags assigned"}
  </s-text>

  <s-text>
    <strong>Created:</strong>{" "}
    {new Date(product.createdAt).toLocaleDateString()}
  </s-text>

  <s-text>
    <strong>Last Updated:</strong>{" "}
    {new Date(product.updatedAt).toLocaleDateString()}
  </s-text>

  <s-text>
    <strong>Price:</strong>{" "}
    {product.priceRangeV2.minVariantPrice.amount}{" "}
    {product.priceRangeV2.minVariantPrice.currencyCode}
  </s-text>
</s-stack>
 
      </s-card>
    </s-section>

    <s-section heading="Inventory Overview">
  <s-card>
    <s-stack direction="block">
      <s-text>
        <strong>Current Inventory:</strong> {product.totalInventory}
      </s-text>

      <s-text>
        <strong>Stock Health:</strong>{" "}
        {product.totalInventory <= 0
          ? "🔴 Out of Stock"
          : product.totalInventory <= 10
          ? "🟠 Low Stock"
          : product.totalInventory >= 50
          ? "🟢 Healthy Stock"
          : "🟡 Normal Stock"}
      </s-text>
    </s-stack>
  </s-card>
</s-section>
  </s-page>
);
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};