> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# RenderSlave

class RenderSlave

Parent class: LockableObject

Represents a RenderSlave.

FUSION SCRIPTING GUIDE AND REFERENCE MANUAL</last></first>

RenderSlave Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  RSLVS_Status | string | The current status of the slave.  |
|  RSLVN_Status | number | The current status of the slave as number.
0. Scanning
1. Idle
2. Failed
3. Busy
4. Assigning Job
5. Connecting
6. Checking Settings
7. Loading Comp
8. Starting Render
9. Rendering
10. Ending Render
11. Disconnecting
12. Offline
13. Disabled
14. Unused  |
|  RSLVS_IP | string | The IP address of the slave machine.  |
|  RSLVID_ID | string | The ID of the job.  |
|  RSLVS_Name | string | The network name of the slave being used.  |
|  RSLVB_IsUnused | boolean | Indicates if the slave is unused.  |
|  RSLVS_Version | string | The version number of the slave.  |
|  RSLVS_Groups | string | The assigned group of the slave.  |
|  RSLVN_RenderingComp | number | The comp ID number that it's currently rendering.  |
|  RSLVB_IsRemoving | boolean | If the slave is being removed from the queue.  |
|  RSLVB_IsFailed | boolean | If the slave has failed enough times to remove it from further jobs.  |

→ Python usage:

```python
# Print all RenderSlaves in Queue.
qm = fusion.RenderManager
slavelist = qm.GetSlaveList().values()
for slave in slavelist:
print(slave.GetAttrs()
```

→ Lua usage:

```txt
-- Print all RenderSlaves in Queue.
qm = fusion.RenderManager
slavelist = qm:GetSlaveList()
for i, slave in pairs(slavelist) do
print(slave:GetAttrs().RSVLS_Name)
end
```

# Methods

RenderSlave.Abort()

Cease rendering, and quit the current job.

RenderSlave.GetJob()

Return the slave's current RenderJob object, if any.

RenderSlave.IsDisconnecting()

True if slave is disconnecting from a job.

Sometimes when a slave is disconnecting from the render manager object, it will take a few seconds to actually disconnect. During this time, it will not show up interactively in the Render Manager's slave list, however, it will show up in the table returned by GetSlaveList(). As such, this function was added to easily tell if a RenderSlave is currently disconnecting.

Returns a boolean value indicating whether the slave's RSLVB_IsDisconnecting attribute is currently set to false.

RenderSlave.IsIdle()
True if slave has no job and nothing to do.
Returns a boolean value indicating whether the slave's RSLVB_IsIdle attribute is currently set to false.

RenderSlave.IsProcessing()
True if slave is busy.
Returns a boolean value indicating whether the slave is currently processing a frame.
