# Rent Ledger

A local-first rent tracking web application with an Angular dashboard, Python/FastAPI API, SQLite storage, and Excel export.

## Features

- Group individual houses or shops under custom apartments, shopping complexes, or other named groups
- Classify properties as **House**, **Shop**, **Storage unit**, **Office**, or **Other**
- Record and display custom **Shop / Business trade names** (e.g. *Kathir Steels*, *Sri Krishna Sweets*) per tenancy stay, with full flexibility for rebranding
- Keep a tenant registry, dated tenancies, deposits, and monthly rent-change history
- Track tenancy move-outs, multi-installment deposit refunds, and deductions with full settlement balances
- Choose tenant-paid or owner-paid electricity per property; track owner-paid bills and tenant reimbursements separately from rent
- Record property tax and water tax payments for each group, including period, payment date, reference, and notes
- Record full or partial payments by rental month
- See monthly collected, pending, and expected rent at a glance
- Search the complete payment history
- Export property and payment history to a formatted Excel workbook

## Run the backend

Python 3.9 or newer is supported.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`. Interactive API documentation is available at `http://localhost:8000/docs`. The SQLite database is created automatically at `backend/rent_tracker.db`.

To load optional sample data before starting the API:

```bash
cd backend
source .venv/bin/activate
python seed.py
```

## Run the Angular app

