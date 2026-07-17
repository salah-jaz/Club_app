import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/api";
import type { Member } from "@/lib/types";

const SERVER_SEARCH_THRESHOLD = 200;
const SERVER_RESULT_LIMIT = 80;
const LIST_MAX_HEIGHT = 280;
const DEBOUNCE_MS = 300;

function memberLabel(m: Member) {
  return `${m.firstName} ${m.lastName}`;
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
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  useEffect(() => {
    setHighlightIndex(0);
    optionRefs.current = [];
  }, [query, debouncedQuery, filtered.length, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const selectMember = useCallback(
    (memberId: string) => {
      onValueChange(memberId);
      setOpen(false);
      setQuery("");
    },
    [onValueChange],
  );

  /** Dialog traps wheel events — keep scroll on this list. */
  const keepScrollLocal = (e: React.WheelEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

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
            "group flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] px-3 text-left text-sm text-[#F1F0EE] transition-colors cursor-pointer outline-none",
            "hover:border-[rgba(255,255,255,0.14)]",
            "focus-visible:border-[#10B981]/50 focus-visible:ring-2 focus-visible:ring-[#10B981]/20",
            open && "border-[#10B981]/40 ring-2 ring-[#10B981]/15",
            className,
          )}
        >
          {selected ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-[#EEF2F0]">{memberLabel(selected)}</span>
              <span className="text-[#6B7F78]"> · </span>
              <span className="font-mono text-[12px] text-[#8FA89F]">{fmtMoney(selected.credit)}</span>
            </span>
          ) : (
            <span className="text-[#8A8A98]">{placeholder}</span>
          )}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[#8A8A98] transition-transform duration-200",
              open && "rotate-180 text-[#34D399]",
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        // Allow wheel/touch scroll inside Dialog (react-remove-scroll)
        data-scroll-lock-scrollable=""
        className={cn(
          "z-[80] w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,320px)] p-0",
          "rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-[#F1F0EE]",
          "shadow-[0_16px_48px_rgba(0,0,0,0.55)] overflow-hidden",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onWheel={keepScrollLocal}
      >
        <div className="p-2.5 border-b border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/80">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A2120] px-2.5",
              "focus-within:border-[#10B981]/45 focus-within:ring-2 focus-within:ring-[#10B981]/15",
            )}
          >
            <Search className="size-3.5 shrink-0 text-[#6B7F78]" aria-hidden="true" />
            <input
              ref={inputRef}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search name or BI ID…"
              autoComplete="chrome-off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="member-combobox-search"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="h-9 w-full min-w-0 bg-transparent text-[13px] text-[#F1F0EE] outline-none placeholder:text-[#6B7F78] border-0 shadow-none ring-0 focus:ring-0 focus-visible:ring-0 rounded-none p-0"
            />
            {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-[#8FA89F]" aria-hidden="true" />}
          </div>
        </div>

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Members"
          data-scroll-lock-scrollable=""
          className={cn(
            "overflow-y-scroll overflow-x-hidden overscroll-contain",
            // Visible scrollbar so it’s clear more members exist
            "[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]",
            "[&::-webkit-scrollbar]:w-2",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20",
            "[&::-webkit-scrollbar-track]:bg-transparent",
          )}
          style={{ maxHeight: LIST_MAX_HEIGHT }}
          onWheel={keepScrollLocal}
          onTouchMove={keepScrollLocal}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center" role="status">
              <p className="text-sm text-[#8FA89F]">{loading ? "Searching…" : "No members found."}</p>
              {!loading && query.trim() && (
                <p className="mt-1 text-[11px] text-[#6B7F78]">Try a different name or BI ID</p>
              )}
            </div>
          ) : (
            filtered.map((m, index) => {
              const isSelected = m.id === value;
              const isHighlighted = index === highlightIndex;
              const isJunior = m.memberType.toLowerCase() === "junior";
              return (
                <div
                  key={m.id}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  id={`${listboxId}-option-${m.id}`}
                  role="option"
                  aria-selected={isSelected}
                  data-highlighted={isHighlighted || undefined}
                  className={cn(
                    "flex h-14 w-full cursor-pointer select-none items-center gap-2.5 px-2.5 outline-none",
                    isHighlighted && "bg-[#10B981]/10",
                    isSelected && !isHighlighted && "bg-white/[0.03]",
                  )}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMember(m.id);
                  }}
                >
                  <div
                    className={cn(
                      "size-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold border border-white/10",
                      isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#34D399]",
                    )}
                  >
                    {m.firstName[0]}
                    {m.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate text-[13px] font-medium text-[#EEF2F0]">
                        {memberLabel(m)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                          isJunior
                            ? "bg-[#F59E0B]/12 text-[#FBBF24]"
                            : "bg-[#10B981]/12 text-[#34D399]",
                        )}
                      >
                        {isJunior ? "Junior" : "Adult"}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[#6B7F78] mt-0.5">
                      {m.biMemberId ? m.biMemberId : "No BI ID"}
                      {m.grade ? ` · ${m.grade}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right pl-1">
                    <p
                      className={cn(
                        "font-mono text-[12px] font-medium",
                        m.credit < 0 ? "text-[#F87171]" : "text-[#8FA89F]",
                      )}
                    >
                      {fmtMoney(m.credit)}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="size-4 shrink-0 text-[#10B981]" aria-hidden="true" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-1.5">
            <p className="text-[10px] text-[#6B7F78]">
              {query.trim()
                ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
                : `${filtered.length} member${filtered.length === 1 ? "" : "s"}`}
              {filtered.length > 5 ? " · scroll for more" : ""}
            </p>
            <p className="text-[10px] text-[#6B7F78] hidden sm:block">↑↓ navigate · Enter select</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
