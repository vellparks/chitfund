import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Login({ onLogin, systemSettings, trialActive, trialRemainingDays, trialExpiry }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [error, setError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const apiBases = ['http://127.0.0.1:9000', 'http://localhost:9000'];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F9') {
        setDevMode(prev => {
          const next = !prev;
          if (next) {
            setRole('developer');
          } else {
            setRole('admin');
          }
          setError('');
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      console.log(`Attempting login: username=${username}, role=${role}`);
      let lastErr;
      let response;
      for (const base of apiBases) {
        try {
          response = await axios.post(`${base}/login?username=${username}&role=${role}&password=${password}`);
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!response) throw lastErr || new Error('Login failed');
      console.log('Login response:', response.data);
      onLogin(response.data);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.detail || 'Login failed. Please check credentials.');
    }
  };

  return (
    <div className="login-wrapper" style={{ 
       background: 'var(--bg-color, #f3f4f6)', 
       display: 'flex', 
       alignItems: 'center', 
       justifyContent: 'center',
       minHeight: '100vh',
       width: '100vw',
       margin: 0,
       padding: '1rem'
     }}>
      <div className="login-card" style={{ 
        backgroundColor: 'var(--card-bg, #ffffff)', 
        color: 'var(--text-color, #1f2937)',
        border: '1px solid var(--border-color, #e5e7eb)',
        padding: '2.5rem',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {systemSettings?.logo_base64 && (
            <img 
              src={systemSettings.logo_base64} 
              alt="Logo" 
              style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '1rem' }} 
            />
          )}
          <h1 style={{ 
            color: 'var(--primary-color, #2563eb)', 
            marginBottom: '0.25rem', 
            fontSize: '2rem', 
            fontWeight: '800',
            letterSpacing: '-0.025em',
            textTransform: 'uppercase'
          }}>
            {systemSettings?.app_name || 'Finance Manager'}
          </h1>
          {systemSettings?.company_name && (
            <p style={{ 
              color: 'var(--text-muted, #6b7280)', 
              fontSize: '0.95rem',
              fontWeight: '500',
              marginTop: '0'
            }}>
              {systemSettings.company_name}
            </p>
          )}
          {!systemSettings?.company_name && (
            <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.9rem' }}>நிதியியல் மேலாண்மை மென்பொருள்</p>
          )}
          {trialActive && !systemSettings?.license_active && (
            <p
              style={{
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                color: '#854d0e',
                backgroundColor: '#fef9c3',
                borderRadius: '999px',
                padding: '0.35rem 0.75rem',
                display: 'inline-block',
                border: '1px solid #facc15'
              }}
            >
              Trial mode: {trialRemainingDays || 1} நாள் மீதம்
              {trialExpiry ? ` (முடிவு ${trialExpiry})` : ''}
            </p>
          )}
          {devMode && (
            <p
              style={{
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#1d4ed8'
              }}
            >
              Developer login mode (Role: Developer)
            </p>
          )}
        </div>
        
        <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--primary-color, #2563eb)' }}>
          உள்நுழைவு (Login)
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label>{role === 'customer' ? 'Phone Number (தொலைபேசி எண்)' : 'Username (பயனர் பெயர்)'}</label>
            <input
              type="text"
              placeholder={role === 'customer' ? "Enter phone number" : "Enter username"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {role !== 'customer' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Password (கடவுச்சொல்)</label>
              <div className="password-wrapper">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  {passwordVisible ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}
          
          {!devMode && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Role (பதவி)</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Admin (நிர்வாகி)</option>
                <option value="staff">Staff (ஊழியர்)</option>
                <option value="agent">வசூல் முகவர் (Collection Agent)</option>
                <option value="customer">Customer (வாடிக்கையாளர்)</option>
              </select>
            </div>
          )}
          {devMode && (
            <div style={{ marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              இது சிறப்பு developer login. Role: <strong>Developer</strong> என நிரந்தரமாக இருக்கும்.
            </div>
          )}

          {error && (
            <div style={{ 
              color: 'var(--error-color)', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid var(--error-color)',
              padding: '0.75rem', 
              borderRadius: '8px', 
              marginBottom: '1rem',
              fontSize: '0.875rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem', textAlign: 'center', fontSize: '0.8rem' }}>
            {devMode && (
              <button
                type="button"
                onClick={() => {
                  setDevMode(false);
                  setRole('admin');
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6b7280',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                சாதாரண பயனர் login க்கு திரும்ப
              </button>
            )}
          </div>

          <button type="submit" style={{ marginTop: '1rem' }}>
            உள்நுழைக (Login Now)
          </button>
        </form>
        
        <p style={{ 
          textAlign: 'center', 
          marginTop: '2rem', 
          fontSize: '0.75rem', 
          color: 'var(--text-muted)' 
        }}>
          © 2026 Finance Management System. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default Login;
