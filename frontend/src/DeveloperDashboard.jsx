import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
  const BACKEND_TIMEOUT_MS = 7000;

  useEffect(() => {
    async function checkBackend() {
      try {
        let resp;
        const bases = ['https://chitfund-backend-hk37.onrender.com', 'http://127.0.0.1:9000', 'http://localhost:9000'];
        let lastError = null;
        for (const base of bases) {
          try {
            resp = await axios.get(`${base}/settings`, { timeout: BACKEND_TIMEOUT_MS });
            break;
          } catch (e) {
            lastError = e;
          }
        }
        if (!resp) {
          throw lastError || new Error('Backend not reachable');
        }
        if (resp.data) {
          setBackendStatus({ ok: true, error: null });
        } else {
          setBackendStatus({ ok: false, error: 'Empty response' });
        }
      } catch (error) {
        setBackendStatus({ ok: false, error: error.message || String(error) });
      }
    }
    checkBackend();
    async function fetchProductCode() {
      try {
        let resp;
        try {
          resp = await axios.get('http://127.0.0.1:9000/license/product', { timeout: BACKEND_TIMEOUT_MS });
        } catch (err1) {
          resp = await axios.get('http://localhost:9000/license/product', { timeout: BACKEND_TIMEOUT_MS });
        }
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
        let resp;
        try {
          resp = await axios.get('http://127.0.0.1:9000/diagnostics/summary', { timeout: BACKEND_TIMEOUT_MS });
        } catch (err1) {
          resp = await axios.get('http://localhost:9000/diagnostics/summary', { timeout: BACKEND_TIMEOUT_MS });
        }
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
  }, [systemSettings]);

  async function handleCheckBackend(e) {
    try {
      await checkBackend();
    } catch {
    }
  }

  async function handleCheckDb() {
    try {
      const resp = await axios.get('http://127.0.0.1:9000/check-db').catch(() => axios.get('http://localhost:9000/check-db'));
      const data = resp.data || {};
      const users = Array.isArray(data.users) ? data.users.length : 0;
      const customers = Array.isArray(data.customers) ? data.customers.length : 0;
      setDbStatus({ ok: true, users, customers, error: null });
    } catch (error) {
      setDbStatus({ ok: false, users: 0, customers: 0, error: error.message || String(error) });
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
      const resp = await axios
        .post('http://127.0.0.1:9000/maintenance/update-app')
        .catch(() => axios.post('http://localhost:9000/maintenance/update-app'));
      const data = resp.data || {};
      if (data.ok) {
        setUpdateStatus({
          loading: false,
          message: data.message || 'App update completed successfully.',
          error: null
        });
      } else {
        setUpdateStatus({
          loading: false,
          message: null,
          error:
            data.message ||
            data.stderr ||
            (data.git_available === false
              ? 'Git not available on this system. Install Git and try again.'
              : 'App update failed. See backend logs for details.')
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
      const resp = await axios
        .post('http://127.0.0.1:9000/maintenance/offline-update', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        .catch(() =>
          axios.post('http://localhost:9000/maintenance/offline-update', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        );
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
      const resp = await axios
        .get('http://127.0.0.1:9000/init-db')
        .catch(() => axios.get('http://localhost:9000/init-db'));
      const msg = resp.data?.message || 'Admin / Developer users ensured';
      setEnsureStatus({ message: msg, error: null });
      await handleCheckDb();
    } catch (error) {
      setEnsureStatus({ message: null, error: error.message || String(error) });
    }
  }

  async function handleRepairDb() {
    try {
      setRepairStatus({ message: 'Attempting database repair / recreate...', error: null });
      const resp = await axios
        .post('http://127.0.0.1:9000/diagnostics/repair-db')
        .catch(() => axios.post('http://localhost:9000/diagnostics/repair-db'));
      const data = resp.data || {};
      const msg = data.message || 'Database repair completed';
      setRepairStatus({ message: msg, error: null });
      await handleCheckDb();
      await handleCheckBackend();
      try {
        const diagResp = await axios
          .get('http://127.0.0.1:9000/diagnostics/summary')
          .catch(() => axios.get('http://localhost:9000/diagnostics/summary'));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/sample-data/generate', payload)
        .catch(() => axios.post('http://localhost:9000/sample-data/generate', payload));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/sample-data/clear')
        .catch(() => axios.post('http://localhost:9000/sample-data/clear'));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/maintenance/fresh-reset')
        .catch(() => axios.post('http://localhost:9000/maintenance/fresh-reset'));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/license/activate', { license_key: trimmed })
        .catch(() => axios.post('http://localhost:9000/license/activate', { license_key: trimmed }));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/license/deactivate')
        .catch(() => axios.post('http://localhost:9000/license/deactivate'));
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
      const resp = await axios
        .post('http://127.0.0.1:9000/settings/trial', payload)
        .catch(() => axios.post('http://localhost:9000/settings/trial', payload));
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

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Backend Status</h2>
        <p style={{ marginBottom: '0.75rem' }}>
          Current backend URL checks: <code>http://127.0.0.1:9000/settings</code> → fallback to <code>http://localhost:9000/settings</code>
        </p>
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
    </div>
  );
}

export default DeveloperDashboard;
