import { useEffect, useMemo, useState } from "react";

const MAX_PRODUCTS = 2000;
const PAGE_SIZE = 100;

type Variant = {
  id: string;
  sku: string | null;
  barcode: string | null;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number;
  imageUrl: string | null;
  variants: Variant[];
};

type CriterionKey = 'TITLE' | 'SKU' | 'BARCODE' | 'HANDLE';

type DuplicateGroup = {
  key: string;
  criterion: CriterionKey;
  sharedValue: string;
  products: Product[];
};

const LIST_PRODUCTS_QUERY = `query ListProductsForDuplicates($first: Int!, $after: String) {
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
            image { url }
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
}`;

const ARCHIVE_PRODUCT_MUTATION = `mutation ArchiveProduct($input: ProductUpdateInput!) {
  productUpdate(product: $input) {
    product {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`;

const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: 'TITLE', label: 'Title' },
  { key: 'SKU', label: 'SKU' },
  { key: 'BARCODE', label: 'Barcode' },
  { key: 'HANDLE', label: 'Handle' },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function numericId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

function statusTone(status: string): 'success' | 'info' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'info';
  return 'neutral';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'DRAFT') return 'Draft';
  if (status === 'ARCHIVED') return 'Archived';
  return status;
}

function criterionLabel(key: CriterionKey): string {
  const found = CRITERIA.find((c) => c.key === key);
  return found ? found.label : key;
}

