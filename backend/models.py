from datetime import datetime
import enum
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class FIRStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    INVESTIGATING = "INVESTIGATING"
    CLOSED = "CLOSED"

# -----------------------------------------------------------------------------
# Table 1: People (Citizens)
# -----------------------------------------------------------------------------
class People(Base):
    __tablename__ = "people"

    phone_number = Column(String, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    fir_records = relationship("FIRRecord", back_populates="citizen")


# -----------------------------------------------------------------------------
# Table 2: FIR_Records (The Core Locked Complaints)
# -----------------------------------------------------------------------------
class FIRRecord(Base):
    __tablename__ = "fir_records"

    fir_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    citizen_phone = Column(String, ForeignKey("people.phone_number"), nullable=False)
    original_text = Column(Text, nullable=False)
    current_status = Column(SQLEnum(FIRStatusEnum), default=FIRStatusEnum.PENDING, nullable=False)
    
    # FIXED: Passed function reference without () so it evaluates at database insert execution time
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # NEW: Station identifier to cleanly separate jurisdictions
    station_id = Column(String, nullable=False, index=True) 
    
    # The Cryptographic Lock
    fir_hash = Column(String, nullable=False, unique=True)

    citizen = relationship("People", back_populates="fir_records")
    logs = relationship("FIRLog", back_populates="fir_record")


# -----------------------------------------------------------------------------
# Table 3: Officers (Personnel Registry)
# -----------------------------------------------------------------------------
class Officers(Base):
    __tablename__ = "officers"

    officer_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    badge_number = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False) # "STATION_OFFICER" or "CENTRAL_AUTHORITY"
    
    # NEW: Maps which station this local officer is physically assigned to
    station_id = Column(String, nullable=False, index=True) 
    password_hash = Column(String, nullable=False)

    logs = relationship("FIRLog", back_populates="officer")


# -----------------------------------------------------------------------------
# Table 4: FIR_Logs (The State Machine Audit Trail)
# -----------------------------------------------------------------------------
class FIRLog(Base):
    __tablename__ = "fir_logs"

    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    fir_id = Column(Integer, ForeignKey("fir_records.fir_id"), nullable=False)
    officer_id = Column(Integer, ForeignKey("officers.officer_id"), nullable=False)
    
    # NEW: Captures exact status changes explicitly for state tracking
    previous_status = Column(SQLEnum(FIRStatusEnum), nullable=False)
    new_status = Column(SQLEnum(FIRStatusEnum), nullable=False)
    
    action_taken = Column(Text, nullable=False) # Explanatory notes by the officer
    
    # FIXED: Removed () for real-time insert execution timestamping
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    fir_record = relationship("FIRRecord", back_populates="logs")
    officer = relationship("Officers", back_populates="logs")


class CitizenLogin(BaseModel):
    phone_number: str
    password: str

class OfficerLogin(BaseModel):
    officer_id: int
    password: str

class FIRSubmission(BaseModel):
    phone_number: str
    text: str
    station_id: str