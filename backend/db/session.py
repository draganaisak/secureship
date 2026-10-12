import asyncio
import os

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/secureship"
)

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session():
    async with SessionLocal() as session:
        yield session


async def init_db(retries: int = 10, delay: float = 1.0) -> None:
    import models  # noqa: F401  register all tables on Base.metadata

    for attempt in range(retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # create_all never ALTERs existing tables; backfill updated_at
                # idempotently for volumes created before Week 4.
                for table in ("customers", "shipments", "packages"):
                    await conn.execute(
                        text(
                            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "
                            "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
                        )
                    )
            return
        except (OperationalError, OSError):
            if attempt == retries - 1:
                raise
            await asyncio.sleep(delay)