Install Node.js 18.19+ (Node 20 LTS is recommended), then open another terminal:

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:4200`. Angular's development proxy forwards `/api` requests to the Python server.

## Data and backups

All application data lives in `backend/rent_tracker.db`. Back up that file to preserve the complete ledger. The **Export Excel** button downloads twelve sheets: `Properties`, `Rent History`, `Archive`, `Tracking`, `Monthly Review`, `Tenants`, `Tenancies`, `Rent Rates`, `Deposit Refunds`, `Groups`, `Group Taxes`, and `Electricity`.

## Groups, electricity and taxes

Create a group in **Groups & taxes**, then assign each unit through **Properties → Edit details**. Group types are free text, so you can use Apartment, Shopping complex, or your own category. Groups are the only organisational category. The Delete button removes a group after confirmation and moves its properties to Ungrouped, preserving rent and electricity records. Groups with tax records cannot be deleted. Existing properties remain ungrouped until assigned.

In property details, choose whether the tenant pays electricity directly or the owner pays and collects. Existing properties default to tenant-paid electricity; review this setting for your units. For owner-paid properties, use **Electricity → Record EB bill** to enter the bill period, amount, date paid, and any reimbursement already received. **Update collected** sets the cumulative amount received for that bill (not an additional payment). Historical bills remain available if the payer setting changes. Reimbursement dates and individual collection transactions are not tracked.

Use **Record tax** on a group to enter property or water tax already paid. Group cards show all-time tax totals; the history lists each payment. Incorrect tax or electricity entries can be deleted and re-entered. Taxes and electricity do not affect rent balances.

Restart the backend after updating to create the new tables and migrate existing properties automatically. Existing rent payments are preserved.

Run backend regression checks with `cd backend && .venv/bin/python -m unittest -v test_groups.py test_tenancies.py test_archive.py`.


## Editing and history

Use Edit on groups, rent history entries, tax entries, and electricity bills, or Edit details on properties. Existing forms open with the saved values. Editing an EB bill remains possible after its property switches to tenant-paid electricity.

The Edit history screen shows the time, record, and before/after values of changed fields, including EB collection updates. History starts when this version is first run; earlier edits cannot be reconstructed. History is read-only through the app and remains after the original record is deleted. Identical saves do not create history entries. No user identity is recorded because this local app has no accounts. History is included in the SQLite backup.


## Historical rent and tenants

1. Open **Tenants** and add each current or former tenant. Reuse a tenant record for another stay by the same person.
2. Add a tenancy for the property with whichever move-in/move-out dates, initial monthly rent, and deposit you know. Move-in and initial rent are optional. Leave move-out blank for an ongoing stay.
3. Add rent changes with their effective months. If move-in and initial rent are known, that rate applies from move-in month. Otherwise use Known rent to record an amount and effective month independently. Each rate applies until the next known rate; earlier rates can be added later.
4. Record rent with the historical rental month and actual payment date. The matching tenancy is selected automatically for new payments, and its monthly rent is suggested; adjust the amount for partial payments.
5. Use **Rent history → Edit** to explicitly link existing payments to the correct tenancy. Existing payments are retained as unassigned legacy records, with the tenant label captured at migration; it is not proof of who occupied the property in the past.

The dashboard uses the chosen month's tenancy and rate, including for properties now marked inactive. Months without a tenancy have no expected rent once the property's tenancy history is set up. Pending rent is calculated separately for each tenancy, so an overpayment on one does not erase another's balance. Collection percentage measures rent covered, capped at each tenancy's expected amount. Unassigned payments remain in collected totals but do not settle a tenancy until linked.

Until a property has tenancy history, the dashboard keeps its legacy rent calculation and displays a warning. Enter all applicable stays and assign existing payments for reliable historical reports. Dates, former tenants, and old rates cannot be inferred from the previous database, so no tenancies are invented during migration.

Billing is by full calendar month: move-in and move-out months are included in full, with no automatic proration. Tenancies with known move-in dates cannot share a rental month. Incomplete tenancies can be saved; overlapping evidence is flagged as unclear rather than double-charged. Within-month tenant turnovers and prorated charges are not supported in this version.

Tenant, tenancy, and rent-rate edits are recorded in Edit history. Property cards show the current tenancy's tenant/rent/deposit, and those fields are edited through tenancy history once configured. Excel includes both tenancy and rent-rate records and the tenant linked to each historical payment.


### Incomplete memories

Leave move-in date and initial rent blank when unknown. Save the tenancy first, then use **Known rent** to enter an amount for a month you remember. Payments can also be recorded against an undated tenancy. A remembered rate or payment establishes occupancy from that month for reporting; it does not set the actual move-in date. The rate is carried forward until another known rate or move-out.

Months without sufficient date/rent information appear as incomplete and are excluded from expected and pending totals. Collected payments are still shown. Unknown rent is distinct from an explicitly entered zero rent. Add earlier rates or a remembered move-in date whenever available; existing dated rates are preserved. Leaving initial rent blank on an edit preserves recorded rates; edit those rates through Known rent. Conflicting tenancy evidence must be clarified before a balance is calculated for that property/month.

Use **Delete** on a property card to remove an unused property after confirmation. Properties with rent payments, electricity bills, or tenancy history are protected; mark them inactive through Edit details instead. Existing edit history and the parent group are preserved.


## Archive & historical books

1. Use **Archive & books** to transcribe physical record books gradually without immediately affecting active cash totals.
2. Set a **Tracking start & opening balance** baseline for each property to mark where reliable digital tracking begins. Months prior to this baseline remain omitted from active dues until explicitly reviewed.
3. Transcribe historical book entries in batches under **Book transcription**. Entries can record expected rent, amounts paid, dates, and book/page sources.
4. When ready, use **Post / link payment** on a reviewed archive entry to link it to an existing receipt or post it into official rent payments.
5. Use **Monthly review** to confirm occupancy (Occupied/Vacant), verify agreed expected rent, and mark entire historical months as Reviewed or Partial.


## Deposit refunds and move-out settlement

1. When a tenant vacates, edit the tenancy to enter their **Move-out date**.
2. Use **Record deposit refund** on the tenancy card to record single or multiple return installments (e.g. UPI, bank transfer, cheque).
3. If repair, painting, or damage deductions apply, record the deduction amount and reason alongside the refund installment.
4. The tenancy card tracks **Original Deposit**, **Total Refunded**, **Deductions**, and **Remaining Balance** to be returned.
5. All deposit return records are included in the **Deposit Refunds** sheet of the Excel export.


# Multi-Property-Rent-Tracker
