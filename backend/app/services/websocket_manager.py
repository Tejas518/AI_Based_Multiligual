"""
WebSocket Connection Manager — Manages active WebSocket connections
for broadcasting real-time emergency bulletins.
"""
import logging
import json
from fastapi import WebSocket

logger = logging.getLogger("commai.websocket")


class ConnectionManager:
    """Manages WebSocket connections for live bulletin broadcasts."""

    def __init__(self):
        self.active_connections: list[dict] = []

    async def connect(self, websocket: WebSocket, user_id: str = None, state: str = None, role: str = None, preferred_languages: list = None):
        await websocket.accept()
        self.active_connections.append({
            "websocket": websocket,
            "user_id": user_id,
            "state": state,
            "role": role,
            "preferred_languages": preferred_languages or []
        })
        logger.info(f"[WS] Client connected: user_id={user_id}, state={state}, role={role}, preferred_languages={preferred_languages}. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections = [
            connection
            for connection in self.active_connections
            if connection["websocket"] != websocket
        ]
        logger.info(f"[WS] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast a JSON message, optionally scoped to a target state, translated to preferred language."""
        target_state = message.get("target_state")
        disconnected = []
        
        # Cache of translations created during this broadcast to avoid duplicate API calls
        translation_cache = {}

        for connection in self.active_connections:
            # Operators (admin/campaign_manager) always receive all bulletins.
            # State-scoped emergencies are filtered only for audience sessions.
            if target_state and connection["role"] not in ("admin", "campaign_manager"):
                if connection["role"] != "audience" or connection["state"] != target_state:
                    continue

            # Determine connection's target language
            pref_langs = connection.get("preferred_languages") or []
            target_lang = "English"
            if pref_langs and isinstance(pref_langs, list) and len(pref_langs) > 0:
                target_lang = pref_langs[0].strip()

            # If client preferred language is English or not set, send original payload
            if not target_lang or target_lang.lower() == "english":
                payload = json.dumps(message)
            else:
                if target_lang not in translation_cache:
                    try:
                        from app.services.translation_service import translate_text
                        translated_message = dict(message)
                        # Translate fields that contain citizen-facing notification text
                        for key in ["title", "description", "message", "content", "objective"]:
                            if key in translated_message and isinstance(translated_message[key], str) and translated_message[key].strip():
                                # Translate from English to target language
                                translated_message[key] = translate_text(translated_message[key], target_lang, "English")
                        translation_cache[target_lang] = json.dumps(translated_message)
                    except Exception as e:
                        logger.error(f"[WS-TRANSLATE] Failed to translate broadcast message to {target_lang}: {e}")
                        translation_cache[target_lang] = json.dumps(message)

                payload = translation_cache[target_lang]

            try:
                await connection["websocket"].send_text(payload)
            except Exception:
                disconnected.append(connection["websocket"])

        # Clean up dead connections
        for conn in disconnected:
            self.disconnect(conn)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# Global singleton instance
bulletin_manager = ConnectionManager()
