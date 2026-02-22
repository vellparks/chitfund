import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function AgentDashboard({ user, systemSettings }) {
  const apiBases = ['https://chitfund-backend-hk37.onrender.com', 'http://127.0.0.1:9000', 'http://localhost:9000'];
  const apiGet = async (path) => {
    let lastErr;
    for (const base of apiBases) {
      try {
        return await axios.get(`${base}${path}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('GET failed');
  };
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [passwordVisibility, setPasswordVisibility] = useState({ old: false, new: false, confirm: false });
  const apiPost = async (path, data) => {
    let lastErr;
    for (const base of apiBases) {
      try {
        return await axios.post(`${base}${path}`, data);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('POST failed');
  };
  const [activeLoans, setActiveLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [collectionReports, setCollectionReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isClosing, setIsClosing] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  const exportToExcel = (data, fileName, title = "REPORT") => {
    const companyName = systemSettings?.company_name || 'Finance Manager';
    const companyAddress = systemSettings?.company_address || '';
    const companyPhone = systemSettings?.company_phone || '';
    
    const rows = [];
    rows.push([companyName.toUpperCase()]);
    if (companyAddress) {
      companyAddress.split('\n').forEach(line => rows.push([line]));
    }
    rows.push([`Phone: ${companyPhone}`]);
    rows.push([]);
    rows.push([title.toUpperCase()]);
    rows.push([`Generated on: ${formatDateTime(new Date())}`]);
    rows.push([]);

    let headers = [];
    let mapping = (item, sno) => [];

    if (fileName.includes('Active_Loans')) {
      headers = ["S.No", "ID", "Customer", "Phone", "Type", "Due", "Remaining"];
      mapping = (item, sno) => [
        sno,
        item.id,
        item.customer?.name || 'N/A',
        item.customer?.phone || 'N/A',
        item.loan_type,
        item.daily_due,
        item.balance_due
      ];
    } else if (fileName.includes('My_Collections')) {
      headers = ["S.No", "Date", "Customer", "Amount"];
      mapping = (item, sno) => [
        sno,
        formatDateTime(new Date(item.date)),
        item.customer_name,
        item.amount
      ];
    }

    rows.push(headers);
    data.forEach((item, idx) => {
      rows.push(mapping(item, idx + 1));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Auto-size columns
    const colWidths = headers.map(() => ({ wch: 15 }));
    colWidths[0] = { wch: 6 }; // S.No
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportToPDF = (data, title, fileName) => {
    try {
      const doc = new jsPDF();
      const companyName = systemSettings?.company_name || 'Finance Manager';
      const companyAddress = systemSettings?.company_address || '';
      const companyPhone = systemSettings?.company_phone || '';
      
      let headerY = 15;
      
      if (systemSettings?.logo_base64) {
        try {
          doc.addImage(systemSettings.logo_base64, 'PNG', 14, 10, 25, 25);
          doc.setFontSize(18);
          doc.setTextColor(40, 40, 40);
          doc.setFont(undefined, 'bold');
          doc.text(companyName.toUpperCase(), 45, headerY + 5);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(100);
          let addrY = headerY + 12;
          const addrLines = companyAddress.split(/[\n,]/).map(s => s.trim()).filter(s => s);
          addrLines.forEach((line, i) => { if (i < 3) { doc.text(line, 45, addrY); addrY += 4; } });
          doc.text(`Phone: ${companyPhone}`, 45, addrY);
          headerY = 45;
        } catch (e) { console.error(e); }
      } else {
        doc.setFontSize(22);
        doc.setTextColor(40, 40, 40);
        doc.setFont(undefined, 'bold');
        doc.text(companyName.toUpperCase(), 14, headerY + 5);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100);
        let addrY = headerY + 12;
        const addrLines = companyAddress.split(/[\n,]/).map(s => s.trim()).filter(s => s);
        addrLines.forEach((line, i) => { doc.text(line, 14, addrY); addrY += 5; });
        doc.text(`Phone: ${companyPhone}`, 14, addrY);
        headerY = addrY + 10;
      }

      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(14, headerY - 5, 196, headerY - 5);

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.setFont(undefined, 'bold');
      doc.text(title.toUpperCase(), 14, headerY);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(120);
      doc.text(`Date: ${formatDateTime(new Date())}`, 14, headerY + 6);

      let tableColumn = [];
      let tableRows = [];

      if (fileName.includes('Active_Loans')) {
        tableColumn = ["S.No", "ID", "Customer", "Type", "Due", "Balance"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.id,
          item.customer?.name || 'N/A',
          item.loan_type,
          item.daily_due,
          item.balance_due
        ]);
      } else if (fileName.includes('My_Collections')) {
        tableColumn = ["S.No", "Date", "Customer", "Amount"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          formatDateTime(new Date(item.date)),
          item.customer_name,
          item.amount
        ]);
      }

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: headerY + 15,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.1 },
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], halign: 'center' },
        margin: { left: 14, right: 14 },
        didDrawPage: (pageData) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`Page ${pageData.pageNumber}`, 196, doc.internal.pageSize.height - 10, { align: 'right' });
        }
      });

      doc.save(`${fileName}.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("PDF உருவாக்குவதில் பிழை ஏற்பட்டது: " + error.message);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchActiveLoans();
      fetchCollectionReports();
    }
  }, [user]);

  const fetchActiveLoans = async () => {
    try {
      const response = await apiGet(`/loans/agent/${user.id}`);
      setActiveLoans(response.data);
    } catch (error) {
      console.error('Error fetching active loans:', error);
    }
  };

  const fetchCollectionReports = async () => {
    if (!user?.id) return;
    setLoadingReports(true);
    try {
      const response = await apiGet(`/reports/collections?agent_id=${user.id}`);
      setCollectionReports(response.data);
    } catch (error) {
      console.error('Error fetching collection reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!selectedLoan || !paymentAmount) return;

    try {
      if (isClosing) {
        if (!window.confirm(`Are you sure you want to pay ₹${paymentAmount} and CLOSE this loan?\n(₹${paymentAmount} செலுத்தி இந்தக் கடனை முடிக்க விரும்புகிறீர்களா?)`)) {
          return;
        }
        await apiPost(`/loans/${selectedLoan.id}/close`);
        setMessage({ type: 'success', text: `Loan closed successfully for ${selectedLoan.customer.name}! (கடன் வெற்றிகரமாக முடிக்கப்பட்டது)` });
      } else {
        await apiPost(`/loans/${selectedLoan.id}/pay`, { amount: parseFloat(paymentAmount) });
        setMessage({ type: 'success', text: `Payment of ₹${paymentAmount} recorded for ${selectedLoan.customer.name}` });
      }
      
      setPaymentAmount('');
      setSelectedLoan(null);
      setIsClosing(false);
      fetchActiveLoans(); // Refresh data
      fetchCollectionReports(); // Refresh reports
    } catch (error) {
      setMessage({ type: 'error', text: 'பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும். (Error recording payment. Please try again.)' });
      console.error('Error recording payment:', error);
    }
  };

  const handleCloseLoan = async (loanId) => {
    try {
      const response = await apiGet(`/loans/${loanId}/balance`);
      const { balance } = response.data;
      
      const loan = activeLoans.find(l => l.id === loanId);
      setSelectedLoan(loan);
      setPaymentAmount(balance);
      setIsClosing(true);
      
      // Scroll to payment entry
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      setMessage({ 
        type: 'success', 
        text: `கடன் கணக்கை முடிக்க மீதமுள்ள தொகை ₹${balance} கணக்கிடப்பட்டுள்ளது. வசூல் பதிவு செய்து முடிக்கவும். (Remaining balance ₹${balance} calculated for closure. Please save payment to close.)` 
      });
    } catch (err) {
      console.error('Error fetching balance:', err);
      setMessage({ type: 'error', text: 'நிலுவைத் தொகையைக் கணக்கிடுவதில் தோல்வி. (Failed to calculate balance.)' });
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.new !== passwordData.confirm) {
      setPasswordMsg({ type: 'error', text: 'கடவுச்சொல் பொருந்தவில்லை (Passwords do not match)' });
      return;
    }
    try {
      if (!user || !user.id) {
        setPasswordMsg({ type: 'error', text: 'பயனர் விவரங்கள் காணப்படவில்லை (User details not found)' });
        return;
      }
      let lastErr, resp;
      for (const base of apiBases) {
        try {
          resp = await axios.post(`${base}/change-password`, null, {
            params: {
              user_id: user.id,
              old_password: passwordData.old,
              new_password: passwordData.new
            }
          });
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!resp) throw lastErr || new Error('Password change failed');
      setPasswordMsg({ type: 'success', text: 'கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது (Password updated successfully)' });
      setPasswordData({ old: '', new: '', confirm: '' });
      setTimeout(() => setShowChangePassword(false), 2000);
    } catch (error) {
      setPasswordMsg({ type: 'error', text: error.response?.data?.detail || 'கடவுச்சொல் மாற்றுவதில் தோல்வி' });
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1>Agent Collection Dashboard</h1>
        <button 
          onClick={() => setShowChangePassword(!showChangePassword)}
          style={{ width: 'auto', backgroundColor: '#f59e0b' }}
        >
          {showChangePassword ? 'Close Password' : 'Change Password'}
        </button>
      </div>
      
      {showChangePassword && (
        <div className="card" style={{ marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2.5rem', borderTop: '4px solid #f59e0b' }}>
          <h3 style={{ textAlign: 'center' }}>Change Password (கடவுச்சொல் மாற்றவும்)</h3>
          <form onSubmit={handlePasswordChange}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Old Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.old ? 'text' : 'password'} 
                  required 
                  value={passwordData.old}
                  onChange={(e) => setPasswordData({...passwordData, old: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, old: !v.old }))}
                  aria-label={passwordVisibility.old ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.old ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>New Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.new ? 'text' : 'password'} 
                  required 
                  value={passwordData.new}
                  onChange={(e) => setPasswordData({...passwordData, new: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, new: !v.new }))}
                  aria-label={passwordVisibility.new ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.new ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Confirm New Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.confirm ? 'text' : 'password'} 
                  required 
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, confirm: !v.confirm }))}
                  aria-label={passwordVisibility.confirm ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.confirm ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {passwordMsg.text && (
              <div style={{ 
                padding: '0.75rem', 
                marginBottom: '1rem', 
                backgroundColor: passwordMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: passwordMsg.type === 'success' ? '#166534' : '#991b1b',
                borderRadius: '8px',
                fontSize: '0.85rem',
                textAlign: 'center'
              }}>
                {passwordMsg.text}
              </div>
            )}
            <button type="submit">Update Password</button>
          </form>
        </div>
      )}
      
      {message.text && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1rem', 
          borderRadius: '8px',
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Active Loans (வசூலிக்க வேண்டியவை) - {(activeLoans || []).length}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="தேடு..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '150px', padding: '0.3rem', fontSize: '0.8rem' }}
              />
              <button 
                onClick={() => {
                  const filtered = (activeLoans || []).filter(loan => 
                    (loan.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (loan.loan_type || '').toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  exportToExcel(filtered, 'Active_Loans', 'ACTIVE LOANS REPORT');
                }}
                style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
              >
                Excel
              </button>
              <button 
                onClick={() => {
                  const filtered = (activeLoans || []).filter(loan => 
                    (loan.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (loan.loan_type || '').toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  exportToPDF(filtered, 'ACTIVE LOANS REPORT', 'Active_Loans');
                }}
                style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
              >
                PDF
              </button>
            </div>
          </div>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {(activeLoans || []).filter(loan => 
              (loan.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
              (loan.loan_type || '').toLowerCase().includes(searchTerm.toLowerCase())
            ).length === 0 ? (
              <p>No active loans found.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.5rem' }}>Due</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeLoans || []).filter(loan => 
                    (loan.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (loan.loan_type || '').toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((loan, idx) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isCollectedToday = (collectionReports || []).some(coll => 
                      coll.loan_id === loan.id && 
                      new Date(coll.date || 0).toISOString().split('T')[0] === today
                    );

                    return (
                      <tr key={loan.id || idx} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: isCollectedToday ? '#f0fdf4' : 'transparent' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div>
                              <strong>{loan.customer?.name}</strong><br/>
                              <small>{loan.loan_type}</small>
                            </div>
                            {isCollectedToday && (
                              <span style={{ 
                                backgroundColor: '#10b981', 
                                color: 'white', 
                                padding: '0.1rem 0.4rem', 
                                borderRadius: '10px', 
                                fontSize: '0.65rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}>
                                ✅ Collected
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>₹{(loan.daily_due || 0).toLocaleString()}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button 
                              onClick={() => {
                                setSelectedLoan(loan);
                                setPaymentAmount(loan.daily_due);
                                setIsClosing(false);
                              }}
                              style={{ 
                                padding: '0.3rem 0.6rem', 
                                fontSize: '0.8rem', 
                                width: 'auto',
                                backgroundColor: isCollectedToday ? '#059669' : 'var(--primary-color)'
                              }}
                            >
                              {isCollectedToday ? 'Collect Again' : 'Collect'}
                            </button>
                            <button 
                              onClick={() => window.open(`http://127.0.0.1:9000/loans/${loan.id}/sanction`)}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3b82f6', width: 'auto' }}
                              title="Download Sanction Letter"
                            >
                              PDF 📄
                            </button>
                            <button 
                              onClick={() => handleCloseLoan(loan.id)}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#ef4444', width: 'auto' }}
                              title="Close Loan (Advance Payment)"
                            >
                              Close 🏁
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <h2>{isClosing ? 'Loan Closure (கடன் கணக்கு முடித்தல்)' : 'Payment Entry (வசூல் பதிவு)'}</h2>
          {selectedLoan ? (
            <form onSubmit={handlePayment}>
              <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', marginBottom: '1rem' }}>
                <p><strong>Customer:</strong> {selectedLoan.customer.name}</p>
                <p><strong>Phone:</strong> {selectedLoan.customer.phone}</p>
                <p><strong>Loan Amount:</strong> ₹{selectedLoan.amount}</p>
                <p><strong>{isClosing ? 'Remaining Balance:' : 'Standard Due:'}</strong> ₹{paymentAmount}</p>
              </div>

              <div className="form-group">
                <label>{isClosing ? 'Final Settlement Amount (இறுதித் தொகை)' : 'Amount Collected (வசூலித்த தொகை)'}</label>
                <input 
                  type="number" 
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 100"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="submit" style={{ flex: 2, backgroundColor: isClosing ? '#ef4444' : 'var(--primary-color)' }}>
                  {isClosing ? 'Pay & Close 🏁' : 'Save Payment'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setSelectedLoan(null);
                    setIsClosing(false);
                  }}
                  style={{ flex: 1, backgroundColor: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
              Select a customer from the list to record payment.
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <h3 style={{ margin: 0 }}>My Collections (எனது வசூல் அறிக்கைகள்) - {(collectionReports || []).length}</h3>
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            alignItems: 'flex-end', 
            flexWrap: 'wrap' 
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>From (முதல்)</label>
              <input 
                type="date" 
                value={reportFilters.startDate}
                onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                onClick={(e) => e.target.showPicker && e.target.showPicker()}
                style={{ 
                  width: '180px', 
                  padding: '0.6rem', 
                  paddingRight: '2.5rem',
                  fontSize: '1rem', 
                  fontWeight: 'bold',
                  borderRadius: '8px', 
                  border: '3px solid #1e40af',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  cursor: 'pointer',
                  appearance: 'auto',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%231e40af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '20px'
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>To (வரை)</label>
              <input 
                type="date" 
                value={reportFilters.endDate}
                onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                onClick={(e) => e.target.showPicker && e.target.showPicker()}
                style={{ 
                  width: '180px', 
                  padding: '0.6rem', 
                  paddingRight: '2.5rem',
                  fontSize: '1rem', 
                  fontWeight: 'bold',
                  borderRadius: '8px', 
                  border: '3px solid #1e40af',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  cursor: 'pointer',
                  appearance: 'auto',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%231e40af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '20px'
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>Search (தேடு)</label>
              <input 
                type="text" 
                placeholder="வாடிக்கையாளர் பெயர்..." 
                value={reportSearchTerm}
                onChange={(e) => setReportSearchTerm(e.target.value)}
                style={{ width: '180px', padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button 
                onClick={() => {
                  const filtered = (collectionReports || []).filter(coll => {
                    const matchText = (coll.customer_name || '').toLowerCase().includes(reportSearchTerm.toLowerCase()) ||
                                     (coll.amount || '').toString().includes(reportSearchTerm);
                    const collDate = new Date(coll.date || 0).toISOString().split('T')[0];
                    const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                    const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                    return matchText && matchStart && matchEnd;
                  });
                  exportToExcel(filtered, 'My_Collections', 'MY COLLECTIONS REPORT');
                }}
                style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.45rem 0.8rem', fontSize: '0.8rem', borderRadius: '4px' }}
              >
                Excel 📊
              </button>
              <button 
                onClick={() => {
                  const filtered = (collectionReports || []).filter(coll => {
                    const matchText = (coll.customer_name || '').toLowerCase().includes(reportSearchTerm.toLowerCase()) ||
                                     (coll.amount || '').toString().includes(reportSearchTerm);
                    const collDate = new Date(coll.date || 0).toISOString().split('T')[0];
                    const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                    const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                    return matchText && matchStart && matchEnd;
                  });
                  exportToPDF(filtered, 'MY COLLECTIONS REPORT', 'My_Collections');
                }}
                style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.45rem 0.8rem', fontSize: '0.8rem', borderRadius: '4px' }}
              >
                PDF 📄
              </button>
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Date</th>
                <th style={{ padding: '0.75rem' }}>Customer</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '0.75rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingReports ? (
                <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
              ) : (collectionReports || []).filter(coll => {
                const matchText = (coll.customer_name || '').toLowerCase().includes(reportSearchTerm.toLowerCase()) ||
                                 (coll.amount || '').toString().includes(reportSearchTerm);
                const collDate = new Date(coll.date || 0).toISOString().split('T')[0];
                const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                return matchText && matchStart && matchEnd;
              }).length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No collections found.</td></tr>
              ) : (
                (collectionReports || []).filter(coll => {
                  const matchText = (coll.customer_name || '').toLowerCase().includes(reportSearchTerm.toLowerCase()) ||
                                   (coll.amount || '').toString().includes(reportSearchTerm);
                  const collDate = new Date(coll.date || 0).toISOString().split('T')[0];
                  const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                  const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                  return matchText && matchStart && matchEnd;
                }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map((coll, idx) => (
                  <tr key={coll.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem' }}>{new Date(coll.date || 0).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem' }}>{coll.customer_name}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(coll.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <button 
                        onClick={() => window.open(`http://localhost:9000/transactions/${coll.id}/receipt`)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#10b981', width: 'auto' }}
                        title="Download Receipt"
                      >
                        Receipt 🧾
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AgentDashboard;
