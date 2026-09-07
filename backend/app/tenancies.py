from datetime import date
import re
import sqlite3
from fastapi import APIRouter, HTTPException
from .database import db
from typing import Optional
from .schemas import TenantCreate, TenancyCreate, RentRateCreate, DepositRefundCreate, TenancyTransferCreate

router = APIRouter(prefix='/api')


def records(cursor):
    return [dict(row) for row in cursor.fetchall()]


def month_valid(month):
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        raise HTTPException(400, 'Use YYYY-MM for the rent month')


def validate_payment(con, data):
    month_valid(data['rental_month'])
    tenancy_id = data.get('tenancy_id')
    if tenancy_id is None:
        if con.execute('SELECT 1 FROM tenancies WHERE property_id=?', (data['property_id'],)).fetchone():
            raise HTTPException(400, 'Select the tenancy for this rent payment')
        return
    tenancy = con.execute('SELECT * FROM tenancies WHERE id=?', (tenancy_id,)).fetchone()
    if not tenancy or tenancy['property_id'] != data['property_id']:
        raise HTTPException(400, 'Tenancy does not belong to this property')
    month = data['rental_month']
    if (tenancy['start_date'] and month < tenancy['start_date'][:7]) or (tenancy['end_date'] and month > tenancy['end_date'][:7]):
        raise HTTPException(400, 'Rent month is outside the tenancy dates')


@router.get('/tenants')
def list_tenants():
    with db() as con:
        return records(con.execute('SELECT * FROM tenants ORDER BY name,id'))


@router.post('/tenants', status_code=201)
def create_tenant(payload: TenantCreate):
    with db() as con:
        cur = con.execute('INSERT INTO tenants(name,phone,notes) VALUES (?,?,?)', (payload.name,payload.phone,payload.notes))
        return {'id': cur.lastrowid, **payload.model_dump()}


@router.put('/tenants/{tenant_id}')
def update_tenant(tenant_id: int, payload: TenantCreate):
    with db() as con:
        if not con.execute('UPDATE tenants SET name=?,phone=?,notes=? WHERE id=?', (payload.name,payload.phone,payload.notes,tenant_id)).rowcount:
            raise HTTPException(404,'Tenant not found')
    return {'id': tenant_id, **payload.model_dump()}


@router.get('/tenancies')
def list_tenancies():
    with db() as con:
        result = records(con.execute('''SELECT t.*, p.name AS property_name, p.property_type, p.group_id, g.name AS group_name, n.name AS tenant_name,
            (SELECT amount FROM rent_rates WHERE tenancy_id=t.id AND effective_month=substr(t.start_date,1,7)) AS initial_rent
            FROM tenancies t
            JOIN properties p ON p.id=t.property_id
            JOIN tenants n ON n.id=t.tenant_id
            LEFT JOIN property_groups g ON g.id=p.group_id
            ORDER BY t.start_date DESC,t.id DESC'''))
        for row in result:
            row['start_date'] = row['start_date'] or None
            refunds = records(con.execute('SELECT * FROM deposit_refunds WHERE tenancy_id=? ORDER BY refunded_on DESC, id DESC', (row['id'],)))
            row['refunds'] = refunds
            total_ref = sum(r['amount'] for r in refunds)
            total_ded = sum(r['deduction_amount'] for r in refunds)
            has_final = any(bool(r.get('is_final_settlement')) for r in refunds)
            row['total_refunded'] = total_ref
            row['total_deductions'] = total_ded
            row['is_settled'] = has_final or (len(refunds) > 0 and (total_ref + total_ded) >= row['deposit'])
            row['deposit_balance'] = 0 if row['is_settled'] else max(row['deposit'] - total_ref - total_ded, 0)
        return result


@router.get('/deposit-refunds')
def list_deposit_refunds(tenancy_id: Optional[int] = None):
    where = " WHERE r.tenancy_id = ?" if tenancy_id else ""
    params = (tenancy_id,) if tenancy_id else ()
    with db() as con:
        return records(con.execute(f'''SELECT r.*, p.name AS property_name, n.name AS tenant_name
            FROM deposit_refunds r
            JOIN tenancies t ON t.id = r.tenancy_id
            JOIN properties p ON p.id = t.property_id
            JOIN tenants n ON n.id = t.tenant_id
            {where}
            ORDER BY r.refunded_on DESC, r.id DESC''', params))


