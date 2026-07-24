import { useLoaderData, useRouteError } from "react-router";
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
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

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
    inventoryStatus,
  });
}

    pagesFetched += 1;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return {
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
    tracked,
    outOfStock,
    lowStock,
    highStock,
    products,
    pagesFetched,
    truncated,
  } = useLoaderData();

  return (
    <s-page heading="Inventory Intelligence Dashboard">

       <s-section heading="Inventory Health">
    <s-card>
      <InventoryHealth products={products} />
    </s-card>
  </s-section>
  
      <InventorySummary
      tracked={tracked}
      outOfStock={outOfStock}
      lowStock={lowStock}
      highStock={highStock}
      pagesFetched={pagesFetched}
      truncated={truncated}
    />

    <s-section heading="Needs Attention (3)">
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
       <InventoryTable products={products} />
</s-card>
</s-section>

      <s-section heading="Inventory Thresholds">
<InventoryThresholds />
       
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