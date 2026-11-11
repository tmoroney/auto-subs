import * as React from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

export { Menu };

export function MenuPopup({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        sideOffset={5}
        collisionPadding={8}
        style={{ zIndex: 90 }}
      >
        <Menu.Popup
          className={cn(
            "min-w-40 max-h-[var(--available-height)] overflow-x-hidden overflow-y-auto rounded-[var(--as-radius)] border border-[var(--as-line-strong)] bg-[var(--as-pop)] p-1 text-[var(--as-fg)] shadow-xl outline-none",
            className,
          )}
          style={{
            maxHeight: "var(--available-height)",
            overflowY: "auto",
            ...style,
          }}
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
        "flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-3 py-1 text-sm outline-none data-[highlighted]:bg-[var(--as-card-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
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
        "flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-3 py-1 text-sm outline-none data-[highlighted]:bg-[var(--as-card-hover)]",
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
