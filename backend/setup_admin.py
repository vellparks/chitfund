import models
from database import SessionLocal, engine

# Create tables
models.Base.metadata.create_all(bind=engine)

def create_initial_admin():
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin:
            new_admin = models.User(
                username="admin",
                role="admin",
                full_name="System Administrator",
                password_hash="admin123", # In real app, use hashing!
                is_active=1
            )
            db.add(new_admin)
            db.commit()
            print("Created Admin user: admin / admin123")
        developer = db.query(models.User).filter(models.User.username == "developer").first()
        if not developer:
            new_developer = models.User(
                username="developer",
                role="developer",
                full_name="Developer Support",
                password_hash="dev123",
                is_active=1
            )
            db.add(new_developer)
            db.commit()
            print("Created Developer user: developer / dev123")
    finally:
        db.close()

if __name__ == "__main__":
    create_initial_admin()
