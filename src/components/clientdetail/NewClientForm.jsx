import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, UserPlus } from "lucide-react";

const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none";

// Contract confirmation checkboxes per package type
const CONTRACT_ITEMS = {
  Email: [
    { key: "confirm_email_campaign", label: "Email campaign is included in this contract" },
    { key: "confirm_daily_checkins", label: "AM will submit daily check-ins for this client" },
    { key: "confirm_monthly_sends", label: "Monthly send target has been agreed upon" },
    { key: "confirm_lead_list", label: "Client has been briefed on lead list requirements" },
    { key: "confirm_reporting", label: "Reporting cadence has been set with the client" },
  ],
  LinkedIn: [
    { key: "confirm_linkedin_campaign", label: "LinkedIn campaign is included in this contract" },
    { key: "confirm_sales_navigator", label: "Client has (or will get) Sales Navigator" },
    { key: "confirm_linkedin_inbox", label: "LinkedIn inbox access / handoff agreed upon" },
    { key: "confirm_daily_checkins", label: "AM will submit daily check-ins for this client" },
    { key: "confirm_reporting", label: "Reporting cadence has been set with the client" },
  ],
  Hybrid: [
    { key: "confirm_email_campaign", label: "Email campaign is included in this contract" },
    { key: "confirm_monthly_sends", label: "Monthly send target has been agreed upon" },
    { key: "confirm_linkedin_campaign", label: "LinkedIn campaign is included in this contract" },
    { key: "confirm_sales_navigator", label: "Client has (or will get) Sales Navigator" },
    { key: "confirm_linkedin_inbox", label: "LinkedIn inbox access / handoff agreed upon" },
    { key: "confirm_daily_checkins", label: "AM will submit daily check-ins for this client" },
    { key: "confirm_lead_list", label: "Client has been briefed on lead list requirements" },
    { key: "confirm_reporting", label: "Reporting cadence has been set with the client" },
  ],
};

const STEPS = ["basics", "campaign", "contract"];

