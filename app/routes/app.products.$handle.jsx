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
 
  const numericId = product.id.split("/").pop();
const shopifyAdminUrl = `shopify://admin/products/${numericId}`;
const shopifyInventoryUrl =
  "shopify://admin/products/inventory?location_id=82779308193";
 const shopifyArchivedProductsUrl =
  "https://admin.shopify.com/store/geanosgiftwarenovelties/products?savedViewId=1216095092951";

  return (
  <s-page heading="Product Intelligence">
    <s-section heading="Product Overview">
      <s-card padding="base">
     <s-grid gridTemplateColumns="280px 1fr" gap="base">
  <div>
         <s-stack direction="block" gap="base">
    <s-heading size="large">{product.title}</s-heading>

    {product.featuredImage && (
      <img
        src={product.featuredImage.url}
        alt={product.featuredImage.altText || product.title}
        style={{
          width: "280px",
          height: "280px",
          objectFit: "cover",
          borderRadius: "8px",
        }}
      />
    )}
  </s-stack>
</div>
<s-stack direction="block" gap="tight">
  <s-heading size="medium">Product Details</s-heading>
 <s-stack direction="inline" gap="base" wrap>
  <s-button href={shopifyAdminUrl} target="_top">
    🖊️ Edit Product
  </s-button>

  <s-button href={shopifyAdminUrl} target="_top">
    🛍️ Open in Shopify
  </s-button>

  <s-button href={shopifyInventoryUrl} target="_top">
    📦 View Inventory
  </s-button>

  <s-button href={shopifyArchivedProductsUrl} target="_top">
    🗄️ Product Archive
  </s-button>

 <s-button href="/app/duplicated-products">
  🔍 Duplicated Products
</s-button>

</s-stack>
  <s-text>
   <strong>Vendor:</strong>&nbsp;&nbsp;{product.vendor}
  </s-text>

  <s-text>
    <strong>Product Type:</strong> {product.productType || "Not assigned"}
  </s-text>

 <s-text>
  <strong>Status:</strong>{" "}
  <span
    style={{
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: "999px",
      fontWeight: "600",
      backgroundColor:
        product.status === "ACTIVE"
          ? "#d1fae5"
          : product.status === "DRAFT"
          ? "#fef3c7"
          : "#fee2e2",
      color:
        product.status === "ACTIVE"
          ? "#065f46"
          : product.status === "DRAFT"
          ? "#92400e"
          : "#991b1b",
    }}
  >
    {product.status}
  </span>
</s-text>

<s-text>
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
</s-grid>
 
      </s-card>
    </s-section>

    <s-section heading="Inventory Overview">
 <s-card padding="base">
    <s-stack direction="block">
      <s-text>
        <strong>Current Inventory:</strong> {product.totalInventory}
      </s-text>

      <s-text>
  <strong>Stock Health:</strong>{" "}
  <span
    style={{
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: "999px",
      fontWeight: "600",
      backgroundColor:
        product.totalInventory <= 0
          ? "#fee2e2"
          : product.totalInventory <= 10
          ? "#ffedd5"
          : product.totalInventory >= 50
          ? "#d1fae5"
          : "#fef3c7",
      color:
        product.totalInventory <= 0
          ? "#991b1b"
          : product.totalInventory <= 10
          ? "#9a3412"
          : product.totalInventory >= 50
          ? "#065f46"
          : "#92400e",
    }}
  >
    {product.totalInventory <= 0
      ? "Out of Stock"
      : product.totalInventory <= 10
      ? "Low Stock"
      : product.totalInventory >= 50
      ? "Healthy Stock"
      : "Normal Stock"}
  </span>
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