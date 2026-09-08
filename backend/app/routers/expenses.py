from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException

from ..database import db
from ..schemas import ExpenseCreate, ExpenseUpdate

router = APIRouter()


def rows(result):
    return [dict(row) for row in result.fetchall()]


def list_expenses(property_id: Optional[int] = None, group_id: Optional[int] = None, category: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None):
    filters, params = [], []
    if property_id is not None:
        filters.append("e.property_id = ?")
        params.append(property_id)
    if group_id is not None:
        filters.append("p.group_id = ?")
        params.append(group_id)
    if category:
        filters.append("e.category = ?")
        params.append(category)
    if from_date:
        filters.append("e.expense_date >= ?")
        params.append(from_date)
    if to_date:
        filters.append("e.expense_date <= ?")
        params.append(to_date)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    with db() as connection:
        return rows(connection.execute(
            """SELECT e.*, p.name AS property_name, p.property_type, g.name AS group_name, g.id AS group_id
               FROM property_expenses e
               JOIN properties p ON p.id = e.property_id
               LEFT JOIN property_groups g ON g.id = p.group_id""" + where + " ORDER BY e.expense_date DESC, e.id DESC",
            params,
        ))


@router.get("/api/expenses")
def get_expenses(property_id: Optional[int] = None, group_id: Optional[int] = None, category: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None):
    return list_expenses(property_id, group_id, category, from_date, to_date)


@router.post("/api/expenses", status_code=201)
def create_expense(payload: ExpenseCreate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        if not connection.execute("SELECT 1 FROM properties WHERE id = ?", (payload.property_id,)).fetchone():
            raise HTTPException(404, "Property not found")
        data['expense_date'] = data['expense_date'] or date.today().isoformat()
        cursor = connection.execute(
            """INSERT INTO property_expenses(property_id, category, amount, expense_date,
               paid_to, payment_method, reference, notes)
               VALUES (:property_id, :category, :amount, :expense_date, :paid_to, :payment_method, :reference, :notes)""",
            data
        )
        return {"id": cursor.lastrowid, **data}


@router.put("/api/expenses/{record_id}")
def edit_expense(record_id: int, payload: ExpenseUpdate):
    data = payload.model_dump(mode="json")
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM property_expenses WHERE id=?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Record not found")
        if 'property_id' in data:
            prop = connection.execute("SELECT * FROM properties WHERE id=?", (data['property_id'],)).fetchone()
            if not prop:
                raise HTTPException(400, "Property not found")
        assignments = ','.join(f'{field}=?' for field in data)
        connection.execute(f"UPDATE property_expenses SET {assignments} WHERE id=?", (*data.values(), record_id))
    return {"id": record_id, **data}


@router.delete("/api/expenses/{record_id}", status_code=204)
def delete_expense(record_id: int):
    with db() as connection:
        if not connection.execute("DELETE FROM property_expenses WHERE id = ?", (record_id,)).rowcount:
            raise HTTPException(404, "Expense record not found")
