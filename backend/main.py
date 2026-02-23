from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, inspect, text, or_
from typing import List, Optional
import models, schemas, database, notifications
from setup_admin import create_initial_admin
from datetime import datetime, timedelta
from fpdf import FPDF
import io
import base64
import tempfile
import zipfile
import shutil
import os
import json
import platform
import uuid
import hashlib
import subprocess
import uvicorn

models.Base.metadata.create_all(bind=database.engine)
create_initial_admin()

app = FastAPI()

# Frontend static files (for packaged ClientRuntime and dev server)
FRONTEND_DIST_DIR = None
try:
    base_dir = os.path.abspath(os.path.dirname(__file__))
    candidate_cr = os.path.abspath(os.path.join(base_dir, "..", "ClientRuntime", "frontend"))
    if os.path.isdir(candidate_cr):
        FRONTEND_DIST_DIR = candidate_cr
    else:
        cwd_cr = os.path.abspath(os.path.join(os.getcwd(), "..", "ClientRuntime", "frontend"))
        if os.path.isdir(cwd_cr):
            FRONTEND_DIST_DIR = cwd_cr
        else:
            root_frontend = os.path.abspath(os.path.join(os.getcwd(), "..", "frontend"))
            dist_candidate = os.path.join(root_frontend, "dist")
            if os.path.isdir(dist_candidate):
                FRONTEND_DIST_DIR = dist_candidate
            elif os.path.isdir(root_frontend):
                FRONTEND_DIST_DIR = root_frontend
            else:
                alt_root = os.path.abspath(os.path.join(base_dir, "..", "frontend"))
                alt_dist = os.path.join(alt_root, "dist")
                if os.path.isdir(alt_dist):
                    FRONTEND_DIST_DIR = alt_dist
                elif os.path.isdir(alt_root):
                    FRONTEND_DIST_DIR = alt_root
except Exception:
    FRONTEND_DIST_DIR = None

if FRONTEND_DIST_DIR and os.path.isdir(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/", include_in_schema=False)
def serve_frontend_index():
    if not FRONTEND_DIST_DIR:
        raise HTTPException(status_code=500, detail="Frontend directory not configured")
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return FileResponse(index_path, media_type="text/html")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. In production, specify domains.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def normalize_indian_phone(phone: Optional[str]) -> str:
    digits = ''.join(ch for ch in (phone or '') if ch.isdigit())
    if len(digits) == 12 and digits.startswith('91'):
        return f"+91{digits[2:]}"
    if len(digits) == 10 and digits[0] in '6789':
        return f"+91{digits}"
    raise HTTPException(status_code=422, detail="Invalid mobile. Use +91XXXXXXXXXX format.")

def sanitize_kyc(phone: Optional[str], aadhaar: Optional[str], pan: Optional[str]):
    p = normalize_indian_phone(phone) if phone else None
    a = None
    if aadhaar:
        a_digits = ''.join(ch for ch in aadhaar if ch.isdigit())
        if len(a_digits) != 12:
            raise HTTPException(status_code=422, detail="Aadhaar must be exactly 12 digits.")
        a = a_digits
    pn = None
    if pan:
        up = (pan or '').strip().upper()
        import re
        if not re.fullmatch(r'[A-Z]{5}[0-9]{4}[A-Z]', up):
            raise HTTPException(status_code=422, detail="PAN must match pattern ABCDE1234F.")
        pn = up
    return p, a, pn

# Ensure new columns exist in existing SQLite DB
def ensure_settings_columns():
    # SQLite-friendly: attempt ALTERs defensively
    try:
        with database.engine.begin() as conn:
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN commission_enabled INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN commission_percent FLOAT DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN auto_backup_enabled INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN auto_backup_frequency VARCHAR(50) DEFAULT 'daily'"))
            except Exception:
                pass
            # Notification provider columns
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN sms_provider VARCHAR(50) DEFAULT 'twilio'"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN twilio_account_sid TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN twilio_auth_token TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN twilio_sms_from TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN twilio_whatsapp_from TEXT"))
            except Exception:
                pass
            # Payment gateway columns
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN payment_enabled INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN payment_provider VARCHAR(50) DEFAULT 'razorpay'"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN razorpay_key_id TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN razorpay_key_secret TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN razorpay_webhook_secret TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN license_key TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN license_active INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN license_valid_till TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN trial_enabled INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN trial_start_date TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN trial_days INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN trial_reset_count INTEGER DEFAULT 0"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN frontend_url TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN backend_url TEXT"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE system_settings ADD COLUMN offline_path TEXT"))
            except Exception:
                pass
    except Exception:
        pass

ensure_settings_columns()

def migrate_settings_table_if_needed():
    try:
        with database.engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS system_settings_new"))
            conn.execute(text("""
                CREATE TABLE system_settings_new (
                    id INTEGER PRIMARY KEY,
                    app_name TEXT DEFAULT 'Finance Manager',
                    company_name TEXT DEFAULT '',
                    company_address TEXT DEFAULT '',
                    company_phone TEXT DEFAULT '',
                    logo_base64 TEXT,
                    commission_enabled INTEGER DEFAULT 0,
                    commission_percent REAL DEFAULT 0,
                    auto_backup_enabled INTEGER DEFAULT 0,
                    auto_backup_frequency TEXT DEFAULT 'daily',
                    sms_provider TEXT DEFAULT 'twilio',
                    twilio_account_sid TEXT,
                    twilio_auth_token TEXT,
                    twilio_sms_from TEXT,
                    twilio_whatsapp_from TEXT,
                    payment_enabled INTEGER DEFAULT 0,
                    payment_provider TEXT DEFAULT 'razorpay',
                    razorpay_key_id TEXT,
                    razorpay_key_secret TEXT,
                    razorpay_webhook_secret TEXT,
                    license_key TEXT,
                    license_active INTEGER DEFAULT 0,
                    license_valid_till TEXT,
                    trial_enabled INTEGER DEFAULT 0,
                    trial_start_date TEXT,
                    trial_days INTEGER DEFAULT 0,
                    frontend_url TEXT,
                    backend_url TEXT,
                    offline_path TEXT
                )
            """))
            # Try to copy from existing table if present
            try:
                conn.execute(text("""
                    INSERT INTO system_settings_new (
                        id, app_name, company_name, company_address, company_phone, logo_base64,
                        commission_enabled, commission_percent, auto_backup_enabled, auto_backup_frequency,
                        sms_provider, twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from,
                        payment_enabled, payment_provider, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret,
                        license_key, license_active, license_valid_till, trial_enabled, trial_start_date, trial_days,
                        frontend_url, backend_url, offline_path
                    )
                    SELECT
                        id, app_name, company_name, company_address, company_phone, logo_base64,
                        commission_enabled, commission_percent, auto_backup_enabled, auto_backup_frequency,
                        sms_provider, twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from,
                        payment_enabled, payment_provider, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret,
                        license_key, license_active, license_valid_till, trial_enabled, trial_start_date, trial_days,
                        NULL AS frontend_url, NULL AS backend_url, NULL AS offline_path
                    FROM system_settings
                """))
            except Exception:
                # If old table not present, insert default row
                conn.execute(text("""
                    INSERT INTO system_settings_new (
                        id, app_name, company_name, company_address, company_phone, logo_base64,
                        commission_enabled, commission_percent, auto_backup_enabled, auto_backup_frequency,
                        sms_provider, twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from,
                        payment_enabled, payment_provider, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret,
                        license_key, license_active, license_valid_till, trial_enabled, trial_start_date, trial_days,
                        frontend_url, backend_url, offline_path
                    )
                    VALUES (
                        1, 'Finance Manager', '', '', '', NULL,
                        0, 0, 0, 'daily',
                        'twilio', NULL, NULL, NULL, NULL,
                        0, 'razorpay', NULL, NULL, NULL,
                        NULL, 0, NULL, 0, NULL, 0,
                        NULL, NULL, NULL
                    )
                """))
            # Replace old table
            try:
                conn.execute(text("DROP TABLE system_settings"))
            except Exception:
                pass
            conn.execute(text("ALTER TABLE system_settings_new RENAME TO system_settings"))
    except Exception:
        pass

