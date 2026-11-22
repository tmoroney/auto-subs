import * as React from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cn(
        "inline-flex h-[21px] w-9 shrink-0 cursor-pointer items-center rounded-[999px] border-none bg-[var(--as-line-strong)] p-0 text-sm leading-[normal] transition-colors data-[checked]:bg-[var(--as-primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb className="as-switch-thumb ml-[2.5px] block size-4 rounded-[50%] bg-white transition-transform data-[checked]:translate-x-[15px]" />
    </BaseSwitch.Root>
  );
}
