export default function InventoryTable({ products }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
  style={{
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  }}
>
        <thead>
          <tr>
            <th>Product</th>
            <th>Shopify Status</th>
            <th>Inventory</th>
            <th>Inventory Status</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.title}</td>
              <td>{product.productStatus}</td>
              <td>{product.quantity}</td>
              <td>{product.inventoryStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}