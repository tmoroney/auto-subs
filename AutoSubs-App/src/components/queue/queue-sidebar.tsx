import { useTranslation } from "react-i18next";
import { AlertCircle, Copy, FolderOpen, GripVertical, ListPlus, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { QueueItemView, QueueItemStatus } from "./queue-types";

/** The workspace owns selection, state transitions and file drops. */
export interface QueueSidebarProps {
  items: QueueItemView[];
  selectedId: string | null;
  running: boolean;
  paused: boolean;
  busy?: boolean;
  notice?: string | null;
  settingsIssues?: string[];
  saveSrt: boolean;
  saveTxt: boolean;
  onSelect: (id: string) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onSaveSrtChange: (enabled: boolean) => void;
  onSaveTxtChange: (enabled: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancelCurrent: () => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (ids: string[]) => void;
  onClearQueue: () => void;
  onClose: () => void;
}

const activeStatuses: QueueItemStatus[] = ["preparing", "transcribing", "exporting"];
const retryableStatuses: QueueItemStatus[] = ["failed", "cancelled", "interrupted"];

function filename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

interface SortableQueueItemProps {
  item: QueueItemView;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRetry: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function SortableQueueItem({ item, selected, busy, onSelect, onMove, onRetry, onDuplicate, onRemove, onDragStart, onDragEnd }: SortableQueueItemProps) {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  const active = activeStatuses.includes(item.status);
  const progress = Math.max(0, Math.min(100, item.progress ?? 0));
  return (
    <Reorder.Item as="article" value={item.id} dragListener={false} dragControls={dragControls}
      drag={!busy && !active ? "y" : false} whileDrag={{ scale: 1.02, zIndex: 10 }}
      onDragStart={() => onDragStart(item.id)} onDragEnd={onDragEnd}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn("relative rounded-lg border bg-card p-2", selected && "border-primary bg-accent/40")}>
      <div className="flex items-start gap-1">
        <button type="button" disabled={busy || active}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${t("queue.reorderHandle")}: ${filename(item.sourcePath)}`}
          title={t("queue.reorderHandle")}
          onPointerDown={(event) => dragControls.start(event)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onMove(item.id, event.key === "ArrowUp" ? "up" : "down");
            }
          }}><GripVertical className="size-4" /></button>
        <button type="button" aria-pressed={selected} onClick={() => onSelect(item.id)}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate text-sm font-medium" title={item.sourcePath}>{filename(item.sourcePath)}</span>
          <span className="mt-1 flex items-center justify-between gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate" title={`${item.model}, ${item.language}`}>{item.model}, {item.language}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5">{t(`queue.${item.status}`)}</span>
          </span>
        </button>
      </div>
      {active && item.progress !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <progress className="h-1.5 min-w-0 flex-1 accent-primary" max={100} value={progress}
            aria-label={t(`queue.${item.status}`)} />
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(progress)}%</span>
        </div>
      )}
      {item.error && <p className="mt-1 break-words text-xs text-destructive">{item.error}</p>}
      {item.outputPath && <p className="mt-1 break-all text-xs text-muted-foreground" title={item.outputPath}>
        {t("queue.output")}: {item.outputPath}
      </p>}
      <div className="mt-1 flex flex-wrap gap-0.5">
        {retryableStatuses.includes(item.status) && <Button type="button" variant="ghost" size="icon-sm"
          onClick={() => onRetry(item.id)} disabled={busy} aria-label={t("queue.retry")} title={t("queue.retry")}><RotateCcw /></Button>}
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onDuplicate(item.id)} disabled={busy}
          aria-label={t("queue.duplicate")} title={t("queue.duplicate")}><Copy /></Button>
        {!active && <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(item.id)} disabled={busy}
          aria-label={t("queue.remove")} title={t("queue.remove")}><Trash2 /></Button>}
      </div>
    </Reorder.Item>
  );
}

/** A persistent workspace panel; clicking an item opens its saved settings/result. */
export function QueueSidebar({
  items, selectedId, running, paused, busy = false, notice, settingsIssues = [], saveSrt, saveTxt,
  onSelect, onAddFiles, onAddFolder, onSaveSrtChange, onSaveTxtChange,
  onStart, onPause, onResume, onCancelCurrent, onRetry, onRemove, onDuplicate,
  onMove, onReorder, onClearQueue, onClose,
}: QueueSidebarProps) {
  const { t } = useTranslation();
  const hasPending = items.some((item) => item.status === "pending");
  const hasActive = items.some((item) => activeStatuses.includes(item.status));
  const [displayOrder, setDisplayOrder] = useState(() => items.map((item) => item.id));
  const dragId = useRef<string | null>(null);
  const displayOrderRef = useRef(displayOrder);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (dragId.current === null) {
      const next = items.map((item) => item.id);
      displayOrderRef.current = next;
      setDisplayOrder(next);
    }
  }, [items]);

  const changeDisplayOrder = (ids: string[]) => {
    displayOrderRef.current = ids;
    setDisplayOrder(ids);
  };
  const finishDrag = () => {
    const currentItems = itemsRef.current;
    const dragged = currentItems.find((item) => item.id === dragId.current);
    const currentIds = new Set(currentItems.map((item) => item.id));
    const orderStillMatches = displayOrderRef.current.length === currentItems.length
      && displayOrderRef.current.every((id) => currentIds.has(id));
    dragId.current = null;
    // If the runner took this item while it was being dragged, do not change
    // queue order from a stale drag. The controller also validates all IDs.
    if (dragged && !activeStatuses.includes(dragged.status) && orderStillMatches) onReorder(displayOrderRef.current);
    else changeDisplayOrder(currentItems.map((item) => item.id));
  };

  return (
    <aside aria-label={t("queue.title")} className="flex h-full min-h-0 w-72 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between gap-2 px-3.5 py-3">
        <h2 className="text-sm font-semibold">{t("queue.title")} ({items.length})</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}
          aria-label={t("queue.close")} title={t("queue.close")}><X /></Button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
        <Button type="button" variant="outline" size="sm" onClick={onAddFiles} disabled={busy}>
          <ListPlus />{t("queue.addFiles")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onAddFolder} disabled={busy}>
          <FolderOpen />{t("queue.addFolder")}
        </Button>
      </div>

      {notice && <p role="status" className="mx-3.5 mb-2 rounded-lg bg-muted p-2 text-xs">{notice}</p>}

      <Reorder.Group as="div" axis="y" values={displayOrder} onReorder={changeDisplayOrder} layoutScroll
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 pb-3" aria-live="polite">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("queue.dropFiles")}
          </p>
        ) : displayOrder.map((id) => items.find((item) => item.id === id)).filter((item): item is QueueItemView => !!item)
          .map((item) => <SortableQueueItem key={item.id} item={item} selected={item.id === selectedId}
            busy={busy} onSelect={onSelect} onMove={onMove} onRetry={onRetry} onDuplicate={onDuplicate} onRemove={onRemove}
            onDragStart={(draggedId) => { dragId.current = draggedId; }} onDragEnd={finishDrag} />)}
      </Reorder.Group>

      <div className="space-y-2 border-t px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {t("queue.settings")}
          {settingsIssues.length > 0 && <span role="status" title={settingsIssues.join("\n")}
            aria-label={`${t("queue.settingsIssues")}: ${settingsIssues.join("; ")}`} className="text-destructive">
            <AlertCircle className="size-3.5" />
          </span>}
        </div>
        {settingsIssues.length > 0 && <ul className="space-y-1 text-xs text-destructive">
          {settingsIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
        </ul>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={saveSrt} disabled={running || busy} onCheckedChange={(value) => onSaveSrtChange(value === true)} />
            {t("queue.saveSrt")}
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={saveTxt} disabled={running || busy} onCheckedChange={(value) => onSaveTxtChange(value === true)} />
            {t("queue.saveTxt")}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!running && !paused && <Button type="button" size="sm" onClick={onStart} disabled={!hasPending || busy}>
            <Play />{t("queue.start")}</Button>}
          {running && !paused && <Button type="button" variant="outline" size="sm" onClick={onPause}>
            <Pause />{t("queue.pause")}</Button>}
          {paused && items.length > 0 && <Button type="button" size="sm" onClick={onResume}
            disabled={!hasPending || busy || hasActive}><Play />{t("queue.resume")}</Button>}
          {hasActive && <Button type="button" variant="outline" size="sm" onClick={onCancelCurrent}>
            <X />{t("queue.cancelCurrent")}</Button>}
          {items.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={onClearQueue} disabled={busy || running}>
            {t("queue.clearQueue")}</Button>}
        </div>
        {(running || paused) && <p className="text-xs text-muted-foreground">{t("queue.pauseRestarts")}</p>}
      </div>
    </aside>
  );
}
