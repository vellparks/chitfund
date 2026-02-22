import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBase } from './backendConfig';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function CustomerDashboard({ user, systemSettings }) {
  const apiGet = async (path) => {
    const base = getApiBase();
    return axios.get(`${base}${path}`);
  };
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const customerId = user?.id || 1;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return dateString;
    }
  };

  const exportToExcel = (data, fileName, title) => {
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
    if (fileName === 'My_Loans') {
      headers = ['S.No', 'Loan ID', 'Amount', 'Type', 'Daily Due', 'Status', 'Date'];
      rows.push(headers);
      data.forEach((item, index) => {
        rows.push([
          index + 1,
          item.id,
          item.amount,
          item.loan_type,
          item.daily_due,
          item.status,
          formatDate(item.created_at)
        ]);
      });
    } else if (fileName === 'Payment_History') {
      headers = ['S.No', 'Date', 'Amount', 'Status'];
      rows.push(headers);
      data.forEach((item, index) => {
        rows.push([
          index + 1,
          formatDate(item.date),
          item.amount,
          'Paid'
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Auto-size columns
    const colWidths = headers.map(() => ({ wch: 15 }));
    colWidths[0] = { wch: 6 }; // S.No
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportToPDF = (data, fileName, title) => {
    try {
      const doc = new jsPDF();
      const companyName = systemSettings?.company_name || 'Finance Manager';
      const companyAddress = systemSettings?.company_address || '';
      const companyPhone = systemSettings?.company_phone || '';

      let headerY = 15;
      doc.setFontSize(18);
      doc.setTextColor(40, 40, 40);
      doc.setFont(undefined, 'bold');
      doc.text(companyName.toUpperCase(), 14, headerY + 5);
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100);
      let addrY = headerY + 12;
      const addrLines = companyAddress.split(/[\n,]/).map(s => s.trim()).filter(s => s);
      addrLines.forEach((line, i) => { doc.text(line, 14, addrY); addrY += 5; });
      doc.text(`Phone: ${companyPhone}`, 14, addrY);
      headerY = addrY + 10;

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

      let headers = [];
      let tableData = [];

      if (fileName === 'My_Loans') {
        headers = [['S.No', 'Loan ID', 'Amount', 'Type', 'Due', 'Status', 'Date']];
        tableData = data.map((item, index) => [
          index + 1,
          item.id,
          item.amount,
          item.loan_type,
          item.daily_due,
          item.status,
          formatDate(item.created_at)
        ]);
      } else if (fileName === 'Payment_History') {
        headers = [['S.No', 'Date', 'Amount', 'Status']];
        tableData = data.map((item, index) => [
          index + 1,
          formatDate(item.date),
          item.amount,
          'Paid'
        ]);
      }

      doc.autoTable({
        head: headers,
        body: tableData,
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
    const fetchLoans = async () => {
      try {
        const response = await apiGet(`/customers/me/loans?customer_id=${customerId}`);
        setLoans(response.data);
        if (response.data.length > 0) {
          setSelectedLoan(response.data[0]);
        }
      } catch (error) {
        console.error('Error fetching loans:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLoans();
  }, [customerId]);

  useEffect(() => {
    if (selectedLoan) {
      const fetchTransactions = async () => {
        try {
          const response = await apiGet(`/loans/${selectedLoan.id}/transactions`);
          setTransactions(response.data);
        } catch (error) {
          console.error('Error fetching transactions:', error);
        }
      };
      fetchTransactions();
    }
  }, [selectedLoan]);

  if (loading) return <div className="container">Loading...</div>;

  const calculatePaidAmount = (txs) => txs.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="container">
      <h1>My Loan Dashboard (எனது கடன் விவரங்கள்)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>My Loans</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => exportToExcel(loans || [], 'My_Loans', 'MY LOANS REPORT')}
                style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                Excel
              </button>
              <button 
                onClick={() => exportToPDF(loans || [], 'My_Loans', 'MY LOANS REPORT')}
                style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                PDF
              </button>
            </div>
          </div>
          {(loans || []).length === 0 ? (
            <p>No active loans found.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {(loans || []).map((loan, idx) => (
                <li 
                  key={loan.id || idx} 
                  onClick={() => setSelectedLoan(loan)}
                  style={{ 
                    padding: '1rem', 
                    marginBottom: '0.5rem', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    backgroundColor: selectedLoan?.id === loan.id ? 'var(--primary-color)' : 'var(--bg-color)',
                    color: selectedLoan?.id === loan.id ? 'white' : 'inherit',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <strong>₹ {(loan.amount || 0).toLocaleString()}</strong> - {loan.loan_type}
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>ID: {loan.id} | Status: {loan.status}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedLoan && (
          <div>
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2>Loan Summary</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
                  <small>Total Amount</small>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>₹ {(selectedLoan.amount || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
                  <small>Paid Amount</small>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#065f46' }}>₹ {calculatePaidAmount(transactions || []).toLocaleString()}</div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '8px' }}>
                  <small>Balance</small>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#991b1b' }}>₹ {((selectedLoan.amount || 0) - calculatePaidAmount(transactions || [])).toLocaleString()}</div>
                </div>
              </div>
              
              <div style={{ marginTop: '1.5rem' }}>
                <p><strong>Next Due:</strong> ₹ {(selectedLoan.daily_due || 0).toLocaleString()} ({selectedLoan.loan_type})</p>
                <div style={{ width: '100%', backgroundColor: '#eee', borderRadius: '10px', height: '10px', marginTop: '0.5rem' }}>
                  <div style={{ 
                    width: `${(calculatePaidAmount(transactions || []) / (selectedLoan.amount || 1)) * 100}%`, 
                    backgroundColor: 'var(--primary-color)', 
                    height: '100%', 
                    borderRadius: '10px' 
                  }}></div>
                </div>
                <small>{Math.round((calculatePaidAmount(transactions || []) / (selectedLoan.amount || 1)) * 100)}% Completed</small>
              </div>

              {(selectedLoan.status === 'active' || selectedLoan.status === 'closed') && (
                <button 
                  onClick={() => {
                    const base = getApiBase();
                    window.open(`${base}/loans/${selectedLoan.id}/sanction`);
                  }}
                  className="btn-primary"
                  style={{ marginTop: '1.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  Download Sanction Letter (அனுமதி கடிதம் பதிவிறக்கவும்) 📄
                </button>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Payment History (வசூல் வரலாறு)</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => exportToExcel(transactions || [], 'Payment_History', `PAYMENT HISTORY - LOAN ID: ${selectedLoan.id}`)}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel
                  </button>
                  <button 
                    onClick={() => exportToPDF(transactions || [], 'Payment_History', `PAYMENT HISTORY - LOAN ID: ${selectedLoan.id}`)}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF
                  </button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem' }}>S.No</th>
                    <th style={{ padding: '0.75rem' }}>Date</th>
                    <th style={{ padding: '0.75rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(transactions || []).map((tx, index) => (
                    <tr key={tx.id || index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{index + 1}</td>
                      <td style={{ padding: '0.75rem' }}>{formatDate(tx.date)}</td>
                      <td style={{ padding: '0.75rem' }}>₹ {(tx.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem' }}><span style={{ color: '#10b981' }}>● Paid</span></td>
                      <td style={{ padding: '0.75rem' }}>
                        <button 
                          onClick={() => {
                            const base = getApiBase();
                            window.open(`${base}/transactions/${tx.id}/receipt`);
                          }}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#10b981', width: 'auto' }}
                          title="Download Receipt"
                        >
                          Receipt 🧾
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(transactions || []).length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No payments recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerDashboard;
