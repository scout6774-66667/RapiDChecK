/**
 * AuthContext.tsx — Multi-Clinic Authentication, Workspace Scoping & RBAC Provider
 * ==============================================================================
 * Implements:
 * 1. Persistent JWT session storage in localStorage.
 * 2. Multi-clinic workspace resolution (active clinic, authorized memberships).
 * 3. Strict tenant cache clearing (IndexedDB purge on logout / clinic switch).
 * 4. Role-Based Access Control hooks (useAuth, hasPermission, hasRole).
 * 5. Backwards-compatible developer shortcuts for offline simulation.
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from '../api/apiConfig';
import { clearOfflineWorkspaceData } from '../db/offlineDb';

export type UserRole =
  | 'CLINIC_OWNER'
  | 'DOCTOR'
  | 'HEALTH_WORKER'
  | 'COUNSELOR'
  | 'ASHA_WORKER'
  | 'PHC_DOCTOR'
  | 'DISTRICT_OFFICER'
  | 'SYSTEM_ADMIN'
  | 'PATIENT'
  | string;

export interface ClinicSummary {
  id: string;
  name: string;
  facility_code?: string;
  role: string;
  is_active: boolean;
}

export interface ClinicResponse {
  id: string;
  name: string;
  facility_code?: string;
  owner_user_id: string;
  address?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  role: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  license_number?: string | null;
  facility_id?: string | null;
  assigned_villages: string[];
  is_active: number;
  created_at: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  status?: number;
  user?: UserProfile;
  clinics?: ClinicSummary[];
  active_clinic?: ClinicResponse | null;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  status?: number;
  data?: any;
}

export interface RegisterData {
  full_name: string;
  email: string;
  password: string;
  clinic_name?: string;
  phone?: string;
  address?: string;
  role?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  permissions: string[];
  activeClinic: ClinicResponse | null;
  userClinics: ClinicSummary[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  loginWithDetails: (identifier: string, password: string) => Promise<LoginResult>;
  registerUser: (data: RegisterData) => Promise<RegisterResult>;
  switchClinic: (clinicId: string) => Promise<boolean>;
  refreshClinicData: () => Promise<void>;
  logout: () => Promise<void>;
  switchUser: (role: UserRole) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
}

const DEFAULT_DOCTOR: UserProfile = {
  id: 'usr_dr_sharma',
  username: 'dr.sharma',
  email: 'dr.sharma@phc.in',
  full_name: 'Dr. Rajesh Sharma, MBBS',
  role: 'PHC_DOCTOR',
  license_number: 'MCI-2018-88491',
  facility_id: 'PHC_SONPUR',
  assigned_villages: ['Sonpur', 'Bishnupur', 'Ramnagar'],
  is_active: 1,
  created_at: new Date().toISOString()
};

const DEFAULT_ASHA: UserProfile = {
  id: 'usr_asha_anita',
  username: 'asha.anita',
  email: 'anita.roy@health.gov.in',
  full_name: 'Anita Roy (ASHA)',
  role: 'ASHA_WORKER',
  license_number: 'ASHA-WB-44021',
  facility_id: 'SC_SONPUR',
  assigned_villages: ['Sonpur', 'Bishnupur'],
  is_active: 1,
  created_at: new Date().toISOString()
};

const DEFAULT_DISTRICT_OFFICER: UserProfile = {
  id: 'usr_officer_patel',
  username: 'officer.patel',
  email: 'patel.cmo@district.gov.in',
  full_name: 'Dr. V. K. Patel (CMO)',
  role: 'DISTRICT_OFFICER',
  license_number: 'MCI-2005-12903',
  facility_id: 'DH_DISTRICT_HQ',
  assigned_villages: [],
  is_active: 1,
  created_at: new Date().toISOString()
};

const DEFAULT_ADMIN: UserProfile = {
  id: 'usr_admin',
  username: 'admin',
  email: 'admin@rapidcheck.org',
  full_name: 'System Administrator',
  role: 'SYSTEM_ADMIN',
  facility_id: 'CENTRAL_OPS',
  assigned_villages: [],
  is_active: 1,
  created_at: new Date().toISOString()
};

const DEFAULT_PATIENT: UserProfile = {
  id: 'usr_patient_ramesh',
  username: 'ramesh.kumar',
  email: 'ramesh.patient@ruralhealth.org',
  full_name: 'Ramesh Kumar (Patient)',
  role: 'PATIENT',
  facility_id: 'PHC_SONPUR',
  assigned_villages: ['Sonpur'],
  is_active: 1,
  created_at: new Date().toISOString()
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const savedUser = localStorage.getItem('rapidcheck_user');
      const savedToken = localStorage.getItem('rapidcheck_token');
      return savedUser && savedToken ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('rapidcheck_token') || null;
  });

  const [permissions, setPermissions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rapidcheck_permissions');
      return saved ? JSON.parse(saved) : [
        'patients:create', 'patients:read', 'patients:update', 'patients:delete',
        'assessments:create', 'assessments:read', 'assessments:update',
        'reviews:view_queue', 'reviews:perform', 'reviews:override',
        'referrals:create', 'referrals:read', 'referrals:update',
        'appointments:manage', 'analytics:view', 'sync:push', 'sync:pull'
      ];
    } catch {
      return [];
    }
  });

  const [activeClinic, setActiveClinic] = useState<ClinicResponse | null>(() => {
    try {
      const saved = localStorage.getItem('rapidcheck_active_clinic');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userClinics, setUserClinics] = useState<ClinicSummary[]>(() => {
    try {
      const saved = localStorage.getItem('rapidcheck_user_clinics');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync / refresh clinic profile and permissions on startup
  useEffect(() => {
    if (token) {
      refreshClinicData().catch((err) => {
        console.warn('[Auth] Background workspace refresh notice:', err);
      });
    }
  }, [token]);

  const refreshClinicData = async (): Promise<void> => {
    try {
      const res = await apiFetch('/api/v2/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('rapidcheck_user', JSON.stringify(data.user));
        }
        if (data.permissions) {
          setPermissions(data.permissions);
          localStorage.setItem('rapidcheck_permissions', JSON.stringify(data.permissions));
        }
        if (data.clinics) {
          setUserClinics(data.clinics);
          localStorage.setItem('rapidcheck_user_clinics', JSON.stringify(data.clinics));
        }
        if (data.active_clinic) {
          setActiveClinic(data.active_clinic);
          localStorage.setItem('rapidcheck_active_clinic', JSON.stringify(data.active_clinic));
          localStorage.setItem('rapidcheck_active_clinic_id', data.active_clinic.id);
        }
      }
    } catch (err) {
      console.warn('[Auth] Failed to sync auth profile with backend:', err);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v2/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipAuth: true,
        timeoutMs: 10000,
      });

      if (res.ok) {
        const data = await res.json();
        // Clear old offline data to avoid leakage
        await clearOfflineWorkspaceData();

        setUser(data.user);
        setToken(data.access_token);
        setPermissions(data.permissions || []);
        setActiveClinic(data.active_clinic || null);
        setUserClinics(data.clinics || []);

        localStorage.setItem('rapidcheck_user', JSON.stringify(data.user));
        localStorage.setItem('rapidcheck_token', data.access_token);
        localStorage.setItem('rapidcheck_permissions', JSON.stringify(data.permissions || []));
        if (data.active_clinic) {
          localStorage.setItem('rapidcheck_active_clinic', JSON.stringify(data.active_clinic));
          localStorage.setItem('rapidcheck_active_clinic_id', data.active_clinic.id);
        }
        if (data.clinics) {
          localStorage.setItem('rapidcheck_user_clinics', JSON.stringify(data.clinics));
        }
        return true;
      }

      // Explicit authentication failure or lockout by server — MUST NOT bypass with demo fallback
      if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 400) {
        console.warn(`[Auth] Backend rejected credentials with HTTP ${res.status}`);
        return false;
      }

      throw new Error('Backend login responded with status ' + res.status);
    } catch (err: any) {
      console.warn('[Auth] Backend login unavailable/network error:', err);

      // Demo login shortcuts are strictly development-only and only when completely offline
      const isProduction = (import.meta as any).env?.MODE === 'production' || (import.meta as any).env?.PROD === true;
      if (isProduction) {
        console.error('[Auth] Offline demo account bypass is disabled in production.');
        return false;
      }

      const normalizedUser = username.toLowerCase().trim();
      let matchedUser: UserProfile | null = null;
      let matchedPerms: string[] = [];

      if (normalizedUser === 'dr.sharma' || normalizedUser === 'dr_sharma' || normalizedUser === 'doctor') {
        matchedUser = DEFAULT_DOCTOR;
        matchedPerms = [
          'patients:create', 'patients:read', 'patients:update', 'patients:delete',
          'assessments:create', 'assessments:read', 'assessments:update',
          'reviews:view_queue', 'reviews:perform', 'reviews:override',
          'referrals:create', 'referrals:read', 'referrals:update',
          'appointments:manage', 'analytics:view', 'sync:push', 'sync:pull'
        ];
      } else if (normalizedUser === 'asha.anita' || normalizedUser === 'asha' || normalizedUser === 'anita') {
        matchedUser = DEFAULT_ASHA;
        matchedPerms = [
          'patients:create', 'patients:read',
          'assessments:create', 'assessments:read',
          'referrals:create', 'referrals:read',
          'appointments:create', 'appointments:read',
          'analytics:view',
          'sync:push', 'sync:pull'
        ];
      } else if (normalizedUser === 'officer.patel' || normalizedUser === 'officer' || normalizedUser === 'patel') {
        matchedUser = DEFAULT_DISTRICT_OFFICER;
        matchedPerms = [
          'patients:read', 'assessments:read',
          'reviews:view_queue', 'referrals:read', 'referrals:update',
          'analytics:view', 'audit:read',
          'sync:pull'
        ];
      } else if (normalizedUser === 'admin') {
        matchedUser = DEFAULT_ADMIN;
        matchedPerms = [
          'patients:create', 'patients:read', 'patients:update', 'patients:delete',
          'assessments:create', 'assessments:read', 'assessments:update', 'assessments:delete',
          'reviews:view_queue', 'reviews:perform', 'reviews:override',
          'referrals:create', 'referrals:read', 'referrals:update',
          'appointments:manage', 'analytics:view', 'sync:push', 'sync:pull'
        ];
      } else if (normalizedUser === 'ramesh.kumar' || normalizedUser === 'patient' || normalizedUser === 'ramesh') {
        matchedUser = DEFAULT_PATIENT;
        matchedPerms = [
          'patients:read',
          'assessments:create', 'assessments:read',
          'appointments:create', 'appointments:read',
          'resources:read'
        ];
      }

      if (matchedUser) {
        const fallbackToken = 'jwt_offline_' + btoa(matchedUser.id + ':' + Date.now());
        setUser(matchedUser);
        setToken(fallbackToken);
        setPermissions(matchedPerms);

        localStorage.setItem('rapidcheck_user', JSON.stringify(matchedUser));
        localStorage.setItem('rapidcheck_token', fallbackToken);
        localStorage.setItem('rapidcheck_permissions', JSON.stringify(matchedPerms));
        return true;
      }

      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithDetails = async (identifier: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v2/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: identifier.trim(), password }),
        skipAuth: true,
        timeoutMs: 10000,
      });

      if (res.ok) {
        const data = await res.json();
        // Clear old offline data to avoid leakage
        await clearOfflineWorkspaceData();

        setUser(data.user);
        setToken(data.access_token);
        setPermissions(data.permissions || []);
        setActiveClinic(data.active_clinic || null);
        setUserClinics(data.clinics || []);

        localStorage.setItem('rapidcheck_user', JSON.stringify(data.user));
        localStorage.setItem('rapidcheck_token', data.access_token);
        localStorage.setItem('rapidcheck_permissions', JSON.stringify(data.permissions || []));
        if (data.active_clinic) {
          localStorage.setItem('rapidcheck_active_clinic', JSON.stringify(data.active_clinic));
          localStorage.setItem('rapidcheck_active_clinic_id', data.active_clinic.id);
        }
        if (data.clinics) {
          localStorage.setItem('rapidcheck_user_clinics', JSON.stringify(data.clinics));
        }

        return {
          success: true,
          user: data.user,
          clinics: data.clinics,
          active_clinic: data.active_clinic,
          status: res.status
        };
      }

      let errorMsg = 'Invalid email/username or password credentials.';
      try {
        const errJson = await res.json();
        if (errJson?.detail) errorMsg = errJson.detail;
      } catch {
        // fallback
      }

      return { success: false, error: errorMsg, status: res.status };
    } catch (err: any) {
      console.warn('[Auth] Backend login network/connection error:', err);
      return {
        success: false,
        error: 'Unable to connect to health authentication server. Please check your network connection.',
        status: 0,
      };
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (data: RegisterData): Promise<RegisterResult> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v2/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: data.full_name.trim(),
          email: data.email.trim().toLowerCase(),
          password: data.password,
          role: data.role || (data.clinic_name ? 'CLINIC_OWNER' : 'DOCTOR'),
          clinic_name: data.clinic_name ? data.clinic_name.trim() : undefined,
          phone: data.phone ? data.phone.trim() : undefined,
          address: data.address ? data.address.trim() : undefined,
        }),
        skipAuth: true,
        timeoutMs: 10000,
      });

      if (res.ok) {
        const createdUser = await res.json();
        return { success: true, data: createdUser, status: res.status };
      }

      let errorDetail = 'Registration failed. Please check your details.';
      try {
        const errJson = await res.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {
        // fallback
      }

      return { success: false, error: errorDetail, status: res.status };
    } catch (err: any) {
      console.warn('[Auth] Registration network error:', err);
      return {
        success: false,
        error: 'Unable to connect to registration server. Please check your network connection.',
        status: 0,
      };
    } finally {
      setIsLoading(false);
    }
  };

  const switchClinic = async (clinicId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      // 1. Purge previous clinic's IndexedDB records completely
      await clearOfflineWorkspaceData();

      // 2. Update active clinic ID in local storage
      localStorage.setItem('rapidcheck_active_clinic_id', clinicId);

      // 3. Fetch current clinic details
      const res = await apiFetch('/api/v2/clinics/current', {
        headers: {
          'X-Clinic-ID': clinicId,
        },
      });

      if (res.ok) {
        const clinicData: ClinicResponse = await res.json();
        setActiveClinic(clinicData);
        localStorage.setItem('rapidcheck_active_clinic', JSON.stringify(clinicData));

        // 4. Refresh /api/v2/auth/me to refresh role permissions for this clinic
        await refreshClinicData();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Auth] Error switching clinic workspace:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setUser(null);
    setToken(null);
    setPermissions([]);
    setActiveClinic(null);
    setUserClinics([]);

    localStorage.removeItem('rapidcheck_user');
    localStorage.removeItem('rapidcheck_token');
    localStorage.removeItem('rapidcheck_permissions');
    localStorage.removeItem('rapidcheck_active_clinic');
    localStorage.removeItem('rapidcheck_active_clinic_id');
    localStorage.removeItem('rapidcheck_user_clinics');

    // Purge IndexedDB local records
    await clearOfflineWorkspaceData();
  };

  const switchUser = async (targetRole: UserRole) => {
    if (targetRole === 'ASHA_WORKER') {
      const success = await login('asha.anita', 'asha123');
      if (!success) {
        setUser(DEFAULT_ASHA);
        setPermissions([
          'patients:create', 'patients:read',
          'assessments:create', 'assessments:read',
          'appointments:create', 'appointments:read',
          'sync:push', 'sync:pull'
        ]);
        localStorage.setItem('rapidcheck_user', JSON.stringify(DEFAULT_ASHA));
      }
    } else if (targetRole === 'DISTRICT_OFFICER') {
      const success = await login('officer.patel', 'officer123');
      if (!success) {
        setUser(DEFAULT_DISTRICT_OFFICER);
        setPermissions([
          'patients:read', 'assessments:read',
          'reviews:view_queue', 'analytics:view', 'audit:read',
          'sync:pull'
        ]);
        localStorage.setItem('rapidcheck_user', JSON.stringify(DEFAULT_DISTRICT_OFFICER));
      }
    } else if (targetRole === 'SYSTEM_ADMIN') {
      const success = await login('admin', 'admin123');
      if (!success) {
        setUser(DEFAULT_ADMIN);
        setPermissions([
          'patients:create', 'patients:read', 'patients:update', 'patients:delete',
          'assessments:create', 'assessments:read', 'assessments:update', 'assessments:delete',
          'reviews:view_queue', 'reviews:perform', 'reviews:override',
          'referrals:update', 'appointments:manage', 'sync:push', 'sync:pull'
        ]);
        localStorage.setItem('rapidcheck_user', JSON.stringify(DEFAULT_ADMIN));
      }
    } else if (targetRole === 'PATIENT') {
      const success = await login('ramesh.kumar', 'patient123');
      if (!success) {
        setUser(DEFAULT_PATIENT);
        setPermissions([
          'patients:read',
          'assessments:create', 'assessments:read',
          'appointments:create', 'appointments:read',
          'resources:read'
        ]);
        localStorage.setItem('rapidcheck_user', JSON.stringify(DEFAULT_PATIENT));
      }
    } else {
      const success = await login('dr.sharma', 'doctor123');
      if (!success) {
        setUser(DEFAULT_DOCTOR);
        setPermissions([
          'patients:create', 'patients:read', 'patients:update', 'patients:delete',
          'assessments:create', 'assessments:read', 'assessments:update',
          'reviews:view_queue', 'reviews:perform', 'reviews:override',
          'referrals:update', 'appointments:manage', 'sync:push', 'sync:pull'
        ]);
        localStorage.setItem('rapidcheck_user', JSON.stringify(DEFAULT_DOCTOR));
      }
    }
  };

  const hasPermission = (perm: string): boolean => {
    if (!user) return false;
    if (user.role === 'SYSTEM_ADMIN') return true;
    return permissions.includes(perm);
  };

  const hasRole = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'SYSTEM_ADMIN') return true;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        permissions,
        activeClinic,
        userClinics,
        isAuthenticated: Boolean(user && token),
        isLoading,
        login,
        loginWithDetails,
        registerUser,
        switchClinic,
        refreshClinicData,
        logout,
        switchUser,
        hasPermission,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
