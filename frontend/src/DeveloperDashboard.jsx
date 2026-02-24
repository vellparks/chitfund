import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiBase, getBackendMode, setBackendMode, BACKEND_MODES } from './backendConfig';

const DEFAULT_CLOUD_FRONTEND_URL = 'https://chitfund-frontend.onrender.com';

function DeveloperDashboard({ user, systemSettings }) {
  const [backendStatus, setBackendStatus] = useState({ ok: false, error: null });
  const [dbStatus, setDbStatus] = useState({ ok: false, users: 0, customers: 0, error: null });
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState({ active: false, maskedKey: null, message: null, error: null });
  const [productCode, setProductCode] = useState('');
  const [diag, setDiag] = useState({ loading: false, data: null, error: null });
  const [ensureStatus, setEnsureStatus] = useState({ message: null, error: null });
  const [trialDaysInput, setTrialDaysInput] = useState('');
  const [trialInfo, setTrialInfo] = useState({ status: 'unknown', message: '' });
  const [repairStatus, setRepairStatus] = useState({ message: null, error: null });
  const [sampleCount, setSampleCount] = useState('');
  const [sampleStatus, setSampleStatus] = useState({ message: null, error: null });
  const [freshStatus, setFreshStatus] = useState({ message: null, error: null });
  const [updateStatus, setUpdateStatus] = useState({ loading: false, message: null, error: null });
  const [offlineFile, setOfflineFile] = useState(null);
  const [offlineStatus, setOfflineStatus] = useState({ loading: false, message: null, error: null });
  const [offlineScan, setOfflineScan] = useState({ loading: false, data: null, error: null });
  const [backendMode, setBackendModeState] = useState(getBackendMode());
  const [cloudFrontendUrl, setCloudFrontendUrl] = useState(
    systemSettings?.frontend_url || DEFAULT_CLOUD_FRONTEND_URL
  );
  const [cloudBackendUrl, setCloudBackendUrl] = useState(systemSettings?.backend_url || '');
  const [offlinePath, setOfflinePath] = useState(systemSettings?.offline_path || '');
  const [urlStatus, setUrlStatus] = useState({ message: null, error: null });
  const [activeTab, setActiveTab] = useState('connectivity');
  const BACKEND_TIMEOUT_MS = 7000;

  useEffect(() => {
    async function doCheckBackend() {
      try {
        const base = getApiBase();
        const resp = await axios.get(`${base}/settings`, { timeout: BACKEND_TIMEOUT_MS });
        if (resp.data) {
          setBackendStatus({ ok: true, error: null });
        } else {
          setBackendStatus({ ok: false, error: 'Empty response' });
        }
      } catch (error) {
        setBackendStatus({ ok: false, error: error.message || String(error) });
      }
    }
    doCheckBackend();
    async function fetchProductCode() {
      try {
        const base = getApiBase();
        const resp = await axios.get(`${base}/license/product`, { timeout: BACKEND_TIMEOUT_MS });
        if (resp.data && resp.data.product_code) {
          setProductCode(resp.data.product_code);
        }
      } catch (error) {
        setProductCode('');
      }
    }
    fetchProductCode();
    async function fetchDiagnostics() {
      setDiag((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const base = getApiBase();
        const resp = await axios.get(`${base}/diagnostics/summary`, { timeout: BACKEND_TIMEOUT_MS });
        setDiag({ loading: false, data: resp.data || null, error: null });
      } catch (error) {
        setDiag({ loading: false, data: null, error: error.message || String(error) });
      }
    }
    fetchDiagnostics();
    try {
      if (systemSettings && systemSettings.license_key) {
        const key = systemSettings.license_key;
        const masked = key.length > 4 ? key.slice(0, 4) + '-XXXX-XXXX-' + key.slice(-4) : key;
        setLicenseStatus({
          active: !!systemSettings.license_active,
          maskedKey: masked,
          message: systemSettings.license_active ? 'License active' : 'License not activated',
          error: null
        });
      } else {
        setLicenseStatus({
          active: false,
          maskedKey: null,
          message: 'No license key configured',
          error: null
        });
      }
    } catch {
      setLicenseStatus({
        active: false,
        maskedKey: null,
        message: 'No license key configured',
        error: null
      });
    }
    try {
      const s = systemSettings || {};
      const start = s.trial_start_date;
      const days = parseInt(s.trial_days || 0, 10);
      setTrialDaysInput(days > 0 ? String(days) : '');
      if (!s.trial_enabled || !start || !days || days <= 0) {
        setTrialInfo({ status: 'not_started', message: 'Trial not started' });
      } else {
        const startDate = new Date(start);
        const now = new Date();
        const expiry = new Date(startDate);
        expiry.setDate(expiry.getDate() + days);
        if (Number.isNaN(startDate.getTime())) {
          setTrialInfo({ status: 'invalid', message: 'Trial configuration invalid' });
        } else if (now > expiry) {
          setTrialInfo({
            status: 'expired',
            message: `Trial expired on ${expiry.toISOString().slice(0, 10)}`
          });
        } else {
          const diffMs = expiry.getTime() - now.getTime();
          const remaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          setTrialInfo({
            status: 'active',
            message: `Trial active, ${remaining} day(s) remaining (expires ${expiry.toISOString().slice(0, 10)})`
          });
        }
      }
    } catch {
      setTrialInfo({ status: 'unknown', message: 'Trial status unavailable' });
    }
    try {
      setCloudFrontendUrl(systemSettings?.frontend_url || DEFAULT_CLOUD_FRONTEND_URL);
      setCloudBackendUrl(systemSettings?.backend_url || '');
      setOfflinePath(systemSettings?.offline_path || '');
    } catch (e) { e; }
  }, [systemSettings]);

  async function handleCheckBackend() {
    try {
      const base = getApiBase();
      const resp = await axios.get(`${base}/settings`, { timeout: BACKEND_TIMEOUT_MS });
      if (resp.data) {
        setBackendStatus({ ok: true, error: null });
      } else {
        setBackendStatus({ ok: false, error: 'Empty response' });
      }
    } catch (error) {
      setBackendStatus({ ok: false, error: error.message || String(error) });
    }
  }

  async function handleCheckDb() {
    try {
      const base = getApiBase();
      const resp = await axios.get(`${base}/check-db`);
      const data = resp.data || {};
      const users = Array.isArray(data.users) ? data.users.length : 0;
      const customers = Array.isArray(data.customers) ? data.customers.length : 0;
      setDbStatus({ ok: true, users, customers, error: null });
    } catch (error) {
      setDbStatus({ ok: false, users: 0, customers: 0, error: error.message || String(error) });
    }
  }

  function handleBackendModeChange(mode) {
    setBackendMode(mode);
    setBackendModeState(mode);
    handleCheckBackend();
    handleCheckDb();
    if (mode === BACKEND_MODES.LOCAL) {
      handleOfflineScan();
      try {
        const el = document.getElementById('offline-install-path-input');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      } catch (e) { e; }
    }
  }

  async function handleUpdateApp() {
    const confirmRun = window.confirm(
      'இந்த option use பண்ணினா இந்த கணினியில் இருக்கும் app code க்கு Git repository ல இருக்கும் latest version இல் இருந்து update try பண்ணும்.\n\nஇந்த machine ல internet + Git configuration correct ஆ இருக்கணும்.\n\nContinue செய்யலாமா?'
    );
    if (!confirmRun) {
      return;
    }
    setUpdateStatus({ loading: true, message: null, error: null });
    try {
      const base = getApiBase();
      const resp = await axios.post(`${base}/maintenance/update-app`);
      const data = resp.data || {};
      if (data.ok) {
        setUpdateStatus({
          loading: false,
          message: data.message || 'App update completed successfully.',
          error: null
        });
      } else {
        const baseError =
          data.message ||
          (data.git_available === false
            ? 'Git not available on this system. Install Git and try again.'
            : 'App update failed.');
        const details = (data.stderr || data.stdout || '').trim();
        const fullError = details ? `${baseError} – ${details}` : baseError;
        setUpdateStatus({
          loading: false,
          message: null,
          error: fullError
        });
      }
    } catch (error) {
      setUpdateStatus({
        loading: false,
        message: null,
        error: error.message || String(error)
      });
    }
  }

  function handleOfflineFileChange(e) {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setOfflineFile(file);
    setOfflineStatus({ loading: false, message: null, error: null });
  }

  async function handleOfflineUpdate() {
    if (!offlineFile) {
      setOfflineStatus({
        loading: false,
        message: null,
        error: 'முதலில் update zip file select பண்ணவும்.'
      });
      return;
    }
    const confirmRun = window.confirm(
      'இந்த option use பண்ணினா நீங்க select பண்ணிய zip file ல இருக்குற backend/frontend folders இந்த computer ல install பண்ணியிருக்கும் app code க்கு மேல overwrite ஆகும்.\n\nஇந்த zip file நம்ம app க்கு தான் உருவாக்கியது (developer build) என்று confirm பண்ணிக்கோங்க. Backup எடுத்ததா?\n\nContinue செய்யலாமா?'
    );
    if (!confirmRun) {
      return;
    }
    setOfflineStatus({ loading: true, message: null, error: null });
    try {
      const formData = new FormData();
      formData.append('file', offlineFile);
      const base = getApiBase();
      const resp = await axios.post(`${base}/maintenance/offline-update`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = resp.data || {};
      if (data.ok) {
        setOfflineStatus({
          loading: false,
          message: data.message || 'Offline update applied successfully. Backend/frontend restart செய்யவும்.',
          error: null
        });
      } else {
        setOfflineStatus({
          loading: false,
          message: null,
          error: data.detail || data.message || 'Offline update failed. Zip format / content சரி பார்க்கவும்.'
        });
      }
    } catch (error) {
      setOfflineStatus({
        loading: false,
        message: null,
        error: error.message || String(error)
      });
    }
  }

  async function handleEnsureUsers() {
    try {
      const base = getApiBase();
      const resp = await axios.get(`${base}/init-db`);
      const msg = resp.data?.message || 'Admin / Developer users ensured';
      setEnsureStatus({ message: msg, error: null });
      await handleCheckDb();
    } catch (error) {
      setEnsureStatus({ message: null, error: error.message || String(error) });
    }
  }

  async function handleSaveUrlSettings(e) {
    e.preventDefault();
    setUrlStatus({ message: null, error: null });
    try {
      const base = getApiBase();
      const payload = {
        frontend_url: (cloudFrontendUrl || '').trim() || null,
        backend_url: (cloudBackendUrl || '').trim() || null,
        offline_path: (offlinePath || '').trim() || null
      };
      await axios.post(`${base}/settings/urls`, payload);
      setUrlStatus({
        message: 'URL / Path settings saved (URL / பாதை அமைப்புகள் சேமிக்கப்பட்டது)',
        error: null
      });
    } catch (error) {
      setUrlStatus({
        message: null,
        error: error.message || String(error)
      });
    }
  }

  async function handleOfflineScan() {
    setOfflineScan({ loading: true, data: null, error: null });
    try {
      const base = getApiBase();
      const resp = await axios.get(`${base}/maintenance/offline-scan`, { timeout: BACKEND_TIMEOUT_MS });
      setOfflineScan({ loading: false, data: resp.data || null, error: null });
    } catch (error) {
      setOfflineScan({
        loading: false,
        data: null,
        error: error.message || String(error)
      });
    }
  }

  async function handleRepairDb() {
    try {
      setRepairStatus({ message: 'Attempting database repair / recreate...', error: null });
      const base = getApiBase();
      const resp = await axios.post(`${base}/diagnostics/repair-db`);
      const data = resp.data || {};
      const msg = data.message || 'Database repair completed';
      setRepairStatus({ message: msg, error: null });
      await handleCheckDb();
      await handleCheckBackend();
      try {
        const baseDiag = getApiBase();
        const diagResp = await axios.get(`${baseDiag}/diagnostics/summary`);
        setDiag({ loading: false, data: diagResp.data || null, error: null });
      } catch (e) {
        setDiag((prev) => ({ ...prev, error: e.message || String(e) }));
      }
    } catch (error) {
      setRepairStatus({ message: null, error: error.message || String(error) });
    }
  }

  async function handleCreateSampleData(e) {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    const count = parseInt((sampleCount || '').trim() || '0', 10);
    if (!count || count <= 0) {
      setSampleStatus({ message: null, error: 'Valid sample count required (e.g. 5, 10, 20)' });
      return;
    }
    try {
      setSampleStatus({ message: 'Creating sample data...', error: null });
      const payload = { count };
      const base = getApiBase();
      const resp = await axios.post(`${base}/sample-data/generate`, payload);
      const data = resp.data || {};
      const msg = data.message || `Sample data created (customers: ${data.customers_created ?? '-'}, loans: ${data.loans_created ?? '-'})`;
      setSampleStatus({ message: msg, error: null });
      await handleCheckDb();
    } catch (error) {
      setSampleStatus({ message: null, error: error.response?.data?.detail || error.message || String(error) });
    }
  }

  async function handleClearSampleData(e) {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    try {
      setSampleStatus({ message: 'Clearing sample data...', error: null });
      const base = getApiBase();
      const resp = await axios.post(`${base}/sample-data/clear`);
      const data = resp.data || {};
      const msg = data.message || 'Sample data cleared';
      setSampleStatus({ message: msg, error: null });
      await handleCheckDb();
    } catch (error) {
      setSampleStatus({ message: null, error: error.response?.data?.detail || error.message || String(error) });
    }
  }

  async function handleFreshReset() {
    const ok = window.confirm('கவனம்: இது Customers, Loans, Transactions, Expenses, Admin/Developer அல்லாத Users அனைத்தையும் நீக்கும். தொடர விரும்புகிறீர்களா?');
    if (!ok) {
      return;
    }
    try {
      setFreshStatus({ message: 'Clearing all test/business data...', error: null });
      const base = getApiBase();
      const resp = await axios.post(`${base}/maintenance/fresh-reset`);
      const data = resp.data || {};
      const msg = data.message || 'All test/business data cleared.';
      setFreshStatus({ message: msg, error: null });
      await handleCheckDb();
    } catch (error) {
      setFreshStatus({ message: null, error: error.response?.data?.detail || error.message || String(error) });
    }
  }

  async function handleActivateLicense(e) {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    const trimmed = (licenseKey || '').trim();
    if (!trimmed) {
      setLicenseStatus({
        active: false,
        maskedKey: null,
        message: null,
        error: 'License key empty'
      });
      return;
    }
    if (trimmed.length < 8) {
      setLicenseStatus({
        active: false,
        maskedKey: null,
        message: null,
        error: 'License key too short'
      });
      return;
    }
    try {
      const base = getApiBase();
      const resp = await axios.post(`${base}/license/activate`, { license_key: trimmed });
      const data = resp.data || {};
      const key = data.license_key || trimmed;
      const masked = key.length > 4 ? key.slice(0, 4) + '-XXXX-XXXX-' + key.slice(-4) : key;
      setLicenseStatus({
        active: !!data.license_active,
        maskedKey: masked,
        message: 'License activated successfully',
        error: null
      });
    } catch (error) {
      let msg = 'Error activating license';
      try {
        if (error.response && error.response.data) {
          msg = error.response.data.detail || error.response.data.message || msg;
        } else if (error.message) {
          msg = error.message;
        } else {
          msg = String(error);
        }
      } catch (e) {
        msg = error.message || String(error);
      }
      setLicenseStatus({
        active: false,
        maskedKey: null,
        message: null,
        error: msg
      });
    }
  }

  async function handleDeactivateLicense() {
    if (!window.confirm('இந்த கணினியில் இருக்கும் license ஐ cancel செய்ய வேண்டுமா?\n(Deactivate செய்து விட்டால் trial மட்டும் பயன்படுத்தலாம், மீண்டும் key தேவையாகும்.)')) {
      return;
    }
    try {
      const base = getApiBase();
      const resp = await axios.post(`${base}/license/deactivate`);
      const data = resp.data || {};
      setLicenseKey('');
      setLicenseStatus({
        active: !!data.license_active,
        maskedKey: null,
        message: 'License cancelled / deactivated for this computer',
        error: null
      });
    } catch (error) {
      setLicenseStatus(prev => ({
        ...prev,
        error: error.message || String(error)
      }));
    }
  }

  async function handleStartTrial(e) {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    const days = parseInt((trialDaysInput || '').trim() || '0', 10);
    if (!days || days < 1 || days > 7) {
      setTrialInfo({ status: 'invalid', message: 'Trial days must be between 1 and 7' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const payload = {
        trial_enabled: true,
        trial_start_date: today,
        trial_days: days
      };
      const base = getApiBase();
      const resp = await axios.post(`${base}/settings/trial`, payload);
      const data = resp.data || {};
      const start = data.trial_start_date || today;
      const d = parseInt(data.trial_days || days, 10);
      const startDate = new Date(start);
      const expiry = new Date(startDate);
      expiry.setDate(expiry.getDate() + d);
      if (Number.isNaN(startDate.getTime())) {
        setTrialInfo({ status: 'invalid', message: 'Trial configuration invalid' });
      } else {
        const now = new Date();
        if (now > expiry) {
          setTrialInfo({
            status: 'expired',
            message: `Trial expired on ${expiry.toISOString().slice(0, 10)}`
          });
        } else {
          const diffMs = expiry.getTime() - now.getTime();
          const remaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          setTrialInfo({
            status: 'active',
            message: `Trial active, ${remaining} day(s) remaining (expires ${expiry.toISOString().slice(0, 10)})`
          });
        }
      }
    } catch (error) {
      let msg = 'Error starting trial';
      try {
        if (error.response && error.response.data) {
          msg = error.response.data.detail || error.response.data.message || msg;
        } else if (error.message) {
          msg = error.message;
        } else {
          msg = String(error);
        }
      } catch (e) {
        msg = error.message || String(error);
      }
      setTrialInfo({
        status: 'error',
        message: msg
      });
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Developer Console</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Installation, connectivity and basic troubleshooting tools
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <div>{user?.full_name || user?.username}</div>
          <div>Role: {user?.role}</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          padding: '0.5rem',
          backgroundColor: 'var(--menu-bg)',
          borderRadius: '12px',
          width: '100%',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        {[
          { id: 'connectivity', label: 'Backend / Connectivity 🌐' },
          'divider',
          { id: 'license', label: 'License / Trial 🔑' },
          'divider',
          { id: 'maintenance', label: 'Updates / Sample Data 🛠️' },
          'divider',
          { id: 'health', label: 'Health / Install 🧪' }
        ].map((item, idx) => {
          if (item === 'divider') {
            return (
              <span
                key={`div-${idx}`}
                style={{
                  width: '1px',
                  height: '26px',
                  background: 'var(--border-color)',
                  alignSelf: 'center',
                  margin: '0 0.25rem'
                }}
              />
            );
          }
          const tab = item;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: isActive ? '#ffffff' : 'transparent',
                color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
                width: 'auto',
                padding: '0.55rem 1.15rem',
                borderRadius: '999px',
                border: isActive ? '1px solid var(--primary-color)' : '1px solid transparent',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'connectivity' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Backend Status & Mode</h2>
            <p style={{ marginBottom: '0.75rem', color: '#4b5563' }}>
              இங்கு Cloud / Local backend mode select பண்ணலாம். எல்லா screen / mobile app இதையே use பண்ணும்.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={() => handleBackendModeChange(BACKEND_MODES.CLOUD)}
                style={{
                  width: 'auto',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '999px',
                  border: backendMode === BACKEND_MODES.CLOUD ? '2px solid #2563eb' : '1px solid #d1d5db',
                  backgroundColor: backendMode === BACKEND_MODES.CLOUD ? '#2563eb' : '#f9fafb',
                  color: backendMode === BACKEND_MODES.CLOUD ? '#ffffff' : '#111827',
                  fontSize: '0.85rem'
                }}
              >
                Cloud Mode (Internet)
              </button>
              <button
                type="button"
                onClick={() => handleBackendModeChange(BACKEND_MODES.LOCAL)}
                style={{
                  width: 'auto',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '999px',
                  border: backendMode === BACKEND_MODES.LOCAL ? '2px solid #059669' : '1px solid #d1d5db',
                  backgroundColor: backendMode === BACKEND_MODES.LOCAL ? '#059669' : '#f9fafb',
                  color: backendMode === BACKEND_MODES.LOCAL ? '#ffffff' : '#111827',
                  fontSize: '0.85rem'
                }}
              >
                Local Mode (Offline / Office PC)
              </button>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Current: <strong>{backendMode === BACKEND_MODES.LOCAL ? 'LOCAL BACKEND' : 'CLOUD BACKEND'}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <button style={{ width: 'auto' }} onClick={handleCheckBackend}>
                Check Backend Now
              </button>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  backgroundColor: backendStatus.ok ? '#dcfce7' : '#fee2e2',
                  color: backendStatus.ok ? '#166534' : '#991b1b'
                }}
              >
                {backendStatus.ok ? 'Backend reachable' : 'Backend not reachable'}
              </span>
            </div>
            {backendStatus.error && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  fontSize: '0.8rem'
                }}
              >
                Last error: {backendStatus.error}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Cloud / Offline URLs & Paths</h2>
            <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              இங்கு cloud deploy செய்த frontend / backend URL களைவும், offline install பாதையைவும் சேமிக்கலாம்.
            </p>
            <form onSubmit={handleSaveUrlSettings} style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Cloud Frontend URL
                </label>
                <input
                  type="text"
                  value={cloudFrontendUrl}
                  onChange={(e) => setCloudFrontendUrl(e.target.value)}
                  placeholder="உதா: https://chitfund-frontend.onrender.com"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Cloud Backend URL
                </label>
                <input
                  type="text"
                  value={cloudBackendUrl}
                  onChange={(e) => setCloudBackendUrl(e.target.value)}
                  placeholder="உதா: https://chitfund-backend.onrender.com"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Offline Install Path (Local App Folder)
                </label>
                <input
                  type="text"
                  id="offline-install-path-input"
                  value={offlinePath}
                  onChange={(e) => setOfflinePath(e.target.value)}
                  placeholder="உதா: D:\chit fund\ClientRuntime"
                />
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <button type="submit" style={{ width: 'auto' }}>
                  Save URL Settings (சேமிக்கவும்)
                </button>
              </div>
              {urlStatus.message && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    fontSize: '0.85rem'
                  }}
                >
                  {urlStatus.message}
                </div>
              )}
              {urlStatus.error && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    fontSize: '0.85rem'
                  }}
                >
                  {urlStatus.error}
                </div>
              )}
            </form>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Offline App Folder Health (Local Mode Helper)</h2>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Local Mode பயன்படுத்தும் போது இந்த பாதை{' '}
              <code>{offlinePath || systemSettings?.offline_path || 'offline path not set'}</code>{' '}
              உள்ளே backend / frontend / DB எல்லாம் இருக்கிறதா என்று quick check செய்ய இந்த section use பண்ணலாம்.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <button type="button" style={{ width: 'auto' }} onClick={handleOfflineScan}>
                {offlineScan.loading ? 'Scanning offline folder…' : 'Re-check Offline Folder'}
              </button>
              {offlineScan.data && (
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    backgroundColor: offlineScan.data.backend_ok && offlineScan.data.frontend_ok && offlineScan.data.db_ok
                      ? '#dcfce7'
                      : '#fee2e2',
                    color: offlineScan.data.backend_ok && offlineScan.data.frontend_ok && offlineScan.data.db_ok
                      ? '#166534'
                      : '#991b1b'
                  }}
                >
                  {offlineScan.data.message || 'Scan completed'}
                </span>
              )}
            </div>
            {offlineScan.error && (
              <div
                style={{
                  marginTop: '0.25rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  fontSize: '0.85rem'
                }}
              >
                Error scanning offline folder: {offlineScan.error}
              </div>
            )}
            {offlineScan.data && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                <div>Detected path: <code>{offlineScan.data.offline_path || '(none)'}</code></div>
                <div>Backend folder OK: <strong>{offlineScan.data.backend_ok ? 'YES' : 'NO'}</strong></div>
                <div>Frontend build OK: <strong>{offlineScan.data.frontend_ok ? 'YES' : 'NO'}</strong></div>
                <div>DB files found: <strong>{(offlineScan.data.db_files || []).length}</strong></div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Database Status</h2>
            <p style={{ marginBottom: '0.75rem' }}>
              Uses <code>/check-db</code> endpoint to verify DB connection and counts.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <button style={{ width: 'auto' }} onClick={handleCheckDb}>
                Check Database
              </button>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  backgroundColor: dbStatus.ok ? '#dcfce7' : '#fee2e2',
                  color: dbStatus.ok ? '#166534' : '#991b1b'
                }}
              >
                {dbStatus.ok ? 'Database OK' : 'Database check pending or failed'}
              </span>
            </div>
            {dbStatus.ok && (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <div>Total users: {dbStatus.users}</div>
                <div>Total customers: {dbStatus.customers}</div>
              </div>
            )}
            {dbStatus.error && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}
              >
                Error: {dbStatus.error}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'license' && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>
              License / Installation Info
              {licenseStatus.active && systemSettings?.company_name
                ? ` – ${systemSettings.company_name}`
                : ''}
            </h2>
            {licenseStatus.active && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Licensed to: <strong>{systemSettings?.company_name || 'Company name not set'}</strong>
              </div>
            )}
            <form onSubmit={handleActivateLicense} style={{ marginTop: '0.5rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Product Code (இந்த கணினிக்கே unique)</label>
                <input type="text" value={productCode} readOnly />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>License Key</label>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="Enter license key"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
                <button type="submit" style={{ width: 'auto' }}>
                  Activate License
                </button>
                {licenseStatus.active && (
                  <button
                    type="button"
                    style={{ width: 'auto', backgroundColor: '#b91c1c' }}
                    onClick={handleDeactivateLicense}
                  >
                    Cancel License
                  </button>
                )}
              </div>
            </form>
            <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
              <div>App name: {systemSettings?.app_name || 'Finance Manager'}</div>
              <div>Company: {systemSettings?.company_name || '-'}</div>
              <div style={{ marginTop: '0.5rem' }}>
                Status:{' '}
                <strong style={{ color: licenseStatus.active ? '#166534' : '#991b1b' }}>
                  {licenseStatus.active ? 'Active' : 'Not Active'}
                </strong>
              </div>
              {licenseStatus.maskedKey && (
                <div>Installed key: {licenseStatus.maskedKey}</div>
              )}
              {licenseStatus.message && (
                <div style={{ marginTop: '0.25rem', color: '#166534', fontSize: '0.85rem' }}>
                  {licenseStatus.message}
                </div>
              )}
              {licenseStatus.error && (
                <div style={{ marginTop: '0.25rem', color: '#b91c1c', fontSize: '0.85rem' }}>
                  {licenseStatus.error}
                </div>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ marginBottom: '0.35rem' }}>
                  <strong>Trial Settings</strong>
                </div>
                <div style={{ marginBottom: '0.35rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>Trial days</label>
                  <input
                    type="number"
                    min="1"
                    value={trialDaysInput}
                    onChange={(e) => setTrialDaysInput(e.target.value)}
                    placeholder="e.g. 7 or 30"
                    disabled={licenseStatus.active}
                  />
                </div>
                <button
                  type="button"
                  style={{ width: 'auto', opacity: licenseStatus.active ? 0.6 : 1, cursor: licenseStatus.active ? 'not-allowed' : 'pointer' }}
                  onClick={handleStartTrial}
                  disabled={licenseStatus.active}
                >
                  Start / Reset Trial
                </button>
                {licenseStatus.active && (
                  <div
                    style={{
                      marginTop: '0.4rem',
                      fontSize: '0.85rem',
                      color: '#4b5563'
                    }}
                  >
                    License already active on this computer. Trial is not applicable.
                  </div>
                )}
                {trialInfo.message && (
                  <div
                    style={{
                      marginTop: '0.4rem',
                      fontSize: '0.85rem',
                      color:
                        trialInfo.status === 'active'
                          ? '#166534'
                          : trialInfo.status === 'expired' || trialInfo.status === 'error'
                          ? '#b91c1c'
                          : '#4b5563'
                    }}
                  >
                    {trialInfo.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Software Checklist</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Basic runtime versions required for this app.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Python runtime: <strong>{diag.data?.python_version || '-'}</strong>
                </span>
                <span
                  style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    backgroundColor: diag.data?.python_version ? '#dcfce7' : '#fee2e2',
                    color: diag.data?.python_version ? '#166534' : '#991b1b'
                  }}
                >
                  {diag.data?.python_version ? 'OK' : 'Not detected'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Node.js: <strong>{diag.data?.node_version || '-'}</strong>
                </span>
                <span
                  style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    backgroundColor: diag.data?.node_version ? '#dcfce7' : '#fee2e2',
                    color: diag.data?.node_version ? '#166534' : '#991b1b'
                  }}
                >
                  {diag.data?.node_version ? 'OK' : 'Not detected'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  npm: <strong>{diag.data?.npm_version || '-'}</strong>
                </span>
                <span
                  style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    backgroundColor: diag.data?.npm_version ? '#dcfce7' : '#fee2e2',
                    color: diag.data?.npm_version ? '#166534' : '#991b1b'
                  }}
                >
                  {diag.data?.npm_version ? 'OK' : 'Not detected'}
                </span>
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <button
                type="button"
                style={{ width: 'auto', marginRight: '0.5rem' }}
                onClick={() => window.open('https://www.python.org/downloads/', '_blank')}
              >
                Open Python Download Page
              </button>
              <button
                type="button"
                style={{ width: 'auto' }}
                onClick={() => window.open('https://nodejs.org/en/download', '_blank')}
              >
                Open Node.js Download Page
              </button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'maintenance' && (
        <>
          <div className="card" style={{ marginTop: '1.5rem', borderColor: '#b91c1c' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#b91c1c' }}>Fresh Reset (Test Data Clear)</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              இந்த option use பண்ணினா customers, loans, transactions, expenses, Admin / Developer அல்லாத users எல்லாம் delete ஆகும். License / settings / Admin / Developer users மட்டும் இருக்கும்.
            </p>
            <button
              type="button"
              style={{
                width: 'auto',
                backgroundColor: '#b91c1c',
                borderColor: '#b91c1c',
                color: '#fff'
              }}
              onClick={handleFreshReset}
            >
              Clear All Test Data (Fresh Start)
            </button>
            {freshStatus.message && (
              <div style={{ marginTop: '0.4rem', color: '#166534', fontSize: '0.85rem' }}>{freshStatus.message}</div>
            )}
            {freshStatus.error && (
              <div style={{ marginTop: '0.4rem', color: '#b91c1c', fontSize: '0.85rem' }}>Error: {freshStatus.error}</div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>App Update (Developer Only)</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              இந்த option use பண்ணினா இந்த computer ல install பண்ணியிருக்கும் app code க்கு, Git repository ல இருக்கும் latest version இல் இருந்து
              <strong> git pull </strong>
              run பண்ண try செய்யும். இது developer / technician மட்டும் use பண்ண வேண்டிய advanced feature.
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              இந்த machine ல{' '}
              <strong>Git install பண்ணி configure பண்ணியிருக்கணும்</strong>. Local changes இருந்தா conflict வர வாய்ப்பு இருக்கு; update run பண்ணும் முன்
              backup எடுத்து வைக்கவும்.
            </p>
            <button
              type="button"
              style={{ width: 'auto' }}
              disabled={updateStatus.loading}
              onClick={handleUpdateApp}
            >
              {updateStatus.loading ? 'Running App Update...' : 'Run App Update (git pull)'}
            </button>
            {updateStatus.message && (
              <div style={{ marginTop: '0.4rem', color: '#166534', fontSize: '0.85rem' }}>{updateStatus.message}</div>
            )}
            {updateStatus.error && (
              <div style={{ marginTop: '0.4rem', color: '#b91c1c', fontSize: '0.85rem' }}>Error: {updateStatus.error}</div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Offline Update (USB / Zip)</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Internet / Git இல்லாத customer systems ல app update செய்ய developer build செய்த zip file ஐ pendrive / USB ல கொண்டு வந்து இங்க upload பண்ணி
              backend + frontend code update செய்ய இந்த option use பண்ணலாம்.
            </p>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Zip file structure:
              <br />
              - backend/...
              <br />
              - frontend/...
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <input type="file" accept=".zip" onChange={handleOfflineFileChange} />
            </div>
            <button
              type="button"
              style={{ width: 'auto' }}
              disabled={offlineStatus.loading || !offlineFile}
              onClick={handleOfflineUpdate}
            >
              {offlineStatus.loading ? 'Applying Offline Update...' : 'Apply Offline Update (zip)'}
            </button>
            {offlineStatus.message && (
              <div style={{ marginTop: '0.4rem', color: '#166534', fontSize: '0.85rem' }}>{offlineStatus.message}</div>
            )}
            {offlineStatus.error && (
              <div style={{ marginTop: '0.4rem', color: '#b91c1c', fontSize: '0.85rem' }}>Error: {offlineStatus.error}</div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Sample Data (Demo Records)</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Demo / training காக temporary sample customers, staff/agent users, loans + transactions create செய்ய இந்த section use பண்ணலாம். Live customer data இருந்தால் மிகவும் ஜாக்கிரதையாக use செய்யவும்.
            </p>
            <form onSubmit={handleCreateSampleData} style={{ marginBottom: '0.75rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem' }}>Sample records count</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={sampleCount}
                  onChange={(e) => setSampleCount(e.target.value)}
                  placeholder="e.g. 5, 10, 20"
                />
              </div>
              <button type="submit" style={{ width: 'auto', marginRight: '0.5rem' }}>
                Create Sample Data
              </button>
              <button type="button" style={{ width: 'auto' }} onClick={handleClearSampleData}>
                Delete Sample Data
              </button>
            </form>
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                Sample customers name format: <code>SAMPLE CUSTOMER 1..N</code>
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                ஒன்னுமே வேண்டாம்னா <strong>Delete Sample Data</strong> button press பண்ணினால் அந்த sample customers + loans + அவைக்கு சம்பந்தப்பட்ட transactions மட்டும் முழுக்க delete ஆகும்.
              </div>
            </div>
            {sampleStatus.message && (
              <div style={{ marginTop: '0.4rem', color: '#166534', fontSize: '0.85rem' }}>{sampleStatus.message}</div>
            )}
            {sampleStatus.error && (
              <div style={{ marginTop: '0.4rem', color: '#b91c1c', fontSize: '0.85rem' }}>Error: {sampleStatus.error}</div>
            )}
          </div>
        </>
      )}

      {activeTab === 'health' && (
        <>
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>File / DB Health</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              முக்கிய app files மற்றும் database நிலை. ஏதேனும் file மட்டும் missing இருந்தாலே இந்த section alert காட்டும்.
            </p>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {diag.data?.files
                ? Object.entries(diag.data.files).map(([key, info]) => {
                    const labelMap = {
                      backend_main: 'Backend main.py',
                      backend_models: 'Backend models.py',
                      backend_database: 'Backend database.py',
                      db_file: 'Database file (finance.db)',
                      start_servers: 'Start script (start_servers.bat)',
                      start_app_vbs: 'Hidden start script (start_app.vbs)',
                      frontend_app: 'Frontend App.jsx',
                      frontend_login: 'Frontend Login.jsx',
                      frontend_developer_dashboard: 'Frontend DeveloperDashboard.jsx'
                    };
                    const label = labelMap[key] || key;
                    const exists = !!info?.exists;
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.25rem'
                        }}
                      >
                        <span>{label}</span>
                        <span
                          style={{
                            padding: '0.1rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            backgroundColor: exists ? '#dcfce7' : '#fee2e2',
                            color: exists ? '#166534' : '#991b1b'
                          }}
                        >
                          {exists ? 'OK' : 'Missing'}
                        </span>
                      </div>
                    );
                  })
                : (
                  <div style={{ color: 'var(--text-muted)' }}>File diagnostics not available.</div>
                )}
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <button style={{ width: 'auto', marginRight: '0.5rem' }} onClick={handleRepairDb}>
                Repair / Recreate Database
              </button>
            </div>
            {repairStatus.message && (
              <div style={{ marginTop: '0.4rem', color: '#166534', fontSize: '0.85rem' }}>{repairStatus.message}</div>
            )}
            {repairStatus.error && (
              <div style={{ marginTop: '0.4rem', color: '#b91c1c', fontSize: '0.85rem' }}>Error: {repairStatus.error}</div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Troubleshooting Tools</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Developer use only: basic health checks and environment info.
            </p>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <div>
                <strong>Backend Status:</strong> {backendStatus.ok ? 'OK' : 'Not reachable'}
              </div>
              <div>
                <strong>Database Status:</strong> {dbStatus.ok ? 'OK' : 'Check failed'}
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <button style={{ width: 'auto', marginRight: '0.5rem' }} onClick={handleCheckBackend}>
                Re-check Backend
              </button>
              <button style={{ width: 'auto' }} onClick={handleCheckDb}>
                Re-check Database
              </button>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>Python:</strong> {diag.data?.python_version || '-'}
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>DB Path:</strong> {diag.data?.db_path || '-'}
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>DB Integrity:</strong> {diag.data?.db_integrity || '-'}
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>DB Stats:</strong>{' '}
                {diag.data?.db_stats
                  ? `Users: ${diag.data.db_stats.users ?? 0}, Customers: ${diag.data.db_stats.customers ?? 0}, Loans: ${diag.data.db_stats.loans ?? 0}, Txns: ${diag.data.db_stats.transactions ?? 0}`
                  : '-'}
              </div>
              {diag.error && (
                <div style={{ marginTop: '0.25rem', color: '#b91c1c', fontSize: '0.85rem' }}>
                  Diagnostics error: {diag.error}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Installation Checklist & Repair</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              புதிய கணினியில் install / migrate செய்யும்போது கீழே உள்ள அடிப்படை படிகளை பின்பற்றவும்.
            </p>
            <ol style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              <li style={{ marginBottom: '0.3rem' }}>Python 3.10+ மற்றும் Node.js நிறுவப்பட்டதா என உறுதி செய்யவும்.</li>
              <li style={{ marginBottom: '0.3rem' }}>Backend server: <code>cd D:\chit fund\backend</code> → <code>python -m uvicorn main:app --reload --port 9000</code></li>
              <li style={{ marginBottom: '0.3rem' }}>Frontend server: <code>cd D:\chit fund\frontend</code> → <code>npm install</code> (முதல் தடவை மட்டும்) → <code>npm run dev</code></li>
              <li style={{ marginBottom: '0.3rem' }}>Developer role‑ஆ login செய்து Product Code note பண்ணி license key activate செய்யவும்.</li>
              <li style={{ marginBottom: '0.3rem' }}>License active ஆன பிறகே Admin / Staff / Agent / Customer login செய்ய அனுமதி.</li>
            </ol>
            <div style={{ marginBottom: '0.75rem' }}>
              <a href="/setup-checklist-en.html" target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem' }}>
                Open full installation checklist (English)
              </a>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Repair: Admin / Developer users</strong>
              </div>
              <button style={{ width: 'auto', marginBottom: '0.5rem' }} onClick={handleEnsureUsers}>
                Ensure Admin / Developer Users (init-db)
              </button>
              {ensureStatus.message && (
                <div style={{ color: '#166534', fontSize: '0.85rem' }}>{ensureStatus.message}</div>
              )}
              {ensureStatus.error && (
                <div style={{ color: '#b91c1c', fontSize: '0.85rem' }}>Error: {ensureStatus.error}</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default DeveloperDashboard;
