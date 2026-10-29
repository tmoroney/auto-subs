import * as React from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

export { Menu };

export function MenuPopup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={5}>
        <Menu.Popup
          className={cn(
            "z-50 min-w-40 overflow-hidden rounded-[var(--as-radius)] border border-[var(--as-line)] bg-[var(--as-bg)] p-1 text-[var(--as-fg)] shadow-xl outline-none",
            className,
          )}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function MenuItem({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      {...props}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-[var(--as-card-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        className,
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function MenuRadioItem({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      {...props}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-[var(--as-card-hover)]",
        className,
      )}
    >
      {children}
    </Menu.RadioItem>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <Menu.Separator
      className={cn("my-1 h-px bg-[var(--as-line)]", className)}
    />
  );
}
