import { useEffect, useMemo, useState } from "react";

import {
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";

import { authenticate } from "../shopify.server";

const MAX_PRODUCTS = 2000;
const PAGE_SIZE = 100;
const LIST_PRODUCTS_QUERY = `#graphql
  query ListProductsForDuplicates($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: CREATED_AT) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          featuredMedia {
            ... on MediaImage {
              image {
                url
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                barcode
              }
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
const ARCHIVE_PRODUCT_MUTATION = `#graphql
  mutation ArchiveProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;const CRITERIA = [
  { value: "title", label: "Product title" },
  { value: "handle", label: "Product handle" },
  { value: "sku", label: "Variant SKU" },
  { value: "barcode", label: "Variant barcode" },
];
function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function numericId(globalId) {
  return String(globalId ?? "").split("/").pop() ?? "";
}

function statusTone(status) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "ARCHIVED":
      return "critical";
    default:
      return "warning";
  }
}

function statusLabel(status) {
  return status
    ? status.charAt(0) + status.slice(1).toLowerCase()
    : "Unknown";
}

function criterionLabel(value) {
  return (
    CRITERIA.find((criterion) => criterion.value === value)?.label ?? value
  );
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage && products.length < MAX_PRODUCTS) {
    const first = Math.min(
      PAGE_SIZE,
      MAX_PRODUCTS - products.length,
    );

    const response = await admin.graphql(LIST_PRODUCTS_QUERY, {
      variables: {
        first,
        after,
      },
    });

    const result = await response.json();

    if (result.errors?.length) {
      throw new Response("Unable to load Shopify products.", {
        status: 500,
      });
    }

    const productConnection = result.data?.products;

    if (!productConnection) {
      break;
    }

    products.push(
      ...productConnection.edges.map(({ node }) => node),
    );

    hasNextPage = Boolean(
      productConnection.pageInfo?.hasNextPage,
    );

    after = productConnection.pageInfo?.endCursor ?? null;
  }

  return { products };
}
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId");

  if (!productId) {
    return {
      success: false,
      error: "No product was selected.",
    };
  }

  const response = await admin.graphql(
    ARCHIVE_PRODUCT_MUTATION,
    {
      variables: {
        input: {
          id: productId,
          status: "ARCHIVED",
        },
      },
    },
  );

  const result = await response.json();

  if (result.errors?.length) {
    return {
      success: false,
      error: "Shopify could not archive the product.",
    };
  }

  const userErrors =
    result.data?.productUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      success: false,
      error: userErrors.map(({ message }) => message).join(" "),
    };
  }

  return {
    success: true,
    product:
      result.data?.productUpdate?.product ?? null,
  };
}

export default function DuplicatedProductsPage() {
  const { products } = useLoaderData();

const archiveFetcher = useFetcher();
const revalidator = useRevalidator();

const [criterion, setCriterion] = useState("title");
const [duplicatesOnly, setDuplicatesOnly] = useState(true);
const [selectedProduct, setSelectedProduct] = useState(null);
const mappedProducts = useMemo(
  () =>
    products.map((product) => ({
      id: product.id,
      numericId: numericId(product.id),
      title: product.title ?? "",
      handle: product.handle ?? "",
      status: product.status ?? "UNKNOWN",
      totalInventory: product.totalInventory ?? 0,
      imageUrl:
        product.featuredMedia?.image?.url ?? null,
      variants:
        product.variants?.edges?.map(({ node }) => ({
          id: node.id,
          sku: node.sku ?? "",
          barcode: node.barcode ?? "",
        })) ?? [],
    })),
  [products],
);

const duplicateGroups = useMemo(() => {
  const groups = new Map();

  mappedProducts.forEach((product) => {
    switch (criterion) {
      case "title": {
        const key = normalizeText(product.title);
        if (!key) break;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(product);
        break;
      }

      case "handle": {
        const key = normalizeText(product.handle);
        if (!key) break;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(product);
        break;
      }

      case "sku": {
        product.variants.forEach((variant) => {
          const key = normalizeText(variant.sku);
          if (!key) return;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(product);
        });
        break;
      }

      case "barcode": {
        product.variants.forEach((variant) => {
          const key = normalizeText(variant.barcode);
          if (!key) return;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(product);
        });
        break;
      }

      default:
        break;
    }
  });

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      products: items,
    }));
}, [mappedProducts, criterion]);

const displayedGroups = useMemo(() => {
  if (duplicatesOnly) {
    return duplicateGroups;
  }

  return mappedProducts.map((product) => ({
    key: product.id,
    products: [product],
  }));
}, [duplicateGroups, mappedProducts, duplicatesOnly]);

