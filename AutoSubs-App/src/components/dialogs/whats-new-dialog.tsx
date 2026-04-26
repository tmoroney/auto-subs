import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getVersion } from "@tauri-apps/api/app";
import { open as openExternal } from "@tauri-apps/plugin-shell";

import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";

const RELEASE_API_URL =
  "https://api.github.com/repos/tmoroney/auto-subs/releases/latest";
const RELEASE_PAGE_URL =
  "https://github.com/tmoroney/auto-subs/releases/latest";

interface ReleaseInfo {
  name: string;
  tag_name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export function WhatsNewDialog() {
  const { settings, updateSetting, isHydrated } = useSettings();

  const [currentVersion, setCurrentVersion] = React.useState<string>("");
  const [release, setRelease] = React.useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Determine whether the popup should be visible.
  // - Skip on true first run (no onboarding done yet) so GettingStartedOverlay shows first.
  // - Skip in dev or if version isn't loaded yet.
  // - Show whenever stored lastSeenVersion differs from running version.
  const shouldShow =
    isHydrated &&
    settings.onboardingCompleted &&
    !!currentVersion &&
    settings.lastSeenVersion !== currentVersion;

  React.useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled) setCurrentVersion(v);
      })
      .catch(() => {
        if (!cancelled) setCurrentVersion("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!shouldShow) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(RELEASE_API_URL, {
          method: "GET",
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {
          throw new Error(`GitHub responded with ${res.status}`);
        }
        const data = (await res.json()) as ReleaseInfo;
        if (!cancelled) setRelease(data);
      } catch (e) {
        console.error("[WhatsNewDialog] Failed to load release notes:", e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldShow]);

  const handleDismiss = React.useCallback(() => {
    if (currentVersion) {
      updateSetting("lastSeenVersion", currentVersion);
    }
  }, [currentVersion, updateSetting]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) handleDismiss();
    },
    [handleDismiss]
  );

  const handleOpenRelease = React.useCallback(() => {
    const url = release?.html_url ?? RELEASE_PAGE_URL;
    openExternal(url).catch(() => {
      /* ignore */
    });
  }, [release]);

  const formattedDate = release?.published_at
    ? new Date(release.published_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const headingVersion = release?.tag_name?.replace(/^v/, "") ?? currentVersion;

  return (
    <Dialog open={shouldShow} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>What's New in v{headingVersion}</DialogTitle>
          {formattedDate && (
            <DialogDescription>Released {formattedDate}</DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="h-[55vh] max-h-[480px] px-2">
          {loading && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading release notes...
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Couldn't load release notes
                </p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleOpenRelease}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                View on GitHub
              </Button>
            </div>
          )}

          {!loading && !error && release && !release.body?.trim() && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                This release has no detailed notes.
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenRelease}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                View on GitHub
              </Button>
            </div>
          )}

          {!loading && !error && release && release.body?.trim() && (
            <div className="pb-4 text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="mt-4 mb-2 text-base font-semibold first:mt-0">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="mt-4 mb-2 text-sm font-semibold first:mt-0">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="my-2 leading-relaxed">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-2 ml-5 list-disc space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-2 ml-5 list-decimal space-y-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic">{children}</em>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {children}
                    </pre>
                  ),
                  hr: () => <hr className="my-3 border-border" />,
                  blockquote: ({ children }) => (
                    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      className="text-purple-600 underline-offset-2 hover:underline dark:text-purple-400"
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) {
                          openExternal(href).catch(() => {});
                        }
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {release.body || "_No release notes provided._"}
              </ReactMarkdown>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenRelease}
            className="text-muted-foreground"
          >
            <ExternalLink />
            View on GitHub
          </Button>
          <Button onClick={handleDismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
