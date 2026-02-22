import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBase } from './backendConfig';

function LoanForm({ isStaff = false, onComplete }) {
  const [customers, setCustomers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [formData, setFormData] = useState({
    customer_id: '',
    agent_id: '',
    loan_type: 'daily',
    amount: '',
    deduction: '',
    daily_due: '',
    total_days: '100',
    notify_sms: true,
    notify_whatsapp: true
  });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [receipt, setReceipt] = useState(null);

  const apiGet = async (path) => {
    const base = getApiBase();
    return axios.get(`${base}${path}`);
  };
  const apiPost = async (path, data) => {
    const base = getApiBase();
    return axios.post(`${base}${path}`, data);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      let errorParts = [];

      let custRes = null;
      let agentRes = null;
      let setRes = null;

      try {
        custRes = await apiGet('/customers/');
      } catch (err) {
        console.error('Error loading customers for loan form:', err);
        const detail = err?.response?.data?.detail || err.message || 'unknown error';
        errorParts.push(`customers (${detail})`);
      }

      try {
        agentRes = await apiGet('/users/agents');
      } catch (err) {
        console.error('Error loading agents for loan form:', err);
        const detail = err?.response?.data?.detail || err.message || 'unknown error';
        errorParts.push(`agents (${detail})`);
      }

      try {
        setRes = await apiGet('/settings');
      } catch (err) {
        console.error('Error loading settings for loan form:', err);
        const detail = err?.response?.data?.detail || err.message || 'unknown error';
        errorParts.push(`settings (${detail})`);
      }

      if (custRes && Array.isArray(custRes.data)) {
        setCustomers(custRes.data);
      }
      if (agentRes && Array.isArray(agentRes.data)) {
        setAgents(agentRes.data);
      }
      if (setRes && setRes.data) {
        setSystemSettings(setRes.data);
      }

      if (errorParts.length > 0) {
        setMessage({
          type: 'error',
          text: 'Error loading data: ' + errorParts.join('; ')
        });
      }

      setLoading(false);
    };
    fetchData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newFormData = { 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    };

    // Auto-calculate daily_due if amount or total_days changes
    if (name === 'amount' || name === 'total_days') {
      const amt = parseFloat(name === 'amount' ? value : formData.amount);
      const days = parseInt(name === 'total_days' ? value : formData.total_days);
      if (amt > 0 && days > 0) {
        newFormData.daily_due = Math.round(amt / days).toString();
      }
    }

    // Default periods based on loan type
    if (name === 'loan_type') {
      if (value === 'daily') newFormData.total_days = '100';
      else if (value === 'weekly') newFormData.total_days = '20';
      else if (value === 'monthly') newFormData.total_days = '10';
      
      const amt = parseFloat(formData.amount);
      const days = parseInt(newFormData.total_days);
      if (amt > 0 && days > 0) {
        newFormData.daily_due = Math.round(amt / days).toString();
      }
    }

    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        customer_id: parseInt(formData.customer_id),
        agent_id: formData.agent_id ? parseInt(formData.agent_id) : null,
        amount: parseFloat(formData.amount),
        deduction: parseFloat(formData.deduction || 0),
        daily_due: parseFloat(formData.daily_due),
        total_days: parseInt(formData.total_days)
      };
      
      const response = await apiPost('/loans/', payload);
      const customer = customers.find(c => c.id === parseInt(formData.customer_id));
      const disbursedAmount = parseFloat(formData.amount) - parseFloat(formData.deduction || 0);

      setReceipt({
        loan: response.data,
        customer: customer,
        disbursed: disbursedAmount,
        isStaff: isStaff
      });

      setMessage({ type: 'success', text: isStaff ? 'Loan request submitted for Admin approval!' : 'Loan created and approved successfully!' });
      setFormData({
        customer_id: '',
        agent_id: '',
        loan_type: 'daily',
        amount: '',
        deduction: '',
        daily_due: '',
        total_days: '100',
        notify_sms: true,
        notify_whatsapp: true
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error creating loan. Please check inputs.' });
      console.error('Error creating loan:', error);
    }
  };

  if (receipt) {
    return (
      <div className="card" style={{ 
        maxWidth: '850px', 
        margin: '0.5rem auto', 
        padding: '1.5rem', 
        fontFamily: "'Times New Roman', Times, serif",
        backgroundColor: '#fff',
        boxShadow: '0 0 20px rgba(0,0,0,0.1)',
        color: '#000',
        position: 'relative',
        border: '1px solid #eee'
      }}>
        {/* Letterhead Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '1.5rem', 
          marginBottom: '1rem', 
          borderBottom: '3px solid #000', 
          paddingBottom: '0.75rem' 
        }}>
          {systemSettings?.logo_base64 && (
            <img src={systemSettings.logo_base64} alt="Logo" style={{ height: '80px' }} />
          )}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 0.1rem 0', fontSize: '2rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {systemSettings?.company_name || 'SETLIVE PRIVATE LIMITED'}
            </h1>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600', maxWidth: '600px', lineHeight: '1.2' }}>
              {systemSettings?.company_address ? systemSettings.company_address.replace(/\n/g, ' - ') : '32/3, MANTHAI VINAYAGAR KOVIL STREET, VASUDEVANALLUR - 627758'}
            </p>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: '500' }}>
              Phone: {systemSettings?.company_phone || '+91 80724 05108'} | Email: contact@setlive.com
            </p>
          </div>
        </div>

        {/* Title and Date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', textDecoration: 'underline' }}>
              {receipt.isStaff ? 'கடன் விண்ணப்பம் (Loan Request)' : 'கடன் ரசீது (Loan Receipt)'}
            </h2>
            {receipt.isStaff && (
              <p style={{ margin: '0.1rem 0 0 0', color: '#f59e0b', fontWeight: 'bold', fontSize: '0.85rem' }}>
                *** PENDING ADMIN APPROVAL ***
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            <p style={{ margin: 0 }}><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
            <p style={{ margin: 0 }}><strong>Time:</strong> {new Date().toLocaleTimeString()}</p>
            <p style={{ margin: 0 }}><strong>ID:</strong> #{receipt.loan?.id || 'NEW'}</p>
          </div>
        </div>

        {/* Customer Details Section */}
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem', border: '1px solid #000', borderRadius: '8px' }}>
          <h3 style={{ margin: '-1.5rem 0 0.5rem 0', backgroundColor: '#fff', display: 'inline-block', padding: '0 8px', fontSize: '1rem' }}>
            வாடிக்கையாளர் விவரம் (Customer Details)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}><strong>Name:</strong> {receipt.customer?.name || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong>Phone:</strong> {receipt.customer?.phone || 'N/A'}</p>
            <p style={{ margin: 0, gridColumn: 'span 2' }}><strong>Address:</strong> {receipt.customer?.address || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong>Aadhaar:</strong> {receipt.customer?.aadhaar_no || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong>PAN:</strong> {receipt.customer?.pan_no || 'N/A'}</p>
          </div>
        </div>

        {/* Loan Details Table */}
        <div style={{ marginBottom: '1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: '0.6rem', border: '1px solid #000', textAlign: 'left' }}>விளக்கம் (Description)</th>
                <th style={{ padding: '0.6rem', border: '1px solid #000', textAlign: 'right' }}>தொகை (Amount)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '0.6rem', border: '1px solid #000' }}>மொத்த கடன் தொகை (Total Loan Amount)</td>
                <td style={{ padding: '0.6rem', border: '1px solid #000', textAlign: 'right' }}>₹ {receipt.loan?.amount?.toLocaleString() || '0'}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.6rem', border: '1px solid #000' }}>பிடித்தம் (Upfront Deduction)</td>
                <td style={{ padding: '0.6rem', border: '1px solid #000', textAlign: 'right', color: '#ef4444' }}>- ₹ {receipt.loan?.deduction?.toLocaleString() || '0'}</td>
              </tr>
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f9fafb', fontSize: '1.05rem' }}>
                <td style={{ padding: '0.6rem', border: '1px solid #000' }}>கைமாற்று தொகை (Net Disbursed Amount)</td>
                <td style={{ padding: '0.6rem', border: '1px solid #000', textAlign: 'right' }}>₹ {receipt.disbursed.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Repayment Schedule */}
        <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>தவணை முறை (Type)</p>
            <p style={{ margin: '0.1rem 0 0 0', fontWeight: 'bold' }}>
              {receipt.loan.loan_type === 'daily' ? 'தினசரி (Daily)' : receipt.loan.loan_type === 'weekly' ? 'வாராந்திர (Weekly)' : 'மாதந்திர (Monthly)'}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>தவணை தொகை (Due)</p>
            <p style={{ margin: '0.1rem 0 0 0', fontWeight: 'bold' }}>₹ {receipt.loan?.daily_due?.toLocaleString() || '0'}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>மொத்த தவணைகள் (Total)</p>
            <p style={{ margin: '0.1rem 0 0 0', fontWeight: 'bold' }}>{receipt.loan.total_days} Periods</p>
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
          <div style={{ textAlign: 'center', width: '170px' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '0.3rem', fontSize: '0.85rem' }}>
              <strong>Customer Signature</strong>
            </div>
          </div>
          <div style={{ textAlign: 'center', width: '170px' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '0.3rem', fontSize: '0.85rem' }}>
              <strong>Manager / Admin</strong>
            </div>
          </div>
        </div>

        {/* Action Buttons (Hidden during print) */}
        <div className="no-print" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button onClick={() => window.print()} style={{ flex: 1, backgroundColor: '#3b82f6', color: '#fff', padding: '0.7rem', borderRadius: '8px', fontWeight: 'bold' }}>
            🖨️ Print Document
          </button>
          <button 
            onClick={() => {
              setReceipt(null);
              if (onComplete) onComplete();
            }} 
            style={{ flex: 1, backgroundColor: '#64748b', color: '#fff', padding: '0.7rem', borderRadius: '8px', fontWeight: 'bold' }}
          >
            {isStaff ? 'Close Request' : 'Done & Close'}
          </button>
        </div>
        
        <style>
          {`
            @media print {
              @page { 
                margin: 2mm 5mm; 
                size: auto;
              }
              body { margin: 0; padding: 0; }
              body * { visibility: hidden; }
              .card, .card * { visibility: visible; }
              .card { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%; 
                box-shadow: none !important; 
                border: none !important; 
                padding: 0 !important; 
                margin: 0 !important;
              }
              .no-print { display: none !important; }
              header, footer { display: none !important; }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderTop: `4px solid var(--primary-color)` }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Create New Loan (புதிய கடன் வழங்கல்)</h2>
      {message.text && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1.5rem', 
          borderRadius: '8px',
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          textAlign: 'center',
          fontSize: '0.9rem'
        }}>
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div>
            <label>Select Customer (வாடிக்கையாளர்)</label>
            <select 
              name="customer_id" 
              value={formData.customer_id} 
              onChange={handleInputChange}
              required
            >
              <option value="">{loading ? '-- Loading Customers... --' : '-- Choose Customer --'}</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
            {!loading && customers.length === 0 && (
              <small style={{ color: '#ef4444' }}>No customers found. (வாடிக்கையாளர்கள் இல்லை)</small>
            )}
          </div>
          <div>
            <label>வசூல் முகவர் (Collection Agent)</label>
            <select 
              name="agent_id" 
              value={formData.agent_id} 
              onChange={handleInputChange}
              required
              disabled={loading}
            >
              <option value="">{loading ? '-- Loading Agents... --' : '-- Choose Agent --'}</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.full_name || a.username}</option>
              ))}
            </select>
            {!loading && agents.length === 0 && (
              <small style={{ color: '#ef4444' }}>No agents found. (ஏஜெண்டுகள் இல்லை)</small>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label>Loan Type (கடன் வகை)</label>
          <select 
            name="loan_type" 
            value={formData.loan_type} 
            onChange={handleInputChange}
          >
            <option value="daily">Daily Collection (தண்டல்)</option>
            <option value="weekly">Weekly Collection (வாரம்)</option>
            <option value="monthly">Monthly Collection (மாதம்)</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div>
            <label>Loan Amount (கடன் தொகை ₹)</label>
            <input 
              type="number" 
              name="amount" 
              value={formData.amount} 
              onChange={handleInputChange} 
              placeholder="e.g. 10000"
              required 
            />
          </div>
          <div>
            <label>Deduction (பிடித்தம் ₹)</label>
            <input 
              type="number" 
              name="deduction" 
              value={formData.deduction} 
              onChange={handleInputChange} 
              placeholder="e.g. 1500"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div>
            <label>Due Amount (தவணை ₹)</label>
            <input 
              type="number" 
              name="daily_due" 
              value={formData.daily_due} 
              onChange={handleInputChange} 
              placeholder="e.g. 100"
              required 
            />
          </div>
          <div>
            <label>Total Periods (தவணைகள்)</label>
            <input 
              type="number" 
              name="total_days" 
              value={formData.total_days} 
              onChange={handleInputChange} 
              placeholder="e.g. 100"
              required 
            />
          </div>
        </div>

        <div style={{ 
          padding: '1.25rem', 
          backgroundColor: '#f8fafc', 
          borderRadius: '10px', 
          marginBottom: '1.5rem',
          border: '1px dashed #cbd5e1',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--primary-color)' }}>
            Disbursed Amount: ₹ {parseFloat(formData.amount || 0) - parseFloat(formData.deduction || 0)}
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>வாடிக்கையாளருக்கு வழங்கப்படும் தொகை</p>
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-around', 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#f8fafc', 
          borderRadius: '10px' 
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input 
              type="checkbox" 
              name="notify_sms" 
              checked={formData.notify_sms} 
              onChange={handleInputChange} 
              style={{ width: 'auto', marginTop: 0 }}
            />
            SMS Notify
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input 
              type="checkbox" 
              name="notify_whatsapp" 
              checked={formData.notify_whatsapp} 
              onChange={handleInputChange} 
              style={{ width: 'auto', marginTop: 0 }}
            />
            WhatsApp Notify
          </label>
        </div>

        <button type="submit" style={{ padding: '1rem', width: '100%', fontWeight: 'bold' }}>
          {isStaff ? '🚀 Submit Loan Request' : '✅ Approve & Disburse Loan'}
        </button>
      </form>
    </div>
  );
}

export default LoanForm;
