import asyncio
import random
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from faker import Faker
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db.session import DATABASE_URL
from models import Customer, Package, Shipment

fake = Faker()

NUM_CUSTOMERS = 25

# Weighted so most shipments are in_transit/delivered, a few exceptions - gives
# the chat something interesting to talk about later (spec 4.4).
STATUS_WEIGHTS = {
    "in_transit": 0.40,
    "delivered": 0.35,
    "out_for_delivery": 0.10,
    "label_created": 0.10,
    "exception": 0.05,
}

PACKAGE_DESCRIPTIONS = [
    "Books", "Clothing", "Electronics", "Kitchenware", "Toys",
    "Documents", "Cosmetics", "Shoes", "Home decor", "Sports gear",
    "Phone accessories", "Board game",
]


def _phone() -> str:
    return f"+1{random.randint(2000000000, 9999999999)}"


def _tracking() -> str:
    return "MX" + "".join(str(random.randint(0, 9)) for _ in range(12))


def _status() -> str:
    r = random.random()
    cumulative = 0.0
    for status, weight in STATUS_WEIGHTS.items():
        cumulative += weight
        if r <= cumulative:
            return status
    return "in_transit"


def _money(lo: float, hi: float) -> Decimal:
    return Decimal(random.uniform(lo, hi)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def seed() -> None:
    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # Idempotent: wipe shipment data (FK-safe order), leave chat_sessions alone.
        await db.execute(delete(Package))
        await db.execute(delete(Shipment))
        await db.execute(delete(Customer))
        await db.commit()

        customers = [
            Customer(
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                phone_number=_phone(),
                address=fake.address().replace("\n", ", "),
            )
            for _ in range(NUM_CUSTOMERS)
        ]
        db.add_all(customers)
        await db.flush()

        now = datetime.now(timezone.utc)
        shipments = [
            Shipment(
                customer_id=random.choice(customers).id,
                tracking_number=_tracking(),
                status=_status(),
                carrier="MockExpress",
                origin=f"{fake.city()}, {fake.state_abbr()}",
                destination=f"{fake.city()}, {fake.state_abbr()}",
                estimated_delivery=(now + timedelta(days=random.randint(-5, 10))).date(),
                last_update=now - timedelta(hours=random.randint(1, 240)),
            )
            for _ in range(random.randint(40, 60))
        ]
        db.add_all(shipments)
        await db.flush()

        num_packages = 0
        for shipment in shipments:
            for _ in range(random.randint(1, 3)):
                db.add(
                    Package(
                        shipment_id=shipment.id,
                        description=random.choice(PACKAGE_DESCRIPTIONS),
                        weight_kg=_money(0.1, 30.0),
                        declared_value=_money(5.0, 2000.0),
                    )
                )
                num_packages += 1

        await db.commit()

    await engine.dispose()
    print(
        f"Seeded {len(customers)} customers, "
        f"{len(shipments)} shipments, {num_packages} packages."
    )


if __name__ == "__main__":
    asyncio.run(seed())
