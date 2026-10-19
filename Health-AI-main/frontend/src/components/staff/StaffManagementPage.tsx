/**
 * StaffManagementPage.tsx — Clinic Staff Management & RBAC Workspace Administration
 * =================================================================================
 * Implements Section 4:
 * 1. Independent clinic staff management for clinic owners.
 * 2. Adding / inviting staff to the current clinic with permitted clinical roles.
 * 3. Role assignment (CLINIC_OWNER, DOCTOR, HEALTH_WORKER, COUNSELOR).
 * 4. Deactivating / activating staff access.
 * 5. Full client-side integration with server-enforced RBAC.
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Stethoscope,
  HeartHandshake,
  CheckCircle2,
  Building2,
  AlertCircle,
  Loader2,
  Check,
  Trash2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/apiConfig';

export interface StaffMember {
  membership_id: string;
  clinic_id: string;
  user_id: string;
  full_name: string;
  email: string;
  username: string;
  role: string;
  status: string;
  is_active: number;
  created_at: string;
  invited_by?: string | null;
}

export const StaffManagementPage: React.FC = () => {
  const { user, activeClinic } = useAuth();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Add Staff Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFullName, setAddFullName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'DOCTOR' | 'HEALTH_WORKER' | 'COUNSELOR' | 'CLINIC_OWNER'>('DOCTOR');
  const [addTempPassword, setAddTempPassword] = useState('Staff@12345');
  const [addPhone, setAddPhone] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Staff Modal State
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<string>('DOCTOR');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isOwner = user?.role === 'CLINIC_OWNER' || activeClinic?.role === 'CLINIC_OWNER' || user?.role === 'SYSTEM_ADMIN';

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v2/clinics/current/staff');
      if (res.ok) {
        const data: StaffMember[] = await res.json();
        setStaffList(data);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || `Failed to load clinic staff (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('[StaffManagement] Error loading staff:', err);
      setError('Unable to reach server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [activeClinic?.id]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const normName = addFullName.trim();
    const normEmail = addEmail.trim().toLowerCase();

    if (!normName || normName.length < 2) {
      setAddError('Full name must be at least 2 characters.');
      return;
    }
    if (!normEmail || !normEmail.includes('@') || !normEmail.includes('.')) {
      setAddError('Valid email address is required.');
      return;
    }

    setIsAdding(true);
    try {
      const res = await apiFetch('/api/v2/clinics/current/staff', {
        method: 'POST',
        body: JSON.stringify({
          full_name: normName,
          email: normEmail,
          role: addRole,
          temporary_password: addTempPassword || 'Staff@12345',
          phone: addPhone.trim() || undefined,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setAddFullName('');
        setAddEmail('');
        setAddPhone('');
        setAddTempPassword('Staff@12345');
        setSuccessMsg(`Successfully added ${normName} to ${activeClinic?.name || 'clinic'}.`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchStaff();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setAddError(errJson.detail || 'Failed to add staff member.');
      }
    } catch (err: any) {
      setAddError('Network error while adding staff member.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setEditError(null);
    setIsUpdating(true);

    try {
      const res = await apiFetch(`/api/v2/clinics/current/staff/${editingStaff.membership_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          is_active: editIsActive ? 1 : 0,
        }),
      });

      if (res.ok) {
        setEditingStaff(null);
        setSuccessMsg(`Updated permissions for ${editingStaff.full_name}.`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchStaff();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setEditError(errJson.detail || 'Failed to update staff permissions.');
      }
    } catch (err: any) {
      setEditError('Network error while updating staff permissions.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveStaff = async (staff: StaffMember) => {
    if (!confirm(`Are you sure you want to remove ${staff.full_name} from this clinic workspace?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/v2/clinics/current/staff/${staff.membership_id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSuccessMsg(`Removed ${staff.full_name} from workspace.`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchStaff();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.detail || 'Failed to remove staff member.');
      }
    } catch (err) {
      alert('Network error while removing staff member.');
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q)
    );
  });

  const doctorCount = staffList.filter((s) => s.role === 'DOCTOR' || s.role === 'PHC_DOCTOR').length;
  const healthWorkerCount = staffList.filter((s) => s.role === 'HEALTH_WORKER' || s.role === 'ASHA_WORKER').length;
  const specialistCount = staffList.filter((s) => s.role === 'COUNSELOR').length;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5EEF1] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-[#0A9F68] text-xs font-bold border border-emerald-200 mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>{activeClinic?.name || 'Clinic Workspace'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#102A56] tracking-tight">
            Clinic Staff & Team Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Authorize and manage clinical team members for this clinic workspace. Each staff member operates under strict role-based access control.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0A9F68] hover:bg-[#088255] text-white font-bold text-xs sm:text-sm shadow-[0_4px_16px_rgba(10,159,104,0.25)] transition-all cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        )}
      </div>

      {/* 2. Success Banner */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 3. Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Staff</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-[#102A56]">{staffList.length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Authorized members</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Doctors / Medical Leads</span>
            <Stethoscope className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-[#102A56]">{doctorCount}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Clinical decision-makers</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Health Workers</span>
            <HeartHandshake className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-[#102A56]">{healthWorkerCount}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Screening & field visits</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Counselors / Specialists</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-[#102A56]">{specialistCount}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Follow-up & guidance</p>
        </div>
      </div>

      {/* 5. Staff Table Container */}
      <div className="bg-white rounded-3xl border border-[#E5EEF1] shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff by name, email, or role..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 text-xs sm:text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none transition-all"
            />
          </div>

          <button
            onClick={fetchStaff}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#0A9F68] mb-3" />
            <span className="text-xs font-semibold">Loading clinic staff...</span>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Users className="w-10 h-10 text-slate-300 mb-3" />
            <h3 className="text-sm font-bold text-[#102A56]">No staff members found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {searchFilter
                ? 'No staff members match the current search filter.'
                : 'Click "Add Staff Member" above to invite doctors or frontline health workers to your clinic.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 sm:px-6">Staff Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined Date</th>
                  {isOwner && <th className="py-3 px-4 sm:px-6 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((staff) => {
                  const roleBadgeClass =
                    staff.role === 'CLINIC_OWNER'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : staff.role === 'DOCTOR' || staff.role === 'PHC_DOCTOR'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : staff.role === 'COUNSELOR'
                      ? 'bg-purple-50 text-purple-800 border-purple-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';

                  const isSelf = staff.user_id === user?.id;

                  return (
                    <tr key={staff.membership_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[#102A56] font-bold text-xs shrink-0">
                            {staff.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-[#102A56] flex items-center gap-1.5">
                              <span>{staff.full_name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-100 text-slate-600 font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                              {staff.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${roleBadgeClass}`}>
                          {staff.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {staff.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Inactive
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {staff.created_at ? new Date(staff.created_at).toLocaleDateString() : '—'}
                      </td>

                      {isOwner && (
                        <td className="py-3.5 px-4 sm:px-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingStaff(staff);
                                setEditRole(staff.role);
                                setEditIsActive(Boolean(staff.is_active));
                              }}
                              className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-[#0A9F68] hover:bg-emerald-50 border border-slate-200 font-semibold text-[11px] transition-all cursor-pointer"
                            >
                              Edit Role
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => handleRemoveStaff(staff)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                                title="Remove staff member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-lg font-bold text-[#102A56]">Add Staff Member</h3>
                <p className="text-xs text-slate-400 mt-0.5">Authorize access to {activeClinic?.name}</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {addError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddStaff} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Verma"
                  className="w-full px-3.5 py-2 bg-slate-50 text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="e.g. rajesh.verma@health.in"
                  className="w-full px-3.5 py-2 bg-slate-50 text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned Clinical Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as any)}
                  className="w-full px-3.5 py-2 bg-slate-50 text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none cursor-pointer"
                >
                  <option value="DOCTOR">Doctor (Consultations, Prescriptions, Referrals)</option>
                  <option value="HEALTH_WORKER">Health Worker (Screening, Vitals, Outbox Sync)</option>
                  <option value="COUNSELOR">Counselor (Follow-ups, Patient Guidance)</option>
                  <option value="CLINIC_OWNER">Clinic Owner (Full Administrative Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Temporary Password
                </label>
                <input
                  type="text"
                  value={addTempPassword}
                  onChange={(e) => setAddTempPassword(e.target.value)}
                  placeholder="Staff@12345"
                  className="w-full px-3.5 py-2 bg-slate-50 text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2 bg-slate-50 text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-5 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088255] text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Add to Clinic</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Edit Staff Role Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#102A56]">Modify Staff Permissions</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editingStaff.full_name}</p>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Clinic Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 text-xs sm:text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] outline-none cursor-pointer"
                >
                  <option value="DOCTOR">Doctor</option>
                  <option value="HEALTH_WORKER">Health Worker</option>
                  <option value="COUNSELOR">Counselor</option>
                  <option value="CLINIC_OWNER">Clinic Owner</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Account Status</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editIsActive}
                      onChange={() => setEditIsActive(true)}
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={!editIsActive}
                      onChange={() => setEditIsActive(false)}
                    />
                    <span>Deactivated</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl bg-[#0A9F68] hover:bg-[#088255] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
