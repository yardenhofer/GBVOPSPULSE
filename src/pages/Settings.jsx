import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, Shield, ShieldOff, Crown, User, Mail, Loader2, Hash } from "lucide-react";

const PERMISSIONS = [
  { key: "can_view_all_clients", label: "View All Clients", desc: "See every client, not just assigned ones" },
  { key: "can_view_executive", label: "Executive View", desc: "Access the executive summary tab" },
  { key: "can_edit_clients", label: "Edit Clients", desc: "Modify client settings and data" },
];

export default function Settings() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [updating, setUpdating] = useState({});

  useEffect(() => {
    async function load() {
      const [me, allUsers] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.User.list("-created_date", 100),
      ]);
      setCurrentUser(me);
      setUsers(allUsers);
      setLoading(false);
    }
    load();
  }, []);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    await base44.users.inviteUser(inviteEmail.trim(), "user");
    setInviteMsg({ type: "success", text: `Invite sent to ${inviteEmail}` });
    setInviteEmail("");
    setInviting(false);
    // Refresh list
    const updated = await base44.entities.User.list("-created_date", 100);
    setUsers(updated);
  }

  async function togglePermission(user, key) {
    const newVal = !(user[key] ?? true);
    setUpdating(u => ({ ...u, [`${user.id}-${key}`]: true }));
    await base44.entities.User.update(user.id, { [key]: newVal });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, [key]: newVal } : u));
    setUpdating(u => ({ ...u, [`${user.id}-${key}`]: false }));
  }

  async function toggleRole(user) {
    const newRole = user.role === "admin" ? "user" : "admin";
    setUpdating(u => ({ ...u, [`${user.id}-role`]: true }));
    await base44.entities.User.update(user.id, { role: newRole });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    setUpdating(u => ({ ...u, [`${user.id}-role`]: false }));
  }

  async function updateGroup(user, rawVal) {
    const val = rawVal === "" ? null : parseInt(rawVal, 10);
    if (rawVal !== "" && isNaN(val)) return;
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, group: val } : u));
    setUpdating(u => ({ ...u, [`${user.id}-group`]: true }));
    await base44.entities.User.update(user.id, { group: val });
    setUpdating(u => ({ ...u, [`${user.id}-group`]: false }));
  }

  if (loading) {
    return <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}</div>;
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldOff className="w-12 h-12 text-gray-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Access Required</h2>
        <p className="text-sm text-gray-500 mt-1">Only admins can access settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage AMs and control their access</p>
      </div>

      {/* Invite */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Invite an AM</h2>
        </div>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            placeholder="am@yourcompany.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Invite
          </button>
        </form>
        {inviteMsg && (
          <p className={`text-xs mt-2 ${inviteMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>{inviteMsg.text}</p>
        )}
      </div>

      {/* Team members */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Team Members ({users.length})</h2>
        </div>

        {/* Header row */}
        <div className="hidden lg:grid grid-cols-[1fr_80px_80px_repeat(3,80px)] gap-4 px-5 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <span>Member</span>
          <span className="text-center">Role</span>
          <span className="text-center">Group</span>
          {PERMISSIONS.map(p => <span key={p.key} className="text-center">{p.label}</span>)}
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {users.map(u => {
            const isMe = u.id === currentUser?.id;
            return (
              <div key={u.id} className="px-5 py-4 grid grid-cols-1 lg:grid-cols-[1fr_80px_80px_repeat(3,80px)] gap-3 lg:gap-4 items-center">
                {/* Identity */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-400">{(u.full_name || u.email || "?")[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {u.full_name || "—"}
                      {isMe && <span className="ml-1.5 text-xs text-blue-400">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 inline shrink-0" />
                      {u.email}
                    </p>
                  </div>
                </div>

                {/* Role toggle */}
                <div className="flex justify-start lg:justify-center">
                  <button
                    onClick={() => !isMe && toggleRole(u)}
                    disabled={isMe || !!updating[`${u.id}-role`]}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all
                      ${u.role === "admin"
                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700"
                      }
                      ${isMe ? "opacity-50 cursor-not-allowed" : "hover:opacity-80 cursor-pointer"}
                    `}
                  >
                    {updating[`${u.id}-role`]
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : u.role === "admin" ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />
                    }
                    {u.role === "admin" ? "Admin" : "AM"}
                  </button>
                </div>

                {/* Group */}
                <div className="flex items-center gap-2 lg:justify-center">
                  <span className="text-xs text-gray-500 lg:hidden">Group:</span>
                  <div className="relative flex items-center">
                    {updating[`${u.id}-group`] && (
                      <Loader2 className="w-3 h-3 animate-spin text-blue-400 absolute -right-4" />
                    )}
                    <input
                      type="number"
                      min="1"
                      value={u.group ?? ""}
                      onChange={e => updateGroup(u, e.target.value)}
                      placeholder="—"
                      className="w-14 text-center text-sm font-semibold px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Permission toggles */}
                {PERMISSIONS.map(({ key, label }) => {
                  const enabled = u[key] ?? true;
                  const loadingKey = `${u.id}-${key}`;
                  return (
                    <div key={key} className="flex items-center gap-2 lg:justify-center">
                      <span className="text-xs text-gray-500 lg:hidden">{label}:</span>
                      <button
                        onClick={() => togglePermission(u, key)}
                        disabled={!!updating[loadingKey]}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none
                          ${enabled ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700"}
                          ${updating[loadingKey] ? "opacity-50" : ""}
                        `}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PERMISSIONS.map(({ label, desc }) => (
          <div key={label}>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}