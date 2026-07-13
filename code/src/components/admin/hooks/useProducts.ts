import { useState, useEffect, useMemo, useCallback } from "react";
import {
  listProducts,
  toggleProductActive,
} from "../../../utils/adminApi";
import type { AdminProduct } from "../../../utils/adminApi";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "../../../utils/categoryNormalization";
import { setPendingToast } from "../toastUtils";

export interface FilterState {
  category: string;
  subcategory: string;
  status: "all" | "active" | "inactive";
  offer: boolean;
  search: string;
}

const PAGE_SIZE = 20;

export function useProducts() {
  const [allProducts, setAllProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    category: "",
    subcategory: "",
    status: "all",
    offer: false,
    search: "",
  });

  // Fetch ALL products once on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await listProducts();
        setAllProducts(data ?? []);
      } catch (e: any) {
        console.error("Error loading products:", e?.message || e);
      }
      setLoading(false);
    })();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  // Client-side filtering using normalization functions
  const filtered = useMemo(() => {
    let result = allProducts;

    // Category filter (uses display name)
    if (filters.category) {
      result = result.filter(
        (p) => getDisplayCategoryName(p) === filters.category,
      );
    }

    // Subcategory filter (uses display subcategories)
    if (filters.subcategory) {
      result = result.filter((p) =>
        getDisplaySubcategories(p).includes(filters.subcategory),
      );
    }

    // Status filter
    if (filters.status === "active") {
      result = result.filter((p) => p.active);
    } else if (filters.status === "inactive") {
      result = result.filter((p) => !p.active);
    }

    // Offer filter
    if (filters.offer) {
      result = result.filter((p) => p.en_oferta);
    }

    // Search filter (client-side, on display name and id)
    if (filters.search.length >= 1) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
      );
    }

    return result;
  }, [allProducts, filters]);

  // Paginate filtered results
  const paginated = useMemo(() => {
    const from = page * PAGE_SIZE;
    return filtered.slice(from, from + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Extract display category names (after normalization) for filter dropdown
  const displayCategories = useMemo(() => {
    const catMap = new Map<string, Map<string, number>>();
    for (const p of allProducts) {
      const catName = getDisplayCategoryName(p);
      if (!catMap.has(catName)) catMap.set(catName, new Map());
      const subs = getDisplaySubcategories(p);
      const subMap = catMap.get(catName)!;
      for (const s of subs) {
        subMap.set(s, (subMap.get(s) ?? 0) + 1);
      }
    }
    const result: { name: string; count: number; subcategories: { name: string; count: number }[] }[] = [];
    for (const [name, subMap] of catMap) {
      const subs = Array.from(subMap.entries())
        .map(([n, c]) => ({ name: n, count: c }))
        .sort((a, b) => a.name.localeCompare(b.name));
      result.push({ name, count: subs.reduce((acc, s) => acc + s.count, 0), subcategories: subs });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [allProducts]);

  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters({
      category: "",
      subcategory: "",
      status: "all",
      offer: false,
      search: "",
    });
  }, []);

  const toggleActive = useCallback(async (id: string, current: boolean) => {
    try {
      await toggleProductActive(id, !current);
      setAllProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, active: !current } : p)),
      );
    } catch (e: any) {
      setPendingToast({ type: "error", text: "Error al actualizar: " + (e?.message || "Error desconocido") });
    }
  }, []);

  return {
    products: paginated,
    totalCount: filtered.length,
    allProducts,
    loading,
    page,
    setPage,
    totalPages,
    filters,
    updateFilter,
    clearFilters,
    toggleActive,
    displayCategories,
    hasFilters:
      filters.category !== "" ||
      filters.subcategory !== "" ||
      filters.status !== "all" ||
      filters.offer,
  };
}
