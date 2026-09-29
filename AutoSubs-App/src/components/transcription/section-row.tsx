import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  number: React.ReactNode;
  label: string;
  action?: React.ReactNode;
}

export function SectionHeader({ number, label, action }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20 text-sm font-semibold text-primary">
        {number}
      </span>
      <h3 className="text-base font-semibold leading-none text-foreground">
        {label}
      </h3>
      {action ? <div className="ml-auto min-w-0">{action}</div> : null}
    </div>
  );
}

interface CompactSectionLabelProps {
  number: React.ReactNode;
  label: string;
}

function CompactSectionLabel({ number, label }: CompactSectionLabelProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary dark:bg-primary/20">
        {number}
      </span>
      <h3 className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
        {label}
      </h3>
    </div>
  );
}

interface CompactSettingsRowProps {
  number: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Pin the label to the first control row (h-10) when the row can grow taller. */
  alignTop?: boolean;
}

export function CompactSettingsRow({
  number,
  label,
  children,
  className,
  alignTop = false,
}: CompactSettingsRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-3 py-2.5",
        alignTop ? "items-start" : "items-center",
        className,
      )}
    >
      <div className={cn("flex min-w-0 items-center", alignTop && "h-10")}>
        <CompactSectionLabel number={number} label={label} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
