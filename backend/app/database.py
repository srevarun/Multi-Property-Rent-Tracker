import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "rent_tracker.db"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def db():
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS subareas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                city TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS properties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subarea_id INTEGER NOT NULL REFERENCES subareas(id) ON DELETE RESTRICT,
                name TEXT NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                property_type TEXT NOT NULL DEFAULT 'House',
                tenant_name TEXT NOT NULL DEFAULT '',
                tenant_phone TEXT NOT NULL DEFAULT '',
                monthly_rent REAL NOT NULL CHECK(monthly_rent >= 0),
                advance_paid REAL NOT NULL DEFAULT 0 CHECK(advance_paid >= 0),
                due_day INTEGER NOT NULL DEFAULT 5 CHECK(due_day BETWEEN 1 AND 31),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rent_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                rental_month TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                paid_on TEXT NOT NULL,
                payment_method TEXT NOT NULL DEFAULT 'Bank transfer',
                reference TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_properties_subarea ON properties(subarea_id);
            CREATE INDEX IF NOT EXISTS idx_payments_property ON rent_payments(property_id);
            CREATE INDEX IF NOT EXISTS idx_payments_month ON rent_payments(rental_month);
            """
        )


        connection.executescript("""
            CREATE TABLE IF NOT EXISTS property_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL DEFAULT 'Apartment'
            );
            CREATE TABLE IF NOT EXISTS group_taxes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL REFERENCES property_groups(id),
                tax_type TEXT NOT NULL CHECK(tax_type IN ('Property tax', 'Water tax')),
                amount REAL NOT NULL CHECK(amount > 0),
                paid_on TEXT NOT NULL,
                period TEXT NOT NULL DEFAULT '',
                reference TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS electricity_bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL REFERENCES properties(id),
                period TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                paid_on TEXT NOT NULL,
                collected REAL NOT NULL DEFAULT 0 CHECK(collected >= 0 AND collected <= amount),
                reference TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT ''
            );
        """)
        columns = {row['name'] for row in connection.execute('PRAGMA table_info(properties)')}
        if 'group_id' not in columns:
            connection.execute('ALTER TABLE properties ADD COLUMN group_id INTEGER REFERENCES property_groups(id)')
        if 'electricity_payer' not in columns:
            connection.execute("ALTER TABLE properties ADD COLUMN electricity_payer TEXT NOT NULL DEFAULT 'Tenant'")
        if 'property_type' not in columns:
            connection.execute("ALTER TABLE properties ADD COLUMN property_type TEXT NOT NULL DEFAULT 'House'")

        connection.execute("""CREATE TABLE IF NOT EXISTS edit_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity TEXT NOT NULL, record_id INTEGER NOT NULL,
            edited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            before_json TEXT NOT NULL, after_json TEXT NOT NULL
        )""")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS tenants (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS tenancies (
                id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER NOT NULL REFERENCES properties(id),
                tenant_id INTEGER NOT NULL REFERENCES tenants(id), business_name TEXT NOT NULL DEFAULT '',
                start_date TEXT NOT NULL, end_date TEXT,
                deposit REAL NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS rent_rates (
                id INTEGER PRIMARY KEY AUTOINCREMENT, tenancy_id INTEGER NOT NULL REFERENCES tenancies(id),
                effective_month TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>=0), UNIQUE(tenancy_id,effective_month)
            );
        """)
        tenancy_columns = {row['name'] for row in connection.execute('PRAGMA table_info(tenancies)')}
        if 'business_name' not in tenancy_columns:
            connection.execute("ALTER TABLE tenancies ADD COLUMN business_name TEXT NOT NULL DEFAULT ''")
        payment_columns = {row['name'] for row in connection.execute('PRAGMA table_info(rent_payments)')}
        if 'tenancy_id' not in payment_columns:
            connection.execute('ALTER TABLE rent_payments ADD COLUMN tenancy_id INTEGER REFERENCES tenancies(id)')
            connection.execute("ALTER TABLE rent_payments ADD COLUMN tenant_snapshot TEXT NOT NULL DEFAULT ''")
            connection.execute("UPDATE rent_payments SET tenant_snapshot=COALESCE((SELECT tenant_name FROM properties WHERE id=property_id),'')")
        # Replace the payment audit trigger to include tenancy assignment.
        connection.execute('DROP TRIGGER IF EXISTS audit_rent_payments_update')
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS tracking_settings (
                id INTEGER PRIMARY KEY REFERENCES properties(id), start_month TEXT NOT NULL,
                opening_balance REAL, tenant_label TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS archive_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT, client_key TEXT NOT NULL UNIQUE,
                property_id INTEGER NOT NULL REFERENCES properties(id), rental_month TEXT,
                tenant_label TEXT NOT NULL DEFAULT '', expected_rent REAL, amount REAL, paid_on TEXT,
                source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
                review_status TEXT NOT NULL DEFAULT 'Partial', payment_id INTEGER REFERENCES rent_payments(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS month_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER NOT NULL REFERENCES properties(id),
                month TEXT NOT NULL, occupancy TEXT NOT NULL DEFAULT 'Unknown',
                review_status TEXT NOT NULL DEFAULT 'Partial', expected_rent REAL,
                notes TEXT NOT NULL DEFAULT '', UNIQUE(property_id,month)
            );
            CREATE TABLE IF NOT EXISTS deposit_refunds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
                amount REAL NOT NULL CHECK(amount >= 0),
                refunded_on TEXT NOT NULL,
                payment_method TEXT NOT NULL DEFAULT 'Bank transfer',
                reference TEXT NOT NULL DEFAULT '',
                deduction_amount REAL NOT NULL DEFAULT 0 CHECK(deduction_amount >= 0),
                deduction_reason TEXT NOT NULL DEFAULT '',
                is_final_settlement INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_deposit_refunds_tenancy ON deposit_refunds(tenancy_id);

            CREATE TABLE IF NOT EXISTS property_expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                category TEXT NOT NULL DEFAULT 'Repair',
                amount REAL NOT NULL CHECK(amount > 0),
                expense_date TEXT NOT NULL,
                paid_to TEXT NOT NULL DEFAULT '',
                payment_method TEXT NOT NULL DEFAULT 'Bank transfer',
                reference TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_property_expenses_property ON property_expenses(property_id);
            CREATE INDEX IF NOT EXISTS idx_property_expenses_date ON property_expenses(expense_date);
        """)
        refund_columns = {row['name'] for row in connection.execute('PRAGMA table_info(deposit_refunds)')}
        if 'is_final_settlement' not in refund_columns:
            connection.execute("ALTER TABLE deposit_refunds ADD COLUMN is_final_settlement INTEGER NOT NULL DEFAULT 0")
        tracked = {
            'tracking_settings': ['start_month','opening_balance','tenant_label','notes'],
            'archive_entries': ['property_id','rental_month','tenant_label','expected_rent','amount','paid_on','source','notes','review_status','payment_id'],
            'month_reviews': ['property_id','month','occupancy','review_status','expected_rent','notes'],
            'deposit_refunds': ['tenancy_id','amount','refunded_on','payment_method','reference','deduction_amount','deduction_reason','is_final_settlement','notes'],
            'property_expenses': ['property_id','category','amount','expense_date','paid_to','payment_method','reference','notes'],
            'properties': ['name','address','property_type','tenant_name','tenant_phone','monthly_rent','advance_paid','due_day','active','group_id','electricity_payer'],
            'property_groups': ['name','kind'],
            'tenants': ['name','phone','notes'],
            'tenancies': ['property_id','tenant_id','business_name','start_date','end_date','deposit','notes'],
            'rent_rates': ['tenancy_id','effective_month','amount'],
            'rent_payments': ['tenancy_id','property_id','rental_month','amount','paid_on','payment_method','reference','notes'],
            'group_taxes': ['group_id','tax_type','amount','paid_on','period','reference','notes'],
            'electricity_bills': ['property_id','period','amount','paid_on','collected','reference','notes'],
        }
        for table, fields in tracked.items():
            connection.execute(f'DROP TRIGGER IF EXISTS audit_{table}_update')
            before = ','.join(f"'{field}', OLD.{field}" for field in fields)
            after = ','.join(f"'{field}', NEW.{field}" for field in fields)
            changed = ' OR '.join(f'OLD.{field} IS NOT NEW.{field}' for field in fields)
            connection.execute(f"""CREATE TRIGGER IF NOT EXISTS audit_{table}_update
                AFTER UPDATE ON {table} WHEN {changed}
                BEGIN INSERT INTO edit_history(entity,record_id,before_json,after_json)
                VALUES ('{table}',NEW.id,json_object({before}),json_object({after})); END""")
