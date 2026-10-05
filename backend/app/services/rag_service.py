"""
RAG (Retrieval-Augmented Generation) Service — Lightweight document retrieval
using TF-IDF + cosine similarity over platform knowledge, with Groq for response.
"""
import logging
import re
from typing import List, Tuple

logger = logging.getLogger("commai.rag_service")

# We use a simple TF-IDF approach — no external vector DB needed
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("[RAG] scikit-learn not installed. RAG will use fallback keyword matching.")

from app.services.ai_service import _call_groq, PLATFORM_KNOWLEDGE


class RAGKnowledgeBase:
    """
    In-memory knowledge base that indexes text documents using TF-IDF
    and retrieves the most relevant ones for a given query.
    """

    def __init__(self):
        self.documents: List[str] = []
        self.metadata: List[dict] = []
        self.vectorizer = TfidfVectorizer(stop_words='english', max_features=10000) if SKLEARN_AVAILABLE else None
        self.tfidf_matrix = None
        self._is_fitted = False

    def add_document(self, text: str, meta: dict = None):
        """Add a document to the knowledge base."""
        if text and text.strip():
            self.documents.append(text.strip())
            self.metadata.append(meta or {})
            self._is_fitted = False  # Mark for re-indexing

    def build_index(self):
        """Build/rebuild the TF-IDF index."""
        if not self.documents:
            return
        if SKLEARN_AVAILABLE and self.vectorizer:
            self.tfidf_matrix = self.vectorizer.fit_transform(self.documents)
            self._is_fitted = True
        else:
            self._is_fitted = True

    def retrieve(self, query: str, top_k: int = 7) -> List[Tuple[str, dict, float]]:
        """
        Retrieve the top-k most relevant documents for the query.
        Returns list of (document_text, metadata, similarity_score).
        """
        if not self.documents:
            return []

        if not self._is_fitted:
            self.build_index()

        if SKLEARN_AVAILABLE and self.tfidf_matrix is not None:
            query_vec = self.vectorizer.transform([query])
            similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
            top_indices = similarities.argsort()[-top_k:][::-1]
            results = []
            for idx in top_indices:
                if similarities[idx] > 0.001:  # Permissive threshold
                    results.append((self.documents[idx], self.metadata[idx], float(similarities[idx])))
            return results
        else:
            # Fallback: simple keyword matching
            query_words = set(re.findall(r'\w+', query.lower()))
            scored = []
            for i, doc in enumerate(self.documents):
                doc_words = set(re.findall(r'\w+', doc.lower()))
                overlap = len(query_words & doc_words)
                if overlap > 0:
                    score = overlap / max(len(query_words), 1)
                    scored.append((doc, self.metadata[i], score))
            scored.sort(key=lambda x: x[2], reverse=True)
            return scored[:top_k]


# Global knowledge base singleton
_knowledge_base = RAGKnowledgeBase()


def get_knowledge_base() -> RAGKnowledgeBase:
    return _knowledge_base


