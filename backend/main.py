from datetime import datetime
import hashlib
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from models import Base, FIRLog, FIRRecord, FIRStatusEnum, Officers, People
import models
app = FastAPI()

# -----------------------------------------------------------------------------
# Database engine and session factory
# -----------------------------------------------------------------------------
DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def get_db():
    """
    Dependency Injection function.
    Yields a fresh database session for a single API request, 
    then automatically closes it once the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "Hello World"}   

@app.post("/structure")
def create_fir_record_structure():
    return {"message": "FIR record structure created successfully"}

@app.post("/detect-mismatch")
def detect_mismatch():
    return {"message": "Mismatch detected successfully"}


@app.post("/api/v1/people/add")
def add_person(phone_number: str, full_name: str, password_hash: str, db: Session = Depends(get_db)):
    """Directly inserts a citizen into the people table."""
    # Check if they already exist to prevent database errors
    existing = db.query(models.People).filter(models.People.phone_number == phone_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already exists.")

    new_person = models.People(
        phone_number=phone_number,
        full_name=full_name,
        password_hash=password_hash
    )
    db.add(new_person)
    db.commit()
    return {"message": "Person added successfully"}

@app.post("/api/v1/officers/add")
def add_officer(badge_number: str, full_name: str, role: str, station_id: str, password_hash: str, db: Session = Depends(get_db)):
    """Directly inserts an officer into the officers table."""
    # Check if badge number already exists
    existing = db.query(models.Officers).filter(models.Officers.badge_number == badge_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Badge number already exists.")

    new_officer = models.Officers(
        badge_number=badge_number,
        full_name=full_name,
        role=role.upper(),         # "STATION_OFFICER" or "CENTRAL_AUTHORITY"
        station_id=station_id.upper(),
        password_hash=password_hash
    )
    db.add(new_officer)
    db.commit()
    return {"message": "Officer added successfully", "officer_id": new_officer.officer_id}

@app.post("/api/v1/citizen/submit-fir")
def submit_fir(phone_number: str, text: str, station_id: str, db: Session = Depends(get_db)):
    """
    Safely creates an FIR and locks it mathematically.
    """
    # 1. First, check if the citizen actually exists in the 'people' table
    citizen_exists = db.query(models.People).filter(models.People.phone_number == phone_number).first()
    if not citizen_exists:
        raise HTTPException(
            status_code=400, 
            detail=f"Citizen profile with phone {phone_number} does not exist. Please add the person first."
        )

    now = datetime.utcnow()
    
    # 2. Generate the immutable lock payload string
    data_to_seal = f"{phone_number}|{text}|{now.isoformat()}"
    crypto_hash = hashlib.sha256(data_to_seal.encode('utf-8')).hexdigest()
    
    try:
        # 3. Create the record matching your exact models.py columns
        new_fir = models.FIRRecord(
            citizen_phone=phone_number,
            original_text=text,
            station_id=station_id.upper(), # Saved from user input
            created_at=now,
            fir_hash=crypto_hash,
            current_status=models.FIRStatusEnum.PENDING
        )
        db.add(new_fir)
        db.commit()
        db.refresh(new_fir)
        
        return {
            "message": "FIR safely recorded in the immutable ledger.",
            "fir_id": new_fir.fir_id,
            "receipt_hash": new_fir.fir_hash
        }
    except Exception as e:
        db.rollback()
        # CRITICAL FOR HACKATHONS: Print the raw error to your terminal so you can read it!
        print(f"!!! DATABASE CRASH DETECTED: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ledger write failure: {str(e)}")


# -----------------------------------------------------------------------------
# OFFICER FUNCTIONS (ANTI-TAMPERING STATUS UPDATES)
# -----------------------------------------------------------------------------

@app.post("/api/v1/officer/update-status")
def update_fir_status(fir_id: int, officer_id: int, target_status: models.FIRStatusEnum, action_details: str, db: Session = Depends(get_db)):
    """
    Appends an unchangeable transaction log when modifying FIR progress states.
    """
    # 1. Pull the target FIR record
    fir = db.query(models.FIRRecord).filter(models.FIRRecord.fir_id == fir_id).first()
    if not fir:
        raise HTTPException(status_code=404, detail="FIR profile not found.")
        
    # 2. Verify the officer exists in our records
    officer = db.query(models.Officers).filter(models.Officers.officer_id == officer_id).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Unauthorized: Officer credentials invalid.")

    # Capture the state before advancing the machine
    old_status = fir.current_status

    try:
        # Ensure target_status is explicitly matched as a valid Enum object member
        validated_target_status = models.FIRStatusEnum(target_status)

        # 3. Build the audit log row matching your exact models.py columns
        audit_log = models.FIRLog(
            fir_id=fir.fir_id,
            officer_id=officer.officer_id,
            previous_status=old_status,             # Passing the active Enum object
            new_status=validated_target_status,      # Passing the validated Enum object
            action_taken=action_details
        )
        db.add(audit_log)
        
        # 4. Advance the status pointer flag on the main record
        fir.current_status = validated_target_status
        
        db.commit()
        return {"message": "Timeline updated and logged cleanly.", "new_status": fir.current_status}
        
    except Exception as e:
        db.rollback()
        # Look at your terminal tab when it crashes; this print line will show the raw SQL error!
        print(f"!!! STATUS UPDATE DATABASE CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transaction aborted: {str(e)}")


# -----------------------------------------------------------------------------
# CENTRAL AUTHORITY FUNCTIONS (ROLE-BASED MONITORING)
# -----------------------------------------------------------------------------

@app.get("/api/v1/authority/view-logs")
def view_system_logs(requester_officer_id: int, db: Session = Depends(get_db)):
    """
    ROLE ISOLATION:
    Checks if the officer has 'CENTRAL_AUTHORITY' Clearance.
    If yes, they can inspect every action taken across the entire jurisdiction.
    """
    # Verify who is trying to access the master data logs
    auth_check = db.query(models.Officers).filter(models.Officers.officer_id == requester_officer_id).first()
    
    if not auth_check:
        raise HTTPException(status_code=403, detail="Access Denied: Unknown personnel identity.")
        
    # STRICT RULE: Check the exact text string in the role column
    if auth_check.role.upper() != "CENTRAL_AUTHORITY":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Denied: You do not possess Central Authority auditing clearance."
        )
        
    # If clearance passes, grab absolutely everything in chronological order
    master_logs = db.query(models.FIRLog).order_by(models.FIRLog.timestamp.desc()).all()
    
    return master_logs