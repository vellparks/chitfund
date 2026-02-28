import os
import io
import base64
import json
import shutil
import tempfile
import zipfile
import platform
import uuid
import hashlib
import subprocess
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_file, g, Response, send_from_directory
from flask_cors import CORS
from sqlalchemy import func, text, or_, inspect
from sqlalchemy.orm import Session
from werkzeug.utils import secure_filename
from fpdf import FPDF

import models
import database
import schemas
import notifications
from translations import TRANSLATIONS

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# Database Dependency Injection
@app.before_request
def get_db():
    if not hasattr(g, 'db'):
        g.db = database.SessionLocal()

@app.teardown_request
def close_db(exception):
    if hasattr(g, 'db'):
        g.db.close()

# Helper Functions
def get_label(key, langs):
    """
    Retrieve label from TRANSLATIONS based on priority of langs.
    langs: list of language strings, e.g. ["Tamil", "English"]
    """
    if not langs:
        langs = ["English"]
    
    # Check if key exists in translations
    if key not in TRANSLATIONS:
        return key
    
    entry = TRANSLATIONS[key]
    
    # Try to find translation in order of preference
    for lang in langs:
        if lang in entry:
            return entry[lang]
            
    # Fallback to English
    return entry.get("English", key)

def normalize_indian_phone(phone_str: str) -> str:
    if not phone_str:
        return ""
    digits = "".join(filter(str.isdigit, phone_str))
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    elif len(digits) > 10 and digits.startswith("0"):
        digits = digits[-10:]
    return digits

def sanitize_kyc(customer_data):
    if 'phone' in customer_data:
        customer_data['phone'] = normalize_indian_phone(customer_data['phone'])
    if 'aadhaar_no' in customer_data:
        customer_data['aadhaar_no'] = "".join(filter(str.isdigit, customer_data.get('aadhaar_no', '') or ''))
    if 'pan_no' in customer_data:
        customer_data['pan_no'] = (customer_data.get('pan_no', '') or '').upper().replace(" ", "")
    return customer_data

