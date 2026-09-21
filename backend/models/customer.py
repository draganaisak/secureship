import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    phone_number: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[str] = mapped_column(String, nullable=False)
