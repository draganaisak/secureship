import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


def _utcnow():
    return datetime.now(timezone.utc)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    state: Mapped[str] = mapped_column(String, default="anonymous", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transcript: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
