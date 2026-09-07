"""Populate a fresh database with a small, realistic demo portfolio."""
from datetime import date, timedelta

from app.database import db, init_db


def seed():
    init_db()
    month = date.today().strftime("%Y-%m")
    with db() as connection:
        if connection.execute("SELECT COUNT(*) FROM properties").fetchone()[0]:
            print("Database already contains properties; nothing was changed.")
            return
        from app.main import create_property
        from app.schemas import PropertyCreate
        groups = [("Lakeview Apartments", "Apartment"), ("Market Square", "Shopping complex")]
        group_ids = []
        for group in groups:
            connection.execute("INSERT OR IGNORE INTO property_groups(name, kind) VALUES (?, ?)", group)
            group_ids.append(connection.execute("SELECT id FROM property_groups WHERE name=?", (group[0],)).fetchone()[0])
        connection.commit()
        properties = [
            (group_ids[0], "House 3B", "Ananya Rao", 32000, 96000),
            (group_ids[0], "House 4A", "Rohan Shah", 28000, 84000),
            (group_ids[1], "Shop 1", "Meera Iyer", 26000, 78000),
            (group_ids[1], "Shop 2", "", 19000, 0),
        ]
        ids = []
        for group_id, name, tenant, rent, advance in properties:
            prop = create_property(PropertyCreate(group_id=group_id, name=name, tenant_name=tenant,
                                   monthly_rent=rent, advance_paid=advance))
            ids.append(prop['id'])
        paid_on = (date.today() - timedelta(days=2)).isoformat()
        connection.execute("INSERT INTO rent_payments(property_id,rental_month,amount,paid_on,payment_method,reference,notes) VALUES (?,?,?,?,?,?,?)", (ids[0], month, 32000, paid_on, "UPI", "UPI-DEMO-001", "Paid in full"))
        connection.execute("INSERT INTO rent_payments(property_id,rental_month,amount,paid_on,payment_method,reference,notes) VALUES (?,?,?,?,?,?,?)", (ids[2], month, 13000, paid_on, "Bank transfer", "NEFT-DEMO-002", "Partial payment"))
    print("Demo portfolio created.")


if __name__ == "__main__":
    seed()

