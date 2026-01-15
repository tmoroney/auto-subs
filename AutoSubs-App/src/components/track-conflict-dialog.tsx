import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConflictInfo, ConflictMode } from "@/api/resolveAPI";
import { AlertTriangle, Replace, SkipForward, Plus } from "lucide-react";

interface TrackConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictInfo: ConflictInfo | null;
  onResolve: (mode: ConflictMode) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrackConflictDialog({
  open,
  onOpenChange,
  conflictInfo,
  onResolve,
}: TrackConflictDialogProps) {
  if (!conflictInfo) return null;

  const conflictCount = conflictInfo.totalConflicts || 0;
  const trackName = conflictInfo.trackName || "selected track";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Existing Content Detected
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Found <span className="font-semibold text-foreground">{conflictCount} existing clip{conflictCount !== 1 ? 's' : ''}</span> on{' '}
                <span className="font-semibold text-foreground">"{trackName}"</span> that overlap with your new subtitles.
              </p>
              
              {conflictInfo.subtitleRange && (
                <p className="text-sm text-muted-foreground">
                  Subtitle time range: {formatTime(conflictInfo.subtitleRange.start)} - {formatTime(conflictInfo.subtitleRange.end)}
                </p>
              )}

              <p className="pt-2">How would you like to proceed?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <Button
            variant="default"
            className="w-full justify-start gap-2 bg-orange-600 hover:bg-orange-500"
            onClick={() => {
              onResolve('replace');
              onOpenChange(false);
            }}
          >
            <Replace className="h-4 w-4" />
            <div className="text-left">
              <div>Replace All</div>
              <div className="text-xs font-normal opacity-80">Delete existing clips and add new subtitles</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              onResolve('skip');
              onOpenChange(false);
            }}
          >
            <SkipForward className="h-4 w-4" />
            <div className="text-left">
              <div>Skip Conflicts</div>
              <div className="text-xs font-normal opacity-70">Only add subtitles where there's no existing content</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              onResolve('new_track');
              onOpenChange(false);
            }}
          >
            <Plus className="h-4 w-4" />
            <div className="text-left">
              <div>Use New Track</div>
              <div className="text-xs font-normal opacity-70">Create a new track for these subtitles</div>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

