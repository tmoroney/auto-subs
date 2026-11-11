import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({
  children,
  content,
  side = "top",
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6}>
          <BaseTooltip.Popup
            className={cn(
              "z-50 max-w-56 rounded-lg bg-[var(--as-fg)] px-2.5 py-1.5 text-xs text-[var(--as-bg)] shadow-lg",
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
