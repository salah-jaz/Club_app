import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  /** Defaults to "select". Use "date" for native date inputs. */
  type?: "select" | "date";
  options?: FilterOption[];
}

export interface SortOption {
  value: string;
  label: string;
}

interface SearchFilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Hide the search field (e.g. member-scoped pages). */
  showSearch?: boolean;
  filters: FilterConfig[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  sortOptions?: SortOption[];
  currentSort?: string;
  onSortChange?: (value: string) => void;
  /** Optional strip above search (e.g. Quick View tabs) */
  toolbar?: React.ReactNode;
  /** Trailing controls on the search row (e.g. view mode toggle) */
  actions?: React.ReactNode;
  className?: string;
}

const fieldLabelClass =
  "text-[10px] font-semibold tracking-[0.1em] text-[#8A8A98] uppercase leading-none";

const selectTriggerClass =
  "w-full h-8 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] rounded-lg text-xs focus:ring-1 focus:ring-[#10B981] cursor-pointer";

const selectContentClass =
  "bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]";

const selectItemClass = "cursor-pointer hover:bg-white/5 text-xs";

/** Search field: icon inset + padding so text never overlaps the icon or clear button. */
const searchInputClass =
  "search-filter-input bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] focus-visible:ring-1 focus-visible:ring-[#10B981] h-8 rounded-lg text-xs text-[#F1F0EE]";

const dateInputClass =
  "search-filter-date w-full h-8 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981] cursor-pointer";

function isFilterActive(type: FilterConfig["type"], value: string | undefined) {
  if (type === "date") return Boolean(value && value !== "");
  return Boolean(value && value !== "all" && value !== "");
}

