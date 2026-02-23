import logging
import os
from typing import Optional
from sqlalchemy import text
import database

try:
    from twilio.rest import Client as TwilioClient
    TWILIO_AVAILABLE = True
except Exception:
    TWILIO_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _normalize_phone_for_sms(phone_number: str) -> str:
    pn = (phone_number or "").strip()
    if pn.startswith("+"):
        return pn
    # Assume India numbers if 10 digits
    digits = "".join(c for c in pn if c.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) > 0 and not pn.startswith("+"):
        return f"+{digits}"
    return pn

def _normalize_phone_for_whatsapp(phone_number: str) -> str:
    sms = _normalize_phone_for_sms(phone_number)
    if sms.startswith("whatsapp:"):
        return sms
    return f"whatsapp:{sms}"

def _get_twilio_client() -> Optional['TwilioClient']:
    if not TWILIO_AVAILABLE:
        return None
    # Try DB settings first
    sid = None
    token = None
    sms_from = None
    wa_from = None
    try:
        with database.engine.begin() as conn:
            cols = {c['name'] for c in database.inspect(database.engine).get_columns('system_settings')}
            sel_cols = ", ".join([c for c in ["twilio_account_sid","twilio_auth_token","twilio_sms_from","twilio_whatsapp_from"] if c in cols])
            if sel_cols:
                row = conn.execute(text(f"SELECT {sel_cols} FROM system_settings LIMIT 1")).fetchone()
                if row:
                    try:
                        mapping = row._mapping
                        sid = mapping.get("twilio_account_sid", None)
                        token = mapping.get("twilio_auth_token", None)
                        sms_from = mapping.get("twilio_sms_from", None)
                        wa_from = mapping.get("twilio_whatsapp_from", None)
                    except Exception:
                        pass
    except Exception:
        pass
    # Fallback to environment
    sid = sid or os.getenv("TWILIO_ACCOUNT_SID")
    token = token or os.getenv("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        return None
    try:
        return TwilioClient(sid, token)
    except Exception:
        return None

def send_sms_notification(phone_number: str, message: str):
    """
    Sends SMS via Twilio if configured; otherwise logs (simulation).
    """
    client = _get_twilio_client()
    sms_from = os.getenv("TWILIO_SMS_FROM")  # e.g. '+15005550006'
    try:
        with database.engine.begin() as conn:
            cols = {c['name'] for c in database.inspect(database.engine).get_columns('system_settings')}
            if "twilio_sms_from" in cols:
                row = conn.execute(text("SELECT twilio_sms_from FROM system_settings LIMIT 1")).fetchone()
                if row:
                    try:
                        sms_from = row._mapping.get("twilio_sms_from", sms_from) or sms_from
                    except Exception:
                        pass
    except Exception:
        pass
    to = _normalize_phone_for_sms(phone_number)
    if client and sms_from:
        try:
            msg = client.messages.create(
                body=message,
                from_=sms_from,
                to=to
            )
            logger.info(f"SMS sent via Twilio: sid={msg.sid}, to={to}")
            return True
        except Exception as e:
            logger.warning(f"Twilio SMS send failed, falling back to log: {e}")
    logger.info(f"--- SMS (SIMULATED) ---")
    logger.info(f"To: {to}")
    logger.info(f"Message: {message}")
    logger.info(f"-----------------------")
    return True

def send_whatsapp_notification(phone_number: str, message: str):
    """
    Sends WhatsApp via Twilio if configured; otherwise logs (simulation).
    """
    client = _get_twilio_client()
    wa_from = os.getenv("TWILIO_WHATSAPP_FROM")  # e.g. 'whatsapp:+14155238886'
    try:
        with database.engine.begin() as conn:
            cols = {c['name'] for c in database.inspect(database.engine).get_columns('system_settings')}
            if "twilio_whatsapp_from" in cols:
                row = conn.execute(text("SELECT twilio_whatsapp_from FROM system_settings LIMIT 1")).fetchone()
                if row:
                    try:
                        wa_from = row._mapping.get("twilio_whatsapp_from", wa_from) or wa_from
                    except Exception:
                        pass
    except Exception:
        pass
    to = _normalize_phone_for_whatsapp(phone_number)
    if client and wa_from:
        try:
            msg = client.messages.create(
                body=message,
                from_=wa_from,
                to=to
            )
            logger.info(f"WhatsApp sent via Twilio: sid={msg.sid}, to={to}")
            return True
        except Exception as e:
            logger.warning(f"Twilio WhatsApp send failed, falling back to log: {e}")
    logger.info(f"--- WHATSAPP (SIMULATED) ---")
    logger.info(f"To: {to}")
    logger.info(f"Message: {message}")
    logger.info(f"----------------------------")
    return True

def send_app_notification(customer_id: int, message: str):
    logger.info(f"--- IN-APP NOTIFICATION SENT ---")
    logger.info(f"To Customer ID: {customer_id}")
    logger.info(f"Message: {message}")
    logger.info(f"--------------------------------")
    try:
        from models import AppNotification
        SessionLocal = database.SessionLocal
        session = SessionLocal()
        try:
            notif = AppNotification(customer_id=customer_id, message=message, is_read=False)
            session.add(notif)
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()
    except Exception:
        pass
    return True
