#!/usr/bin/env python
import DaVinciResolveScript
import sys
from typing import Iterator, TextIO
import os

# Get currently open project
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

