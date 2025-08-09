import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onScroll?: () => void }
>(({ className, children, onScroll, ...props }, ref) => (
  <div
    ref={ref}
    onScroll={onScroll}
    className={`flex overflow-x-auto snap-x snap-mandatory scroll-smooth -ml-4 scrollbar-hide ${className}`}
    {...props}
  >
    {children}
  </div>
))
CarouselContent.displayName = "CarouselContent"

const CarouselItem = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={`min-w-0 shrink-0 grow-0 basis-1/2 lg:basis-1/3 snap-start pl-4 ${className}`}>{children}</div>
)

const CarouselPrevious = ({ onClick, ...props }: { onClick: () => void }) => (
  <Button
    onClick={onClick}
    variant="outline"
    size="icon"
    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur-sm shadow-md hover:scale-110 transition-transform disabled:opacity-30"
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
  </Button>
)

const CarouselNext = ({ onClick, ...props }: { onClick: () => void }) => (
  <Button
    onClick={onClick}
    variant="outline"
    size="icon"
    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur-sm shadow-md hover:scale-110 transition-transform disabled:opacity-30"
    {...props}
  >
    <ChevronRight className="h-4 w-4" />
  </Button>
)

export { CarouselContent, CarouselItem, CarouselPrevious, CarouselNext }
