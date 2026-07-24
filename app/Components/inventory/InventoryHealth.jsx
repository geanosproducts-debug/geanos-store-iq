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

  return (
    <s-stack direction="block" gap="small">

      <s-paragraph>Health Score: {healthScore}%</s-paragraph>

      <s-paragraph>Products Tracked: {totalProducts}</s-paragraph>

      <s-paragraph>Low Stock: {lowStock}</s-paragraph>

      <s-paragraph>Out of Stock: {outOfStock}</s-paragraph>

      <s-paragraph>High Stock: {highStock}</s-paragraph>
    </s-stack>
  );
}