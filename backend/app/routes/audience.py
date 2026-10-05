import csv
import json
import datetime
from io import StringIO
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import or_, and_, text, func as sqla_func
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from app.database import get_db
from app.models import Audience, Segment, User
from app.schemas import AudienceCreate, AudienceUpdate, AudienceResponse, SegmentCreate, SegmentUpdate, SegmentResponse
from app.auth import require_admin, require_manager_or_higher
from app.config import settings

router = APIRouter(tags=["Audience Management"])

# Helper function to serialize lists to JSON string
def serialize_list(lst: List[str]) -> str:
    return json.dumps([x.strip() for x in lst if x.strip()])

# Helper function to deserialize lists from JSON string
def deserialize_list(s: str) -> List[str]:
    try:
        return json.loads(s) if s else []
    except Exception:
        return []

def format_audience_response(aud: Audience) -> AudienceResponse:
    return AudienceResponse(
        id=aud.id,
        first_name=aud.first_name,
        last_name=aud.last_name,
        email=aud.email,
        phone=aud.phone,
        preferred_languages=deserialize_list(aud.preferred_languages),
        occupation=aud.occupation,
        age=aud.age,
        gender=aud.gender,
        state=aud.state,
        district=aud.district,
        city=aud.city,
        organization=aud.organization,
        department=aud.department,
        designation=aud.designation,
        preferred_channels=deserialize_list(aud.preferred_channels),
        custom_fields=json.loads(aud.custom_fields) if aud.custom_fields else {},
        is_active=aud.is_active,
        created_at=aud.created_at,
        updated_at=aud.updated_at
    )

@router.get("/audiences", response_model=Dict[str, Any])
def list_audiences(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    language: Optional[str] = None,
    occupation: Optional[str] = None,
    state: Optional[str] = None,
    gender: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    query = db.query(Audience).filter(Audience.is_deleted == False)
    
    # Apply column filters
    if language:
        # SQLite search in JSON array
        query = query.filter(Audience.preferred_languages.like(f'%"{language}"%'))
    if occupation:
        query = query.filter(Audience.occupation == occupation)
    if state:
        query = query.filter(Audience.state == state)
    if gender:
        query = query.filter(Audience.gender == gender)
        
    # Search filter (name, phone, email)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Audience.first_name.like(search_term),
                Audience.last_name.like(search_term),
                Audience.phone.like(search_term),
                Audience.email.like(search_term)
            )
        )
        
    total = query.count()
    records = query.order_by(Audience.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "results": [format_audience_response(r) for r in records]
    }