# PDF Helper Functions
def add_sanction_page(pdf, loan, settings, company_name, company_address, company_phone, langs=["English"]):
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Check if tamilfont is registered
    has_font = "tamilfont" in pdf.fonts
    font_family = "tamilfont" if has_font else "Helvetica"
    bold_family = "tamilfont" if has_font else "Helvetica"
    
    # Use slightly larger font for Indic scripts
    is_indic = any(l != "English" for l in langs)
    base_size = 11 if is_indic else 10
    title_size = 15 if is_indic else 14
    header_size = 17 if is_indic else 16
    
    # Header with Logo
    header_y = 10
    if settings and settings.logo_base64:
        try:
            # Handle base64 logo
            logo_data = settings.logo_base64
            if "base64," in logo_data:
                logo_data = logo_data.split("base64,")[1]
            
            img_data = base64.b64decode(logo_data)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(img_data)
                tmp_path = tmp.name
            
            # Place logo centered on top
            pdf.image(tmp_path, x=90, y=10, w=30)
            os.unlink(tmp_path)
            header_y = 42
        except Exception:
            header_y = 10
    else:
        header_y = 10
    
    # Header
    pdf.set_font(bold_family, "B", header_size)
    pdf.set_y(header_y)
    
    # Handle company name capitalization for English only
    display_name = company_name.upper() if "English" in langs else company_name
    pdf.cell(190, 10, display_name, ln=True, align="C")
    
    pdf.set_font(font_family, "", base_size)
    
    # Process address to move pincode if it's on a new line
    processed_address = company_address
    if company_address:
        lines = [line.strip() for line in company_address.split('\n') if line.strip()]
        if len(lines) > 1:
            last_line = lines[-1]
            if last_line.isdigit() and len(last_line) == 6:
                pincode = last_line
                other_lines = lines[:-1]
                other_lines[-1] = f"{other_lines[-1]} - {pincode}"
                processed_address = "\n".join(other_lines)
            elif len(last_line) <= 10 and any(c.isdigit() for c in last_line):
                 pincode = last_line
                 other_lines = lines[:-1]
                 other_lines[-1] = f"{other_lines[-1]} {pincode}"
                 processed_address = "\n".join(other_lines)
    
    pdf.cell(190, 5, processed_address, ln=True, align="C")
    
    phone_label = get_label("Phone", langs)
    pdf.cell(190, 5, f"{phone_label}: {company_phone}", ln=True, align="C")
    pdf.ln(5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    # Title
    pdf.set_font(font_family, "B", title_size)
    title = get_label("LOAN SANCTION LETTER", langs)
    pdf.cell(190, 8, title, ln=True, align="C")
    pdf.ln(2)
    
    # Date and Reference
    pdf.set_font(font_family, "", base_size)
    today = datetime.now().strftime("%d/%m/%Y")
    
    date_label = get_label("Date", langs)
    id_label = get_label("Loan ID", langs)
    
    pdf.cell(190, 5, f"{date_label}: {today}", ln=True, align="R")
    pdf.cell(190, 5, f"{id_label}: L-{loan.id}", ln=True, align="R")
    pdf.ln(2)
    
    # Customer Details
    customer = loan.customer
    pdf.set_font(font_family, "B", base_size)
    pdf.set_x(10)
    
    to_label = get_label("To,", langs)
    pdf.cell(0, 6, to_label, ln=1, align="L")
    pdf.set_font(font_family, "", base_size)
    pdf.set_x(10)
    
    # Use language-specific name/address if available, else default
    name_parts = []
    if "Tamil" in langs and customer.name_tamil:
        name_parts.append(customer.name_tamil)
    if "English" in langs or not name_parts:
        name_parts.append(customer.name)
    name_to_use = " / ".join(name_parts)
    
    address_parts = []
    if "Tamil" in langs and customer.address_tamil:
        address_parts.append(customer.address_tamil)
    if "English" in langs or not address_parts:
        address_parts.append(customer.address)
    address_to_use = " / ".join(address_parts)
    
    pdf.cell(0, 6, f"{name_to_use}", ln=1, align="L")
    pdf.set_x(10)
    
    addr_label = get_label("Address", langs)
    pdf.multi_cell(0, 6, f"{addr_label}: {address_to_use}", align="L")
    pdf.set_x(10)
    
    phone_label = get_label("Phone", langs)
    pdf.cell(0, 6, f"{phone_label}: {customer.phone}", ln=1, align="L")
    pdf.ln(4)
    
    # Body
    pdf.set_font(font_family, "B", base_size)
    subject = get_label("Subject: Sanction of Loan Facility", langs)
    pdf.cell(0, 6, subject, ln=True)
    pdf.ln(2)
    pdf.set_font(font_family, "", base_size)
    
    dear_label = get_label("Dear", langs)
    body_body = get_label("loan_approval_body", langs)
    
    body_text = f"{dear_label} {name_to_use}, {body_body}"
    pdf.multi_cell(0, 6, body_text)
    pdf.ln(4)
    
    # Loan Terms Table
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font(font_family, "B", base_size)
    
    desc_label = get_label("Description", langs)
    detail_label = get_label("Details", langs)
    
    pdf.cell(95, 7, desc_label, 1, 0, "L", fill=True)
    pdf.cell(95, 7, detail_label, 1, 1, "L", fill=True)
    
    pdf.set_font(font_family, "", base_size)
    
    loan_type_key = loan.loan_type.capitalize() # 'Daily', 'Weekly', 'Monthly'
    lt_translated = get_label(loan_type_key, langs)
    
    terms = [
        (get_label("Loan Amount", langs), f"Rs. {loan.amount:,.2f}"),
        (get_label("Loan Type", langs), lt_translated),
        (get_label("Disbursed Amount", langs), f"Rs. {loan.disbursed_amount:,.2f}"),
        (get_label("Due Amount", langs), f"Rs. {loan.daily_due:,.2f}"),
        (get_label("Total Duration", langs), f"{loan.total_days} {lt_translated}"),
        (get_label("Start Date", langs), f"{loan.start_date}"),
    ]
    
    for label, value in terms:
        pdf.cell(95, 7, label, 1, 0, "L")
        pdf.cell(95, 7, value, 1, 1, "L")
    
    pdf.ln(6)
    
    # Footer
    pdf.set_font(bold_family, "B", base_size)
    
    tc_label = get_label("Terms & Conditions:", langs)
    pdf.cell(0, 6, tc_label, ln=True)
    pdf.set_font(font_family, "", base_size - 1)
    
    terms_conditions = [
        get_label("term_1", langs),
        get_label("term_2", langs),
        get_label("term_3", langs)
    ]
    
    for term in terms_conditions:
        pdf.cell(0, 6, term, ln=True)
        
    pdf.ln(10)
    pdf.set_font(bold_family, "B", base_size)
    
    for_label = get_label("For", langs)
    if "Hindi" in langs:
        pdf.cell(0, 6, f"{company_name} {for_label}", ln=True, align="R")
    else:
        pdf.cell(0, 6, f"{for_label} {company_name}", ln=True, align="R")
    
    pdf.ln(12)
    
    auth_label = get_label("Authorized Signatory", langs)
    pdf.cell(0, 6, auth_label, ln=True, align="R")

def add_receipt_page(pdf, transaction, loan, customer, settings, company_name, company_address, company_phone, db, langs=["English"]):
    pdf.set_left_margin(5)
    pdf.set_right_margin(5)
    pdf.add_page()
    
    page_width = pdf.w - 10 
    
    # Check if tamilfont is registered
    has_font = "tamilfont" in pdf.fonts
    font_family = "tamilfont" if has_font else "Helvetica"
    bold_family = "tamilfont" if has_font else "Helvetica"
    
    # Header with Logo
    header_y = 5
    logo_w = 30
    if settings and settings.logo_base64:
        try:
            logo_data = settings.logo_base64
            if "base64," in logo_data:
                logo_data = logo_data.split("base64,")[1]
            img_data = base64.b64decode(logo_data)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(img_data)
                tmp_path = tmp.name
            # Center logo
            pdf.image(tmp_path, x=(pdf.w - logo_w) / 2, y=5, w=logo_w)
            os.unlink(tmp_path)
            header_y = 32
        except Exception: 
            header_y = 5
    else:
        header_y = 5
    
    pdf.set_y(header_y)
    pdf.set_font(bold_family, "B", 12)
    # Company Name
    display_name = company_name.upper() if "English" in langs else company_name
    pdf.cell(page_width, 7, display_name, ln=True, align="C")
    
    pdf.set_font(font_family, "", 9)
    
    # Process address
    processed_address = company_address
    if company_address:
        lines = [line.strip() for line in company_address.split('\n') if line.strip()]
        if len(lines) > 1:
            last_line = lines[-1]
            if last_line.isdigit() and len(last_line) == 6:
                pincode = last_line
                other_lines = lines[:-1]
                other_lines[-1] = f"{other_lines[-1]} - {pincode}"
                processed_address = "\n".join(other_lines)
            elif len(last_line) <= 10 and any(c.isdigit() for c in last_line):
                 pincode = last_line
                 other_lines = lines[:-1]
                 other_lines[-1] = f"{other_lines[-1]} {pincode}"
                 processed_address = "\n".join(other_lines)
    
    display_phone = company_phone if company_phone and company_phone != "N/A" else (settings.company_phone if settings and settings.company_phone else "N/A")
    
    pdf.set_x(5)
    pdf.multi_cell(page_width, 4, processed_address, align="C")
    
    phone_label = get_label("Phone", langs)
    pdf.set_x(5)
    pdf.cell(page_width, 5, f"{phone_label}: {display_phone}", ln=True, align="C")
    pdf.ln(2)
    pdf.line(5, pdf.get_y(), 95, pdf.get_y())
    pdf.ln(2)
    
    pdf.set_font(bold_family, "B", 11)
    title = get_label("PAYMENT RECEIPT", langs)
    pdf.cell(page_width, 7, title, ln=True, align="C")
    pdf.ln(1)
    
    pdf.set_font(font_family, "", 9)
    receipt_no_label = get_label("Receipt No", langs)
    date_label = get_label("Date", langs)
    
    pdf.cell(page_width / 2, 5, f"{receipt_no_label}: R-{transaction.id}", ln=0)
    pdf.cell(page_width / 2, 5, f"{date_label}: {transaction.date.strftime('%d/%m/%Y')}", ln=1, align="R")
    pdf.ln(1)
    
    pdf.set_font(bold_family, "B", 10)
    customer_label = get_label("Customer", langs)
    
    name_parts = []
    if "Tamil" in langs and customer.name_tamil:
        name_parts.append(customer.name_tamil)
    if "English" in langs or not name_parts:
        name_parts.append(customer.name)
    name_to_use = " / ".join(name_parts)
        
    pdf.cell(0, 6, f"{customer_label}: {name_to_use}", ln=1)
    
    pdf.set_font(font_family, "", 9)
    loan_id_label = get_label("Loan ID", langs)
    pdf.cell(0, 6, f"{loan_id_label}: L-{loan.id}", ln=1)
    pdf.ln(2)
    
    pdf.set_fill_color(240, 240, 240)
    desc_label = get_label("Description", langs)
    amount_label = get_label("Amount", langs)
    pdf.cell(60, 7, desc_label, 1, 0, "L", fill=True)
    pdf.cell(30, 7, amount_label, 1, 1, "R", fill=True)
    
    loan_type_map = {'daily': "Daily", 'weekly': "Weekly", 'monthly': "Monthly"}
    lt_key = loan_type_map.get(loan.loan_type, loan.loan_type)
    
    inst_label = get_label("Installment", langs)
    inst_type = get_label(lt_key, langs)
    inst_text = f"{inst_type} {inst_label}"
    
    pdf.cell(60, 7, inst_text, 1, 0, "L")
    pdf.cell(30, 7, f"Rs. {transaction.amount:,.2f}", 1, 1, "R")
    
    pdf.ln(3)
    total_collected = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.loan_id == loan.id).scalar() or 0
    balance = loan.amount - total_collected
    
    pdf.set_font(bold_family, "B", 9)
    paid_label = get_label("Total Paid:", langs)
    balance_label = get_label("Balance Due:", langs)
    pdf.cell(60, 5, paid_label, 0, 0, "R")
    pdf.cell(30, 5, f"Rs. {total_collected:,.2f}", 0, 1, "R")
    pdf.cell(60, 5, balance_label, 0, 0, "R")
    pdf.cell(30, 5, f"Rs. {balance:,.2f}", 0, 1, "R")
    
    pdf.ln(5)
    pdf.set_font(font_family, "", 8)
    
    thanks_text = get_label("Thank you for your payment!", langs)
    comp_gen_text = get_label("Computer generated receipt.", langs)
         
    pdf.cell(0, 4, thanks_text, ln=True, align="C")
    pdf.cell(0, 4, comp_gen_text, ln=True, align="C")

# Routes
@app.route("/", methods=["GET"])
def index():
    return "Chit Fund Backend Running (Flask)"

