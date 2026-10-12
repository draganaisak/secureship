import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from db.session import get_session
from models import Customer, Package, Shipment

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


class ShipmentStatus(str, Enum):
    label_created = "label_created"
    in_transit = "in_transit"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    exception = "exception"


class CustomerCreate(BaseModel):
    first_name: str
    last_name: str
    phone_number: str
    address: str


class CustomerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone_number: str | None = None
    address: str | None = None


class CustomerRead(CustomerCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ShipmentCreate(BaseModel):
    customer_id: uuid.UUID
    tracking_number: str
    status: ShipmentStatus
    carrier: str
    origin: str
    destination: str
    estimated_delivery: date
    last_update: datetime


class ShipmentUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    tracking_number: str | None = None
    status: ShipmentStatus | None = None
    carrier: str | None = None
    origin: str | None = None
    destination: str | None = None
    estimated_delivery: date | None = None
    last_update: datetime | None = None


class ShipmentRead(ShipmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class PackageCreate(BaseModel):
    shipment_id: uuid.UUID
    description: str
    weight_kg: Decimal
    declared_value: Decimal


class PackageUpdate(BaseModel):
    shipment_id: uuid.UUID | None = None
    description: str | None = None
    weight_kg: Decimal | None = None
    declared_value: Decimal | None = None


class PackageRead(PackageCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


async def _get_or_404(db: AsyncSession, model, obj_id: uuid.UUID):
    obj = await db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="not found")
    return obj


async def _commit(db: AsyncSession) -> None:
    # Turn a constraint violation (e.g. a non-existent customer_id/shipment_id)
    # into a 400 instead of a leaked 500.
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="invalid reference or constraint violation")


# --- Customers ---


@router.get("/customers", response_model=list[CustomerRead], operation_id="listCustomers")
async def list_customers(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(Customer).order_by(Customer.updated_at.desc()))).scalars().all()
    return list(rows)


@router.post("/customers", response_model=CustomerRead, operation_id="createCustomer")
async def create_customer(body: CustomerCreate, db: AsyncSession = Depends(get_session)):
    obj = Customer(**body.model_dump())
    db.add(obj)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.get("/customers/{customer_id}", response_model=CustomerRead, operation_id="getCustomer")
async def get_customer(customer_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    return await _get_or_404(db, Customer, customer_id)


@router.put("/customers/{customer_id}", response_model=CustomerRead, operation_id="updateCustomer")
async def update_customer(
    customer_id: uuid.UUID, body: CustomerUpdate, db: AsyncSession = Depends(get_session)
):
    obj = await _get_or_404(db, Customer, customer_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.delete("/customers/{customer_id}", status_code=204, operation_id="deleteCustomer")
async def delete_customer(customer_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    obj = await _get_or_404(db, Customer, customer_id)
    await db.delete(obj)
    await _commit(db)


# --- Shipments ---


@router.get("/shipments", response_model=list[ShipmentRead], operation_id="listShipments")
async def list_shipments(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(Shipment).order_by(Shipment.updated_at.desc()))).scalars().all()
    return list(rows)


@router.post("/shipments", response_model=ShipmentRead, operation_id="createShipment")
async def create_shipment(body: ShipmentCreate, db: AsyncSession = Depends(get_session)):
    obj = Shipment(**body.model_dump())
    db.add(obj)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.get("/shipments/{shipment_id}", response_model=ShipmentRead, operation_id="getShipment")
async def get_shipment(shipment_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    return await _get_or_404(db, Shipment, shipment_id)


@router.put("/shipments/{shipment_id}", response_model=ShipmentRead, operation_id="updateShipment")
async def update_shipment(
    shipment_id: uuid.UUID, body: ShipmentUpdate, db: AsyncSession = Depends(get_session)
):
    obj = await _get_or_404(db, Shipment, shipment_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.delete("/shipments/{shipment_id}", status_code=204, operation_id="deleteShipment")
async def delete_shipment(shipment_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    obj = await _get_or_404(db, Shipment, shipment_id)
    await db.delete(obj)
    await _commit(db)


# --- Packages ---


@router.get("/packages", response_model=list[PackageRead], operation_id="listPackages")
async def list_packages(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(Package).order_by(Package.updated_at.desc()))).scalars().all()
    return list(rows)


@router.post("/packages", response_model=PackageRead, operation_id="createPackage")
async def create_package(body: PackageCreate, db: AsyncSession = Depends(get_session)):
    obj = Package(**body.model_dump())
    db.add(obj)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.get("/packages/{package_id}", response_model=PackageRead, operation_id="getPackage")
async def get_package(package_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    return await _get_or_404(db, Package, package_id)


@router.put("/packages/{package_id}", response_model=PackageRead, operation_id="updatePackage")
async def update_package(
    package_id: uuid.UUID, body: PackageUpdate, db: AsyncSession = Depends(get_session)
):
    obj = await _get_or_404(db, Package, package_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await _commit(db)
    await db.refresh(obj)
    return obj


@router.delete("/packages/{package_id}", status_code=204, operation_id="deletePackage")
async def delete_package(package_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    obj = await _get_or_404(db, Package, package_id)
    await db.delete(obj)
    await _commit(db)