function FilterSelectField({
  label,
  value,
  onValueChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: FilterOption[];
  id?: string;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className={fieldLabelClass}>
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-label={label} className={selectTriggerClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={selectContentClass}>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className={selectItemClass}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterDateField({
  label,
  value,
  onValueChange,
  id,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className={fieldLabelClass}>
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label={label}
        className={dateInputClass}
      />
    </div>
  );
}

function FilterField({
  config,
  value,
  onValueChange,
}: {
  config: FilterConfig;
  value: string;
  onValueChange: (value: string) => void;
}) {
  if (config.type === "date") {
    return (
      <FilterDateField
        label={config.label}
        value={value}
        onValueChange={onValueChange}
        id={`filter-${config.key}`}
      />
    );
  }

  return (
    <FilterSelectField
      label={config.label}
      value={value || "all"}
      onValueChange={onValueChange}
      options={config.options ?? []}
      id={`filter-${config.key}`}
    />
  );
}

export function SearchFilterBar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  showSearch = true,
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  sortOptions = [],
  currentSort = "",
  onSortChange,
  toolbar,
  actions,
  className,
}: SearchFilterBarProps) {
  const [tempSearch, setTempSearch] = useState(searchValue);

  useEffect(() => {
    setTempSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (tempSearch !== searchValue) {
        onSearchChange(tempSearch);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [tempSearch, onSearchChange, searchValue]);

  const activeCount = useMemo(() => {
    return filters.filter((f) => isFilterActive(f.type, activeFilters[f.key])).length;
  }, [activeFilters, filters]);

  const activeChips = useMemo(() => {
    const chips: { key: string; filterLabel: string; value: string; optionLabel: string }[] = [];
    filters.forEach((conf) => {
      const val = activeFilters[conf.key];
      if (!isFilterActive(conf.type, val)) return;

      let optionLabel = val;
      if (conf.type === "date") {
        try {
          optionLabel = new Date(val + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        } catch {
          optionLabel = val;
        }
      } else {
        const opt = conf.options?.find((o) => o.value === val);
        optionLabel = opt ? opt.label : val;
      }

      chips.push({
        key: conf.key,
        filterLabel: conf.label,
        value: val,
        optionLabel,
      });
    });
    return chips;
  }, [activeFilters, filters]);

  const clearFilterValue = (conf: FilterConfig) => {
    onFilterChange(conf.key, conf.type === "date" ? "" : "all");
  };

  const filterColumnCount = filters.length + (sortOptions.length > 0 && onSortChange ? 1 : 0);
  const hasDesktopFilters = filterColumnCount > 0;
  const showMobileFilters = hasDesktopFilters;

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#131916] overflow-hidden mb-4",
        className,
      )}
    >
      {toolbar && (
        <div className="px-3 sm:px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-[#131916]">
          {toolbar}
        </div>
      )}

      <div className="px-3 sm:px-4 py-2.5 space-y-2.5">
        {/* Search + mobile filters trigger + optional actions */}
        {(showSearch || showMobileFilters || actions) && (
          <div className="flex items-center gap-2 w-full min-w-0">
            {showSearch && (
              <div className="relative flex-1 min-w-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#8A8A98] pointer-events-none z-[1]"
                  aria-hidden
                />
                <Input
                  value={tempSearch}
                  onChange={(e) => setTempSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={searchInputClass}
                />
                {tempSearch && (
                  <button
                    type="button"
                    onClick={() => setTempSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[#F1F0EE] transition-colors cursor-pointer z-[1]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )}

            {showMobileFilters && (
              <div className="lg:hidden shrink-0">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex items-center gap-1.5 border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-8 rounded-lg cursor-pointer px-3 text-xs",
                        activeCount > 0 && "border-[rgba(16,185,129,0.35)] text-[#34D399]",
                        !showSearch && "w-full",
                      )}
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span>Filters</span>
                      {activeCount > 0 && (
                        <span className="size-4 rounded-full bg-[#10B981] text-white text-[10px] font-bold grid place-items-center">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    className="bg-[#131916] border-t border-[rgba(255,255,255,0.1)] rounded-t-2xl p-6 text-[#F1F0EE] max-h-[85vh] flex flex-col justify-between"
                  >
                    <SheetHeader className="pb-2">
                      <SheetTitle className="text-left font-playfair font-normal text-lg text-[#F1F0EE]">
                        Filters
                      </SheetTitle>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto space-y-3.5 py-4 pr-1">
                      {filters.map((f) => (
                        <FilterField
                          key={f.key}
                          config={f}
                          value={activeFilters[f.key] ?? (f.type === "date" ? "" : "all")}
                          onValueChange={(val) => onFilterChange(f.key, val)}
                        />
                      ))}

                      {sortOptions.length > 0 && onSortChange && (
                        <div className="pt-2 border-t border-white/[0.06]">
                          <FilterSelectField
                            label="Sort"
                            value={currentSort}
                            onValueChange={onSortChange}
                            options={sortOptions}
                          />
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center gap-3">
                      {activeCount > 0 && (
                        <Button
                          variant="outline"
                          onClick={onClearAll}
                          className="flex-1 border-white/10 hover:bg-white/5 h-10 text-xs cursor-pointer"
                        >
                          Clear All
                        </Button>
                      )}
                      <SheetClose asChild>
                        <Button className="flex-1 btn-premium-solid h-10 text-xs font-semibold cursor-pointer">
                          Apply Filters
                        </Button>
                      </SheetClose>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            )}

            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
          </div>
        )}

        {/* Desktop filter grid — equal columns, labels above */}
        {hasDesktopFilters && (
          <div
            className={cn(
              "hidden lg:grid gap-2 xl:gap-2.5",
              filterColumnCount <= 3 && "grid-cols-3",
              filterColumnCount === 4 && "grid-cols-2 xl:grid-cols-4",
              filterColumnCount === 5 && "grid-cols-3 xl:grid-cols-5",
              filterColumnCount >= 6 && "grid-cols-3 xl:grid-cols-6",
            )}
          >
            {filters.map((f) => (
              <FilterField
                key={f.key}
                config={f}
                value={activeFilters[f.key] ?? (f.type === "date" ? "" : "all")}
                onValueChange={(val) => onFilterChange(f.key, val)}
              />
            ))}

            {sortOptions.length > 0 && onSortChange && (
              <FilterSelectField
                label="Sort"
                value={currentSort}
                onValueChange={onSortChange}
                options={sortOptions}
              />
            )}
          </div>
        )}

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-white/[0.04]">
            <span className="text-[10px] text-[#8A8A98] font-semibold uppercase tracking-[0.1em]">
              Active
            </span>
            {activeChips.map((chip) => {
              const conf = filters.find((f) => f.key === chip.key);
              return (
                <div
                  key={chip.key}
                  className="flex items-center gap-1 px-2 py-0.5 bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] rounded-full text-[11px] text-[#10B981]"
                >
                  <span>
                    {chip.filterLabel}: {chip.optionLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => conf && clearFilterValue(conf)}
                    className="hover:opacity-70 transition-opacity cursor-pointer text-current"
                    aria-label={`Clear ${chip.filterLabel} filter`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-[#8A8A98] hover:text-[#EF4444] transition-colors font-medium cursor-pointer underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable URL Parameter State Sync Helper Hook
export function useSearchFilters(
  initialFilters: Record<string, string> = {},
  initialSort = "",
) {
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("q") || "";
    }
    return "";
  });

  const [filters, setFilters] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const res: Record<string, string> = {};
      Object.keys(initialFilters).forEach((key) => {
        res[key] = params.get(key) || initialFilters[key];
      });
      return res;
    }
    return initialFilters;
  });

  const [sortBy, setSortBy] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("sortBy") || initialSort;
    }
    return initialSort;
  });

  // Sync to URL Query String
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all" && v !== initialFilters[k]) {
        params.set(k, v);
      }
    });
    if (sortBy && sortBy !== initialSort) {
      params.set("sortBy", sortBy);
    }

    const newSearch = params.toString();
    const currentUrl = window.location.pathname;
    const currentSearch = window.location.search;
    const nextUrl = newSearch ? `${currentUrl}?${newSearch}` : currentUrl;
    const currentFullUrl = currentSearch ? `${currentUrl}${currentSearch}` : currentUrl;

    if (nextUrl !== currentFullUrl && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [search, filters, sortBy, initialSort, initialFilters]);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const handleFilterChange = useCallback((key: string, val: string) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setFilters(
      Object.keys(initialFilters).reduce((acc, key) => {
        acc[key] = initialFilters[key];
        return acc;
      }, {} as Record<string, string>),
    );
  }, [initialFilters]);

  return {
    search,
    filters,
    sortBy,
    setSearch: handleSearchChange,
    setFilter: handleFilterChange,
    setSortBy,
    clearFilters: handleClearFilters,
  };
}

// Reusable Empty State Component
export function EmptyState({
  title = "No results found",
  description = "Try adjusting your search keywords or active filters to find what you are looking for.",
  onClear,
}: {
  title?: string;
  description?: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-10 border border-dashed border-white/[0.08] bg-[#131916]/40 rounded-xl max-w-lg mx-auto my-8 space-y-4">
      <div className="size-12 rounded-full bg-[rgba(16,185,129,0.08)] text-[#10B981] flex items-center justify-center">
        <Search className="size-6" />
      </div>
      <div>
        <h3 className="font-playfair text-lg text-[#F1F0EE] font-normal">{title}</h3>
        <p className="text-xs text-[#8A8A9A] font-light mt-1 max-w-[280px] mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {onClear && (
        <Button
          onClick={onClear}
          variant="outline"
          className="btn-premium-outline h-9 px-4 text-xs font-semibold cursor-pointer"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
