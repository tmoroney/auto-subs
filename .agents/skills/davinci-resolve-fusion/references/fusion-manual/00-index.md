# Fusion Scripting Manual — Index

> **Source & status:** The *Fusion 8 Scripting Guide & Reference Manual*, converted from PDF to Markdown and split into one file per topic/class for easy searching. It is a **snapshot and may be outdated or inaccurate**.

> **Source of truth:** For the DaVinci Resolve scripting API, the live `ResolveDocs` README (`../resolve-api.txt`) is authoritative. For proven usage, prefer tested code over this manual. Use this manual for Fusion-specific scripting concepts (object model, splines, tools, GUIs) that ResolveDocs does not cover.

> **Regenerating:** convert Blackmagic's Fusion scripting PDF to Markdown for free with [Mistral Document AI](https://console.mistral.ai/build/document-ai/ocr-playground), then run `python3 scripts/split-fusion-manual.py <converted.md>`.

## Guide

Conceptual chapters — read these to learn how Fusion scripting works.

| Section | What's in it |
|---|---|
| [`01-introduction.md`](01-introduction.md) | Orientation, conventions, and a quick-start tutorial that builds a first script. |
| [`02-scripting-languages.md`](02-scripting-languages.md) | Lua vs Python, installation/setup, libraries, and FusionScript differences. |
| [`03-scripting-and-debugging.md`](03-scripting-and-debugging.md) | The Console, script types (Composition/Tool/Bin/Utility/external/commandline), callbacks, InTool scripts, Fuses. |
| [`04-object-model.md`](04-object-model.md) | The object hierarchy: Fusion, Composition, Tool/Operator instances, Inputs/Outputs, attributes, ObjectData, metadata. |
| [`05-gui-and-askuser.md`](05-gui-and-askuser.md) | Building simple UIs: the AskUser dialog and the available control types. |
| [`06-class-hierarchy.md`](06-class-hierarchy.md) | The full Fusion class hierarchy table. |

## Class Reference

One file per Fusion class — open only the class you need.

| Class | Summary |
|---|---|
| [`BezierSpline`](classes/bezierspline.md) *(extends Spline)* | Modifier that represents animation on a number value input. |
| [`BinClip`](classes/binclip.md) *(extends BinItem)* | — |
| [`BinItem`](classes/binitem.md) | — |
| [`BinManager`](classes/binmanager.md) | — |
| [`BinStill`](classes/binstill.md) *(extends BinItem)* | — |
| [`ChildFrame`](classes/childframe.md) *(extends FuFrame)* | Represents the context of the frame window, that contains all the views. |
| [`ChildGroup`](classes/childgroup.md) | — |
| [`Composition`](classes/composition.md) | Represents an composition. |
| [`FloatViewFrame`](classes/floatviewframe.md) *(extends FuFrame)* | — |
| [`FlowView`](classes/flowview.md) *(extends FuView)* | The FlowView represents the flow with all the tools. |
| [`FontList`](classes/fontlist.md) *(extends List)* | — |
| [`FuFrame`](classes/fuframe.md) | — |
| [`Fusion`](classes/fusion.md) | Handle to the application. |
| [`FuView`](classes/fuview.md) | — |
| [`GL3DViewer`](classes/gl3dviewer.md) *(extends GLViewer)* | — |
| [`GLImageViewer`](classes/glimageviewer.md) *(extends GLViewer)* | — |
| [`GLPreview`](classes/glpreview.md) *(extends Preview)* | — |
| [`GLView`](classes/glview.md) *(extends FuView)* | — |
| [`GLViewer`](classes/glviewer.md) | Parent class for 2D and 3D viewers. |
| [`Gradient`](classes/gradient.md) *(extends Parameter)* | — |
| [`GraphView`](classes/graphview.md) *(extends FuScrollView)* | — |
| [`HotkeyManager`](classes/hotkeymanager.md) *(extends LockableObject)* | — |
| [`Image`](classes/image.md) *(extends Parameter)* | — |
| [`ImageCacheManager`](classes/imagecachemanager.md) | — |
| [`IOClass`](classes/ioclass.md) | — |
| [`KeyFrameView`](classes/keyframeview.md) *(extends GraphView)* | — |
| [`Link`](classes/link.md) *(extends LockableObject)* | Represents the parent class of Input and Outputs. |
| [`List`](classes/list.md) *(extends LockableObject)* | — |
| [`Loader`](classes/loader.md) *(extends ThreadedOperator)* | — |
| [`MailMessage`](classes/mailmessage.md) | Represents an email message. |
| [`MenuManager`](classes/menumanager.md) *(extends LockableObject)* | — |
| [`Object`](classes/object.md) | — |
| [`Operator`](classes/operator.md) | Base class for all Tools, Modifiers etc. |
| [`Parameter`](classes/parameter.md) | Base class for Parameters like Image, Number etc. |
| [`PlainInput`](classes/plaininput.md) *(extends Link)* | Represents an Input. |
| [`PlainOutput`](classes/plainoutput.md) *(extends Link)* | Represents an Output. |
| [`PolylineMask`](classes/polylinemask.md) *(extends MaskOperator)* | — |
| [`Preview`](classes/preview.md) *(extends PlainInput)* | — |
| [`QueueManager`](classes/queuemanager.md) *(extends LockableObject)* | Represents the QueueManager. |
| [`Registry`](classes/registry.md) | — |
| [`RenderJob`](classes/renderjob.md) | Represents a RenderJob. |
| [`RenderSlave`](classes/renderslave.md) *(extends LockableObject)* | Represents a RenderSlave. |
| [`ScriptServer`](classes/scriptserver.md) | — |
| [`SourceOperator`](classes/sourceoperator.md) *(extends ThreadedOperator)* | — |
| [`TimeRegion`](classes/timeregion.md) *(extends List)* | — |
| [`TransformMatrix`](classes/transformmatrix.md) *(extends Parameter)* | — |
