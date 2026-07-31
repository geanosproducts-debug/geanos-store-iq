import { authenticate } from "../shopify.server";
import { useFetcher } from "react-router";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
  };
  export const action = async ({ request }) => {
  await authenticate.admin(request);

  return { scanStarted: true };
};

export default function StoreHealthPage() {
  const fetcher = useFetcher();
  return (
    <s-page heading="Store Health & SEO Bot">
     <s-button
  slot="primary-action"
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
  ? "Store Health Scan completed successfully."
  : "The Store Health Bot is ready for its first scanning tools."}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}