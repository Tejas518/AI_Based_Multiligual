import json
import random
import uuid
from sqlalchemy.orm import Session
from app.database import engine, SessionLocal
from app.models import Audience
from app.config import settings

def seed_performance_data(count: int = 5000):
    db = SessionLocal()
    try:
        # Check if already seeded
        existing = db.query(Audience).count()
        if existing >= count:
            print(f"[PERFORMANCE SEED] Database already has {existing} audience records. Skipping seed.")
            return

        print(f"[PERFORMANCE SEED] Seeding {count} mock audience records for load testing...")
        
        # Lists for random seeding
        first_names = ["Ramesh", "Suresh", "Amit", "Rahul", "Priya", "Neha", "Sunita", "Anjali", "Sita", "Gopal", "Vikram", "Deepak", "Karan", "Pooja", "Arjun", "Aditya", "Jyoti", "Meena", "Kiran", "Vijay"]
        last_names = ["Sharma", "Verma", "Patil", "Singh", "Nair", "Joshi", "Kumar", "Gupta", "Reddy", "Choudhary", "Das", "Banerjee", "Sen", "Rao", "Mishra", "Pandey", "Mehta", "Patel", "Gowda", "Gill"]
        genders = ["Male", "Female", "Other"]
        states = ["Punjab", "Uttar Pradesh", "Maharashtra", "Bihar", "Tamil Nadu", "Karnataka", "West Bengal", "Gujarat", "Delhi"]
        
        state_locations = {
            "Punjab": {"districts": ["Ludhiana", "Amritsar", "Jalandhar"], "cities": ["Ludhiana", "Amritsar", "Jalandhar"]},
            "Uttar Pradesh": {"districts": ["Varanasi", "Lucknow", "Kanpur"], "cities": ["Varanasi", "Lucknow", "Kanpur"]},
            "Maharashtra": {"districts": ["Pune", "Mumbai", "Nagpur"], "cities": ["Pune", "Mumbai", "Nagpur"]},
            "Bihar": {"districts": ["Patna", "Gaya", "Muzaffarpur"], "cities": ["Patna", "Gaya", "Muzaffarpur"]},
            "Tamil Nadu": {"districts": ["Chennai", "Coimbatore", "Madurai"], "cities": ["Chennai", "Coimbatore", "Madurai"]},
            "Karnataka": {"districts": ["Bangalore", "Mysore", "Hubli"], "cities": ["Bangalore", "Mysore", "Hubli"]},
            "West Bengal": {"districts": ["Kolkata", "Howrah", "Darjeeling"], "cities": ["Kolkata", "Howrah", "Darjeeling"]},
            "Gujarat": {"districts": ["Ahmedabad", "Surat", "Vadodara"], "cities": ["Ahmedabad", "Surat", "Vadodara"]},
            "Delhi": {"districts": ["New Delhi", "North Delhi", "South Delhi"], "cities": ["New Delhi", "North Delhi", "South Delhi"]}
        }
        
        batch = []
        base_phone = 9000000000
        
        # Read supported values from settings
        seeded_languages = settings.LANGUAGES
        seeded_occupations = settings.OCCUPATIONS
        seeded_channels = settings.CHANNELS

        for i in range(count):
            first = random.choice(first_names)
            last = random.choice(last_names)
            email = f"{first.lower()}.{last.lower()}.{i}@demo.in"
            phone = str(base_phone + i)
            
            # 1 to 3 preferred languages
            num_langs = random.randint(1, 3)
            langs = random.sample(seeded_languages, num_langs)
            
            # 1 to 2 channels
            num_chans = random.randint(1, 2)
            chans = random.sample(seeded_channels, num_chans)
            
            occ = random.choice(seeded_occupations)
            age = random.randint(18, 75)
            gender = random.choices(genders, weights=[48, 48, 4], k=1)[0]
            
            state = random.choice(states)
            loc = state_locations[state]
            district = random.choice(loc["districts"])
            city = random.choice(loc["cities"])
            
            org = f"{occ} Organization" if occ != "General Public" else None
            dept = f"{occ} Department" if occ != "General Public" else None
            desig = f"Senior {occ}" if occ != "General Public" else None

            aud = Audience(
                id=str(uuid.uuid4()),
                first_name=first,
                last_name=last,
                email=email,
                phone=phone,
                preferred_languages=json.dumps(langs),
                occupation=occ,
                age=age,
                gender=gender,
                state=state,
                district=district,
                city=city,
                organization=org,
                department=dept,
                designation=desig,
                preferred_channels=json.dumps(chans),
                is_active=True,
                is_deleted=False
            )
            batch.append(aud)
            
            # Batch inserts every 500 rows for sqlite memory efficiency
            if len(batch) >= 500:
                db.bulk_save_objects(batch)
                db.commit()
                batch = []
                
        if batch:
            db.bulk_save_objects(batch)
            db.commit()
            
        total_seeded = db.query(Audience).count()
        print(f"[PERFORMANCE SEED] Done. Total audience count: {total_seeded} records in database.")
    except Exception as e:
        print(f"[PERFORMANCE SEED] Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_performance_data()
