import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBase } from './backendConfig';
import LoanForm from './LoanForm';
import CustomerRegistrationForm from './CustomerRegistrationForm';
import AgentRegistrationForm from './AgentRegistrationForm';
import ExpenseEntry from './ExpenseEntry';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function StaffDashboard({ user, systemSettings }) {
  const [activeTab, setActiveTab] = useState('loans');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingAgent, setEditingAgent] = useState(null);
  const [activeLoans, setActiveLoans] = useState([]);
  const [rejectedLoans, setRejectedLoans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [collectionReports, setCollectionReports] = useState([]);
  const [pendingCollections, setPendingCollections] = useState([]);
  const [reportFilters, setReportFilters] = useState({
    customer: '',
    agent: '',
    startDate: '',
    endDate: ''
  });
  const [loadingReports, setLoadingReports] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isClosing, setIsClosing] = useState(false);
  const [closingLoanId, setClosingLoanId] = useState(null);
  const [closingBalance, setClosingBalance] = useState(0);
  const [tableFilters, setTableFilters] = useState({
    activeLoansSearch: '',
    rejectedLoansSearch: '',
    customersSearch: '',
    agentsSearch: '',
    pendingSearch: '',
    pendingAgentFilter: 'All'
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [passwordVisibility, setPasswordVisibility] = useState({ old: false, new: false, confirm: false });

  useEffect(() => {
    fetchActiveLoans();
    fetchRejectedLoans();
    fetchCustomers();
    fetchAgents();
    fetchCollectionReports();
    fetchPendingCollections();
  }, []);

  const fetchCustomers = async () => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/customers/`);
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchActiveLoans = async () => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/loans/active`);
      setActiveLoans(response.data);
    } catch (error) {
      console.error('Error fetching loans:', error);
    }
  };

  const fetchCollectionReports = async () => {
    setLoadingReports(true);
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/reports/collections`);
      setCollectionReports(response.data);
    } catch (error) {
      console.error('Error fetching collection reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchPendingCollections = async () => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/reports/pending-collections`);
      setPendingCollections(response.data);
    } catch (error) {
      console.error('Error fetching pending collections:', error);
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
      const base = getApiBase();
      const resp = await axios.post(`${base}/change-password`, null, {
        params: {
          user_id: user.id,
          old_password: passwordData.old,
          new_password: passwordData.new
        }
      });
      setPasswordMsg({ type: 'success', text: 'கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது (Password updated successfully)' });
      setPasswordData({ old: '', new: '', confirm: '' });
      setTimeout(() => setShowChangePassword(false), 2000);
    } catch (error) {
      setPasswordMsg({ type: 'error', text: error.response?.data?.detail || 'கடவுச்சொல் மாற்றுவதில் தோல்வி' });
    }
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
    // 1. Add Company Header to Excel
    const companyName = systemSettings?.company_name || 'Finance Manager';
    const companyAddress = systemSettings?.company_address || '';
    const companyPhone = systemSettings?.company_phone || '';
    
    const rows = [];
    rows.push([companyName.toUpperCase()]);
    if (companyAddress) {
      companyAddress.split('\n').forEach(line => rows.push([line]));
    }
    rows.push([`Phone: ${companyPhone}`]);
    rows.push([]); // Empty row
    rows.push([title.toUpperCase()]);
    rows.push([`Generated on: ${formatDateTime(new Date())}`]);
    rows.push([]); // Empty row

    // Determine headers and mapping based on data structure
    let headers = [];
    let mapping = (item, sno) => [];

    if (fileName.includes('Pending_Collections')) {
      headers = ["S.No", "Loan ID", "Customer Name", "Phone", "Address", "Total Amount", "Due Amount", "Balance Due", "Next Due", "Agent"];
      mapping = (item, sno) => [
        sno,
        item.loan_id,
        item.customer_name,
        item.customer_phone,
        item.customer_address,
        item.total_amount,
        item.due_amount,
        item.balance_due,
        formatDate(item.next_due_date),
        item.agent_name || 'Unassigned'
      ];
    } else if (fileName.includes('Collection_Report')) {
      headers = ["S.No", "Date", "Customer", "Amount", "Agent"];
      mapping = (item, sno) => [
        sno,
        formatDateTime(new Date(item.date)),
        item.customer_name,
        item.amount,
        item.agent_name
      ];
    } else if (fileName.includes('Customer_List')) {
      headers = ["S.No", "Name", "Phone", "Address", "Created At"];
      mapping = (item, sno) => [
        sno,
        item.name,
        item.phone,
        item.address,
        formatDate(item.created_at)
      ];
    } else if (fileName.includes('Agent_List')) {
      headers = ["S.No", "Name", "Phone", "Username", "Joined Date"];
      mapping = (item, sno) => [
        sno,
        item.full_name,
        item.phone,
        item.username,
        formatDate(item.created_at)
      ];
    } else if (fileName.includes('Active_Loans')) {
      headers = ["S.No", "ID", "Customer", "Phone", "Type", "Amount", "Due", "Agent"];
      mapping = (item, sno) => [
        sno,
        item.id,
        item.customer?.name || 'N/A',
        item.customer?.phone || 'N/A',
        item.loan_type,
        item.amount,
        item.daily_due,
        item.agent_name || 'Not Assigned'
      ];
    } else if (fileName.includes('Rejected_Loans')) {
      headers = ["S.No", "ID", "Customer", "Phone", "Type", "Amount", "Reason"];
      mapping = (item, sno) => [
        sno,
        item.id,
        item.customer?.name || 'N/A',
        item.customer?.phone || 'N/A',
        item.loan_type,
        item.amount,
        item.reject_reason || 'N/A'
      ];
    }

    rows.push(headers);

    if (fileName.includes('Pending_Collections')) {
      // Special case for pending collections grouping
      const groupedData = data.reduce((acc, item) => {
        const agent = item.agent_name || 'Unassigned';
        if (!acc[agent]) acc[agent] = [];
        acc[agent].push(item);
        return acc;
      }, {});

      let globalSNo = 1;
      Object.keys(groupedData).forEach(agent => {
        rows.push([`AGENT: ${agent.toUpperCase()}`]);
        groupedData[agent].forEach(item => {
          rows.push(mapping(item, globalSNo++));
        });
        rows.push([]);
      });
    } else {
      data.forEach((item, idx) => {
        rows.push(mapping(item, idx + 1));
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Auto-size columns (rough estimate)
    const colWidths = headers.map(() => ({ wch: 15 }));
    colWidths[0] = { wch: 6 }; // S.No
    if (headers.includes("Address")) {
      const addrIdx = headers.indexOf("Address");
      colWidths[addrIdx] = { wch: 35 };
    }
    if (headers.includes("Customer Name") || headers.includes("Customer") || headers.includes("Name")) {
      const nameIdx = headers.findIndex(h => h.includes("Name") || h === "Customer");
      colWidths[nameIdx] = { wch: 25 };
    }
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
      
      // 1. Add Company Letterhead
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
      
      let tableColumn = [];
      let tableRows = [];

      if (fileName.includes('Pending_Collections')) {
        // Handle grouped view for PDF
        const groupedData = data.reduce((acc, item) => {
          const agent = item.agent_name || 'Unassigned';
          if (!acc[agent]) acc[agent] = [];
          acc[agent].push(item);
          return acc;
        }, {});

        let currentY = headerY + 15;
        let globalSNo = 1;

        Object.keys(groupedData).forEach((agent) => {
          if (currentY > 240) {
            doc.addPage();
            currentY = 20;
          }
          
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text(`AGENT: ${agent.toUpperCase()}`, 14, currentY);
          currentY += 5;

          const col = ["S.No", "ID", "Customer", "Phone", "Total", "Due", "Balance", "Next Due"];
          const rows = (groupedData[agent] || []).map(item => [
            globalSNo++,
            item.loan_id,
            item.customer_name,
            item.customer_phone,
            item.total_amount,
            item.due_amount,
            item.balance_due,
            formatDate(item.next_due_date)
          ]);

          autoTable(doc, {
            head: [col],
            body: rows,
            startY: currentY,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.1 },
            headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], halign: 'center' },
            margin: { left: 14, right: 14 }
          });

          currentY = doc.lastAutoTable.finalY + 10;
        });
        
        doc.save(`${fileName}.pdf`);
        return;
      }

      if (fileName.includes('Collection_Report')) {
        tableColumn = ["S.No", "Date", "Customer", "Amount", "Agent"];
        tableRows = (data || []).map((item, idx) => [
          idx + 1,
          formatDateTime(new Date(item.date)),
          item.customer_name,
          item.amount,
          item.agent_name
        ]);
      } else if (fileName.includes('Customer_List')) {
        tableColumn = ["S.No", "Name", "Phone", "Address", "Created At"];
        tableRows = (data || []).map((item, idx) => [
          idx + 1,
          item.name,
          item.phone,
          item.address,
          formatDate(item.created_at)
        ]);
      } else if (fileName.includes('Agent_List')) {
        tableColumn = ["S.No", "Name", "Phone", "Username", "Joined Date"];
        tableRows = (data || []).map((item, idx) => [
          idx + 1,
          item.full_name,
          item.phone,
          item.username,
          formatDate(item.created_at)
        ]);
      } else if (fileName.includes('Active_Loans')) {
        tableColumn = ["S.No", "ID", "Customer", "Amount", "Due", "Agent"];
        tableRows = (data || []).map((item, idx) => [
          idx + 1,
          item.id,
          item.customer?.name || 'N/A',
          item.amount,
          item.daily_due,
          item.agent_name || 'Not Assigned'
        ]);
      } else if (fileName.includes('Rejected_Loans')) {
        tableColumn = ["S.No", "ID", "Customer", "Amount", "Reason"];
        tableRows = (data || []).map((item, idx) => [
          idx + 1,
          item.id,
          item.customer?.name || 'N/A',
          item.amount,
          item.reject_reason || 'N/A'
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

  const fetchRejectedLoans = async () => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/loans/rejected`);
      setRejectedLoans(response.data);
    } catch (error) {
      console.error('Error fetching rejected loans:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/users/agents`);
      setAgents(response.data);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const handleAssignAgent = async (loanId, agentId) => {
    try {
      const base = getApiBase();
      await axios.post(`${base}/loans/${loanId}/assign-agent/${agentId}`);
      setMessage({ type: 'success', text: 'Agent assigned successfully!' });
      fetchActiveLoans();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error assigning agent.' });
      console.error('Error:', error);
    }
  };

  const handleCloseLoan = async (loanId) => {
    try {
      const base = getApiBase();
      const response = await axios.get(`${base}/loans/${loanId}/balance`);
      setClosingBalance(response.data.balance);
      setClosingLoanId(loanId);
      setIsClosing(true);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setMessage({ type: 'error', text: 'நிலுவைத் தொகையைக் கணக்கிடுவதில் தோல்வி.' });
    }
  };

  const confirmCloseLoan = async () => {
    if (!window.confirm(`Are you sure you want to close this loan by paying the remaining balance of ₹${closingBalance}?\n(இந்த கடனை ₹${closingBalance} செலுத்தி முடிக்க விரும்புகிறீர்களா?)`)) {
      return;
    }
    try {
      const base = getApiBase();
      await axios.post(`${base}/loans/${closingLoanId}/close`);
      setMessage({ type: 'success', text: 'Loan closed successfully! (கடன் வெற்றிகரமாக முடிக்கப்பட்டது)' });
      setIsClosing(false);
      setClosingLoanId(null);
      fetchActiveLoans();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      console.error('Error closing loan:', err);
      setMessage({ type: 'error', text: 'Failed to close loan: ' + (err.response?.data?.detail || err.message) });
    }
  };

  return (
    <div className="container">
      {/* Loan Closure Modal */}
      {isClosing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '400px', padding: '2rem' }}>
            <h2 style={{ textAlign: 'center', color: '#ef4444' }}>கடன் கணக்கு முடித்தல் (Loan Closure)</h2>
            <div style={{ margin: '1.5rem 0', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <p><strong>Loan ID:</strong> {closingLoanId}</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                Remaining Balance: <span style={{ color: '#ef4444' }}>₹ {(closingBalance || 0).toLocaleString()}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={confirmCloseLoan}
                style={{ flex: 2, backgroundColor: '#ef4444' }}
              >
                Pay & Close 🏁
              </button>
              <button 
                onClick={() => setIsClosing(false)}
                style={{ flex: 1, backgroundColor: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1>Staff Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {activeTab === 'loans' && (
            <button 
              onClick={() => setShowLoanForm(!showLoanForm)}
              style={{ width: 'auto', backgroundColor: showLoanForm ? '#ef4444' : 'var(--primary-color)' }}
            >
              {showLoanForm ? 'Close Form' : '+ Request New Loan'}
            </button>
          )}
          {activeTab === 'customers' && (
            <button 
              onClick={() => {
                if (editingCustomer) setEditingCustomer(null);
                else setShowCustomerForm(!showCustomerForm);
              }}
              style={{ width: 'auto', backgroundColor: (showCustomerForm || editingCustomer) ? '#ef4444' : 'var(--primary-color)' }}
            >
              {(showCustomerForm || editingCustomer) ? 'Close Form' : '+ Register Customer'}
            </button>
          )}
          {activeTab === 'agents' && (
            <button 
              onClick={() => {
                if (editingAgent) setEditingAgent(null);
                else setShowAgentForm(!showAgentForm);
              }}
              style={{ width: 'auto', backgroundColor: (showAgentForm || editingAgent) ? '#ef4444' : 'var(--primary-color)' }}
            >
              {(showAgentForm || editingAgent) ? 'Close Form' : '+ Register Agent'}
            </button>
          )}
          <button 
            onClick={() => setShowChangePassword(!showChangePassword)}
            style={{ width: 'auto', backgroundColor: '#f59e0b' }}
          >
            {showChangePassword ? 'Close Password' : 'Change Password'}
          </button>
        </div>
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

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
        <button 
          onClick={() => setActiveTab('loans')}
          style={{ 
            backgroundColor: activeTab === 'loans' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'loans' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Loans 💰
        </button>
        <button 
          onClick={() => setActiveTab('customers')}
          style={{ 
            backgroundColor: activeTab === 'customers' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'customers' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Customers 👥
        </button>
        <button 
          onClick={() => setActiveTab('agents')}
          style={{ 
            backgroundColor: activeTab === 'agents' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'agents' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Agents 👷
        </button>
        <button 
          onClick={() => setActiveTab('expenses')}
          style={{ 
            backgroundColor: activeTab === 'expenses' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'expenses' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Expenses 💸
        </button>
        <button 
          onClick={() => setActiveTab('pending')}
          style={{ 
            backgroundColor: activeTab === 'pending' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'pending' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Pending Collections ⏳
        </button>
      </div>

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

      {activeTab === 'pending' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>வசூலிக்கப்பட வேண்டியவை (Pending Collections) - {pendingCollections.length}</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select 
                value={tableFilters.pendingAgentFilter}
                onChange={(e) => setTableFilters({...tableFilters, pendingAgentFilter: e.target.value})}
                style={{ padding: '0.4rem', fontSize: '0.9rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}
              >
                <option value="All">All Agents (அனைத்து முகவர்கள்)</option>
                {[...new Set((pendingCollections || []).map(item => item.agent_name || 'Unassigned'))].sort().map((agent, idx) => (
                  <option key={agent || idx} value={agent}>{agent}</option>
                ))}
              </select>
              <button 
                onClick={() => {
                  const filtered = pendingCollections.filter(item => {
                    const matchesSearch = (item.customer_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.agent_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.customer_phone || '').includes(tableFilters.pendingSearch);
                    const matchesAgent = tableFilters.pendingAgentFilter === 'All' || item.agent_name === tableFilters.pendingAgentFilter;
                    return matchesSearch && matchesAgent;
                  });
                  exportToExcel(filtered, 'Pending_Collections');
                }}
                style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.5rem 1rem' }}
              >
                Excel 📊
              </button>
              <button 
                onClick={() => {
                  const filtered = pendingCollections.filter(item => {
                    const matchesSearch = (item.customer_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.agent_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.customer_phone || '').includes(tableFilters.pendingSearch);
                    const matchesAgent = tableFilters.pendingAgentFilter === 'All' || item.agent_name === tableFilters.pendingAgentFilter;
                    return matchesSearch && matchesAgent;
                  });
                  exportToPDF(filtered, 'Pending Collection Report', 'Pending_Collections');
                }}
                style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.5rem 1rem' }}
              >
                PDF 📄
              </button>
              <input 
                type="text" 
                placeholder="தேடு (Search)..." 
                value={tableFilters.pendingSearch}
                onChange={(e) => setTableFilters({...tableFilters, pendingSearch: e.target.value})}
                style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
              />
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem' }}>Loan ID</th>
                  <th style={{ padding: '0.75rem' }}>Customer (வாடிக்கையாளர்)</th>
                  <th style={{ padding: '0.75rem' }}>Mobile (மொபைல்)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Due (தவணை)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Balance (நிலுவை)</th>
                  <th style={{ padding: '0.75rem' }}>Next Due (தேதி)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = pendingCollections.filter(item => {
                    const matchesSearch = (item.customer_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.agent_name || '').toLowerCase().includes(tableFilters.pendingSearch.toLowerCase()) ||
                                       (item.customer_phone || '').includes(tableFilters.pendingSearch);
                    const matchesAgent = tableFilters.pendingAgentFilter === 'All' || item.agent_name === tableFilters.pendingAgentFilter;
                    return matchesSearch && matchesAgent;
                  });

                  if (filtered.length === 0) {
                    return <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No pending collections found.</td></tr>;
                  }

                  const grouped = filtered.reduce((acc, item) => {
                    const agent = item.agent_name || 'Unassigned';
                    if (!acc[agent]) acc[agent] = [];
                    acc[agent].push(item);
                    return acc;
                  }, {});

                  return Object.keys(grouped).map((agent, idx) => (
                    <React.Fragment key={agent || idx}>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <td colSpan="6" style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                          Agent (முகவர்): {agent}
                        </td>
                      </tr>
                      {(grouped[agent] || []).map((item, subIdx) => (
                        <tr key={`${agent}-${item.loan_id || subIdx}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{item.loan_id}</td>
                          <td style={{ padding: '0.75rem' }}>{item.customer_name}</td>
                          <td style={{ padding: '0.75rem' }}>{item.customer_phone}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(item.due_amount || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>₹ {(item.balance_due || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem' }}>{item.next_due_date}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'loans' && (
        <>
          {showLoanForm ? (
            <LoanForm isStaff={true} onComplete={() => { setShowLoanForm(false); fetchActiveLoans(); }} />
          ) : (
            <div style={{ display: 'grid', gap: '2rem' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h2 style={{ margin: 0 }}>கடன் மற்றும் முகவர் ஒதுக்கீடு (Active Loans & Agent Assignment) - {activeLoans.length}</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        const filtered = activeLoans.filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.activeLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.activeLoansSearch)
                        );
                        exportToExcel(filtered, 'Active_Loans', 'ACTIVE LOANS REPORT');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = activeLoans.filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.activeLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.activeLoansSearch)
                        );
                        exportToPDF(filtered, 'Active Loans Report', 'Active_Loans');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="தேடு..." 
                      value={tableFilters.activeLoansSearch}
                      onChange={(e) => setTableFilters({...tableFilters, activeLoansSearch: e.target.value})}
                      style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
                {activeLoans.filter(loan => 
                  (loan.customer?.name || '').toLowerCase().includes(tableFilters.activeLoansSearch.toLowerCase()) ||
                  (loan.customer?.phone || '').includes(tableFilters.activeLoansSearch)
                ).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No active loans found.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '0.75rem' }}>Customer</th>
                          <th style={{ padding: '0.75rem' }}>Loan Details</th>
                          <th style={{ padding: '0.75rem' }}>Current Agent</th>
                          <th style={{ padding: '0.75rem' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeLoans || []).filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.activeLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.activeLoansSearch)
                        ).map((loan, idx) => (
                          <tr key={loan.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem' }}>
                              <strong>{loan.customer?.name}</strong><br/>
                              <small>{loan.customer?.phone}</small>
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              ₹ {(loan.amount || 0).toLocaleString()} ({loan.loan_type})<br/>
                              <small>Due: ₹ {(loan.daily_due || 0).toLocaleString()}</small>
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              {loan.agent_id ? (
                                <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
                                  {(agents || []).find(a => a.id === loan.agent_id)?.full_name || 'Assigned'}
                                </span>
                              ) : (
                                <span style={{ color: '#ef4444' }}>Not Assigned</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <select 
                                  onChange={(e) => handleAssignAgent(loan.id, e.target.value)}
                                  value={loan.agent_id || ''}
                                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                >
                                  <option value="">Select Agent</option>
                                  {(agents || []).map((agent, agentIdx) => (
                                    <option key={agent.id || agentIdx} value={agent.id}>{agent.full_name}</option>
                                  ))}
                                </select>
                                <button 
                                  onClick={() => {
                                    const base = getApiBase();
                                    window.open(`${base}/loans/${loan.id}/sanction`);
                                  }}
                                  style={{ padding: '0.5rem', fontSize: '0.75rem', backgroundColor: '#3b82f6', width: 'auto' }}
                                  title="Download Sanction Letter"
                                >
                                  PDF 📄
                                </button>
                                <button 
                                  onClick={() => handleCloseLoan(loan.id)}
                                  style={{ padding: '0.5rem', fontSize: '0.75rem', backgroundColor: '#ef4444', width: 'auto' }}
                                  title="Close Loan (Advance Payment)"
                                >
                                  Close 🏁
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h2 style={{ margin: 0, color: '#ef4444' }}>Rejected Loans (நிராகரிக்கப்பட்ட கடன்கள்) - {rejectedLoans.length}</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        const filtered = rejectedLoans.filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.rejectedLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.rejectedLoansSearch)
                        );
                        exportToExcel(filtered, 'Rejected_Loans', 'REJECTED LOANS REPORT');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = rejectedLoans.filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.rejectedLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.rejectedLoansSearch)
                        );
                        exportToPDF(filtered, 'Rejected Loans', 'Rejected_Loans');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="பெயர் அல்லது போன் மூலம் தேடு..." 
                      value={tableFilters.rejectedLoansSearch}
                      onChange={(e) => setTableFilters({...tableFilters, rejectedLoansSearch: e.target.value})}
                      style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
                {rejectedLoans.filter(loan => 
                  (loan.customer?.name || '').toLowerCase().includes(tableFilters.rejectedLoansSearch.toLowerCase()) ||
                  (loan.customer?.phone || '').includes(tableFilters.rejectedLoansSearch)
                ).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No rejected loans found.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '0.75rem' }}>Customer</th>
                          <th style={{ padding: '0.75rem' }}>Loan Details</th>
                          <th style={{ padding: '0.75rem' }}>Rejection Reason</th>
                          <th style={{ padding: '0.75rem' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rejectedLoans || []).filter(loan => 
                          (loan.customer?.name || '').toLowerCase().includes(tableFilters.rejectedLoansSearch.toLowerCase()) ||
                          (loan.customer?.phone || '').includes(tableFilters.rejectedLoansSearch)
                        ).map((loan, idx) => (
                          <tr key={loan.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem' }}>
                              <strong>{loan.customer?.name}</strong><br/>
                              <small>{loan.customer?.phone}</small>
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              ₹ {(loan.amount || 0).toLocaleString()} ({loan.loan_type})
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <div style={{ color: '#ef4444', fontStyle: 'italic' }}>
                                "{loan.reject_reason || 'No reason provided'}"
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#ef4444' }}>Rejected</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Collection Reports (வசூல் அறிக்கைகள்) - {collectionReports.length}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => {
                        const filtered = collectionReports.filter(coll => {
                          const matchCustomer = coll.customer_name.toLowerCase().includes(reportFilters.customer.toLowerCase());
                          const matchAgent = coll.agent_name.toLowerCase().includes(reportFilters.agent.toLowerCase());
                          const collDate = new Date(coll.date).toISOString().split('T')[0];
                          const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                          const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                          return matchCustomer && matchAgent && matchStart && matchEnd;
                        });
                        exportToExcel(filtered, 'Collection_Report', 'COLLECTION REPORT');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = collectionReports.filter(coll => {
                          const matchCustomer = coll.customer_name.toLowerCase().includes(reportFilters.customer.toLowerCase());
                          const matchAgent = coll.agent_name.toLowerCase().includes(reportFilters.agent.toLowerCase());
                          const collDate = new Date(coll.date).toISOString().split('T')[0];
                          const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                          const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                          return matchCustomer && matchAgent && matchStart && matchEnd;
                        });
                        exportToPDF(filtered, 'Collection Report', 'Collection_Report');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="வாடிக்கையாளர்..."
                      value={reportFilters.customer}
                      onChange={(e) => setReportFilters({...reportFilters, customer: e.target.value})}
                      style={{ width: '130px', padding: '0.4rem', fontSize: '0.8rem' }}
                    />
                    <input 
                      type="text" 
                      placeholder="முகவர்..."
                      value={reportFilters.agent}
                      onChange={(e) => setReportFilters({...reportFilters, agent: e.target.value})}
                      style={{ width: '110px', padding: '0.4rem', fontSize: '0.8rem' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>From Date (முதல் தேதி)</label>
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
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%231e40af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 10px center',
                          backgroundSize: '20px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>To Date (முடிவு தேதி)</label>
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
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%231e40af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 10px center',
                          backgroundSize: '20px'
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => setReportFilters({ customer: '', agent: '', startDate: '', endDate: '' })}
                      style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#64748b' }}
                    >
                      Clear 🔄
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem' }}>Date</th>
                        <th style={{ padding: '0.75rem' }}>Customer</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '0.75rem' }}>Agent</th>
                        <th style={{ padding: '0.75rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingReports ? (
                        <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                      ) : collectionReports.filter(coll => {
                        const matchCustomer = coll.customer_name.toLowerCase().includes(reportFilters.customer.toLowerCase());
                        const matchAgent = coll.agent_name.toLowerCase().includes(reportFilters.agent.toLowerCase());
                        const collDate = new Date(coll.date).toISOString().split('T')[0];
                        const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                        const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                        return matchCustomer && matchAgent && matchStart && matchEnd;
                      }).length === 0 ? (
                        <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No collections found.</td></tr>
                      ) : (
                        collectionReports.filter(coll => {
                          const matchCustomer = coll.customer_name.toLowerCase().includes(reportFilters.customer.toLowerCase());
                          const matchAgent = coll.agent_name.toLowerCase().includes(reportFilters.agent.toLowerCase());
                          const collDate = new Date(coll.date).toISOString().split('T')[0];
                          const matchStart = !reportFilters.startDate || collDate >= reportFilters.startDate;
                          const matchEnd = !reportFilters.endDate || collDate <= reportFilters.endDate;
                          return matchCustomer && matchAgent && matchStart && matchEnd;
                        }).map(coll => (
                          <tr key={coll.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem' }}>{new Date(coll.date).toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>{coll.customer_name}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {coll.amount.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>{coll.agent_name}</td>
                            <td style={{ padding: '0.75rem' }}>
                              <button 
                                onClick={() => {
                                  const base = getApiBase();
                                  window.open(`${base}/transactions/${coll.id}/receipt`);
                                }}
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
          )}
        </>
      )}

      {activeTab === 'customers' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {(showCustomerForm || editingCustomer) ? (
            <CustomerRegistrationForm 
              initialData={editingCustomer}
              onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
              onComplete={() => { setShowCustomerForm(false); setEditingCustomer(null); fetchCustomers(); }} 
            />
          ) : (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0 }}>Customers List (வாடிக்கையாளர் பட்டியல்) - {(customers || []).length}</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => {
                      const filtered = (customers || []).filter(customer => 
                        (customer.name || '').toLowerCase().includes(tableFilters.customersSearch.toLowerCase()) ||
                        (customer.phone || '').includes(tableFilters.customersSearch)
                      );
                      exportToExcel(filtered, 'Customer_List', 'CUSTOMER LIST');
                    }}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => {
                      const filtered = (customers || []).filter(customer => 
                        (customer.name || '').toLowerCase().includes(tableFilters.customersSearch.toLowerCase()) ||
                        (customer.phone || '').includes(tableFilters.customersSearch)
                      );
                      exportToPDF(filtered, 'Customer List', 'Customer_List');
                    }}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                  <input 
                    type="text" 
                    placeholder="பெயர் அல்லது போன் மூலம் தேடு..." 
                    value={tableFilters.customersSearch}
                    onChange={(e) => setTableFilters({...tableFilters, customersSearch: e.target.value})}
                    style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
                  />
                </div>
              </div>
              {(customers || []).filter(customer => 
                (customer.name || '').toLowerCase().includes(tableFilters.customersSearch.toLowerCase()) ||
                (customer.phone || '').includes(tableFilters.customersSearch)
              ).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No customers found.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem' }}>Name</th>
                        <th style={{ padding: '0.75rem' }}>Phone</th>
                        <th style={{ padding: '0.75rem' }}>Address</th>
                        <th style={{ padding: '0.75rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customers || []).filter(customer => 
                        (customer.name || '').toLowerCase().includes(tableFilters.customersSearch.toLowerCase()) ||
                        (customer.phone || '').includes(tableFilters.customersSearch)
                      ).map((customer, idx) => (
                        <tr key={customer.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <strong>{customer.name}</strong><br/>
                            {customer.name_tamil && <small style={{ color: 'var(--primary-color)' }}>{customer.name_tamil}</small>}
                          </td>
                          <td style={{ padding: '0.75rem' }}>{customer.phone}</td>
                          <td style={{ padding: '0.75rem' }}>{customer.address}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <button 
                              onClick={() => setEditingCustomer(customer)}
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#3b82f6', width: 'auto' }}
                            >
                              Edit ✏️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'agents' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {(showAgentForm || editingAgent) ? (
            <AgentRegistrationForm 
              initialData={editingAgent}
              onCancel={() => { setShowAgentForm(false); setEditingAgent(null); }}
              onComplete={() => { setShowAgentForm(false); setEditingAgent(null); fetchAgents(); }} 
            />
          ) : (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0 }}>Agents List (முகவர் பட்டியல்) - {(agents || []).length}</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => {
                      const filtered = (agents || []).filter(agent => 
                        (agent.full_name || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase()) ||
                        (agent.username || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase())
                      );
                      exportToExcel(filtered, 'Agent_List', 'AGENT LIST');
                    }}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => {
                      const filtered = (agents || []).filter(agent => 
                        (agent.full_name || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase()) ||
                        (agent.username || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase())
                      );
                      exportToPDF(filtered, 'Agent List', 'Agent_List');
                    }}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                  <input 
                    type="text" 
                    placeholder="தேடு..." 
                    value={tableFilters.agentsSearch}
                    onChange={(e) => setTableFilters({...tableFilters, agentsSearch: e.target.value})}
                    style={{ width: '200px', padding: '0.4rem', fontSize: '0.9rem' }}
                  />
                </div>
              </div>
              {(agents || []).filter(agent => 
                (agent.full_name || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase()) ||
                (agent.username || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase())
              ).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No agents found.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem' }}>Full Name</th>
                        <th style={{ padding: '0.75rem' }}>Username</th>
                        <th style={{ padding: '0.75rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(agents || []).filter(agent => 
                        (agent.full_name || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase()) ||
                        (agent.username || '').toLowerCase().includes(tableFilters.agentsSearch.toLowerCase())
                      ).map((agent, idx) => (
                        <tr key={agent.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{agent.full_name}</td>
                          <td style={{ padding: '0.75rem' }}>{agent.username}</td>
                          <td style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span className="badge" style={{ backgroundColor: '#d1fae5', color: '#065f46' }}>Active</span>
                            <button 
                              onClick={() => setEditingAgent(agent)}
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#3b82f6', width: 'auto' }}
                            >
                              Edit ✏️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'expenses' && <ExpenseEntry user={user} userRole="staff" systemSettings={systemSettings} />}

      {!showLoanForm && !showCustomerForm && !showAgentForm && activeTab !== 'expenses' && (
        <div className="card" style={{ backgroundColor: '#f8fafc', marginTop: '2rem' }}>
          <h3>Staff Role Info</h3>
          <p>As a staff member, you are responsible for:</p>
          <ul>
            <li>Creating new loan requests for customers.</li>
            <li>Registering new customers and collection agents.</li>
            <li>Assigning collection agents to active loans.</li>
            <li>Monitoring daily collection progress.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default StaffDashboard;
