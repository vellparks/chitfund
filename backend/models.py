from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Boolean
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    role = Column(String)  # 'admin', 'staff', 'agent', 'customer'
    password_hash = Column(String) # In a real app, hash this!
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    aadhaar_no = Column(String, nullable=True)
    pan_no = Column(String, nullable=True)
    photo = Column(String, nullable=True)  # Base64 string or file path
    is_active = Column(Integer, default=1)

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True)
    address = Column(String)
    aadhaar_no = Column(String, nullable=True)
    pan_no = Column(String, nullable=True)
    photo = Column(String, nullable=True)  # Base64 string or file path
    languages = Column(String, default="English") # Comma separated languages: "English,Tamil"
    name_tamil = Column(String, nullable=True)
    address_tamil = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    loans = relationship("Loan", back_populates="customer")

class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    loan_type = Column(String)  # 'daily', 'weekly', 'monthly'
    amount = Column(Float)
    deduction = Column(Float, default=0.0)
    disbursed_amount = Column(Float)
    daily_due = Column(Float)  # Amount to be collected per period
    total_days = Column(Integer)
    start_date = Column(Date, default=datetime.now().date)
    status = Column(String, default="pending")  # 'pending', 'active', 'rejected', 'closed'
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notify_sms = Column(Boolean, default=True)
    notify_whatsapp = Column(Boolean, default=True)
    reject_reason = Column(String, nullable=True)

    customer = relationship("Customer", back_populates="loans")
    transactions = relationship("Transaction", back_populates="loan")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"))
    amount = Column(Float)
    date = Column(DateTime, default=datetime.now)
    
    loan = relationship("Loan", back_populates="transactions")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String, default="Finance Manager")
    company_name = Column(String, default="")
    company_address = Column(String, default="")
    company_phone = Column(String, default="")
    logo_base64 = Column(String, nullable=True)
    commission_enabled = Column(Boolean, default=False)
    commission_percent = Column(Float, default=0.0)
    auto_backup_enabled = Column(Boolean, default=False)
    auto_backup_frequency = Column(String, default="daily")

class SettingsBackup(Base):
    __tablename__ = "settings_backup"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(String)  # JSON string of settings snapshot
    created_at = Column(DateTime, default=datetime.now)

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String) # Salary, Rent, Electricity, etc.
    amount = Column(Float)
    date = Column(Date, default=datetime.now().date)
    created_at = Column(DateTime, default=datetime.now)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True) # ID of admin/staff who added it
