from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ChatSession, Shipment
from verification import STATE_VERIFIED

SHIPMENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_shipments",
            "description": (
                "List the shipments belonging to the currently verified customer. "
                "Takes no arguments; results are always limited to this customer."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    }
]


def _serialize(shipment: Shipment) -> dict:
    return {
        "tracking_number": shipment.tracking_number,
        "status": shipment.status,
        "carrier": shipment.carrier,
        "origin": shipment.origin,
        "destination": shipment.destination,
        "estimated_delivery": shipment.estimated_delivery.isoformat(),
        "last_update": shipment.last_update.isoformat(),
    }


async def run_tool(
    name: str, arguments: dict, db: AsyncSession, session: ChatSession
) -> dict:
    if session.state != STATE_VERIFIED or session.customer_id is None:
        print(f"[tool] refused {name}: session not verified", flush=True)
        return {"error": "not authorized"}

    if name == "lookup_shipments":
        rows = (
            (
                await db.execute(
                    select(Shipment).where(
                        Shipment.customer_id == session.customer_id
                    )
                )
            )
            .scalars()
            .all()
        )
        print(
            f"[tool] lookup_shipments customer={session.customer_id} "
            f"-> {len(rows)} shipments",
            flush=True,
        )
        return {"shipments": [_serialize(s) for s in rows]}

    print(f"[tool] unknown tool: {name}", flush=True)
    return {"error": "unknown tool"}