@router.post('/deposit-refunds', status_code=201)
def create_deposit_refund(payload: DepositRefundCreate):
    data = payload.model_dump(mode='json')
    data['refunded_on'] = data['refunded_on'] or ''
    data['is_final_settlement'] = int(bool(data.get('is_final_settlement', False)))
    with db() as con:
        if not con.execute('SELECT 1 FROM tenancies WHERE id=?', (data['tenancy_id'],)).fetchone():
            raise HTTPException(400, 'Tenancy not found')
        cur = con.execute('''INSERT INTO deposit_refunds(tenancy_id, amount, refunded_on, payment_method,
            reference, deduction_amount, deduction_reason, is_final_settlement, notes) VALUES (:tenancy_id, :amount, :refunded_on,
            :payment_method, :reference, :deduction_amount, :deduction_reason, :is_final_settlement, :notes)''', data)
        return {'id': cur.lastrowid, **data}


@router.put('/deposit-refunds/{refund_id}')
def update_deposit_refund(refund_id: int, payload: DepositRefundCreate):
    data = payload.model_dump(mode='json')
    data['refunded_on'] = data['refunded_on'] or ''
    data['is_final_settlement'] = int(bool(data.get('is_final_settlement', False)))
    with db() as con:
        if not con.execute('SELECT 1 FROM tenancies WHERE id=?', (data['tenancy_id'],)).fetchone():
            raise HTTPException(400, 'Tenancy not found')
        cur = con.execute('''UPDATE deposit_refunds SET tenancy_id=:tenancy_id, amount=:amount,
            refunded_on=:refunded_on, payment_method=:payment_method, reference=:reference,
            deduction_amount=:deduction_amount, deduction_reason=:deduction_reason,
            is_final_settlement=:is_final_settlement, notes=:notes
            WHERE id=:id''', {**data, 'id': refund_id})
        if not cur.rowcount:
            raise HTTPException(404, 'Deposit refund not found')
        return {'id': refund_id, **data}


@router.delete('/deposit-refunds/{refund_id}', status_code=204)
def delete_deposit_refund(refund_id: int):
    with db() as con:
        if not con.execute('DELETE FROM deposit_refunds WHERE id=?', (refund_id,)).rowcount:
            raise HTTPException(404, 'Deposit refund not found')


def save_tenancy(payload, tenancy_id=None):
    data = payload.model_dump(mode='json')
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        old = None
        if tenancy_id:
            old = con.execute('SELECT * FROM tenancies WHERE id=?',(tenancy_id,)).fetchone()
            if not old:
                raise HTTPException(404,'Tenancy not found')
        for table, key in [('properties','property_id'),('tenants','tenant_id')]:
            if not con.execute(f'SELECT 1 FROM {table} WHERE id=?',(data[key],)).fetchone():
                raise HTTPException(400, f'{key.replace("_id", "")} not found')
        # Empty storage value represents unknown; do not invent a date for old NOT NULL schemas.
        data['start_date'] = data['start_date'] or ''
        start, end = data['start_date'][:7] or '0000-01', (data['end_date'] or '9999-12')[:7]
        if data['start_date'] and con.execute("""SELECT 1 FROM tenancies WHERE property_id=? AND id!=?
            AND start_date!='' AND substr(start_date,1,7)<=? AND substr(COALESCE(end_date,'9999-12'),1,7)>=?""",
            (data['property_id'],tenancy_id or 0,end,start)).fetchone():
            raise HTTPException(409,'Tenancies with known dates cannot overlap rental months.')
        if old:
            payments = records(con.execute('SELECT * FROM rent_payments WHERE tenancy_id=?',(tenancy_id,)))
            if any(p['property_id'] != data['property_id'] or not start <= p['rental_month'] <= end for p in payments):
                raise HTTPException(409,'These dates or property would exclude existing payments. Correct their tenancy assignments first.')
            rates = records(con.execute('SELECT * FROM rent_rates WHERE tenancy_id=? ORDER BY effective_month',(tenancy_id,)))
            if any(not start <= r['effective_month'] <= end for r in rates):
                raise HTTPException(409,'These dates would exclude a known rent rate. Correct the rent rates first.')
            con.execute("""UPDATE tenancies SET property_id=:property_id,tenant_id=:tenant_id,business_name=:business_name,start_date=:start_date,
                end_date=:end_date,deposit=:deposit,notes=:notes WHERE id=:id""", {**data,'id':tenancy_id})
        else:
            cur = con.execute("""INSERT INTO tenancies(property_id,tenant_id,business_name,start_date,end_date,deposit,notes)
                VALUES (:property_id,:tenant_id,:business_name,:start_date,:end_date,:deposit,:notes)""",data)
            tenancy_id=cur.lastrowid
        if data['initial_rent'] is not None:
            con.execute("""INSERT INTO rent_rates(tenancy_id,effective_month,amount) VALUES (?,?,?)
                ON CONFLICT(tenancy_id,effective_month) DO UPDATE SET amount=excluded.amount""",(tenancy_id,start,data['initial_rent']))
        return {'id':tenancy_id,**data,'start_date':data['start_date'] or None}


