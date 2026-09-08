import sqlite3
from typing import Optional
from fastapi import APIRouter, HTTPException

from ..database import db
from ..schemas import PaymentCreate
from ..tenancies import validate_payment

router = APIRouter()


def rows(result):
    return [dict(row) for row in result.fetchall()]


@router.get("/api/payments")
def list_payments(property_id: Optional[int] = None, rental_month: Optional[str] = None):
    filters, params = [], []
    if property_id is not None:
        filters.append("rp.property_id = ?")
        params.append(property_id)
    if rental_month:
        filters.append("rp.rental_month = ?")
        params.append(rental_month)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    with db() as connection:
        return rows(connection.execute(
            """SELECT rp.*, p.name AS property_name, p.property_type, COALESCE(n.name, rp.tenant_snapshot) AS tenant_name, t.business_name, g.name AS group_name
               FROM rent_payments rp JOIN properties p ON p.id = rp.property_id
               LEFT JOIN tenancies t ON t.id=rp.tenancy_id LEFT JOIN tenants n ON n.id=t.tenant_id
               LEFT JOIN property_groups g ON g.id = p.group_id""" + where + " ORDER BY rp.paid_on DESC, rp.id DESC",
            params,
        ))


@router.post("/api/payments", status_code=201)
def create_payment(payload: PaymentCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM properties WHERE id = ?", (payload.property_id,)).fetchone():
            raise HTTPException(404, "Property not found")
        validate_payment(connection, data)
        data['paid_on'] = data['paid_on'] or ''
        data['tenant_snapshot'] = connection.execute("SELECT tenant_name FROM properties WHERE id=?", (payload.property_id,)).fetchone()[0]
        cursor = connection.execute(
            """INSERT INTO rent_payments(property_id, rental_month, amount, paid_on,
               payment_method, reference, notes, tenancy_id, tenant_snapshot) VALUES (:property_id, :rental_month, :amount,
               :paid_on, :payment_method, :reference, :notes, :tenancy_id, :tenant_snapshot)""", data
        )
        return {"id": cursor.lastrowid, **data}


@router.delete("/api/payments/{payment_id}", status_code=204)
def delete_payment(payment_id: int):
    with db() as connection:
        if not connection.execute("DELETE FROM rent_payments WHERE id = ?", (payment_id,)).rowcount:
            raise HTTPException(404, "Payment not found")


@router.put("/api/payments/{record_id}")
def edit_payment(record_id: int, payload: PaymentCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM rent_payments WHERE id=?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Record not found")
        if 'property_id' in data:
            prop = connection.execute("SELECT * FROM properties WHERE id=?", (data['property_id'],)).fetchone()
            if not prop:
                raise HTTPException(400, "Property not found")
        validate_payment(connection, data)
        data['paid_on'] = data['paid_on'] or ''
        assignments = ','.join(f'{field}=?' for field in data)
        connection.execute(f"UPDATE rent_payments SET {assignments} WHERE id=?", (*data.values(), record_id))
    return {"id": record_id, **data}
