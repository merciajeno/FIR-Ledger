from datetime import datetime
import enum

from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

# SQLAlchemy base class for defining database models
Base = declarative_base()

# -----------------------------------------------------------------------------
# ENUM for FIR status values
# -----------------------------------------------------------------------------
class FIRStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    INVESTIGATING = "INVESTIGATING"
    CLOSED = "CLOSED"


# -----------------------------------------------------------------------------
# Table 1: People (citizens)
# -----------------------------------------------------------------------------
class People(Base):
    __tablename__ = "people"

    phone_number = Column(String, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    # Relationship to the FIR_Records table.
    fir_records = relationship("FIRRecord", back_populates="citizen")


# -----------------------------------------------------------------------------
# Table 2: FIR_Records (complaints)
# -----------------------------------------------------------------------------
class FIRRecord(Base):
    __tablename__ = "fir_records"

    fir_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    citizen_phone = Column(String, ForeignKey("people.phone_number"), nullable=False)
    original_text = Column(Text, nullable=False)
    current_status = Column(SQLEnum(FIRStatusEnum), default=FIRStatusEnum.PENDING, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    fir_hash = Column(String, nullable=False, unique=True)

    citizen = relationship("People", back_populates="fir_records")
    logs = relationship("FIRLog", back_populates="fir_record")


# -----------------------------------------------------------------------------
# Table 3: Officers (police and authority)
# -----------------------------------------------------------------------------
class Officers(Base):
    __tablename__ = "officers"

    officer_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    badge_number = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    # Relationship to the FIR_Logs table.
    logs = relationship("FIRLog", back_populates="officer")


# -----------------------------------------------------------------------------
# Table 4: FIR_Logs (audit history)
# -----------------------------------------------------------------------------
class FIRLog(Base):
    __tablename__ = "fir_logs"

    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    fir_id = Column(Integer, ForeignKey("fir_records.fir_id"), nullable=False)
    officer_id = Column(Integer, ForeignKey("officers.officer_id"), nullable=False)
    action_taken = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    fir_record = relationship("FIRRecord", back_populates="logs")
    officer = relationship("Officers", back_populates="logs")
