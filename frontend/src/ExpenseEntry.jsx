import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBase } from './backendConfig';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function ExpenseEntry({ user: propUser, userRole, systemSettings }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    description: '',
    customDescription: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [msg, setMsg] = useState({ type: '', text: '' });

  const apiGet = async (path) => {
    const base = getApiBase();
    return axios.get(`${base}${path}`);
  };
  const apiPost = async (path, data) => {
    const base = getApiBase();
    return axios.post(`${base}${path}`, data);
  };
  const apiDelete = async (path) => {
    const base = getApiBase();
    return axios.delete(`${base}${path}`);
  };

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

    const headers = ["S.No", "Date", "Description", "Amount"];
    const mapping = (item, sno) => [
      sno,
      formatDate(item.date),
      item.description,
      item.amount
    ];

    rows.push(headers);
    data.forEach((item, idx) => {
      rows.push(mapping(item, idx + 1));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = [{ wch: 6 }, { wch: 15 }, { wch: 35 }, { wch: 15 }];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportToPDF = (data, title, fileName) => {
    try {
      if (!data || data.length === 0) {
        alert("தரவுகள் ஏதுமில்லை (No data available to export)");
        return;
      }

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
          addrLines.forEach((line, i) => {
            if (i < 3) {
              doc.text(line, 45, addrY);
              addrY += 4;
            }
          });
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
        addrLines.forEach((line, i) => {
          doc.text(line, 14, addrY);
          addrY += 5;
        });
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
      
      const tableColumn = ["S.No", "Date", "Description", "Amount"];
      const tableRows = data.map((item, idx) => [
        idx + 1,
        formatDate(item.date),
        item.description,
        item.amount
      ]);

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

  const commonExpenses = [
    'Salary (சம்பளம்)',
    'Rent (வாடகை)',
    'Electricity (மின்சாரம்)',
    'Tea/Coffee (டீ/காபி)',
    'Stationery (பேப்பர்/பேனா)',
    'Travel (பயணம்)',
    'Petrol Allowance (பெட்ரோல் படி)',
    'Other (மற்றவை)'
  ];

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await apiGet('/expenses');
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let user = propUser;
      
      if (!user) {
        const userStr = localStorage.getItem('user');
        if (!userStr || userStr === 'undefined') {
          throw new Error('பயனர் விவரங்கள் காணப்படவில்லை. மீண்டும் லாகின் செய்யவும். (User session not found. Please login again.)');
        }
        
        try {
          user = JSON.parse(userStr);
        } catch (e) {
          throw new Error('பயனர் விவரங்களை வாசிப்பதில் பிழை. (Error parsing user data.)');
        }
      }

      if (!user || !user.id) {
        throw new Error('பயனர் ஐடி காணப்படவில்லை. (User ID not found.)');
      }

      const amountValue = parseFloat(formData.amount);
      if (isNaN(amountValue)) {
        throw new Error('செல்லுபடியாகும் தொகையை உள்ளிடவும். (Please enter a valid amount.)');
      }

      const finalDescription = formData.description.includes('Other') 
        ? formData.customDescription 
        : formData.description;
        
      if (!finalDescription) {
        throw new Error('விவரத்தை உள்ளிடவும். (Please enter a description.)');
      }

      console.log('Sending expense data:', {
        description: finalDescription,
        amount: amountValue,
        date: formData.date,
        created_by: user.id
      });

      let formattedDate = formData.date;
      // Ensure date is in YYYY-MM-DD format
      if (formattedDate && (formattedDate.includes('/') || formattedDate.includes('-'))) {
        const separator = formattedDate.includes('/') ? '/' : '-';
        const parts = formattedDate.split(separator);
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY/MM/DD or YYYY-MM-DD
            formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else if (parts[2].length === 4) { // DD/MM/YYYY or DD-MM-YYYY
            formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }

      const response = await apiPost('/expenses', {
        description: finalDescription,
        amount: amountValue,
        date: formattedDate,
        created_by: user.id
      });
      setMsg({ type: 'success', text: 'செலவு வெற்றிகரமாக சேர்க்கப்பட்டது (Expense added successfully)' });
      setFormData({
        description: '',
        customDescription: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);
      fetchExpenses();
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Full error object:', error);
      let errorDetail = 'Error adding expense';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorDetail = error.response.data.detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join(', ');
        } else {
          errorDetail = error.response.data.detail;
        }
      } else if (error.message) {
        errorDetail = error.message;
      }
      setMsg({ type: 'error', text: 'தோல்வி: ' + errorDetail });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('இந்த செலவை நீக்க விரும்புகிறீர்களா? (Delete this expense?)')) return;
    try {
      await apiDelete(`/expenses/${id}`);
      fetchExpenses();
    } catch (error) {
      alert('Error deleting expense');
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>Expense Entry (செலவினங்கள்) - {(expenses || []).length}</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="தேடு..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
          />
          <button 
            onClick={() => {
              const filtered = (expenses || []).filter(exp => 
                (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (exp.amount || '').toString().includes(searchTerm)
              );
              exportToExcel(filtered, 'Expense_Report', 'EXPENSE REPORT');
            }}
            style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          >
            Excel 📊
          </button>
          <button 
            onClick={() => {
              const filtered = (expenses || []).filter(exp => 
                (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (exp.amount || '').toString().includes(searchTerm)
              );
              exportToPDF(filtered, 'EXPENSE REPORT', 'Expense_Report');
            }}
            style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          >
            PDF 📄
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            style={{ width: 'auto', padding: '0.6rem 1.2rem' }}
          >
            {showForm ? 'Cancel' : '+ Add Expense'}
          </button>
        </div>
      </div>

      {msg.text && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1rem', 
          borderRadius: '8px',
          backgroundColor: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ 
          marginBottom: '2rem', 
          padding: '1.5rem', 
          backgroundColor: '#f8fafc', 
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label>Description (விவரம்)</label>
              <select 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                required
                style={{ width: '100%' }}
              >
                <option value="">Select Category</option>
                {commonExpenses.map(exp => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>
              {formData.description.includes('Other') && (
                <input 
                  type="text"
                  placeholder="Enter custom description"
                  style={{ marginTop: '0.5rem' }}
                  value={formData.customDescription}
                  onChange={(e) => setFormData({...formData, customDescription: e.target.value})}
                  required
                />
              )}
            </div>
            <div>
              <label>Amount (தொகை)</label>
              <input 
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
              />
            </div>
            <div>
              <label style={{ fontWeight: 'bold', color: '#1e40af' }}>Date (தேதி)</label>
              <input 
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
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
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%231e40af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '20px'
                }}
              />
            </div>
          </div>
          <button type="submit" style={{ marginTop: '1rem' }}>Save Expense</button>
        </form>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '1rem' }}>Date</th>
              <th style={{ padding: '1rem' }}>Description</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Amount</th>
              {userRole === 'admin' && <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
            ) : expenses.filter(exp => 
              (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
              (exp.amount || '').toString().includes(searchTerm)
            ).length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No expenses found.</td></tr>
            ) : (
              expenses.filter(exp => 
                (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (exp.amount || '').toString().includes(searchTerm)
              ).map(exp => (
                <tr key={exp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem' }}>{new Date(exp.date).toLocaleDateString()}</td>
                  <td style={{ padding: '1rem' }}>{exp.description}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {exp.amount.toLocaleString()}</td>
                  {userRole === 'admin' && (
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleDelete(exp.id)}
                        style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.4rem 0.8rem', width: 'auto', border: 'none' }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {expenses.filter(exp => 
            (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (exp.amount || '').toString().includes(searchTerm)
          ).length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ padding: '1rem', textAlign: 'right' }}>Total Expenses:</td>
                <td style={{ padding: '1rem', textAlign: 'right', color: '#ef4444' }}>
                  ₹ {expenses.filter(exp => 
                    (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (exp.amount || '').toString().includes(searchTerm)
                  ).reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()}
                </td>
                {userRole === 'admin' && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default ExpenseEntry;
