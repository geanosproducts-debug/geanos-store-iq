export default function InventoryNeedsAttention({ products }) {
  return (
    <s-stack direction="block" gap="small">
      {products.map((product) => (
        <s-paragraph key={product.id}>
          {product.title} — {product.inventoryStatus} ({product.quantity})
        </s-paragraph>
      ))}
    </s-stack>
  );
}