import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export function CustomSidebarTrigger() {
  const { open, toggleSidebar } = useSidebar()

  return (
    <Button onClick={toggleSidebar} variant="ghost" size="icon">
      {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    </Button>
  )
}