@app.route("/stats/admin", methods=["GET"])
def get_admin_stats():
    db = g.db
    # Total Active and Closed Loans
    active_loans_query = db.query(models.Loan).filter(models.Loan.status.in_(["active", "closed"]))
    
    total_active_count = active_loans_query.count()
    total_customers = db.query(models.Customer).count()
    
    # Financial Stats for Active/Closed Loans
    total_loan_amount = active_loans_query.with_entities(func.sum(models.Loan.amount)).scalar() or 0
    total_disbursed_amount = active_loans_query.with_entities(func.sum(models.Loan.disbursed_amount)).scalar() or 0
    
    # Collection Stats
    total_collected = db.query(models.Transaction).with_entities(func.sum(models.Transaction.amount)).scalar() or 0
    total_pending_collection = total_loan_amount - total_collected
    
    # Today's Collection
    today = datetime.now().date()
    today_collection = db.query(models.Transaction).filter(
        func.date(models.Transaction.date) == today
    ).with_entities(func.sum(models.Transaction.amount)).scalar() or 0
    
    # Agent wise stats
    agents = db.query(models.User).filter(models.User.role == "agent").all()
    agent_stats = []
    for agent in agents:
        agent_collection = db.query(models.Transaction).join(models.Loan).filter(
            models.Loan.agent_id == agent.id
        ).with_entities(func.sum(models.Transaction.amount)).scalar() or 0
        
        agent_stats.append({
            "agent_name": agent.full_name,
            "agent_id": agent.id,
            "total_collected": agent_collection
        })

    # Rejected Stats
    rejected_query = db.query(models.Loan).filter(models.Loan.status == "rejected")
    total_rejected_count = rejected_query.count()
    total_rejected_amount = rejected_query.with_entities(func.sum(models.Loan.amount)).scalar() or 0

    # Expense Stats
    total_expenses = db.query(models.Expense).with_entities(func.sum(models.Expense.amount)).scalar() or 0

    return jsonify({
        "total_loans_count": total_active_count,
        "total_customers": total_customers,
        "total_loan_amount": total_loan_amount,
        "total_disbursed_amount": total_disbursed_amount,
        "total_collected": total_collected,
        "total_pending_collection": total_pending_collection,
        "today_collection": today_collection,
        "total_rejected_count": total_rejected_count,
        "total_rejected_amount": total_rejected_amount,
        "total_expenses": total_expenses,
        "net_cash_flow": total_collected - total_disbursed_amount - total_expenses,
        "agent_reports": agent_stats
    })

@app.route("/reports/financial", methods=["GET"])
def get_financial_report():
    db = g.db
    total_disbursed = db.query(models.Loan).filter(models.Loan.status.in_(["active", "closed"])).with_entities(func.sum(models.Loan.disbursed_amount)).scalar() or 0
    total_collected = db.query(models.Transaction).with_entities(func.sum(models.Transaction.amount)).scalar() or 0
    total_expenses = db.query(models.Expense).with_entities(func.sum(models.Expense.amount)).scalar() or 0
    total_loan_amount = db.query(models.Loan).filter(models.Loan.status.in_(["active", "closed"])).with_entities(func.sum(models.Loan.amount)).scalar() or 0
    
    # Get expenses by category
    expense_categories = db.query(
        models.Expense.description, 
        func.sum(models.Expense.amount).label('total')
    ).group_by(models.Expense.description).all()
    
    expenses_breakdown = [{"category": row[0], "total": row[1]} for row in expense_categories]

    pending_collection = total_loan_amount - total_collected
    interest_earned = total_loan_amount - total_disbursed
    
    return jsonify({
        "summary": {
            "total_disbursed": total_disbursed,
            "total_collected": total_collected,
            "total_expenses": total_expenses,
            "total_loan_amount": total_loan_amount,
            "pending_collection": pending_collection,
            "interest_earned": interest_earned,
            "net_profit": total_collected - total_disbursed - total_expenses
        },
        "expenses_breakdown": expenses_breakdown,
        "balance_sheet": {
            "assets": [
                {"name": "Cash at Hand (Collected - Expenses)", "amount": total_collected - total_expenses},
                {"name": "Outstanding Loans (Pending Collection)", "amount": pending_collection}
            ],
            "liabilities": [
                {"name": "Capital / Loans Disbursed", "amount": total_disbursed}
            ],
            "total_assets": (total_collected - total_expenses) + pending_collection,
            "total_liabilities": total_disbursed
        }
    })

@app.route("/loans/overdue", methods=["GET"])
def get_overdue_loans():
    db = g.db
    today = datetime.now().date()
    active_loans = db.query(models.Loan).filter(models.Loan.status == "active").all()
    overdue_list = []

    for loan in active_loans:
        days_passed = (today - loan.start_date).days
        
        if loan.loan_type == 'daily':
            expected_count = days_passed
        elif loan.loan_type == 'weekly':
            expected_count = days_passed // 7
        else: # monthly
            expected_count = days_passed // 30
            
        if days_passed >= 1 and expected_count == 0:
            expected_count = 1
            
        total_expected_amount = expected_count * loan.daily_due
        total_paid = sum(t.amount for t in loan.transactions)
        
        if total_paid < total_expected_amount:
            pending_today = total_expected_amount - total_paid
            overdue_list.append({
                "id": loan.id,
                "customer_name": loan.customer.name,
                "customer_phone": loan.customer.phone,
                "loan_type": loan.loan_type,
                "expected": total_expected_amount,
                "paid": total_paid,
                "overdue_amount": pending_today,
                "agent_name": db.query(models.User).filter(models.User.id == loan.agent_id).first().full_name if loan.agent_id else "Not Assigned"
            })
            
    return jsonify(overdue_list)

@app.route("/loans/send-reminders", methods=["POST"])
def send_overdue_reminders():
    db = g.db
    data = request.json or {}
    loan_ids = data.get("loan_ids", [])
    
    today = datetime.now().date()
    sent_count = 0
    
    for loan_id in loan_ids:
        loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
        if not loan:
            continue
            
        # Re-calculate overdue amount to ensure accuracy
        days_passed = (today - loan.start_date).days
        if loan.loan_type == 'daily':
            expected_count = days_passed
        elif loan.loan_type == 'weekly':
            expected_count = days_passed // 7
        else:
            expected_count = days_passed // 30
            
        if days_passed >= 1 and expected_count == 0:
            expected_count = 1
            
        total_expected_amount = expected_count * loan.daily_due
        total_paid = sum(t.amount for t in loan.transactions)
        overdue_amount = total_expected_amount - total_paid
        
        if overdue_amount > 0:
            customer = loan.customer
            message = (
                f"வணக்கம் {customer.name}, உங்கள் {loan.loan_type} கடனில் "
                f"(ID: {loan.id}) ₹{overdue_amount} நிலுவையில் உள்ளது. "
                f"தயவுசெய்து விரைவில் செலுத்தவும். நன்றி!"
            )
            
            # Send via available channels
            notifications.send_sms_notification(customer.phone, message)
            notifications.send_whatsapp_notification(customer.phone, message)
            notifications.send_app_notification(customer.id, message)
            sent_count += 1
            
    return jsonify({"message": f"{sent_count} நினைவூட்டல்கள் அனுப்பப்பட்டன.", "count": sent_count})

@app.route("/notifications/app/<int:customer_id>", methods=["GET"])
def get_app_notifications(customer_id):
    db = g.db
    unread_only = request.args.get('unread_only', 'true').lower() == 'true'
    
    query = db.query(models.AppNotification).filter(models.AppNotification.customer_id == customer_id)
    if unread_only:
        query = query.filter(models.AppNotification.is_read == False)
    rows = query.order_by(models.AppNotification.created_at.desc()).all()
    
    result = []
    for n in rows:
        result.append({
            "id": n.id,
            "customer_id": n.customer_id,
            "message": n.message,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "is_read": bool(n.is_read),
        })
    return jsonify(result)

@app.route("/notifications/app/<int:customer_id>/read-all", methods=["POST"])
def read_all_app_notifications(customer_id):
    db = g.db
    updated = (
        db.query(models.AppNotification)
        .filter(models.AppNotification.customer_id == customer_id, models.AppNotification.is_read == False)
        .update({"is_read": True})
    )
    db.commit()
    return jsonify({"updated": updated})

@app.route("/loans/sanction-letter/<int:loan_id>", methods=["GET"])
@app.route("/loans/<int:loan_id>/sanction", methods=["GET"])
def generate_sanction_letter(loan_id):
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    if loan.status not in ["active", "closed"]:
        return jsonify({"error": "Sanction letter is only available for approved loans"}), 400
    
    settings = db.query(models.SystemSetting).first()
    company_name = settings.company_name if settings else "Chit Fund Company"
    company_address = settings.company_address if settings else "Address"
    company_phone = settings.company_phone if settings else "Phone"
    
    langs = loan.customer.languages.split(",") if loan.customer.languages else ["English"]
    
    pdf = FPDF()
    
    # Register Fonts
    base_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(base_dir, "fonts")
    
    try:
        pdf.add_font("tamilfont", "", os.path.join(fonts_dir, "MuktaMalar-Regular.ttf"), uni=True)
        pdf.add_font("tamilfont", "B", os.path.join(fonts_dir, "MuktaMalar-Bold.ttf"), uni=True)
    except Exception as e:
        print(f"Font loading error: {e}")
        pdf.add_font("tamilfont", "", "Helvetica", uni=True)
        pdf.add_font("tamilfont", "B", "Helvetica", uni=True)

    add_sanction_page(pdf, loan, settings, company_name, company_address, company_phone, langs)
    
    # Output to bytes
    pdf_bytes = pdf.output(dest='S').encode('latin-1')
    
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Sanction_Letter_L{loan.id}.pdf"}
    )

