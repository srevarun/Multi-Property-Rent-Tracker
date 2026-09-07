"""Incremental book transcription and explicit monthly review, separate from posted cash."""
from datetime import date
from typing import Optional, Literal, List
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from .database import db
from .tenancies import records, month_valid, validate_payment

router = APIRouter(prefix='/api')
MONTH = r'^\d{4}-(0[1-9]|1[0-2])$'


class Tracking(BaseModel):
    start_month: str = Field(pattern=MONTH)
    opening_balance: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    tenant_label: str = Field(default='', max_length=120)
    notes: str = Field(default='', max_length=500)


class ArchiveRow(BaseModel):
    id: Optional[int] = None
    client_key: UUID
    property_id: int
    rental_month: Optional[str] = Field(default=None, pattern=MONTH)
    tenant_label: str = Field(default='', max_length=120)
    expected_rent: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    amount: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    paid_on: Optional[date] = None
    source: str = Field(default='', max_length=200)
    notes: str = Field(default='', max_length=500)
    review_status: Literal['Partial', 'Reviewed'] = 'Partial'


class ArchiveBatch(BaseModel):
    entries: List[ArchiveRow] = Field(min_length=1, max_length=100)


class PostArchive(BaseModel):
    tenancy_id: Optional[int] = None
    existing_payment_id: Optional[int] = None


class MonthReview(BaseModel):
    property_id: int
    month: str = Field(pattern=MONTH)
    occupancy: Literal['Unknown', 'Occupied', 'Vacant'] = 'Unknown'
    review_status: Literal['Partial', 'Reviewed'] = 'Partial'
    expected_rent: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    notes: str = Field(default='', max_length=500)

    @model_validator(mode='after')
    def complete_review(self):
        if self.occupancy == 'Vacant' and self.expected_rent not in (None,0):
            raise ValueError('Vacant months cannot have expected rent')
        if self.review_status == 'Reviewed' and (self.occupancy == 'Unknown' or (self.occupancy == 'Occupied' and self.expected_rent is None)):
            raise ValueError('A reviewed month requires known occupancy and expected rent')
        return self


def require_property(con, property_id):
    if not con.execute('SELECT 1 FROM properties WHERE id=?',(property_id,)).fetchone():
        raise HTTPException(404,'Property not found')


@router.get('/tracking')
def list_tracking():
    with db() as con:
        return records(con.execute('SELECT * FROM tracking_settings ORDER BY id'))


@router.put('/tracking/{property_id}')
def save_tracking(property_id: int, payload: Tracking):
    with db() as con:
        require_property(con,property_id)
        con.execute('''INSERT INTO tracking_settings(id,start_month,opening_balance,tenant_label,notes)
            VALUES (:id,:start_month,:opening_balance,:tenant_label,:notes)
            ON CONFLICT(id) DO UPDATE SET start_month=excluded.start_month,opening_balance=excluded.opening_balance,
            tenant_label=excluded.tenant_label,notes=excluded.notes''',{'id':property_id,**payload.model_dump()})
    return {'id':property_id,**payload.model_dump()}


@router.get('/archive')
def list_archive():
    with db() as con:
        return records(con.execute('''SELECT a.*,p.name AS property_name FROM archive_entries a
            JOIN properties p ON p.id=a.property_id ORDER BY a.id DESC'''))


@router.post('/archive/batch')
def save_batch(payload: ArchiveBatch):
    saved=[]
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        for index, item in enumerate(payload.entries,1):
            data=item.model_dump(mode='json')
            require_property(con,item.property_id)
            old=con.execute('SELECT * FROM archive_entries WHERE client_key=?',(data['client_key'],)).fetchone()
            if item.id and (not old or old['id']!=item.id):
                raise HTTPException(409,f'Row {index}: original archive entry not found')
            if old and old['payment_id']:
                raise HTTPException(409,f'Row {index}: payment already linked. Edit it in Rent history instead.')
            if old:
                con.execute('''UPDATE archive_entries SET property_id=:property_id,rental_month=:rental_month,
                    tenant_label=:tenant_label,expected_rent=:expected_rent,amount=:amount,paid_on=:paid_on,
                    source=:source,notes=:notes,review_status=:review_status WHERE client_key=:client_key''',data)
                saved.append(old['id'])
            else:
                cur=con.execute('''INSERT INTO archive_entries(client_key,property_id,rental_month,tenant_label,expected_rent,
                    amount,paid_on,source,notes,review_status) VALUES (:client_key,:property_id,:rental_month,:tenant_label,
                    :expected_rent,:amount,:paid_on,:source,:notes,:review_status)''',data)
                saved.append(cur.lastrowid)
    return {'ids':saved}


@router.delete('/archive/{entry_id}',status_code=204)
def delete_archive(entry_id: int):
    with db() as con:
        row=con.execute('SELECT * FROM archive_entries WHERE id=?',(entry_id,)).fetchone()
        if not row:
            raise HTTPException(404,'Archive entry not found')
        if row['payment_id']:
            raise HTTPException(409,'Linked archive entries are kept as source references')
        con.execute('DELETE FROM archive_entries WHERE id=?',(entry_id,))


