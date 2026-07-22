import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const INVENTORY_QUERY = `#graphql
  query GetInventoryProducts($cursor: String) {
    products(
      first: 250
      after: $cursor
      query: "tracks_inventory:true"
    ) {
      nodes {
        id
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

      tracked += 1;

      if (quantity <= 0) {
        outOfStock += 1;
      } else if (quantity <= 10) {
        lowStock += 1;
      } else if (quantity > 50) {
        highStock += 1;
      }
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
    pagesFetched,
    truncated,
  } = useLoaderData();

  return (
    <s-page heading="Inventory Intelligence">
      <s-section heading="Inventory Summary">
        <s-card>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-box padding="base" inlineSize="25%">
                <s-stack direction="block" gap="small">
                  <s-paragraph tone="subdued">
                    📦 Inventory Tracked
                  </s-paragraph>

                  <s-paragraph>{tracked}</s-paragraph>
                </s-stack>
              </s-box>

              <s-box padding="base" inlineSize="25%">
                <s-stack direction="block" gap="small">
                  <s-paragraph tone="subdued">
                    🔴 Out of Stock
                  </s-paragraph>

                  <s-paragraph>{outOfStock}</s-paragraph>
                </s-stack>
              </s-box>

              <s-box padding="base" inlineSize="25%">
                <s-stack direction="block" gap="small">
                  <s-paragraph tone="subdued">
                    🟡 Low Stock (1–10)
                  </s-paragraph>

                  <s-paragraph>{lowStock}</s-paragraph>
                </s-stack>
              </s-box>

              <s-box padding="base" inlineSize="25%">
                <s-stack direction="block" gap="small">
                  <s-paragraph tone="subdued">
                    🟢 High Stock (Over 50)
                  </s-paragraph>

                  <s-paragraph>{highStock}</s-paragraph>
                </s-stack>
              </s-box>
            </s-stack>

            <s-paragraph tone="subdued">
              Scanned {tracked.toLocaleString()} inventory-tracked products
              across {pagesFetched} {pagesFetched === 1 ? "page" : "pages"}.
            </s-paragraph>

            {truncated && (
              <s-banner tone="warning">
                <s-paragraph>
                  The inventory scan reached its safety limit of 25,000
                  products. The displayed totals may be incomplete.
                </s-paragraph>
              </s-banner>
            )}
          </s-stack>
        </s-card>
      </s-section>

      <s-section heading="Inventory Thresholds">
        <s-card>
          <s-stack direction="block" gap="small">
            <s-paragraph>
              Out of Stock: zero units or fewer
            </s-paragraph>

            <s-paragraph>
              Low Stock: between 1 and 10 units
            </s-paragraph>

            <s-paragraph>
              High Stock: more than 50 units
            </s-paragraph>
          </s-stack>
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