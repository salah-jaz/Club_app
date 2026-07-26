"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DateTimePickerProps {
  value?: string; // Expects "YYYY-MM-DDTHH:mm" format or ISO string
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const QUICK_PRESETS = [
  { label: "09:00 AM", h: 9, m: 0, p: "AM" as const },
  { label: "10:00 AM", h: 10, m: 0, p: "AM" as const },
  { label: "12:00 PM", h: 12, m: 0, p: "PM" as const },
  { label: "06:00 PM", h: 6, m: 0, p: "PM" as const },
  { label: "07:00 PM", h: 7, m: 0, p: "PM" as const },
  { label: "08:00 PM", h: 8, m: 0, p: "PM" as const },
];

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select Date & Time",
  className,
  disabled = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse existing value or fallback to null
  const parsedDate = React.useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);

  const selectedDate = parsedDate ?? undefined;

  // Extract initial 12-hour state
  const currentHour24 = parsedDate ? parsedDate.getHours() : 19; // Default 7 PM
  const currentMinutes = parsedDate ? parsedDate.getMinutes() : 0;
  
  const initialAmPm: "AM" | "PM" = currentHour24 >= 12 ? "PM" : "AM";
  let initialHour12 = currentHour24 % 12;
  if (initialHour12 === 0) initialHour12 = 12;

  const [hour12, setHour12] = React.useState<number>(initialHour12);
  const [minute, setMinute] = React.useState<number>(currentMinutes);
  const [ampm, setAmPm] = React.useState<"AM" | "PM">(initialAmPm);

  // Keep local time controls in sync when `value` prop changes
  React.useEffect(() => {
    if (parsedDate) {
      const h24 = parsedDate.getHours();
      const m = parsedDate.getMinutes();
      setAmPm(h24 >= 12 ? "PM" : "AM");
      let h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      setHour12(h12);
      setMinute(m);
    }
  }, [parsedDate]);

  // Helper to compute ISO/datetime-local string "YYYY-MM-DDTHH:mm"
  const emitValue = (baseDate: Date | null, h12: number, min: number, period: "AM" | "PM") => {
    const targetDate = baseDate ?? new Date();
    
    let h24 = h12 % 12;
    if (period === "PM") h24 += 12;

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const hours = String(h24).padStart(2, "0");
    const minutes = String(min).padStart(2, "0");

    const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
    onChange(formatted);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    emitValue(date, hour12, minute, ampm);
  };

  const handleHourChange = (newHourStr: string) => {
    const h = parseInt(newHourStr, 10);
    setHour12(h);
    emitValue(selectedDate ?? new Date(), h, minute, ampm);
  };

  const handleMinuteChange = (newMinStr: string) => {
    const m = parseInt(newMinStr, 10);
    setMinute(m);
    emitValue(selectedDate ?? new Date(), hour12, m, ampm);
  };

  const handleAmPmChange = (period: "AM" | "PM") => {
    setAmPm(period);
    emitValue(selectedDate ?? new Date(), hour12, minute, period);
  };

  const handleQuickTimeSelect = (h12: number, min: number, period: "AM" | "PM") => {
    setHour12(h12);
    setMinute(min);
    setAmPm(period);
    emitValue(selectedDate ?? new Date(), h12, min, period);
  };

  // Format trigger label
  const triggerLabel = React.useMemo(() => {
    if (!parsedDate) return placeholder;
    try {
      return format(parsedDate, "EEE, d MMM yyyy · hh:mm a");
    } catch {
      return placeholder;
    }
  }, [parsedDate, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          disabled={disabled}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal bg-[#1A2120] border-[rgba(255,255,255,0.06)] hover:border-[#10B981] hover:bg-[#1A2120] text-[#F1F0EE] rounded-lg h-10 px-3 transition-colors",
            !value && "text-[#8A8A98]",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-[#34D399] shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto p-3 bg-[#131916] border-[rgba(255,255,255,0.12)] text-[#F1F0EE] shadow-2xl rounded-xl max-w-[95vw] sm:max-w-none"
      >
        {/* Compact Header Summary Bar */}
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[rgba(255,255,255,0.06)] px-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-3.5 h-3.5 text-[#34D399]" />
            <span className="text-xs font-medium text-[#F1F0EE]">
              {selectedDate ? format(selectedDate, "EEE, d MMM yyyy") : "Select Date"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#1A2120] px-2 py-0.5 rounded-md border border-[rgba(255,255,255,0.08)]">
            <Clock className="w-3 h-3 text-[#34D399]" />
            <span className="text-xs font-mono font-bold text-[#34D399]">
              {String(hour12).padStart(2, "0")}:{String(minute).padStart(2, "0")} {ampm}
            </span>
          </div>
        </div>

        {/* Dual-Pane Layout: Calendar (Left) & Time Controls (Right) */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          {/* Calendar Pane */}
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A2120] p-1 flex items-center justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
              className="p-1 text-[#F1F0EE] [--cell-size:1.75rem]"
            />
          </div>

          {/* Time & Presets Controls Pane */}
          <div className="flex flex-col justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A2120] p-3 sm:w-[220px] space-y-3">
            {/* Time Pickers */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#34D399] uppercase tracking-wider block">
                Time (12-Hour)
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                {/* Hour */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[#8A8A98] block text-center uppercase tracking-wide">
                    Hour
                  </span>
                  <Select value={String(hour12)} onValueChange={handleHourChange}>
                    <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.12)] text-[#F1F0EE] h-8 text-xs px-2 font-mono justify-between hover:border-[rgba(255,255,255,0.25)] transition-colors focus:ring-1 focus:ring-[#10B981]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.15)] text-[#F1F0EE] max-h-40 min-w-[4.5rem] shadow-xl">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <SelectItem key={h} value={String(h)} className="text-xs font-mono cursor-pointer focus:bg-[#10B981]/20 focus:text-[#34D399]">
                          {String(h).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Minute */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[#8A8A98] block text-center uppercase tracking-wide">
                    Min
                  </span>
                  <Select value={String(minute)} onValueChange={handleMinuteChange}>
                    <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.12)] text-[#F1F0EE] h-8 text-xs px-2 font-mono justify-between hover:border-[rgba(255,255,255,0.25)] transition-colors focus:ring-1 focus:ring-[#10B981]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.15)] text-[#F1F0EE] max-h-40 min-w-[4.5rem] shadow-xl">
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                        <SelectItem key={m} value={String(m)} className="text-xs font-mono cursor-pointer focus:bg-[#10B981]/20 focus:text-[#34D399]">
                          {String(m).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AM/PM Toggle */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[#8A8A98] block text-center uppercase tracking-wide">
                    Period
                  </span>
                  <div className="grid grid-cols-2 p-0.5 bg-[#0C0F0E] border border-[rgba(255,255,255,0.12)] rounded-md h-8 items-center">
                    <button
                      type="button"
                      onClick={() => handleAmPmChange("AM")}
                      className={cn(
                        "h-full text-[10px] font-bold rounded transition-all cursor-pointer flex items-center justify-center",
                        ampm === "AM"
                          ? "bg-[#10B981] text-[#0C0F0E] shadow-sm"
                          : "text-[#8A8A98] hover:text-[#F1F0EE]",
                      )}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAmPmChange("PM")}
                      className={cn(
                        "h-full text-[10px] font-bold rounded transition-all cursor-pointer flex items-center justify-center",
                        ampm === "PM"
                          ? "bg-[#10B981] text-[#0C0F0E] shadow-sm"
                          : "text-[#8A8A98] hover:text-[#F1F0EE]",
                      )}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider block">
                Quick Presets
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleQuickTimeSelect(preset.h, preset.m, preset.p)}
                    className={cn(
                      "py-1 px-1.5 text-[10px] rounded-md border transition-all cursor-pointer font-mono text-center truncate font-medium",
                      hour12 === preset.h && minute === preset.m && ampm === preset.p
                        ? "border-[#10B981] bg-[#10B981]/20 text-[#34D399] font-bold shadow-xs"
                        : "border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] text-[#8A8A98] hover:border-[rgba(255,255,255,0.2)] hover:text-[#F1F0EE]",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Done Action Button */}
            <Button
              type="button"
              size="sm"
              onClick={() => setOpen(false)}
              className="w-full h-8 text-xs font-bold bg-[#10B981] hover:bg-[#059669] text-[#0C0F0E] cursor-pointer mt-auto rounded-md shadow-xs active:scale-[0.98] transition-all"
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

