from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base

app = FastAPI()

# -----------------------------------------------------------------------------
# Database engine and session factory
# -----------------------------------------------------------------------------
DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# SessionLocal is a factory for new session objects.
# Each request can get its own session from this factory.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create all tables if they do not exist yet.
Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"message": "Hello World"}   