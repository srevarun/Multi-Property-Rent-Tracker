import tempfile
import unittest
from pathlib import Path
from datetime import date
from app import database, main
from app.schemas import TenancyTransferCreate, PropertyCreate, GroupCreate, TenantCreate, TenancyCreate
from app.tenancies import transfer_tenancy, list_tenancies, list_deposit_refunds


class TestTenancyTransfer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.tmp.name) / 'ledger.db'
        database.init_db()

        # Seed group & property
        group = main.create_group(GroupCreate(name='Commercial Complex', kind='Commercial'))
        self.group_id = group['id']
        prop = main.create_property(PropertyCreate(name='Shop 101', property_type='Shop', monthly_rent=20000, advance_paid=100000, group_id=self.group_id))
        self.prop_id = prop['id']

        # Seed old tenant
        with database.db() as con:
            cur = con.execute("INSERT INTO tenants(name, phone, notes) VALUES ('Karthik', '9876543210', 'First tenant')")
            self.old_tenant_id = cur.lastrowid
            
            # Seed old tenancy (Shop: 'Karthik Sweets')
            ty_cur = con.execute("""INSERT INTO tenancies(property_id, tenant_id, business_name, start_date, end_date, deposit, notes)
                VALUES (?, ?, 'Karthik Sweets', '2025-01-01', NULL, 100000, 'Original lease')""", (self.prop_id, self.old_tenant_id))
            self.old_tenancy_id = ty_cur.lastrowid
            
            con.execute("INSERT INTO rent_rates(tenancy_id, effective_month, amount) VALUES (?, '2025-01', 20000)", (self.old_tenancy_id,))

    def tearDown(self):
        database.DB_PATH = self.original
        self.tmp.cleanup()

    def test_transfer_with_deposit_rollover(self):
        payload = TenancyTransferCreate(
            old_tenancy_id=self.old_tenancy_id,
            handover_date=date(2026, 8, 31),
            deposit_action="rollover_to_new_tenant",
            new_tenant_name="Suresh",
            new_tenant_phone="9988776655",
            takeover_start_date=date(2026, 9, 1),
            business_name="Suresh Sweets & Bakery",
            new_rent=22000,
            new_deposit=100000,
            transfer_notes="Full store takeover and new brand"
        )
        res = transfer_tenancy(payload)
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['new_tenant_name'], 'Suresh')
        
        # Verify old tenancy is ended
        with database.db() as con:
            old = con.execute("SELECT * FROM tenancies WHERE id=?", (self.old_tenancy_id,)).fetchone()
            self.assertEqual(old['end_date'], '2026-08-31')
            self.assertIn('Handed over to Suresh', old['notes'])
            
            # Verify new tenancy
            new_t = con.execute("SELECT * FROM tenancies WHERE id=?", (res['new_tenancy_id'],)).fetchone()
            self.assertEqual(new_t['property_id'], self.prop_id)
            self.assertEqual(new_t['business_name'], 'Suresh Sweets & Bakery')
            self.assertEqual(new_t['start_date'], '2026-09-01')
            self.assertIsNone(new_t['end_date'])
            self.assertEqual(new_t['deposit'], 100000)
            self.assertIn('Taken over from Karthik', new_t['notes'])
            
            # Verify rent rate
            rate = con.execute("SELECT * FROM rent_rates WHERE tenancy_id=?", (res['new_tenancy_id'],)).fetchone()
            self.assertEqual(rate['effective_month'], '2026-09')
            self.assertEqual(rate['amount'], 22000)

    def test_transfer_with_deposit_refund_and_deductions(self):
        payload = TenancyTransferCreate(
            old_tenancy_id=self.old_tenancy_id,
            handover_date=date(2026, 8, 31),
            deposit_action="refund_now",
            refund_amount=90000,
            deduction_amount=10000,
            deduction_reason="Whitewashing and painting charges",
            refund_payment_method="Bank transfer",
            refund_reference="IMPS982341",
            new_tenant_name="Vijay",
            new_tenant_phone="9123456780",
            takeover_start_date=date(2026, 9, 1),
            business_name="Vijay Electronics",
            new_rent=25000,
            new_deposit=120000,
            transfer_notes="Electronic showroom lease"
        )
        res = transfer_tenancy(payload)
        self.assertEqual(res['status'], 'success')
        
        refunds = list_deposit_refunds(self.old_tenancy_id)
        self.assertEqual(len(refunds), 1)
        self.assertEqual(refunds[0]['amount'], 90000)
        self.assertEqual(refunds[0]['deduction_amount'], 10000)
        self.assertEqual(refunds[0]['deduction_reason'], "Whitewashing and painting charges")
        self.assertTrue(bool(refunds[0]['is_final_settlement']))


if __name__ == '__main__':
    unittest.main()
