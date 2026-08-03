import { authenticate } from "../shopify.server";
import { useFetcher } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
  };
  export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  let cursor = null;
  const allProducts = [];
  let hasNextPage = true;
  let storeUrl = null;
  while (hasNextPage) {
  const response = await admin.graphql(
    `#graphql
      query StoreHealthProducts($cursor: String) {
      products(first: 50, after: $cursor) {
          nodes {
            id
            title
            handle
            descriptionHtml
            vendor
            productType
            seo {
              title
              description
            }
              images(first: 10) {
  nodes {
    id
    altText
  }
}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
          shop {
  primaryDomain {
    url
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
  storeUrl = responseJson.data.shop.primaryDomain.url;
  const productPage = responseJson.data.products;

  allProducts.push(...productPage.nodes);
  hasNextPage = productPage.pageInfo.hasNextPage;
  cursor = productPage.pageInfo.endCursor;
}

const sitemapUrl = new URL("/sitemap.xml", storeUrl).toString();
const robotsUrl = new URL("/robots.txt", storeUrl).toString();
const [sitemapResponse, robotsResponse] = await Promise.all([
  fetch(sitemapUrl),
  fetch(robotsUrl),
  ]);
  const sitemapAvailable = sitemapResponse.ok;
  const robotsAvailable = robotsResponse.ok;
  const indexingReady = sitemapAvailable && robotsAvailable;
const products = allProducts;
const missingSeoTitles = products.filter(
  (product) => !product.seo?.title?.trim(),
);
const missingSeoDescriptions = products.filter(
  (product) => !product.seo?.description?.trim(),
);
const missingSeo = products.filter(
  
  (product) =>
    !product.seo?.title?.trim() || !product.seo?.description?.trim(),
);

const totalImagesChecked = products.reduce(
  (total, product) => total + product.images.nodes.length,
  0,
);
const imagesMissingAltText = products.flatMap((product) =>
  product.images.nodes
    .filter((image) => !image.altText?.trim())
    .map((image) => ({
      imageId: image.id,
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
    })),
);
const productTitleCounts = products.reduce((counts, product) => {
  const normalisedTitle = product.title.trim().toLowerCase();

  counts[normalisedTitle] = (counts[normalisedTitle] || 0) + 1;

  return counts;
}, {});
const duplicateTitleProducts = products.filter(
  (product) =>
    productTitleCounts[product.title.trim().toLowerCase()] > 1,
);
const incompleteProducts = products.filter(
  (product) =>
    !product.descriptionHtml?.replace(/<[^>]*>/g, "").trim() ||
    !product.vendor?.trim() ||
    !product.productType?.trim() ||
    product.images.nodes.length === 0,
);
 return {
  scanStarted: true,
  storeUrl,
  sitemapAvailable,
  sitemapStatus: sitemapResponse.status,
  robotsAvailable,
  indexingReady,
  totalProducts: products.length,
  duplicateTitleCount: duplicateTitleProducts.length,
  duplicateTitleProducts: duplicateTitleProducts.map((product) => ({
  id: product.id,
  title: product.title,
  handle: product.handle,
})),
incompleteProductCount: incompleteProducts.length,
incompleteProducts: incompleteProducts.map((product) => ({
  id: product.id,
  title: product.title,
  handle: product.handle,
  missingDescription:
    !product.descriptionHtml?.replace(/<[^>]*>/g, "").trim(),
  missingVendor: !product.vendor?.trim(),
  missingProductType: !product.productType?.trim(),
  missingImage: product.images.nodes.length === 0,
})),
  robotsStatus: robotsResponse.status,
  totalImagesChecked,
  imagesMissingAltTextCount: imagesMissingAltText.length,
  imagesMissingAltText,
  missingSeoDescriptionCount: missingSeoDescriptions.length,
  missingSeoTitleCount: missingSeoTitles.length,
  missingSeoProducts: missingSeo.map((product) => ({
  id: product.id,
  title: product.title,
  handle: product.handle,
  missingTitle: !product.seo?.title?.trim(),
  missingDescription: !product.seo?.description?.trim(),
})),
  missingSeoCount: missingSeo.length,
};
};

export default function StoreHealthPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  useEffect(() => {
  if (fetcher.data?.scanStarted) {
    shopify.toast.show("Store Health Scan completed");
  }
}, [fetcher.data, shopify]);
  return (
    <s-page heading="Store Health & SEO Bot">
     <s-button
  slot="primary-action"
  loading={fetcher.state !== "idle"}
  onClick={() =>
    fetcher.submit(null, {
      method: "post",
      action: "/app/store-health",
    })
  }
>
  Run Store Health Scan
</s-button>

      <s-section heading="Store Health Overview">
        <s-paragraph>
          Scan your Shopify store for SEO, indexing, product-data, and
          technical health issues.
        </s-paragraph>
      </s-section>

      <s-section heading="Phase 2 Checks">
        <s-stack direction="block" gap="base">
          <s-paragraph>SEO titles and meta descriptions</s-paragraph>
          <s-paragraph>Product image alt text</s-paragraph>
          <s-paragraph>Sitemap and robots.txt status</s-paragraph>
          <s-paragraph>Duplicate and incomplete product data</s-paragraph>
          <s-paragraph>Search-engine indexing readiness</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Bot Status">
        <s-paragraph>
        {fetcher.data?.scanStarted
  ? `Scan complete: ${fetcher.data.totalProducts} products checked. ${fetcher.data.missingSeoTitleCount} are missing SEO titles. ${fetcher.data.missingSeoDescriptionCount} are missing meta descriptions. ${fetcher.data.missingSeoCount} products need SEO attention overall.`
  : "The Store Health Bot is ready for its first scanning tools."}
        </s-paragraph>
        {fetcher.data?.scanStarted && (
  <s-paragraph>
 {fetcher.data.totalImagesChecked} product images checked. {fetcher.data.imagesMissingAltTextCount} are missing alt text.
  </s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
    Checked store: {fetcher.data.storeUrl}
  </s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
  Sitemap: {fetcher.data.sitemapAvailable ? "Available" : "Not available"} (HTTP {fetcher.data.sitemapStatus})
</s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
   Robots.txt: {fetcher.data.robotsAvailable ? "Available" : "Not available"} (HTTP {fetcher.data.robotsStatus})
  </s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
    Search-engine indexing readiness:{" "}
    {fetcher.data.indexingReady ? "Ready" : "Not ready"}
  </s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
    Products with duplicate titles: {fetcher.data.duplicateTitleCount}
  </s-paragraph>
)}
{fetcher.data?.scanStarted && (
  <s-paragraph>
    Products with incomplete data: {fetcher.data.incompleteProductCount}
  </s-paragraph>
)}
      </s-section>
      {fetcher.data?.missingSeoProducts?.length > 0 && (
  <s-section heading="Products Needing SEO Attention">
    <s-stack direction="block" gap="base">
      {fetcher.data.missingSeoProducts.map((product) => (
        <s-link key={product.id} href={`/app/products/${product.handle}`}>
  {product.title}
  {product.missingTitle && " — Missing SEO title"}
  {product.missingDescription && " — Missing meta description"}
</s-link>
      ))}
    </s-stack>
  </s-section>
)}
{fetcher.data?.duplicateTitleProducts?.length > 0 && (
  <s-section heading="Products With Duplicate Titles">
    <s-stack direction="block" gap="base">
      {fetcher.data.duplicateTitleProducts.map((product) => (
        <s-link key={product.id} href={`/app/products/${product.handle}`}>
          {product.title}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
{fetcher.data?.incompleteProducts?.length > 0 && (
  <s-section heading="Products With Incomplete Data">
    <s-stack direction="block" gap="base">
      {fetcher.data.incompleteProducts.map((product) => (
        <s-link
          key={product.id}
          href={`/app/products/${product.handle}`}
        >
          {product.title}
          {product.missingDescription && " — Missing description"}
          {product.missingVendor && " — Missing vendor"}
          {product.missingProductType && " — Missing product type"}
          {product.missingImage && " — Missing product image"}
        </s-link>
      ))}
    </s-stack>
  </s-section>
)}
    </s-page>
  );
}