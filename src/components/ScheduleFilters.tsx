import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Calendar,
  MapPin,
  LayoutGrid,
  Users,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

interface SortOption {
  value: string;
  label: string;
}

interface ScheduleFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  sortOptions: SortOption[];
  locations: string[];
  totalCount: number;
  filteredCount: number;
}

function FilterPill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "filter-pill px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer whitespace-nowrap",
        active && "filter-pill-active",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-primary" />
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function AdvancedFilters({
  filters,
  onFilterChange,
  onClearAdvanced,
  locations,
  advancedCount,
}: {
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAdvanced: () => void;
  locations: string[];
  advancedCount: number;
}) {
  const dateOptions = [
    { value: "all", label: "Any time" },
    { value: "upcoming", label: "Upcoming" },
    { value: "past", label: "Past" },
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "this-month", label: "This month" },
  ];

  const courtOptions = [
    { value: "all", label: "Any" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4+", label: "4+" },
  ];

  const capacityOptions = [
    { value: "all", label: "Any" },
    { value: "full", label: "Full" },
    { value: "has-space", label: "Has space" },
    { value: "low", label: "< 50%" },
    { value: "empty", label: "Empty" },
  ];

  const locationOptions = [
    { value: "all", label: "All venues" },
    ...locations.map((loc) => ({ value: loc, label: loc })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Refine by date, venue, courts & capacity</p>
        {advancedCount > 0 && (
          <button
            type="button"
            onClick={onClearAdvanced}
            className="text-[12px] text-destructive hover:opacity-80 transition-opacity cursor-pointer font-medium"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <FilterGroup icon={Calendar} label="When">
          {dateOptions.map((opt) => (
            <FilterPill
              key={opt.value}
              active={filters.date === opt.value}
              onClick={() => onFilterChange("date", opt.value)}
            >
              {opt.label}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterGroup icon={MapPin} label="Venue">
          {locationOptions.map((opt) => (
            <FilterPill
              key={opt.value}
              active={filters.location === opt.value}
              onClick={() => onFilterChange("location", opt.value)}
              className="max-w-[140px] truncate"
            >
              {opt.label}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterGroup icon={LayoutGrid} label="Courts">
          {courtOptions.map((opt) => (
            <FilterPill
              key={opt.value}
              active={filters.courts === opt.value}
              onClick={() => onFilterChange("courts", opt.value)}
            >
              {opt.label}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterGroup icon={Users} label="Capacity">
          {capacityOptions.map((opt) => (
            <FilterPill
              key={opt.value}
              active={filters.capacity === opt.value}
              onClick={() => onFilterChange("capacity", opt.value)}
            >
              {opt.label}
            </FilterPill>
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}

export function ScheduleFilters({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  onClearAll,
  sortBy,
  onSortChange,
  sortOptions,
  locations,
  totalCount,
  filteredCount,
}: ScheduleFiltersProps) {
  const [tempSearch, setTempSearch] = useState(search);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => setTempSearch(search), [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (tempSearch !== search) onSearchChange(tempSearch);
    }, 300);
    return () => clearTimeout(t);
  }, [tempSearch, search, onSearchChange]);

  const statusOptions = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "released", label: "Released" },
    { value: "rotated", label: "Rotated" },
    { value: "closed", label: "Closed" },
  ];

  const advancedCount = useMemo(
    () =>
      ["date", "location", "courts", "capacity"].filter(
        (k) => filters[k] && filters[k] !== "all",
      ).length,
    [filters],
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (tempSearch.trim()) chips.push({ key: "search", label: `"${tempSearch.trim()}"` });

    const labels: Record<string, Record<string, string>> = {
      status: {
        open: "Open",
        released: "Released",
        rotated: "Rotated",
        closed: "Closed",
      },
      date: {
        upcoming: "Upcoming",
        past: "Past",
        today: "Today",
        "this-week": "This week",
        "this-month": "This month",
      },
      location: Object.fromEntries(locations.map((l) => [l, l])),
      courts: { "1": "1 court", "2": "2 courts", "3": "3 courts", "4+": "4+ courts" },
      capacity: {
        full: "Full",
        "has-space": "Has space",
        low: "Under 50%",
        empty: "Empty",
      },
    };

    for (const [key, val] of Object.entries(filters)) {
      if (val && val !== "all") {
        chips.push({ key, label: labels[key]?.[val] ?? val });
      }
    }
    return chips;
  }, [filters, tempSearch, locations]);

  const clearAdvanced = () => {
    onFilterChange("date", "all");
    onFilterChange("location", "all");
    onFilterChange("courts", "all");
    onFilterChange("capacity", "all");
  };

  const removeChip = (key: string) => {
    if (key === "search") {
      setTempSearch("");
      onSearchChange("");
    } else {
      onFilterChange(key, "all");
    }
  };

  const hasFilters = activeChips.length > 0;

  const triggerClassName = cn(
    "h-11 px-4 rounded-xl border-border bg-background hover:bg-accent text-foreground cursor-pointer gap-2 text-[13px] font-medium",
    advancedCount > 0 && "filter-trigger-active",
  );

  return (
    <div className="filter-panel rounded-xl overflow-hidden mb-6">
      {/* Search + actions row */}
      <div className="p-4 pb-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={tempSearch}
            onChange={(e) => setTempSearch(e.target.value)}
            placeholder="Search schedules..."
            className="pl-10 pr-9 h-11 filter-panel-inset rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
          />
          {tempSearch && (
            <button
              type="button"
              onClick={() => setTempSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="h-11 w-full sm:w-[168px] filter-panel-inset text-foreground rounded-xl text-[13px] cursor-pointer gap-2">
              <ArrowUpDown className="size-3.5 text-primary shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-popover-foreground">
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="cursor-pointer text-[13px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Desktop: popover */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("hidden md:flex", triggerClassName)}>
                <SlidersHorizontal className="size-4" />
                Filters
                {advancedCount > 0 && (
                  <span className="size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                    {advancedCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[min(520px,calc(100vw-2rem))] p-5 bg-popover text-popover-foreground border-border rounded-xl shadow-lg"
            >
              <AdvancedFilters
                filters={filters}
                onFilterChange={onFilterChange}
                onClearAdvanced={clearAdvanced}
                locations={locations}
                advancedCount={advancedCount}
              />
            </PopoverContent>
          </Popover>

          {/* Mobile: sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className={cn("md:hidden", triggerClassName)}>
                <SlidersHorizontal className="size-4" />
                {advancedCount > 0 ? advancedCount : "Filters"}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="bg-card border-t border-border rounded-t-2xl px-5 pb-8 pt-2 max-h-[88vh] overflow-y-auto text-foreground"
            >
              <SheetHeader className="pb-4">
                <SheetTitle className="text-left font-playfair text-lg text-foreground font-normal">
                  Advanced filters
                </SheetTitle>
              </SheetHeader>
              <AdvancedFilters
                filters={filters}
                onFilterChange={onFilterChange}
                onClearAdvanced={clearAdvanced}
                locations={locations}
                advancedCount={advancedCount}
              />
              <SheetClose asChild>
                <Button className="w-full mt-6 btn-premium-solid h-11 rounded-xl cursor-pointer">
                  Done
                </Button>
              </SheetClose>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Status segmented control */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-1 p-1 rounded-xl filter-panel-inset overflow-x-auto scrollbar-none">
          {statusOptions.map((opt) => (
            <FilterPill
              key={opt.value}
              active={filters.status === opt.value}
              onClick={() => onFilterChange("status", opt.value)}
              className="flex-1 sm:flex-none text-center min-w-[72px]"
            >
              {opt.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Footer: chips + count */}
      {(hasFilters || totalCount > 0) && (
        <div className="filter-panel-footer px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2 min-h-[28px]">
            {hasFilters ? (
              <>
                {activeChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="filter-chip inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[12px]"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={() => removeChip(chip.key)}
                      className="filter-chip-dismiss size-4 rounded-full grid place-items-center cursor-pointer"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer ml-1"
                >
                  <RotateCcw className="size-3" />
                  Clear all
                </button>
              </>
            ) : (
              <span className="text-[12px] text-muted-foreground">No filters applied</span>
            )}
          </div>

          {totalCount > 0 && (
            <p className="text-[12px] text-muted-foreground shrink-0 tabular-nums">
              <span className="font-mono text-foreground">{filteredCount}</span>
              <span className="text-muted-foreground/60 mx-1">/</span>
              <span className="font-mono">{totalCount}</span>
              <span className="ml-1.5">schedules</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