export default function NewClientForm({ onSubmit, onCancel, creating }) {
  const [step, setStep] = useState(0);
  const [amUsers, setAmUsers] = useState([]);
  const [errors, setErrors] = useState([]);

  const [form, setForm] = useState({
    name: "",
    package_type: "Email",
    revenue: "",
    monthly_sends_target: "",
    target_leads_per_week: "",
    start_date: new Date().toISOString().split("T")[0],
    contract_end_date: "",
    min_contract_months: "",
    assigned_am: "",
    assigned_pm: "",
  });

  const [confirmed, setConfirmed] = useState({});

  useEffect(() => {
    base44.functions.invoke("listUsers", {}).then(r => {
      setAmUsers(r.data.users || []);
    }).catch(() => {});
  }, []);

  // Reset confirmations when package changes
  useEffect(() => {
    setConfirmed({});
  }, [form.package_type]);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors([]);
  }

  function toggleConfirm(key) {
    setConfirmed(c => ({ ...c, [key]: !c[key] }));
    setErrors([]);
  }

  function validateStep() {
    const errs = [];
    if (step === 0) {
      if (!form.name.trim()) errs.push("Client name is required");
      if (!form.assigned_am) errs.push("Assigned AM is required");
      if (!form.start_date) errs.push("Start date is required");
      if (!form.min_contract_months || Number(form.min_contract_months) <= 0) errs.push("Min contract months is required");
      if (!form.revenue || Number(form.revenue) <= 0) errs.push("Monthly revenue is required");
    }
    if (step === 1) {
      if (!form.monthly_sends_target || Number(form.monthly_sends_target) <= 0) errs.push("Monthly send target is required");
      if (!form.target_leads_per_week || Number(form.target_leads_per_week) <= 0) errs.push("Weekly lead target is required");
    }
    if (step === 2) {
      const items = CONTRACT_ITEMS[form.package_type] || [];
      const allChecked = items.every(item => confirmed[item.key]);
      if (!allChecked) errs.push("Please confirm all contract items before creating the client");
    }
    return errs;
  }

  function next() {
    const errs = validateStep();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => s + 1);
  }

  function handleCreate() {
    const errs = validateStep();
    if (errs.length > 0) { setErrors(errs); return; }
    onSubmit({
      ...form,
      name: form.name.trim(),
      revenue: Number(form.revenue),
      monthly_sends_target: Number(form.monthly_sends_target),
      target_leads_per_week: Number(form.target_leads_per_week),
      min_contract_months: Number(form.min_contract_months),
    });
  }

  const contractItems = CONTRACT_ITEMS[form.package_type] || [];
  const allConfirmed = contractItems.every(item => confirmed[item.key]);
  const confirmedCount = contractItems.filter(item => confirmed[item.key]).length;

  const stepLabels = ["Basics", "Campaign Info", "Contract Confirmation"];

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Client</h2>
            <p className="text-xs text-gray-500">Step {step + 1} of {STEPS.length} — {stepLabels[step]}</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? "bg-green-500 text-white" : i === step ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-400"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 w-8 ${i < step ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client Name *</label>
              <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="e.g. Acme Corp" autoFocus className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Package Type *</label>
              <select value={form.package_type} onChange={e => set("package_type", e.target.value)} className={inputCls}>
                <option value="Email">Email</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Hybrid">Hybrid (Email + LinkedIn)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Monthly Revenue ($) *</label>
                <input type="number" min="0" value={form.revenue} onChange={e => set("revenue", e.target.value)}
                  placeholder="e.g. 5000" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min Contract Months *</label>
                <input type="number" min="1" value={form.min_contract_months} onChange={e => set("min_contract_months", e.target.value)}
                  placeholder="e.g. 3" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date *</label>
                <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contract End Date</label>
                <input type="date" value={form.contract_end_date} onChange={e => set("contract_end_date", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Assigned AM *</label>
                <select value={form.assigned_am} onChange={e => set("assigned_am", e.target.value)} className={inputCls}>
                  <option value="">Select AM…</option>
                  {amUsers.map(u => <option key={u.id} value={u.email}>{u.full_name || u.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Assigned PM</label>
                <select value={form.assigned_pm} onChange={e => set("assigned_pm", e.target.value)} className={inputCls}>
                  <option value="">Select PM…</option>
                  {amUsers.map(u => <option key={u.id} value={u.email}>{u.full_name || u.email}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Campaign Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Package: <strong>{form.package_type}</strong> · Client: <strong>{form.name}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Monthly Send Target *</label>
              <input type="number" min="0" value={form.monthly_sends_target} onChange={e => set("monthly_sends_target", e.target.value)}
                placeholder="e.g. 100000" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Total emails to send per month across all campaigns</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Leads per Week *</label>
              <input type="number" min="0" value={form.target_leads_per_week} onChange={e => set("target_leads_per_week", e.target.value)}
                placeholder="e.g. 10" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Used for KPI tracking and auto-task creation in check-ins</p>
            </div>
            {(form.package_type === "LinkedIn" || form.package_type === "Hybrid") && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">LinkedIn Package Included</p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                  This client will have LinkedIn outreach. Make sure they have Sales Navigator set up before going live.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Contract Confirmation */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Confirm what's included in this contract</p>
              <p className="text-xs text-gray-500 mt-0.5">
                All boxes must be checked before the client can be created. This ensures nothing is missed.
              </p>
            </div>
            <div className="space-y-2">
              {contractItems.map(item => {
                const checked = !!confirmed[item.key];
                return (
                  <button key={item.key} onClick={() => toggleConfirm(item.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      checked
                        ? "border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300"
                    }`}
                  >
                    {checked
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    }
                    <span className={`text-sm ${checked ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300"}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{confirmedCount}/{contractItems.length} confirmed</span>
              {allConfirmed && <span className="text-green-500 font-medium">✓ All confirmed — ready to create</span>}
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
            {errors.map((err, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">• {err}</p>)}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <button onClick={step === 0 ? onCancel : () => { setStep(s => s - 1); setErrors([]); }}
            className="flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={!allConfirmed || creating}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {creating ? "Creating…" : "Create Client"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}