migrate_settings_table_if_needed()

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
# Translation Dictionary for Multi-language Reports
TRANSLATIONS = {
    "PAYMENT RECEIPT": {
        "English": "PAYMENT RECEIPT",
        "Tamil": "கட்டண ரசீது",
        "Hindi": "भुगतान रसीद",
        "Telugu": "చెల్లింపు రసీదు",
        "Kannada": "ಪಾವತಿ ರಸೀದಿ",
        "Malayalam": "പേയ്മെന്റ് രസീത്",
        "Bengali": "পেমেন্ট রশিদ",
        "Marathi": "पेमेंट पावती",
        "Gujarati": "ચુકવણી રસીદ",
        "Punjabi": "ਭੁਗਤਾਨ ਰਸੀਦ"
    },
    "Receipt No": {
        "English": "Receipt No",
        "Tamil": "ரசீது எண்",
        "Hindi": "रसीद संख्या",
        "Telugu": "రసీదు సంఖ్య",
        "Kannada": "ರಸೀದಿ ಸಂಖ್ಯೆ",
        "Malayalam": "രസീത് നമ്പർ",
        "Bengali": "রশিদ নম্বর",
        "Marathi": "पावती क्रमांक",
        "Gujarati": "રસીદ નંબર",
        "Punjabi": "ਰਸੀਦ ਨੰਬਰ"
    },
    "Date": {
        "English": "Date",
        "Tamil": "தேதி",
        "Hindi": "दिनांक",
        "Telugu": "తేదీ",
        "Kannada": "ದಿನಾಂಕ",
        "Malayalam": "തിയതി",
        "Bengali": "তারিখ",
        "Marathi": "तारीख",
        "Gujarati": "તારીખ",
        "Punjabi": "ਤਾਰੀਖ"
    },
    "Phone": {
        "English": "Phone",
        "Tamil": "தொலைபேசி",
        "Hindi": "फ़ोन",
        "Telugu": "ఫోన్",
        "Kannada": "ಫೋನ್",
        "Malayalam": "ഫോൺ",
        "Bengali": "ফোন",
        "Marathi": "फोन",
        "Gujarati": "ફોન",
        "Punjabi": "ਫੋਨ"
    },
    "Customer": {
        "English": "Customer",
        "Tamil": "வாடிக்கையாளர்",
        "Hindi": "ग्राहक",
        "Telugu": "కస్టమర్",
        "Kannada": "ಗ್ರಾಹಕರು",
        "Malayalam": "ഉപഭോക്താവ്",
        "Bengali": "গ্রাহক",
        "Marathi": "ग्राहक",
        "Gujarati": "ગ્રાહક",
        "Punjabi": "ਗਾਹਕ"
    },
    "Description": {
        "English": "Description",
        "Tamil": "விவரம்",
        "Hindi": "विवरण",
        "Telugu": "వివరణ",
        "Kannada": "ವಿವರಣೆ",
        "Malayalam": "വിവരണം",
        "Bengali": "বিবরণ",
        "Marathi": "वर्णन",
        "Gujarati": "વર્ણન",
        "Punjabi": "ਵੇਰਵਾ"
    },
    "Amount": {
        "English": "Amount",
        "Tamil": "தொகை",
        "Hindi": "राशि",
        "Telugu": "మొత్తం",
        "Kannada": "ಮೊತ್ತ",
        "Malayalam": "തുക",
        "Bengali": "পরিমাণ",
        "Marathi": "रक्कम",
        "Gujarati": "રકમ",
        "Punjabi": "ਰਕਮ"
    },
    "Total Paid:": {
        "English": "Total Paid:",
        "Tamil": "இதுவரை செலுத்தியது:",
        "Hindi": "कुल भुगतान:",
        "Telugu": "మొత్తం చెల్లించినది:",
        "Kannada": "ಒಟ್ಟು ಪಾವತಿಸಿದ ಮೊತ್ತ:",
        "Malayalam": "ആകെ അടച്ചത്:",
        "Bengali": "মোট প্রদান করা হয়েছে:",
        "Marathi": "एकूण भरले:",
        "Gujarati": "કુલ ચુકવેલ:",
        "Punjabi": "ਕੁੱਲ ਭੁਗਤਾਨ ਕੀਤਾ:"
    },
    "Balance Due:": {
        "English": "Balance Due:",
        "Tamil": "மீதமுள்ள நிலுவைத் தொகை:",
        "Hindi": "बकाया राशि:",
        "Telugu": "మిగిలిన బకాయి:",
        "Kannada": "ಬಾಕಿ ಉಳಿದ ಮೊತ್ತ:",
        "Malayalam": "ബാക്കി തുക:",
        "Bengali": "বাকি পরিমাণ:",
        "Marathi": "शिल्लक रक्कम:",
        "Gujarati": "બાકી રકમ:",
        "Punjabi": "ਬਾਕੀ ਰਕਮ:"
    },
    "Thank you for your payment!": {
        "English": "Thank you for your payment!",
        "Tamil": "உங்கள் கட்டணம் பெறப்பட்டது. நன்றி!",
        "Hindi": "आपके भुगतान के लिए धन्यवाद!",
        "Telugu": "మీ చెల్లింపుకు ధన్యవాదాలు!",
        "Kannada": "ನಿಮ್ಮ ಪಾವತಿಗೆ ಧನ್ಯವಾದಗಳು!",
        "Malayalam": "നിങ്ങളുടെ പേയ്മെന്റിന് നന്ദി!",
        "Bengali": "আপনার পেমেন্টের জন্য ধন্যবাদ!",
        "Marathi": "आपल्या पेमेंटबद्दल धन्यवाद!",
        "Gujarati": "તમારી ચુકવણી બદલ આભાર!",
        "Punjabi": "ਤੁਹਾਡੇ ਭੁਗਤਾਨ ਲਈ ਧੰਨਵਾਦ!"
    },
    "Computer generated receipt.": {
        "English": "Computer generated receipt.",
        "Tamil": "கணினியால் உருவாக்கப்பட்ட ரசீது.",
        "Hindi": "कंप्यूटर जनित रसीद.",
        "Telugu": "కంప్యూటర్ ద్వారా సృష్టించబడిన రసీదు.",
        "Kannada": "ಕಂಪ್ಯೂಟರ್ ನಿಂದ ಸಿದ್ಧಪಡಿಸಿದ ರಸೀದಿ.",
        "Malayalam": "കമ്പ്യൂട്ടർ ജനറേറ്റഡ് രസീത്.",
        "Bengali": "কম্পিউটার জেনারেটেড রশিদ।",
        "Marathi": "संगणकीय पावती.",
        "Gujarati": "કમ્પ્યુટર જનરેટેડ રસીદ.",
        "Punjabi": "ਕੰਪਿਊਟਰ ਦੁਆਰਾ ਤਿਆਰ ਕੀਤੀ ਰਸੀਦ।"
    },
    "LOAN SANCTION LETTER": {
        "English": "LOAN SANCTION LETTER",
        "Tamil": "கடன் அனுமதி கடிதம்",
        "Hindi": "ऋण स्वीकृति पत्र",
        "Telugu": "రుణ మంజూరు లేఖ",
        "Kannada": "ಸಾಲ ಮಂಜೂರಾತಿ ಪತ್ರ",
        "Malayalam": "ലോൺ സാങ്ഷൻ ലെറ്റർ",
        "Bengali": "লোন মঞ্জুরি পত্র",
        "Marathi": "कर्ज मंजुरी पत्र",
        "Gujarati": "લોન મંજૂરી પત્ર",
        "Punjabi": "ਕਰਜ਼ਾ ਮਨਜ਼ੂਰੀ ਪੱਤਰ"
    },
    "Subject: Sanction of Loan Facility": {
        "English": "Subject: Sanction of Loan Facility",
        "Tamil": "பொருள்: கடன் அனுமதி கடிதம்",
        "Hindi": "विषय: ऋण सुविधा की स्वीकृति",
        "Telugu": "విషయం: రుణ సదుపాయం మంజూరు",
        "Kannada": "ವಿಷಯ: ಸಾಲ ಸೌಲಭ್ಯದ ಮಂಜೂರಾತಿ",
        "Malayalam": "വിഷയം: ലോൺ സൗകര്യം അനുവദിക്കൽ",
        "Bengali": "বিষয়: লোন সুবিধা মঞ্জুরি",
        "Marathi": "विषय: कर्ज सुविधा मंजुरी",
        "Gujarati": "વિષય: લોન સુવિધાની મંજૂરી",
        "Punjabi": "ਵਿਸ਼ਾ: ਕਰਜ਼ਾ ਸਹੂਲਤ ਦੀ ਮਨਜ਼ੂਰੀ"
    },
    "Details": {
        "English": "Details",
        "Tamil": "தகவல்",
        "Hindi": "जानकारी",
        "Telugu": "వివరాలు",
        "Kannada": "ವಿವರಗಳು",
        "Malayalam": "വിശദാംശങ്ങൾ",
        "Bengali": "বিস্তারিত",
        "Marathi": "तपशील",
        "Gujarati": "વિગતો",
        "Punjabi": "ਵੇਰਵੇ"
    },
    "Loan Amount": {
        "English": "Loan Amount",
        "Tamil": "கடன் தொகை",
        "Hindi": "ऋण राशि",
        "Telugu": "రుణ మొత్తం",
        "Kannada": "ಸಾಲದ ಮೊತ್ತ",
        "Malayalam": "ലോൺ തുക",
        "Bengali": "লোনের পরিমাণ",
        "Marathi": "कर्जाची रक्कम",
        "Gujarati": "લોન રકમ",
        "Punjabi": "ਕਰਜ਼ੇ ਦੀ ਰਕਮ"
    },
    "Loan Type": {
        "English": "Loan Type",
        "Tamil": "கடன் வகை",
        "Hindi": "ऋण का प्रकार",
        "Telugu": "రుణ రకం",
        "Kannada": "ಸಾಲದ ವಿಧ",
        "Malayalam": "ലോൺ തരം",
        "Bengali": "লোনের ধরণ",
        "Marathi": "कर्जाचा प्रकार",
        "Gujarati": "લોનનો પ્રકાર",
        "Punjabi": "ਕਰਜ਼ੇ ਦੀ ਕਿਸਮ"
    },
    "Disbursed Amount": {
        "English": "Disbursed Amount",
        "Tamil": "வழங்கப்பட்ட தொகை",
        "Hindi": "वितरित राशि",
        "Telugu": "పంపిణీ చేసిన మొత్తం",
        "Kannada": "ವಿತರಿಸಿದ ಮೊತ್ತ",
        "Malayalam": "വിതരണം ചെയ്ത തുക",
        "Bengali": "বিতরণকৃত পরিমাণ",
        "Marathi": "वितरित रक्कम",
        "Gujarati": "વિતરિત રકમ",
        "Punjabi": "ਵੰਡੀ ਗਈ ਰਕਮ"
    },
    "Due Amount": {
        "English": "Due Amount",
        "Tamil": "தவணைத் தொகை",
        "Hindi": "देय राशि",
        "Telugu": "బకాయి మొత్తం",
        "Kannada": "ಬಾಕಿ ಮೊತ್ತ",
        "Malayalam": "അടയ്ക്കാനുള്ള തുക",
        "Bengali": "বাকি পরিমাণ",
        "Marathi": "देय रक्कम",
        "Gujarati": "બાકી રકમ",
        "Punjabi": "ਬਾਕੀ ਰਕਮ"
    },
    "Total Duration": {
        "English": "Total Duration",
        "Tamil": "மொத்தக் காலம்",
        "Hindi": "कुल अवधि",
        "Telugu": "మొత్తం కాలపరిమితి",
        "Kannada": "ಒಟ್ಟು ಅವಧಿ",
        "Malayalam": "ആകെ കാലാവധി",
        "Bengali": "মোট সময়কাল",
        "Marathi": "एकूण कालावधी",
        "Gujarati": "કુલ સમયગાળો",
        "Punjabi": "ਕੁੱਲ ਮਿਆਦ"
    },
    "Start Date": {
        "English": "Start Date",
        "Tamil": "தொடங்கும் தேதி",
        "Hindi": "प्रारंभ तिथि",
        "Telugu": "ప్రారంభ తేదీ",
        "Kannada": "ಪ್ರಾರಂಭ ದಿನಾಂಕ",
        "Malayalam": "തുടങ്ങുന്ന തിയതി",
        "Bengali": "শুরুর তারিখ",
        "Marathi": "सुरुवात तारीख",
        "Gujarati": "શરૂઆતની તારીખ",
        "Punjabi": "ਸ਼ੁਰੂਆਤੀ ਤਾਰੀਖ"
    },
    "Terms & Conditions:": {
        "English": "Terms & Conditions:",
        "Tamil": "நிபந்தனைகள்:",
        "Hindi": "नियम एवं शर्तें:",
        "Telugu": "నిబంధనలు & షరతులు:",
        "Kannada": "ನಿಯಮಗಳು ಮತ್ತು ಶರತ್ತುಗಳು:",
        "Malayalam": "നിബന്ധനകളും വ്യവസ്ഥകളും:",
        "Bengali": "শর্তাবলী:",
        "Marathi": "अटी आणि शर्ती:",
        "Gujarati": "નિયમો અને શરતો:",
        "Punjabi": "ਨਿਯਮ ਅਤੇ ਸ਼ਰਤਾਂ:"
    },
    "Authorized Signatory": {
        "English": "Authorized Signatory",
        "Tamil": "அங்கீகரிக்கப்பட்ட கையொப்பம்",
        "Hindi": "अधिकृत हस्ताक्षरकर्ता",
        "Telugu": "అధికారిక సంతకం",
        "Kannada": "ಅಧಿಕೃತ ಸಹಿದಾರರು",
        "Malayalam": "അംഗീകൃത ഒപ്പുകാരൻ",
        "Bengali": "অনুমোদিত স্বাক্ষরকারী",
        "Marathi": "अधिकृत स्वाक्षरीकर्ता",
        "Gujarati": "અધિકૃત સહી કરનાર",
        "Punjabi": "ਅਧਿਕਾਰਤ ਹਸਤਾਖਰਕਰਤਾ"
    },
    "To,": {
        "English": "To,",
        "Tamil": "பெறுநர்,",
        "Hindi": "सेवा में,",
        "Telugu": "ప్రతికి,",
        "Kannada": "ಇವರಿಗೆ,",
        "Malayalam": "സ്വീകർത്താവ്,",
        "Bengali": "প্রতি,",
        "Marathi": "प्रति,",
        "Gujarati": "પ્રતિ,",
        "Punjabi": "ਵੱਲੋਂ,"
    },
    "Address": {
        "English": "Address",
        "Tamil": "முகவரி",
        "Hindi": "पता",
        "Telugu": "చిరునామా",
        "Kannada": "ವಿಳಾಸ",
        "Malayalam": "വിലാസം",
        "Bengali": "ঠিকানা",
        "Marathi": "पत्ता",
        "Gujarati": "સરનામું",
        "Punjabi": "ਪਤਾ"
    },
    "Loan ID": {
        "English": "Loan ID",
        "Tamil": "கடன் எண்",
        "Hindi": "ऋण आईडी",
        "Telugu": "రుణ ఐడి",
        "Kannada": "ಸಾಲದ ಐಡಿ",
        "Malayalam": "ലോൺ ഐഡി",
        "Bengali": "লোন আইডি",
        "Marathi": "कर्ज आयडी",
        "Gujarati": "લોન આઈડી",
        "Punjabi": "ਕਰਜ਼ਾ ਆਈਡੀ"
    },
    "Dear": {
        "English": "Dear",
        "Tamil": "மதிப்பிற்குரிய",
        "Hindi": "प्रिय",
        "Telugu": "ప్రియమైన",
        "Kannada": "ಆತ್ಮೀಯ",
        "Malayalam": "പ്രിയപ്പെട്ട",
        "Bengali": "প্রিয়",
        "Marathi": "प्रिय",
        "Gujarati": "પ્રિય",
        "Punjabi": "ਪਿਆਰੇ"
    },
    "loan_approval_body": {
        "English": "we are pleased to inform you that your loan application has been approved with the following terms and conditions:",
        "Tamil": "உங்களது கடன் விண்ணப்பம் கீழ்க்கண்ட நிபந்தனைகளுடன் அங்கீகரிக்கப்பட்டுள்ளது என்பதை மகிழ்ச்சியுடன் தெரிவித்துக் கொள்கிறோம்:",
        "Hindi": "हमें आपको यह सूचित करते हुए खुशी हो रही है कि आपका ऋण आवेदन निम्नलिखित नियमों और शर्तों के साथ स्वीकार कर लिया गया है:",
        "Telugu": "మీ రుణ దరఖాస్తు ఈ క్రింది నిబంధనలు మరియు షరతులతో ఆమోదించబడిందని మీకు తెలియజేయడానికి మేము సంతోషిస్తున్నాము:",
        "Kannada": "ನಿಮ್ಮ ಸಾಲದ ಅರ್ಜಿಯನ್ನು ಈ ಕೆಳಗಿನ ನಿಯಮಗಳು ಮತ್ತು ಶರತ್ತುಗಳೊಂದಿಗೆ ಅಂಗೀಕರಿಸಲಾಗಿದೆ ಎಂದು ತಿಳಿಸಲು ನಾವು ಸಂತೋಷಪಡುತ್ತೇವೆ:",
        "Malayalam": "നിങ്ങളുടെ ലോൺ അപേക്ഷ താഴെ പറയുന്ന നിബന്ധനകളോടും വ്യവസ്ഥകളോടും കൂടി അംഗീകരിച്ചിട്ടുണ്ടെന്ന് അറിയിക്കുന്നതിൽ ഞങ്ങൾക്ക് സന്തോഷമുണ്ട്:",
        "Bengali": "আমরা আপনাকে জানাতে পেরে আনন্দিত যে আপনার লোন আবেদনটি নিম্নলিখিত শর্তাবলীর সাথে মঞ্জুর করা হয়েছে:",
        "Marathi": "आम्हाला कळवण्यास आनंद होत आहे की तुमचा कर्ज अर्ज खालील अटी व शर्तींसह मंजूर करण्यात आला आहे:",
        "Gujarati": "અમને તમને જણાવતા આનંદ થાય છે કે તમારી લોન અરજી નીચેની શરતો સાથે મંજૂર કરવામાં આવી છે:",
        "Punjabi": "ਸਾਨੂੰ ਤੁਹਾਨੂੰ ਇਹ ਸੂਚਿਤ ਕਰਦਿਆਂ ਖੁਸ਼ੀ ਹੋ ਰਹੀ ਹੈ ਕਿ ਤੁਹਾਡੀ ਕਰਜ਼ਾ ਅਰਜ਼ੀ ਹੇਠਾਂ ਦਿੱਤੀਆਂ ਸ਼ਰਤਾਂ ਨਾਲ ਮਨਜ਼ੂਰ ਹੋ ਗਈ ਹੈ:"
    },
    "Daily": {
        "English": "Daily",
        "Tamil": "தினசரி",
        "Hindi": "दैनिक",
        "Telugu": "రోజువారీ",
        "Kannada": "ದೈನಂದಿನ",
        "Malayalam": "ദിവസേന",
        "Bengali": "দৈনিক",
        "Marathi": "दैनिक",
        "Gujarati": "દૈનિક",
        "Punjabi": "ਰੋਜ਼ਾਨਾ"
    },
    "Weekly": {
        "English": "Weekly",
        "Tamil": "வாராந்திர",
        "Hindi": "साप्ताहिक",
        "Telugu": "వారానికోసారి",
        "Kannada": "ವಾರಕ್ಕೊಮ್ಮೆ",
        "Malayalam": "ആഴ്ചതോറും",
        "Bengali": "সাপ্তাহিক",
        "Marathi": "साप्ताहिक",
        "Gujarati": "સાપ્તાહિક",
        "Punjabi": "ਹਫਤਾਵਾਰੀ"
    },
    "Monthly": {
        "English": "Monthly",
        "Tamil": "மாதாந்திர",
        "Hindi": "मासिक",
        "Telugu": "నెలవారీ",
        "Kannada": "ಮಾಸಿಕ",
        "Malayalam": "പ്രതിമാസം",
        "Bengali": "মাসিক",
        "Marathi": "मासिक",
        "Gujarati": "માસિક",
        "Punjabi": "ਮਹੀਨਾਵਾਰ"
    },
    "Installment": {
        "English": "Installment",
        "Tamil": "தவணை",
        "Hindi": "किस्त",
        "Telugu": "వాయిదా",
        "Kannada": "ಕಂತು",
        "Malayalam": "ഗഡു",
        "Bengali": "কিস্তি",
        "Marathi": "हप्ता",
        "Gujarati": "હપ્તો",
        "Punjabi": "ਕਿਸ਼ਤ"
    },
    "For": {
        "English": "For",
        "Tamil": "நிர்வாகத்திற்காக",
        "Hindi": "के लिए",
        "Telugu": "కొరకు",
        "Kannada": "ಗಾಗಿ",
        "Malayalam": "വേണ്ടി",
        "Bengali": "জন্য",
        "Marathi": "साठी",
        "Gujarati": "માટે",
        "Punjabi": "ਲਈ"
    },
    "term_1": {
        "English": "1. Installments must be paid on or before the due date.",
        "Tamil": "1. தவணைத் தொகையை உரிய தேதிக்குள் செலுத்த வேண்டும்.",
        "Hindi": "1. किस्तों का भुगतान देय तिथि को या उससे पहले किया जाना चाहिए।",
        "Telugu": "1. వాయిదాలను గడువు తేదీలోగా లేదా అంతకంటే ముందే చెల్లించాలి.",
        "Kannada": "1. ಕಂತುಗಳನ್ನು ನಿಗದಿತ ದಿನಾಂಕದಂದು ಅಥವಾ ಅದಕ್ಕಿಂತ ಮೊದಲು ಪಾವತಿಸಬೇಕು.",
        "Malayalam": "1. ഗഡുക്കൾ നിശ്ചിത തീയതിയിലോ അതിനുമുമ്പോ അടയ്ക്കണം.",
        "Bengali": "১. কিস্তি অবশ্যই নির্ধারিত তারিখের মধ্যে বা তার আগে পরিশোধ করতে হবে।",
        "Marathi": "१. हप्ते देय तारखेला किंवा त्यापूर्वी भरले पाहिजेत.",
        "Gujarati": "1. હપ્તાઓ નિયત તારીખે અથવા તે પહેલાં ચૂકવવા આવશ્યક છે.",
        "Punjabi": "1. ਕਿਸ਼ਤਾਂ ਦਾ ਭੁਗਤਾਨ ਨਿਯਤ ਮਿਤੀ 'ਤੇ ਜਾਂ ਇਸ ਤੋਂ ਪਹਿਲਾਂ ਕੀਤਾ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ।"
    },
    "term_2": {
        "English": "2. Delay in payment may attract penalty charges.",
        "Tamil": "2. தாமதமாகச் செலுத்தப்படும் தவணைகளுக்கு அபராதக் கட்டணம் வசூலிக்கப்படும்.",
        "Hindi": "2. भुगतान में देरी पर जुर्माना लगाया जा सकता है।",
        "Telugu": "2. చెల్లింపులో ఆలస్యమైతే పెనాల్టీ ఛార్జీలు విధించబడవచ్చు.",
        "Kannada": "2. ಪಾವತಿಯಲ್ಲಿ ವಿಳಂಬವಾದರೆ ದಂಡ ಶುಲ್ಕ ವಿಧಿಸಬಹುದು.",
        "Malayalam": "2. പേയ്മെന്റ് വൈകുന്നത് പിഴ ഈടാക്കാൻ കാരണമായേക്കാം.",
        "Bengali": "২. পেমেন্টে বিলম্ব হলে জরিমানা হতে পারে।",
        "Marathi": "२. पेमेंटला उशीर झाल्यास दंड आकारला जाऊ शकतो.",
        "Gujarati": "2. ચુકવણીમાં વિલંબ બદલ દંડ લાગુ થઈ શકે છે.",
        "Punjabi": "2. ਭੁਗਤਾਨ ਵਿੱਚ ਦੇਰੀ ਹੋਣ ਤੇ ਜੁਰਮਾਨਾ ਲਗਾਇਆ ਜਾ ਸਕਦਾ ਹੈ।"
    },
    "term_3": {
        "English": "3. The company reserves the right to take legal action for defaults.",
        "Tamil": "3. தவணை தவறினால் சட்டப்பூர்வ நடவடிக்கை எடுக்க நிறுவனத்திற்கு உரிமை உண்டு.",
        "Hindi": "3. कंपनी के पास डिफॉल्ट के लिए कानूनी कार्रवाई करने का अधिकार सुरक्षित है।",
        "Telugu": "3. డిఫాల్ట్‌ల కోసం చట్టపరమైన చర్య తీసుకునే హక్కు కంపెనీకి ఉంది.",
        "Kannada": "3. ಬಾಕಿ ಪಾವತಿಸದಿದ್ದಲ್ಲಿ ಕಾನೂನು ಕ್ರಮ ಕೈಗೊಳ್ಳುವ ಹಕ್ಕನ್ನು ಕಂಪನಿಯು ಹೊಂದಿದೆ.",
        "Malayalam": "3. കുടിശ്ശിക വരുത്തിയാൽ നിയമനടപടി സ്വീകരിക്കാനുള്ള അവകാശം കമ്പനിയിൽ നിക്ഷിപ്തമാണ്.",
        "Bengali": "৩. বকেয়া থাকার জন্য আইনি ব্যবস্থা নেওয়ার অধিকার কোম্পানির রয়েছে।",
        "Marathi": "३. थकबाकीसाठी कायदेशीर कारवाई करण्याचा अधिकार कंपनीकडे राखीव आहे.",
        "Gujarati": "3. કંપની ડિફોલ્ટ માટે કાનૂની કાર્યવાહી કરવાનો અધિકાર અનામત રાખે છે.",
        "Punjabi": "3. ਕੰਪਨੀ ਡਿਫਾਲਟ ਲਈ ਕਾਨੂੰਨੀ ਕਾਰਵਾਈ ਕਰਨ ਦਾ ਅਧਿਕਾਰ ਰਾਖਵਾਂ ਰੱਖਦੀ ਹੈ।"
    },
    "Address": {
        "English": "Address",
        "Tamil": "முகவரி",
        "Hindi": "पता",
        "Telugu": "చిరునామా",
        "Kannada": "ವಿಳಾಸ",
        "Malayalam": "വിലാസം",
        "Bengali": "ঠিকানা",
        "Marathi": "पत्ता",
        "Gujarati": "સરનામું",
        "Punjabi": "ਪਤਾ"
    },
    "Loan ID": {
        "English": "Loan ID",
        "Tamil": "கடன் எண்",
        "Hindi": "ऋण आईडी",
        "Telugu": "రుణ ఐడి",
        "Kannada": "ಸಾಲದ ಐಡಿ",
        "Malayalam": "ലോൺ ഐഡി",
        "Bengali": "লোন আইডি",
        "Marathi": "कर्ज आयडी",
        "Gujarati": "લોન આઈડી",
        "Punjabi": "ਕਰਜ਼ਾ ਆਈਡੀ"
    },
    "Dear": {
        "English": "Dear",
        "Tamil": "மதிப்பிற்குரிய",
        "Hindi": "प्रिय",
        "Telugu": "ప్రియమైన",
        "Kannada": "ಆತ್ಮೀಯ",
        "Malayalam": "പ്ரியപ്പെട്ട",
        "Bengali": "প্রিয়",
        "Marathi": "प्रिय",
        "Gujarati": "પ્રિય",
        "Punjabi": "ਪਿਆਰੇ"
    },
    "loan_approval_body": {
        "English": "we are pleased to inform you that your loan application has been approved with the following terms and conditions:",
        "Tamil": "உங்கள் கடன் விண்ணப்பம் கீழ்க்கண்ட நிபந்தனைகளுடன் அங்கீகரிக்கப்பட்டுள்ளது என்பதை மகிழ்ச்சியுடன் தெரிவித்துக் கொள்கிறோம்:",
        "Hindi": "हमें आपको सूचित करते हुए खुशी हो रही है कि आपका ऋण आवेदन निम्नलिखित नियमों और शर्तों के साथ स्वीकार कर लिया गया है:",
        "Telugu": "మీ రుణ దరఖాస్తు ఈ క్రింది నిబంధనలు మరియు షరతులతో ఆమోదించబడిందని మీకు తెలియజేయడానికి మేము సంతోషిస్తున్నాము:",
        "Kannada": "ನಿಮ್ಮ ಸಾಲದ ಅರ್ಜಿಯನ್ನು ಈ ಕೆಳಗಿನ ನಿಯಮಗಳು ಮತ್ತು ಶರತ್ತುಗಳೊಂದಿಗೆ ಅನುಮೋದಿಸಲಾಗಿದೆ ಎಂದು ತಿಳಿಸಲು ನಾವು ಸಂತೋಷಪಡುತ್ತೇವೆ:",
        "Malayalam": "നിങ്ങളുടെ ലോൺ അപേക്ഷ താഴെ പറയുന്ന നിബന്ധനകളോടും വ്യവസ്ഥകളോടും കൂടി അംഗീകരിച്ചിട്ടുണ്ടെന്ന് അറിയിക്കുന്നതിൽ ഞങ്ങൾക്ക് സന്തോഷമുണ്ട്:",
        "Bengali": "আমরা আপনাকে জানাতে পেরে আনন্দিত যে আপনার লোন আবেদনটি নিম্নলিখিত শর্তাবলীর সাথে অনুমোদিত হয়েছে:",
        "Marathi": "आम्हाला कळवण्यास आनंद होत आहे की तुमचा कर्जाचा अर्ज खालील अटी व शर्तींसह मंजूर करण्यात आला आहे:",
        "Gujarati": "અમને તમને જણાવતા આનંદ થાય છે કે તમારી લોન અરજી નીચેની શરતો સાથે મંજૂર કરવામાં આવી છે:",
        "Punjabi": "ਸਾਨੂੰ ਤੁਹਾਨੂੰ ਇਹ ਦੱਸਦੇ ਹੋਏ ਖੁਸ਼ੀ ਹੋ ਰਹੀ ਹੈ ਕਿ ਤੁਹਾਡੀ ਕਰਜ਼ੇ ਦੀ ਅਰਜ਼ੀ ਹੇਠ ਲਿਖੀਆਂ ਸ਼ਰਤਾਂ ਨਾਲ ਮਨਜ਼ੂਰ ਕਰ ਲਈ ਗਈ ਹੈ:"
    },
    "For": {
        "English": "For",
        "Tamil": "நிர்வாகத்திற்காக,",
        "Hindi": "के लिए",
        "Telugu": "కొరకు",
        "Kannada": "ಇವರಿಗಾಗಿ",
        "Malayalam": "വേണ്ടി",
        "Bengali": "জন্য",
        "Marathi": "करीता",
        "Gujarati": "માટે",
        "Punjabi": "ਲਈ"
    },
    "Daily": {
        "English": "Daily",
        "Tamil": "தினசரி",
        "Hindi": "दैनिक",
        "Telugu": "రోజువారీ",
        "Kannada": "ದೈನಂದಿನ",
        "Malayalam": "ദിവസേനയുള്ള",
        "Bengali": "দৈনিক",
        "Marathi": "दैनिक",
        "Gujarati": "દૈનિક",
        "Punjabi": "ਰੋਜ਼ਾਨਾ"
    },
    "Weekly": {
        "English": "Weekly",
        "Tamil": "வாராந்திர",
        "Hindi": "साप्ताहिक",
        "Telugu": "వారపు",
        "Kannada": "ವಾರದ",
        "Malayalam": "വാരാന്ത്യ",
        "Bengali": "সাপ্তাহিক",
        "Marathi": "साप्ताहिक",
        "Gujarati": "સાપ્તાહિક",
        "Punjabi": "ਹਫ਼ਤਾਵਾਰੀ"
    },
    "Monthly": {
        "English": "Monthly",
        "Tamil": "மாதாந்திர",
        "Hindi": "मासिक",
        "Telugu": "నెలవారీ",
        "Kannada": "ಮಾಸಿಕ",
        "Malayalam": "പ്രതിമാസ",
        "Bengali": "মাসিক",
        "Marathi": "मासिक",
        "Gujarati": "માસિક",
        "Punjabi": "ਮਾਸਿਕ"
    },
    "Installment": {
        "English": "Installment",
        "Tamil": "தவணை",
        "Hindi": "किस्त",
        "Telugu": "వాయిదా",
        "Kannada": "ಕಂತು",
        "Malayalam": "ഗഡു",
        "Bengali": "কিস্তি",
        "Marathi": "हप्ता",
        "Gujarati": "હપ્તો",
        "Punjabi": "ਕਿਸ਼ਤ"
    },
    "term_1": {
        "English": "1. Installments must be paid on or before the due date.",
        "Tamil": "1. தவணைத் தொகையை உரிய தேதிக்குள் செலுத்த வேண்டும்.",
        "Hindi": "1. किस्तों का भुगतान देय तिथि को या उससे पहले किया जाना चाहिए।",
        "Telugu": "1. వాయిదాలను గడువు తేదీలోగా లేదా అంతకంటే ముందే చెల్లించాలి.",
        "Kannada": "1. ಕಂತುಗಳನ್ನು ನಿಗದಿತ ದಿನಾಂಕದಂದು ಅಥವಾ ಅದಕ್ಕಿಂತ ಮೊದಲು ಪಾವತಿಸಬೇಕು.",
        "Malayalam": "1. ഗഡുക്കൾ നിശ്ചിత തീയതിയിലോ അതിന് മുമ്പോ അടയ്ക്കേണ്ടതാണ്.",
        "Bengali": "1. কিস্তিগুলি নির্ধারিত তারিখের মধ্যে বা তার আগে পরিশোধ করতে হবে।",
        "Marathi": "1. हप्ते देय तारखेला किंवा त्यापूर्वी भरले पाहिजेत.",
        "Gujarati": "1. હપ્તાઓ નિયત તારીખે અથવા તે પહેલાં ચૂકવવાના રહેશે.",
        "Punjabi": "1. ਕਿਸ਼ਤਾਂ ਦੀ ਅਦਾਇਗੀ ਨਿਯਤ ਮਿਤੀ ਨੂੰ ਜਾਂ ਉਸ ਤੋਂ ਪਹਿਲਾਂ ਕੀਤੀ ਜਾਣੀ ਚਾਹੀਦੀ ਹੈ।"
    },
    "term_2": {
        "English": "2. Delay in payment may attract penalty charges.",
        "Tamil": "2. தாமதமாகச் செலுத்தப்படும் தவணைகளுக்கு அபராதக் கட்டணம் வசூலிக்கப்படும்.",
        "Hindi": "2. भुगतान में देरी पर जुर्माना लगाया जा सकता है।",
        "Telugu": "2. చెల్లింపులో ఆలస్యమైతే జరిమానా విధించబడుతుంది.",
        "Kannada": "2. ಪಾವತಿಯಲ್ಲಿ ವಿಳಂಬವಾದರೆ ದಂಡ ವಿಧಿಸಬಹುದು.",
        "Malayalam": "2. തിരിച്ചടവ് വൈകിയാൽ പിഴ ഈടാക്കാം.",
        "Bengali": "2. পেমেন্টে বিলম্ব হলে জরিমানা হতে পারে।",
        "Marathi": "2. पेमेंटला उशीर झाल्यास दंड आकारला जाऊ शकतो.",
        "Gujarati": "2. ચુકવણીમાં વિલંબ બદલ પેનલ્ટી ચાર્જ લાગી શકે છે.",
        "Punjabi": "2. ਅਦਾਇਗੀ ਵਿੱਚ ਦੇਰੀ ਹੋਣ 'ਤੇ ਜੁਰਮਾਨਾ ਲਗਾਇਆ ਜਾ ਸਕਦਾ ਹੈ।"
    },
    "term_3": {
        "English": "3. The company reserves the right to take legal action for defaults.",
        "Tamil": "3. தவணை தவறினால் சட்டப்பூர்வ நடவடிக்கை எடுக்க நிறுவனத்திற்கு உரிமை உண்டு.",
        "Hindi": "3. कंपनी के पास डिफॉल्ट के लिए कानूनी कार्रवाई करने का अधिकार सुरक्षित है।",
        "Telugu": "3. డిఫాల్ట్‌ల కోసం చట్టపరమైన చర్య తీసుకునే హక్కు కంపెనీకి ఉంది.",
        "Kannada": "3. ಬಾಕಿ ಪಾವತಿಸದಿದ್ದಲ್ಲಿ ಕಾನೂನು ಕ್ರಮ ಕೈಗೊಳ್ಳುವ ಹಕ್ಕನ್ನು ಕಂಪನಿಯು ಹೊಂದಿದೆ.",
        "Malayalam": "3. തിരിച്ചടവ് മുടങ്ങിയാൽ നിയമനടപടി സ്വീകരിക്കാൻ കമ്പനിക്ക് അവകാശമുണ്ട്.",
        "Bengali": "3. খেলাপি হওয়ার ক্ষেত্রে কোম্পানি আইনি ব্যবস্থা নেওয়ার অধিকার রাখে।",
        "Marathi": "3. थकबाकीसाठी कायदेशीर कारवाई करण्याचा अधिकार कंपनीकडे राखीव आहे.",
        "Gujarati": "3. ડિફોલ્ટ માટે કાનૂની કાર્યવાહી કરવાનો અધિકાર કંપની પાસે અનામત છે.",
        "Punjabi": "3. ਕੰਪਨੀ ਕੋਲ ਡਿਫਾਲਟ ਲਈ ਕਾਨੂੰਨੀ ਕਾਰਵਾਈ ਕਰਨ ਦਾ ਅਧਿਕਾਰ ਸੁਰੱਖਿਅਤ ਹੈ।"
    }
}

