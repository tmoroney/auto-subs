import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "tone" | "ghost" | "icon";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<
  React.ComponentProps<typeof BaseButton>,
  "className"
> & {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--as-primary)] bg-[var(--as-primary)] text-white hover:brightness-95 disabled:opacity-50",
  tone:
    "border border-[var(--as-line)] bg-[var(--as-card)] text-[var(--as-fg)] hover:bg-[var(--as-card-hover)] disabled:opacity-50",
  ghost:
    "border border-transparent bg-transparent text-[var(--as-fg-secondary)] hover:bg-[var(--as-card-hover)] hover:text-[var(--as-fg)] disabled:opacity-50",
  icon:
    "size-9 border border-transparent bg-transparent p-0 text-[var(--as-fg-secondary)] hover:bg-[var(--as-card-hover)] hover:text-[var(--as-fg)] disabled:opacity-50",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-[var(--as-radius)] px-3 text-xs",
  md: "h-9 gap-2 rounded-[var(--as-radius)] px-3.5 text-sm",
  lg: "h-10 gap-2 rounded-[var(--as-radius)] px-4 text-sm",
};

export function Button({
  variant = "tone",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--as-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--as-bg)] disabled:pointer-events-none",
        variants[variant],
        variant === "icon" ? "size-9 rounded-[var(--as-radius)]" : sizes[size],
        className,
      )}
    />
  );
}
