import React from 'react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function FinancialReport({ stats, financialReport, fetchLoanReports, loadingReports, systemSettings }) {
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

  const exportToExcel = () => {
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
    rows.push(["FINANCIAL REPORT"]);
    rows.push([`Generated on: ${formatDateTime(new Date())}`]);
    rows.push([]);

    // Summary Section
    rows.push(["QUICK SUMMARY"]);
    rows.push(["Description", "Amount"]);
    rows.push(["Total Disbursed", financialReport.summary?.total_disbursed || 0]);
    rows.push(["Total Collected", financialReport.summary?.total_collected || 0]);
    rows.push(["Total Expenses", financialReport.summary?.total_expenses || 0]);
    rows.push(["Net Profit / Loss", financialReport.summary?.net_profit || 0]);
    rows.push([]);

    // Income Section
    rows.push(["INCOME"]);
    rows.push(["Description", "Amount"]);
    rows.push(["Interest Earned", financialReport.summary?.interest_earned || 0]);
    rows.push([]);

    // Expenses Section
    rows.push(["EXPENSES BREAKDOWN"]);
    rows.push(["Category", "Amount"]);
    (financialReport.expenses_breakdown || []).forEach(exp => {
      rows.push([exp.category, exp.total]);
    });
    rows.push([]);

    // Balance Sheet - Assets
    rows.push(["ASSETS"]);
    rows.push(["Name", "Amount"]);
    financialReport.balance_sheet?.assets.forEach(asset => {
      rows.push([asset.name, asset.amount]);
    });
    rows.push(["Total Assets", financialReport.balance_sheet?.total_assets || 0]);
    rows.push([]);

    // Balance Sheet - Liabilities
    rows.push(["LIABILITIES & EQUITY"]);
    rows.push(["Name", "Amount"]);
    financialReport.balance_sheet?.liabilities.forEach(liab => {
      rows.push([liab.name, liab.amount]);
    });
    rows.push(["Retained Earnings", financialReport.summary?.net_profit || 0]);
    rows.push(["Total Liabilities & Equity", (financialReport.balance_sheet?.total_liabilities || 0) + (financialReport.summary?.net_profit || 0)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
    XLSX.writeFile(wb, "Financial_Report.xlsx");
  };

  const exportToPDF = () => {
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
          addrLines.forEach((line, i) => {
            if (i < 3) { doc.text(line, 45, addrY); addrY += 4; }
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
      doc.text("FINANCIAL REPORT", 14, headerY);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(120);
      doc.text(`Date: ${formatDateTime(new Date())}`, 14, headerY + 6);

      let currentY = headerY + 15;

      // Summary Table
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text("Quick Summary", 14, currentY);
      autoTable(doc, {
        head: [["Description", "Amount"]],
        body: [
          ["Total Disbursed", `Rs. ${(financialReport.summary?.total_disbursed || 0).toLocaleString()}`],
          ["Total Collected", `Rs. ${(financialReport.summary?.total_collected || 0).toLocaleString()}`],
          ["Total Expenses", `Rs. ${(financialReport.summary?.total_expenses || 0).toLocaleString()}`],
          ["Net Profit / Loss", `Rs. ${(financialReport.summary?.net_profit || 0).toLocaleString()}`]
        ],
        startY: currentY + 5,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] }
      });

      currentY = doc.lastAutoTable.finalY + 10;

      // Expenses Table
      doc.text("Expenses Breakdown", 14, currentY);
      autoTable(doc, {
        head: [["Category", "Amount"]],
        body: (financialReport.expenses_breakdown || []).map(exp => [exp.category, `Rs. ${(exp.total || 0).toLocaleString()}`]),
        startY: currentY + 5,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] }
      });

      currentY = doc.lastAutoTable.finalY + 10;

      // Assets Table
      doc.text("Assets", 14, currentY);
      autoTable(doc, {
        head: [["Name", "Amount"]],
        body: (financialReport.balance_sheet?.assets || []).map(asset => [asset.name, `Rs. ${(asset.amount || 0).toLocaleString()}`]).concat([
          [{ content: "Total Assets", styles: { fontStyle: 'bold' } }, { content: `Rs. ${(financialReport.balance_sheet?.total_assets || 0).toLocaleString()}`, styles: { fontStyle: 'bold' } }]
        ]),
        startY: currentY + 5,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] }
      });

      currentY = doc.lastAutoTable.finalY + 10;

      // Liabilities Table
      doc.text("Liabilities & Equity", 14, currentY);
      autoTable(doc, {
        head: [["Name", "Amount"]],
        body: (financialReport.balance_sheet?.liabilities || []).map(liab => [liab.name, `Rs. ${(liab.amount || 0).toLocaleString()}`]).concat([
          ["Retained Earnings", `Rs. ${(financialReport.summary?.net_profit || 0).toLocaleString()}`],
          [{ content: "Total Liabilities & Equity", styles: { fontStyle: 'bold' } }, { content: `Rs. ${((financialReport.balance_sheet?.total_liabilities || 0) + (financialReport.summary?.net_profit || 0)).toLocaleString()}`, styles: { fontStyle: 'bold' } }]
        ]),
        startY: currentY + 5,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] }
      });

      doc.save("Financial_Report.pdf");
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("PDF உருவாக்குவதில் பிழை ஏற்பட்டது: " + error.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Financial Reports (நிதி அறிக்கைகள்)</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={exportToExcel}
              style={{ width: 'auto', backgroundColor: '#10b981', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Excel 📊
            </button>
            <button 
              onClick={exportToPDF}
              style={{ width: 'auto', backgroundColor: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              PDF 📄
            </button>
            <button onClick={fetchLoanReports} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
              Refresh Data (புதுப்பிக்கவும்)
            </button>
          </div>
        </div>

        {/* Quick Summary moved to Top */}
        <div style={{ marginBottom: '2rem' }}>
          <h3>Quick Summary (சுருக்கமான விவரம்)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '8px', borderLeft: '4px solid #0ea5e9' }}>
              <div style={{ fontSize: '0.9rem', color: '#0369a1' }}>Total Disbursed (வழங்கப்பட்ட தொகை)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>₹ {(financialReport.summary?.total_disbursed || 0).toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', borderLeft: '4px solid #22c55e' }}>
              <div style={{ fontSize: '0.9rem', color: '#15803d' }}>Total Collected (வசூலிக்கப்பட்ட தொகை)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>₹ {(financialReport.summary?.total_collected || 0).toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#fff7ed', borderRadius: '8px', borderLeft: '4px solid #f97316' }}>
              <div style={{ fontSize: '0.9rem', color: '#c2410c' }}>Pending Collection (நிலுவை வசூல்)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>₹ {(financialReport.summary?.pending_collection || 0).toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.9rem', color: '#b91c1c' }}>Total Expenses (மொத்த செலவுகள்)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>₹ {(financialReport.summary?.total_expenses || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        {/* Profit & Loss Section */}
        <div style={{ marginBottom: '3rem' }}>
          <h3 style={{ borderBottom: '2px solid var(--primary-color)', paddingBottom: '0.5rem' }}>
            Profit & Loss Statement (லாப நஷ்ட கணக்கு)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h4 style={{ color: '#10b981' }}>Income (வருமானம்)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem' }}>Total Interest Earned (ஈட்டிய வட்டி)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                      ₹ {(financialReport.summary?.interest_earned || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 'bold' }}>
                    <td style={{ padding: '0.75rem' }}>Total Income (மொத்த வருமானம்)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      ₹ {(financialReport.summary?.interest_earned || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h4 style={{ color: '#ef4444' }}>Expenses (செலவுகள்)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {(financialReport.expenses_breakdown || []).map((exp, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{exp.category}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        ₹ {(exp.total || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#fef2f2', fontWeight: 'bold' }}>
                    <td style={{ padding: '0.75rem' }}>Total Expenses (மொத்த செலவுகள்)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      ₹ {(financialReport.summary?.total_expenses || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            backgroundColor: (financialReport.summary?.net_profit || 0) >= 0 ? '#dcfce7' : '#fee2e2',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '1.2rem',
            fontWeight: 'bold'
          }}>
            Net Profit / Loss (நிகர லாபம் / நஷ்டம்): 
            <span style={{ marginLeft: '1rem', color: (financialReport.summary?.net_profit || 0) >= 0 ? '#166534' : '#991b1b' }}>
              ₹ {(financialReport.summary?.net_profit || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Balance Sheet Section */}
        <div>
          <h3 style={{ borderBottom: '2px solid var(--primary-color)', paddingBottom: '0.5rem' }}>
            Balance Sheet (இருப்புநிலை குறிப்பு)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h4 style={{ color: 'var(--primary-color)' }}>Assets (சொத்துக்கள்)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {(financialReport.balance_sheet?.assets || []).map((asset, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{asset.name}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        ₹ {(asset.amount || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                    <td style={{ padding: '0.75rem' }}>Total Assets (மொத்த சொத்துக்கள்)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      ₹ {(financialReport.balance_sheet?.total_assets || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h4 style={{ color: 'var(--primary-color)' }}>Liabilities & Equity (பொறுப்புகள் மற்றும் மூலதனம்)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {(financialReport.balance_sheet?.liabilities || []).map((liab, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{liab.name}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        ₹ {(liab.amount || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem' }}>Retained Earnings (Net Profit) (நிகர லாபம்)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      ₹ {(financialReport.summary?.net_profit || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                    <td style={{ padding: '0.75rem' }}>Total Liabilities & Equity (மொத்த பொறுப்புகள் மற்றும் மூலதனம்)</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      ₹ {((financialReport.balance_sheet?.total_liabilities || 0) + (financialReport.summary?.net_profit || 0)).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinancialReport;
