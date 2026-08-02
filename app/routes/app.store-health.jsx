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
  const response = await admin.graphql(`
  #graphql
  query StoreHealthProducts {
    products(first: 250) {
      nodes {
        id
        title
        handle
        seo {
          title
          description
        }
      }
    }
  }
`);
const responseJson = await response.json();
const products = responseJson.data.products.nodes;
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

 return {
  scanStarted: true,
  totalProducts: products.length,
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
    </s-page>
  );
}