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
  options: FilterOption[];
}

export interface SortOption {
  value: string;
  label: string;
}

interface SearchFilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: FilterConfig[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  sortOptions?: SortOption[];
  currentSort?: string;
  onSortChange?: (value: string) => void;
}

export function SearchFilterBar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  sortOptions = [],
  currentSort = "",
  onSortChange,
}: SearchFilterBarProps) {
  const [tempSearch, setTempSearch] = useState(searchValue);

  // Sync internal search state if prop changes from outside (like clear all)
  useEffect(() => {
    setTempSearch(searchValue);
  }, [searchValue]);

  // Debounced search prop updater
  useEffect(() => {
    const handler = setTimeout(() => {
      if (tempSearch !== searchValue) {
        onSearchChange(tempSearch);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [tempSearch, onSearchChange, searchValue]);

  // Active filter count
  const activeCount = useMemo(() => {
    return Object.entries(activeFilters).filter(
      ([_, val]) => val && val !== "all" && val !== ""
    ).length;
  }, [activeFilters]);

  // Active filter chips mapper
  const activeChips = useMemo(() => {
    const chips: { key: string; filterLabel: string; value: string; optionLabel: string }[] = [];
    Object.entries(activeFilters).forEach(([key, val]) => {
      if (val && val !== "all" && val !== "") {
        const conf = filters.find((f) => f.key === key);
        if (conf) {
          const opt = conf.options.find((o) => o.value === val);
          chips.push({
            key,
            filterLabel: conf.label,
            value: val,
            optionLabel: opt ? opt.label : val,
          });
        }
      }
    });
    return chips;
  }, [activeFilters, filters]);

  return (
    <div className="w-full space-y-4 mb-6">
      {/* Search and Filters Layout Wrapper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
        
        {/* Search Input (Left Column on Desktop, full-width / flex-row on mobile) */}
        <div className="flex items-center gap-2 w-full md:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={tempSearch}
              onChange={(e) => setTempSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-10 pr-9 bg-[#131916] border-[rgba(255,255,255,0.06)] focus-visible:ring-1 focus-visible:ring-[#10B981] h-10 rounded-lg text-sm text-[#F1F0EE]"
            />
            {tempSearch && (
              <button
                type="button"
                onClick={() => setTempSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[#F1F0EE] transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Mobile Filter Button (Only Visible on Mobile) */}
          <div className="md:hidden shrink-0">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-[rgba(255,255,255,0.06)] bg-[#131916] hover:bg-white/5 text-[#F1F0EE] h-10 rounded-lg cursor-pointer px-4 text-sm"
                >
                  <SlidersHorizontal className="size-4" />
                  <span>Filters</span>
                  {activeCount > 0 && (
                    <span className="size-5 rounded-full bg-[#10B981] text-white text-[10px] font-bold grid place-items-center">
                      {activeCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-[#131916] border-t border-[rgba(255,255,255,0.1)] rounded-t-2xl p-6 text-[#F1F0EE] max-h-[85vh] flex flex-col justify-between">
                <SheetHeader className="pb-2">
                  <SheetTitle className="text-left font-playfair font-normal text-lg text-[#F1F0EE]">Filters</SheetTitle>
                </SheetHeader>
                
                {/* Scrollable Mobile Filters List */}
                <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
                  {filters.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        {f.label}
                      </Label>
                      <Select
                        value={activeFilters[f.key] || "all"}
                        onValueChange={(val) => onFilterChange(f.key, val)}
                      >
                        <SelectTrigger className="w-full bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-11 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                          {f.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer hover:bg-white/5">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  {/* Sort in Mobile Drawer (if enabled) */}
                  {sortOptions.length > 0 && onSortChange && (
                    <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        Sort By
                      </Label>
                      <Select value={currentSort} onValueChange={onSortChange}>
                        <SelectTrigger className="w-full bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-11 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                          {sortOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="cursor-pointer hover:bg-white/5">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-white/[0.04] flex items-center gap-3">
                  {activeCount > 0 && (
                    <Button
                      variant="outline"
                      onClick={onClearAll}
                      className="flex-1 border-white/10 hover:bg-white/5 h-11 text-xs"
                    >
                      Clear All
                    </Button>
                  )}
                  <SheetClose asChild>
                    <Button className="flex-1 btn-premium-solid h-11 text-xs font-semibold cursor-pointer">
                      Apply Filters
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Desktop Filter Dropdowns (Hidden on Mobile) */}
        <div className="hidden md:flex items-center gap-3 flex-wrap ml-auto">
          {filters.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-[0.06em] text-[#8A8A98] uppercase">
                {f.label}:
              </span>
              <Select
                value={activeFilters[f.key] || "all"}
                onValueChange={(val) => onFilterChange(f.key, val)}
              >
                <SelectTrigger className="w-[140px] bg-[#131916] border-[rgba(255,255,255,0.06)] focus:ring-0 text-[#F1F0EE] h-9 rounded-lg text-xs cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {f.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="cursor-pointer hover:bg-white/5 text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {/* Sort Dropdown (if enabled) */}
          {sortOptions.length > 0 && onSortChange && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/[0.06]">
              <span className="text-[11px] font-medium tracking-[0.06em] text-[#8A8A98] uppercase">
                Sort:
              </span>
              <Select value={currentSort} onValueChange={onSortChange}>
                <SelectTrigger className="w-[150px] bg-[#131916] border-[rgba(255,255,255,0.06)] focus:ring-0 text-[#F1F0EE] h-9 rounded-lg text-xs cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="cursor-pointer hover:bg-white/5 text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Chips (Removable tags) */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          <span className="text-[11px] text-[#8A8A98] font-medium uppercase tracking-[0.06em] mr-1">
            Active:
          </span>
          {activeChips.map((chip) => (
            <div
              key={chip.key}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] rounded-full text-xs text-[#34D399]"
            >
              <span>
                {chip.filterLabel}: {chip.optionLabel}
              </span>
              <button
                type="button"
                onClick={() => onFilterChange(chip.key, "all")}
                className="hover:text-white transition-colors cursor-pointer text-[#34D399]/75"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-[#EF4444] transition-colors ml-2 font-medium cursor-pointer underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// Reusable URL Parameter State Sync Helper Hook
export function useSearchFilters(
  initialFilters: Record<string, string> = {},
  initialSort = ""
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
      if (v && v !== "all") {
        params.set(k, v);
      }
    });
    if (sortBy) params.set("sortBy", sortBy);

    const newSearch = params.toString();
    const currentUrl = window.location.pathname;
    const nextUrl = newSearch ? `${currentUrl}?${newSearch}` : currentUrl;
    
    window.history.replaceState(
      { ...window.history.state, as: nextUrl, url: nextUrl },
      "",
      nextUrl
    );
  }, [search, filters, sortBy]);

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
        acc[key] = "all";
        return acc;
      }, {} as Record<string, string>)
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
