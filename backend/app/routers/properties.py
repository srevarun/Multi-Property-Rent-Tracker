import sqlite3
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException

from ..database import db
from ..schemas import PropertyCreate, PropertyUpdate

router = APIRouter()


def rows(result):
    return [dict(row) for row in result.fetchall()]


@router.get("/api/properties")
def list_properties(group_id: Optional[int] = None, active: Optional[bool] = None):
    filters, params = [], []
    if group_id is not None:
        filters.append("p.group_id = ?")
        params.append(group_id)
    if active is not None:
        filters.append("p.active = ?")
        params.append(int(active))
    where = " WHERE " + " AND ".join(filters) if filters else ""
    with db() as connection:
        result = rows(connection.execute(
            """SELECT p.id, p.name, p.address, p.property_type, p.tenant_name, p.tenant_phone,
                      p.monthly_rent, p.advance_paid, p.due_day, p.active, p.group_id,
                      p.electricity_payer, g.name AS group_name,
                      (SELECT MAX(paid_on) FROM rent_payments rp WHERE rp.property_id = p.id) AS last_paid_on
               FROM properties p LEFT JOIN property_groups g ON g.id = p.group_id""" + where + " ORDER BY g.name, p.name",
            params,
        ))
        today = date.today().isoformat()
        for prop in result:
            prop['has_tenancy_history'] = bool(connection.execute('SELECT 1 FROM tenancies WHERE property_id=?', (prop['id'],)).fetchone())
            prop['business_name'] = ''
            if prop['has_tenancy_history']:
                candidates = connection.execute("""SELECT n.name, n.phone, t.deposit, t.business_name,
                    (SELECT amount FROM rent_rates WHERE tenancy_id=t.id AND effective_month<=? ORDER BY effective_month DESC LIMIT 1) AS rent
                    FROM tenancies t JOIN tenants n ON n.id=t.tenant_id WHERE t.property_id=? AND t.start_date<=?
                    AND (t.end_date IS NULL OR t.end_date>=?)""", (today[:7], prop['id'], today, today)).fetchall()
                current = candidates[0] if len(candidates) == 1 else None
                prop.update(
                    tenant_name=current['name'] if current else ('Tenancy unclear' if candidates else ''),
                    tenant_phone=current['phone'] if current else '',
                    business_name=current['business_name'] if current else '',
                    monthly_rent=current['rent'] if current else (None if candidates else 0),
                    advance_paid=current['deposit'] if current else 0
                )
        return result


@router.post("/api/properties", status_code=201)
def create_property(payload: PropertyCreate):
    data = payload.model_dump()
    data["active"] = int(data["active"])
    with db() as connection:
        if payload.group_id is not None and not connection.execute("SELECT 1 FROM property_groups WHERE id=?", (payload.group_id,)).fetchone():
            raise HTTPException(400, "Group not found")
        connection.execute("INSERT OR IGNORE INTO subareas(name, city) VALUES ('__legacy_storage__', '')")
        data['subarea_id'] = connection.execute("SELECT id FROM subareas WHERE name='__legacy_storage__'").fetchone()[0]
        try:
            cursor = connection.execute(
                """INSERT INTO properties(subarea_id, name, address, property_type, tenant_name, tenant_phone,
                   monthly_rent, advance_paid, due_day, active, group_id, electricity_payer) VALUES (:subarea_id, :name, :address,
                   :property_type, :tenant_name, :tenant_phone, :monthly_rent, :advance_paid, :due_day, :active, :group_id, :electricity_payer)""", data
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(400, str(error))
        return {"id": cursor.lastrowid, **payload.model_dump()}


@router.put("/api/properties/{property_id}")
def update_property(property_id: int, payload: PropertyUpdate):
    data = payload.model_dump() | {"id": property_id}
    data["active"] = int(data["active"])
    with db() as connection:
        if payload.group_id is not None and not connection.execute("SELECT 1 FROM property_groups WHERE id=?", (payload.group_id,)).fetchone():
            raise HTTPException(400, "Group not found")
        cursor = connection.execute(
            """UPDATE properties SET name=:name, address=:address, property_type=:property_type,
               tenant_name=:tenant_name, tenant_phone=:tenant_phone, monthly_rent=:monthly_rent,
               advance_paid=:advance_paid, due_day=:due_day, active=:active,
               group_id=:group_id, electricity_payer=:electricity_payer WHERE id=:id""", data
        )
        if not cursor.rowcount:
            raise HTTPException(404, "Property not found")
    return {"id": property_id, **payload.model_dump()}


@router.delete("/api/properties/{property_id}", status_code=204)
def delete_property(property_id: int):
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM properties WHERE id=?", (property_id,)).fetchone():
            raise HTTPException(404, "Property not found")
        if connection.execute('SELECT 1 FROM tracking_settings WHERE id=?', (property_id,)).fetchone():
            raise HTTPException(409, 'This property has a tracking baseline. Mark it inactive to preserve the records.')
        for table in ('rent_payments', 'electricity_bills', 'property_expenses', 'tenancies', 'archive_entries', 'month_reviews'):
            if connection.execute(f"SELECT 1 FROM {table} WHERE property_id=?", (property_id,)).fetchone():
                raise HTTPException(409, "This property has linked financial, tenancy, or archive records and cannot be deleted. Use Edit details to mark it inactive and preserve its records.")
        connection.execute("DELETE FROM properties WHERE id=?", (property_id,))
