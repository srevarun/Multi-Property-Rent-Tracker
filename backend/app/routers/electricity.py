from fastapi import APIRouter, HTTPException

from ..database import db
from ..schemas import ElectricityCreate, ElectricityCollection

router = APIRouter()


def rows(result):
    return [dict(row) for row in result.fetchall()]


@router.get("/api/electricity")
def list_electricity():
    with db() as connection:
        return rows(connection.execute("""SELECT b.*, p.name AS property_name,
            (SELECT name FROM property_groups WHERE id=p.group_id) AS group_name
            FROM electricity_bills b JOIN properties p ON p.id=b.property_id ORDER BY b.paid_on DESC,b.id DESC"""))


@router.post("/api/electricity", status_code=201)
def create_electricity(payload: ElectricityCreate):
    if payload.collected > payload.amount:
        raise HTTPException(400, "Collected amount cannot exceed the bill")
    with db() as connection:
        prop = connection.execute("SELECT electricity_payer FROM properties WHERE id=?", (payload.property_id,)).fetchone()
        if not prop:
            raise HTTPException(404, "Property not found")
        if prop['electricity_payer'] != 'Owner':
            raise HTTPException(400, "This property is set to tenant-paid electricity")
        data = payload.model_dump(mode="json")
        cursor = connection.execute("""INSERT INTO electricity_bills(property_id,period,amount,paid_on,collected,reference,notes)
            VALUES (:property_id,:period,:amount,:paid_on,:collected,:reference,:notes)""", data)
        return {"id": cursor.lastrowid, **data}


@router.put("/api/electricity/{bill_id}/collection")
def update_collection(bill_id: int, payload: ElectricityCollection):
    with db() as connection:
        bill = connection.execute("SELECT * FROM electricity_bills WHERE id=?", (bill_id,)).fetchone()
        if not bill:
            raise HTTPException(404, "Bill not found")
        if payload.collected > bill['amount']:
            raise HTTPException(400, "Collected amount cannot exceed the bill")
        connection.execute("UPDATE electricity_bills SET collected=? WHERE id=?", (payload.collected, bill_id))
        return {**dict(bill), "collected": payload.collected}


@router.put("/api/electricity/{record_id}")
def edit_electricity(record_id: int, payload: ElectricityCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM electricity_bills WHERE id=?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Record not found")
        if 'property_id' in data:
            prop = connection.execute("SELECT * FROM properties WHERE id=?", (data['property_id'],)).fetchone()
            if not prop:
                raise HTTPException(400, "Property not found")
            if data['collected'] > data['amount']:
                raise HTTPException(400, "Collected amount cannot exceed the bill")
            if data['property_id'] != existing['property_id'] and prop['electricity_payer'] != 'Owner':
                raise HTTPException(400, "Choose an owner-paid electricity property")
        assignments = ','.join(f'{field}=?' for field in data)
        connection.execute(f"UPDATE electricity_bills SET {assignments} WHERE id=?", (*data.values(), record_id))
    return {"id": record_id, **data}


@router.delete("/api/electricity/{record_id}", status_code=204)
def delete_electricity(record_id: int):
    with db() as connection:
        if not connection.execute("DELETE FROM electricity_bills WHERE id=?", (record_id,)).rowcount:
            raise HTTPException(404, "Bill not found")