def get_label(key: str, langs: List[str]) -> str:
    """Get translated label based on key and selected languages."""
    if key not in TRANSLATIONS:
        return key
        
    parts = []
    for lang in langs:
        lang = lang.strip()
        if lang in TRANSLATIONS[key]:
            val = TRANSLATIONS[key][lang]
            if val not in parts:
                parts.append(val)
    
    if not parts:
        return TRANSLATIONS[key].get("English", key)
    return " / ".join(parts)

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Customer Endpoints
@app.post("/customers/", response_model=schemas.Customer)
def create_customer(customer: schemas.CustomerCreate, db: Session = Depends(get_db)):
    p, a, pn = sanitize_kyc(customer.phone, customer.aadhaar_no, customer.pan_no)
    payload = customer.dict()
    payload.update({"phone": p, "aadhaar_no": a, "pan_no": pn})
    db_customer = models.Customer(**payload)
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@app.get("/customers/", response_model=List[schemas.Customer])
def read_customers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    customers = db.query(models.Customer).offset(skip).limit(limit).all()
    return customers

@app.put("/customers/{customer_id}", response_model=schemas.Customer)
def update_customer(customer_id: int, customer_update: schemas.CustomerCreate, db: Session = Depends(get_db)):
    db_customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    p, a, pn = sanitize_kyc(customer_update.phone, customer_update.aadhaar_no, customer_update.pan_no)
    db_customer.name = customer_update.name
    db_customer.phone = p
    db_customer.address = customer_update.address
    db_customer.aadhaar_no = a
    db_customer.pan_no = pn
    db_customer.photo = customer_update.photo
    db_customer.languages = customer_update.languages
    db_customer.name_tamil = customer_update.name_tamil
    db_customer.address_tamil = customer_update.address_tamil
    
    db.commit()
    db.refresh(db_customer)
    return db_customer

