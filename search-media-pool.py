projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
mediaPool = project.GetMediaPool()
folder = mediaPool.GetRootFolder()
#items = folder.GetClipList()

clipList = []
def recursiveSearch(folder):
    items = folder.GetClipList()
    for i in items:
        clipList.append(i)
    subfolders = folder.GetSubFolderList()
    for subfolder in subfolders:
        recursiveSearch(subfolder)
    return
       
print("Searching media pool...")
recursiveSearch(folder)
print("Found " + str(len(clipList)) + " items in media pool")
for i in clipList:
    print("Name:", i.GetName())
    print(i.GetClipProperty())