@app.route("/transactions/<int:transaction_id>/receipt", methods=["GET"])
def generate_receipt(transaction_id):
    db = g.db
    transaction = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not transaction:
        return jsonify({"error": "Transaction not found"}), 404
    
    loan = transaction.loan
    customer = loan.customer
    
    settings = db.query(models.SystemSetting).first()
    company_name = settings.company_name if settings else "Chit Fund Company"
    company_address = settings.company_address if settings else "Address"
    company_phone = settings.company_phone if settings else "Phone"
    
    langs = customer.languages.split(",") if customer.languages else ["English"]
    
    pdf = FPDF(format='A6', unit='mm') # A6 for receipts
    
    # Register Fonts
    base_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(base_dir, "fonts")
    
    try:
        pdf.add_font("tamilfont", "", os.path.join(fonts_dir, "MuktaMalar-Regular.ttf"), uni=True)
        pdf.add_font("tamilfont", "B", os.path.join(fonts_dir, "MuktaMalar-Bold.ttf"), uni=True)
    except Exception as e:
        print(f"Font loading error: {e}")
        pdf.add_font("tamilfont", "", "Helvetica", uni=True)
        pdf.add_font("tamilfont", "B", "Helvetica", uni=True)

    add_receipt_page(pdf, transaction, loan, customer, settings, company_name, company_address, company_phone, db, langs)
    
    pdf_bytes = pdf.output(dest='S').encode('latin-1')
    
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Receipt_R{transaction.id}.pdf"}
    )

# --- Helpers for License & System ---
LICENSE_SECRET = os.getenv("FM_LICENSE_SECRET", "FM-LIC-SECRET-2026")

def _machine_fingerprint() -> str:
    parts = [platform.system(), platform.node(), str(uuid.getnode())]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest().upper()

def compute_product_code() -> str:
    h = _machine_fingerprint()
    core = h[:16]
    return "-".join([core[i:i+4] for i in range(0, 16, 4)])

def compute_license_key_for_code(product_code: str) -> str:
    base = product_code.replace("-", "").upper()
    h = hashlib.sha256((base + LICENSE_SECRET).encode("utf-8")).hexdigest().upper()
    core = h[:20]
    return "-".join([core[i:i+5] for i in range(0, 20, 5)])

def _db_integrity_check() -> str:
    try:
        with database.engine.begin() as conn:
            res = conn.execute(text("PRAGMA integrity_check")).fetchone()
            if not res:
                return "UNKNOWN"
            val = res[0] if not isinstance(res, dict) else list(res.values())[0]
            return str(val)
    except Exception:
        return "ERROR"

def ensure_settings_columns():
    # SQLite-friendly: attempt ALTERs defensively
    new_cols = [
        ("commission_enabled", "INTEGER DEFAULT 0"),
        ("commission_percent", "FLOAT DEFAULT 0"),
        ("auto_backup_enabled", "INTEGER DEFAULT 0"),
        ("auto_backup_frequency", "VARCHAR(50) DEFAULT 'daily'"),
        ("sms_provider", "VARCHAR(50) DEFAULT 'twilio'"),
        ("twilio_account_sid", "TEXT"),
        ("twilio_auth_token", "TEXT"),
        ("twilio_sms_from", "TEXT"),
        ("twilio_whatsapp_from", "TEXT"),
        ("payment_enabled", "INTEGER DEFAULT 0"),
        ("payment_provider", "VARCHAR(50) DEFAULT 'razorpay'"),
        ("razorpay_key_id", "TEXT"),
        ("razorpay_key_secret", "TEXT"),
        ("razorpay_webhook_secret", "TEXT"),
        ("license_key", "TEXT"),
        ("license_active", "INTEGER DEFAULT 1"),
        ("license_valid_till", "TEXT"),
        ("trial_enabled", "INTEGER DEFAULT 1"),
        ("trial_start_date", "TEXT"),
        ("trial_days", "INTEGER DEFAULT 365"),
        ("trial_reset_count", "INTEGER DEFAULT 0"),
        ("frontend_url", "TEXT"),
        ("backend_url", "TEXT"),
        ("offline_path", "TEXT")
    ]
    try:
        with database.engine.begin() as conn:
            for col_name, col_def in new_cols:
                try:
                    conn.execute(text(f"ALTER TABLE system_settings ADD COLUMN {col_name} {col_def}"))
                except Exception:
                    pass
    except Exception:
        pass

def get_settings(db: Session):
    ensure_settings_columns()
    settings = db.query(models.SystemSetting).first()
    if not settings:
        return {}
    return {c.name: getattr(settings, c.name) for c in settings.__table__.columns}

# --- Additional Endpoints ---

@app.route("/loans/rejected", methods=["GET"])
def read_rejected_loans():
    db = g.db
    loans = db.query(models.Loan).filter(models.Loan.status == "rejected").order_by(models.Loan.id.desc()).all()
    return jsonify([{
        "id": l.id, 
        "amount": l.amount, 
        "status": l.status,
        "customer_name": l.customer.name,
        "date": l.date.isoformat() if l.date else None
    } for l in loans])

@app.route("/loans/<int:loan_id>/reject", methods=["POST"])
def reject_loan(loan_id):
    db = g.db
    data = request.json or {}
    reason = data.get("reason", "")
    
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    
    loan.status = "rejected"
    loan.reject_reason = reason
    db.commit()
    
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் விண்ணப்பம் (ID: {loan.id}) நிராகரிக்கப்பட்டது. காரணம்: {reason}"
    notifications.send_app_notification(loan.customer.id, message)
    
    return jsonify({"message": "Loan rejected"})

@app.route("/loans/<int:loan_id>/approve", methods=["POST"])
def approve_loan(loan_id):
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    
    loan.status = "active"
    db.commit()
    
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் விண்ணப்பம் (ID: {loan.id}) அங்கீகரிக்கப்பட்டது. நன்றி!"
    if loan.notify_sms:
        notifications.send_sms_notification(loan.customer.phone, message)
    if loan.notify_whatsapp:
        notifications.send_whatsapp_notification(loan.customer.phone, message)
    notifications.send_app_notification(loan.customer.id, message)
    
    return jsonify({"message": "Loan approved", "id": loan.id, "status": "active"})

@app.route("/loans/<int:loan_id>/balance", methods=["GET"])
def get_loan_balance(loan_id):
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    
    total_paid = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.loan_id == loan.id).scalar() or 0
    balance = loan.amount - total_paid
    return jsonify({"balance": balance, "loan_amount": loan.amount, "total_paid": total_paid})

@app.route("/loans/<int:loan_id>/close", methods=["POST"])
def close_loan(loan_id):
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    
    if loan.status != "active":
        return jsonify({"error": "Only active loans can be closed"}), 400
    
    total_paid = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.loan_id == loan.id).scalar() or 0
    balance = loan.amount - total_paid
    
    if balance > 0:
        final_transaction = models.Transaction(
            loan_id=loan.id,
            amount=balance,
            date=datetime.now()
        )
        db.add(final_transaction)
    
    loan.status = "closed"
    db.commit()
    
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் கணக்கு (ID: {loan.id}) முழுமையாக முடிக்கப்பட்டது. நன்றி!"
    notifications.send_app_notification(loan.customer.id, message)
    
    return jsonify({"message": "Loan closed successfully", "balance_paid": balance})

