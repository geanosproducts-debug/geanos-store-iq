export default function InventorySummary({
  tracked,
  outOfStock,
  lowStock,
  highStock,
  pagesFetched,
  truncated,
}) {
  return (
    <s-section heading="Inventory Overview">
      <s-card>
        <s-stack direction="block" gap="base">
         <s-section>
  <s-card>
    <s-stack direction="block" gap="base">

      <div style={{ display: "flex", gap: "24px" }}>
        <span style={{ width: "220px" }}>
          📦 Products Tracked:
        </span>
        <strong>{tracked}</strong>
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        <span style={{ width: "220px" }}>
          🔴 Out of Stock (0):
        </span>
        <strong>{outOfStock}</strong>
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        <span style={{ width: "220px" }}>
          🟠 Low Stock (1–10):
        </span>
        <strong>{lowStock}</strong>
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        <span style={{ width: "220px" }}>
          🟢 Healthy Stock (Over 50):
        </span>
        <strong>{highStock}</strong>
      </div>

      {truncated && (
        <s-banner tone="warning">
          <s-paragraph>
            Inventory scan limit reached.
            <br />
            Only the first 25,000 products could be analysed.
            The figures shown above may not represent your complete inventory.
          </s-paragraph>
        </s-banner>
      )}

    </s-stack>
  </s-card>
</s-section>
           
          {truncated && (
            <s-banner tone="warning">
              <s-paragraph>
               Inventory scan limit reached.

Only the first 25,000 products could be analysed.
The figures shown above may not represent your complete inventory.
              </s-paragraph>
            </s-banner>
          )}
        </s-stack>
      </s-card>
    </s-section>
  );
}