const involvedProductCount = useMemo(() => {
  const productIds = new Set();

  duplicateGroups.forEach((group) => {
    group.products.forEach((product) => {
      productIds.add(product.id);
    });
  });

  return productIds.size;
}, [duplicateGroups]);

const isArchiving = archiveFetcher.state !== "idle";
useEffect(() => {
  if (
    archiveFetcher.state === "idle" &&
    archiveFetcher.data?.success
  ) {
    setSelectedProduct(null);
    revalidator.revalidate();
  }
}, [archiveFetcher.state, archiveFetcher.data, revalidator]);

  return (
  <s-page heading="Duplicate Product Finder">
   
    <s-section heading="Duplicate Summary">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Products scanned: {mappedProducts.length}
        </s-paragraph>

        <s-paragraph>
          Duplicate groups found: {duplicateGroups.length}
        </s-paragraph>

        <s-paragraph>
          Products involved: {involvedProductCount}
         </s-paragraph>
</s-stack>
 </s-section>
        <s-section heading="Duplicate Filters">
  <s-stack direction="block" gap="base">
    <s-select
      label="Check duplicates by"
      value={criterion}
      onChange={(event) => setCriterion(event.target.value)}
    >
      {CRITERIA.map((item) => (
        <s-option key={item.value} value={item.value}>
          {item.label}
        </s-option>
      ))}
    </s-select>

    <s-checkbox
      checked={duplicatesOnly}
      onChange={(event) =>
        setDuplicatesOnly(event.target.checked)
      }
    >
      Show duplicate groups only
    </s-checkbox>
  </s-stack>
  </s-section>
<s-section heading="Duplicate Results">
  <s-stack direction="inline" gap="base">
 <s-button variant="primary"
    onClick={() => revalidator.revalidate()}
    loading={revalidator.state !== "idle"}
  >
    Rescan Products
  </s-button>
  <s-button variant="primary" href="shopify:admin/products">
  Edit Products
</s-button>
</s-stack>
  <s-paragraph>
    Found {displayedGroups.length} matching group
    {displayedGroups.length === 1 ? "" : "s"} using{" "}
    {criterionLabel(criterion)}.
  </s-paragraph>
  {archiveFetcher.data?.error && (
  <s-banner tone="critical">
    {archiveFetcher.data.error}
  </s-banner>
)}

{archiveFetcher.data?.success && (
  <s-banner tone="success">
    Product archived successfully.
  </s-banner>
)}
  {displayedGroups.length === 0 ? (
  <s-banner tone="success">
    No duplicate products found.
  </s-banner>
) : (
  <s-stack direction="block" gap="base">
  {displayedGroups.map((group) => (
    <s-card key={group.key}>
      <s-heading>
        {group.products.length} matching product
        {group.products.length === 1 ? "" : "s"}
      </s-heading>

      <s-paragraph>
        Match value: <strong>{group.key}</strong>
      </s-paragraph>
    <s-stack direction="block" gap="base">
  {group.products.map((product) => (
    <div key={product.id}>
      <s-heading>{product.title || "Untitled product"}</s-heading>

      <s-badge tone={statusTone(product.status)}>
  {statusLabel(product.status)}
</s-badge>

      <s-paragraph>
        Inventory: {product.totalInventory}
      </s-paragraph>

     <s-button
     commandFor="archive-product-modal"
command="--show"
  disabled={product.status === "ARCHIVED"}
  onClick={() => {
    setSelectedProduct(product);
  }}
>
  {product.status === "ARCHIVED"
    ? "Already archived"
    : "Archive product"}
</s-button>
    </div>
  ))}
</s-stack>
</s-card>
  ))}
</s-stack>
)}
</s-section>
<>
 <s-modal
  id="archive-product-modal"
  heading="Archive Duplicate Product"
>
    <s-box padding="base">
      
      <s-paragraph>
        You are about to archive:
      </s-paragraph>

      <s-heading>
        {selectedProduct?.title}
      </s-heading>
      <s-paragraph>
  This will change the product status in Shopify to Archived.
</s-paragraph>

<s-button
  commandFor="archive-product-modal"
  command="--hide"
  onClick={() => setSelectedProduct(null)}
>
  Cancel
</s-button>
<s-button
  variant="primary"
  loading={isArchiving}
  onClick={() => {
    const formData = new FormData();
    formData.append("productId", selectedProduct.id);

    archiveFetcher.submit(formData, {
      method: "post",
    });
  }}
>
  Archive Product
</s-button>
    </s-box>
  </s-modal>
</>

  </s-page>
);
}