function Extension() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scannedCount, setScannedCount] = useState<number>(0);
  const [capReached, setCapReached] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activeCriteria, setActiveCriteria] = useState<Record<CriterionKey, boolean>>({
    TITLE: true,
    SKU: true,
    BARCODE: true,
    HANDLE: true,
  });
  const [filterCriterion, setFilterCriterion] = useState<string>('ALL');

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Product | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setScannedCount(0);
    setCapReached(false);

    const collected: Product[] = [];
    let cursor: string | null = null;
    let hasNext = true;

    try {
      while (hasNext && collected.length < MAX_PRODUCTS) {
       const { data, errors }: any = await (shopify as any).query(LIST_PRODUCTS_QUERY, {
          variables: { first: PAGE_SIZE, after: cursor },
        });

        if (errors?.length > 0) {
          setLoadError(errors.map((e: { message: string }) => e.message).join(', '));
          setLoading(false);
          return;
        }

        const connection = data?.products;
        if (!connection) break;

        for (const edge of connection.edges) {
          const node = edge.node;
          const variants: Variant[] = node.variants.edges.map((ve: { node: Variant }) => ({
            id: ve.node.id,
            sku: ve.node.sku,
            barcode: ve.node.barcode,
          }));
          collected.push({
            id: node.id,
            title: node.title,
            handle: node.handle,
            status: node.status,
            totalInventory: node.totalInventory ?? 0,
            imageUrl: node.featuredMedia?.image?.url ?? null,
            variants,
          });
        }

        setScannedCount(collected.length);
        hasNext = connection.pageInfo.hasNextPage;
        cursor = connection.pageInfo.endCursor;
      }

      if (hasNext && collected.length >= MAX_PRODUCTS) {
        setCapReached(true);
      }

      setProducts(collected);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load products. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const groups = useMemo<DuplicateGroup[]>(() => {
    const result: DuplicateGroup[] = [];

    const buildProductLevel = (criterion: CriterionKey, keyOf: (p: Product) => string | null) => {
      const map = new Map<string, { value: string; products: Product[] }>();
      for (const p of products) {
        const raw = keyOf(p);
        if (raw === null) continue;
        const norm = normalizeText(raw);
        if (norm.length === 0) continue;
        const existing = map.get(norm);
        if (existing) {
          existing.products.push(p);
        } else {
          map.set(norm, { value: raw.trim(), products: [p] });
        }
      }
      for (const [norm, entry] of map) {
        if (entry.products.length >= 2) {
          result.push({
            key: `${criterion}:${norm}`,
            criterion,
            sharedValue: entry.value,
            products: entry.products,
          });
        }
      }
    };

    const buildVariantLevel = (criterion: CriterionKey, valueOf: (v: Variant) => string | null) => {
      const map = new Map<string, { value: string; products: Map<string, Product> }>();
      for (const p of products) {
        const seen = new Set<string>();
        for (const v of p.variants) {
          const raw = valueOf(v);
          if (raw === null) continue;
          const norm = normalizeText(raw);
          if (norm.length === 0) continue;
          if (seen.has(norm)) continue;
          seen.add(norm);
          const existing = map.get(norm);
          if (existing) {
            existing.products.set(p.id, p);
          } else {
            const products0 = new Map<string, Product>();
            products0.set(p.id, p);
            map.set(norm, { value: raw.trim(), products: products0 });
          }
        }
      }
      for (const [norm, entry] of map) {
        if (entry.products.size >= 2) {
          result.push({
            key: `${criterion}:${norm}`,
            criterion,
            sharedValue: entry.value,
            products: Array.from(entry.products.values()),
          });
        }
      }
    };

    if (activeCriteria.TITLE) buildProductLevel('TITLE', (p) => p.title);
    if (activeCriteria.HANDLE) buildProductLevel('HANDLE', (p) => p.handle);
    if (activeCriteria.SKU) buildVariantLevel('SKU', (v) => v.sku);
    if (activeCriteria.BARCODE) buildVariantLevel('BARCODE', (v) => v.barcode);

    return result;
  }, [products, activeCriteria]);

  const noCriteriaSelected: boolean =
    !activeCriteria.TITLE &&
    !activeCriteria.SKU &&
    !activeCriteria.BARCODE &&
    !activeCriteria.HANDLE;

  const visibleGroups = useMemo<DuplicateGroup[]>(() => {
    if (filterCriterion === 'ALL') return groups;
    return groups.filter((g) => g.criterion === filterCriterion);
  }, [groups, filterCriterion]);

  const involvedProductCount = useMemo<number>(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const p of g.products) ids.add(p.id);
    }
    return ids.size;
  }, [groups]);

  const toggleCriterion = (key: CriterionKey, checked: boolean) => {
    setActiveCriteria((prev) => ({ ...prev, [key]: checked }));
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    const target = pendingArchive;
    setArchivingId(target.id);
    setActionError(null);

    try {
    const { data, errors }: any = await (shopify as any).query(ARCHIVE_PRODUCT_MUTATION, {
        variables: { input: { id: target.id, status: 'ARCHIVED' } },
      });

      if (errors?.length > 0) {
        setActionError(errors.map((e: { message: string }) => e.message).join(', '));
        return;
      }

      const userErrors = data?.productUpdate?.userErrors ?? [];
      if (userErrors.length > 0) {
        setActionError(
          userErrors
            .map((e: { field: string[] | null; message: string }) =>
              e.field && e.field.length > 0 ? `${e.field.join('.')}: ${e.message}` : e.message,
            )
            .join(', '),
        );
        return;
      }

      if (data?.productUpdate?.product) {
        const newStatus = data.productUpdate.product.status;
        setProducts((prev) =>
          prev.map((p) => (p.id === target.id ? { ...p, status: newStatus } : p)),
        );
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to archive product. Please try again.',
      );
    } finally {
      setArchivingId(null);
      setPendingArchive(null);
    }
  };

  if (loading) {
    return (
      <s-page heading="Duplicate Product Finder">
        <s-section>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-spinner accessibilityLabel="Scanning products" />
            <s-text>Scanning products… {scannedCount} scanned</s-text>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (loadError) {
    return (
      <s-page heading="Duplicate Product Finder">
        <s-section>
          <s-banner tone="critical" heading="Couldn't load products">
            <s-paragraph>{loadError}</s-paragraph>
            <s-button slot="primary-action" onClick={fetchProducts}>
              Rescan
            </s-button>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  if (products.length === 0) {
    return (
      <s-page heading="Duplicate Product Finder">
        <s-section accessibilityLabel="No products">
          <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
            <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
              <s-stack alignItems="center">
                <s-heading>No products found</s-heading>
                <s-paragraph>
                  There are no products in your store to scan for duplicates.
                </s-paragraph>
              </s-stack>
              <s-button href="shopify://admin/products" variant="primary">
                Go to products
              </s-button>
            </s-grid>
          </s-grid>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Duplicate Product Finder">
      <s-button slot="primary-action" onClick={fetchProducts}>
        Rescan
      </s-button>

      {capReached ? (
        <s-banner tone="info">
          <s-paragraph>
            Showing duplicates from the first {MAX_PRODUCTS} products scanned. Some products were
            not included.
          </s-paragraph>
        </s-banner>
      ) : null}

      {actionError ? (
        <s-banner tone="critical" heading="Couldn't archive product">
          <s-paragraph>{actionError}</s-paragraph>
        </s-banner>
      ) : null}

      <s-section heading="Match criteria">
        <s-paragraph>Choose which criteria to use when matching duplicate products.</s-paragraph>
        <s-stack direction="inline" gap="large">
          {CRITERIA.map((c) => (
            <s-checkbox
              key={c.key}
              label={c.label}
              checked={activeCriteria[c.key]}
              onChange={(e: Event) =>
                toggleCriterion(c.key, (e.currentTarget as HTMLInputElement).checked)
              }
            />
          ))}
        </s-stack>
      </s-section>

      {noCriteriaSelected ? (
        <s-section>
          <s-banner tone="warning">
            <s-paragraph>Select at least one match criterion to find duplicates.</s-paragraph>
          </s-banner>
        </s-section>
      ) : groups.length === 0 ? (
        <s-section accessibilityLabel="No duplicates">
          <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
            <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
              <s-stack alignItems="center">
                <s-heading>No duplicates found</s-heading>
                <s-paragraph>
                  No duplicate products were found for the selected criteria. Try enabling more
                  match criteria or rescanning your catalog.
                </s-paragraph>
              </s-stack>
            </s-grid>
          </s-grid>
        </s-section>
      ) : (
        <>
          <s-section heading="Summary">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-stack gap="small-500">
                <s-text type="strong">{groups.length}</s-text>
                <s-text color="subdued">Duplicate groups</s-text>
              </s-stack>
              <s-stack gap="small-500">
                <s-text type="strong">{involvedProductCount}</s-text>
                <s-text color="subdued">Products involved</s-text>
              </s-stack>
              <s-box minInlineSize="200px">
                <s-select
                  label="Filter by match type"
                  value={filterCriterion}
                  onChange={(e: Event) =>
                    setFilterCriterion((e.currentTarget as HTMLSelectElement).value)
                  }
                >
                  <s-option value="ALL">All match types</s-option>
                  {CRITERIA.map((c) => (
                    <s-option key={c.key} value={c.key}>
                      {c.label}
                    </s-option>
                  ))}
                </s-select>
              </s-box>
            </s-stack>
          </s-section>

          {visibleGroups.map((group) => (
            <s-section key={group.key} padding="none">
              <s-box padding="base">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-badge tone="info">{criterionLabel(group.criterion)}</s-badge>
                  <s-text type="strong">{group.sharedValue}</s-text>
                  <s-text color="subdued">{group.products.length} products</s-text>
                </s-stack>
              </s-box>
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header listSlot="inline">Status</s-table-header>
                  <s-table-header listSlot="labeled" format="numeric">
                    Inventory
                  </s-table-header>
                  <s-table-header listSlot="labeled">Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {group.products.map((product) => {
                    const idNum = numericId(product.id);
                    const isArchived: boolean = product.status === 'ARCHIVED';
                    const isArchiving: boolean = archivingId === product.id;
                    return (
                      <s-table-row key={`${group.key}-${product.id}`}>
                        <s-table-cell>
                          <s-stack direction="inline" gap="base" alignItems="center">
                            <s-thumbnail
                              size="small"
                              alt={product.title}
                              src={product.imageUrl ?? undefined}
                            />
                            <s-text type="strong">{product.title}</s-text>
                          </s-stack>
                        </s-table-cell>
                        <s-table-cell>
                          <s-badge tone={statusTone(product.status)}>
                            {statusLabel(product.status)}
                          </s-badge>
                        </s-table-cell>
                        <s-table-cell>{product.totalInventory}</s-table-cell>
                        <s-table-cell>
                          <s-stack direction="inline" gap="small" alignItems="center">
                            <s-link href={`shopify://admin/products/${idNum}`}>View</s-link>
                            {isArchived ? (
                              <s-text color="subdued">Archived</s-text>
                            ) : (
                              <s-button
                                variant="secondary"
                                loading={isArchiving}
                                commandFor="archive-modal"
                                command="--show"
                                onClick={() => setPendingArchive(product)}
                              >
                                Archive
                              </s-button>
                            )}
                          </s-stack>
                        </s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            </s-section>
          ))}
        </>
      )}

      <s-modal id="archive-modal" heading="Archive product">
        <s-stack gap="base">
          <s-paragraph>
            {pendingArchive
              ? `"${pendingArchive.title}" will be set to Archived. It will be hidden from your storefront and sales channels.`
              : ''}
          </s-paragraph>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          commandFor="archive-modal"
          command="--hide"
          onClick={confirmArchive}
        >
          Archive product
        </s-button>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="archive-modal"
          command="--hide"
          onClick={() => setPendingArchive(null)}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export default Extension;