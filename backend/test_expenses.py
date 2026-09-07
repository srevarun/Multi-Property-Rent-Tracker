import tempfile
import unittest
from pathlib import Path
from fastapi import HTTPException
from app import database, main
from app.schemas import PropertyCreate, GroupCreate, ExpenseCreate, ExpenseUpdate


class ExpenseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.tmp.name) / 'ledger.db'
        database.init_db()
        group = main.create_group(GroupCreate(name='Central Complex', kind='Shopping complex'))
        self.group_id = group['id']
        p1 = main.create_property(PropertyCreate(name='Shop 101', monthly_rent=15000, group_id=self.group_id))
        p2 = main.create_property(PropertyCreate(name='Flat 202', monthly_rent=20000, group_id=self.group_id))
        self.p1_id = p1['id']
        self.p2_id = p2['id']

    def tearDown(self):
        database.DB_PATH = self.original
        self.tmp.cleanup()

    def test_create_and_list_expenses(self):
        # Create repair expense
        exp1 = main.create_expense(ExpenseCreate(
            property_id=self.p1_id,
            category="Repair",
            amount=4500.0,
            expense_date="2026-05-10",
            paid_to="Ravi Plumbers",
            payment_method="UPI",
            reference="UPI987654",
            notes="Fixed kitchen pipeline leak"
        ))
        self.assertEqual(exp1["category"], "Repair")
        self.assertEqual(exp1["amount"], 4500.0)

        # Create renovation expense
        exp2 = main.create_expense(ExpenseCreate(
            property_id=self.p2_id,
            category="Renovation",
            amount=75000.0,
            expense_date="2026-06-15",
            paid_to="Apex Interiors",
            payment_method="Bank transfer",
            reference="TXN12345",
            notes="Full bathroom remodeling and tile replacement"
        ))
        self.assertEqual(exp2["category"], "Renovation")

        # List all
        all_exp = main.list_expenses()
        self.assertEqual(len(all_exp), 2)
        self.assertEqual(all_exp[0]["property_name"], "Flat 202")  # ordered by date desc

        # Filter by property_id
        p1_exp = main.list_expenses(property_id=self.p1_id)
        self.assertEqual(len(p1_exp), 1)
        self.assertEqual(p1_exp[0]["category"], "Repair")

        # Filter by category
        ren_exp = main.list_expenses(category="Renovation")
        self.assertEqual(len(ren_exp), 1)
        self.assertEqual(ren_exp[0]["amount"], 75000.0)

        # Filter by date range
        date_exp = main.list_expenses(from_date="2026-06-01", to_date="2026-06-30")
        self.assertEqual(len(date_exp), 1)
        self.assertEqual(date_exp[0]["property_id"], self.p2_id)

    def test_update_and_audit_expense(self):
        exp = main.create_expense(ExpenseCreate(
            property_id=self.p1_id,
            category="Painting",
            amount=12000.0,
            expense_date="2026-04-01",
            paid_to="Shankar Painters",
            payment_method="Cash",
            reference="REC-01",
            notes="Exterior whitewash"
        ))
        exp_id = exp["id"]

        # Update expense
        updated = main.edit_expense(exp_id, ExpenseUpdate(
            property_id=self.p1_id,
            category="Painting",
            amount=14500.0,
            expense_date="2026-04-02",
            paid_to="Shankar Painters & Team",
            payment_method="Cash",
            reference="REC-01B",
            notes="Exterior whitewash + primer coat"
        ))
        self.assertEqual(updated["amount"], 14500.0)

        # Verify audit history
        history = main.list_edit_history()
        exp_history = [h for h in history if h["entity"] == "property_expenses"]
        self.assertTrue(len(exp_history) >= 1)
        changes = {c["field"]: (c["before"], c["after"]) for c in exp_history[0]["changes"]}
        self.assertIn("amount", changes)
        self.assertEqual(changes["amount"], (12000.0, 14500.0))

    def test_delete_expense(self):
        exp = main.create_expense(ExpenseCreate(
            property_id=self.p1_id,
            category="Plumbing",
            amount=1800.0,
            expense_date="2026-04-10"
        ))
        exp_id = exp["id"]

        main.delete_expense(exp_id)
        self.assertEqual(len(main.list_expenses(property_id=self.p1_id)), 0)

    def test_property_deletion_blocked_with_expenses(self):
        main.create_expense(ExpenseCreate(
            property_id=self.p1_id,
            category="Repair",
            amount=3000.0,
            expense_date="2026-04-10"
        ))
        with self.assertRaises(HTTPException) as ctx:
            main.delete_property(self.p1_id)
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
