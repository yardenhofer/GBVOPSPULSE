import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Upload, Trash2, ZoomIn, X } from "lucide-react";
import { format } from "date-fns";

export default function InboxPlacementSection({ client, onClientUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const fileRef = useRef(null);

  const screenshot = client.inbox_placement_screenshot;
  const uploadedAt = client.inbox_placement_uploaded_at;
  const uploadedBy = client.inbox_placement_uploaded_by;

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    await base44.entities.Client.update(client.id, {
      inbox_placement_screenshot: file_url,
      inbox_placement_uploaded_at: now,
      inbox_placement_uploaded_by: user?.email || "unknown",
    });
    onClientUpdate({
      inbox_placement_screenshot: file_url,
      inbox_placement_uploaded_at: now,
      inbox_placement_uploaded_by: user?.email || "unknown",
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRemove() {
    await base44.entities.Client.update(client.id, {
      inbox_placement_screenshot: null,
      inbox_placement_uploaded_at: null,
      inbox_placement_uploaded_by: null,
    });
    onClientUpdate({
      inbox_placement_screenshot: null,
      inbox_placement_uploaded_at: null,
      inbox_placement_uploaded_by: null,
    });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Inbox Placement Test</h3>
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Uploading…" : screenshot ? "Replace" : "Upload Screenshot"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {!screenshot && !uploading && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No inbox placement screenshot uploaded yet.</p>
          <p className="text-xs text-gray-400 mt-1">Upload a screenshot of the latest inbox placement test for this client's copy.</p>
        </div>
      )}

      {screenshot && (
        <div className="space-y-2">
          <div className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <img
              src={screenshot}
              alt="Inbox placement test result"
              className="w-full max-h-96 object-contain cursor-pointer"
              onClick={() => setZoomed(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button
                onClick={() => setZoomed(true)}
                className="p-2 rounded-full bg-black/50 text-white"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Uploaded {uploadedAt ? format(new Date(uploadedAt), "MMM d, yyyy h:mm a") : ""}
              {uploadedBy ? ` by ${uploadedBy}` : ""}
            </p>
            <button
              onClick={handleRemove}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen zoom modal */}
      {zoomed && screenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <img
            src={screenshot}
            alt="Inbox placement test result"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}