@app.route("/reports/commission", methods=["GET"])
@app.route("/loans/commission-report", methods=["GET"])
def get_commission_report():
    db = g.db
    
    # Ensure columns exist
    ensure_settings_columns()
    
    # Get commission settings
    settings = db.query(models.SystemSetting).first()
    commission_enabled = False
    commission_percent = 0.0
    
    if settings:
        try:
            commission_enabled = settings.commission_enabled == 1
            commission_percent = float(settings.commission_percent)
        except Exception:
            commission_enabled = False
            commission_percent = 0.0
            
    agents = db.query(models.User).filter(models.User.role == "agent").all()
    report = []
    for agent in agents:
        collections = db.query(func.sum(models.Transaction.amount)).join(models.Loan).filter(models.Loan.agent_id == agent.id).scalar() or 0
        
        commission = 0
        if commission_enabled:
            commission = collections * (commission_percent / 100)
            
        report.append({
            "agent_id": agent.id,
            "agent_name": agent.full_name,
            "total_collections": collections,
            "commission_earned": commission,
            "commission_rate": commission_percent if commission_enabled else 0
        })
    return jsonify(report)

@app.route("/loans/monthly-stats", methods=["GET"])
def get_monthly_stats():
    db = g.db
    stats = db.query(
        func.strftime('%Y-%m', models.Transaction.date).label('month'),
        func.sum(models.Transaction.amount).label('total')
    ).group_by('month').all()
    return jsonify([{"month": s.month, "total": s.total} for s in stats])

@app.route("/reports/loans", methods=["GET"])
def get_loan_report():
    db = g.db
    loans = db.query(models.Loan).all()
    report_data = []
    for loan in loans:
        total_paid = sum(t.amount for t in loan.transactions)
        balance_due = loan.amount - total_paid
        
        # Calculate next due date
        next_due_date = "N/A"
        if loan.status == "active":
            # Find last transaction date
            last_transaction = db.query(models.Transaction).filter(models.Transaction.loan_id == loan.id).order_by(models.Transaction.date.desc()).first()
            
            start_ref = last_transaction.date.date() if last_transaction else loan.start_date
            
            if loan.loan_type == 'daily':
                next_due_date = (start_ref + timedelta(days=1)).isoformat()
            elif loan.loan_type == 'weekly':
                next_due_date = (start_ref + timedelta(weeks=1)).isoformat()
            elif loan.loan_type == 'monthly':
                # Simple month increment
                next_date = start_ref + timedelta(days=30)
                next_due_date = next_date.isoformat()
            else:
                next_due_date = "Check Schedule"

        agent_name = "N/A"
        if loan.agent_id:
             agent = db.query(models.User).filter(models.User.id == loan.agent_id).first()
             if agent:
                 agent_name = agent.full_name

        report_data.append({
            "id": loan.id,
            "customer_name": loan.customer.name,
            "customer_phone": loan.customer.phone,
            "customer_address": loan.customer.address,
            "amount": loan.amount,
            "disbursed": loan.disbursed_amount,
            "status": loan.status,
            "loan_type": loan.loan_type,
            "start_date": loan.start_date.isoformat() if hasattr(loan.start_date, 'isoformat') else str(loan.start_date),
            "total_paid": total_paid,
            "balance_due": balance_due,
            "next_due_date": next_due_date,
            "agent_id": loan.agent_id,
            "agent_name": agent_name
        })
    return jsonify(report_data)

@app.route("/reports/pending-collections", methods=["GET"])
def get_pending_collections_report():
    db = g.db
    agent_id = request.args.get('agent_id', type=int)
    query = db.query(models.Loan).filter(models.Loan.status == "active")
    if agent_id:
        query = query.filter(models.Loan.agent_id == agent_id)
        
    loans = query.all()
    report_data = []
    
    for loan in loans:
        total_paid = sum(t.amount for t in loan.transactions)
        balance_due = loan.amount - total_paid
        if balance_due <= 0:
            continue
            
        last_transaction = db.query(models.Transaction).filter(models.Transaction.loan_id == loan.id).order_by(models.Transaction.date.desc()).first()
        start_ref = last_transaction.date.date() if last_transaction else loan.start_date
        
        if loan.loan_type == 'daily':
            next_due_date = (start_ref + timedelta(days=1))
        elif loan.loan_type == 'weekly':
            next_due_date = (start_ref + timedelta(weeks=1))
        elif loan.loan_type == 'monthly':
            next_due_date = (start_ref + timedelta(days=30))
        else:
            next_due_date = start_ref

        report_data.append({
            "loan_id": loan.id,
            "customer_name": loan.customer.name,
            "customer_phone": loan.customer.phone,
            "customer_address": loan.customer.address,
            "loan_type": loan.loan_type,
            "total_amount": loan.amount,
            "due_amount": loan.daily_due,
            "balance_due": balance_due,
            "next_due_date": next_due_date.isoformat(),
            "agent_id": loan.agent_id,
            "agent_name": db.query(models.User).filter(models.User.id == loan.agent_id).first().full_name if loan.agent_id else "N/A"
        })
    
    report_data.sort(key=lambda x: (x['agent_name'], x['next_due_date']))
    return jsonify(report_data)

@app.route("/reports/collections", methods=["GET"])
def get_collections_report():
    db = g.db
    agent_id = request.args.get('agent_id', type=int)
    query = db.query(models.Transaction).join(models.Loan)
    if agent_id:
        query = query.filter(models.Loan.agent_id == agent_id)
    
    transactions = query.order_by(models.Transaction.date.desc()).all()
    return jsonify([{
        "id": tx.id,
        "loan_id": tx.loan_id,
        "customer_name": tx.loan.customer.name,
        "amount": tx.amount,
        "date": tx.date.isoformat() if tx.date else None,
        "agent_name": db.query(models.User).filter(models.User.id == tx.loan.agent_id).first().full_name if tx.loan.agent_id else "N/A"
    } for tx in transactions])

@app.route("/settings/backup", methods=["POST"])
def backup_settings():
    db = g.db
    ensure_settings_columns()
    settings = get_settings(db)
    if not settings:
         return jsonify({"error": "No settings found"}), 404
         
    payload = {k: v for k, v in settings.items() if k != 'id'}
    payload["backup_at"] = datetime.now().isoformat()
    
    backup = models.SettingsBackup(data=json.dumps(payload))
    db.add(backup)
    db.commit()
    db.refresh(backup)
    return jsonify({"message": "Settings backed up", "backup_id": backup.id})

@app.route("/settings/backup/latest", methods=["GET"])
def get_latest_settings_backup():
    db = g.db
    ensure_settings_columns()
    backup = db.query(models.SettingsBackup).order_by(models.SettingsBackup.id.desc()).first()
    if not backup:
        return jsonify({"error": "No backup found"}), 404
    try:
        return jsonify(json.loads(backup.data))
    except Exception:
        return jsonify({"error": "Backup data corrupted"}), 500

@app.route("/settings/restore/latest", methods=["POST"])
def restore_latest_settings_backup():
    db = g.db
    ensure_settings_columns()
    backup = db.query(models.SettingsBackup).order_by(models.SettingsBackup.id.desc()).first()
    if not backup:
        return jsonify({"error": "No backup found"}), 404
    
    data = json.loads(backup.data)
    settings = db.query(models.SystemSetting).first()
    if not settings:
        settings = models.SystemSetting()
        db.add(settings)
    
    for key, value in data.items():
        if hasattr(settings, key) and key != 'id':
            setattr(settings, key, value)
            
    db.commit()
    return jsonify(get_settings(db))

def migrate_settings_table_if_needed():
    try:
        with database.engine.begin() as conn:
            # Check if 'settings' table exists (old name)
            res = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")).fetchone()
            if res:
                conn.execute(text("ALTER TABLE settings RENAME TO system_settings"))
    except Exception:
        pass

@app.route("/expenses", methods=["POST"])
def create_expense():
    data = request.json
    db = g.db
    try:
        expense_date = datetime.now().date()
        if data.get('date'):
            try:
                expense_date = datetime.strptime(data['date'], "%Y-%m-%d").date()
            except ValueError:
                pass
        
        db_expense = models.Expense(
            description=data.get('description'),
            amount=float(data.get('amount')),
            date=expense_date,
            created_by=data.get('created_by')
        )
        db.add(db_expense)
        db.commit()
        db.refresh(db_expense)
        
        return jsonify({
            "id": db_expense.id,
            "description": db_expense.description,
            "amount": db_expense.amount,
            "date": db_expense.date.isoformat() if db_expense.date else None,
            "created_at": db_expense.created_at.isoformat() if db_expense.created_at else None,
            "created_by": db_expense.created_by
        })
    except Exception as e:
        db.rollback()
        print(f"Error creating expense: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/expenses", methods=["GET"])
