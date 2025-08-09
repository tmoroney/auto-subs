import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SurveyNotificationProps {
    surveyUrl: string;
    onDismiss: () => void;
}

export const SurveyNotification: React.FC<SurveyNotificationProps> = ({
    surveyUrl,
    onDismiss,
}) => {
    return (
        <Alert className="pt-3 relative bg-blue-50/90 border border-blue-200 dark:bg-blue-950/90 dark:border-blue-700 animate-in fade-in-0 zoom-in-95 overflow-hidden">
            {/* Dismiss (X) button in top right */}
            <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss survey notification"
                onClick={onDismiss}
                className="absolute top-2 right-2 z-10 text-blue-700 dark:text-blue-300 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 rounded-full"
            >
                <X className="h-4 w-4" />
            </Button>
            <div className="flex flex-col gap-3 p-1 pr-2">
                {/* Title row: icon + title */}
                <div className="flex items-center gap-2">
                    <img src="/autosubs-logo.png" className="h-7 w-7" />
                    <strong className="text-base font-bold text-blue-900 dark:text-blue-100">
                        Top Secret Project Alert!
                    </strong>
                </div>
                {/* Body text and survey link */}
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed ">
                    Hey, Tom here, the solo dev behind AutoSubs! 🚀<br /><br />
                    I'm building something new and would love <span className="font-semibold text-blue-700 dark:text-blue-300">your</span> wildest feature ideas. <span className="italic">What would blow your mind?</span>
                </p>

                <Button
                    className="mt-2 inline-flex items-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 shadow transition-colors"
                >
                    <a
                        href={surveyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share your ideas in my 1-min survey"
                    >
                        Share your ideas in my 1-min survey
                    </a>
                </Button>
            </div>
        </Alert>
    );
};