@router.post('/tenancies',status_code=201)
def create_tenancy(payload: TenancyCreate):
    return save_tenancy(payload)


@router.put('/tenancies/{tenancy_id}')
def update_tenancy(tenancy_id: int, payload: TenancyCreate):
    return save_tenancy(payload, tenancy_id)


@router.post('/tenancies/transfer', status_code=201)
def transfer_tenancy(payload: TenancyTransferCreate):
    data = payload.model_dump(mode='json')
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        old = con.execute("""SELECT t.*, p.name AS property_name, p.property_type, n.name AS old_tenant_name
            FROM tenancies t
            JOIN properties p ON p.id=t.property_id
            JOIN tenants n ON n.id=t.tenant_id
            WHERE t.id=?""", (data['old_tenancy_id'],)).fetchone()
        if not old:
            raise HTTPException(404, 'Outgoing tenancy not found')
        
        handover_str = data['handover_date']
        takeover_str = data['takeover_start_date']
        
        # Check if new tenant needs to be created
        new_tenant_id = data.get('new_tenant_id')
        new_tenant_name = (data.get('new_tenant_name') or '').strip()
        if not new_tenant_id:
            if not new_tenant_name:
                raise HTTPException(400, 'New tenant name is required')
            cur = con.execute('INSERT INTO tenants(name, phone, notes) VALUES (?,?,?)',
                              (new_tenant_name, (data.get('new_tenant_phone') or '').strip(), 'Created during tenancy transfer'))
            new_tenant_id = cur.lastrowid
        else:
            t_row = con.execute('SELECT name FROM tenants WHERE id=?', (new_tenant_id,)).fetchone()
            if not t_row:
                raise HTTPException(400, 'Selected new tenant not found')
            new_tenant_name = t_row['name']

        # Close old tenancy
        old_notes = (old['notes'] or '').strip()
        transfer_remark = f"Handed over to {new_tenant_name} on {takeover_str}"
        updated_notes = f"{old_notes} ({transfer_remark})" if old_notes else transfer_remark
        con.execute("UPDATE tenancies SET end_date=?, notes=? WHERE id=?", (handover_str, updated_notes, old['id']))
        
        # Handle deposit action for old tenancy
        deposit_action = data['deposit_action']
        if deposit_action == 'refund_now':
            con.execute("""INSERT INTO deposit_refunds(tenancy_id, amount, refunded_on, payment_method,
                reference, deduction_amount, deduction_reason, is_final_settlement, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (old['id'], data['refund_amount'], handover_str, data['refund_payment_method'],
                 data['refund_reference'], data['deduction_amount'], data['deduction_reason'],
                 f"Settlement upon transfer to {new_tenant_name}"))
        elif deposit_action == 'rollover_to_new_tenant':
            # Record final settlement on old tenancy with rollover note
            con.execute("""INSERT INTO deposit_refunds(tenancy_id, amount, refunded_on, payment_method,
                reference, deduction_amount, deduction_reason, is_final_settlement, notes)
                VALUES (?, 0, ?, 'Deposit Rollover', ?, ?, ?, 1, ?)""",
                (old['id'], handover_str, f"Rollover to Tenancy of {new_tenant_name}",
                 data['deduction_amount'], data['deduction_reason'],
                 f"Deposit of ₹{data['new_deposit']} rolled over/credited to new tenancy for {new_tenant_name}"))
            
        # Create new tenancy
        new_tenancy_notes = (data.get('transfer_notes') or '').strip()
        takeover_remark = f"Taken over from {old['old_tenant_name']} (Tenancy #{old['id']})"
        final_new_notes = f"{takeover_remark}. {new_tenancy_notes}".strip()
        
        cur = con.execute("""INSERT INTO tenancies(property_id, tenant_id, business_name, start_date, end_date, deposit, notes)
            VALUES (?, ?, ?, ?, NULL, ?, ?)""",
            (old['property_id'], new_tenant_id, data.get('business_name') or '', takeover_str, data['new_deposit'], final_new_notes))
        new_tenancy_id = cur.lastrowid
        
        # Create initial rent rate for new tenancy
        effective_month = takeover_str[:7]
        con.execute("""INSERT INTO rent_rates(tenancy_id, effective_month, amount) VALUES (?, ?, ?)
            ON CONFLICT(tenancy_id, effective_month) DO UPDATE SET amount=excluded.amount""",
            (new_tenancy_id, effective_month, data['new_rent']))
        
        return {
            'status': 'success',
            'old_tenancy_id': old['id'],
            'new_tenancy_id': new_tenancy_id,
            'new_tenant_id': new_tenant_id,
            'new_tenant_name': new_tenant_name,
            'property_id': old['property_id'],
            'property_name': old['property_name']
        }


@router.get('/rent-rates')
def list_rates():
    with db() as con:
        return records(con.execute('SELECT * FROM rent_rates ORDER BY tenancy_id,effective_month'))


def save_rate(payload,rate_id=None):
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        tenancy=con.execute('SELECT * FROM tenancies WHERE id=?',(payload.tenancy_id,)).fetchone()
        if not tenancy:
            raise HTTPException(400,'Tenancy not found')
        if rate_id:
            old=con.execute('SELECT * FROM rent_rates WHERE id=?',(rate_id,)).fetchone()
            if not old:
                raise HTTPException(404,'Rent change not found')
            if old['tenancy_id'] != payload.tenancy_id:
                raise HTTPException(400,'Cannot move a rent change to another tenancy')
        if not (tenancy['start_date'][:7] or '0000-01') <= payload.effective_month <= (tenancy['end_date'] or '9999-12')[:7]:
            raise HTTPException(400,'Effective month must be within the known tenancy dates')
        try:
            if rate_id:
                con.execute('UPDATE rent_rates SET effective_month=?,amount=? WHERE id=?',(payload.effective_month,payload.amount,rate_id))
            else:
                rate_id=con.execute('INSERT INTO rent_rates(tenancy_id,effective_month,amount) VALUES (?,?,?)',(payload.tenancy_id,payload.effective_month,payload.amount)).lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(409,'A rent rate already exists for that month')
        return {'id':rate_id,**payload.model_dump()}


@router.post('/rent-rates',status_code=201)
def create_rate(payload: RentRateCreate):
    return save_rate(payload)


@router.put('/rent-rates/{rate_id}')
def update_rate(rate_id: int,payload: RentRateCreate):
    return save_rate(payload,rate_id)


def monthly_dashboard(month: Optional[str] = None):
    if not month or not isinstance(month, str):
        month = date.today().strftime("%Y-%m")
    month_valid(month)
    with db() as con:
        expected = records(con.execute('''SELECT p.id,p.name,p.property_type,p.due_day,g.name AS group_name,
            t.id AS tenancy_id,n.name AS tenant_name,t.business_name,t.deposit AS advance_paid,t.start_date,
            (SELECT MIN(effective_month) FROM rent_rates WHERE tenancy_id=t.id) AS first_rate_month,
            (SELECT MIN(rental_month) FROM rent_payments WHERE tenancy_id=t.id) AS first_payment_month,
            (SELECT amount FROM rent_rates WHERE tenancy_id=t.id AND effective_month<=? ORDER BY effective_month DESC LIMIT 1) AS monthly_rent,
            COALESCE((SELECT SUM(amount) FROM rent_payments WHERE tenancy_id=t.id AND rental_month=?),0) AS amount_paid
            FROM tenancies t JOIN properties p ON p.id=t.property_id JOIN tenants n ON n.id=t.tenant_id
            LEFT JOIN property_groups g ON g.id=p.group_id
            WHERE substr(t.start_date,1,7)<=? AND substr(COALESCE(t.end_date,'9999-12'),1,7)>=?''',(month,month,month,month)))
        # Preserve the old ledger until each property's historical tenancy is supplied.
        legacy=records(con.execute('''SELECT p.id,p.name,p.property_type,p.due_day,g.name AS group_name,NULL AS tenancy_id,
            p.tenant_name,'' AS business_name,p.advance_paid,p.monthly_rent,
            COALESCE((SELECT SUM(amount) FROM rent_payments WHERE property_id=p.id AND tenancy_id IS NULL AND rental_month=?),0) AS amount_paid
            FROM properties p LEFT JOIN property_groups g ON g.id=p.group_id
            WHERE p.active=1 AND NOT EXISTS(SELECT 1 FROM tenancies WHERE property_id=p.id)
            AND (p.tenant_name != '' OR p.monthly_rent > 0 OR EXISTS(SELECT 1 FROM rent_payments WHERE property_id=p.id AND rental_month=?))''',(month,month)))
        # Unknown move-in dates do not establish occupancy for every previous month.
        # A dated rate/payment is evidence of occupancy from that month onward.
        by_property = {}
        for entry in expected:
            by_property.setdefault(entry['id'], []).append(entry)
        resolved, uncertain = [], []
        for candidates in by_property.values():
            established = []
            for entry in candidates:
                evidence = [v for v in (entry['first_rate_month'], entry['first_payment_month']) if v]
                if entry['start_date'] or (evidence and min(evidence) <= month):
                    established.append(entry)
            if len(established) == 1:
                entry = established[0]
                if entry['monthly_rent'] is None:
                    entry['reason'] = 'Rent amount unknown for this month'
                    uncertain.append(entry)
                else:
                    resolved.append(entry)
            else:
                entry = candidates[0]
                entry['reason'] = 'Tenancy dates are unclear' if not established else 'More than one tenancy may cover this month'
                uncertain.append(entry)
        from .archive import apply_month_review
        entries, uncertain, before_tracking = apply_month_review(con,month,resolved+legacy,uncertain)
        total=sum(r['monthly_rent'] for r in entries)
        collected=con.execute('SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE rental_month=?',(month,)).fetchone()[0]
        unassigned=con.execute('SELECT COUNT(*) FROM rent_payments WHERE rental_month=? AND tenancy_id IS NULL',(month,)).fetchone()[0]
        credited=sum(min(r['amount_paid'],r['monthly_rent']) for r in entries)
        return dict(month=month,total_properties=len(entries),expected_rent=total,collected_rent=collected,
            pending_rent=sum(max(r['monthly_rent']-r['amount_paid'],0) for r in entries),
            total_advances=sum(r['advance_paid'] for r in entries), collection_rate=round(credited/total*100,1) if total else 0,
            pending_properties=sorted([r for r in entries if r['amount_paid']<r['monthly_rent']],key=lambda r:(r['due_day'],r['name'])),
            legacy_properties=len(legacy),unassigned_payments=unassigned, unknown_properties=uncertain, before_tracking=before_tracking)
