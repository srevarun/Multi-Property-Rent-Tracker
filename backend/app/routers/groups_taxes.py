import sqlite3
from fastapi import APIRouter, HTTPException

from ..database import db
from ..schemas import GroupCreate, TaxCreate

router = APIRouter()


def rows(result):
    return [dict(row) for row in result.fetchall()]


@router.get("/api/groups")
def list_groups():
    with db() as connection:
        return rows(connection.execute("""SELECT g.*,
            (SELECT COUNT(*) FROM properties WHERE group_id=g.id) AS property_count,
            COALESCE((SELECT SUM(amount) FROM group_taxes WHERE group_id=g.id AND tax_type='Property tax'),0) AS property_tax,
            COALESCE((SELECT SUM(amount) FROM group_taxes WHERE group_id=g.id AND tax_type='Water tax'),0) AS water_tax
            FROM property_groups g ORDER BY g.name"""))


@router.post("/api/groups", status_code=201)
def create_group(payload: GroupCreate):
    with db() as connection:
        try:
            cursor = connection.execute("INSERT INTO property_groups(name,kind) VALUES (?,?)", (payload.name, payload.kind))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "A group with this name already exists")
        return {"id": cursor.lastrowid, **payload.model_dump()}


@router.put("/api/groups/{record_id}")
def edit_group(record_id: int, payload: GroupCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM property_groups WHERE id=?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Record not found")
        assignments = ','.join(f'{field}=?' for field in data)
        try:
            connection.execute(f"UPDATE property_groups SET {assignments} WHERE id=?", (*data.values(), record_id))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "A group with this name already exists")
    return {"id": record_id, **data}


@router.delete("/api/groups/{group_id}", status_code=204)
def delete_group(group_id: int):
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM property_groups WHERE id=?", (group_id,)).fetchone():
            raise HTTPException(404, "Group not found")
        if connection.execute("SELECT 1 FROM group_taxes WHERE group_id=?", (group_id,)).fetchone():
            raise HTTPException(409, "This group has tax records and cannot be deleted. Keep the group to preserve its tax history.")
        connection.execute("UPDATE properties SET group_id=NULL WHERE group_id=?", (group_id,))
        connection.execute("DELETE FROM property_groups WHERE id=?", (group_id,))


@router.get("/api/taxes")
def list_taxes():
    with db() as connection:
        return rows(connection.execute("SELECT t.*, g.name AS group_name FROM group_taxes t JOIN property_groups g ON g.id=t.group_id ORDER BY t.paid_on DESC, t.id DESC"))


@router.post("/api/taxes", status_code=201)
def create_tax(payload: TaxCreate):
    with db() as connection:
        if not connection.execute("SELECT 1 FROM property_groups WHERE id=?", (payload.group_id,)).fetchone():
            raise HTTPException(404, "Group not found")
        data = payload.model_dump(mode="json")
        cursor = connection.execute("""INSERT INTO group_taxes(group_id,tax_type,amount,paid_on,period,reference,notes)
            VALUES (:group_id,:tax_type,:amount,:paid_on,:period,:reference,:notes)""", data)
        return {"id": cursor.lastrowid, **data}


@router.put("/api/taxes/{record_id}")
def edit_tax(record_id: int, payload: TaxCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM group_taxes WHERE id=?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Record not found")
        if 'group_id' in data and not connection.execute("SELECT 1 FROM property_groups WHERE id=?", (data['group_id'],)).fetchone():
            raise HTTPException(400, "Group not found")
        assignments = ','.join(f'{field}=?' for field in data)
        connection.execute(f"UPDATE group_taxes SET {assignments} WHERE id=?", (*data.values(), record_id))
    return {"id": record_id, **data}


@router.delete("/api/taxes/{record_id}", status_code=204)
def delete_tax(record_id: int):
    with db() as connection:
        if not connection.execute("DELETE FROM group_taxes WHERE id=?", (record_id,)).rowcount:
            raise HTTPException(404, "Tax record not found")
