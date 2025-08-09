import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export function CustomSidebarTrigger() {
  const { open, toggleSidebar } = useSidebar()

  return (
    <Button onClick={toggleSidebar} variant="ghost" size="icon" className="h-10 w-10">
      {open ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
    </Button>
  )
}