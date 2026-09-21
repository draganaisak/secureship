import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String, nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    declared_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
