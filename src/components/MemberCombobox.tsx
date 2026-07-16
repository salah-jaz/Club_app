import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, Search, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/api";
import type { Member } from "@/lib/types";

const SERVER_SEARCH_THRESHOLD = 200;
const SERVER_RESULT_LIMIT = 50;
const ITEM_HEIGHT = 36;
const LIST_MAX_HEIGHT = 240;
const DEBOUNCE_MS = 300;

function memberLabel(m: Member) {
  return `${m.firstName} ${m.lastName}`;
}

function memberDisplay(m: Member) {
  return `${memberLabel(m)} — bal ${fmtMoney(m.credit)}`;
}

function memberMatches(m: Member, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = memberLabel(m).toLowerCase();
  const bi = (m.biMemberId || "").toLowerCase();
  const nick = (m.nickname || "").toLowerCase();
  return name.includes(q) || bi.includes(q) || nick.includes(q);
}

function sortMembers(members: Member[]) {
  return [...members].sort((a, b) => {
    const aNonZero = a.credit !== 0 ? 0 : 1;
    const bNonZero = b.credit !== 0 ? 0 : 1;
    if (aNonZero !== bNonZero) return aNonZero - bNonZero;
    return memberLabel(a).localeCompare(memberLabel(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

type MemberComboboxProps = {
  members: Member[];
  value: string;
  onValueChange: (memberId: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
};

export function MemberCombobox({
  members,
  value,
  onValueChange,
  className,
  placeholder = "Select member…",
  id,
}: MemberComboboxProps) {
  const listboxId = useId();
  const autoTriggerId = useId();
  const triggerId = id ?? autoTriggerId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [serverResults, setServerResults] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const useServerSearch = members.length >= SERVER_SEARCH_THRESHOLD;
  const selected = members.find((m) => m.id === value) ?? serverResults?.find((m) => m.id === value);

  useEffect(() => {
    if (!useServerSearch) {
      setDebouncedQuery(query);
      return;
    }
    const t = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, useServerSearch]);

  useEffect(() => {
    if (!open || !useServerSearch) {
      setServerResults(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = new URLSearchParams({ limit: String(SERVER_RESULT_LIMIT) });
    if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim());

    api
      .get<Member[]>(`/members?${params}`, { signal: controller.signal })
      .then((data) => {
        setServerResults(sortMembers(data));
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setServerResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, useServerSearch, debouncedQuery]);

  const filtered = useMemo(() => {
    if (useServerSearch) {
      return serverResults ?? [];
    }
    return sortMembers(members.filter((m) => memberMatches(m, query)));
  }, [useServerSearch, serverResults, members, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, debouncedQuery, filtered.length, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || filtered.length === 0) return;
    virtualizer.scrollToIndex(highlightIndex, { align: "auto" });
  }, [highlightIndex, open, filtered.length, virtualizer]);

  const selectMember = useCallback(
    (id: string) => {
      onValueChange(id);
      setOpen(false);
      setQuery("");
    },
    [onValueChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[highlightIndex];
      if (m) selectMember(m.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightIndex(Math.max(filtered.length - 1, 0));
    }
  };

  const activeOptionId =
    open && filtered[highlightIndex] ? `${listboxId}-option-${filtered[highlightIndex].id}` : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          className={cn(
            "flex h-[38px] w-full items-center justify-between whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E] px-3 py-2 text-sm text-[#F1F0EE] shadow-sm cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#10B981] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
            className,
          )}
        >
          <span className={cn(!selected && "text-[#8A8A98]")}>
            {selected ? memberDisplay(selected) : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] shadow-md overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.08)] px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-[#8A8A98]" aria-hidden="true" />
          <input
            ref={inputRef}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search name or member number…"
            // Prevent Chrome/Edge wallet & loyalty autofill (triggered by nearby "credit" form fields).
            // "off" is often ignored; a non-token value is more reliable in Chromium.
            autoComplete="chrome-off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="member-combobox-search"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className="h-8 w-full min-w-0 bg-transparent text-xs text-[#F1F0EE] outline-none placeholder:text-[#8A8A98] border-0 shadow-none ring-0 focus:ring-0 focus-visible:ring-0 rounded-none p-0"
          />
          {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-[#8A8A98]" aria-hidden="true" />}
        </div>

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Members"
          className="overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: LIST_MAX_HEIGHT }}
        >
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-[#8A8A98]" role="status">
              {loading ? "Searching…" : "No members found."}
            </div>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const m = filtered[virtualRow.index];
                const isSelected = m.id === value;
                const isHighlighted = virtualRow.index === highlightIndex;
                return (
                  <div
                    key={m.id}
                    id={`${listboxId}-option-${m.id}`}
                    role="option"
                    aria-selected={isSelected}
                    data-highlighted={isHighlighted || undefined}
                    className={cn(
                      "absolute left-0 top-0 w-full flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
                      isHighlighted && "bg-white/5",
                      isSelected && "font-medium",
                    )}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onMouseEnter={() => setHighlightIndex(virtualRow.index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMember(m.id);
                    }}
                  >
                    <span className="truncate">{memberDisplay(m)}</span>
                    {isSelected && (
                      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                        <Check className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