@router.post('/archive/{entry_id}/post')
def post_archive(entry_id: int, payload: PostArchive):
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        row=con.execute('SELECT * FROM archive_entries WHERE id=?',(entry_id,)).fetchone()
        if not row:
            raise HTTPException(404,'Archive entry not found')
        if row['payment_id']:
            return {'payment_id':row['payment_id']}
        if row['review_status']!='Reviewed' or not row['rental_month'] or row['amount'] is None:
            raise HTTPException(400,'Review the entry and supply a rental month and payment amount first')
        if payload.existing_payment_id:
            payment=con.execute('SELECT * FROM rent_payments WHERE id=?',(payload.existing_payment_id,)).fetchone()
            if not payment or payment['property_id']!=row['property_id'] or payment['rental_month']!=row['rental_month'] or payment['amount']!=row['amount']:
                raise HTTPException(400,'The existing payment must match property, rental month and amount')
            payment_id=payment['id']
        else:
            if con.execute('SELECT 1 FROM rent_payments WHERE property_id=? AND rental_month=? AND amount=?',
                           (row['property_id'],row['rental_month'],row['amount'])).fetchone():
                raise HTTPException(409,'A matching payment already exists. Link its receipt number instead of posting again.')
            data=dict(row)
            data['tenancy_id']=payload.tenancy_id
            validate_payment(con,data)
            payment_id=con.execute('''INSERT INTO rent_payments(property_id,rental_month,amount,paid_on,payment_method,
                reference,notes,tenancy_id,tenant_snapshot) VALUES (?,?,?,?,?,?,?,?,?)''',
                (row['property_id'],row['rental_month'],row['amount'],row['paid_on'] or '', 'Other',row['source'],
                 row['notes'],payload.tenancy_id,row['tenant_label'])).lastrowid
        con.execute('UPDATE archive_entries SET payment_id=? WHERE id=?',(payment_id,entry_id))
        return {'payment_id':payment_id}


@router.get('/month-reviews')
def list_reviews():
    with db() as con:
        return records(con.execute('SELECT * FROM month_reviews ORDER BY month DESC,property_id'))


@router.put('/month-reviews')
def save_review(payload: MonthReview):
    with db() as con:
        require_property(con,payload.property_id)
        con.execute('''INSERT INTO month_reviews(property_id,month,occupancy,review_status,expected_rent,notes)
            VALUES (:property_id,:month,:occupancy,:review_status,:expected_rent,:notes)
            ON CONFLICT(property_id,month) DO UPDATE SET occupancy=excluded.occupancy,review_status=excluded.review_status,
            expected_rent=excluded.expected_rent,notes=excluded.notes''',payload.model_dump())
    return payload.model_dump()


@router.get('/monthly-ledger/{property_id}')
def monthly_ledger(property_id: int, year: int):
    if not 1900<=year<=9999:
        raise HTTPException(400,'Year must be between 1900 and 9999')
    with db() as con:
        require_property(con,property_id)
        setting=con.execute('SELECT * FROM tracking_settings WHERE id=?',(property_id,)).fetchone()
        ledger=[]
        for number in range(1,13):
            month=f'{year:04d}-{number:02d}'
            review=con.execute('SELECT * FROM month_reviews WHERE property_id=? AND month=?',(property_id,month)).fetchone()
            paid=con.execute('SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE property_id=? AND rental_month=?',(property_id,month)).fetchone()[0]
            drafts=con.execute('SELECT COUNT(*) FROM archive_entries WHERE property_id=? AND rental_month=? AND payment_id IS NULL',(property_id,month)).fetchone()[0]
            expected=(0 if review['occupancy']=='Vacant' else review['expected_rent']) if review else None
            before=bool(setting and month<setting['start_month'])
            ledger.append(dict(month=month,occupancy=review['occupancy'] if review else 'Unknown',
                review_status=review['review_status'] if review else 'Not reviewed', expected_rent=expected,
                collected=paid,balance=max(expected-paid,0) if expected is not None else None,
                archive_entries=drafts,before_tracking=before,notes=review['notes'] if review else ''))
        return {'months':ledger,'tracking':dict(setting) if setting else None}


def apply_month_review(con, month, entries, uncertain):
    settings={r['id']:dict(r) for r in con.execute('SELECT * FROM tracking_settings')}
    reviews={r['property_id']:dict(r) for r in con.execute('SELECT * FROM month_reviews WHERE month=?',(month,))}
    omitted=[]
    result=[]
    unknown={r['id']:r for r in uncertain}
    original={r['id']:r for r in entries}
    properties={r['id']:dict(r) for r in con.execute('''SELECT p.*,g.name AS group_name FROM properties p
        LEFT JOIN property_groups g ON g.id=p.group_id''')}
    for property_id in set(original)|set(unknown)|set(reviews)|set(settings):
        setting=settings.get(property_id)
        review=reviews.get(property_id)
        base=original.get(property_id) or unknown.get(property_id) or {**properties[property_id],'amount_paid':0,'tenancy_id':None}
        if setting and month<setting['start_month'] and (not review or review['review_status']!='Reviewed'):
            omitted.append({'id':property_id,'name':base['name']})
            unknown.pop(property_id,None)
            continue
        if review:
            if review['review_status']=='Reviewed':
                expected=0 if review['occupancy']=='Vacant' else review['expected_rent']
                paid=con.execute('SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE property_id=? AND rental_month=?',(property_id,month)).fetchone()[0]
                result.append({**base,'monthly_rent':expected,'amount_paid':paid})
                unknown.pop(property_id,None)
            else:
                unknown[property_id]={**base,'reason':'Archive review is incomplete for this month'}
        elif property_id in original:
            result.append(original[property_id])
    return result,list(unknown.values()),omitted
