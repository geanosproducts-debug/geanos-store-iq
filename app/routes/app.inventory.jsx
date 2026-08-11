import { useState } from "react";
import { useLoaderData, useRouteError, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import InventorySummary from "../Components/inventory/InventorySummary";
import InventoryThresholds from "../Components/inventory/InventoryThresholds";
import InventoryNeedsAttention from "../Components/inventory/InventoryNeedsAttention";
import InventoryTable from "../Components/inventory/InventoryTable";
import InventoryHealth from "../Components/inventory/InventoryHealth";

const INVENTORY_QUERY = `#graphql
  query GetInventoryProducts($cursor: String) {
    products(
      first: 250
      after: $cursor
      query: "tracks_inventory:true"
    ) {
    nodes {
  id
  title
  status
  totalInventory
  vendor
  productType
  tags
  handle
  createdAt
  updatedAt
}
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
const INVENTORY_MOVEMENT_QUERY = `#graphql
  query GetInventoryMovement($cursor: String, $query: String!) {
    orders(
      first: 100
      after: $cursor
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      nodes {
        id
        createdAt
        cancelledAt
        displayFinancialStatus
        test
        lineItems(first: 250) {
          nodes {
            quantity
            currentQuantity
            product {
              id
              title
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function fetchInventoryMovement(admin) {
  const movementPeriodDays = 30;
  const periodStart = new Date();

  periodStart.setUTCDate(periodStart.getUTCDate() - movementPeriodDays);

  const orderSearchQuery = [
    `created_at:>=${periodStart.toISOString()}`,
    "financial_status:paid",
    "test:false",
    "status:any",
  ].join(" ");

  const productMovementMap = new Map();

  let cursor = null;
  let hasNextPage = true;
  let pagesFetched = 0;
  let movementOrderCount = 0;
  let totalUnitsSold = 0;

  const MAX_MOVEMENT_PAGES = 100;

  while (hasNextPage && pagesFetched < MAX_MOVEMENT_PAGES) {
    const response = await admin.graphql(INVENTORY_MOVEMENT_QUERY, {
      variables: {
        cursor,
        query: orderSearchQuery,
      },
    });

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(
        `Inventory movement query failed on page ${pagesFetched + 1}: ${
          result.errors[0].message
        }`,
      );
    }

    if (!result.data?.orders) {
      throw new Error(
        `Shopify returned no order data on page ${pagesFetched + 1}.`,
      );
    }

    const { nodes, pageInfo } = result.data.orders;

    for (const order of nodes) {
      if (order.cancelledAt || order.test) {
        continue;
      }

      movementOrderCount += 1;

      for (const lineItem of order.lineItems.nodes) {
        const unitsSold = lineItem.currentQuantity ?? lineItem.quantity ?? 0;
        const product = lineItem.product;

        if (!product || unitsSold <= 0) {
          continue;
        }

        totalUnitsSold += unitsSold;

        const existingMovement = productMovementMap.get(product.id) ?? {
          productId: product.id,
          title: product.title,
          unitsSold: 0,
        };

        existingMovement.unitsSold += unitsSold;
        productMovementMap.set(product.id, existingMovement);
      }
    }

    pagesFetched += 1;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return {
    movementPeriodDays,
    movementOrderCount,
    totalUnitsSold,
    productMovement: Array.from(productMovementMap.values()).sort(
      (firstProduct, secondProduct) =>
        secondProduct.unitsSold - firstProduct.unitsSold ||
        firstProduct.title.localeCompare(secondProduct.title),
    ),
    movementTruncated: hasNextPage,
  };
}
async function fetchInventoryStatistics(admin) {
  let tracked = 0;
  let outOfStock = 0;
  let lowStock = 0;
  let highStock = 0;

  const products = [];
  let cursor = null;
  let hasNextPage = true;
  let pagesFetched = 0;

  const MAX_PAGES = 100;
  const inventoryMovement = await fetchInventoryMovement(admin);
  const movementByProductId = new Map(
  inventoryMovement.productMovement.map((product) => [
    product.productId,
    product.unitsSold,
  ]),
);

  while (hasNextPage && pagesFetched < MAX_PAGES) {
    const response = await admin.graphql(INVENTORY_QUERY, {
      variables: {
        cursor,
      },
    });

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(
        `Inventory query failed on page ${pagesFetched + 1}: ${
          result.errors[0].message
        }`,
      );
    }

    if (!result.data?.products) {
      throw new Error(
        `Shopify returned no product data on page ${pagesFetched + 1}.`,
      );
    }

    const { nodes, pageInfo } = result.data.products;

    for (const product of nodes) {
  const quantity = product.totalInventory ?? 0;
  const unitsSold = movementByProductId.get(product.id) ?? 0;
const estimatedStartingUnits = quantity + unitsSold;
const sellThroughRate =
  estimatedStartingUnits > 0
    ? Number(((unitsSold / estimatedStartingUnits) * 100).toFixed(1))
    : 0;
    const averageDailyUnitsSold =
  unitsSold / inventoryMovement.movementPeriodDays;

const daysOfStockRemaining =
  averageDailyUnitsSold > 0
    ? Math.ceil(quantity / averageDailyUnitsSold)
    : null;

  let inventoryStatus = "Normal Stock";

  tracked += 1;

  if (quantity <= 0) {
    outOfStock += 1;
    inventoryStatus = "Out of Stock";
  } else if (quantity <= 10) {
    lowStock += 1;
    inventoryStatus = "Low Stock";
  } else if (quantity > 50) {
    highStock += 1;
    inventoryStatus = "High Stock";
  }

  products.push({
  id: product.id,
  title: product.title,
  productStatus: product.status,
  quantity,
  unitsSold,
  daysOfStockRemaining,
sellThroughRate,
  inventoryStatus,
  vendor: product.vendor,
  productType: product.productType,
  tags: product.tags,
  handle: product.handle,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});
}

    pagesFetched += 1;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return {
      ...inventoryMovement,
    tracked,
    outOfStock,
    lowStock,
    highStock,
    products,
    pagesFetched,
    truncated: hasNextPage,
  };
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  return fetchInventoryStatistics(admin);
}

export default function InventoryPage() {
  const {
        movementPeriodDays,
    movementOrderCount,
    totalUnitsSold,
    productMovement,
    tracked,
    outOfStock,
    lowStock,
    highStock,
    products,
    pagesFetched,
    truncated,
  } = useLoaderData();
  const [searchTerm, setSearchTerm] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("All");
const [sortOption, setSortOption] = useState("Product A-Z");
const [lastUpdated] = useState(() => new Date());
const revalidator = useRevalidator();
 const filteredProducts = products
  .filter((product) => {
    const matchesSearch = product.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const matchesInventoryFilter =
      inventoryFilter === "All" ||
      product.inventoryStatus === inventoryFilter;

    return matchesSearch && matchesInventoryFilter;
  })
  .sort((a, b) => {
    if (sortOption === "Product A-Z") {
      return a.title.localeCompare(b.title);
    }

    if (sortOption === "Product Z-A") {
      return b.title.localeCompare(a.title);
    }

    if (sortOption === "Inventory Low-High") {
      return a.quantity - b.quantity;
    }

    if (sortOption === "Inventory High-Low") {
      return b.quantity - a.quantity;
    }

    return 0;
  });
 const needsAttentionCount = products.filter(
  (product) =>
    product.inventoryStatus === "Out of Stock" ||
    product.inventoryStatus === "Low Stock",
).length;
  return (
    <s-page heading="Inventory Intelligence Dashboard">
      <s-paragraph tone="subdued">
  Last updated: {lastUpdated.toLocaleString()}
</s-paragraph>
<s-button onClick={() => revalidator.revalidate()}>
  Refresh Inventory
</s-button>
      <s-section heading="Search Products">
        <s-text-field
  label="Search inventory"
  value={searchTerm}
  onInput={(event) => setSearchTerm(event.currentTarget.value)}
  placeholder="Search by product name..."
/>
  <s-select
  label="Inventory status"

  value={inventoryFilter}
  onChange={(event) => setInventoryFilter(event.currentTarget.value)}
>
  <s-option value="All">All</s-option>
  <s-option value="Out of Stock">Out of Stock</s-option>
  <s-option value="Low Stock">Low Stock</s-option>
  <s-option value="Normal Stock">Normal Stock</s-option>
  <s-option value="High Stock">High Stock</s-option>
</s-select>
<s-select
  label="Sort products"
  value={sortOption}
  onChange={(event) => setSortOption(event.currentTarget.value)}
>
  <s-option value="Product A-Z">Product A-Z</s-option>
  <s-option value="Product Z-A">Product Z-A</s-option>
  <s-option value="Inventory Low-High">Inventory Low-High</s-option>
  <s-option value="Inventory High-Low">Inventory High-Low</s-option>
</s-select>

</s-section>

       <s-section heading="Inventory Health">
    <s-card>
      <InventoryHealth products={products} />
      </s-card>
</s-section>
<s-section
  heading={`Inventory Movement — Last ${movementPeriodDays} Days`}
>
  <s-card>
    <s-paragraph>
      <strong>Completed orders:</strong> {movementOrderCount}
    </s-paragraph>

    <s-paragraph>
      <strong>Units sold:</strong> {totalUnitsSold}
    </s-paragraph>

    <s-paragraph>
      <strong>Products with sales:</strong> {productMovement.length}
    </s-paragraph>

{productMovement.length > 0 && (
  <div>
    <s-paragraph>
      <strong>Products Sold</strong>
    </s-paragraph>

    {productMovement.map((product) => (
      <s-paragraph key={product.productId}>
        {product.title}: {product.unitsSold}{" "}
        {product.unitsSold === 1 ? "unit" : "units"}
      </s-paragraph>
    ))}
  </div>
)}
    {productMovement.length === 0 && (
      <s-paragraph>
        No completed non-test product sales were recorded during this period.
      </s-paragraph>
    )}
  </s-card>
</s-section>

   <s-section heading="Inventory Summary">
  <s-card>
    <InventorySummary
      tracked={tracked}
      outOfStock={outOfStock}
      lowStock={lowStock}
      highStock={highStock}
      pagesFetched={pagesFetched}
      truncated={truncated}
    />
   </s-card>

   <s-card>
  <s-button href="/app/duplicated-products">
    🔍 Duplicated Products
  </s-button>
</s-card>
</s-section>

   <s-section heading={`Needs Attention (${needsAttentionCount})`}>
  <s-card>

       <InventoryNeedsAttention
      products={products.filter(
        (product) =>
          product.inventoryStatus === "Out of Stock" ||
          product.inventoryStatus === "Low Stock"
      )}
    />
  </s-card>
</s-section>

<s-section heading="Product Inventory Details">
  <s-card>
    <InventoryTable products={filteredProducts} />
</s-card>
</s-section>

   <s-section heading="Inventory Thresholds">
      <s-card>
        <InventoryThresholds />
      </s-card>
    </s-section>
  </s-page>
);
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};