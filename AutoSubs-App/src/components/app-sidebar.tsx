import * as React from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
} from "@/components/ui/sidebar"
import { CaptionList } from "@/components/caption-list"
import { captionData, filterCaptions, exportCaptions } from "@/data/captions"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [captions] = React.useState(captionData)
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredCaptions = React.useMemo(
    () => filterCaptions(captions, searchQuery),
    [captions, searchQuery]
  )

  const handleEditCaption = (id: number) => {
    console.log("Edit caption:", id)
    // Add edit functionality here
  }

  return (
    <Sidebar side="right" className="border-l" {...props}>
      <SidebarHeader className="gap-3.5 border-b p-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-base font-medium text-foreground">Captions</div>
          <Button 
            onClick={() => exportCaptions(captions)} 
            size="sm" 
            variant="outline" 
            className="h-8 gap-2 bg-transparent"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
        <SidebarInput
          placeholder="Search captions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-0">
          <SidebarGroupContent>
            <CaptionList 
              captions={filteredCaptions}
              onEditCaption={handleEditCaption}
              itemClassName="hover:bg-sidebar-accent"
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