@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    db_customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(db_customer)
    db.commit()
    return {"message": "Customer deleted"}

# Loan Endpoints
@app.post("/loans/", response_model=schemas.Loan)
def create_loan(loan: schemas.LoanCreate, db: Session = Depends(get_db)):
    # Calculate disbursed amount
    disbursed = loan.amount - loan.deduction
    db_loan = models.Loan(**loan.dict(), disbursed_amount=disbursed)
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return db_loan

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    p, a, pn = sanitize_kyc(user.phone, user.aadhaar_no, user.pan_no)
    db_user = models.User(
        username=user.username,
        role=user.role,
        password_hash=user.password,  # In real app, hash this!
        full_name=user.full_name,
        phone=p,
        address=user.address,
        aadhaar_no=a,
        pan_no=pn,
        photo=user.photo
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/users/", response_model=List[schemas.User])
def read_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()

@app.get("/users/agents", response_model=List[schemas.User])
def read_agents(db: Session = Depends(get_db)):
    return db.query(models.User).filter(models.User.role == "agent").all()

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user_update: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    p, a, pn = sanitize_kyc(user_update.phone, user_update.aadhaar_no, user_update.pan_no)
    db_user.username = user_update.username
    db_user.full_name = user_update.full_name
    db_user.phone = p
    db_user.address = user_update.address
    db_user.aadhaar_no = a
    db_user.pan_no = pn
    db_user.photo = user_update.photo
    
    if user_update.password:
        db_user.password_hash = user_update.password
        
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/loans/pending", response_model=List[schemas.Loan])
def read_pending_loans(db: Session = Depends(get_db)):
    return db.query(models.Loan).filter(models.Loan.status == "pending").order_by(models.Loan.id.desc()).all()

@app.get("/loans/commission-report")
def get_commission_report(db: Session = Depends(get_db)):
    agents = db.query(models.User).filter(models.User.role == "agent").all()
    report = []
    for agent in agents:
        # Calculate total collections by this agent
        # We need to find transactions for loans assigned to this agent
        collections = db.query(func.sum(models.Transaction.amount)).join(models.Loan).filter(models.Loan.agent_id == agent.id).scalar() or 0
        # For simulation, let's assume 2% commission
        commission = collections * 0.02
        report.append({
            "agent_id": agent.id,
            "agent_name": agent.full_name,
            "total_collections": collections,
            "commission_earned": commission
        })
    return report

@app.get("/loans/monthly-stats")
def get_monthly_stats(db: Session = Depends(get_db)):
    # This is a simplified version for the charts
    # In a real app, you would group by month
    stats = db.query(
        func.date_trunc('month', models.Transaction.date).label('month'),
        func.sum(models.Transaction.amount).label('total')
    ).group_by('month').all()
    return [{"month": s.month, "total": s.total} for s in stats]

@app.get("/loans/rejected", response_model=List[schemas.Loan])
def read_rejected_loans(db: Session = Depends(get_db)):
    return db.query(models.Loan).filter(models.Loan.status == "rejected").order_by(models.Loan.id.desc()).all()

@app.post("/loans/{loan_id}/approve")
def approve_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    loan.status = "active"
    db.commit()
    db.refresh(loan)
    
    # Optional: Send notification upon approval
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் விண்ணப்பம் (ID: {loan.id}) அங்கீகரிக்கப்பட்டது. நன்றி!"
    if loan.notify_sms:
        notifications.send_sms_notification(loan.customer.phone, message)
    if loan.notify_whatsapp:
        notifications.send_whatsapp_notification(loan.customer.phone, message)
    
    notifications.send_app_notification(loan.customer.id, message)
    
    return loan

@app.get("/loans/{loan_id}/balance")
def get_loan_balance(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    total_paid = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.loan_id == loan.id).scalar() or 0
    balance = loan.amount - total_paid
    return {"balance": balance, "loan_amount": loan.amount, "total_paid": total_paid}

@app.post("/loans/{loan_id}/close")
def close_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status != "active":
        raise HTTPException(status_code=400, detail="Only active loans can be closed")
    
    # Calculate remaining balance
    total_paid = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.loan_id == loan.id).scalar() or 0
    balance = loan.amount - total_paid
    
    if balance > 0:
        # Create final transaction for the balance
        final_transaction = models.Transaction(
            loan_id=loan.id,
            amount=balance,
            date=datetime.now()
        )
        db.add(final_transaction)
    
    loan.status = "closed"
    db.commit()
    db.refresh(loan)
    
    # Optional: Send notification
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் கணக்கு (ID: {loan.id}) முழுமையாக முடிக்கப்பட்டது. நன்றி!"
    notifications.send_app_notification(loan.customer.id, message)
    
    return {"message": "Loan closed successfully", "balance_paid": balance}

    # Output to bytes
    pdf_bytes = pdf.output()
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Sanction_Letter_L{loan.id}.pdf"}
    )

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
    # If Tamil is selected, combine name and address
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
    
    # In some languages, the greeting structure might differ, but for simplicity:
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
    
    # Map loan type using translations
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
    # For Hindi, the structure is often "Company Name ke liye"
    if "Hindi" in langs:
        pdf.cell(0, 6, f"{company_name} {for_label}", ln=True, align="R")
    else:
        pdf.cell(0, 6, f"{for_label} {company_name}", ln=True, align="R")
        
    pdf.ln(12)
    
    auth_label = get_label("Authorized Signatory", langs)
    pdf.cell(0, 6, auth_label, ln=True, align="R")


