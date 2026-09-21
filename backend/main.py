import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_session, init_db
from llm.ollama_client import chat
from models import ChatSession


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SecureShip API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "You are SecureShip's shipment-support assistant. "
    "Be concise, friendly, and professional. "
    "Help customers with questions about parcel shipments and deliveries."
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChatRequest(BaseModel):
    message: str
    session_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: uuid.UUID


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse, operation_id="sendChat")
async def chat_endpoint(req: ChatRequest, db: AsyncSession = Depends(get_session)):
    session = None
    if req.session_id is not None:
        session = await db.get(ChatSession, req.session_id)
    if session is None:
        session = ChatSession()
        db.add(session)

    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": req.message, "timestamp": _utcnow_iso()}
    )

    ollama_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    ollama_messages += [{"role": m["role"], "content": m["content"]} for m in transcript]

    reply = await chat(ollama_messages)

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": _utcnow_iso()}
    )
    session.transcript = transcript

    await db.commit()
    return ChatResponse(reply=reply, session_id=session.id)
