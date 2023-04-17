# Sample Workflow Integration script

import sys

# some element IDs
winID = "com.blackmagicdesign.resolve.SampleWIScript"   # should be unique for single instancing
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
header = header + '<b>Resolve Sample Workflow Integration Script</b>'
header = header + '</h1></body></html>'

# define the window UI layout
win = dispatcher.AddWindow({
   'ID': winID,
   'Geometry': [ 100,100,600,500 ],
   'WindowTitle': "Resolve Sample Workflow Script",
   },
   ui.VGroup([
      ui.Label({ 'Text': header, 'Weight': 0.1, 'Font': ui.Font({ 'Family': "Times New Roman" }) }),

      ui.Label({ 'Text': "Workflow script", 'Weight': 0, 'Font': ui.Font({ 'Family': "Times New Roman", 'PixelSize': 12 }) }),
      ui.TextEdit({
         'ID': textID,
         'TabStopWidth': 28,
         'Font': ui.Font({ 'Family': "Sans Mono", 'PixelSize': 12, 'MonoSpaced': True, 'StyleStrategy': { 'ForceIntegerMetrics': True } }),
         'LineWrapMode': "NoWrap",
         'AcceptRichText': False,

         # Use python lexer for syntax highlighting; other options include lua, html, json, xml, markdown, cpp, glsl, etc...
         'Lexer': "python",
         }),

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
   script = win.Find(textID).PlainText

   # run the user's script
   exec(script)

def OnClear(ev):
   win.Find(textID).PlainText = ""

# assign event handlers
win.On[winID].Close     = OnClose
win.On[execID].Clicked  = OnExec
win.On[clearID].Clicked = OnClear


# Sample script
deftext = """
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
mediaPool = project.GetMediaPool()

if not project:
    print("No project is loaded")
    sys.exit()
else :
    print("Project is loaded")

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
    print("Timeline is loaded")

choice = input("Enter [1] for SRT generation or [2] to place SRT in Davinci Resolve: ")
if choice == '1':
    print("Adding text to timeline")
    timeline.InsertFusionTitleIntoTimeline("Text+")
elif choice == '2':
    print("Not implemented yet")


projectManager.SaveProject()
"""

win.Find(textID).PlainText = deftext


# Main dispatcher loop
win.Show()
dispatcher.RunLoop()