def populate_knowledge_base(db):
    """
    Populate the RAG knowledge base from database content:
    campaigns, templates, platform reference modules, and platform FAQs.
    """
    from app.models import Campaign, Template

    kb = get_knowledge_base()
    kb.documents.clear()
    kb.metadata.clear()

    # 1. Index full platform knowledge reference sections
    platform_sections = PLATFORM_KNOWLEDGE.strip().split("\n\n--- ")
    for idx, section in enumerate(platform_sections):
        kb.add_document(
            f"Platform Documentation Section {idx+1}:\n{section.strip()}",
            {"type": "platform_doc", "section": idx+1}
        )

    # 2. Index campaign descriptions
    if db:
        try:
            campaigns = db.query(Campaign).filter(Campaign.is_deleted == False).all()
            for c in campaigns:
                text = f"Campaign: {c.title}. Category: {c.category}. Status: {c.status}. Channels: {c.channels}. Description: {c.description or ''}. Objective: {c.objective or ''}"
                kb.add_document(text, {"type": "campaign", "id": c.id, "title": c.title})
        except Exception as e:
            logger.warning(f"[RAG] Could not query campaigns: {e}")

    # 3. Index template bodies
    if db:
        try:
            templates = db.query(Template).filter(Template.is_deleted == False).all()
            for t in templates:
                text = f"Template: {t.title}. Channel: {t.channel}. Category: {t.category}. Content: {t.body_template}"
                kb.add_document(text, {"type": "template", "id": t.id, "title": t.title})
        except Exception as e:
            logger.warning(f"[RAG] Could not query templates: {e}")

    # 4. Add comprehensive platform Q&A entries
    faqs = [
        "Q: How to contact a campaign manager or operator?\n"
        "A: Citizens can contact a campaign manager directly through two main methods on CommAI:\n"
        "1. Emergency Support Request: Go to 'Campaign Feedback' in your sidebar -> select the '🚨 Emergency Support' tab -> fill out the 'Submit Urgent Request' form (Subject, Urgency Priority: Normal/Urgent/Critical, Message) -> click 'Send Emergency Message'. Campaign managers monitor these requests in their Emergency Inbox under 'Emergency Operations'.\n"
        "2. Support Query Ticket: Use the floating 'CommAI Assistant' chatbot widget at the bottom right of your screen. If an answer isn't helpful, rate Thumbs Down 👎 to open the escalation form and submit a direct support ticket to campaign managers.",

        "Q: How do I submit an emergency or SOS report?\n"
        "A: Go to 'SOS Reports' in your sidebar under 'Emergency Operations'. Fill out the incident type (fire, flood, medical, etc.), describe the hazard, optionally share your GPS coordinates and a photo, and submit. Operators will see it immediately in their SOS Reports dashboard.",

        "Q: How do I track my emergency support request or campaign manager replies?\n"
        "A: Go to 'Campaign Feedback' in your sidebar, select the '🚨 Emergency Support' tab, and check the 'My Support Requests' panel on the right. You will see the status (Pending, Acknowledged, Resolved) and official replies from campaign managers.",

        "Q: What is CommAI and what does it do?\n"
        "A: CommAI is an AI-powered mass communication platform for government and public sector organizations to broadcast campaigns, emergency alerts, and announcements across Email, SMS, WhatsApp, Push Notifications, Web Broadcasts, Telegram Bot, and Live Bulletins.",

        "Q: What channels does CommAI support?\n"
        "A: CommAI supports the following channels: Email, SMS, WhatsApp, Telegram, Push Notifications, and Web Broadcasts.",

        "Q: What user roles exist in CommAI?\n"
        "A: CommAI has 3 user roles:\n"
        "1. Audience/Citizen: Views personal dashboard portal, receives campaign broadcasts, submits SOS incident reports, gives campaign feedback, uses Citizen RAG Chat, and views live bulletins.\n"
        "2. Campaign Manager: Creates campaigns, templates, poster graphics, manages audience segments, reviews feedback analytics, responds to emergency inbox requests, monitors AI Fact Shield rumors, collaborates via Operator Staff Chat.\n"
        "3. Admin: Full governance including campaign manager directory, audit logs, and maker-checker campaign approvals.",

        "Q: How do citizens receive emergency alerts and updates?\n"
        "A: Emergency notifications are sent via SMS, WhatsApp, Email, Push Notifications, and are broadcast live on the 'Live Bulletins' page in the citizen sidebar.",

        "Q: How do citizens give feedback on campaigns?\n"
        "A: Go to 'Campaign Feedback' in the sidebar under 'Audience & Insights' -> click the '📬 Received Campaigns' tab -> find the campaign and click 'Give Feedback' to submit a 1 to 5 star rating and comments.",

        "Q: What multi-language features are supported?\n"
        "A: CommAI supports 23 languages (the 22 Official Scheduled Languages of India + English: Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, English, and more) with instant AI translation.",

        "Q: How does audience segmentation work for campaign managers?\n"
        "A: Campaign managers can segment citizens by location (state, district, city), age group, occupation (farmers, students, healthcare workers), and language preferences using structured filters or AI natural language queries in the 'Audience & Segments' page under 'Audience & Insights'.",

        "Q: How do campaign approvals work?\n"
        "A: Scheduled or high-priority campaigns undergo a maker-checker workflow where Admins review and approve campaigns in the 'Approvals Queue' under 'Campaigns & Broadcasts' before messages are dispatched.",

        "Q: How can citizens view platform bulletins?\n"
        "A: All official announcements and emergency warnings appear on the 'Live Bulletins' feed accessible directly from the sidebar under 'Core Dashboard'.",

        "Q: What is the AI Fact Shield?\n"
        "A: AI Fact Shield is a misinformation defense tool under 'Emergency Operations'. Operators submit rumor claims, the AI performs a vector database search to verify them, drafts a fact-check counter-campaign, and routes it to the maker-checker approvals queue.",

        "Q: What is the Poster Studio?\n"
        "A: Poster Studio is a visual campaign design tool under 'Campaigns & Broadcasts'. Operators can compose public warning flyers, banners, and infographics in any regional language using AI-generated layouts with dark or light poster themes."
    ]

    for faq in faqs:
        kb.add_document(faq, {"type": "faq"})

    kb.build_index()
    logger.info(f"[RAG] Knowledge base populated with {len(kb.documents)} documents.")


