import React, { useState, useEffect } from 'react'
import './App.css'
import Login from './Login'
import AdminDashboard from './AdminDashboard'
import StaffDashboard from './StaffDashboard'
import AgentDashboard from './AgentDashboard'
import CustomerDashboard from './CustomerDashboard'
import DeveloperDashboard from './DeveloperDashboard'
import axios from 'axios'
import { getApiBase } from './backendConfig'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444', backgroundColor: '#fff', minHeight: '100vh' }}>
          <h1 style={{ marginBottom: '1rem' }}>ஏதோ தவறு நடந்துவிட்டது (Something went wrong)</h1>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left', background: '#f3f4f6', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Error Detail:</p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.9rem', color: '#374151' }}>
              {this.state.error?.stack || this.state.error?.toString()}
            </pre>
          </div>
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }} 
            style={{ marginTop: '2rem', width: 'auto', padding: '0.75rem 2rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Clear Cache & Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [systemSettings, setSystemSettings] = useState({
    app_name: 'Finance Manager',
    company_name: '',
    company_address: '',
    company_phone: '',
    logo_base64: ''
  });
  const [backendOnline, setBackendOnline] = useState(true);
  const [backendChecked, setBackendChecked] = useState(false);
  const [currentOperation, setCurrentOperation] = useState('Login');

  const themes = {
    blue: {
      '--primary-color': '#1e40af',
      '--primary-hover': '#1d4ed8',
      '--bg-color': '#eef2ff',
      '--menu-bg': '#dbeafe',
      '--card-bg': '#ffffff',
      '--text-color': '#0f172a',
      '--text-muted': '#475569',
      '--border-color': '#cbd5e1',
    },
    green: {
      '--primary-color': '#047857',
      '--primary-hover': '#065f46',
      '--bg-color': '#e7f3ef',
      '--menu-bg': '#d1fae5',
      '--card-bg': '#ffffff',
      '--text-color': '#064e3b',
      '--text-muted': '#0f766e',
      '--border-color': '#94d5c8',
    },
    purple: {
      '--primary-color': '#6d28d9',
      '--primary-hover': '#7c3aed',
      '--bg-color': '#ede9fe',
      '--menu-bg': '#e9d5ff',
      '--card-bg': '#ffffff',
      '--text-color': '#3b0764',
      '--text-muted': '#6b21a8',
      '--border-color': '#c4b5fd',
    },
    teal: {
      '--primary-color': '#0d9488',
      '--primary-hover': '#0f766e',
      '--bg-color': '#e6fffa',
      '--menu-bg': '#ccfbf1',
      '--card-bg': '#ffffff',
      '--text-color': '#0f172a',
      '--text-muted': '#0f766e',
      '--border-color': '#99f6e4',
    },
    orange: {
      '--primary-color': '#ea580c',
      '--primary-hover': '#c2410c',
      '--bg-color': '#fff7ed',
      '--menu-bg': '#ffedd5',
      '--card-bg': '#ffffff',
      '--text-color': '#1f2937',
      '--text-muted': '#9a3412',
      '--border-color': '#fed7aa',
    },
    rose: {
      '--primary-color': '#e11d48',
      '--primary-hover': '#be123c',
      '--bg-color': '#fff1f2',
      '--menu-bg': '#ffe4e6',
      '--card-bg': '#ffffff',
      '--text-color': '#111827',
      '--text-muted': '#9f1239',
      '--border-color': '#fecdd3',
    },
    slate: {
      '--primary-color': '#475569',
      '--primary-hover': '#334155',
      '--bg-color': '#f1f5f9',
      '--menu-bg': '#e2e8f0',
      '--card-bg': '#ffffff',
      '--text-color': '#0f172a',
      '--text-muted': '#64748b',
      '--border-color': '#cbd5e1',
    },
    sepia: {
      '--primary-color': '#b45309',
      '--primary-hover': '#92400e',
      '--bg-color': '#faf3e0',
      '--menu-bg': '#f5e6c8',
      '--card-bg': '#fff8e6',
      '--text-color': '#1f2937',
      '--text-muted': '#8b5e34',
      '--border-color': '#e0d3b8',
    },
    highcontrast: {
      '--primary-color': '#ffd000',
      '--primary-hover': '#ffb300',
      '--bg-color': '#000000',
      '--menu-bg': '#1a1a1a',
      '--card-bg': '#0a0a0a',
      '--text-color': '#ffffff',
      '--text-muted': '#e5e7eb',
      '--border-color': '#3d3d3d',
    },
    dark: {
      '--primary-color': '#60a5fa',
      '--primary-hover': '#3b82f6',
      '--bg-color': '#0b1220',
      '--menu-bg': '#0e1626',
      '--card-bg': '#121826',
      '--text-color': '#e5e7eb',
      '--text-muted': '#cbd5e1',
      '--border-color': '#2a3647',
    }
  };

  function handleThemeChange(themeName) {
    const theme = themes[themeName];
    for (const key in theme) {
      document.documentElement.style.setProperty(key, theme[key]);
    }
  }

  const BACKEND_TIMEOUT_MS = 7000;

  async function fetchSystemSettings() {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/settings`, {
        timeout: BACKEND_TIMEOUT_MS
      });
      if (response.data) {
        const s = response.data || {};
        let sanitized = {
          ...s,
          commission_enabled: !!s.commission_enabled,
          commission_percent: Number(s.commission_percent ?? 0),
          auto_backup_enabled: !!s.auto_backup_enabled,
          auto_backup_frequency: s.auto_backup_frequency || 'daily',
          sms_provider: s.sms_provider || 'twilio',
          twilio_account_sid: s.twilio_account_sid || null,
          twilio_auth_token: s.twilio_auth_token || null,
          twilio_sms_from: s.twilio_sms_from || null,
          twilio_whatsapp_from: s.twilio_whatsapp_from || null,
          payment_enabled: !!s.payment_enabled,
          payment_provider: s.payment_provider || 'razorpay',
          razorpay_key_id: s.razorpay_key_id || null,
          razorpay_key_secret: s.razorpay_key_secret || null,
          razorpay_webhook_secret: s.razorpay_webhook_secret || null,
          license_key: s.license_key || null,
          license_active: !!s.license_active,
          license_valid_till: s.license_valid_till || null,
          trial_enabled: !!s.trial_enabled,
          trial_start_date: s.trial_start_date || null,
          trial_days: s.trial_days ?? 0
        };
        try {
          const lastRaw = localStorage.getItem('system_settings_last');
          if (lastRaw) {
            const last = JSON.parse(lastRaw);
            if (!!last.commission_enabled && !sanitized.commission_enabled) {
              sanitized.commission_enabled = true;
              sanitized.commission_percent = Number(last.commission_percent ?? sanitized.commission_percent);
            }
            if (!!last.auto_backup_enabled && !sanitized.auto_backup_enabled) {
              sanitized.auto_backup_enabled = true;
              sanitized.auto_backup_frequency = last.auto_backup_frequency || sanitized.auto_backup_frequency;
            }
          }
        } catch (e) { e; }
        setSystemSettings(prev => ({ ...prev, ...sanitized }));
        try {
          localStorage.setItem('system_settings_last', JSON.stringify(sanitized));
        } catch (e) { e; }
        setBackendOnline(true);
        setBackendChecked(true);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setBackendOnline(false);
      setBackendChecked(true);
      try {
        const raw = localStorage.getItem('system_settings_last');
        if (raw) {
          const s = JSON.parse(raw);
          setSystemSettings(prev => ({
            ...prev,
            ...s,
            commission_enabled: !!s.commission_enabled,
            commission_percent: Number(s.commission_percent ?? 0),
            auto_backup_enabled: !!s.auto_backup_enabled,
            auto_backup_frequency: s.auto_backup_frequency || 'daily',
            sms_provider: s.sms_provider || 'twilio',
            twilio_account_sid: s.twilio_account_sid || null,
            twilio_auth_token: s.twilio_auth_token || null,
            twilio_sms_from: s.twilio_sms_from || null,
            twilio_whatsapp_from: s.twilio_whatsapp_from || null,
            payment_enabled: !!s.payment_enabled,
            payment_provider: s.payment_provider || 'razorpay',
            razorpay_key_id: s.razorpay_key_id || null,
            razorpay_key_secret: s.razorpay_key_secret || null,
            razorpay_webhook_secret: s.razorpay_webhook_secret || null
          }));
        }
      } catch (e) { e; }
    }
  }
  useEffect(() => {
    fetchSystemSettings();
    const savedTheme = localStorage.getItem('theme');
    handleThemeChange(savedTheme || 'blue');
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && parsedUser.role) {
          setUser(parsedUser);
        } else {
          localStorage.removeItem('user');
        }
      } catch (e) {
        console.error('Error parsing saved user:', e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  useEffect(() => {
    let timer;
    const ping = async () => {
      await fetchSystemSettings();
    };
    ping();
    timer = setInterval(ping, 10000);
    return () => { if (timer) clearInterval(timer); };
  }, []);

 

 

  const handleLogin = (userData) => {
    console.log('Login successful, user data:', userData);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    let op = 'App';
    if (userData.role === 'admin') op = 'Admin Dashboard';
    else if (userData.role === 'staff') op = 'Staff Dashboard';
    else if (userData.role === 'agent') op = 'Agent / Collection';
    else if (userData.role === 'customer') op = 'Customer Portal';
    else if (userData.role === 'developer') op = 'Developer Console';
    setCurrentOperation(op);
    fetchSystemSettings();
  }

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setCurrentOperation('Login');
  }

  const licenseActive = !!systemSettings.license_active;
  const trialEnabled = !!systemSettings.trial_enabled;
  const trialStart = systemSettings.trial_start_date;
  const trialDays = Number(systemSettings.trial_days ?? 0);
  let trialActive = false;
  let trialExpiryStr = null;
  let trialRemainingDays = 0;
  if (trialEnabled && trialStart && trialDays > 0) {
    const startDate = new Date(trialStart);
    if (!Number.isNaN(startDate.getTime())) {
      const expiry = new Date(startDate);
      expiry.setDate(expiry.getDate() + trialDays);
      const today = new Date();
      if (today <= expiry) {
        trialActive = true;
        const diffMs = expiry.getTime() - today.getTime();
        trialRemainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        trialExpiryStr = expiry.toISOString().slice(0, 10);
      }
    }
  }
  const effectiveLicensed = licenseActive || trialActive;

  useEffect(() => {
    const company = (systemSettings.company_name && systemSettings.company_name.trim()) || systemSettings.app_name || 'Finance Manager';
    let op = currentOperation;
    if (!user) {
      op = 'Login';
    } else if (!op) {
      if (user.role === 'admin') op = 'Admin Dashboard';
      else if (user.role === 'staff') op = 'Staff Dashboard';
      else if (user.role === 'agent') op = 'Agent / Collection';
      else if (user.role === 'customer') op = 'Customer Portal';
      else if (user.role === 'developer') op = 'Developer Console';
      else op = 'App';
    }
    document.title = `${company} – ${op}`;
  }, [systemSettings.company_name, systemSettings.app_name, currentOperation, user]);

  if (!user) {
    if (!backendChecked) {
      return (
        <div style={{ backgroundColor: 'var(--bg-color)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '1.5rem 2rem', maxWidth: '480px', textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--primary-color)' }}>Checking server status…</h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              தயவு செய்து ஒரு விநாடி காத்திருக்கவும். Backend server online உள்ளதா என்று பார்க்கிறோம்.
            </p>
          </div>
        </div>
      );
    }
    if (!backendOnline) {
      return (
        <div style={{ backgroundColor: 'var(--bg-color)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '1.75rem 2.25rem', maxWidth: '560px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--primary-color)' }}>
              Server offline / app not running
            </h2>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Cloud backend தற்போது பதில் அளிக்கவில்லை. சில விநாடிகள் கழித்து மீண்டும் முயற்சி செய்யவும்.
            </p>
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Backend URL: <code>https://chitfund-backend-hk37.onrender.com</code>
            </p>
            <button
              type="button"
              style={{ marginTop: '0.75rem', width: 'auto' }}
              onClick={() => window.location.reload()}
            >
              மீண்டும் சரிபார்க்க (Refresh & Re‑check)
            </button>
          </div>
        </div>
      );
    }
    console.log("App: No user, server online, showing Login component");
    return (
      <div style={{ backgroundColor: 'var(--bg-color)', minHeight: '100vh' }}>
        <Login
          onLogin={handleLogin}
          systemSettings={systemSettings}
          trialActive={trialActive}
          trialRemainingDays={trialRemainingDays}
          trialExpiry={trialExpiryStr}
        />
      </div>
    );
  }

  console.log("App: User logged in, role:", user.role);
  const isDeveloper = user.role === 'developer';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <nav style={{ 
        backgroundColor: 'var(--card-bg)', 
        padding: '0.75rem 2rem', 
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--shadow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {systemSettings.logo_base64 && (
            <img src={systemSettings.logo_base64} alt="logo" style={{ height: '40px', width: 'auto' }} />
          )}
          <div>
            <div style={{ fontWeight: '800', fontSize: '1.25rem', color: 'var(--primary-color)', lineHeight: 1, textTransform: 'uppercase' }}>
              {systemSettings.app_name}
            </div>
            {systemSettings.company_name && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500', marginTop: '2px' }}>
                {systemSettings.company_name}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ color: 'var(--text-color)', fontSize: '0.9rem' }}>
            Welcome, <strong>{user.username}</strong> ({user.role})
          </span>
          {!isDeveloper && trialActive && !licenseActive && (
            <span
              title={trialExpiryStr ? `Trial ends on ${trialExpiryStr}` : 'Trial period active'}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: '#fef9c3',
                color: '#854d0e',
                border: '1px solid #facc15'
              }}
            >
              Trial: {trialRemainingDays || 1} நாள் மீதம்
              {trialExpiryStr ? ` (முடிவு ${trialExpiryStr})` : ''}
            </span>
          )}
          <span
            title={backendOnline ? 'Server Online' : 'Server Offline'}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: backendOnline ? '#d1fae5' : '#fee2e2',
              color: backendOnline ? '#065f46' : '#991b1b',
              border: `1px solid ${backendOnline ? '#10b981' : '#ef4444'}`
            }}
          >
            Server: {backendOnline ? 'Online' : 'Offline'}
          </span>
          <button 
            onClick={handleLogout}
            style={{ 
              width: 'auto', 
              padding: '0.5rem 1rem', 
              fontSize: '0.85rem',
              backgroundColor: '#ef4444' 
            }}
          >
            வெளியேறு (Logout)
          </button>
        </div>
      </nav>

      <main style={{ padding: '2rem', maxWidth: '100%', margin: '0 auto' }}>
        {isDeveloper && (
          <DeveloperDashboard user={user} systemSettings={systemSettings} />
        )}
        {!isDeveloper && !effectiveLicensed && (
          <div className="card" style={{ maxWidth: '640px', margin: '1rem auto', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--primary-color)' }}>
              App installation / license pending
            </h2>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              இந்த கணினியில் software install / license activation இன்னும் முடிக்கப்படவில்லை.
            </p>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              தயவு செய்து developer login மூலம் (Role: Developer) நிறுவல் மற்றும் license அமைப்பை முதலில் முடித்து விட்டு,
              அதற்கு பிறகு Admin / Staff / Agent / Customer login பயன்படுத்தவும்.
            </p>
          </div>
        )}
        {!isDeveloper && effectiveLicensed && user.role === 'admin' && (
          <AdminDashboard 
            user={user}
            onThemeChange={handleThemeChange} 
            systemSettings={systemSettings}
            onSettingsUpdate={(newSettings) => {
              const s = newSettings || {};
              setSystemSettings({
                app_name: s.app_name || systemSettings.app_name,
                company_name: s.company_name || systemSettings.company_name,
                company_address: s.company_address || systemSettings.company_address,
                company_phone: s.company_phone || systemSettings.company_phone,
                logo_base64: s.logo_base64 || systemSettings.logo_base64,
                commission_enabled: !!s.commission_enabled,
                commission_percent: Number(s.commission_percent ?? 0),
                auto_backup_enabled: !!s.auto_backup_enabled,
                auto_backup_frequency: s.auto_backup_frequency || 'daily',
                sms_provider: s.sms_provider || systemSettings.sms_provider || 'twilio',
                twilio_account_sid: s.twilio_account_sid || systemSettings.twilio_account_sid || null,
                twilio_auth_token: s.twilio_auth_token || systemSettings.twilio_auth_token || null,
                twilio_sms_from: s.twilio_sms_from || systemSettings.twilio_sms_from || null,
                twilio_whatsapp_from: s.twilio_whatsapp_from || systemSettings.twilio_whatsapp_from || null,
                payment_enabled: !!(s.payment_enabled ?? systemSettings.payment_enabled),
                payment_provider: s.payment_provider || systemSettings.payment_provider || 'razorpay',
                razorpay_key_id: s.razorpay_key_id || systemSettings.razorpay_key_id || null,
                razorpay_key_secret: s.razorpay_key_secret || systemSettings.razorpay_key_secret || null,
                razorpay_webhook_secret: s.razorpay_webhook_secret || systemSettings.razorpay_webhook_secret || null
              });
            }} 
          />
        )}
        {!isDeveloper && effectiveLicensed && user.role === 'staff' && (
          <StaffDashboard user={user} systemSettings={systemSettings} />
        )}
        {!isDeveloper && effectiveLicensed && user.role === 'agent' && (
          <AgentDashboard user={user} systemSettings={systemSettings} />
        )}
        {!isDeveloper && effectiveLicensed && user.role === 'customer' && (
          <CustomerDashboard user={user} systemSettings={systemSettings} />
        )}
      </main>
    </div>
  )
}

export default App
