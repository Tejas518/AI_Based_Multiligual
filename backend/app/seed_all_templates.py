import json
from app.database import SessionLocal
from app.models import User, Template

def seed_all_templates(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        # Get administrator to act as creator
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            admin = db.query(User).first()
        if not admin:
            print("Error: No users found. Run backend to seed users first.")
            return

        creator_id = admin.id

        # The 20 combinations of channels and categories
        templates_data = [
            # --- EMAIL ---
            {
                "title": "Email - Emergency: Severe Flood Evacuation",
                "description": "Urgent notification containing safety guidelines and rescue contacts.",
                "category": "emergency",
                "channel": "email",
                "default_language": "English",
                "subject_template": "CRITICAL: Urgent Evacuation Notice for {city}, {state}",
                "body_template": "Dear {first_name} {last_name},\n\nThis is an emergency notification regarding rising water levels in {city}. Please secure your belongings and move to the nearest safe shelter designated for {district} district.\n\nEmergency Helpline: +91-11-23456789\nStay safe and alert.\n\nSincerely,\nDisaster Management Division"
            },
            {
                "title": "Email - Awareness: Water Conservation Initiative",
                "description": "Public campaign urging citizens to conserve clean drinking water.",
                "category": "awareness",
                "channel": "email",
                "default_language": "English",
                "subject_template": "Save Water, Secure the Future of {state}",
                "body_template": "Dear {first_name},\n\nFresh water is a limited resource. Simple actions like rain harvesting in your home at {city} can make a huge impact on {state}'s future. Learn about simple modifications to conserve water.\n\nWarm regards,\nMinistry of Jal Shakti"
            },
            {
                "title": "Email - Education: Digital Banking Security",
                "description": "Information on online security, avoiding phishing, and OTP fraud.",
                "category": "education",
                "channel": "email",
                "default_language": "English",
                "subject_template": "Learn to Stay Safe Online, {first_name}!",
                "body_template": "Dear {first_name} {last_name},\n\nNever share your password or OTP with anyone. Representatives of banks in {district} will never ask for private details over phone or email. Keep your digital transactions secure.\n\nBest regards,\nNational Cyber Security Cell"
            },
            {
                "title": "Email - Announcement: New E-Governance App Release",
                "description": "Official launch notification of digital public utility portals.",
                "category": "announcement",
                "channel": "email",
                "default_language": "English",
                "subject_template": "Announcing the Launch of CitizenConnect App in {state}",
                "body_template": "Dear {first_name},\n\nWe are proud to launch CitizenConnect app today! Access driving license, land records, and municipal receipts right from {city}.\n\nDownload today from the Play Store!\n\nBest regards,\nDepartment of IT & e-Governance"
            },

            # --- SMS ---
            {
                "title": "SMS - Emergency: Extreme Heat Alert",
                "description": "Brief text alert warning about high local heat indexes.",
                "category": "emergency",
                "channel": "sms",
                "default_language": "Hindi",
                "subject_template": "Alert: Severe Heatwave",
                "body_template": "Alert {first_name}: Severe heatwave predicted in {district} today. Stay indoors, drink water, keep domestic animals in shade."
            },
            {
                "title": "SMS - Awareness: Cleanliness Drive",
                "description": "Short public text encouraging trash segregation.",
                "category": "awareness",
                "channel": "sms",
                "default_language": "Hindi",
                "subject_template": "Clean India Campaign",
                "body_template": "Dear {first_name}, segregate wet and dry waste at your home in {city}. Let's make {state} clean and green!"
            },
            {
                "title": "SMS - Education: Free Vocational Skills Training",
                "description": "SMS invite to government-sponsored youth training centers.",
                "category": "education",
                "channel": "sms",
                "default_language": "Hindi",
                "subject_template": "Skill Development",
                "body_template": "Unlock new jobs, {first_name}! Enroll in free skill training at {district} center. Reply YES to register."
            },
            {
                "title": "SMS - Announcement: Direct Benefit Transfer Update",
                "description": "Sowing subsidy disbursal message sent directly to farmers.",
                "category": "announcement",
                "channel": "sms",
                "default_language": "Hindi",
                "subject_template": "Subsidy Released",
                "body_template": "Good news {first_name}! Agricultural seed subsidy has been credited to your bank account registered in {city}."
            },

            # --- WHATSAPP ---
            {
                "title": "WhatsApp - Emergency: Cyclone Safety Alert",
                "description": "Safety instructions for coastal storm warnings.",
                "category": "emergency",
                "channel": "whatsapp",
                "default_language": "English",
                "subject_template": "URGENT: Cyclone Alert in Coastal Districts",
                "body_template": "Hello {first_name},\n\n*Cyclone Alert* for coastal regions in {state}. High winds are expected in {city} next 24 hours. Keep emergency kits ready, unplug electronics, and monitor warnings. Call 108 for help."
            },
            {
                "title": "WhatsApp - Awareness: Crop Sowing Guidelines",
                "description": "WhatsApp infographic text for regional crops.",
                "category": "awareness",
                "channel": "whatsapp",
                "default_language": "Hindi",
                "subject_template": "Important Sowing Advisory",
                "body_template": "Dear farmer {first_name} {last_name},\n\n*Kharif sowing time is here!* Plan seed density for district {district}. Get soil health checked before using fertilizers. Contact block welfare officer for subsidized seeds."
            },
            {
                "title": "WhatsApp - Education: Child Nutrition & Healthcare",
                "description": "Infographic text explaining child immunization schedules.",
                "category": "education",
                "channel": "whatsapp",
                "default_language": "English",
                "subject_template": "Child Wellness & Immunization",
                "body_template": "Hello {first_name},\n\nEnsure healthy growth for your children. Get free vaccine drops at municipal health clinic in {city} this Sunday. Let's build a healthier {state}!"
            },
            {
                "title": "WhatsApp - Announcement: Metro Route Expansion",
                "description": "Announcement detailing new transit links.",
                "category": "announcement",
                "channel": "whatsapp",
                "default_language": "English",
                "subject_template": "New Metro Transit Launch",
                "body_template": "Dear Commuter,\n\nWe have expanded metro transit connectivity in {city}! Travel easily and reduce pollution in {district}. View new routes at website."
            },

            # --- PUSH ---
            {
                "title": "Push - Emergency: Fire Hazard Warning",
                "description": "Mobile app alert warning of dry wind forest fires.",
                "category": "emergency",
                "channel": "push",
                "default_language": "English",
                "subject_template": "🚨 URGENT: Dry Forest Fire Warning",
                "body_template": "{first_name}, extreme dry winds in {district} have increased forest fire risks. Avoid lighting dry trash."
            },
            {
                "title": "Push - Awareness: Road Safety Campaign",
                "description": "Mobile push notification reminder to wear helmets/seatbelts.",
                "category": "awareness",
                "channel": "push",
                "default_language": "English",
                "subject_template": "🏍️ Drive Safe in {city}!",
                "body_template": "Dear {first_name}, always wear a helmet and seatbelt. Let's make the roads of {state} accident-free."
            },
            {
                "title": "Push - Education: Scholarship Registrations",
                "description": "Mobile push notifying students of application dates.",
                "category": "education",
                "channel": "push",
                "default_language": "English",
                "subject_template": "🎓 Scholarship Registration Open",
                "body_template": "Hey {first_name}! Pre-matric scholarships applications close next week. Apply via the e-welfare portal today."
            },
            {
                "title": "Push - Announcement: Tax Filing Extension",
                "description": "Short alert announcing tax timeline adjustments.",
                "category": "announcement",
                "channel": "push",
                "default_language": "English",
                "subject_template": "📅 Municipal Tax Extension",
                "body_template": "Dear Citizen, the last date for submitting property tax in {city} has been extended to July 31."
            },

            # --- WEBSITE ---
            {
                "title": "Website - Emergency: Localized Flood Road Closure",
                "description": "Banner text warning users about flooded highways.",
                "category": "emergency",
                "channel": "website",
                "default_language": "English",
                "subject_template": "TRAFFIC NOTICE: Flooding Closures",
                "body_template": "Bridges connecting national highway to district {district} are closed due to rising rivers. Use bypass routes."
            },
            {
                "title": "Website - Awareness: Renewable Energy Incentives",
                "description": "Subpage banner promoting clean energy grants.",
                "category": "awareness",
                "channel": "website",
                "default_language": "English",
                "subject_template": "Go Solar: Subsidies on Roof Panels",
                "body_template": "Save up to 40% on solar installations at your home in {city}! Check government subsidy eligibility factors."
            },
            {
                "title": "Website - Education: E-Learning Portal Tutorial",
                "description": "Homepage banner introducing digital school systems.",
                "category": "education",
                "channel": "website",
                "default_language": "English",
                "subject_template": "Free Virtual Learning Platforms",
                "body_template": "Access digital video libraries, quizzes, and school books online. Register student profiles in {state} for free."
            },
            {
                "title": "Website - Announcement: Public Grievance Helpline",
                "description": "Banner notifying visitors of grievance status tracking.",
                "category": "announcement",
                "channel": "website",
                "default_language": "English",
                "subject_template": "Track Grievances Online",
                "body_template": "Lodge and track public services complaints directly in {district}. Accountable resolutions within 15 days."
            }
        ]

        added_count = 0
        for t_data in templates_data:
            # Check if this exact title or channel+category combination already exists
            existing = db.query(Template).filter(
                Template.channel == t_data["channel"],
                Template.category == t_data["category"],
                Template.is_deleted == False
            ).first()

            if not existing:
                new_tpl = Template(
                    title=t_data["title"],
                    description=t_data["description"],
                    category=t_data["category"],
                    channel=t_data["channel"],
                    default_language=t_data["default_language"],
                    subject_template=t_data["subject_template"],
                    body_template=t_data["body_template"],
                    is_ai_generated=False,
                    version=1,
                    created_by=creator_id
                )
                db.add(new_tpl)
                added_count += 1

        db.commit()
        print(f"[SEEDED TEMPLATES] Added {added_count} new templates. Total 20 combinations seeded.")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        if close_db:
            db.close()

if __name__ == "__main__":
    seed_all_templates()
