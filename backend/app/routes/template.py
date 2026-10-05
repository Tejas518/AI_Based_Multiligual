import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import Template
from app.schemas import TemplateCreate, TemplateUpdate, TemplateResponse
from app.auth import require_admin, require_manager_or_higher
from app.config import settings

router = APIRouter(prefix="/templates", tags=["Template Library"])

@router.get("", response_model=List[TemplateResponse])
def list_templates(
    category: Optional[str] = None,
    channel: Optional[str] = None,
    default_language: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    query = db.query(Template).filter(Template.is_deleted == False)
    # Hide shadow (adhoc) templates from normal template listings
    query = query.filter(~Template.title.startswith("Adhoc Template:"))
    
    if category:
        query = query.filter(Template.category == category)
    if channel:
        query = query.filter(Template.channel == channel)
    if default_language:
        query = query.filter(Template.default_language == default_language)
        
    return query.order_by(Template.created_at.desc()).all()

@router.get("/{id}", response_model=TemplateResponse)
def get_template(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    tpl = db.query(Template).filter(Template.id == id, Template.is_deleted == False).first()
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return tpl

@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    tpl_in: TemplateCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    if tpl_in.category not in settings.CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Category '{tpl_in.category}' is invalid. Supported: {settings.CATEGORIES}"
        )
        
    if tpl_in.channel not in settings.CHANNELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Channel '{tpl_in.channel}' is invalid. Supported: {settings.CHANNELS}"
        )
        
    if tpl_in.default_language not in settings.LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Language '{tpl_in.default_language}' is unsupported."
        )

    tpl = Template(
        title=tpl_in.title,
        description=tpl_in.description,
        category=tpl_in.category,
        channel=tpl_in.channel,
        default_language=tpl_in.default_language,
        subject_template=tpl_in.subject_template,
        body_template=tpl_in.body_template,
        translations=tpl_in.translations or "{}",
        is_ai_generated=False,
        version=1,
        created_by=current_user.id
    )
    
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl

@router.put("/{id}", response_model=TemplateResponse)
def update_template(
    id: str,
    tpl_in: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    tpl = db.query(Template).filter(Template.id == id, Template.is_deleted == False).first()
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
    # Apply updates if provided
    updated = False
    if tpl_in.title is not None:
        tpl.title = tpl_in.title
        updated = True
    if tpl_in.description is not None:
        tpl.description = tpl_in.description
        updated = True
    if tpl_in.category is not None:
        if tpl_in.category not in settings.CATEGORIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid template category")
        tpl.category = tpl_in.category
        updated = True
    if tpl_in.channel is not None:
        if tpl_in.channel not in settings.CHANNELS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid communication channel")
        tpl.channel = tpl_in.channel
        updated = True
    if tpl_in.default_language is not None:
        if tpl_in.default_language not in settings.LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported language preference")
        tpl.default_language = tpl_in.default_language
        updated = True
    if tpl_in.subject_template is not None:
        tpl.subject_template = tpl_in.subject_template
        updated = True
    if tpl_in.body_template is not None:
        tpl.body_template = tpl_in.body_template
        updated = True
    if tpl_in.translations is not None:
        tpl.translations = tpl_in.translations
        updated = True
        
    if updated:
        tpl.version += 1
        tpl.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(tpl)
        
    return tpl

@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_template(
    id: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    tpl = db.query(Template).filter(Template.id == id, Template.is_deleted == False).first()
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
    tpl.is_deleted = True
    tpl.deleted_at = datetime.datetime.utcnow()
    db.commit()
    return {"message": "Template soft deleted successfully", "id": id}


def translate_template_all_languages(template_id: str):
    from app.database import SessionLocal
    from app.models import Template
    from app.services.translation_service import translate_text
    from app.config import settings
    import json
    
    db = SessionLocal()
    try:
        tpl = db.query(Template).filter(Template.id == template_id).first()
        if not tpl or not settings.GROQ_API_KEY:
            return
            
        try:
            translations_dict = json.loads(tpl.translations) if tpl.translations else {}
        except Exception:
            translations_dict = {}
            
        for lang in settings.LANGUAGES:
            # Skip default template language
            if lang.lower() == tpl.default_language.lower():
                continue
                
            # If already translated and not empty, skip to save API calls
            if lang in translations_dict and translations_dict[lang].get("body"):
                continue
                
            # Translate subject and body
            translated_subject = ""
            if tpl.subject_template:
                translated_subject = translate_text(tpl.subject_template, lang, tpl.default_language)
            translated_body = translate_text(tpl.body_template, lang, tpl.default_language)
            
            translations_dict[lang] = {
                "subject": translated_subject,
                "body": translated_body
            }
            
        tpl.translations = json.dumps(translations_dict)
        db.commit()
    except Exception as e:
        print(f"[TRANSLATE-ALL] Error translating template {template_id}: {e}")
    finally:
        db.close()

@router.post("/{id}/translate-all")
def generate_all_translations(
    id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(require_manager_or_higher)
):
    tpl = db.query(Template).filter(Template.id == id, Template.is_deleted == False).first()
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
    background_tasks.add_task(translate_template_all_languages, tpl.id)
    return {"message": "Translation task started in the background"}
