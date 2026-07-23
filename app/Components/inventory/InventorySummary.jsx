export default function InventorySummary({
  tracked,
  outOfStock,
  lowStock,
  highStock,
  pagesFetched,
  truncated,
}) {
  return (
    <s-section heading="Inventory Summary">
      <s-card>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-box padding="base" inlineSize="20%">
              <s-stack direction="block" gap="small">
                <s-paragraph tone="subdued">
                  📦 Inventory Tracked
                </s-paragraph>

                <s-paragraph>{tracked}</s-paragraph>
              </s-stack>
            </s-box>

            <s-box padding="base" inlineSize="20%">
              <s-stack direction="block" gap="small">
                <s-paragraph tone="subdued">
                  🔴 Out of Stock
                </s-paragraph>

                <s-paragraph>{outOfStock}</s-paragraph>
              </s-stack>
            </s-box>

            <s-box padding="base" inlineSize="20%">
              <s-stack direction="block" gap="small">
                <s-paragraph tone="subdued">
                  🟡 Low Stock (1–10)
                </s-paragraph>

                <s-paragraph>{lowStock}</s-paragraph>
              </s-stack>
            </s-box>

            <s-box padding="base" inlineSize="20%">
              <s-stack direction="block" gap="small">
                <s-paragraph tone="subdued">
                  🟢 High Stock (Over 50)
                </s-paragraph>

                <s-paragraph>{highStock}</s-paragraph>
              </s-stack>
            </s-box>
          </s-stack>

          <s-paragraph tone="subdued">
            Scanned {tracked.toLocaleString()} inventory-tracked products across{" "}
            {pagesFetched} {pagesFetched === 1 ? "page" : "pages"}.
          </s-paragraph>

          {truncated && (
            <s-banner tone="warning">
              <s-paragraph>
                The inventory scan reached its safety limit of 25,000 products.
                The displayed totals may be incomplete.
              </s-paragraph>
            </s-banner>
          )}
        </s-stack>
      </s-card>
    </s-section>
  );
}