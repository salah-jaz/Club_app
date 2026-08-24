import { useCallback, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberCombobox } from "@/components/MemberCombobox";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ReportFilterValues = {
  fromDate: string;
  toDate: string;
  memberId: string;
  status: string;
  type: string;
  category: string;
};

export const EMPTY_REPORT_FILTERS: ReportFilterValues = {
  fromDate: "",
  toDate: "",
  memberId: "all",
  status: "all",
  type: "all",
  category: "all",
};

export type ReportSelectOption = { value: string; label: string };

export type ReportDialogConfig = {
  title?: string;
  description?: string;
  entityLabel: string;
  showDateRange?: boolean;
  showMember?: boolean;
  members?: Member[];
  /** When false, member filter is locked / hidden (e.g. member-scoped wallet page). */
  memberLocked?: boolean;
  statusOptions?: ReportSelectOption[];
  typeOptions?: ReportSelectOption[];
  categoryOptions?: ReportSelectOption[];
  statusLabel?: string;
  typeLabel?: string;
  categoryLabel?: string;
};

type ReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportDialogConfig;
  values: ReportFilterValues;
  onValuesChange: (next: ReportFilterValues) => void;
  previewCount: number;
  onExport: (format: "csv" | "pdf") => void | Promise<void>;
  exporting?: "csv" | "pdf" | null;
};

export function ReportTriggerButton({
  onClick,
  className,
  label = "Download Report",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("btn-premium-outline h-[38px] px-4 hover:cursor-pointer shrink-0", className)}
      onClick={onClick}
    >
      <Download className="size-4 mr-1.5 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </Button>
  );
}

export function useReportDialog(initial?: Partial<ReportFilterValues>) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [values, setValues] = useState<ReportFilterValues>({
    ...EMPTY_REPORT_FILTERS,
    ...initial,
  });

  const openWith = useCallback((preset?: Partial<ReportFilterValues>) => {
    setValues({ ...EMPTY_REPORT_FILTERS, ...preset });
    setOpen(true);
  }, []);

  const patch = useCallback((partial: Partial<ReportFilterValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
  }, []);

  return {
    open,
    setOpen,
    values,
    setValues,
    patch,
    exporting,
    setExporting,
    openWith,
  };
}

export async function runReportExport(opts: {
  count: number;
  emptyMessage?: string;
  format: "csv" | "pdf";
  setExporting: (v: "csv" | "pdf" | null) => void;
  setOpen: (v: boolean) => void;
  exportFn: (format: "csv" | "pdf") => void | Promise<void>;
}) {
  if (opts.count === 0) {
    toast.error(opts.emptyMessage || "No records match the selected filters.");
    return;
  }
  opts.setExporting(opts.format);
  try {
    await opts.exportFn(opts.format);
    toast.success(opts.format === "csv" ? "CSV report downloaded" : "PDF report downloaded");
    opts.setOpen(false);
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : "Failed to generate report.");
  } finally {
    opts.setExporting(null);
  }
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReportSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-sm cursor-pointer">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ReportDialog({
  open,
  onOpenChange,
  config,
  values,
  onValuesChange,
  previewCount,
  onExport,
  exporting = null,
}: ReportDialogProps) {
  const showDateRange = config.showDateRange !== false;
  const showMember = Boolean(config.showMember && config.members && !config.memberLocked);
  const members = config.members ?? [];
  const statusOptions = config.statusOptions;
  const typeOptions = config.typeOptions;
  const categoryOptions = config.categoryOptions;

  const selectGridCount = useMemo(() => {
    let n = 0;
    if (statusOptions?.length) n += 1;
    if (typeOptions?.length) n += 1;
    if (categoryOptions?.length) n += 1;
    return n;
  }, [statusOptions, typeOptions, categoryOptions]);

  const entity = config.entityLabel;
  const title = config.title || "Download report";
  const description =
    config.description ||
    `Choose filters, then download the matching ${entity} as CSV or PDF.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle className="text-[#F1F0EE]">{title}</DialogTitle>
          <DialogDescription className="text-[#8A8A98]">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {showDateRange && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                  From date
                </Label>
                <Input
                  type="date"
                  value={values.fromDate}
                  onChange={(e) => onValuesChange({ ...values, fromDate: e.target.value })}
                  className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                  To date
                </Label>
                <Input
                  type="date"
                  value={values.toDate}
                  onChange={(e) => onValuesChange({ ...values, toDate: e.target.value })}
                  className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
                />
              </div>
            </div>
          )}

          {showMember && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                  Member
                </Label>
                {values.memberId !== "all" && (
                  <button
                    type="button"
                    onClick={() => onValuesChange({ ...values, memberId: "all" })}
                    className="text-[11px] text-[#8A8A98] hover:text-[#EEF2F0] underline underline-offset-4 cursor-pointer"
                  >
                    All members
                  </button>
                )}
              </div>
              {values.memberId === "all" ? (
                <button
                  type="button"
                  onClick={() => members[0] && onValuesChange({ ...values, memberId: members[0].id })}
                  className="flex h-[38px] w-full items-center rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E] px-3 text-sm text-[#8A8A98] hover:text-[#EEF2F0] cursor-pointer text-left"
                >
                  All members
                </button>
              ) : (
                <MemberCombobox
                  id="report-dialog-member"
                  members={members}
                  value={values.memberId}
                  onValueChange={(id) => onValuesChange({ ...values, memberId: id })}
                />
              )}
            </div>
          )}

          {selectGridCount > 0 && (
            <div
              className={cn(
                "grid gap-3",
                selectGridCount === 1 ? "grid-cols-1" : "grid-cols-2",
              )}
            >
              {statusOptions && statusOptions.length > 0 && (
                <SelectFilter
                  label={config.statusLabel || "Status"}
                  value={values.status}
                  options={statusOptions}
                  onChange={(status) => onValuesChange({ ...values, status })}
                />
              )}
              {typeOptions && typeOptions.length > 0 && (
                <SelectFilter
                  label={config.typeLabel || "Type"}
                  value={values.type}
                  options={typeOptions}
                  onChange={(type) => onValuesChange({ ...values, type })}
                />
              )}
              {categoryOptions && categoryOptions.length > 0 && (
                <SelectFilter
                  label={config.categoryLabel || "Category"}
                  value={values.category}
                  options={categoryOptions}
                  onChange={(category) => onValuesChange({ ...values, category })}
                />
              )}
            </div>
          )}

          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E] px-3 py-2.5 text-xs text-[#8A8A98]">
            <span className="text-[#EEF2F0] font-medium">{previewCount}</span> {entity} match these
            filters
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="btn-premium-outline cursor-pointer w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={Boolean(exporting)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="btn-premium-outline cursor-pointer w-full sm:w-auto"
            onClick={() => void onExport("csv")}
            disabled={Boolean(exporting) || previewCount === 0}
          >
            <FileSpreadsheet className="size-4 mr-1.5" />
            {exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button
            type="button"
            className="btn-premium-solid cursor-pointer w-full sm:w-auto"
            onClick={() => void onExport("pdf")}
            disabled={Boolean(exporting) || previewCount === 0}
          >
            <FileText className="size-4 mr-1.5" />
            {exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
