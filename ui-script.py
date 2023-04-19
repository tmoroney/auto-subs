# Sample Workflow Integration script

import sys

# some element IDs
winID = "com.blackmagicdesign.resolve.AutoSubsGen"   # should be unique for single instancing
textID = "TextEdit"
execID = "Exec"
clearID = "Clear"

ui = fusion.UIManager
dispatcher = bmd.UIDispatcher(ui)

# check for existing instance
win = ui.FindWindow(winID)
if win:
   win.Show()
   win.Raise()
   exit()
   
# otherwise, we set up a new window, with HTML header (using the Examples logo.png)
logoPath = fusion.MapPath(r"AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png")
header = '<html><body><h1 style="vertical-align:middle;">'
header = header + '<img src="' + logoPath + '"/>&nbsp;&nbsp;&nbsp;'
header = header + '<b>Auto Subtitle Generator</b>'
header = header + '</h1></body></html>'

# define the window UI layout
win = dispatcher.AddWindow({
   'ID': winID,
   'Geometry': [ 100,100,600,500 ],
   'WindowTitle': "Resolve Auto Subtitle Generator",
   },
   ui.VGroup([
      ui.Label({ 'Text': header, 'Weight': 0.1, 'Font': ui.Font({ 'Family': "Times New Roman" }) }),

      ui.HGroup({ 'Weight': 0, }, [
         ui.Button({ 'ID': execID,  'Text': "Execute" }),
         ui.HGap(2),
         ui.Button({ 'ID': clearID, 'Text': "Clear" }),
         ui.HGap(0, 2),
         ])
      ])
   )

# Event handlers
def OnClose(ev):
   dispatcher.ExitLoop()

def OnExec(ev):
   projectManager = resolve.GetProjectManager()
   project = projectManager.GetCurrentProject()
   mediaPool = project.GetMediaPool()

   if not project:
       print("No project is loaded")
       sys.exit()

   # Get current timeline. If no current timeline try to load it from timeline list
   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
          timeline = project.GetTimelineByIndex(1)
          project.SetCurrentTimeline(timeline)

   if not timeline:
      print("Current project has no timelines")
      sys.exit()
   else :
      items = timeline.GetItemListInTrack("video", 1)
      for item in items:
         #print(item.GetClipColor())
         item.SetClipColor("Violet")
         print(item.GetTakesCount())
         item.AddFusionComp()

       #print(item.GetName())
       #timeline.CreateFusionClip(item)
       #timeline.InsertFusionTitleIntoTimeline("Text+")

   projectManager.SaveProject()


def OnClear(ev):
   win.Find(textID).PlainText = ""

# assign event handlers
win.On[winID].Close     = OnClose
win.On[execID].Clicked  = OnExec
win.On[clearID].Clicked = OnClear

# Main dispatcher loop
win.Show()
dispatcher.RunLoop()