def get_expenses():
    db = g.db
    expenses = db.query(models.Expense).order_by(models.Expense.date.desc()).all()
    return jsonify([{
        "id": exp.id,
        "description": exp.description,
        "amount": exp.amount,
        "date": exp.date.isoformat() if exp.date else None,
        "created_at": exp.created_at.isoformat() if exp.created_at else None,
        "created_by": exp.created_by
    } for exp in expenses])

@app.route("/expenses/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    db = g.db
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    db.delete(expense)
    db.commit()
    return jsonify({"message": "Expense deleted"})

@app.route("/license/product", methods=["GET"])
def get_product_code_endpoint():
    code = compute_product_code()
    return jsonify({"product_code": code})

@app.route("/diagnostics/summary", methods=["GET"])
def diagnostics_summary():
    db = g.db
    stats = {}
    try:
        stats["users"] = db.query(models.User).count()
        stats["customers"] = db.query(models.Customer).count()
        stats["loans"] = db.query(models.Loan).count()
        stats["transactions"] = db.query(models.Transaction).count()
    except Exception:
        pass
        
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return jsonify({
        "status": "ok",
        "database_integrity": _db_integrity_check(),
        "stats": stats,
        "base_dir": base_dir
    })

@app.route("/check-db", methods=["GET"])
def check_db():
    db = g.db
    users = db.query(models.User).all()
    customers = db.query(models.Customer).all()
    return jsonify({
        "users": [{"id": u.id, "username": u.username, "role": u.role} for u in users],
        "customers": [{"id": c.id, "name": c.name, "phone": c.phone} for c in customers]
    })

@app.route("/init-db", methods=["GET"])
def init_db():
    db = g.db
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin:
        admin = models.User(
            username="admin",
            password_hash="admin123",
            role="admin",
            full_name="Administrator",
            phone="0000000000"
        )
        db.add(admin)
        db.commit()
        return jsonify({"message": "Initialized admin user"})
    return jsonify({"message": "Admin user already exists"})

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    role = data.get("role", "")
    password = data.get("password", "")
    db = g.db
    
    print(f"Login attempt: username='{username}', role='{role}'")
    
    def enforce_trial_and_license():
        if role == "developer":
            return
        settings = get_settings(db)
        if isinstance(settings, dict):
            license_active = bool(settings.get("license_active"))
            trial_enabled = bool(settings.get("trial_enabled"))
            trial_start = settings.get("trial_start_date")
            trial_days = int(settings.get("trial_days") or 0)
        else:
            license_active = False
            trial_enabled = False
            trial_start = None
            trial_days = 0
        
        if license_active:
            return
            
        if not trial_enabled or not trial_start or trial_days <= 0:
            return jsonify({"error": "Software not activated. Please login as developer to start trial or activate license."}), 403
            
        try:
            start_dt = datetime.fromisoformat(trial_start).date()
        except Exception:
             return jsonify({"error": "Trial configuration invalid. Contact developer."}), 403
             
        today = datetime.now().date()
        expiry = start_dt + timedelta(days=trial_days)
        if today > expiry:
             return jsonify({"error": "Trial period expired. Contact developer for license."}), 403

    # Trial check
    trial_error = enforce_trial_and_license()
    if trial_error:
        return trial_error

    if role == "customer":
        candidates = set()
        candidates.add(username)
        try:
            normalized = normalize_indian_phone(username)
            candidates.add(normalized)
        except Exception:
            pass
        
        if username.startswith('0'):
            candidates.add(username[1:])
        else:
            candidates.add('0' + username)
            
        customer = db.query(models.Customer).filter(models.Customer.phone.in_(list(candidates))).first()
        if not customer:
            return jsonify({"error": "இந்த தொலைபேசி எண்ணில் வாடிக்கையாளர் இல்லை (Customer not found)"}), 401
            
        return jsonify({"id": customer.id, "username": customer.name, "role": "customer", "full_name": customer.name})
    
    # User login
    user = db.query(models.User).filter(
        func.lower(models.User.username) == func.lower(username),
        models.User.role == role
    ).first()
    
    if not user:
        return jsonify({"error": "பயனர் பெயர் அல்லது பதவி தவறானது (Invalid username or role)"}), 401
    
    if password and user.password_hash and user.password_hash != password:
        return jsonify({"error": "கடவுச்சொல் தவறானது (Incorrect password)"}), 401
        
    return jsonify({"id": user.id, "username": user.username, "role": user.role, "full_name": user.full_name})

@app.route("/change-password", methods=["POST"])
def change_password():
    data = request.json
    user_id = data.get("user_id")
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    db = g.db
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    if user.password_hash != old_password:
        return jsonify({"error": "Incorrect old password"}), 400
        
    user.password_hash = new_password
    db.commit()
    return jsonify({"message": "Password updated successfully"})

@app.route("/users", methods=["GET"])
def get_users():
    db = g.db
    users = db.query(models.User).all()
    return jsonify([{
        "id": u.id, "username": u.username, "role": u.role, 
        "full_name": u.full_name, "phone": u.phone, 
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users])

@app.route("/users/agents", methods=["GET"])
def get_agents():
    db = g.db
    agents = db.query(models.User).filter(models.User.role == "agent").all()
    return jsonify([{
        "id": a.id, "username": a.username, "role": a.role, 
        "full_name": a.full_name, "phone": a.phone
    } for a in agents])

@app.route("/users", methods=["POST"])
def create_user():
    data = request.json
    db = g.db
    
    # Check if username exists
    existing = db.query(models.User).filter(func.lower(models.User.username) == func.lower(data['username'])).first()
    if existing:
        return jsonify({"error": "Username already exists"}), 400
        
    user = models.User(
        username=data['username'],
        password_hash=data['password_hash'],
        role=data['role'],
        full_name=data.get('full_name'),
        phone=data.get('phone')
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return jsonify({
        "id": user.id, "username": user.username, "role": user.role, 
        "full_name": user.full_name
    })

@app.route("/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    data = request.json
    db = g.db
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    if 'password_hash' in data and data['password_hash']:
        user.password_hash = data['password_hash']
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'phone' in data:
        user.phone = data['phone']
        
    db.commit()
    return jsonify({
        "id": user.id, "username": user.username, "role": user.role, 
        "full_name": user.full_name
    })

@app.route("/customers", methods=["POST"])
@app.route("/customers/", methods=["POST"])
def create_customer():
    data = request.json
    db = g.db
    
    # Sanitize inputs
    data = sanitize_kyc(data)
    
    # Check if phone exists
    if db.query(models.Customer).filter(models.Customer.phone == data['phone']).first():
        return jsonify({"error": "Phone number already exists"}), 400
        
    customer = models.Customer(
        name=data['name'],
        phone=data['phone'],
        address=data.get('address'),
        aadhaar_no=data.get('aadhaar_no'),
        pan_no=data.get('pan_no'),
        referral_code=data.get('referral_code'),
        nominee=data.get('nominee'),
        nominee_relation=data.get('nominee_relation'),
        nominee_phone=data.get('nominee_phone'),
        languages=data.get('languages'),
        name_tamil=data.get('name_tamil'),
        address_tamil=data.get('address_tamil')
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return jsonify({
        "id": customer.id, "name": customer.name, "phone": customer.phone
    })

@app.route("/customers", methods=["GET"])
@app.route("/customers/", methods=["GET"])
def get_customers():
    db = g.db
    customers = db.query(models.Customer).order_by(models.Customer.id.desc()).all()
    return jsonify([{
        "id": c.id, "name": c.name, "phone": c.phone, "address": c.address,
        "aadhaar_no": c.aadhaar_no, "pan_no": c.pan_no, 
        "languages": c.languages, "name_tamil": c.name_tamil, "address_tamil": c.address_tamil
    } for c in customers])

@app.route("/customers/<int:customer_id>", methods=["PUT"])
def update_customer(customer_id):
    data = request.json
    db = g.db
    
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
        
    data = sanitize_kyc(data)
    
    for key, value in data.items():
        if hasattr(customer, key) and key != 'id':
            setattr(customer, key, value)
            
    db.commit()
    return jsonify({
        "id": customer.id, "name": customer.name, "phone": customer.phone
    })

@app.route("/customers/<int:customer_id>", methods=["DELETE"])
def delete_customer(customer_id):
    db = g.db
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
        
    # Check if has active loans
    if db.query(models.Loan).filter(models.Loan.customer_id == customer_id).count() > 0:
         return jsonify({"error": "Cannot delete customer with existing loans"}), 400
         
    db.delete(customer)
    db.commit()
    return jsonify({"message": "Customer deleted"})

@app.route("/customers/me/loans", methods=["GET"])
def get_my_loans():
    db = g.db
    customer_id = request.args.get('customer_id')
    if not customer_id:
        return jsonify({"error": "Customer ID required"}), 400
        
    loans = db.query(models.Loan).filter(models.Loan.customer_id == customer_id).order_by(models.Loan.id.desc()).all()
    return jsonify([{
        "id": l.id, "amount": l.amount, "status": l.status, 
        "disbursed_amount": l.disbursed_amount, "daily_due": l.daily_due,
        "start_date": l.start_date.isoformat() if l.start_date else None,
        "next_due_date": get_next_due_date(l).isoformat() if get_next_due_date(l) else None
    } for l in loans])

def get_next_due_date(loan):
    # Simple logic placeholder - ideally should be robust based on payments
    if not loan.start_date:
        return None
    today = datetime.now().date()
    if loan.loan_type == 'daily':
        return today + timedelta(days=1)
    return today + timedelta(days=30)

@app.route("/loans", methods=["POST"])
@app.route("/loans/", methods=["POST"])
def create_loan():
    data = request.json
    db = g.db
    
    # Calculate disbursed
    amount = float(data['amount'])
    deduction = float(data.get('deduction', 0))
    disbursed = amount - deduction
    
    start_date = datetime.fromisoformat(data['start_date']).date() if data.get('start_date') else datetime.now().date()
    end_date = datetime.fromisoformat(data['end_date']).date() if data.get('end_date') else None
    
    loan = models.Loan(
        customer_id=data['customer_id'],
        amount=amount,
        interest_rate=data.get('interest_rate'),
        duration_months=data.get('duration_months'),
        loan_type=data.get('loan_type', 'daily'),
        start_date=start_date,
        end_date=end_date,
        status="pending",
        deduction=deduction,
        disbursed_amount=disbursed,
        daily_due=data.get('daily_due'),
        total_days=data.get('total_days'),
        agent_id=data.get('agent_id'),
        penalty_rate=data.get('penalty_rate', 0),
        notify_sms=data.get('notify_sms', False),
        notify_whatsapp=data.get('notify_whatsapp', False)
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    
    return jsonify({
        "id": loan.id, "status": loan.status, "amount": loan.amount
    })

@app.route("/loans/pending", methods=["GET"])
def get_pending_loans():
    db = g.db
    loans = db.query(models.Loan).filter(models.Loan.status == "pending").order_by(models.Loan.id.desc()).all()
    return jsonify([{
        "id": l.id, "customer_name": l.customer.name, "amount": l.amount, 
        "date": l.date.isoformat() if l.date else None,
        "customer_phone": l.customer.phone
    } for l in loans])

@app.route("/loans/active", methods=["GET"])
def get_active_loans():
    db = g.db
    loans = db.query(models.Loan).filter(models.Loan.status == "active").order_by(models.Loan.id.desc()).all()
    # Return detailed list for table
    return jsonify([{
        "id": l.id, "customer_name": l.customer.name, "amount": l.amount, 
        "disbursed_amount": l.disbursed_amount, "daily_due": l.daily_due,
        "start_date": l.start_date.isoformat() if l.start_date else None,
        "loan_type": l.loan_type,
        "agent_name": db.query(models.User).filter(models.User.id == l.agent_id).first().full_name if l.agent_id else "N/A"
    } for l in loans])

@app.route("/loans/<int:loan_id>/assign-agent/<int:agent_id>", methods=["POST"])
def assign_agent(loan_id, agent_id):
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    
    agent = db.query(models.User).filter(models.User.id == agent_id, models.User.role == "agent").first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404
        
    loan.agent_id = agent_id
    db.commit()
    return jsonify({"message": "Agent assigned"})

@app.route("/loans/<int:loan_id>/pay", methods=["POST"])
def make_payment(loan_id):
    data = request.json
    db = g.db
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
        
    amount = float(data['amount'])
    
    tx = models.Transaction(
        loan_id=loan.id,
        amount=amount,
        type="payment",
        date=datetime.now(),
        remarks=data.get('remarks')
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    
    # Send Notification
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் கணக்கில் (ID: {loan.id}) ₹{amount} வரவு வைக்கப்பட்டது. நன்றி!"
    if loan.notify_sms:
        notifications.send_sms_notification(loan.customer.phone, message)
    if loan.notify_whatsapp:
        notifications.send_whatsapp_notification(loan.customer.phone, message)
    notifications.send_app_notification(loan.customer.id, message)
    
    return jsonify({"id": tx.id, "amount": tx.amount, "date": tx.date.isoformat()})

@app.route("/loans/<int:loan_id>/transactions", methods=["GET"])
def get_loan_transactions(loan_id):
    db = g.db
    txs = db.query(models.Transaction).filter(models.Transaction.loan_id == loan_id).order_by(models.Transaction.date.desc()).all()
    return jsonify([{
        "id": t.id, "amount": t.amount, "date": t.date.isoformat(), "remarks": t.remarks
    } for t in txs])

@app.route("/settings", methods=["POST"])
@app.route("/settings/keys", methods=["POST"])
@app.route("/settings/payments", methods=["POST"])
@app.route("/settings/urls", methods=["POST"])
def update_settings():
    data = request.json
    db = g.db
    ensure_settings_columns()
    
    settings = db.query(models.SystemSetting).first()
    if not settings:
        settings = models.SystemSetting()
        db.add(settings)
    
    # Update fields
    for key, value in data.items():
        if hasattr(settings, key) and key != 'id':
            setattr(settings, key, value)
            
    db.commit()
    return jsonify(get_settings(db))

@app.route("/maintenance/offline-update", methods=["POST"])
def offline_update():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if not file.filename.endswith('.zip'):
        return jsonify({"error": "Only .zip files are allowed"}), 400
        
    try:
        tmp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(tmp_dir, "update.zip")
        file.save(zip_path)
        
        extract_dir = os.path.join(tmp_dir, "extracted")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # Check structure
        root_package = extract_dir
        # If wrapped in a folder
        items = os.listdir(extract_dir)
        if len(items) == 1 and os.path.isdir(os.path.join(extract_dir, items[0])):
            root_package = os.path.join(extract_dir, items[0])
            
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # d:\chit fund
        updated = []
        
        for name in ["backend", "frontend"]:
            src = os.path.join(root_package, name)
            dst = os.path.join(root_dir, name)
            if os.path.isdir(src) and os.path.isdir(dst):
                try:
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                    updated.append(name)
                except Exception as e:
                    print(f"Error updating {name}: {e}")
                    
        shutil.rmtree(tmp_dir, ignore_errors=True)
        
        if not updated:
            return jsonify({"error": "No backend/frontend folders found in update package"}), 400
            
        return jsonify({
            "ok": True, 
            "updated": updated, 
            "message": "Offline update applied. Please restart the application."
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/maintenance/offline-scan", methods=["GET"])
def maintenance_offline_scan():
    db = g.db
    settings = get_settings(db)
    base_path = settings.get("offline_path", "")
    if base_path:
        base_path = base_path.strip()
    
    result = {
        "offline_path": base_path,
        "exists": False,
        "backend_dir": None,
        "backend_ok": False,
        "frontend_dir": None,
        "frontend_ok": False,
        "db_files": [],
        "db_ok": False,
        "message": None,
    }
    
    if not base_path:
        result["message"] = "Offline install path not configured."
        return jsonify(result)
        
    try:
        if not os.path.isdir(base_path):
            result["message"] = "Offline install folder not found."
            return jsonify(result)
            
        result["exists"] = True
        backend_dir = os.path.join(base_path, "backend")
        frontend_dir = os.path.join(base_path, "frontend")
        result["backend_dir"] = backend_dir
        result["frontend_dir"] = frontend_dir
        
        if os.path.isdir(backend_dir):
            exe_path = os.path.join(backend_dir, "SetLiveBackend.exe")
            main_py = os.path.join(backend_dir, "main.py")
            flask_py = os.path.join(backend_dir, "flask_app.py")
            result["backend_ok"] = os.path.isfile(exe_path) or os.path.isfile(main_py) or os.path.isfile(flask_py)
            
        if os.path.isdir(frontend_dir):
            dist_index = os.path.join(frontend_dir, "dist", "index.html")
            raw_index = os.path.join(frontend_dir, "index.html")
            result["frontend_ok"] = os.path.isfile(dist_index) or os.path.isfile(raw_index)
            
        db_candidates = []
        try:
            for root, dirs, files in os.walk(base_path):
                for f in files:
                    if f.lower().endswith(".db"):
                        db_candidates.append(os.path.join(root, f))
        except Exception:
            pass
            
        result["db_files"] = db_candidates
        result["db_ok"] = len(db_candidates) > 0
        
        if result["backend_ok"] and result["frontend_ok"] and result["db_ok"]:
            result["message"] = "Offline folder looks OK."
        else:
            problems = []
            if not result["backend_ok"]: problems.append("backend not found")
            if not result["frontend_ok"]: problems.append("frontend not found")
            if not result["db_ok"]: problems.append("no .db file found")
            result["message"] = "Offline folder incomplete: " + ", ".join(problems)
            
        return jsonify(result)
    except Exception as e:
        result["message"] = f"Error: {str(e)}"
        return jsonify(result)

@app.route("/maintenance/fresh-reset", methods=["POST"])
def maintenance_fresh_reset():
    db = g.db
    try:
        # Delete all business data
        db.query(models.Transaction).delete(synchronize_session=False)
        db.query(models.Loan).delete(synchronize_session=False)
        db.query(models.Expense).delete(synchronize_session=False)
        db.query(models.Customer).delete(synchronize_session=False)
        # Delete non-admin/developer users
        db.query(models.User).filter(~models.User.username.in_(["admin", "developer"])).delete(synchronize_session=False)
        db.commit()
        return jsonify({"message": "All business data cleared."})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/sample-data/generate", methods=["POST"])
def generate_sample_data():
    data = request.json
    count = int(data.get('count', 0))
    if count <= 0 or count > 500:
        return jsonify({"error": "Count must be between 1 and 500"}), 400
        
    db = g.db
    try:
        # Create sample staff/agent if needed
        if not db.query(models.User).filter(models.User.username == "sample_staff").first():
            staff = models.User(username="sample_staff", role="staff", full_name="Sample Staff", password_hash="staff123")
            db.add(staff)
            
        agent = db.query(models.User).filter(models.User.username == "sample_agent").first()
        if not agent:
            agent = models.User(username="sample_agent", role="agent", full_name="Sample Agent", password_hash="agent123")
            db.add(agent)
            db.commit()
            db.refresh(agent)
            
        base_phone = 9000000000
        created = 0
        
        for i in range(count):
            phone = str(base_phone + i)
            name = f"Sample Customer {i+1}"
            if db.query(models.Customer).filter(models.Customer.phone == phone).first():
                continue
                
            customer = models.Customer(name=name, phone=phone, address="Sample Address", languages="English")
            db.add(customer)
            db.flush()
            
            amount = 10000 + (i * 500)
            loan = models.Loan(
                customer_id=customer.id, loan_type="daily", amount=amount, 
                disbursed_amount=amount, daily_due=round(amount/100, 2), 
                total_days=100, start_date=datetime.now().date(), 
                status="active", agent_id=agent.id
            )
            db.add(loan)
            created += 1
            
        db.commit()
        return jsonify({"message": f"Generated {created} sample records"})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/sample-data/clear", methods=["POST"])
def clear_sample_data():
    db = g.db
    try:
        customers = db.query(models.Customer).filter(models.Customer.name.like("Sample Customer %")).all()
        ids = [c.id for c in customers]
        if ids:
            loans = db.query(models.Loan).filter(models.Loan.customer_id.in_(ids)).all()
            loan_ids = [l.id for l in loans]
            if loan_ids:
                db.query(models.Transaction).filter(models.Transaction.loan_id.in_(loan_ids)).delete(synchronize_session=False)
                db.query(models.Loan).filter(models.Loan.id.in_(loan_ids)).delete(synchronize_session=False)
            db.query(models.Customer).filter(models.Customer.id.in_(ids)).delete(synchronize_session=False)
            db.commit()
        return jsonify({"message": "Sample data cleared"})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/license/activate", methods=["POST"])
def activate_license():
    data = request.json
    db = g.db
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    
    product_code = compute_product_code()
    expected_key = compute_license_key_for_code(product_code)
    provided = (data.get('license_key') or "").strip().upper()
    
    if provided.replace("-", "") != expected_key.replace("-", ""):
        return jsonify({"error": "Invalid license key"}), 400
        
    settings = db.query(models.SystemSetting).first()
    if not settings:
        settings = models.SystemSetting()
        db.add(settings)
        
    settings.license_key = provided
    settings.license_active = 1
    settings.trial_enabled = 0
    settings.trial_days = 0
    
    db.commit()
    return jsonify(get_settings(db))

@app.route("/license/deactivate", methods=["POST"])
def deactivate_license():
    db = g.db
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    
    settings = db.query(models.SystemSetting).first()
    if settings:
        settings.license_key = None
        settings.license_active = 0
        settings.license_valid_till = None
        db.commit()
        
    return jsonify(get_settings(db))

@app.route("/settings/trial", methods=["POST"])
def update_trial_settings():
    data = request.json
    db = g.db
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    
    settings = db.query(models.SystemSetting).first()
    if not settings:
        settings = models.SystemSetting()
        db.add(settings)
        
    if data.get('trial_enabled'):
        if settings.license_active:
            return jsonify({"error": "License active, cannot start trial"}), 400
        if settings.trial_reset_count >= 2:
            return jsonify({"error": "Trial reset limit reached"}), 400
        settings.trial_reset_count += 1
        
    if 'trial_enabled' in data:
        settings.trial_enabled = 1 if data['trial_enabled'] else 0
    if 'trial_start_date' in data:
        settings.trial_start_date = data['trial_start_date']
    if 'trial_days' in data:
        settings.trial_days = int(data['trial_days'])
        
    db.commit()
    return jsonify(get_settings(db))

@app.route("/maintenance/update-app", methods=["POST"])
def maintenance_update_app():
    git_ok = False
    git_version = None
    try:
        result = subprocess.run(["git", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            git_ok = True
            git_version = result.stdout.strip()
    except Exception:
        git_ok = False
    
    if not git_ok:
        return jsonify({
            "ok": False,
            "git_available": False,
            "git_version": git_version,
            "message": "Git not available on this system. Install Git from Requirement folder."
        })
        
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        result = subprocess.run(
            ["git", "-C", root_dir, "pull", "origin", "main"],
            capture_output=True,
            text=True,
            timeout=300
        )
        ok = result.returncode == 0
        return jsonify({
            "ok": ok,
            "git_available": True,
            "git_version": git_version,
            "root_dir": root_dir,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "message": "App updated successfully from git." if ok else "Git pull failed. See details."
        })
    except Exception as e:
        return jsonify({
            "ok": False,
            "git_available": True,
            "git_version": git_version,
            "root_dir": root_dir,
            "stdout": "",
            "stderr": str(e),
            "message": "Exception while running git pull."
        })

# Static File Serving
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend', 'dist')
    if path != "" and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    else:
        return send_from_directory(static_folder, 'index.html')

if __name__ == "__main__":
    app.run(port=9000, debug=True)
