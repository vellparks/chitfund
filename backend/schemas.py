from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date

# User Schemas
class UserBase(BaseModel):
    username: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    aadhaar_no: Optional[str] = None
    pan_no: Optional[str] = None
    photo: Optional[str] = None
    languages: Optional[str] = "English"
    name_tamil: Optional[str] = None
    address_tamil: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: int

    class Config:
        from_attributes = True

# Expense Schemas
class ExpenseBase(BaseModel):
    description: str
    amount: float
    date: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    created_by: Optional[int] = None

class Expense(ExpenseBase):
    id: int
    created_at: datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True

# System Settings Schemas
class SystemSettingsBase(BaseModel):
    app_name: str
    company_name: str
    company_address: Optional[str] = ""
    company_phone: Optional[str] = ""
    logo_base64: Optional[str] = None
    commission_enabled: bool = False
    commission_percent: float = 0.0
    auto_backup_enabled: bool = False
    auto_backup_frequency: Optional[str] = "daily"
    sms_provider: Optional[str] = "twilio"
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_sms_from: Optional[str] = None
    twilio_whatsapp_from: Optional[str] = None
    payment_enabled: bool = False
    payment_provider: Optional[str] = "razorpay"
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    razorpay_webhook_secret: Optional[str] = None
    license_key: Optional[str] = None
    license_active: bool = False
    license_valid_till: Optional[str] = None
    trial_enabled: bool = False
    trial_start_date: Optional[str] = None
    trial_days: Optional[int] = 0

class SystemSettingsCreate(SystemSettingsBase):
    pass

class SystemSettings(SystemSettingsBase):
    id: int

    class Config:
        from_attributes = True

# Transaction Schemas
class TransactionBase(BaseModel):
    amount: float

class TransactionCreate(TransactionBase):
    pass

class Transaction(TransactionBase):
    id: int
    loan_id: int
    date: datetime

    class Config:
        from_attributes = True

# Customer Schemas
class CustomerBase(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    aadhaar_no: Optional[str] = None
    pan_no: Optional[str] = None
    photo: Optional[str] = None
    languages: Optional[str] = "English"
    name_tamil: Optional[str] = None
    address_tamil: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerMinimal(BaseModel):
    id: int
    name: str
    phone: str

    class Config:
        from_attributes = True

class Customer(CustomerBase):
    id: int
    created_at: datetime
    # loans: List['Loan'] = [] # Circular ref handled later if needed

    class Config:
        from_attributes = True

# Loan Schemas
class LoanBase(BaseModel):
    loan_type: str
    amount: float
    deduction: float
    daily_due: float
    total_days: int
    agent_id: Optional[int] = None
    notify_sms: bool = True
    notify_whatsapp: bool = True

class LoanCreate(LoanBase):
    customer_id: int

class Loan(LoanBase):
    id: int
    customer_id: int
    disbursed_amount: float
    start_date: date
    status: str
    reject_reason: Optional[str] = None
    transactions: List[Transaction] = []
    customer: Optional[CustomerMinimal] = None

    class Config:
        from_attributes = True
