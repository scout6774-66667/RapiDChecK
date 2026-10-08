import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Users, ArrowRight, CheckCircle2, Phone, MapPin } from 'lucide-react';
import type { PatientFormData } from './types';
import { db, type LocalPatient } from '../../db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';

interface Step1PatientInfoProps {
  data: PatientFormData;
  onChange: (data: PatientFormData) => void;
  onNext: () => void;
}

export const Step1PatientInfo: React.FC<Step1PatientInfoProps> = ({ data, onChange, onNext }) => {
  const [tab, setTab] = useState<'existing' | 'new'>(data.isExisting ? 'existing' : 'new');
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Query live Dexie patients (Real database only)
  const livePatients = useLiveQuery(() => db.patients.toArray()) || [];

  // Real searchable patients list
  const searchablePatients = useMemo(() => {
    return livePatients.map((p: LocalPatient) => ({
      id: p.id,
      customId: p.patient_id || p.id.slice(0, 8),
      name: p.name,
      age: p.age,
      gender: p.gender,
      village: p.village,
      phone: p.phone,
    }));
  }, [livePatients]);

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return searchablePatients.slice(0, 4);
    const q = searchTerm.toLowerCase();
    return searchablePatients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.customId.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.village.toLowerCase().includes(q)
    );
  }, [searchablePatients, searchTerm]);

  const handleSelectExisting = (patient: typeof searchablePatients[0]) => {
    onChange({
      id: patient.id,
      customId: patient.customId,
      name: patient.name,
      age: patient.age,
      gender: (patient.gender as any) || 'Male',
      phone: patient.phone,
      village: patient.village,
      preferredLanguage: (patient as any).preferredLanguage || 'English',
      emergencyContact: '',
      isExisting: true,
    });
    setErrors({});
  };

  const handleValidateAndProceed = () => {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs.name = 'Patient full name is required.';
    if (data.age === '' || Number(data.age) <= 0 || Number(data.age) > 125) {
      errs.age = 'Please enter a valid age (1–125).';
    }
    if (!data.gender) errs.gender = 'Please select a gender.';
    if (!data.village.trim()) errs.village = 'Village / Ward name is required.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setErrors({});
    onNext();
  };

  const isConfirmed = Boolean(data.name.trim() && data.age !== '' && data.gender);

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-[#E5EEF1] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#102A56]">Patient Information</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter or search for the patient's basic information.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setTab('existing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'existing'
                  ? 'bg-white text-[#102A56] shadow-xs'
                  : 'text-slate-500 hover:text-[#102A56]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Existing Patient</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('new');
                if (data.isExisting) {
                  onChange({
                    id: `PAT-${Date.now().toString().slice(-6)}`,
                    customId: `PT-${Date.now().toString().slice(-4)}`,
                    name: '',
                    age: '',
                    gender: '',
                    phone: '',
                    village: 'Sundarpur Block',
                    preferredLanguage: 'English',
                    emergencyContact: '',
                    isExisting: false,
                  });
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'new'
                  ? 'bg-white text-[#102A56] shadow-xs'
                  : 'text-slate-500 hover:text-[#102A56]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Register New Patient</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Existing Patient Search */}
        {tab === 'existing' && (
          <div className="pt-4 space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search patient by name, ID, phone number or village..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] text-sm text-[#102A56] rounded-xl border border-slate-200 focus:border-[#0A9F68] focus:bg-white focus:ring-2 focus:ring-[#0A9F68]/15 outline-none transition-all"
              />
            </div>

            {/* Matching Patient Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {searchResults.map((patient) => {
                const isSelected = data.id === patient.id || data.name === patient.name;
                return (
                  <div
                    key={patient.id}
                    onClick={() => handleSelectExisting(patient)}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between group ${
                      isSelected
                        ? 'bg-[#E7F7F0] border-[#0A9F68] ring-2 ring-[#0A9F68]/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-[#0A9F68]/40 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl font-extrabold text-xs flex items-center justify-center border shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[#0A9F68] text-white border-[#0A9F68]'
                            : 'bg-slate-100 text-[#102A56] border-slate-200 group-hover:bg-[#E7F7F0] group-hover:text-[#0A9F68]'
                        }`}
                      >
                        {patient.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#102A56] leading-tight">
                          {patient.name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {patient.age} years • {patient.gender}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          ID: {patient.customId} • {patient.village}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-[#0A9F68] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {searchResults.length === 0 && (
              <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-600">No patient found matching "{searchTerm}"</p>
                <button
                  type="button"
                  onClick={() => {
                    setTab('new');
                    onChange({ ...data, name: searchTerm, isExisting: false });
                  }}
                  className="mt-2 text-xs font-bold text-[#0A9F68] hover:underline"
                >
                  + Register "{searchTerm}" as new patient
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: New Patient Registration Form */}
        {tab === 'new' && (
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* Full Name */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => onChange({ ...data, name: e.target.value })}
                placeholder="e.g. Meera Devi"
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#F8FAFC] focus:bg-white text-sm outline-none transition-all ${
                  errors.name
                    ? 'border-red-400 ring-2 ring-red-100'
                    : 'border-slate-200 focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15'
                }`}
              />
              {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Age */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Age (Years) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="125"
                value={data.age}
                onChange={(e) =>
                  onChange({ ...data, age: e.target.value ? Number(e.target.value) : '' })
                }
                placeholder="e.g. 42"
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#F8FAFC] focus:bg-white text-sm outline-none transition-all ${
                  errors.age
                    ? 'border-red-400 ring-2 ring-red-100'
                    : 'border-slate-200 focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15'
                }`}
              />
              {errors.age && <p className="text-[11px] text-red-500 mt-1">{errors.age}</p>}
            </div>

            {/* Gender */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Female', 'Male', 'Other'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onChange({ ...data, gender: g })}
                    className={`py-2 rounded-xl border font-bold text-xs transition-all ${
                      data.gender === g
                        ? 'bg-[#0A9F68] text-white border-[#0A9F68] shadow-xs'
                        : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {errors.gender && <p className="text-[11px] text-red-500 mt-1">{errors.gender}</p>}
            </div>

            {/* Mobile Phone */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Mobile Phone Number</label>
              <input
                type="tel"
                value={data.phone}
                onChange={(e) => onChange({ ...data, phone: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white text-sm focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15 outline-none transition-all"
              />
            </div>

            {/* Village / Ward */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Village / Ward <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.village}
                onChange={(e) => onChange({ ...data, village: e.target.value })}
                placeholder="e.g. Sundarpur Ward 3"
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#F8FAFC] focus:bg-white text-sm outline-none transition-all ${
                  errors.village
                    ? 'border-red-400 ring-2 ring-red-100'
                    : 'border-slate-200 focus:border-[#0A9F68] focus:ring-2 focus:ring-[#0A9F68]/15'
                }`}
              />
              {errors.village && <p className="text-[11px] text-red-500 mt-1">{errors.village}</p>}
            </div>

            {/* Preferred Language */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Preferred Language</label>
              <select
                value={data.preferredLanguage || 'English'}
                onChange={(e) => onChange({ ...data, preferredLanguage: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] focus:bg-white text-xs font-semibold text-[#102A56] focus:border-[#0A9F68] outline-none transition-all"
              >
                <option value="English">English</option>
                <option value="Hindi">हिन्दी (Hindi)</option>
                <option value="Bengali">বাংলা (Bengali)</option>
                <option value="Santhali">Santhali</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Patient Confirmation Identity Card */}
      {isConfirmed && (
        <div className="bg-gradient-to-r from-[#E7F7F0] to-[#DCFCE7]/60 rounded-2xl border border-[#BDE7D3] p-4.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0A9F68] text-white font-black text-sm flex items-center justify-center shadow-md shadow-[#0A9F68]/20 shrink-0">
              {data.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold tracking-wider text-[#0A9F68] uppercase bg-white px-2 py-0.5 rounded-md border border-[#0A9F68]/20">
                  Selected Patient
                </span>
                <span className="text-xs text-slate-500 font-medium">ID: {data.customId || 'PT-NEW'}</span>
              </div>
              <h3 className="text-base font-extrabold text-[#102A56] mt-0.5">{data.name}</h3>
              <p className="text-xs text-slate-600 flex items-center flex-wrap gap-2 mt-0.5">
                <span>{data.age} years • {data.gender}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {data.village}</span>
                {data.phone && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {data.phone}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleValidateAndProceed}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0A9F68] hover:bg-[#088758] text-white font-bold text-xs transition-all shadow-md shadow-[#0A9F68]/25 flex items-center justify-center gap-2 shrink-0 group"
          >
            <span>Continue to Symptoms</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </div>
  );
};
