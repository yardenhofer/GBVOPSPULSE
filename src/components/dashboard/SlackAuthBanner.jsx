import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function SlackAuthBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check Slack connectivity via slackDebug (lightweight call)
    base44.functions.invoke("slackDebug", {})
      .then(res => {
        if (res.data?.error === "invalid_auth") {
          setShow(true);
        }
      })
      .catch(() => {
        // If function fails entirely, don't show banner
      });
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
          Slack Bot Connection Lost
        </p>
        <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">
          The Slack Bot token has expired and needs a full re-connect. AI Sentiment analysis, offboarding checks, and Slack alerts will not work until reconnected. Please ask Base44 support or your developer to re-authorize the Slack Bot connector.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors shrink-0"
      >
        <X className="w-4 h-4 text-red-400" />
      </button>
    </div>
  );
}