@router.get("/audiences/analytics", response_model=Dict[str, Any])
def get_audience_analytics(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Returns audience breakdown by language, occupation, state, gender, and channel for dashboard charts."""
    from sqlalchemy import func as sqla_func

    base = db.query(Audience).filter(Audience.is_deleted == False)
    total = base.count()
    active = base.filter(Audience.is_active == True).count()

    # Occupation breakdown
    occ_rows = db.query(Audience.occupation, sqla_func.count(Audience.id)).filter(
        Audience.is_deleted == False
    ).group_by(Audience.occupation).all()
    occupation_breakdown = {row[0]: row[1] for row in occ_rows}

    # State breakdown
    state_rows = db.query(Audience.state, sqla_func.count(Audience.id)).filter(
        Audience.is_deleted == False
    ).group_by(Audience.state).all()
    state_breakdown = {row[0]: row[1] for row in state_rows}

    # Gender breakdown
    gender_rows = db.query(Audience.gender, sqla_func.count(Audience.id)).filter(
        Audience.is_deleted == False
    ).group_by(Audience.gender).all()
    gender_breakdown = {row[0]: row[1] for row in gender_rows}

    # Language and Channel breakdown (need to parse JSON arrays)
    all_auds = base.all()
    lang_counter: Dict[str, int] = {}
    channel_counter: Dict[str, int] = {}
    for aud in all_auds:
        try:
            langs = json.loads(aud.preferred_languages) if aud.preferred_languages else []
        except Exception:
            langs = []
        for lang in langs:
            lang_counter[lang] = lang_counter.get(lang, 0) + 1
        try:
            chans = json.loads(aud.preferred_channels) if aud.preferred_channels else []
        except Exception:
            chans = []
        for ch in chans:
            channel_counter[ch] = channel_counter.get(ch, 0) + 1

    # Age distribution buckets
    age_buckets = {"0-17": 0, "18-25": 0, "26-35": 0, "36-50": 0, "51-65": 0, "65+": 0}
    for aud in all_auds:
        if aud.age <= 17:
            age_buckets["0-17"] += 1
        elif aud.age <= 25:
            age_buckets["18-25"] += 1
        elif aud.age <= 35:
            age_buckets["26-35"] += 1
        elif aud.age <= 50:
            age_buckets["36-50"] += 1
        elif aud.age <= 65:
            age_buckets["51-65"] += 1
        else:
            age_buckets["65+"] += 1

    return {
        "total": total,
        "active": active,
        "inactive": total - active,
        "by_occupation": occupation_breakdown,
        "by_state": state_breakdown,
        "by_gender": gender_breakdown,
        "by_language": lang_counter,
        "by_channel": channel_counter,
        "by_age": age_buckets,
    }

@router.get("/audiences/{id}", response_model=AudienceResponse)
def get_audience(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    aud = db.query(Audience).filter(Audience.id == id, Audience.is_deleted == False).first()
    if not aud:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audience member not found")
    return format_audience_response(aud)

@router.post("/audiences", response_model=AudienceResponse, status_code=status.HTTP_201_CREATED)
def create_audience(
    aud_in: AudienceCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    # Check duplicate phone if phone provided
    if aud_in.phone and aud_in.phone.strip():
        db_aud_phone = db.query(Audience).filter(Audience.phone == aud_in.phone, Audience.is_deleted == False).first()
        if db_aud_phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already exists")
        
    # Check duplicate email (mandatory)
    db_aud_email = db.query(Audience).filter(Audience.email == aud_in.email, Audience.is_deleted == False).first()
    if db_aud_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email address already exists")
            
    # Language and Channel list validations
    for lang in aud_in.preferred_languages:
        if lang not in settings.LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Language '{lang}' is not supported")
            
    for channel in aud_in.preferred_channels:
        if channel not in settings.CHANNELS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Channel '{channel}' is not supported")
            
    aud = Audience(
        first_name=aud_in.first_name,
        last_name=aud_in.last_name or "",
        email=aud_in.email,
        phone=aud_in.phone,
        preferred_languages=serialize_list(aud_in.preferred_languages),
        occupation=aud_in.occupation,
        age=aud_in.age,
        gender=aud_in.gender,
        state=aud_in.state,
        district=aud_in.district,
        city=aud_in.city,
        organization=aud_in.organization,
        department=aud_in.department,
        designation=aud_in.designation,
        preferred_channels=serialize_list(aud_in.preferred_channels),
        custom_fields=json.dumps(aud_in.custom_fields) if aud_in.custom_fields else None,
        is_active=aud_in.is_active
    )
    db.add(aud)
    db.commit()
    db.refresh(aud)
    return format_audience_response(aud)

@router.put("/audiences/{id}", response_model=AudienceResponse)
def update_audience(
    id: str,
    aud_in: AudienceCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    aud = db.query(Audience).filter(Audience.id == id, Audience.is_deleted == False).first()
    if not aud:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audience member not found")
        
    # Check phone duplicates excluding current record
    db_aud_phone = db.query(Audience).filter(Audience.phone == aud_in.phone, Audience.id != id, Audience.is_deleted == False).first()
    if db_aud_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already exists on another profile")
        
    if aud_in.email:
        db_aud_email = db.query(Audience).filter(Audience.email == aud_in.email, Audience.id != id, Audience.is_deleted == False).first()
        if db_aud_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists on another profile")
            
    # Save edits
    aud.first_name = aud_in.first_name
    aud.last_name = aud_in.last_name
    aud.email = aud_in.email
    aud.phone = aud_in.phone
    aud.preferred_languages = serialize_list(aud_in.preferred_languages)
    aud.occupation = aud_in.occupation
    aud.age = aud_in.age
    aud.gender = aud_in.gender
    aud.state = aud_in.state
    aud.district = aud_in.district
    aud.city = aud_in.city
    aud.organization = aud_in.organization
    aud.department = aud_in.department
    aud.designation = aud_in.designation
    aud.preferred_channels = serialize_list(aud_in.preferred_channels)
    aud.custom_fields = json.dumps(aud_in.custom_fields) if aud_in.custom_fields else None
    aud.is_active = aud_in.is_active

    # Sync matching User account if present
    if aud.email:
        usr = db.query(User).filter(User.email == aud.email).first()
        if usr:
            full_name = f"{aud.first_name} {aud.last_name}".strip()
            if full_name:
                usr.full_name = full_name
            if aud.organization:
                usr.organization = aud.organization
            if aud.designation:
                usr.designation = aud.designation
            if aud.is_active is not None:
                usr.is_active = aud.is_active
            if aud.preferred_languages:
                usr.preferred_languages = aud.preferred_languages
    
    db.commit()
    db.refresh(aud)
    return format_audience_response(aud)

@router.delete("/audiences/{id}", status_code=status.HTTP_200_OK)
def delete_audience(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    aud = db.query(Audience).filter(Audience.id == id).first()
    if not aud:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audience member not found")
        
    db.delete(aud)
    db.commit()
    return {"message": "Audience member permanently deleted successfully", "id": id}


@router.patch("/audiences/{id}", response_model=AudienceResponse)
def patch_audience(
    id: str,
    aud_in: AudienceUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Partial update for an audience member — only updates fields that are provided."""
    aud = db.query(Audience).filter(Audience.id == id, Audience.is_deleted == False).first()
    if not aud:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audience member not found")

    if aud_in.phone is not None:
        dup = db.query(Audience).filter(Audience.phone == aud_in.phone, Audience.id != id, Audience.is_deleted == False).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already exists on another profile")
        aud.phone = aud_in.phone

    if aud_in.email is not None:
        dup = db.query(Audience).filter(Audience.email == aud_in.email, Audience.id != id, Audience.is_deleted == False).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists on another profile")
        aud.email = aud_in.email

    if aud_in.first_name is not None:
        aud.first_name = aud_in.first_name
    if aud_in.last_name is not None:
        aud.last_name = aud_in.last_name
    if aud_in.preferred_languages is not None:
        for lang in aud_in.preferred_languages:
            if lang not in settings.LANGUAGES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Language '{lang}' is not supported")
        aud.preferred_languages = serialize_list(aud_in.preferred_languages)
    if aud_in.occupation is not None:
        aud.occupation = aud_in.occupation
    if aud_in.age is not None:
        aud.age = aud_in.age
    if aud_in.gender is not None:
        aud.gender = aud_in.gender
    if aud_in.state is not None:
        aud.state = aud_in.state
    if aud_in.district is not None:
        aud.district = aud_in.district
    if aud_in.city is not None:
        aud.city = aud_in.city
    if aud_in.organization is not None:
        aud.organization = aud_in.organization
    if aud_in.department is not None:
        aud.department = aud_in.department
    if aud_in.designation is not None:
        aud.designation = aud_in.designation
    if aud_in.preferred_channels is not None:
        for ch in aud_in.preferred_channels:
            if ch not in settings.CHANNELS:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Channel '{ch}' is not supported")
        aud.preferred_channels = serialize_list(aud_in.preferred_channels)
    if aud_in.custom_fields is not None:
        aud.custom_fields = json.dumps(aud_in.custom_fields) if aud_in.custom_fields else None
    if aud_in.is_active is not None:
        aud.is_active = aud_in.is_active

    db.commit()
    db.refresh(aud)
    return format_audience_response(aud)


@router.post("/audiences/import", status_code=status.HTTP_200_OK)
def import_audiences(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    content = file.file.read().decode("utf-8")
    file.file.close()
    
    csv_file = StringIO(content)
    # Autodetect delimiter
    try:
        sample = content[:1024]
        dialect = csv.Sniffer().sniff(sample) if sample else None
        reader = csv.DictReader(csv_file, dialect=dialect) if dialect else csv.DictReader(csv_file)
    except Exception:
        reader = csv.DictReader(csv_file)
        
    success_count = 0
    fail_count = 0
    errors = []
    
    # Keep track of phones in current batch to catch internal batch duplicates
    batch_phones = set()
    
    # Pre-fetch existing database phones and emails for fast duplicate check
    existing_phones = {x[0] for x in db.query(Audience.phone).filter(Audience.is_deleted == False).all()}
    existing_emails = {x[0] for x in db.query(Audience.email).filter(Audience.is_deleted == False, Audience.email != None).all()}
    
    for idx, row in enumerate(reader, start=1):
        try:
            first_name = row.get("first_name", "").strip()
            last_name = row.get("last_name", "").strip()
            email = row.get("email", "").strip() or None
            phone = row.get("phone", "").strip()
            
            # Languages parsing (comma separated list)
            langs_raw = row.get("preferred_languages", "").strip()
            langs = [l.strip() for l in langs_raw.split(",") if l.strip()] if langs_raw else []
            
            occupation = row.get("occupation", "").strip()
            
            # Age parsing
            age_raw = row.get("age", "").strip()
            age = int(age_raw) if age_raw else None
            
            gender = row.get("gender", "").strip()
            state = row.get("state", "").strip()
            district = row.get("district", "").strip()
            city = row.get("city", "").strip()
            organization = row.get("organization", "").strip() or None
            department = row.get("department", "").strip() or None
            designation = row.get("designation", "").strip() or None
            
            # Channels parsing (comma separated list)
            channels_raw = row.get("preferred_channels", "").strip()
            channels = [c.strip() for c in channels_raw.split(",") if c.strip()] if channels_raw else []
            
            # Validation
            if not first_name:
                raise ValueError("Missing mandatory field: 'first_name'")
            if not last_name:
                raise ValueError("Missing mandatory field: 'last_name'")
            if not phone:
                raise ValueError("Missing mandatory field: 'phone'")
                
            # Phone digits check
            phone_digits = "".join(filter(str.isdigit, phone))
            if len(phone_digits) < 10 or len(phone_digits) > 15:
                raise ValueError("Phone number must contain between 10 and 15 digits")
                
            # Duplicate checks
            if phone in batch_phones:
                raise ValueError(f"Duplicate phone '{phone}' inside the uploaded batch")
            if phone in existing_phones:
                raise ValueError(f"Audience with phone '{phone}' already exists in database")
            if email and email in existing_emails:
                raise ValueError(f"Audience with email '{email}' already exists in database")
                
            # Dynamic custom fields extraction
            standard_fields = {
                "first_name", "last_name", "email", "phone", "preferred_languages", 
                "occupation", "age", "gender", "state", "district", "city", 
                "preferred_channels", "organization", "department", "designation"
            }
            custom_data = {}
            for k, v in row.items():
                if k and k.strip() and k.strip() not in standard_fields:
                    val_str = v.strip() if v else ""
                    if val_str:
                        custom_data[k.strip()] = val_str

            # Languages check
            for lang in langs:
                if lang not in settings.LANGUAGES:
                    raise ValueError(f"Unsupported language: '{lang}'")
            if not langs:
                langs = ["English"]  # default
                
            # Channels check
            for channel in channels:
                if channel not in settings.CHANNELS:
                    raise ValueError(f"Unsupported channel: '{channel}'")
            if not channels:
                channels = ["email"]  # default
                
            if age is None or age < 0 or age > 120:
                raise ValueError("Age must be an integer between 0 and 120")
                
            if not gender:
                gender = "Other"
            if not occupation:
                occupation = "General Public"
            if not state:
                raise ValueError("Missing mandatory field: 'state'")
            if not district:
                raise ValueError("Missing mandatory field: 'district'")
            if not city:
                raise ValueError("Missing mandatory field: 'city'")
                
            # Create entity
            aud = Audience(
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                preferred_languages=serialize_list(langs),
                occupation=occupation,
                age=age,
                gender=gender,
                state=state,
                district=district,
                city=city,
                organization=organization,
                department=department,
                designation=designation,
                preferred_channels=serialize_list(channels),
                custom_fields=json.dumps(custom_data) if custom_data else None,
                is_active=True
            )
            db.add(aud)
            batch_phones.add(phone)
            success_count += 1
            
        except Exception as e:
            fail_count += 1
            errors.append({
                "row": idx,
                "data": row,
                "message": str(e)
            })
            
    db.commit()
    return {
        "success_count": success_count,
        "fail_count": fail_count,
        "errors": errors
    }


# --- SEGMENTATION AND FILTER TRANSLATION ---

def build_segment_filter_query(filter_criteria: Dict[str, Any], query_obj):
    """
    Translates a segment's criteria dictionary into SQLAlchemy filter expressions.
    Supported fields in criteria:
    - language: string (checks inside preferred_languages array text)
    - occupation: list of strings (matches IN, case-insensitive)
    - state: list of strings (matches IN, case-insensitive)
    - district: list of strings (matches IN, case-insensitive)
    - age_gte: int (matches age >= val)
    - age_lte: int (matches age <= val)
    - gender: list of strings (matches IN, case-insensitive)
    - organization: list of strings (matches IN, case-insensitive)
    """
    filters = []
    
    # Specific recipient IDs (Direct Targeting)
    ids = filter_criteria.get("ids")
    if ids and isinstance(ids, list):
        filters.append(Audience.id.in_(ids))
    
    # Language Preference (Checks text serialization matching)
    lang = filter_criteria.get("language")
    if lang:
        filters.append(Audience.preferred_languages.like(f'%"{lang}"%'))
        
    # Occupation List (case-insensitive)
    occupations = filter_criteria.get("occupations")
    if occupations and isinstance(occupations, list):
        lower_occs = [o.lower() for o in occupations if isinstance(o, str)]
        if lower_occs:
            filters.append(sqla_func.lower(Audience.occupation).in_(lower_occs))
        
    # State List (case-insensitive)
    states = filter_criteria.get("states")
    if states and isinstance(states, list):
        lower_states = [s.lower() for s in states if isinstance(s, str)]
        if lower_states:
            filters.append(sqla_func.lower(Audience.state).in_(lower_states))
        
    # District List (case-insensitive)
    districts = filter_criteria.get("districts")
    if districts and isinstance(districts, list):
        lower_dists = [d.lower() for d in districts if isinstance(d, str)]
        if lower_dists:
            filters.append(sqla_func.lower(Audience.district).in_(lower_dists))

    # City List (case-insensitive)
    cities = filter_criteria.get("cities") or filter_criteria.get("city")
    if cities:
        if isinstance(cities, str):
            cities = [cities]
        lower_cities = [c.lower() for c in cities if isinstance(c, str)]
        if lower_cities:
            filters.append(sqla_func.lower(Audience.city).in_(lower_cities))
        
    # Age constraints
    age_gte = filter_criteria.get("age_gte")
    if age_gte is not None:
        filters.append(Audience.age >= int(age_gte))
        
    age_lte = filter_criteria.get("age_lte")
    if age_lte is not None:
        filters.append(Audience.age <= int(age_lte))
        
    # Gender List (case-insensitive)
    genders = filter_criteria.get("genders")
    if genders and isinstance(genders, list):
        lower_genders = [g.lower() for g in genders if isinstance(g, str)]
        if lower_genders:
            filters.append(sqla_func.lower(Audience.gender).in_(lower_genders))
        
    # Organization List (case-insensitive)
    orgs = filter_criteria.get("organizations")
    if orgs and isinstance(orgs, list):
        lower_orgs = [o.lower() for o in orgs if isinstance(o, str)]
        if lower_orgs:
            filters.append(sqla_func.lower(Audience.organization).in_(lower_orgs))
        
    if filters:
        # Evaluate logical operator. Default to AND.
        logic = filter_criteria.get("logic", "AND").upper()
        if logic == "OR":
            return query_obj.filter(or_(*filters))
        else:
            return query_obj.filter(and_(*filters))
            
    return query_obj

@router.get("/segments", response_model=List[SegmentResponse])
def list_segments(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    segments = db.query(Segment).order_by(Segment.created_at.desc()).all()
    results = []
    for s in segments:
        criteria = json.loads(s.filter_criteria) if s.filter_criteria else {}
        base_query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
        eval_query = build_segment_filter_query(criteria, base_query)
        live_size = eval_query.count()

        results.append(SegmentResponse(
            id=s.id,
            name=s.name,
            description=s.description,
            filter_criteria=criteria,
            is_dynamic=s.is_dynamic,
            estimated_size=live_size,
            last_refreshed=s.last_refreshed,
            created_at=s.created_at
        ))
    return results

@router.post("/segments", response_model=SegmentResponse, status_code=status.HTTP_201_CREATED)
def create_segment(
    seg_in: SegmentCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    # Check duplicate segment name
    db_seg = db.query(Segment).filter(Segment.name == seg_in.name).first()
    if db_seg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Segment name already exists")
        
    # Live evaluate segment size
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    query = build_segment_filter_query(seg_in.filter_criteria, query)
    estimated_size = query.count()
    
    seg = Segment(
        name=seg_in.name,
        description=seg_in.description,
        filter_criteria=json.dumps(seg_in.filter_criteria),
        is_dynamic=seg_in.is_dynamic,
        estimated_size=estimated_size,
        last_refreshed=datetime.datetime.utcnow()
    )
    
    db.add(seg)
    db.commit()
    db.refresh(seg)
    
    return SegmentResponse(
        id=seg.id,
        name=seg.name,
        description=seg.description,
        filter_criteria=json.loads(seg.filter_criteria),
        is_dynamic=seg.is_dynamic,
        estimated_size=seg.estimated_size,
        last_refreshed=seg.last_refreshed,
        created_at=seg.created_at
    )

@router.put("/segments/{id}", response_model=SegmentResponse)
def update_segment(
    id: str,
    seg_in: SegmentUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Update an existing segment's name, description, or filter criteria."""
    segment = db.query(Segment).filter(Segment.id == id).first()
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")

    if seg_in.name is not None:
        # Check duplicate name (excluding self)
        dup = db.query(Segment).filter(Segment.name == seg_in.name, Segment.id != id).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Segment name already exists")
        segment.name = seg_in.name

    if seg_in.description is not None:
        segment.description = seg_in.description
    if seg_in.is_dynamic is not None:
        segment.is_dynamic = seg_in.is_dynamic

    if seg_in.filter_criteria is not None:
        segment.filter_criteria = json.dumps(seg_in.filter_criteria)
        # Re-evaluate estimated size
        query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
        query = build_segment_filter_query(seg_in.filter_criteria, query)
        segment.estimated_size = query.count()
        segment.last_refreshed = datetime.datetime.utcnow()

    db.commit()
    db.refresh(segment)

    return SegmentResponse(
        id=segment.id,
        name=segment.name,
        description=segment.description,
        filter_criteria=json.loads(segment.filter_criteria),
        is_dynamic=segment.is_dynamic,
        estimated_size=segment.estimated_size,
        last_refreshed=segment.last_refreshed,
        created_at=segment.created_at
    )


@router.delete("/segments/{id}", status_code=status.HTTP_200_OK)
def delete_segment(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Delete a segment. Admin-only. Fails if segment is linked to active campaigns."""
    segment = db.query(Segment).filter(Segment.id == id).first()
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")

    # Check if segment is attached to any non-deleted campaigns
    from app.models import Campaign
    linked = db.query(Campaign).filter(
        Campaign.segment_id == id,
        Campaign.is_deleted == False,
        Campaign.status.in_(["draft", "scheduled", "active"])
    ).count()
    if linked > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete segment: {linked} active campaign(s) reference this segment."
        )

    db.delete(segment)
    db.commit()
    return {"message": "Segment deleted successfully", "id": id}


@router.get("/audiences/import/template")
def download_csv_template():
    """Generates and returns a standard CSV import template with sample custom metadata columns."""
    import io
    from fastapi.responses import StreamingResponse
    output = io.StringIO()
    writer = csv.writer(output)
    # Headers
    writer.writerow([
        "first_name", "last_name", "email", "phone", "preferred_languages", 
        "occupation", "age", "gender", "state", "district", "city", 
        "preferred_channels", "organization", "department", "designation",
        "Crop Type", "Aadhaar Status" # Sample custom fields
    ])
    # Sample rows
    writer.writerow([
        "Rajesh", "Kumar", "rajesh.kumar@agri.in", "9900112233", "Hindi,Punjabi", 
        "Farmer", "45", "Male", "Punjab", "Ludhiana", "Ludhiana", "sms,whatsapp",
        "Punjab Farmers Association", "Agriculture", "Regional Advisor", "Wheat", "Verified"
    ])
    writer.writerow([
        "Sita", "Devi", "sita@health.org", "9900112244", "Hindi,English", 
        "Healthcare Worker", "38", "Female", "Uttar Pradesh", "Varanasi", "Varanasi", "email,whatsapp",
        "Varanasi Health Clinic", "Pediatrics", "Senior Nurse", "", "Not Verified"
    ])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_audience.csv"}
    )


def calculate_segment_breakdowns(query) -> Dict[str, Any]:
    """Calculates Language, Occupation, State, and Preferred Channel distribution for the matched segment."""
    all_matched = query.all()
    lang_breakdown = {}
    occ_breakdown = {}
    state_breakdown = {}
    channel_breakdown = {}
    for aud in all_matched:
        # Languages
        try:
            langs = json.loads(aud.preferred_languages) if aud.preferred_languages else []
        except Exception:
            langs = []
        for l in langs:
            lang_breakdown[l] = lang_breakdown.get(l, 0) + 1
            
        # Occupation
        if aud.occupation:
            occ_breakdown[aud.occupation] = occ_breakdown.get(aud.occupation, 0) + 1
        
        # State
        if aud.state:
            state_breakdown[aud.state] = state_breakdown.get(aud.state, 0) + 1

        # Preferred Channels
        try:
            chans = json.loads(aud.preferred_channels) if aud.preferred_channels else []
            if isinstance(chans, str):
                chans = [chans]
        except Exception:
            chans = []
        if not chans:
            chans = ["unspecified"]
        for ch in chans:
            ch_lower = str(ch).lower().strip()
            channel_breakdown[ch_lower] = channel_breakdown.get(ch_lower, 0) + 1

    return {
        "languages": lang_breakdown,
        "occupations": occ_breakdown,
        "states": state_breakdown,
        "channels": channel_breakdown
    }



@router.get("/segments/{id}/preview", response_model=Dict[str, Any])
def preview_segment(
    id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    segment = db.query(Segment).filter(Segment.id == id).first()
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
        
    criteria = json.loads(segment.filter_criteria)
    
    # Evaluate live size
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    query = build_segment_filter_query(criteria, query)
    
    total = query.count()
    preview_records = query.limit(limit).all()
    breakdowns = calculate_segment_breakdowns(query)
    
    # Save the updated count in the background for cache sync
    segment.estimated_size = total
    segment.last_refreshed = datetime.datetime.utcnow()
    db.commit()
    
    return {
        "segment_id": segment.id,
        "segment_name": segment.name,
        "estimated_size": total,
        "preview": [format_audience_response(r) for r in preview_records],
        "breakdowns": breakdowns
    }

@router.get("/segments/{id}", response_model=SegmentResponse)
def get_segment(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Get a single segment by ID."""
    segment = db.query(Segment).filter(Segment.id == id).first()
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return SegmentResponse(
        id=segment.id,
        name=segment.name,
        description=segment.description,
        filter_criteria=json.loads(segment.filter_criteria),
        is_dynamic=segment.is_dynamic,
        estimated_size=segment.estimated_size,
        last_refreshed=segment.last_refreshed,
        created_at=segment.created_at
    )


# Dynamic preview before saving
@router.post("/segments/evaluate", response_model=Dict[str, Any])
def evaluate_segment_criteria(
    criteria: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    # Evaluate count of matching audience members based on criteria
    query = db.query(Audience).filter(Audience.is_deleted == False, Audience.is_active == True)
    query = build_segment_filter_query(criteria, query)
    total = query.count()
    preview_records = query.limit(10).all()
    breakdowns = calculate_segment_breakdowns(query)
    
    return {
        "estimated_size": total,
        "preview": [format_audience_response(r) for r in preview_records],
        "breakdowns": breakdowns
    }


@router.post("/audiences/{id}/auto-tag", response_model=Dict[str, Any])
def run_auto_tag_for_audience(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Run LLM classification to auto-tag an audience member based on demographics and feedback comments."""
    from app.services.ai_service import auto_tag_audience
    import json
    
    aud = db.query(Audience).filter(Audience.id == id, Audience.is_deleted == False).first()
    if not aud:
        raise HTTPException(status_code=404, detail="Audience member not found")
        
    tags = auto_tag_audience(db, id)
    
    try:
        custom = json.loads(aud.custom_fields) if aud.custom_fields else {}
    except Exception:
        custom = {}
        
    custom["ai_tags"] = tags
    aud.custom_fields = json.dumps(custom)
    db.commit()
    db.refresh(aud)
    
    return {"message": "Audience auto-tagged successfully", "tags": tags}


@router.post("/audiences/auto-tag-all", response_model=Dict[str, Any])
def run_auto_tag_all_audiences(
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    """Run LLM auto-tagging for all active audience members in a single click."""
    from app.services.ai_service import auto_tag_audience
    import json
    
    active_auds = db.query(Audience).filter(Audience.is_deleted == False).all()
    count = 0
    for aud in active_auds:
        tags = auto_tag_audience(db, aud.id)
        try:
            custom = json.loads(aud.custom_fields) if aud.custom_fields else {}
        except Exception:
            custom = {}
        custom["ai_tags"] = tags
        aud.custom_fields = json.dumps(custom)
        count += 1
        
    db.commit()
    return {"message": f"Successfully run AI classification for {count} profiles."}

