import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
       const products = [];
  let cursor = null;
  let hasNextPage = true;
  const orders = [];
let orderCursor = null;
let hasNextOrderPage = true;
while (hasNextPage) {
  const productsResponse = await admin.graphql(
    `#graphql
    query BusinessIntelligenceProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        nodes {
          id
          title
          status
          vendor
          productType
          totalInventory
          tracksInventory
          createdAt
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    `,
    {
      variables: {
        cursor,
      },
    },
  );

  const productsResponseJson = await productsResponse.json();
  const productPage = productsResponseJson.data.products;

  products.push(...productPage.nodes);
  hasNextPage = productPage.pageInfo.hasNextPage;
  cursor = productPage.pageInfo.endCursor;
  while (hasNextOrderPage) {
  const ordersResponse = await admin.graphql(
    `#graphql
    query BusinessIntelligenceOrders($cursor: String) {
      orders(first: 50, after: $cursor) {
        nodes {
          id
          createdAt
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 250) {
            nodes {
              quantity
              product {
                id
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
    `,
    {
      variables: {
        cursor: orderCursor,
      },
    },
  );

  const ordersResponseJson = await ordersResponse.json();
  const orderPage = ordersResponseJson.data.orders;

  orders.push(...orderPage.nodes);
  hasNextOrderPage = orderPage.pageInfo.hasNextPage;
  orderCursor = orderPage.pageInfo.endCursor;
}
}
  const response = await admin.graphql(`
    #graphql
    query BusinessIntelligence {
      shop {
        name
        currencyCode
      }
    }
  `);

  const { data } = await response.json();

  return {
      orders,
      products,
    shop: data.shop,
  };
};
export default function BusinessIntelligence() {
    const { shop, products, orders } = useLoaderData();
    const activeProducts = products.filter(
  (product) => product.status === "ACTIVE",
);
const totalRevenue = orders.reduce(
  (total, order) =>
    total + Number(order.currentTotalPriceSet.shopMoney.amount),
  0,
);

  return (
    <s-page heading="Business Intelligence">
      <s-section heading="Business Intelligence Overview">
        <s-paragraph>
          Analyse your Shopify business as a whole to identify health, risks,
          opportunities, growth, and priorities.
        </s-paragraph>
                <s-paragraph>
          Store: {shop.name}
        </s-paragraph>
        <s-paragraph>
  Total products analysed: {products.length}
</s-paragraph>
      </s-section>
         <s-section heading="Business Health">
        <s-paragraph>
          Active products: {activeProducts.length}
        </s-paragraph>
        <s-paragraph>
  Orders analysed from the last 60 days: {orders.length}
</s-paragraph>
Revenue from the last 60 days: <span>{shop.currencyCode} {totalRevenue.toFixed(2)}</span>
      </s-section>
    </s-page>
  );
}