@app.get("/loans/{loan_id}/sanction")
def get_loan_sanction(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status not in ["active", "closed"]:
         raise HTTPException(status_code=400, detail="Sanction letter is only available for approved loans")

    settings = get_settings(db)
    company_name = settings["company_name"] or "Finance Manager"
    company_address = settings["company_address"] or "N/A"
    company_phone = settings["company_phone"] or "N/A"

    pdf = FPDF()
    
    # Register Fonts
    fonts_dir = os.path.join(os.path.dirname(__file__), "fonts")
    
    # Font mapping for languages
    font_files = {
        "tamilfont": ("MuktaMalar-Regular.ttf", "MuktaMalar-Bold.ttf"),
        "hindifont": ("Mukta-Regular.ttf", "Mukta-Bold.ttf"),
        "telugufont": ("NotoSansTelugu-Regular.ttf", None),
        "kannadafont": ("NotoSansKannada-Regular.ttf", None),
        "malayalamfont": ("NotoSansMalayalam-Regular.ttf", None),
        "bengalifont": ("NotoSansBengali-Regular.ttf", None),
        "gujaratifont": ("NotoSansGujarati-Regular.ttf", None),
        "punjabifont": ("NotoSansGurmukhi-Regular.ttf", None),
    }
    
    # Enable text shaping for complex scripts
    pdf.set_text_shaping(True)
    
    # Add fonts
    registered_fonts = []
    for family, (reg_file, bold_file) in font_files.items():
        reg_path = os.path.join(fonts_dir, reg_file)
        if os.path.exists(reg_path):
            pdf.add_font(family, "", reg_path)
            registered_fonts.append(family)
            if bold_file:
                bold_path = os.path.join(fonts_dir, bold_file)
                if os.path.exists(bold_path):
                    pdf.add_font(family, "B", bold_path)

    # Set base font and fallbacks
    if "tamilfont" in pdf.fonts:
        pdf.set_font("tamilfont", "", 12)
        fallbacks = [f for f in registered_fonts if f != "tamilfont"]
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
            
        pdf.set_font("tamilfont", "B", 12)
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
            
        pdf.set_font("tamilfont", "", 12)
    elif registered_fonts:
        pdf.set_font(registered_fonts[0], "", 12)
        fallbacks = registered_fonts[1:]
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
    else:
        pdf.set_font("Helvetica", "", 12)
    
    # Selected languages
    selected_langs = [l.strip() for l in (loan.customer.languages or "English").split(",")]
    
    # Generate sanction letter with combined languages on a single page
    add_sanction_page(pdf, loan, settings, company_name, company_address, company_phone, selected_langs)
    
    # Output to bytes
    pdf_bytes = pdf.output()
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Sanction_Letter_L{loan.id}.pdf"}
    )

