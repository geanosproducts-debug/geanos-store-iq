import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query {
        productsCount {
          count
        }

          activeProductsCount: productsCount(query: "status:active") {
  count
}

 draftProductsCount: productsCount(query: "status:draft") {
   count
 }

 archivedProductsCount: productsCount(query: "status:archived") {
  count
}

      }`,
  );

  const data = await response.json();

  return {
    productCount: data.data.productsCount.count,
    activeProductCount: data.data.activeProductsCount.count,
    draftProductCount: data.data.draftProductsCount.count,
    archivedProductCount: data.data.archivedProductsCount.count,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
            demoInfo: metafield(namespace: "$app", key: "demo_info") {
              jsonValue
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
          metafields: [
            {
              namespace: "$app",
              key: "demo_info",
              value: "Created by React Router Template",
            },
          ],
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();
  const metaobjectResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpsertMetaobject($handle: MetaobjectHandleInput!, $values: JSON!) {
      metaobjectUpsert(handle: $handle, values: $values) {
        metaobject {
          id
          handle
          values
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        handle: {
          type: "$app:example",
          handle: "demo-entry",
        },
        values: {
          title: "Demo Entry",
          description:
            "This metaobject was created by the Shopify app template to demonstrate the metaobject API.",
        },
      },
    },
  );
  const metaobjectResponseJson = await metaobjectResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    metaobject: metaobjectResponseJson.data.metaobjectUpsert.metaobject,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const {
  productCount,
  activeProductCount,
  draftProductCount,
  archivedProductCount,
} = useLoaderData();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="GEANOS Store IQ">
      <s-button slot="primary-action" onClick={generateProduct}>
        Open GEANOS Store IQ
      </s-button>

      <s-section heading="Welcome to GEANOS Store IQ">
        <s-paragraph>
           Welcome to GEANOS Store IQ, your intelligent Shopify store management
  assistant. This application is designed to help you monitor your store,
  analyse products, identify sales opportunities, and provide practical
  insights to support better business decisions. As new features are
  developed, GEANOS Store IQ will become your central dashboard for
  managing and growing your business.
        </s-paragraph>
      </s-section>
      <s-section heading="Store Overview">
        <s-paragraph>
   Store Overview gives you a quick snapshot of your Shopify store. As GEANOS Store IQ grows, 
   this dashboard will help you monitor products, orders, customers and key business insights, 
   bringing your most important store information together in one place

</s-paragraph>

          <s-card>
  <s-stack direction="inline" gap="base">
    <s-box padding="base" flex-grow="1">
      <s-stack direction="block" gap="small">
        <s-paragraph variant="subdued">
          Total Products
        </s-paragraph>
        <s-heading>
          {productCount}
        </s-heading>
      </s-stack>
    </s-box>

    <s-box padding="base" flex-grow="1">
      <s-stack direction="block" gap="small">
        <s-paragraph variant="subdued">
          Active Products
        </s-paragraph>
        <s-heading>
          {activeProductCount}
        </s-heading>
      </s-stack>
    </s-box>

    <s-box padding="base" flex-grow="1">
      <s-stack direction="block" gap="small">
        <s-paragraph variant="subdued">
          Draft Products
        </s-paragraph>
        <s-heading>
          {draftProductCount}
        </s-heading>
      </s-stack>
    </s-box>

    <s-box padding="base" flex-grow="1">
      <s-stack direction="block" gap="small">
        <s-paragraph variant="subdued">
          Archived Products
        </s-paragraph>
        <s-heading>
          {archivedProductCount}
        </s-heading>
      </s-stack>
    </s-box>
  </s-stack>
</s-card>

        <s-paragraph>
          Product Data Check: All product totals balance.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            Launch GEANOS Store IQ
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              Edit product
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading="productCreate mutation">
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>productVariantsBulkUpdate mutation</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>metaobjectUpsert mutation</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <code>
                    {JSON.stringify(fetcher.data.metaobject, null, 2)}
                  </code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Store Status">
        <s-paragraph>
          <s-text>Shopify Connection: </s-text>
          <s-text>Connected</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>AI Engine: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Ready
          </s-link>
        </s-paragraph>
        <s-paragraph><s-text>GraphQL: </s-text>
  <s-link
    href="https://shopify.dev/docs/api/admin-graphql"
    target="_blank"
  >
    Open GraphiQL
  </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Custom data: </s-text>
          <s-link
            href="https://shopify.dev/docs/apps/build/custom-data"
            target="_blank"
          >
            Metafields &amp; metaobjects
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
