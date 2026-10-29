import * as React from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[var(--as-line-strong)] p-0.5 transition-colors data-[checked]:bg-[var(--as-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--as-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--as-bg)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb className="block size-4 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-4" />
    </BaseSwitch.Root>
  );
}
