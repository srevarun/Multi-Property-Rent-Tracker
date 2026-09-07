import tempfile
import unittest
import uuid
from pathlib import Path
from fastapi import HTTPException
from app import database, main, archive as arch_api, tenancies as tenancy_api
from app.schemas import PropertyCreate, TenantCreate, TenancyCreate, PaymentCreate
from app.archive import Tracking, ArchiveBatch, ArchiveRow, PostArchive, MonthReview


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_path = database.DB_PATH
        database.DB_PATH = Path(self.tmp.name) / 'test.db'
        database.init_db()
        self.prop = main.create_property(PropertyCreate(name='Shop 101', monthly_rent=10000))
        self.tenant = tenancy_api.create_tenant(TenantCreate(name='Kumar', phone='9876543210'))

    def tearDown(self):
        database.DB_PATH = self.old_path
        self.tmp.cleanup()

    def test_tracking_baseline_lifecycle(self):
        saved = arch_api.save_tracking(self.prop['id'], Tracking(
            start_month='2024-01',
            opening_balance=5000,
            tenant_label='Previous Tenant',
            notes='Old book balance'
        ))
        self.assertEqual(saved['start_month'], '2024-01')
        self.assertEqual(saved['opening_balance'], 5000)

        all_tracking = arch_api.list_tracking()
        self.assertEqual(len(all_tracking), 1)
        self.assertEqual(all_tracking[0]['tenant_label'], 'Previous Tenant')

        with self.assertRaises(HTTPException):
            arch_api.save_tracking(999, Tracking(start_month='2024-01'))

    def test_archive_batch_and_edit_lifecycle(self):
        key1 = uuid.uuid4()
        key2 = uuid.uuid4()
        batch_res = arch_api.save_batch(ArchiveBatch(entries=[
            ArchiveRow(
                client_key=key1,
                property_id=self.prop['id'],
                rental_month='2023-05',
                tenant_label='Kumar',
                expected_rent=8000,
                amount=8000,
                source='Register 1, page 5',
                notes='Cash received',
                review_status='Reviewed'
            ),
            ArchiveRow(
                client_key=key2,
                property_id=self.prop['id'],
                rental_month='2023-06',
                tenant_label='Kumar',
                amount=4000,
                review_status='Partial'
            )
        ]))
        self.assertEqual(len(batch_res['ids']), 2)
        entries = arch_api.list_archive()
        self.assertEqual(len(entries), 2)

        # Edit existing entry via batch with matching client_key and id
        arch_api.save_batch(ArchiveBatch(entries=[
            ArchiveRow(
                id=batch_res['ids'][1],
                client_key=key2,
                property_id=self.prop['id'],
                rental_month='2023-06',
                tenant_label='Kumar',
                amount=5000,
                review_status='Reviewed'
            )
        ]))
        updated = arch_api.list_archive()
        entry2 = next(e for e in updated if e['client_key'] == str(key2))
        self.assertEqual(entry2['amount'], 5000)

        # Deleting unlinked entry
        arch_api.delete_archive(entry2['id'])
        self.assertEqual(len(arch_api.list_archive()), 1)

    def test_post_archive_to_payment_and_prevent_duplicate(self):
        stay = tenancy_api.create_tenancy(TenancyCreate(
            property_id=self.prop['id'],
            tenant_id=self.tenant['id'],
            start_date='2023-01-01',
            initial_rent=8000
        ))
        key = uuid.uuid4()
        arch_api.save_batch(ArchiveBatch(entries=[
            ArchiveRow(
                client_key=key,
                property_id=self.prop['id'],
                rental_month='2023-05',
                tenant_label='Kumar',
                expected_rent=8000,
                amount=8000,
                source='Book 1',
                review_status='Reviewed'
            )
        ]))
        entry = arch_api.list_archive()[0]
        res = arch_api.post_archive(entry['id'], PostArchive(tenancy_id=stay['id']))
        self.assertTrue(res['payment_id'] > 0)

        payments = main.list_payments(property_id=self.prop['id'])
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0]['amount'], 8000)
        self.assertEqual(payments[0]['rental_month'], '2023-05')

        # Cannot delete linked archive entry
        with self.assertRaises(HTTPException):
            arch_api.delete_archive(entry['id'])

    def test_monthly_ledger_and_reviews(self):
        arch_api.save_tracking(self.prop['id'], Tracking(
            start_month='2024-06',
            opening_balance=0
        ))
        arch_api.save_review(MonthReview(
            property_id=self.prop['id'],
            month='2024-01',
            occupancy='Occupied',
            review_status='Reviewed',
            expected_rent=9000,
            notes='Verified from diary'
        ))
        ledger = arch_api.monthly_ledger(self.prop['id'], 2024)
        months = {m['month']: m for m in ledger['months']}
        self.assertTrue(months['2024-01']['before_tracking'])
        self.assertEqual(months['2024-01']['expected_rent'], 9000)
        self.assertFalse(months['2024-06']['before_tracking'])

    def test_property_delete_blocked_with_archive(self):
        arch_api.save_tracking(self.prop['id'], Tracking(start_month='2024-01'))
        with self.assertRaises(HTTPException):
            main.delete_property(self.prop['id'])

