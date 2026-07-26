import { Link } from "react-router";

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
<th>Vendor</th>
<th>Product Type</th>
<th>Shopify Status</th>
<th>Inventory</th>
<th>Inventory Status</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
  <Link to={`/app/products/${product.handle}`}>
    {product.title}
  </Link>
</td>
<td>{product.vendor}</td>
<td>{product.productType || "Not assigned"}</td>
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