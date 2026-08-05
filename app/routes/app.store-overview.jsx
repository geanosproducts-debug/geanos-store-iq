export default function StoreOverview() {
  return (
    <s-page heading="Store Overview">
      <s-section heading="Store Data">
        <s-paragraph>
          What is happening in your store?
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <s-link href="/app/inventory">
            Inventory Intelligence
          </s-link>

          <s-link href="/app/store-health">
            Store Health & SEO Bot
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}