def generate_rag_response(query: str, db=None) -> str:
    """
    Generate a RAG-grounded response: retrieve relevant context, then
    send it to Groq for a contextual answer.
    """
    kb = get_knowledge_base()

    # Always ensure knowledge base is populated
    if not kb.documents or (db and len(kb.documents) <= 15):
        populate_knowledge_base(db)

    # Retrieve relevant context
    results = kb.retrieve(query, top_k=7)
    context_parts = []
    
    # Inject authoritative platform reference base
    context_parts.append(f"[AUTHORITATIVE PLATFORM KNOWLEDGE]\n{PLATFORM_KNOWLEDGE}")
    
    for doc, meta, score in results:
        context_parts.append(f"[{meta.get('type', 'info').upper()}] {doc}")

    context = "\n\n".join(context_parts)

    system_prompt = (
        "You are the official CommAI platform assistant helping citizens and operators.\n"
        "STRICT RELEVANCE GUARDRAIL: Only answer questions directly related to the CommAI platform, campaigns, emergency alerts, channels, or platform navigation. "
        "If the user asks ANY off-topic, unrelated, or general knowledge question (such as 'who is the prime minister of india', general trivia, recipes, general non-CommAI programming, math, sports, external news, personal advice, etc.), DO NOT answer it under any circumstances. "
        "Instead, respond with: 'Please ask me relevant questions related to CommAI, emergency alerts, campaign management, or platform navigation.'\n\n"
        "Answer relevant queries accurately, concisely (2-4 sentences max), and helpfully using "
        "the provided platform knowledge and retrieved context.\n\n"
        "If asked how to contact a campaign manager or operator, clearly explain the exact steps:\n"
        "1. Go to 'Campaign Feedback' in the sidebar -> click the '🚨 Emergency Support' tab -> fill out the 'Submit Urgent Request' form and click 'Send Emergency Message'.\n"
        "2. Or use the floating chatbot widget at bottom-right -> rate Thumbs Down 👎 on a response to submit a direct Support Query ticket.\n\n"
        "Be professional, clear, and reassuring.\n"
        "Do not make up non-existent UI elements.\n\n"
        f"--- CONTEXT DOCUMENTS ---\n{context}\n--- END CONTEXT DOCUMENTS ---"
    )

    response = _call_groq(system_prompt, query, temperature=0.3, max_tokens=450)
    if response and response.strip():
        return response.strip()
        
    return (
        "To contact a campaign manager, go to 'Campaign Feedback' in your sidebar, "
        "click the '🚨 Emergency Support' tab, and fill out the 'Submit Urgent Request' form. "
        "Alternatively, rate thumbs down on any assistant response in the floating chatbot widget to submit a support query ticket."
    )

