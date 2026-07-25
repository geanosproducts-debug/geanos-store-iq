export default function InventoryNeedsAttention({ products }) {
  if (products.length === 0) {
    return (
      <s-paragraph>
        No products currently need attention.
      </s-paragraph>
    );
  }

  return (
  <>
    <s-stack direction="block" gap="small">
      {products.map((product) => (
     <div key={product.id}>
  <s-heading size="md">
  {product.title}
</s-heading>

<s-spacer size="small" />

 <div style={{ paddingLeft: "12px" }}>
<s-paragraph>
  <strong>Status:</strong>{" "}
  <span
    style={{
      color:
        product.inventoryStatus === "Out of Stock"
          ? "red"
          : product.inventoryStatus === "Low Stock"
            ? "darkorange"
            : "inherit",
    }}
  >
    {product.inventoryStatus}
  </span>
</s-paragraph>

  <s-paragraph>
  <strong>Quantity:</strong>{" "}
  <span
    style={{
      color:
        product.inventoryStatus === "Out of Stock"
          ? "red"
          : product.inventoryStatus === "Low Stock"
            ? "darkorange"
            : "inherit",
      fontWeight: "bold",
    }}
  >
    {product.quantity}
  </span>
</s-paragraph>

  <s-paragraph>
  <strong>Action:</strong>{" "}
  <span
    style={{
      color:
        product.inventoryStatus === "Out of Stock"
          ? "red"
          : "darkorange",
      fontWeight: "bold",
    }}
  >
    {product.inventoryStatus === "Out of Stock"
      ? "Restock immediately"
      : "Reorder soon"}
  </span>
</s-paragraph>
</div>

  <s-divider />
</div>
      ))}
    </s-stack>
    </>
  );
}