@app.post("/loans/{loan_id}/reject")
def reject_loan(loan_id: int, reason: str = "", db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    loan.status = "rejected"
    loan.reject_reason = reason
    db.commit()
    db.refresh(loan)
    
    message = f"வணக்கம் {loan.customer.name}, உங்கள் கடன் விண்ணப்பம் (ID: {loan.id}) நிராகரிக்கப்பட்டது. காரணம்: {reason}"
    notifications.send_app_notification(loan.customer.id, message)
    
    return {"message": "Loan rejected"}

@app.put("/loans/{loan_id}", response_model=schemas.Loan)
def update_loan(loan_id: int, loan_update: schemas.LoanBase, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    for key, value in loan_update.dict().items():
        setattr(loan, key, value)
    
    # Recalculate disbursed amount
    loan.disbursed_amount = loan.amount - loan.deduction
    
    db.commit()
    db.refresh(loan)
    return loan

@app.get("/loans/active", response_model=List[schemas.Loan])
def read_active_loans(db: Session = Depends(get_db)):
    return db.query(models.Loan).filter(models.Loan.status == "active").order_by(models.Loan.id.desc()).all()

@app.post("/login")
def login(username: str, role: str, password: Optional[str] = None, db: Session = Depends(get_db)):
    # Trim and lowercase for robustness
    clean_username = username.strip()
    print(f"Login attempt: username='{clean_username}', role='{role}'")
    
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
            raise HTTPException(status_code=403, detail="Software not activated. Please login as developer to start trial or activate license.")
        try:
            start_dt = datetime.fromisoformat(trial_start).date()
        except Exception:
            raise HTTPException(status_code=403, detail="Trial configuration invalid. Contact developer.")
        from datetime import timedelta
        today = datetime.now().date()
        expiry = start_dt + timedelta(days=trial_days)
        if today > expiry:
            raise HTTPException(status_code=403, detail="Trial period expired. Contact developer for license.")

    if role == "customer":
        candidates = set()
        candidates.add(clean_username)
        try:
            normalized = normalize_indian_phone(clean_username)
            candidates.add(normalized)
        except HTTPException:
            pass
        if clean_username.startswith('0'):
            candidates.add(clean_username[1:])
        else:
            candidates.add('0' + clean_username)
        customer = db.query(models.Customer).filter(models.Customer.phone.in_(list(candidates))).first()
        if not customer:
            print(f"Customer login failed: {clean_username} not found (candidates={candidates})")
            raise HTTPException(status_code=401, detail="இந்த தொலைபேசி எண்ணில் வாடிக்கையாளர் இல்லை (Customer not found)")
        print(f"Customer login successful: {customer.name}")
        enforce_trial_and_license()
        return {"id": customer.id, "username": customer.name, "role": "customer", "full_name": customer.name}
    
    # For users, try case-insensitive match for username
    user = db.query(models.User).filter(
        func.lower(models.User.username) == func.lower(clean_username),
        models.User.role == role
    ).first()
    
    if not user:
        print(f"User login failed: {clean_username} with role {role} not found")
        raise HTTPException(status_code=401, detail="பயனர் பெயர் அல்லது பதவி தவறானது (Invalid username or role)")
    
    # Check password if provided (for Admin, Staff, Agent)
    if password and user.password_hash and user.password_hash != password:
        print(f"User login failed: Incorrect password for {clean_username}")
        raise HTTPException(status_code=401, detail="கடவுச்சொல் தவறானது (Incorrect password)")
    
    print(f"Login successful: {user.username} as {role}")
    enforce_trial_and_license()
    return {"id": user.id, "username": user.username, "role": user.role, "full_name": user.full_name}

@app.post("/change-password")
def change_password(user_id: int, old_password: str, new_password: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.password_hash != old_password:
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    user.password_hash = new_password
    db.commit()
    return {"message": "Password updated successfully"}

@app.get("/loans/overdue")
def get_overdue_loans(db: Session = Depends(get_db)):
    today = datetime.now().date()
    active_loans = db.query(models.Loan).filter(models.Loan.status == "active").all()
    overdue_list = []

    for loan in active_loans:
        # Calculate expected payments based on start date and loan type
        days_passed = (today - loan.start_date).days
        
        if loan.loan_type == 'daily':
            expected_count = days_passed
        elif loan.loan_type == 'weekly':
            expected_count = days_passed // 7
        else: # monthly
            expected_count = days_passed // 30
            
        # If expected_count is 0 but it's been at least 1 unit of time, expect at least 1
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
            
    return overdue_list

@app.post("/loans/send-reminders")
def send_overdue_reminders(loan_ids: List[int], db: Session = Depends(get_db)):
    """
    Sends bulk reminders to selected overdue loans.
    """
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
            
    return {"message": f"{sent_count} நினைவூட்டல்கள் அனுப்பப்பட்டன.", "count": sent_count}

@app.get("/notifications/app/{customer_id}")
def get_app_notifications(customer_id: int, unread_only: bool = True, db: Session = Depends(get_db)):
    query = db.query(models.AppNotification).filter(models.AppNotification.customer_id == customer_id)
    if unread_only:
        query = query.filter(models.AppNotification.is_read == False)
    rows = query.order_by(models.AppNotification.created_at.desc()).all()
    result = []
    for n in rows:
        result.append(
            {
                "id": n.id,
                "customer_id": n.customer_id,
                "message": n.message,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "is_read": bool(n.is_read),
            }
        )
    return result

@app.post("/notifications/app/{customer_id}/read-all")
def read_all_app_notifications(customer_id: int, db: Session = Depends(get_db)):
    updated = (
        db.query(models.AppNotification)
        .filter(models.AppNotification.customer_id == customer_id, models.AppNotification.is_read == False)
        .update({"is_read": True})
    )
    db.commit()
    return {"updated": updated}

@app.get("/loans/agent/{agent_id}", response_model=List[schemas.Loan])
def read_agent_loans(agent_id: int, db: Session = Depends(get_db)):
    return db.query(models.Loan).filter(
        models.Loan.agent_id == agent_id,
        models.Loan.status == "active"
    ).order_by(models.Loan.id.desc()).all()

@app.post("/loans/{loan_id}/assign-agent/{agent_id}")
def assign_agent(loan_id: int, agent_id: int, db: Session = Depends(get_db)):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    agent = db.query(models.User).filter(models.User.id == agent_id, models.User.role == "agent").first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    loan.agent_id = agent_id
    db.commit()
    return {"message": "Agent assigned successfully", "loan_id": loan_id, "agent_id": agent_id}

# Transaction Endpoints
@app.post("/loans/{loan_id}/pay", response_model=schemas.Transaction)
def make_payment(loan_id: int, transaction: schemas.TransactionCreate, db: Session = Depends(get_db)):
    db_loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not db_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    db_transaction = models.Transaction(**transaction.dict(), loan_id=loan_id)
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)

    # Prepare notification message in Tamil
    customer = db_loan.customer
    message = (
        f"வணக்கம் {customer.name}, உங்கள் கடன் கணக்கில் (ID: {db_loan.id}) "
        f"இன்று ₹{transaction.amount} வசூலிக்கப்பட்டது. "
        f"மிக்க நன்றி!"
    )

    # Trigger Notifications based on settings
    if db_loan.notify_sms:
        notifications.send_sms_notification(customer.phone, message)
    if db_loan.notify_whatsapp:
        notifications.send_whatsapp_notification(customer.phone, message)
    
    notifications.send_app_notification(customer.id, message)
    
    return db_transaction

@app.post("/customers/", response_model=schemas.Customer)
def create_customer(customer: schemas.CustomerCreate, db: Session = Depends(get_db)):
    db_customer = models.Customer(**customer.dict())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@app.get("/customers/me/loans", response_model=List[schemas.Loan])
def read_my_loans(customer_id: int, db: Session = Depends(get_db)):
    # In a real app, customer_id would come from the JWT token
    return db.query(models.Loan).filter(models.Loan.customer_id == customer_id).all()

@app.get("/loans/{loan_id}/transactions", response_model=List[schemas.Transaction])
def read_loan_transactions(loan_id: int, db: Session = Depends(get_db)):
    return db.query(models.Transaction).filter(models.Transaction.loan_id == loan_id).order_by(models.Transaction.date.desc()).all()

    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Receipt_R{transaction.id}.pdf"}
    )

def add_receipt_page(pdf, transaction, loan, customer, settings, company_name, company_address, company_phone, db, langs=["English"]):
    pdf.set_left_margin(5)
    pdf.set_right_margin(5)
    pdf.add_page()
    
    page_width = pdf.w - 10 # 100 - 10 = 90
    
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
            # Center logo (100mm width, 30mm logo -> x=35)
            pdf.image(tmp_path, x=(pdf.w - logo_w) / 2, y=5, w=logo_w)
            os.unlink(tmp_path)
            header_y = 32  # Reduced from 38 to save space
        except Exception: 
            header_y = 5
    else:
        header_y = 5

    pdf.set_y(header_y)
    pdf.set_font(bold_family, "B", 12)  # Reduced from 14
    # Company Name (Always uppercase if English included)
    display_name = company_name.upper() if "English" in langs else company_name
    pdf.cell(page_width, 7, display_name, ln=True, align="C")
    
    pdf.set_font(font_family, "", 9)  # Reduced from 10
    
    # Process address to move pincode if it's on a new line
    processed_address = company_address
    processed_phone = company_phone
    if company_address:
        lines = [line.strip() for line in company_address.split('\n') if line.strip()]
        if len(lines) > 1:
            # Check if the last line looks like a pincode (6 digits)
            last_line = lines[-1]
            if last_line.isdigit() and len(last_line) == 6:
                # Move pincode to the previous line
                pincode = last_line
                other_lines = lines[:-1]
                other_lines[-1] = f"{other_lines[-1]} - {pincode}"
                processed_address = "\n".join(other_lines)
            elif len(last_line) <= 10 and any(c.isdigit() for c in last_line):
                 # Handle cases like "627758" or "Pin: 627758"
                 pincode = last_line
                 other_lines = lines[:-1]
                 other_lines[-1] = f"{other_lines[-1]} {pincode}"
                 processed_address = "\n".join(other_lines)

    # Ensure phone number is present
    display_phone = company_phone if company_phone and company_phone != "N/A" else (settings.company_phone if settings and settings.company_phone else "N/A")
    
    pdf.set_x(5)
    pdf.multi_cell(page_width, 4, processed_address, align="C")
    
    phone_label = get_label("Phone", langs)
    pdf.set_x(5)
    pdf.cell(page_width, 5, f"{phone_label}: {display_phone}", ln=True, align="C")
    pdf.ln(2)
    pdf.line(5, pdf.get_y(), 95, pdf.get_y())
    pdf.ln(2)  # Reduced from 3

    pdf.set_font(bold_family, "B", 11)  # Reduced from 12
    title = get_label("PAYMENT RECEIPT", langs)
    pdf.cell(page_width, 7, title, ln=True, align="C")  # Height reduced from 8 to 7
    pdf.ln(1)  # Reduced from 2

    pdf.set_font(font_family, "", 9)  # Reduced from 10
    receipt_no_label = get_label("Receipt No", langs)
    date_label = get_label("Date", langs)
    
    # Split the receipt/date line to fit page_width
    pdf.cell(page_width / 2, 5, f"{receipt_no_label}: R-{transaction.id}", ln=0)
    pdf.cell(page_width / 2, 5, f"{date_label}: {transaction.date.strftime('%d/%m/%Y')}", ln=1, align="R")
    pdf.ln(1)

    pdf.set_font(bold_family, "B", 10)
    customer_label = get_label("Customer", langs)
    
    # Combine name based on selected languages
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
    
    loan_type_map = {
        'daily': "Daily",
        'weekly': "Weekly",
        'monthly': "Monthly"
    }
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

    # Footer
    pdf.ln(5)
    pdf.set_font(font_family, "", 8)
    
    thanks_text = get_label("Thank you for your payment!", langs)
    comp_gen_text = get_label("Computer generated receipt.", langs)
         
    pdf.cell(0, 4, thanks_text, ln=True, align="C")
    pdf.cell(0, 4, comp_gen_text, ln=True, align="C")

@app.get("/transactions/{transaction_id}/receipt")
def get_transaction_receipt(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    loan = transaction.loan
    customer = loan.customer
    settings = get_settings(db)
    company_name = settings["company_name"] or "Finance Manager"
    company_address = settings["company_address"] or "N/A"
    company_phone = settings["company_phone"] or "N/A"

    pdf = FPDF(format=(100, 150)) # Smaller receipt size
    
    # Register Fonts
    fonts_dir = os.path.join(os.path.dirname(__file__), "fonts")
    
    # Font mapping for languages
    font_files = {
        "tamilfont": ("MuktaMalar-Regular.ttf", "MuktaMalar-Bold.ttf"),
        "hindifont": ("Mukta-Regular.ttf", "Mukta-Bold.ttf"),
        "telugufont": ("NotoSansTelugu-Regular.ttf", None),
        "kannadafont": ("NotoSansKannada-Regular.ttf", None),
        "malayalamfont": ("NotoSansMalayalam-Regular.ttf", None),
        "bengalifont": ("NotoSansBengali-Regular.ttf", None),
        "gujaratifont": ("NotoSansGujarati-Regular.ttf", None),
        "punjabifont": ("NotoSansGurmukhi-Regular.ttf", None),
    }
    
    # Enable text shaping for complex scripts
    pdf.set_text_shaping(True)
    
    # Add fonts
    registered_fonts = []
    for family, (reg_file, bold_file) in font_files.items():
        reg_path = os.path.join(fonts_dir, reg_file)
        if os.path.exists(reg_path):
            pdf.add_font(family, "", reg_path)
            registered_fonts.append(family)
            if bold_file:
                bold_path = os.path.join(fonts_dir, bold_file)
                if os.path.exists(bold_path):
                    pdf.add_font(family, "B", bold_path)

    # Set base font and fallbacks
    if "tamilfont" in pdf.fonts:
        pdf.set_font("tamilfont", "", 12)
        fallbacks = [f for f in registered_fonts if f != "tamilfont"]
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
            
        pdf.set_font("tamilfont", "B", 12)
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
            
        pdf.set_font("tamilfont", "", 12)
    elif registered_fonts:
        pdf.set_font(registered_fonts[0], "", 12)
        fallbacks = registered_fonts[1:]
        if fallbacks:
            pdf.set_fallback_fonts(fallbacks)
    else:
        pdf.set_font("Helvetica", "", 12)

    # Selected languages
    selected_langs = [l.strip() for l in (customer.languages or "English").split(",")]
    
    # Generate receipt with combined languages on a single page
    add_receipt_page(pdf, transaction, loan, customer, settings, company_name, company_address, company_phone, db, selected_langs)

    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Receipt_R{transaction.id}.pdf"}
    )

@app.get("/check-db")
def check_db(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    customers = db.query(models.Customer).all()
    return {
        "users": [{"id": u.id, "username": u.username, "role": u.role} for u in users],
        "customers": [{"id": c.id, "name": c.name, "phone": c.phone} for c in customers]
    }

@app.get("/init-db")
def init_db(db: Session = Depends(get_db)):
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin:
        admin = models.User(
            username="admin",
            role="admin",
            full_name="System Administrator",
            password_hash="admin123" # Simple for now
        )
        db.add(admin)
        db.commit()
    developer = db.query(models.User).filter(models.User.username == "developer").first()
    if not developer:
        developer = models.User(
            username="developer",
            role="developer",
            full_name="Developer Support",
            password_hash="dev123"
        )
        db.add(developer)
        db.commit()
    return {"message": "Admin and developer users ensured"}
@app.get("/settings", response_model=schemas.SystemSettings)
def get_settings(db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        # Ensure at least one row
        row = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not row or (row['cnt'] if isinstance(row, dict) else row[0]) == 0:
            conn.execute(text("""
                INSERT INTO system_settings (app_name, company_name, company_address, company_phone, logo_base64,
                    commission_enabled, commission_percent, auto_backup_enabled, auto_backup_frequency)
                VALUES (:app_name, :company_name, :company_address, :company_phone, :logo_base64,
                    :commission_enabled, :commission_percent, :auto_backup_enabled, :auto_backup_frequency)
            """), {
                "app_name": "Finance Manager",
                "company_name": "",
                "company_address": "",
                "company_phone": "",
                "logo_base64": None,
                "commission_enabled": 0,
                "commission_percent": 0.0,
                "auto_backup_enabled": 0,
                "auto_backup_frequency": "daily"
            })
        # Build dynamic select based on existing columns
        base_cols = ["id","app_name","company_name","company_address","company_phone","logo_base64"]
        opt_cols = [
            "commission_enabled","commission_percent","auto_backup_enabled","auto_backup_frequency",
            "sms_provider","twilio_account_sid","twilio_auth_token","twilio_sms_from","twilio_whatsapp_from",
            "payment_enabled","payment_provider","razorpay_key_id","razorpay_key_secret","razorpay_webhook_secret",
            "frontend_url","backend_url","offline_path",
            "license_key","license_active","license_valid_till",
            "trial_enabled","trial_start_date","trial_days","trial_reset_count"
        ]
        sel_cols = ", ".join([c for c in base_cols + opt_cols if c in cols])
        data = conn.execute(text(f"SELECT {sel_cols} FROM system_settings LIMIT 1")).fetchone()
        def get_val(name, default):
            if isinstance(data, dict):
                return data.get(name, default)
            # sqlite returns tuple with positional columns; fallback defaults for missing
            if name not in cols:
                return default
            # When using text(), Row supports dict-style access
            try:
                return data._mapping[name]
            except Exception:
                return default
        result = {
            "id": get_val("id", 1),
            "app_name": get_val("app_name", "Finance Manager"),
            "company_name": get_val("company_name", ""),
            "company_address": get_val("company_address", ""),
            "company_phone": get_val("company_phone", ""),
            "logo_base64": get_val("logo_base64", None),
            "commission_enabled": int(get_val("commission_enabled", 0)) == 1,
            "commission_percent": float(get_val("commission_percent", 0.0)),
            "auto_backup_enabled": int(get_val("auto_backup_enabled", 0)) == 1,
            "auto_backup_frequency": get_val("auto_backup_frequency", "daily"),
            "sms_provider": get_val("sms_provider", "twilio"),
            "twilio_account_sid": get_val("twilio_account_sid", None),
            "twilio_auth_token": get_val("twilio_auth_token", None),
            "twilio_sms_from": get_val("twilio_sms_from", None),
            "twilio_whatsapp_from": get_val("twilio_whatsapp_from", None),
            "payment_enabled": int(get_val("payment_enabled", 0)) == 1,
            "payment_provider": get_val("payment_provider", "razorpay"),
            "razorpay_key_id": get_val("razorpay_key_id", None),
            "razorpay_key_secret": get_val("razorpay_key_secret", None),
            "razorpay_webhook_secret": get_val("razorpay_webhook_secret", None),
            "frontend_url": get_val("frontend_url", None),
            "backend_url": get_val("backend_url", None),
            "offline_path": get_val("offline_path", None),
            "license_key": get_val("license_key", None),
            "license_active": int(get_val("license_active", 0)) == 1,
            "license_valid_till": get_val("license_valid_till", None),
            "trial_enabled": int(get_val("trial_enabled", 0)) == 1,
            "trial_start_date": get_val("trial_start_date", None),
            "trial_days": int(get_val("trial_days", 0)) if get_val("trial_days", 0) is not None else 0,
            "trial_reset_count": int(get_val("trial_reset_count", 0) or 0)
        }
        # Ensure sensible defaults for new URL / path fields
        updated_fields = {}
        # Default backend_url if empty: current deployed cloud backend
        raw_backend = result.get("backend_url")
        if not raw_backend or str(raw_backend).strip() == "":
            default_backend = "https://chitfund-backend-hk37.onrender.com"
            result["backend_url"] = default_backend
            updated_fields["backend_url"] = default_backend
        # Default offline_path if empty: derive from detected frontend/dist or ClientRuntime folder
        raw_offline = result.get("offline_path")
        if (not raw_offline or str(raw_offline).strip() == "") and FRONTEND_DIST_DIR:
            try:
                # Typical structure: <root>/ClientRuntime/frontend or <root>/frontend/dist
                dist_dir = FRONTEND_DIST_DIR
                parent = os.path.dirname(dist_dir)
                grandparent = os.path.dirname(parent)
                offline_default = None
                if os.path.basename(parent).lower() == "frontend" and os.path.basename(grandparent).lower() == "clientruntime":
                    offline_default = grandparent
                elif os.path.basename(parent).lower() == "frontend":
                    offline_default = grandparent
                else:
                    offline_default = parent
                if offline_default:
                    result["offline_path"] = offline_default
                    updated_fields["offline_path"] = offline_default
            except Exception:
                pass
        # Persist back defaults so that next calls see them directly
        if updated_fields:
            try:
                set_parts = ", ".join(f"{k} = :{k}" for k in updated_fields.keys())
                params = dict(updated_fields)
                conn.execute(text(f"UPDATE system_settings SET {set_parts}"), params)
            except Exception:
                pass
        try:
            pc = compute_product_code()
            expected_key = compute_license_key_for_code(pc)
            stored = (result["license_key"] or "").replace("-", "").upper()
            if stored and stored != expected_key.replace("-", ""):
                result["license_active"] = False
        except Exception:
            pass
        # Cleanup corrupted text if found
        if result["company_name"] and "Your Company Na" in result["company_name"] and "me" in result["company_name"]:
            cleaned = result["company_name"].replace("Your Company Na", "").replace("me", "").strip()
            result["company_name"] = cleaned
            if "company_name" in cols:
                conn.execute(text("UPDATE system_settings SET company_name = :cn"), {"cn": cleaned})
        return result

@app.post("/settings", response_model=schemas.SystemSettings)
def update_settings(settings_update: schemas.SystemSettingsBase, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    payload = settings_update.dict()
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        # Ensure one row exists
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(text("INSERT INTO system_settings (app_name, company_name) VALUES (:app_name, :company_name)"),
                         {"app_name": payload.get("app_name","Finance Manager"), "company_name": payload.get("company_name","")})
        # Build dynamic UPDATE
        updates = []
        params = {}
        for key in [
            "app_name","company_name","company_address","company_phone","logo_base64",
            "commission_enabled","commission_percent","auto_backup_enabled","auto_backup_frequency",
            "sms_provider","twilio_account_sid","twilio_auth_token","twilio_sms_from","twilio_whatsapp_from",
            "payment_enabled","payment_provider","razorpay_key_id","razorpay_key_secret","razorpay_webhook_secret",
            "frontend_url","backend_url","offline_path",
            "license_key","license_active","license_valid_till",
            "trial_enabled","trial_start_date","trial_days"
        ]:
            if key in cols and key in payload:
                updates.append(f"{key} = :{key}")
                val = payload[key]
                if key.endswith("_enabled") or key == "license_active":
                    val = 1 if bool(val) else 0
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
        # Return latest settings
        return get_settings(db)

@app.post("/settings/keys")
def update_notification_keys(keys: dict, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    allowed = {"sms_provider","twilio_account_sid","twilio_auth_token","twilio_sms_from","twilio_whatsapp_from"}
    payload = {k: v for k, v in (keys or {}).items() if k in allowed}
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')"))
        updates = []
        params = {}
        for key, val in payload.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.post("/settings/payments")
def update_payment_keys(keys: dict, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    allowed = {"payment_enabled","payment_provider","razorpay_key_id","razorpay_key_secret","razorpay_webhook_secret"}
    payload = {k: v for k, v in (keys or {}).items() if k in allowed}
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')"))
        updates = []
        params = {}
        for key, val in payload.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                if key.endswith("_enabled"):
                    val = 1 if bool(val) else 0
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.post("/settings/urls")
def update_url_settings(keys: dict, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    allowed = {"frontend_url","backend_url","offline_path"}
    payload = {k: v for k, v in (keys or {}).items() if k in allowed}
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')"))
        updates = []
        params = {}
        for key, val in payload.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.post("/settings/backup")
def backup_settings(db: Session = Depends(get_db)):
    ensure_settings_columns()
    settings = get_settings(db)
    payload = {
        "app_name": settings["app_name"],
        "company_name": settings["company_name"],
        "company_address": settings["company_address"],
        "company_phone": settings["company_phone"],
        "logo_base64": settings["logo_base64"],
        "commission_enabled": settings["commission_enabled"],
        "commission_percent": settings["commission_percent"],
        "auto_backup_enabled": settings["auto_backup_enabled"],
        "auto_backup_frequency": settings["auto_backup_frequency"],
        "frontend_url": settings.get("frontend_url"),
        "backend_url": settings.get("backend_url"),
        "offline_path": settings.get("offline_path"),
        "backup_at": datetime.now().isoformat()
    }
    backup = models.SettingsBackup(data=json.dumps(payload))
    db.add(backup)
    db.commit()
    db.refresh(backup)
    return {"message": "Settings backed up to database", "backup_id": backup.id}

@app.get("/settings/backup/latest")
def get_latest_settings_backup(db: Session = Depends(get_db)):
    ensure_settings_columns()
    backup = db.query(models.SettingsBackup).order_by(models.SettingsBackup.id.desc()).first()
    if not backup:
        raise HTTPException(status_code=404, detail="No backup found")
    try:
        return json.loads(backup.data)
    except Exception:
        raise HTTPException(status_code=500, detail="Backup data corrupted")

@app.post("/settings/restore/latest", response_model=schemas.SystemSettings)
def restore_latest_settings_backup(db: Session = Depends(get_db)):
    ensure_settings_columns()
    backup = db.query(models.SettingsBackup).order_by(models.SettingsBackup.id.desc()).first()
    if not backup:
        raise HTTPException(status_code=404, detail="No backup found")
    data = json.loads(backup.data)
    # Write using dynamic SQL to avoid missing columns issues
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(text("INSERT INTO system_settings (app_name, company_name) VALUES (:app_name, :company_name)"),
                         {"app_name": "Finance Manager", "company_name": ""})
        updates = []
        params = {}
        for key in ["app_name","company_name","company_address","company_phone","logo_base64",
                    "commission_enabled","commission_percent","auto_backup_enabled","auto_backup_frequency",
                    "frontend_url","backend_url","offline_path"]:
            if key in cols and key in data:
                updates.append(f"{key} = :{key}")
                val = data[key]
                if key.endswith("_enabled"):
                    val = 1 if bool(val) else 0
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.get("/license/product")
def get_product_code():
    code = compute_product_code()
    return {"product_code": code}

@app.get("/diagnostics/summary")
def diagnostics_summary(db: Session = Depends(get_db)):
    db_ok = True
    stats = {}
    try:
        stats["users"] = db.query(models.User).count()
        stats["customers"] = db.query(models.Customer).count()
        stats["loans"] = db.query(models.Loan).count()
        stats["transactions"] = db.query(models.Transaction).count()
    except Exception:
        db_ok = False
    db_path = getattr(database, "DB_PATH", None)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(base_dir)
    frontend_dir = os.path.join(project_root, "frontend")
    files_expected = {
        "backend_main": os.path.join(base_dir, "main.py"),
        "backend_models": os.path.join(base_dir, "models.py"),
        "backend_database": os.path.join(base_dir, "database.py"),
        "db_file": db_path or "",
        "start_servers": os.path.join(project_root, "start_servers.bat"),
        "start_app_vbs": os.path.join(project_root, "start_app.vbs"),
        "frontend_app": os.path.join(frontend_dir, "src", "App.jsx"),
        "frontend_login": os.path.join(frontend_dir, "src", "Login.jsx"),
        "frontend_developer_dashboard": os.path.join(frontend_dir, "src", "DeveloperDashboard.jsx"),
    }
    files_info = {}
    for key, path in files_expected.items():
        if not path:
            files_info[key] = {"path": "", "exists": False}
        else:
            files_info[key] = {"path": path, "exists": os.path.exists(path)}
    node_version = None
    npm_version = None
    try:
        out = subprocess.check_output(["node", "--version"], stderr=subprocess.STDOUT, text=True, timeout=2)
        node_version = out.strip()
    except Exception:
        node_version = None
    try:
        out = subprocess.check_output(["npm", "--version"], stderr=subprocess.STDOUT, text=True, timeout=2)
        npm_version = out.strip()
    except Exception:
        npm_version = None
    settings = get_settings(db)
    return {
        "app_name": "Finance Manager",
        "product_code": compute_product_code(),
        "python_version": platform.python_version(),
        "db_ok": db_ok,
        "db_path": db_path,
        "db_stats": stats,
        "node_version": node_version,
        "npm_version": npm_version,
        "license_active": getattr(settings, "get", lambda k, d=None: d)("license_active", False),
        "frontend_url": getattr(settings, "get", lambda k, d=None: d)("frontend_url", None),
        "backend_url": getattr(settings, "get", lambda k, d=None: d)("backend_url", None),
        "offline_path": getattr(settings, "get", lambda k, d=None: d)("offline_path", None),
        "db_integrity": _db_integrity_check(),
        "files": files_info,
    }

@app.post("/diagnostics/repair-db")
def diagnostics_repair_db(db: Session = Depends(get_db)):
    db_path = getattr(database, "DB_PATH", None)
    if not db_path:
        raise HTTPException(status_code=500, detail="Database path not configured")
    exists_before = os.path.exists(db_path)
    integrity_before = _db_integrity_check() if exists_before else "MISSING"
    backup_path = None
    if exists_before and isinstance(integrity_before, str) and integrity_before.lower() == "ok":
        return {
            "status": "ok",
            "message": "Database integrity OK. No repair needed.",
            "db_path": db_path,
            "backup_path": None,
            "integrity_before": integrity_before,
            "integrity_after": integrity_before,
            "exists_before": exists_before,
        }
    if exists_before:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        root, ext = os.path.splitext(db_path)
        backup_path = f"{root}_backup_{ts}{ext}"
        try:
            os.replace(db_path, backup_path)
        except Exception:
            backup_path = None
    try:
        models.Base.metadata.create_all(bind=database.engine)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create DB schema: {e}")
    try:
        init_db(db)
    except Exception:
        pass
    integrity_after = _db_integrity_check()
    return {
        "status": "recreated",
        "message": "Database recreated and default admin/developer users ensured.",
        "db_path": db_path,
        "backup_path": backup_path,
        "integrity_before": integrity_before,
        "integrity_after": integrity_after,
        "exists_before": exists_before,
    }

from pydantic import BaseModel

class LicenseActivateRequest(BaseModel):
    license_key: str

class TrialUpdateRequest(BaseModel):
    trial_enabled: Optional[bool] = None
    trial_start_date: Optional[str] = None
    trial_days: Optional[int] = None

class SampleDataRequest(BaseModel):
    count: int

@app.post("/maintenance/update-app")
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
        return {
            "ok": False,
            "git_available": False,
            "git_version": git_version,
            "message": "Git not available on this system. Install Git from Requirement folder."
        }
    root_dir = os.path.dirname(os.path.dirname(__file__))
    try:
        result = subprocess.run(
            ["git", "-C", root_dir, "pull"],
            capture_output=True,
            text=True,
            timeout=300
        )
        ok = result.returncode == 0
        return {
            "ok": ok,
            "git_available": True,
            "git_version": git_version,
            "root_dir": root_dir,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "message": "App updated successfully from git." if ok else "Git pull failed. See details."
        }
    except Exception as e:
        return {
            "ok": False,
            "git_available": True,
            "git_version": git_version,
            "root_dir": root_dir,
            "stdout": "",
            "stderr": str(e),
            "message": "Exception while running git pull."
        }

@app.post("/maintenance/offline-update")
async def maintenance_offline_update(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported for offline update")
    tmp_dir = tempfile.mkdtemp(prefix="offline_update_")
    zip_path = os.path.join(tmp_dir, "package.zip")
    try:
        with open(zip_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        extract_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid zip file: {e}")
        entries = os.listdir(extract_dir)
        if len(entries) == 1 and os.path.isdir(os.path.join(extract_dir, entries[0])):
            root_package = os.path.join(extract_dir, entries[0])
        else:
            root_package = extract_dir
        root_dir = os.path.dirname(os.path.dirname(__file__))
        updated = []
        for name in ["backend", "frontend"]:
            src = os.path.join(root_package, name)
            dst = os.path.join(root_dir, name)
            if os.path.isdir(src) and os.path.isdir(dst):
                shutil.copytree(src, dst, dirs_exist_ok=True)
                updated.append(name)
        if not updated:
            raise HTTPException(status_code=400, detail="No backend/frontend folders found in update package")
        return {
            "ok": True,
            "updated": updated,
            "message": "Offline update applied. Please restart backend/frontend processes."
        }
    finally:
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

@app.post("/maintenance/fresh-reset")
def maintenance_fresh_reset(db: Session = Depends(get_db)):
    tx_deleted = db.query(models.Transaction).delete(synchronize_session=False)
    loans_deleted = db.query(models.Loan).delete(synchronize_session=False)
    expenses_deleted = db.query(models.Expense).delete(synchronize_session=False)
    customers_deleted = db.query(models.Customer).delete(synchronize_session=False)
    users_deleted = db.query(models.User).filter(~models.User.username.in_(["admin", "developer"])).delete(synchronize_session=False)
    db.commit()
    return {
        "message": "All test/business data cleared except admin/developer users and settings.",
        "transactions_deleted": tx_deleted,
        "loans_deleted": loans_deleted,
        "customers_deleted": customers_deleted,
        "expenses_deleted": expenses_deleted,
        "users_deleted": users_deleted,
    }

@app.post("/sample-data/generate")
def generate_sample_data(payload: SampleDataRequest, db: Session = Depends(get_db)):
    count = int(payload.count or 0)
    if count <= 0:
        raise HTTPException(status_code=400, detail="count must be > 0")
    if count > 500:
        raise HTTPException(status_code=400, detail="count too large (max 500)")
    created_staff_users = 0
    created_agent_users = 0
    staff_user = db.query(models.User).filter(models.User.username == "sample_staff").first()
    if not staff_user:
        staff_user = models.User(
            username="sample_staff",
            role="staff",
            full_name="Sample Staff User",
            password_hash="staff123",
            is_active=1
        )
        db.add(staff_user)
        db.commit()
        db.refresh(staff_user)
        created_staff_users = 1
    agent_user = db.query(models.User).filter(models.User.username == "sample_agent").first()
    if not agent_user:
        agent_user = models.User(
            username="sample_agent",
            role="agent",
            full_name="Sample Agent User",
            password_hash="agent123",
            is_active=1
        )
        db.add(agent_user)
        db.commit()
        db.refresh(agent_user)
        created_agent_users = 1
    created_customers = 0
    created_loans = 0
    created_transactions = 0
    base_phone = 9000000000
    for i in range(count):
        raw_phone = str(base_phone + i)
        try:
            phone = normalize_indian_phone(raw_phone)
        except HTTPException:
            phone = raw_phone
        name = f"Sample Customer {i+1}"
        existing = db.query(models.Customer).filter(models.Customer.name == name).first()
        if existing:
            continue
        customer = models.Customer(
            name=name,
            phone=phone,
            address="Sample Address",
            languages="English",
            created_at=datetime.now()
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
        created_customers += 1
        amount = 10000 + (i * 500)
        loan = models.Loan(
            customer_id=customer.id,
            loan_type="daily",
            amount=amount,
            deduction=0.0,
            disbursed_amount=amount,
            daily_due=round(amount / 100, 2),
            total_days=100,
            start_date=datetime.now().date(),
            status="active",
            agent_id=agent_user.id if agent_user else None
        )
        db.add(loan)
        created_loans += 1
        for j in range(1, 6):
            tx_date = datetime.now() - timedelta(days=(6 - j))
            tx = models.Transaction(
                loan_id=loan.id,
                amount=loan.daily_due,
                date=tx_date,
            )
            db.add(tx)
            created_transactions += 1
        db.commit()
    return {
        "message": "Sample data created",
        "requested_count": count,
        "customers_created": created_customers,
        "loans_created": created_loans,
        "transactions_created": created_transactions,
        "staff_users_created": created_staff_users,
        "agent_users_created": created_agent_users,
    }

@app.post("/sample-data/clear")
def clear_sample_data(db: Session = Depends(get_db)):
    customers = db.query(models.Customer).filter(
        or_(
            models.Customer.name.like("SAMPLE CUSTOMER %"),
            models.Customer.name.like("Sample Customer %")
        )
    ).all()
    if not customers:
        return {
            "message": "No sample data found",
            "customers_deleted": 0,
            "loans_deleted": 0,
            "transactions_deleted": 0,
        }
    customer_ids = [c.id for c in customers]
    loans = db.query(models.Loan).filter(models.Loan.customer_id.in_(customer_ids)).all()
    loan_ids = [l.id for l in loans]
    transactions_deleted = 0
    loans_deleted = 0
    if loan_ids:
        transactions_deleted = db.query(models.Transaction).filter(models.Transaction.loan_id.in_(loan_ids)).delete(synchronize_session=False)
        loans_deleted = db.query(models.Loan).filter(models.Loan.id.in_(loan_ids)).delete(synchronize_session=False)
    customers_deleted = db.query(models.Customer).filter(models.Customer.id.in_(customer_ids)).delete(synchronize_session=False)
    db.commit()
    return {
        "message": "Sample data cleared",
        "customers_deleted": customers_deleted,
        "loans_deleted": loans_deleted,
        "transactions_deleted": transactions_deleted,
    }

@app.post("/license/activate", response_model=schemas.SystemSettings)
def activate_license(payload: LicenseActivateRequest, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    product_code = compute_product_code()
    expected_key = compute_license_key_for_code(product_code)
    provided = (payload.license_key or "").strip().upper()
    if provided.replace("-", "") != expected_key.replace("-", ""):
        raise HTTPException(status_code=400, detail="Invalid license key for this machine")
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(
                text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')")
            )
        updates = []
        params = {}
        for key, val in {
            "license_key": provided,
            "license_active": 1,
            "trial_enabled": 0,
            "trial_start_date": None,
            "trial_days": 0
        }.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.post("/license/deactivate", response_model=schemas.SystemSettings)
def deactivate_license(db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(
                text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')")
            )
        updates = []
        params = {}
        for key, val in {
            "license_key": None,
            "license_active": 0,
            "license_valid_till": None
        }.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.post("/settings/trial", response_model=schemas.SystemSettings)
def update_trial_settings(payload: TrialUpdateRequest, db: Session = Depends(get_db)):
    migrate_settings_table_if_needed()
    ensure_settings_columns()
    data = payload.dict(exclude_unset=True)
    allowed = {"trial_enabled", "trial_start_date", "trial_days"}
    filtered = {k: v for k, v in data.items() if k in allowed}
    if not filtered:
        return get_settings(db)
    # Enforce trial_days between 1 and 7 if provided
    if "trial_days" in filtered and filtered["trial_days"] is not None:
        days = int(filtered["trial_days"])
        if days < 1 or days > 7:
            raise HTTPException(status_code=400, detail="Trial days must be between 1 and 7")
        filtered["trial_days"] = days
    with database.engine.begin() as conn:
        cols = {c['name'] for c in inspect(database.engine).get_columns('system_settings')}
        cnt = conn.execute(text("SELECT COUNT(1) AS cnt FROM system_settings")).fetchone()
        if not cnt or (cnt['cnt'] if isinstance(cnt, dict) else cnt[0]) == 0:
            conn.execute(
                text("INSERT INTO system_settings (app_name, company_name) VALUES ('Finance Manager','')")
            )
        updates = []
        params = {}
        # If enabling or resetting trial, enforce that license is not active and max 2 resets
        if filtered.get("trial_enabled"):
            # Check current license status
            if "license_active" in cols:
                row_license = conn.execute(
                    text("SELECT license_active FROM system_settings LIMIT 1")
                ).fetchone()
                current_la = 0
                if row_license is not None:
                    try:
                        m = row_license._mapping
                        current_la = m.get("license_active", 0) or 0
                    except Exception:
                        try:
                            current_la = row_license[0] if len(row_license) > 0 else 0
                        except Exception:
                            current_la = 0
                if int(current_la or 0) == 1:
                    raise HTTPException(
                        status_code=400,
                        detail="License already active on this computer. Trial cannot be started or reset."
                    )
            # Check trial reset count limit
            if "trial_reset_count" in cols:
                row = conn.execute(text("SELECT trial_reset_count FROM system_settings LIMIT 1")).fetchone()
                current = 0
                if row is not None:
                    try:
                        mapping = row._mapping
                        current = mapping.get("trial_reset_count", 0) or 0
                    except Exception:
                        try:
                            current = row[0] if len(row) > 0 else 0
                        except Exception:
                            current = 0
                current_int = int(current or 0)
                if current_int >= 2:
                    raise HTTPException(
                        status_code=400,
                        detail="Trial already reset 2 times on this computer. Please contact company admin for activation."
                    )
                updates.append("trial_reset_count = :trial_reset_count")
                params["trial_reset_count"] = current_int + 1
        for key, val in filtered.items():
            if key in cols:
                updates.append(f"{key} = :{key}")
                if key == "trial_enabled":
                    val = 1 if bool(val) else 0
                params[key] = val
        if updates:
            conn.execute(text(f"UPDATE system_settings SET {', '.join(updates)}"), params)
    return get_settings(db)

@app.get("/stats/admin")
def get_admin_stats(db: Session = Depends(get_db)):
    # Total Active and Closed Loans (These represent the "real" business)
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

    return {
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
    }

@app.get("/reports/financial")
def get_financial_report(db: Session = Depends(get_db)):
    # Summary of all financial movements
    # Assets: Pending Collections (Money to be collected)
    # Liability: Disbursed Amount (Money given out)
    # Equity: Capital/Net Profit
    
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
    interest_earned = total_loan_amount - total_disbursed # This is total expected interest
    
    return {
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
    }

@app.get("/reports/loans")
def get_loan_report(db: Session = Depends(get_db)):
    loans = db.query(models.Loan).all()
    report_data = []
    for loan in loans:
        total_paid = sum(t.amount for t in loan.transactions)
        balance_due = loan.amount - total_paid
        
        # Calculate next due date
        next_due_date = "N/A"
        if loan.status == "active":
            from datetime import timedelta
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
            "agent_name": db.query(models.User).filter(models.User.id == loan.agent_id).first().full_name if loan.agent_id else "N/A"
        })
    return report_data

@app.post("/expenses", response_model=schemas.Expense)
@app.post("/expenses/", response_model=schemas.Expense)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    print(f"Creating expense: {expense}")
    try:
        expense_date = None
        if expense.date:
            try:
                # Try parsing the date string from frontend (YYYY-MM-DD)
                expense_date = datetime.strptime(expense.date, "%Y-%m-%d").date()
            except ValueError:
                # If that fails, use current date as fallback
                expense_date = datetime.now().date()
        else:
            expense_date = datetime.now().date()

        db_expense = models.Expense(
            description=expense.description,
            amount=expense.amount,
            date=expense_date,
            created_by=expense.created_by
        )
        db.add(db_expense)
        db.commit()
        db.refresh(db_expense)
        
        # Convert date to string for response to match schema
        return {
            "id": db_expense.id,
            "description": db_expense.description,
            "amount": db_expense.amount,
            "date": db_expense.date.isoformat() if db_expense.date else None,
            "created_at": db_expense.created_at,
            "created_by": db_expense.created_by
        }
    except Exception as e:
        db.rollback()
        print(f"Error creating expense: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/expenses", response_model=List[schemas.Expense])
@app.get("/expenses/", response_model=List[schemas.Expense])
def get_expenses(db: Session = Depends(get_db)):
    expenses = db.query(models.Expense).order_by(models.Expense.date.desc()).all()
    # Convert dates to strings for response
    result = []
    for exp in expenses:
        result.append({
            "id": exp.id,
            "description": exp.description,
            "amount": exp.amount,
            "date": exp.date.isoformat() if exp.date else None,
            "created_at": exp.created_at,
            "created_by": exp.created_by
        })
    return result

@app.delete("/expenses/{expense_id}")
@app.delete("/expenses/{expense_id}/")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted"}

@app.get("/reports/pending-collections")
def get_pending_collections_report(agent_id: Optional[int] = None, db: Session = Depends(get_db)):
    from datetime import timedelta
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
            
        # Calculate next due date
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
    
    # Sort by agent name and then by next due date
    report_data.sort(key=lambda x: (x['agent_name'], x['next_due_date']))
    return report_data

@app.get("/reports/collections")
def get_collections_report(agent_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Transaction).join(models.Loan)
    
    if agent_id:
        query = query.filter(models.Loan.agent_id == agent_id)
        
    transactions = query.order_by(models.Transaction.date.desc()).all()
    report_data = []
    for tx in transactions:
        report_data.append({
            "id": tx.id,
            "loan_id": tx.loan_id,
            "customer_name": tx.loan.customer.name,
            "amount": tx.amount,
            "date": tx.date,
            "agent_name": db.query(models.User).filter(models.User.id == tx.loan.agent_id).first().full_name if tx.loan.agent_id else "N/A"
        })
    return report_data


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=9000,
        reload=False,
        log_level="error",
        access_log=False,
    )
