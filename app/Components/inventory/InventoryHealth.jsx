  export default function InventoryHealth({ products }) {
  const totalProducts = products.length;

  const outOfStock = products.filter(
    (product) => product.inventoryStatus === "Out of Stock"
  ).length;

  const lowStock = products.filter(
    (product) => product.inventoryStatus === "Low Stock"
  ).length;

  const highStock = products.filter(
    (product) => product.inventoryStatus === "High Stock"
  ).length;

  const healthyProducts = totalProducts - outOfStock - lowStock;

  const healthScore =
    totalProducts === 0
      ? 100
      : Math.round((healthyProducts / totalProducts) * 100);
const healthStatus =
  healthScore >= 90
    ? "Excellent"
    : healthScore >= 75
      ? "Good"
      : healthScore >= 50
        ? "Needs Attention"
        : "Critical";

  return (
    <s-stack direction="block" gap="small">

<s-heading size="sm">
  Health Score: {healthScore}% — {healthStatus}
</s-heading>

      <s-paragraph>
  Inventory Tracked: {totalProducts} products
</s-paragraph>

     <div
  style={{
    display: "grid",
    gridTemplateColumns: "125px auto",
    rowGap: "14px",
  }}
>
  <span>Low Stock:</span>
  <span>
    {lowStock} product{lowStock === 1 ? "" : "s"}
  </span>

  <span>Out of Stock:</span>
  <span>
    {outOfStock} product{outOfStock === 1 ? "" : "s"}
  </span>

  <span>High Stock:</span>
  <span>
    {highStock} product{highStock === 1 ? "" : "s"}
  </span>
</div>
    </s-stack>
  );
}