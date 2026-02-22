import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoanForm from './LoanForm';
import AgentRegistrationForm from './AgentRegistrationForm';
import CustomerRegistrationForm from './CustomerRegistrationForm';
import StaffRegistrationForm from './StaffRegistrationForm';
import ExpenseEntry from './ExpenseEntry';
import FinancialReport from './FinancialReport';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!checked}
    onClick={() => onChange(!checked)}
    style={{
      width: '44px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: checked ? 'var(--primary-color)' : '#e5e7eb',
      border: '1px solid var(--border-color)',
      position: 'relative',
      padding: 0,
      cursor: 'pointer'
    }}
  >
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '22px' : '2px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }}
    />
  </button>
);

function AdminDashboard({ user, onThemeChange, onSettingsUpdate, systemSettings: initialSettings }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeOverviewSubTab, setActiveOverviewSubTab] = useState('stats');
  const [activeReportSubTab, setActiveReportSubTab] = useState('expense');
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('branding');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [systemSettings, setSystemSettings] = useState(initialSettings || {
    app_name: 'Finance Manager',
    company_name: '',
    company_address: '',
    company_phone: '',
    logo_base64: '',
    commission_enabled: false,
    commission_percent: 0,
    auto_backup_enabled: false,
    auto_backup_frequency: 'daily'
  });

  // Sync local state when prop changes
  useEffect(() => {
    if (initialSettings) {
      const incoming = {
        ...initialSettings,
        commission_enabled: !!initialSettings.commission_enabled,
        commission_percent: Number(initialSettings.commission_percent ?? 0),
        auto_backup_enabled: !!initialSettings.auto_backup_enabled,
        auto_backup_frequency: initialSettings.auto_backup_frequency || 'daily'
      };
      setSystemSettings(prev => ({
        ...prev,
        ...incoming,
        commission_enabled: prev.commission_enabled || incoming.commission_enabled,
        auto_backup_enabled: prev.auto_backup_enabled || incoming.auto_backup_enabled
      }));
    }
  }, [initialSettings]);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [stats, setStats] = useState({
    total_loans_count: 0,
    total_customers: 0,
    total_loan_amount: 0,
    total_disbursed_amount: 0,
    total_collected: 0,
    total_pending_collection: 0,
    today_collection: 0,
    total_rejected_count: 0,
    total_rejected_amount: 0,
    total_expenses: 0,
    net_cash_flow: 0,
    agent_reports: []
  });
  const [loanReports, setLoanReports] = useState([]);
  const [collectionReports, setCollectionReports] = useState([]);
  const [pendingCollections, setPendingCollections] = useState([]);
  const [financialReport, setFinancialReport] = useState({
    summary: { total_disbursed: 0, total_collected: 0, total_expenses: 0, net_profit: 0 },
    expenses_breakdown: [],
    balance_sheet: { assets: [], liabilities: [], total_assets: 0, total_liabilities: 0 }
  });
  const [reportFilters, setReportFilters] = useState({
    customer: '',
    agent: '',
    startDate: '',
    endDate: '',
    status: 'all'
  });
  const [tableFilters, setTableFilters] = useState({
    staffSearch: '',
    agentSearch: '',
    customerSearch: '',
    overdueSearch: '',
    pendingSearch: '',
    rejectedSearch: '',
    pendingAgentFilter: 'All'
  });
  const [isClosing, setIsClosing] = useState(false);
  const [closingLoanId, setClosingLoanId] = useState(null);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loadingReports, setLoadingReports] = useState(false);
  const [pendingLoans, setPendingLoans] = useState([]);
  const [overdueLoans, setOverdueLoans] = useState([]);
  const [rejectedLoans, setRejectedLoans] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedOverdue, setSelectedOverdue] = useState([]);
  const [reminderMsg, setReminderMsg] = useState({ text: '', type: '' });
  const [selectedTheme, setSelectedTheme] = useState('blue');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) setSelectedTheme(saved);
    } catch (e) { e; }
  }, []);

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
    throw lastErr || new Error('API GET failed');
  };
  const apiPost = async (path, data) => {
    let lastErr;
    for (const base of apiBases) {
      try {
        return await axios.post(`${base}${path}`, data);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('API POST failed');
  };

  const sendBulkReminders = async () => {
    if (selectedOverdue.length === 0) return;
    try {
      const response = await axios.post('http://localhost:9000/loans/send-reminders', selectedOverdue);
      setReminderMsg({ text: response.data.message, type: 'success' });
      setSelectedOverdue([]);
      setTimeout(() => setReminderMsg({ text: '', type: '' }), 3000);
    } catch (error) {
      setReminderMsg({ text: 'Error sending reminders.', type: 'error' });
    }
  };

  const toggleSelectLoan = (id) => {
    if (selectedOverdue.includes(id)) {
      setSelectedOverdue(selectedOverdue.filter(item => item !== id));
    } else {
      setSelectedOverdue([...selectedOverdue, id]);
    }
  };
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [editingLoanData, setEditingLoanData] = useState(null);
  const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [passwordVisibility, setPasswordVisibility] = useState({
    admin_old: false,
    admin_new: false,
    admin_confirm: false,
    twilio_auth: false,
    razorpay_secret: false
  });
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });
  const [commissionReport, setCommissionReport] = useState([]);

  const fetchCommissionReport = async () => {
    try {
      const response = await axios.get('http://localhost:9000/loans/commission-report');
      setCommissionReport(response.data);
    } catch (error) {
      console.error('Error fetching commission report:', error);
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
      const bases = ['http://127.0.0.1:9000', 'http://localhost:9000'];
      let lastErr, resp;
      for (const base of bases) {
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

  const fetchLoanReports = async () => {
    setLoadingReports(true);
    try {
      const response = await apiGet('/reports/loans');
      setLoanReports(response.data);
      const collResponse = await apiGet('/reports/collections');
      setCollectionReports(collResponse.data);
      const pendingResponse = await apiGet('/reports/pending-collections');
      setPendingCollections(pendingResponse.data);
      const finResponse = await apiGet('/reports/financial');
      setFinancialReport(finResponse.data);
      const txResponse = await apiGet('/stats/admin');
      setStats(txResponse.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoadingReports(false);
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
    const companyName = systemSettings.company_name || 'Finance Manager';
    const companyAddress = systemSettings.company_address || '';
    const companyPhone = systemSettings.company_phone || '';
    
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
    } else if (fileName.includes('Loan_Report')) {
      headers = ["S.No", "ID", "Customer", "Phone", "Type", "Total Amount", "Balance Due", "Agent", "Status", "Next Due"];
      mapping = (item, sno) => [
        sno,
        item.id,
        item.customer_name,
        item.customer_phone,
        item.loan_type,
        item.amount,
        item.balance_due,
        item.agent_name,
        item.status,
        formatDate(item.next_due_date)
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
    } else if (fileName.includes('Staff_List')) {
      headers = ["S.No", "Name", "Username", "Role", "Joined Date"];
      mapping = (item, sno) => [
        sno,
        item.full_name,
        item.username,
        item.role,
        formatDate(item.created_at)
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
    } else if (fileName.includes('Active_Loans')) {
      headers = ["S.No", "ID", "Customer", "Phone", "Type", "Amount", "Due", "Days", "Deduction"];
      mapping = (item, sno) => [
        sno,
        item.id,
        item.customer?.name || 'N/A',
        item.customer?.phone || 'N/A',
        item.loan_type,
        item.amount,
        item.daily_due,
        item.total_days,
        item.deduction
      ];
    } else if (fileName.includes('Overdue_Alerts')) {
      headers = ["S.No", "Customer Name", "Phone", "Overdue Amount"];
      mapping = (item, sno) => [
        sno,
        item.customer_name,
        item.customer_phone,
        item.overdue_amount
      ];
    } else if (fileName.includes('Expense_Report')) {
      headers = ["S.No", "Date", "Description", "Amount"];
      mapping = (item, sno) => [
        sno,
        formatDate(item.date),
        item.description,
        item.amount
      ];
    }

    rows.push(headers);

    data.forEach((item, idx) => {
      rows.push(mapping(item, idx + 1));
    });

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
      const companyName = systemSettings.company_name || 'Finance Manager';
      const companyAddress = systemSettings.company_address || '';
      const companyPhone = systemSettings.company_phone || '';
      
      let headerY = 15;
      
      if (systemSettings.logo_base64) {
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
        tableColumn = ["S.No", "ID", "Customer", "Phone", "Total", "Due", "Balance", "Next Due"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.loan_id,
          item.customer_name,
          item.customer_phone,
          item.total_amount,
          item.due_amount,
          item.balance_due,
          formatDate(item.next_due_date)
        ]);
      } else if (fileName.includes('Loan_Report')) {
        tableColumn = ["S.No", "ID", "Customer", "Type", "Total", "Balance", "Agent", "Status"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.id,
          item.customer_name,
          item.loan_type,
          item.amount,
          item.balance_due,
          item.agent_name,
          item.status
        ]);
      } else if (fileName.includes('Collection_Report')) {
        tableColumn = ["S.No", "Date", "Customer", "Amount", "Agent"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          formatDateTime(new Date(item.date)),
          item.customer_name,
          item.amount,
          item.agent_name
        ]);
      } else if (fileName.includes('Customer_List')) {
        tableColumn = ["S.No", "Name", "Phone", "Address", "Created At"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.name,
          item.phone,
          item.address,
          formatDate(item.created_at)
        ]);
      } else if (fileName.includes('Agent_List')) {
        tableColumn = ["S.No", "Name", "Phone", "Username", "Joined Date"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.full_name,
          item.phone,
          item.username,
          formatDate(item.created_at)
        ]);
      } else if (fileName.includes('Staff_List')) {
        tableColumn = ["S.No", "Name", "Username", "Role", "Joined Date"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.full_name,
          item.username,
          item.role,
          formatDate(item.created_at)
        ]);
      } else if (fileName.includes('Rejected_Loans')) {
        tableColumn = ["S.No", "ID", "Customer", "Amount", "Reason"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.id,
          item.customer?.name || 'N/A',
          item.amount,
          item.reject_reason || 'N/A'
        ]);
      } else if (fileName.includes('Active_Loans')) {
        tableColumn = ["S.No", "ID", "Customer", "Amount", "Due", "Days", "Agent"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.id,
          item.customer?.name || 'N/A',
          item.amount,
          item.daily_due,
          item.total_days,
          item.agent_name || 'Not Assigned'
        ]);
      } else if (fileName.includes('Overdue_Alerts')) {
        tableColumn = ["S.No", "Customer Name", "Phone", "Overdue Amount"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          item.customer_name,
          item.customer_phone,
          item.overdue_amount
        ]);
      } else if (fileName.includes('Expense_Report')) {
        tableColumn = ["S.No", "Date", "Description", "Amount"];
        tableRows = data.map((item, idx) => [
          idx + 1,
          formatDate(item.date),
          item.description,
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

  const fetchAllData = () => {
    fetchStats();
    fetchPendingLoans();
    fetchRejectedLoans();
    fetchOverdueLoans();
    fetchExpenses();
    fetchSystemSettings();
    fetchStaff();
    fetchAgents();
    fetchCustomers();
    fetchCommissionReport();
    if (activeTab === 'reports') fetchLoanReports();
  };

  const getFilteredExpenses = () => {
    return expenses.filter(exp => {
      const expDate = exp.date ? new Date(exp.date).toISOString().split('T')[0] : '';
      const matchStart = !reportFilters.startDate || (expDate && expDate >= reportFilters.startDate);
      const matchEnd = !reportFilters.endDate || (expDate && expDate <= reportFilters.endDate);
      return matchStart && matchEnd;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const getFilteredOverdue = () => {
    const search = (reportFilters.customer || '').toLowerCase();
    return overdueLoans.filter(loan => 
      (loan.customer_name || '').toLowerCase().includes(search) ||
      (loan.customer_phone || '').includes(search)
    );
  };

  const getFilteredCollections = () => {
    return collectionReports.filter(coll => {
      const matchCustomer = (coll.customer_name || '').toLowerCase().includes((reportFilters.customer || '').toLowerCase());
      const matchAgent = (coll.agent_name || '').toLowerCase().includes((reportFilters.agent || '').toLowerCase());
      const collDate = coll.date ? new Date(coll.date).toISOString().split('T')[0] : '';
      const matchStart = !reportFilters.startDate || (collDate && collDate >= reportFilters.startDate);
      const matchEnd = !reportFilters.endDate || (collDate && collDate <= reportFilters.endDate);
      return matchCustomer && matchAgent && matchStart && matchEnd;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const getFilteredLoanReports = () => {
    return loanReports.filter(loan => {
      const matchCustomer = (loan.customer_name || '').toLowerCase().includes((reportFilters.customer || '').toLowerCase());
      const matchAgent = (loan.agent_name || '').toLowerCase().includes((reportFilters.agent || '').toLowerCase());
      const loanDate = loan.created_at ? new Date(loan.created_at).toISOString().split('T')[0] : '';
      const matchStart = !reportFilters.startDate || (loanDate && loanDate >= reportFilters.startDate);
      const matchEnd = !reportFilters.endDate || (loanDate && loanDate <= reportFilters.endDate);
      const matchStatus = reportFilters.status === 'all' || loan.status === reportFilters.status;
      return matchCustomer && matchAgent && matchStart && matchEnd && matchStatus;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const getFilteredOverdueTable = () => {
    const search = (tableFilters.overdueSearch || '').toLowerCase();
    return overdueLoans.filter(loan => 
      (loan.customer_name || '').toLowerCase().includes(search) ||
      (loan.customer_phone || '').includes(search)
    );
  };

  const getFilteredPendingTable = () => {
    const search = (tableFilters.pendingSearch || '').toLowerCase();
    const agentFilter = tableFilters.pendingAgentFilter;
    
    return pendingLoans.filter(loan => {
      const matchSearch = (loan.customer?.name || '').toLowerCase().includes(search) ||
                          (loan.customer?.phone || '').includes(search) ||
                          (loan.id || '').toString().includes(search);
      const matchAgent = agentFilter === 'All' || loan.agent_name === agentFilter;
      return matchSearch && matchAgent;
    });
  };

  const getFilteredRejectedTable = () => {
    const search = (tableFilters.rejectedSearch || '').toLowerCase();
    return rejectedLoans.filter(loan => 
      (loan.customer?.name || '').toLowerCase().includes(search) ||
      (loan.customer?.phone || '').includes(search) ||
      (loan.id || '').toString().includes(search)
    );
  };

  useEffect(() => {
    fetchAllData();
    if (activeTab === 'pending_collections') fetchLoanReports();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'staff') fetchStaff();
    if (activeTab === 'agents') fetchAgents();
    if (activeTab === 'customers') fetchCustomers();
  }, [activeTab]);

  const fetchStaff = async () => {
    try {
      const response = await apiGet('/users/');
      console.log('Fetched users for staff:', response.data);
      const staffList = response.data.filter(u => u.role === 'staff');
      console.log('Filtered staff:', staffList);
      setStaff(staffList);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const response = await apiGet('/settings');
      if (response.data) {
        let sanitized = {
          ...response.data,
          commission_enabled: !!response.data.commission_enabled,
          commission_percent: response.data.commission_percent ?? 0,
          auto_backup_enabled: !!response.data.auto_backup_enabled,
          auto_backup_frequency: response.data.auto_backup_frequency || 'daily'
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
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSettingsUpdate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        app_name: systemSettings.app_name || 'Finance Manager',
        company_name: systemSettings.company_name || '',
        company_address: systemSettings.company_address || '',
        company_phone: systemSettings.company_phone || '',
        logo_base64: systemSettings.logo_base64 || null,
        commission_enabled: !!systemSettings.commission_enabled,
        commission_percent: Number(systemSettings.commission_percent ?? 0),
        auto_backup_enabled: !!systemSettings.auto_backup_enabled,
        auto_backup_frequency: systemSettings.auto_backup_frequency || 'daily',
        sms_provider: systemSettings.sms_provider || 'twilio',
        twilio_account_sid: systemSettings.twilio_account_sid || null,
        twilio_auth_token: systemSettings.twilio_auth_token || null,
        twilio_sms_from: systemSettings.twilio_sms_from || null,
        twilio_whatsapp_from: systemSettings.twilio_whatsapp_from || null
      };
      const response = await apiPost('/settings', payload);
      setSettingsMsg({ type: 'success', text: 'Settings updated successfully! (அமைப்பு மாற்றப்பட்டது)' });
      if (onSettingsUpdate) onSettingsUpdate(payload);
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(payload));
      } catch (e) { e; }
      if (systemSettings.auto_backup_enabled) {
        try {
          const payload = { ...systemSettings, backup_at: new Date().toISOString() };
          localStorage.setItem('settings_backup', JSON.stringify(payload));
        } catch (e) { e; }
      }
    } catch (error) {
      setSettingsMsg({ type: 'error', text: 'Failed to update settings.' });
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(systemSettings));
      } catch (e) { e; }
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSystemSettings({ ...systemSettings, logo_base64: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackupSettings = async () => {
    try {
      await apiPost('/settings/backup');
      setSettingsMsg({ type: 'success', text: 'Database Backup OK (DB காப்பு செய்யப்பட்டது)' });
    } catch (error) {
      setSettingsMsg({ type: 'error', text: 'Database backup failed' });
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        setSystemSettings(prev => ({ ...prev, ...parsed }));
        await apiPost('/settings', parsed);
        setSettingsMsg({ type: 'success', text: 'Settings restored (அமைப்பு மீட்கப்பட்டது)' });
      } catch (err) {
        setSettingsMsg({ type: 'error', text: 'Invalid backup file' });
      }
    };
    reader.readAsText(file);
  };

  const restoreFromLocalBackup = async () => {
    try {
      const raw = localStorage.getItem('settings_backup');
      if (!raw) {
        setSettingsMsg({ type: 'error', text: 'No local backup found' });
        return;
      }
      const parsed = JSON.parse(raw);
      setSystemSettings(prev => ({ ...prev, ...parsed }));
      await apiPost('/settings', parsed);
      setSettingsMsg({ type: 'success', text: 'Restored from local backup' });
    } catch {
      setSettingsMsg({ type: 'error', text: 'Failed to restore local backup' });
    }
  };

  const handleRestoreFromDbBackup = async () => {
    try {
      const response = await apiPost('/settings/restore/latest');
      setSystemSettings(prev => ({
        ...prev,
        ...response.data,
        commission_enabled: !!response.data.commission_enabled,
        commission_percent: response.data.commission_percent ?? 0,
        auto_backup_enabled: !!response.data.auto_backup_enabled,
        auto_backup_frequency: response.data.auto_backup_frequency || 'daily'
      }));
      setSettingsMsg({ type: 'success', text: 'Restored from DB backup (DB காப்பிலிருந்து மீட்கப்பட்டது)' });
    } catch (error) {
      setSettingsMsg({ type: 'error', text: 'No DB backup / restore failed' });
    }
  };

  const setCommissionEnabled = async (val) => {
    const next = { ...systemSettings, commission_enabled: !!val };
    setSystemSettings(next);
    try {
      const payload = {
        app_name: next.app_name || 'Finance Manager',
        company_name: next.company_name || '',
        company_address: next.company_address || '',
        company_phone: next.company_phone || '',
        logo_base64: next.logo_base64 || null,
        commission_enabled: !!next.commission_enabled,
        commission_percent: Number(next.commission_percent ?? 0),
        auto_backup_enabled: !!next.auto_backup_enabled,
        auto_backup_frequency: next.auto_backup_frequency || 'daily',
        sms_provider: next.sms_provider || 'twilio',
        twilio_account_sid: next.twilio_account_sid || null,
        twilio_auth_token: next.twilio_auth_token || null,
        twilio_sms_from: next.twilio_sms_from || null,
        twilio_whatsapp_from: next.twilio_whatsapp_from || null
      };
      await apiPost('/settings', payload);
      setSettingsMsg({ type: 'success', text: 'Commission setting saved' });
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(payload));
      } catch (e) { e; }
      try {
        await fetchSystemSettings();
      } catch (e) { e; }
    } catch (e) {
      setSettingsMsg({ type: 'error', text: 'Failed to save commission setting' });
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(next));
      } catch (e) { e; }
    }
  };

  const setAutoBackupEnabled = async (val) => {
    const next = { ...systemSettings, auto_backup_enabled: !!val };
    setSystemSettings(next);
    try {
      const payload = {
        app_name: next.app_name || 'Finance Manager',
        company_name: next.company_name || '',
        company_address: next.company_address || '',
        company_phone: next.company_phone || '',
        logo_base64: next.logo_base64 || null,
        commission_enabled: !!next.commission_enabled,
        commission_percent: Number(next.commission_percent ?? 0),
        auto_backup_enabled: !!next.auto_backup_enabled,
        auto_backup_frequency: next.auto_backup_frequency || 'daily'
      };
      await apiPost('/settings', payload);
      setSettingsMsg({ type: 'success', text: 'Auto backup setting saved' });
      if (onSettingsUpdate) onSettingsUpdate(payload);
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(payload));
      } catch (e) { e; }
      // Avoid immediate refetch to prevent toggle flicker; rely on local state and App merge
    } catch (e) {
      setSettingsMsg({ type: 'error', text: 'Failed to save auto backup setting' });
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(next));
      } catch (err) { err; }
    }
  };

  const saveAutoBackupSettings = async () => {
    const s = systemSettings;
    try {
      const payload = {
        app_name: s.app_name || 'Finance Manager',
        company_name: s.company_name || '',
        company_address: s.company_address || '',
        company_phone: s.company_phone || '',
        logo_base64: s.logo_base64 || null,
        commission_enabled: !!s.commission_enabled,
        commission_percent: Number(s.commission_percent ?? 0),
        auto_backup_enabled: !!s.auto_backup_enabled,
        auto_backup_frequency: s.auto_backup_frequency || 'daily',
        sms_provider: s.sms_provider || 'twilio',
        twilio_account_sid: s.twilio_account_sid || null,
        twilio_auth_token: s.twilio_auth_token || null,
        twilio_sms_from: s.twilio_sms_from || null,
        twilio_whatsapp_from: s.twilio_whatsapp_from || null
      };
      const response = await apiPost('/settings', payload);
      setSettingsMsg({ type: 'success', text: 'Auto backup setting saved' });
      if (onSettingsUpdate) onSettingsUpdate(payload);
      setSystemSettings(prev => ({
        ...prev,
        auto_backup_enabled: !!payload.auto_backup_enabled,
        auto_backup_frequency: payload.auto_backup_frequency
      }));
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(payload));
      } catch (e) { e; }
      // Do not refetch immediately; keep optimistic state
    } catch (error) {
      setSettingsMsg({ type: 'error', text: 'Failed to save auto backup setting' });
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(s));
      } catch (e) { e; }
    }
  };

  const saveNotificationKeys = async () => {
    const s = systemSettings;
    try {
      const payload = {
        sms_provider: s.sms_provider || 'twilio',
        twilio_account_sid: s.twilio_account_sid || null,
        twilio_auth_token: s.twilio_auth_token || null,
        twilio_sms_from: s.twilio_sms_from || null,
        twilio_whatsapp_from: s.twilio_whatsapp_from || null
      };
      const response = await apiPost('/settings/keys', payload);
      setSettingsMsg({ type: 'success', text: 'Notification keys saved' });
      const updated = response.data || {};
      setSystemSettings(prev => ({ ...prev, ...updated }));
      if (onSettingsUpdate) onSettingsUpdate(updated);
      try {
        localStorage.setItem('system_settings_last', JSON.stringify(updated));
      } catch (e) { e; }
    } catch (error) {
      setSettingsMsg({ type: 'error', text: 'Failed to save notification keys' });
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiGet('/stats/admin');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchPendingLoans = async () => {
    try {
      const response = await apiGet('/loans/pending');
      setPendingLoans(response.data);
    } catch (error) {
      console.error('Error fetching pending loans:', error);
    }
  };

  const fetchRejectedLoans = async () => {
    try {
      const response = await apiGet('/loans/rejected');
      setRejectedLoans(response.data);
    } catch (error) {
      console.error('Error fetching rejected loans:', error);
    }
  };

  const fetchOverdueLoans = async () => {
    try {
      const response = await apiGet('/loans/overdue');
      setOverdueLoans(response.data);
    } catch (error) {
      console.error('Error fetching overdue loans:', error);
    }
  };

  const fetchExpenses = async () => {
    try {
      const response = await apiGet('/expenses');
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await apiGet('/users/agents');
      setAgents(response.data);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await apiGet('/customers/');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleApprove = async (loanId) => {
    try {
      await apiPost(`/loans/${loanId}/approve`);
      fetchPendingLoans();
      fetchRejectedLoans(); // Refresh rejected list too in case an old one was approved
      fetchStats();
    } catch (error) {
      console.error('Error approving loan:', error);
    }
  };

  const handleReject = async (loanId) => {
    const reason = window.prompt('நிராகரிப்பதற்கான காரணத்தை உள்ளிடவும் (Enter reason for rejection):');
    if (reason === null) return; // User cancelled
    
    try {
      await apiPost(`/loans/${loanId}/reject?reason=${encodeURIComponent(reason)}`);
      fetchPendingLoans();
      fetchRejectedLoans();
      fetchStats();
    } catch (error) {
      console.error('Error rejecting loan:', error);
    }
  };

  const handleCloseLoan = async (loanId) => {
    try {
      const response = await apiGet(`/loans/${loanId}/balance`);
      setClosingBalance(response.data.balance);
      setClosingLoanId(loanId);
      setIsClosing(true);
    } catch (err) {
      console.error('Error fetching balance:', err);
      alert('Failed to calculate balance');
    }
  };

  const confirmCloseLoan = async () => {
    if (!window.confirm(`Are you sure you want to close this loan by paying the remaining balance of ₹${closingBalance}?\n(இந்த கடனை ₹${closingBalance} செலுத்தி முடிக்க விரும்புகிறீர்களா?)`)) {
      return;
    }
    try {
      await apiPost(`/loans/${closingLoanId}/close`);
      alert('Loan closed successfully (கடன் வெற்றிகரமாக முடிக்கப்பட்டது)');
      setIsClosing(false);
      setClosingLoanId(null);
      fetchLoanReports();
      fetchStats();
    } catch (err) {
      console.error('Error closing loan:', err);
      alert('Failed to close loan: ' + (err.response?.data?.detail || err.message));
    }
  };

  const startEditing = (loan) => {
    setEditingLoanId(loan.id);
    setEditingLoanData({
      loan_type: loan.loan_type,
      amount: loan.amount,
      deduction: loan.deduction,
      daily_due: loan.daily_due,
      total_days: loan.total_days,
      agent_id: loan.agent_id,
      notify_sms: loan.notify_sms,
      notify_whatsapp: loan.notify_whatsapp
    });
  };

  const handleUpdateAndApprove = async (loanId) => {
    try {
      // Ensure numeric fields are correctly typed
      const payload = {
        ...editingLoanData,
        amount: parseFloat(editingLoanData.amount),
        deduction: parseFloat(editingLoanData.deduction || 0),
        daily_due: parseFloat(editingLoanData.daily_due),
        total_days: parseInt(editingLoanData.total_days),
        agent_id: editingLoanData.agent_id ? parseInt(editingLoanData.agent_id) : null
      };

      // 1. Update loan details
      await axios.put(`http://localhost:9000/loans/${loanId}`, payload);
      // 2. Approve loan
      await axios.post(`http://localhost:9000/loans/${loanId}/approve`);
      
      setEditingLoanId(null);
      fetchPendingLoans();
      fetchStats();
      alert('Loan updated and approved successfully! (கடன் விவரங்கள் மாற்றப்பட்டு அனுமதிக்கப்பட்டது)');
    } catch (error) {
      console.error('Error updating and approving loan:', error);
      alert('Error updating loan. Please check inputs. (விவரங்களைச் சேமிப்பதில் பிழை)');
    }
  };

  const themes = [
    { name: 'Professional Blue', value: 'blue', color: '#2563eb' },
    { name: 'Emerald Green', value: 'green', color: '#059669' },
    { name: 'Royal Purple', value: 'purple', color: '#7c3aed' },
    { name: 'Dark Mode', value: 'dark', color: '#1f2937' },
  ];

  return (
    <div className="container">
      {/* Top Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2.5rem',
        padding: '1.5rem',
        background: 'var(--card-bg)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--primary-color)' }}>Admin Dashboard</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Admin Management Portal (நிர்வாக மேலாண்மை தளம்)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={fetchAllData}
            style={{ width: 'auto', backgroundColor: '#10b981', fontSize: '0.9rem' }}
            title="Refresh All Data"
          >
            🔄 Refresh
          </button>
          <button 
            onClick={() => setShowChangePassword(!showChangePassword)}
            style={{ width: 'auto', backgroundColor: '#f59e0b', fontSize: '0.9rem' }}
            title="Change Admin Password"
          >
            {showChangePassword ? 'Close Password' : 'Change Password'}
          </button>
          <button 
            onClick={() => setShowLoanForm(!showLoanForm)}
            style={{ width: 'auto', backgroundColor: showLoanForm ? '#ef4444' : 'var(--primary-color)', fontSize: '0.9rem' }}
          >
            {showLoanForm ? '✕ Close Form' : '+ Create New Loan'}
          </button>
        </div>
      </div>

      {/* Password Change Modal */}
      {showChangePassword && (
        <div className="card" style={{ marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2.5rem', borderTop: '4px solid #f59e0b' }}>
          <h3 style={{ textAlign: 'center' }}>Change Password (கடவுச்சொல் மாற்றவும்)</h3>
          <form onSubmit={handlePasswordChange}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Old Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.admin_old ? 'text' : 'password'} 
                  required 
                  value={passwordData.old}
                  onChange={(e) => setPasswordData({...passwordData, old: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, admin_old: !v.admin_old }))}
                  aria-label={passwordVisibility.admin_old ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.admin_old ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>New Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.admin_new ? 'text' : 'password'} 
                  required 
                  value={passwordData.new}
                  onChange={(e) => setPasswordData({...passwordData, new: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, admin_new: !v.admin_new }))}
                  aria-label={passwordVisibility.admin_new ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.admin_new ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label>Confirm New Password</label>
              <div className="password-wrapper">
                <input 
                  type={passwordVisibility.admin_confirm ? 'text' : 'password'} 
                  required 
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisibility(v => ({ ...v, admin_confirm: !v.admin_confirm }))}
                  aria-label={passwordVisibility.admin_confirm ? 'Hide password' : 'Show password'}
                >
                  {passwordVisibility.admin_confirm ? '🙈' : '👁️'}
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
            <h2 style={{ textAlign: 'center', color: '#ef4444' }}>Loan Closure (கடன் கணக்கு முடித்தல்)</h2>
            <div style={{ margin: '1.5rem 0', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <p><strong>Loan ID (கடன் எண்):</strong> {closingLoanId}</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                Remaining Balance (நிலுவைத் தொகை): <span style={{ color: '#ef4444' }}>₹ {(closingBalance || 0).toLocaleString()}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={confirmCloseLoan}
                style={{ flex: 2, backgroundColor: '#ef4444' }}
              >
                Pay & Close (செலுத்தி முடிக்கவும்) 🏁
              </button>
              <button 
                onClick={() => setIsClosing(false)}
                style={{ flex: 1, backgroundColor: 'var(--text-muted)' }}
              >
                Cancel (ரத்து)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '2.5rem', 
        padding: '0.5rem',
        background: '#e2e8f0',
        backgroundColor: 'var(--menu-bg)',
        borderRadius: '12px',
        width: '100%',
        position: 'sticky',
        top: '64px',
        zIndex: 90,
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'overview', label: 'Overview 📊', title: 'ஒட்டுமொத்தப் பார்வை' },
          'divider',
          { id: 'staff', label: 'Staff 👥', title: 'ஊழியர்கள்' },
          { id: 'agents', label: 'Agents 👷', title: 'முகவர்கள்' },
          { id: 'customers', label: 'Customers 🤝', title: 'வாடிக்கையாளர்கள்' },
          'divider',
          { id: 'expenses', label: 'Expenses 💸', title: 'செலவுகள்' },
          { id: 'financial', label: 'Financial 💰', title: 'நிதி நிலை' },
          'divider',
          { id: 'pending_collections', label: 'Pending ⏳', title: 'நிலுவை வசூல்' },
          { id: 'reports', label: 'Reports 📑', title: 'அறிக்கைகள்' },
          'divider',
          { id: 'settings', label: 'Settings ⚙️', title: 'அமைப்புகள்' }
        ].map((item, idx) => {
          if (item === 'divider') {
            return (
              <span
                key={`div-${idx}`}
                style={{
                  width: '1px',
                  height: '28px',
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
              title={tab.title}
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                backgroundColor: isActive ? 'white' : 'transparent',
                color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
                width: 'auto',
                padding: '0.6rem 1.2rem',
                borderRadius: '999px',
                border: isActive ? '1px solid var(--primary-color)' : '1px solid transparent',
                fontWeight: 600
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            padding: '0.4rem',
            background: 'var(--card-bg)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            width: 'fit-content',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'branding', label: 'Branding 🎯' },
              { id: 'theme', label: 'Theme 🎨' },
              { id: 'advanced', label: 'Advanced 🔧' },
              { id: 'msg_payments', label: 'Msg / Payments 💬💳' }
            ].map((sub) => (
              <button 
                key={sub.id}
                onClick={() => setActiveSettingsTab(sub.id)}
                style={{ 
                  backgroundColor: activeSettingsTab === sub.id ? 'var(--primary-color)' : 'transparent',
                  color: activeSettingsTab === sub.id ? 'white' : 'var(--text-color)',
                  width: 'auto',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {settingsMsg.text && (
            <div style={{ 
              padding: '0.75rem 1rem', 
              borderRadius: '8px', 
              backgroundColor: settingsMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: settingsMsg.type === 'success' ? '#166534' : '#991b1b',
              border: '1px solid var(--border-color)'
            }}>
              {settingsMsg.text}
            </div>
          )}

          {activeSettingsTab === 'branding' && (
            <div className="card">
              <h2 style={{ marginTop: 0, color: 'var(--text-color)' }}>Branding (அமைப்பு) 🎯</h2>
              <form onSubmit={handleSettingsUpdate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>App Name</label>
                  <input 
                    type="text" 
                    value={systemSettings.app_name || ''} 
                    onChange={(e) => setSystemSettings({ ...systemSettings, app_name: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Company Name</label>
                  <input 
                    type="text" 
                    value={systemSettings.company_name || ''} 
                    onChange={(e) => setSystemSettings({ ...systemSettings, company_name: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Company Phone</label>
                  <input 
                    type="text" 
                    value={systemSettings.company_phone || ''} 
                    onChange={(e) => setSystemSettings({ ...systemSettings, company_phone: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Company Address</label>
                  <textarea 
                    value={systemSettings.company_address || ''} 
                    onChange={(e) => setSystemSettings({ ...systemSettings, company_address: e.target.value })}
                    rows="3"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Logo Upload</label>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} />
                  {systemSettings.logo_base64 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <img src={systemSettings.logo_base64} alt="logo" style={{ height: '48px' }} />
                    </div>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" style={{ width: 'auto', padding: '0.6rem 1.2rem', backgroundColor: 'var(--primary-color)' }}>
                    Save (சேமிக்கவும்)
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeSettingsTab === 'theme' && (
            <div className="card">
              <h2 style={{ marginTop: 0, color: 'var(--text-color)' }}>Theme (வண்ணம்) 🎨</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {[
                  { id: 'blue', label: 'Blue (நீலம்)', color: '#2563eb' },
                  { id: 'green', label: 'Green (பச்சை)', color: '#059669' },
                  { id: 'purple', label: 'Purple (ஊதா)', color: '#7c3aed' },
                  { id: 'teal', label: 'Teal (டீல்)', color: '#0d9488' },
                  { id: 'orange', label: 'Orange (செம்மஞ்சள்)', color: '#ea580c' },
                  { id: 'rose', label: 'Rose (ரோஸ்)', color: '#e11d48' },
                  { id: 'slate', label: 'Slate (ஸ்லேட்)', color: '#475569' },
                  { id: 'sepia', label: 'Sepia (சேபியா)', color: '#b45309' },
                  { id: 'highcontrast', label: 'High Contrast', color: '#ffd000' },
                  { id: 'dark', label: 'Dark (கருப்பு)', color: '#111827' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (onThemeChange) onThemeChange(t.id);
                      setSelectedTheme(t.id);
                      try { localStorage.setItem('theme', t.id); } catch (e) { e; }
                    }}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '0.6rem',
                      padding: '0.6rem 0.8rem',
                      backgroundColor: 'var(--card-bg)',
                      border: selectedTheme === t.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      borderRadius: '10px',
                      width: '100%',
                      color: 'var(--text-color)'
                    }}
                  >
                    <span 
                      aria-hidden="true"
                      style={{ 
                        width: '36px', 
                        height: '36px', 
                        borderRadius: '8px', 
                        backgroundColor: t.color,
                        boxShadow: selectedTheme === t.id ? '0 0 0 3px rgba(37,99,235,0.35)' : 'none',
                        border: '1px solid rgba(0,0,0,0.08)'
                      }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--text-color)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSettingsTab === 'advanced' && (
            <div className="card">
              <h2 style={{ marginTop: 0, color: 'var(--text-color)' }}>Advanced Settings (மேம்பட்ட அமைப்புகள்) 🔧</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Backup / Restore</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleBackupSettings} style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: '#10b981' }}>
                      Database Backup
                    </button>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="file" accept="application/json" onChange={handleRestoreFile} />
                    </label>
                    <button onClick={handleRestoreFromDbBackup} style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white' }}>
                      Restore DB Backup
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>Backup JSON ஐ பதிவிறக்கம் செய்து, Restore செய்வதற்கு JSON கோப்பை தேர்வு செய்யவும்.</small>
                </div>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Agent Commission (முகவர் கமிஷன்)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Enable Commission (கமிஷன் செயல்படுத்த)</div>
                    <Toggle
                      checked={!!systemSettings.commission_enabled}
                      onChange={(val) => setCommissionEnabled(val)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      disabled={!systemSettings.commission_enabled}
                      value={systemSettings.commission_percent ?? 0}
                      onChange={(e) => setSystemSettings({ ...systemSettings, commission_percent: Number(e.target.value) })}
                      style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    />
                    <span style={{ fontWeight: '700' }}>%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                    <button onClick={handleSettingsUpdate} style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: 'var(--primary-color)' }}>
                      Save
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>கமிஷன் % மட்டும் கணக்குகளில் சேர்க்கப்படும்.</small>
                </div>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Auto Backup (தானியங்கி காப்பு)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Enable Auto Backup</div>
                    <Toggle
                      checked={!!systemSettings.auto_backup_enabled}
                      onChange={(val) => setAutoBackupEnabled(val)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      disabled={!systemSettings.auto_backup_enabled}
                      value={systemSettings.auto_backup_frequency || 'daily'}
                      onChange={(e) => setSystemSettings({ ...systemSettings, auto_backup_frequency: e.target.value })}
                      style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    >
                      <option value="daily">Daily (தினசரி)</option>
                      <option value="weekly">Weekly (வாராந்திர)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button onClick={handleBackupSettings} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
                      Manual Backup
                    </button>
                    <button 
                      onClick={saveAutoBackupSettings} 
                      disabled={!systemSettings.auto_backup_enabled}
                      style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: 'var(--primary-color)', color: 'white' }}
                    >
                      Save
                    </button>
                    <button onClick={restoreFromLocalBackup} style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: '#3b82f6' }}>
                      Restore Local Backup
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>Auto backup localStorage-ல் சேமிக்கப்படும். Restore Local Backup-ஐ பயன்படுத்தலாம்.</small>
                </div>
              </div>
            </div>
          )}
          
          {activeSettingsTab === 'msg_payments' && (
            <div className="card">
              <h2 style={{ marginTop: 0, color: 'var(--text-color)' }}>Notifications & Payment Settings 💬💳</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Notifications (SMS / WhatsApp)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
                    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Provider</span>
                      <select
                        value={systemSettings.sms_provider || 'twilio'}
                        onChange={(e) => setSystemSettings({ ...systemSettings, sms_provider: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                      >
                        <option value="twilio">Twilio</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Account SID</span>
                      <input
                        type="text"
                        value={systemSettings.twilio_account_sid || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, twilio_account_sid: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Auth Token</span>
                      <div className="password-wrapper">
                        <input
                          type={passwordVisibility.twilio_auth ? 'text' : 'password'}
                          value={systemSettings.twilio_auth_token || ''}
                          onChange={(e) => setSystemSettings({ ...systemSettings, twilio_auth_token: e.target.value })}
                          style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                          placeholder="••••••••••••••••••••"
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setPasswordVisibility(v => ({ ...v, twilio_auth: !v.twilio_auth }))}
                          aria-label={passwordVisibility.twilio_auth ? 'Hide token' : 'Show token'}
                        >
                          {passwordVisibility.twilio_auth ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>SMS From</span>
                      <input
                        type="text"
                        value={systemSettings.twilio_sms_from || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, twilio_sms_from: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        placeholder="+15005550006"
                      />
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>WA From</span>
                      <input
                        type="text"
                        value={systemSettings.twilio_whatsapp_from || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, twilio_whatsapp_from: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        placeholder="whatsapp:+14155238886"
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                    <button onClick={saveNotificationKeys} style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: 'var(--primary-color)' }}>
                      Save
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>Keys சேமித்தவுடன் Approval/Payment SMS/WhatsApp அனுப்பப்படும்.</small>
                </div>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Payment Gateway</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
                    <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Enable Payments</span>
                      <Toggle
                        checked={!!systemSettings.payment_enabled}
                        onChange={(val) => setSystemSettings({ ...systemSettings, payment_enabled: !!val })}
                      />
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Provider</span>
                      <select
                        value={systemSettings.payment_provider || 'razorpay'}
                        onChange={(e) => setSystemSettings({ ...systemSettings, payment_provider: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                      >
                        <option value="razorpay">Razorpay</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Key ID</span>
                      <input
                        type="text"
                        value={systemSettings.razorpay_key_id || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, razorpay_key_id: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        placeholder="rzp_test_xxxxxxxxxxxxx"
                      />
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Key Secret</span>
                      <div className="password-wrapper">
                        <input
                          type={passwordVisibility.razorpay_secret ? 'text' : 'password'}
                          value={systemSettings.razorpay_key_secret || ''}
                          onChange={(e) => setSystemSettings({ ...systemSettings, razorpay_key_secret: e.target.value })}
                          style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                          placeholder="••••••••••••••••••••"
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setPasswordVisibility(v => ({ ...v, razorpay_secret: !v.razorpay_secret }))}
                          aria-label={passwordVisibility.razorpay_secret ? 'Hide secret' : 'Show secret'}
                        >
                          {passwordVisibility.razorpay_secret ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Webhook Secret</span>
                      <input
                        type="text"
                        value={systemSettings.razorpay_webhook_secret || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, razorpay_webhook_secret: e.target.value })}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        placeholder="whsec_xxxxxxxxxxx"
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                    <button 
                      onClick={async () => {
                        const payload = {
                          payment_enabled: !!systemSettings.payment_enabled,
                          payment_provider: systemSettings.payment_provider || 'razorpay',
                          razorpay_key_id: systemSettings.razorpay_key_id || null,
                          razorpay_key_secret: systemSettings.razorpay_key_secret || null,
                          razorpay_webhook_secret: systemSettings.razorpay_webhook_secret || null
                        };
                        try {
                          await apiPost('/settings/payments', payload);
                          setSettingsMsg({ type: 'success', text: 'Payment settings saved' });
                          try { localStorage.setItem('system_settings_last', JSON.stringify({ ...systemSettings, ...payload })); } catch (e) { e; }
                        } catch {
                          setSettingsMsg({ type: 'error', text: 'Failed to save payment settings' });
                        }
                      }}
                      style={{ width: 'auto', padding: '0.5rem 1rem', backgroundColor: 'var(--primary-color)' }}>
                      Save
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>Payments enable செய்தால் எதிர்காலத்தில் online payments இணைக்கலாம்.</small>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {showLoanForm && <div style={{ marginBottom: '2.5rem' }}><LoanForm /></div>}

      {activeTab === 'overview' && (
        <>
          {/* Overview Sub Menu */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '1.5rem', 
            padding: '0.4rem',
            background: '#f1f5f9',
            borderRadius: '10px',
            width: 'fit-content'
          }}>
            {[
              { id: 'stats', label: 'Stats 📈 (புள்ளிவிவரம்)' },
              { id: 'overdue', label: 'Overdue ⚠️ (நிலுவை)' },
              { id: 'approvals', label: 'Approvals ✅ (அனுமதி)' },
              { id: 'rejected', label: 'Rejected ❌ (நிராகரிக்கப்பட்டது)' }
            ].map((subTab) => (
              <button 
                key={subTab.id}
                onClick={() => setActiveOverviewSubTab(subTab.id)}
                style={{ 
                  backgroundColor: activeOverviewSubTab === subTab.id ? '#1e40af' : 'transparent',
                  color: activeOverviewSubTab === subTab.id ? 'white' : '#64748b',
                  width: 'auto',
                  padding: '0.5rem 1.2rem',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {subTab.label}
              </button>
            ))}
          </div>

          {activeOverviewSubTab === 'stats' && (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                  <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Loan Amount (மொத்த கடன் தொகை)</span>
                  <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0', color: 'white' }}>₹ {(stats?.total_loan_amount || 0).toLocaleString()}</h2>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }}>
                  <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Collection (மொத்த வசூல்)</span>
                  <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0', color: 'white' }}>₹ {(stats?.total_collected || 0).toLocaleString()}</h2>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}>
                  <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>Pending Collection (நிலுவைத் தொகை)</span>
                  <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0', color: 'white' }}>₹ {(stats?.total_pending_collection || 0).toLocaleString()}</h2>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
                  <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>Today's Collection (இன்றைய வசூல்)</span>
                  <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0', color: 'white' }}>₹ {(stats?.today_collection || 0).toLocaleString()}</h2>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #64748b 0%, #334155 100%)' }}>
                  <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>Rejected Loans (நிராகரிக்கப்பட்டவை)</span>
                  <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0', color: 'white' }}>₹ {(stats?.total_rejected_amount || 0).toLocaleString()}</h2>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', color: '#1e40af' }}>Financial Overview (நிதி நிலைமை)</h3>
                  <div style={{ height: '300px' }}>
                    <Bar 
                      data={{
                        labels: ['Disbursed', 'Collected', 'Expenses'],
                        datasets: [{
                          label: 'Amount (₹)',
                          data: [stats?.total_disbursed_amount || 0, stats?.total_collected || 0, stats?.total_expenses || 0],
                          backgroundColor: ['#3b82f6', '#10b981', '#ef4444'],
                          borderRadius: 6
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                      }}
                    />
                  </div>
                </div>
                <div className="card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', color: '#1e40af' }}>Collection Status (வசூல் நிலை)</h3>
                  <div style={{ height: '300px' }}>
                    <Pie 
                      data={{
                        labels: ['Collected', 'Pending'],
                        datasets: [{
                          data: [stats?.total_collected || 0, stats?.total_pending_collection || 0],
                          backgroundColor: ['#10b981', '#f59e0b'],
                          borderWidth: 1
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: activeOverviewSubTab === 'stats' ? 'repeat(auto-fit, minmax(450px, 1fr))' : '1fr', gap: '2rem' }}>
            {(activeOverviewSubTab === 'stats' || activeOverviewSubTab === 'overdue') && (
              <div className="card" style={{ borderTop: '4px solid #ef4444', minHeight: '520px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <h2 style={{ color: '#ef4444', fontSize: '1.1rem', margin: 0 }}>
                    ⚠️ Overdue Alerts (வசூல் நிலுவை) - {overdueLoans.length}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedOverdue.length > 0 && (
                      <button 
                        onClick={sendBulkReminders}
                        style={{ width: 'auto', backgroundColor: '#3b82f6', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        Send {selectedOverdue.length} Reminders 🔔
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        const filtered = getFilteredOverdueTable();
                        exportToExcel(filtered, 'Overdue_Alerts', 'OVERDUE ALERTS');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = getFilteredOverdueTable();
                        exportToPDF(filtered, 'Overdue Alerts', 'Overdue_Alerts');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="தேடு..." 
                      value={tableFilters.overdueSearch}
                      onChange={(e) => setTableFilters({...tableFilters, overdueSearch: e.target.value})}
                      style={{ width: '200px', padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
                {overdueLoans.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No overdue collections today (இன்று வசூல் நிலுவை ஏதுமில்லை).</p>
                ) : (
                  <div style={{ maxHeight: activeOverviewSubTab === 'overdue' ? 'none' : '420px', overflowY: 'auto', overflowX: 'hidden' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>
                            <input 
                              type="checkbox" 
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOverdue(overdueLoans.map(l => l.id));
                                } else {
                                  setSelectedOverdue([]);
                                }
                              }}
                              checked={selectedOverdue.length === overdueLoans.length && overdueLoans.length > 0}
                            />
                          </th>
                          <th>Customer (வாடிக்கையாளர்)</th>
                          <th>Amount (தொகை)</th>
                          <th>Action (செயல்)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(getFilteredOverdueTable() || []).map((loan, idx) => (
                          <tr key={loan.id || idx}>
                            <td>
                              <input 
                                type="checkbox" 
                                checked={selectedOverdue.includes(loan.id)}
                                onChange={() => toggleSelectLoan(loan.id)}
                              />
                            </td>
                            <td>
                              <strong>{loan.customer_name}</strong><br/>
                              <small style={{ color: 'var(--text-muted)' }}>{loan.customer_phone}</small>
                            </td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>₹ {(loan.overdue_amount || 0).toLocaleString()}</td>
                            <td>
                              <button 
                                onClick={() => {
                                  const raw = (loan.customer_phone || '').replace(/\D/g, '');
                                  const wa = raw.length === 12 && raw.startsWith('91') ? raw : (raw.length === 10 ? `91${raw}` : raw);
                                  window.open(`https://wa.me/${wa}?text=Dear ${loan.customer_name}, you have a pending payment of ₹${loan.overdue_amount}. Please pay at the earliest.`);
                                }}
                                style={{ padding: '0.4rem 0.8rem', backgroundColor: '#25D366', fontSize: '0.75rem', width: 'auto' }}
                              >
                                WhatsApp (வாட்ஸ்அப்)
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

            {(activeOverviewSubTab === 'stats' || activeOverviewSubTab === 'approvals') && (
              <div className="card" style={{ borderTop: '4px solid #10b981', minHeight: '520px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <h2 style={{ color: '#10b981', fontSize: '1.1rem', margin: 0 }}>
                    Pending Approvals (அனுமதி) - {pendingLoans.length}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button 
                      onClick={() => {
                        const filtered = getFilteredPendingTable();
                        exportToExcel(filtered, 'Active_Loans', 'PENDING APPROVALS');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = getFilteredPendingTable();
                        exportToPDF(filtered, 'Pending Approvals', 'Active_Loans');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="தேடு..." 
                      value={tableFilters.pendingSearch}
                      onChange={(e) => setTableFilters({...tableFilters, pendingSearch: e.target.value})}
                      style={{ width: '200px', padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
                {pendingLoans.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No pending requests (நிலுவையில் விண்ணப்பங்கள் இல்லை).</p>
                ) : (
                  <div style={{ maxHeight: activeOverviewSubTab === 'approvals' ? 'none' : '420px', overflowY: 'auto', overflowX: 'hidden' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Customer / Details (வாடிக்கையாளர் / விவரங்கள்)</th>
                          <th>Amount & Terms (தொகை மற்றும் தவணை)</th>
                          <th>Actions (செயல்)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(getFilteredPendingTable() || []).map((loan, idx) => (
                          <tr key={loan.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '1rem' }}>
                              <strong>{loan.customer?.name || 'Unknown Customer'}</strong><br/>
                              <small style={{ color: 'var(--text-muted)' }}>{loan.loan_type} | ID: {loan.id}</small>
                              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                                Phone: {loan.customer?.phone}
                              </div>
                            </td>
                          <td style={{ padding: '1rem' }}>
                            {editingLoanId === loan.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '150px' }}>
                                <div>
                                  <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '2px' }}>Type</label>
                                  <select 
                                    value={editingLoanData.loan_type}
                                    onChange={(e) => setEditingLoanData({...editingLoanData, loan_type: e.target.value})}
                                    style={{ padding: '0.2rem', fontSize: '0.8rem', width: '100%' }}
                                  >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                  </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Amount</label>
                                    <input 
                                      type="number" 
                                      value={editingLoanData.amount}
                                      onChange={(e) => setEditingLoanData({...editingLoanData, amount: e.target.value})}
                                      style={{ padding: '0.2rem', fontSize: '0.8rem', width: '100%' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Deduction</label>
                                    <input 
                                      type="number" 
                                      value={editingLoanData.deduction}
                                      onChange={(e) => setEditingLoanData({...editingLoanData, deduction: e.target.value})}
                                      style={{ padding: '0.2rem', fontSize: '0.8rem', width: '100%' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Daily Due</label>
                                    <input 
                                      type="number" 
                                      value={editingLoanData.daily_due}
                                      onChange={(e) => setEditingLoanData({...editingLoanData, daily_due: e.target.value})}
                                      style={{ padding: '0.2rem', fontSize: '0.8rem', width: '100%' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', display: 'block' }}>Days</label>
                                    <input 
                                      type="number" 
                                      value={editingLoanData.total_days}
                                      onChange={(e) => setEditingLoanData({...editingLoanData, total_days: e.target.value})}
                                      style={{ padding: '0.2rem', fontSize: '0.8rem', width: '100%' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>₹ {(loan.amount || 0).toLocaleString()}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  Due: ₹{loan.daily_due} | Days: {loan.total_days}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                                  Deduction: ₹{loan.deduction}
                                </div>
                              </>
                            )}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {editingLoanId === loan.id ? (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => handleUpdateAndApprove(loan.id)}
                                  style={{ padding: '0.4rem', backgroundColor: '#10b981', width: 'auto', fontSize: '0.7rem' }}
                                >
                                  Save & Approve
                                </button>
                                <button 
                                  onClick={() => setEditingLoanId(null)}
                                  style={{ padding: '0.4rem', backgroundColor: '#64748b', width: 'auto', fontSize: '0.7rem' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <button 
                                  onClick={() => handleApprove(loan.id)}
                                  style={{ padding: '0.4rem 0.8rem', backgroundColor: '#10b981', width: 'auto', fontSize: '0.75rem' }}
                                >
                                  Approve
                                </button>
                                <button 
                                  onClick={() => startEditing(loan)}
                                  style={{ padding: '0.4rem 0.8rem', backgroundColor: '#3b82f6', width: 'auto', fontSize: '0.75rem' }}
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => handleReject(loan.id)}
                                  style={{ padding: '0.4rem 0.8rem', backgroundColor: '#ef4444', width: 'auto', fontSize: '0.75rem' }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

            {(activeOverviewSubTab === 'stats' || activeOverviewSubTab === 'rejected') && (
              <div className="card" style={{ borderTop: '4px solid #64748b', minHeight: '520px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <h2 style={{ color: '#64748b', fontSize: '1.1rem', margin: 0 }}>
                    Rejected Loans (நிராகரிக்கப்பட்டவை) - {rejectedLoans.length}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button 
                      onClick={() => {
                        const filtered = getFilteredRejectedTable();
                        exportToExcel(filtered, 'Rejected_Loans', 'REJECTED LOANS');
                      }}
                      style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Excel 📊
                    </button>
                    <button 
                      onClick={() => {
                        const filtered = getFilteredRejectedTable();
                        exportToPDF(filtered, 'Rejected Loans', 'Rejected_Loans');
                      }}
                      style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      PDF 📄
                    </button>
                    <input 
                      type="text" 
                      placeholder="தேடு..." 
                      value={tableFilters.rejectedSearch}
                      onChange={(e) => setTableFilters({...tableFilters, rejectedSearch: e.target.value})}
                      style={{ width: '200px', padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
                {rejectedLoans.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No rejected loans (நிராகரிக்கப்பட்டவை ஏதுமில்லை).</p>
                ) : (
                  <div style={{ maxHeight: activeOverviewSubTab === 'rejected' ? 'none' : '420px', overflowY: 'auto', overflowX: 'hidden' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Customer (வாடிக்கையாளர்)</th>
                          <th>Amount (தொகை)</th>
                          <th>Reason (காரணம்)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(getFilteredRejectedTable() || []).map((loan, idx) => (
                          <tr key={loan.id || idx}>
                            <td>
                              <strong>{loan.customer?.name}</strong><br/>
                              <small style={{ color: 'var(--text-muted)' }}>{loan.customer?.phone}</small>
                            </td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>₹ {(loan.amount || 0).toLocaleString()}</td>
                            <td>{loan.reject_reason || 'No reason provided'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'staff' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {selectedStaff ? (
            <StaffRegistrationForm 
              key={`edit-staff-${selectedStaff.id}`}
              initialData={selectedStaff} 
              onComplete={() => {
                fetchStaff();
                setSelectedStaff(null);
              }} 
              onCancel={() => setSelectedStaff(null)}
            />
          ) : (
            <StaffRegistrationForm key="new-staff" onComplete={fetchStaff} />
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Staff List (ஊழியர்கள் பட்டியல்) - {staff.length}</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => {
                    const filtered = staff.filter(member => 
                      (member.full_name || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase()) ||
                      (member.username || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase())
                    );
                    exportToExcel(filtered, 'Staff_List', 'STAFF LIST');
                  }}
                  style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  Excel 📊
                </button>
                <button 
                  onClick={() => {
                    const filtered = staff.filter(member => 
                      (member.full_name || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase()) ||
                      (member.username || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase())
                    );
                    exportToPDF(filtered, 'Staff List', 'Staff_List');
                  }}
                  style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  PDF 📄
                </button>
                <input 
                  type="text" 
                  placeholder="பெயர் அல்லது ID மூலம் தேடு..." 
                  value={tableFilters.staffSearch}
                  onChange={(e) => setTableFilters({...tableFilters, staffSearch: e.target.value})}
                  style={{ width: '250px', padding: '0.4rem', fontSize: '0.85rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {(staff || []).length > 0 ? (staff || []).filter(member => 
                (member.full_name || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase()) ||
                (member.username || '').toLowerCase().includes(tableFilters.staffSearch.toLowerCase())
              ).map((member, idx) => (
                <div 
                  key={member.id || idx} 
                  className="card" 
                  onClick={() => setSelectedStaff(member)}
                  style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    alignItems: 'center', 
                    padding: '1rem', 
                    border: selectedStaff?.id === member.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {member.photo ? (
                      <img src={member.photo} alt="Staff" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '1.5rem' }}>👤</span>
                    )}
                  </div>
                  <div>
                    <h4 style={{ margin: 0 }}>{member.full_name || member.username}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{member.role.toUpperCase()}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {member.username}</p>
                  </div>
                  <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                    Click to Edit
                  </div>
                </div>
              )) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No staff members found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {selectedAgent ? (
            <AgentRegistrationForm 
              key={`edit-agent-${selectedAgent.id}`}
              initialData={selectedAgent} 
              onComplete={() => {
                fetchAgents();
                setSelectedAgent(null);
              }} 
              onCancel={() => setSelectedAgent(null)}
            />
          ) : (
            <AgentRegistrationForm key="new-agent" onComplete={fetchAgents} />
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Active Agents (ஏஜெண்டுகள் பட்டியல்) - {agents.length}</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => {
                    const filtered = agents.filter(agent => 
                      (agent.full_name || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase()) ||
                      (agent.username || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase())
                    );
                    exportToExcel(filtered, 'Agent_List', 'AGENT LIST');
                  }}
                  style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  Excel 📊
                </button>
                <button 
                  onClick={() => {
                    const filtered = agents.filter(agent => 
                      (agent.full_name || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase()) ||
                      (agent.username || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase())
                    );
                    exportToPDF(filtered, 'Agent List', 'Agent_List');
                  }}
                  style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  PDF 📄
                </button>
                <input 
                  type="text" 
                  placeholder="பெயர் அல்லது ID மூலம் தேடு..." 
                  value={tableFilters.agentSearch}
                  onChange={(e) => setTableFilters({...tableFilters, agentSearch: e.target.value})}
                  style={{ width: '250px', padding: '0.4rem', fontSize: '0.85rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {agents.filter(agent => 
                (agent.full_name || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase()) ||
                (agent.username || '').toLowerCase().includes(tableFilters.agentSearch.toLowerCase())
              ).map(agent => (
                <div 
                  key={agent.id} 
                  className="card" 
                  onClick={() => setSelectedAgent(agent)}
                  style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    alignItems: 'center', 
                    padding: '1rem', 
                    border: selectedAgent?.id === agent.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {agent.photo ? (
                    <img src={agent.photo} alt={agent.full_name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <span style={{ fontSize: '1.5rem' }}>👤</span>
                    </div>
                  )}
                  <div>
                    <h4 style={{ margin: 0 }}>{agent.full_name}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{agent.phone}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {agent.username}</p>
                  </div>
                  <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                    Click to Edit
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {selectedCustomer ? (
            <CustomerRegistrationForm 
              key={`edit-customer-${selectedCustomer.id}`}
              initialData={selectedCustomer} 
              onComplete={() => {
                fetchCustomers();
                setSelectedCustomer(null);
              }} 
              onCancel={() => setSelectedCustomer(null)}
            />
          ) : (
            <CustomerRegistrationForm key="new-customer" onComplete={fetchCustomers} />
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Customer List (வாடிக்கையாளர்கள் பட்டியல்) - {customers.length}</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => {
                    const filtered = customers.filter(customer => 
                      (customer.name || '').toLowerCase().includes(tableFilters.customerSearch.toLowerCase()) ||
                      (customer.phone || '').includes(tableFilters.customerSearch)
                    );
                    exportToExcel(filtered, 'Customer_List', 'CUSTOMER LIST');
                  }}
                  style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  Excel 📊
                </button>
                <button 
                  onClick={() => {
                    const filtered = customers.filter(customer => 
                      (customer.name || '').toLowerCase().includes(tableFilters.customerSearch.toLowerCase()) ||
                      (customer.phone || '').includes(tableFilters.customerSearch)
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
                  value={tableFilters.customerSearch}
                  onChange={(e) => setTableFilters({...tableFilters, customerSearch: e.target.value})}
                  style={{ width: '250px', padding: '0.4rem', fontSize: '0.85rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {(customers || []).filter(customer => 
                (customer.name || '').toLowerCase().includes((tableFilters.customerSearch || '').toLowerCase()) ||
                (customer.phone || '').includes(tableFilters.customerSearch || '')
              ).map((customer, idx) => (
                <div 
                  key={customer.id || idx} 
                  className="card" 
                  onClick={() => setSelectedCustomer(customer)}
                  style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    alignItems: 'center', 
                    padding: '1rem', 
                    border: selectedCustomer?.id === customer.id ? '2px solid #10b981' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {customer.photo ? (
                    <img src={customer.photo} alt={customer.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.5rem' }}>👤</span>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      Edit (திருத்தவும்)
                    </div>
                    <h4 style={{ margin: 0 }}>{customer.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{customer.phone}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && <ExpenseEntry user={user} userRole="admin" systemSettings={systemSettings} />}

      {activeTab === 'financial' && (
        <FinancialReport
          stats={stats}
          financialReport={financialReport}
          fetchLoanReports={fetchLoanReports}
          loadingReports={loadingReports}
          systemSettings={systemSettings}
        />
      )}

      {activeTab === 'pending_collections' && (
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

      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Reports Sub-Menu */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            padding: '0.4rem',
            background: 'var(--card-bg)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            width: 'fit-content',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'expense', label: 'Expense (செலவு) 💸' },
              { id: 'agent_collection', label: 'Agent Wise (முகவர் வாரியாக) 👷' },
              { id: 'commission', label: 'Commission (கமிஷன்) 💰' },
              { id: 'overdue', label: 'Overdue (நிலுவை) ⏳' },
              { id: 'collection', label: 'Collection (வசூல்) 🧾' },
              { id: 'loan', label: 'Loan (கடன்) 📑' }
            ].map((sub) => (
              <button 
                key={sub.id}
                onClick={() => setActiveReportSubTab(sub.id)}
                style={{ 
                  backgroundColor: activeReportSubTab === sub.id ? 'var(--primary-color)' : 'transparent',
                  color: activeReportSubTab === sub.id ? 'white' : 'var(--text-color)',
                  width: 'auto',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {activeReportSubTab === 'expense' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Detailed Expense Report (செலவு அறிக்கை) - {getFilteredExpenses().length}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button 
                    onClick={() => exportToExcel(getFilteredExpenses(), 'Expense_Report', 'DETAILED EXPENSE REPORT')}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => exportToPDF(getFilteredExpenses(), 'Detailed Expense Report', 'Expense_Report')}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                  </div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Date (தேதி)</th>
                      <th style={{ padding: '0.75rem' }}>Description (விவரம்)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount (தொகை)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredExpenses().length === 0 ? (
                      <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No expense records found.</td></tr>
                    ) : (
                      getFilteredExpenses().map((exp, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{formatDate(exp.date)}</td>
                          <td style={{ padding: '0.75rem' }}>{exp.description}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(exp.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportSubTab === 'agent_collection' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Agent Wise Collection (முகவர் வாரியான வசூல்) - {(stats?.agent_reports || []).length}</h2>
                <button onClick={fetchLoanReports} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                  Refresh Data (புதுப்பிக்கவும்)
                </button>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Agent Name (முகவர் பெயர்)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Collected Amount (வசூல் தொகை)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats?.agent_reports || []).map(report => (
                      <tr key={report.agent_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem' }}>{report.agent_name}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(report.total_collected || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {(stats?.agent_reports || []).length === 0 && (
                      <tr>
                        <td colSpan="2" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No reports available (அறிக்கைகள் இல்லை).</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportSubTab === 'commission' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Agent Commission Report (முகவர் கமிஷன் அறிக்கை)</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => exportToExcel(commissionReport, 'Commission_Report', 'AGENT COMMISSION REPORT')}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => exportToPDF(commissionReport, 'Agent Commission Report', 'Commission_Report')}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Agent Name (முகவர் பெயர்)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Collections (மொத்த வசூல்)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>
                        Commission Earned {systemSettings.commission_enabled ? `(கமிஷன் - ${Number(systemSettings.commission_percent || 0)}%)` : '(Disabled)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(commissionReport || []).length === 0 ? (
                      <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No records found.</td></tr>
                    ) : (
                      (commissionReport || []).map((item, idx) => {
                        const pct = Number(systemSettings.commission_percent || 0);
                        const total = Number(item.total_collections || 0);
                        const earned = systemSettings.commission_enabled ? (total * pct) / 100 : 0;
                        return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{item.agent_name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>₹ {(item.total_collections || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>₹ {earned.toLocaleString()}</td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportSubTab === 'overdue' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Overdue Alerts Report (வசூல் நிலுவை அறிக்கை) - {getFilteredOverdue().length}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button 
                    onClick={() => {
                      const reportData = getFilteredOverdue().map(loan => ({
                        'Customer Name': loan.customer_name || 'N/A',
                        'Phone': loan.customer_phone || 'N/A',
                        'Loan Type': loan.loan_type || 'N/A',
                        'Overdue Amount': loan.overdue_amount || 0,
                        'Last Paid Date': loan.last_paid_date || 'Never'
                      }));
                      exportToExcel(reportData, 'Overdue_Alerts', 'OVERDUE ALERTS REPORT');
                    }}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => exportToPDF(getFilteredOverdue(), 'Overdue Alerts Report', 'Overdue_Alerts')}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                  </div>
                  <input 
                    type="text" 
                    placeholder="Customer Name (வாடிக்கையாளர்)..."
                    value={reportFilters.customer}
                    onChange={(e) => setReportFilters({...reportFilters, customer: e.target.value})}
                    style={{ width: '180px', padding: '0.4rem', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Customer (வாடிக்கையாளர்)</th>
                      <th style={{ padding: '0.75rem' }}>Phone (தொலைபேசி)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Overdue Amount (நிலுவைத் தொகை)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredOverdue().length === 0 ? (
                      <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No overdue records found.</td></tr>
                    ) : (
                      getFilteredOverdue().map((loan, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{loan.customer_name}</td>
                          <td style={{ padding: '0.75rem' }}>{loan.customer_phone}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>₹ {(loan.overdue_amount || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportSubTab === 'collection' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Collection Reports (வசூல் அறிக்கைகள்) - {getFilteredCollections().length}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button 
                    onClick={() => exportToExcel(getFilteredCollections(), 'Collection_Report', 'COLLECTION REPORT')}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => exportToPDF(getFilteredCollections(), 'Collection Report', 'Collection_Report')}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
              </div>
                  <button 
                    onClick={() => setReportFilters({ customer: '', agent: '', startDate: '', endDate: '' })}
                    style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#64748b' }}
                  >
                    Clear (அழிக்கவும்) 🔄
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Date (தேதி)</th>
                      <th style={{ padding: '0.75rem' }}>Customer (வாடிக்கையாளர்)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount (தொகை)</th>
                      <th style={{ padding: '0.75rem' }}>Agent (முகவர்)</th>
                      <th style={{ padding: '0.75rem' }}>Action (செயல்)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingReports ? (
                      <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                    ) : getFilteredCollections().length === 0 ? (
                      <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No collections found (வசூல் விவரங்கள் இல்லை).</td></tr>
                    ) : (
                      getFilteredCollections().map((coll, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{coll.date ? new Date(coll.date).toLocaleString() : 'N/A'}</td>
                          <td style={{ padding: '0.75rem' }}>{coll.customer_name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(coll.amount || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem' }}>{coll.agent_name}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <button 
                              onClick={() => window.open(`http://localhost:9000/transactions/${coll.id}/receipt`)}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#10b981', width: 'auto' }}
                              title="Download Receipt"
                            >
                              Receipt (ரசீது) 🧾
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportSubTab === 'loan' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Loan Report (கடன் அறிக்கை) 📑 - {getFilteredLoanReports().length}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => exportToExcel(getFilteredLoanReports(), 'Loan_Report', 'DETAILED LOAN REPORT')}
                    style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Excel 📊
                  </button>
                  <button 
                    onClick={() => exportToPDF(getFilteredLoanReports(), 'Detailed Loan Report', 'Loan_Report')}
                    style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    PDF 📄
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ 
                background: '#f8fafc', 
                padding: '1rem', 
                borderRadius: '8px', 
                marginBottom: '1.5rem',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>Customer (வாடிக்கையாளர்)</label>
                      <input 
                        type="text" 
                        placeholder="Search customer..." 
                        value={reportFilters.customer}
                        onChange={(e) => setReportFilters({...reportFilters, customer: e.target.value})}
                        style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>Agent (முகவர்)</label>
                      <input 
                        type="text" 
                        placeholder="Search agent..." 
                        value={reportFilters.agent}
                        onChange={(e) => setReportFilters({...reportFilters, agent: e.target.value})}
                        style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>Status (நிலை)</label>
                      <select 
                        value={reportFilters.status}
                        onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                        style={{ 
                          padding: '0.6rem', 
                          fontSize: '1rem', 
                          fontWeight: 'bold',
                          borderRadius: '8px', 
                          border: '3px solid #1e40af', 
                          backgroundColor: '#ffffff',
                          color: '#000000',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        <option value="all">All (அனைத்தும்)</option>
                        <option value="active">Active (நடப்பில் உள்ள)</option>
                        <option value="closed">Closed (முடிக்கப்பட்ட)</option>
                        <option value="rejected">Rejected (நிராகரிக்கப்பட்ட)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e40af', marginLeft: '0.2rem' }}>From Date (தொடக்க தேதி)</label>
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
                  </div>
                </div>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>Customer (வாடிக்கையாளர்)</th>
                      <th style={{ padding: '0.75rem' }}>Address (முகவரி)</th>
                      <th style={{ padding: '0.75rem' }}>Type (வகை)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount (தொகை)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Balance (மீதம்)</th>
                      <th style={{ padding: '0.75rem' }}>Agent (முகவர்)</th>
                      <th style={{ padding: '0.75rem' }}>Status (நிலை)</th>
                      <th style={{ padding: '0.75rem' }}>Next Due (அடுத்த தவணை)</th>
                      <th style={{ padding: '0.75rem' }}>Action (செயல்)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredLoanReports().length === 0 ? (
                      <tr><td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No loans found (கடன் விவரங்கள் இல்லை).</td></tr>
                    ) : (
                      (getFilteredLoanReports() || []).map((loan, idx) => (
                        <tr key={loan.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>{loan.id}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ fontWeight: '500' }}>{loan.customer_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{loan.customer_phone}</div>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={loan.customer_address}>
                            {loan.customer_address || 'N/A'}
                          </td>
                          <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{loan.loan_type}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>₹ {(loan.amount || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>₹ {(loan.balance_due || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem' }}>{loan.agent_name}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem',
                              backgroundColor: loan.status === 'active' ? '#dcfce7' : loan.status === 'pending' ? '#fef9c3' : '#fee2e2',
                              color: loan.status === 'active' ? '#166534' : loan.status === 'pending' ? '#854d0e' : '#991b1b'
                            }}>
                              {(loan.status || '').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                            {formatDate(loan.next_due_date) || 'N/A'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {(loan.status === 'active' || loan.status === 'closed') && (
                              <button 
                                onClick={() => window.open(`http://localhost:9000/loans/${loan.id}/sanction`)}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3b82f6', width: 'auto', marginRight: '0.3rem' }}
                                title="Download Sanction Letter"
                              >
                                PDF 📄
                              </button>
                            )}
                            {loan.status === 'active' && (
                              <button 
                                onClick={() => handleCloseLoan(loan.id)}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#ef4444', width: 'auto' }}
                                title="Close Loan (Advance Payment)"
                              >
                                Close (முடிக்கவும்) 🏁
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
