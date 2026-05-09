import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldAnimateTransition, setShouldAnimateTransition] = useState(false);
  const tabsListRef = useRef<HTMLDivElement | null>(null);

  const updateIndicator = React.useCallback(
    (shouldAnimate = false) => {
      if (!tabsListRef.current) return;

      const activeTab = tabsListRef.current.querySelector<HTMLElement>(
        '[data-state="active"]',
      );
      if (!activeTab) return;

      // Use offset-based measurements which are transform-invariant.
      // This prevents the indicator from "expanding" during popover animations
      // that use scale transforms.
      const listElement = activeTab.offsetParent as HTMLElement;
      if (!listElement) return;

      const newStyle = {
        left: activeTab.offsetLeft + listElement.offsetLeft,
        top: activeTab.offsetTop + listElement.offsetTop,
        width: activeTab.offsetWidth,
        height: activeTab.offsetHeight,
      };

      const applyUpdate = () => {
        setIndicatorStyle(newStyle);
        setShouldAnimateTransition(shouldAnimate);
        if (!isInitialized) setIsInitialized(true);
      };

      if (shouldAnimate) {
        requestAnimationFrame(applyUpdate);
      } else {
        applyUpdate();
      }
    },
    [isInitialized],
  );

  const updateIndicatorWithAnimation = React.useCallback(() => {
    updateIndicator(true);
  }, [updateIndicator]);

  const updateIndicatorWithoutAnimation = React.useCallback(() => {
    updateIndicator(false);
  }, [updateIndicator]);

  useLayoutEffect(() => {
    updateIndicatorWithoutAnimation();
  }, [updateIndicatorWithoutAnimation]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicatorWithAnimation);
    const observer = new MutationObserver(updateIndicatorWithAnimation);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateIndicatorWithoutAnimation)
        : null;

    if (tabsListRef.current) {
      observer.observe(tabsListRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      resizeObserver?.observe(tabsListRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateIndicatorWithAnimation);
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, [updateIndicatorWithAnimation, updateIndicatorWithoutAnimation]);

  return (
    <div className="relative" ref={tabsListRef}>
      <TabsPrimitive.List
        ref={ref}
        data-slot="tabs-list"
        className={cn(
          "bg-muted text-muted-foreground relative inline-flex h-9 w-fit items-center justify-center rounded-md p-[3px]",
          className,
        )}
        {...props}
      />
      {isInitialized && (
        <div
          data-indicator="true"
          className={cn(
            "absolute rounded-sm border border-transparent bg-background shadow-sm dark:border-input dark:bg-input/30",
            shouldAnimateTransition
              ? "transition-all duration-300 ease-in-out"
              : "transition-none",
          )}
          style={indicatorStyle}
        />
      )}
    </div>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      "data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 z-10",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn("flex-1 outline-none mt-2", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
