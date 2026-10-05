import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# For SQLite, check_same_thread is false so that multiple threads can access it in FastAPI
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

# Auto-create intermediate directories if database is SQLite
if settings.DATABASE_URL.startswith("sqlite"):
    # Strip sqlite prefix to extract the path (supporting both 3 and 4 slashes)
    db_path = settings.DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
    if db_path:
        db_dir = os.path.dirname(db_path)
        if db_dir:
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                print(f"[DB] Warning: Could not create database directory '{db_dir}': {e}")

engine = create_engine(
    settings.DATABASE_URL, connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
