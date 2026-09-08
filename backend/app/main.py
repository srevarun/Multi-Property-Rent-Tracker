from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .tenancies import router as tenancy_router
from .archive import router as archive_router
from .routers.dashboard import router as dashboard_router, dashboard
from .routers.properties import router as properties_router, list_properties, create_property, update_property, delete_property
from .routers.payments import router as payments_router, list_payments, create_payment, delete_payment, edit_payment
from .routers.groups_taxes import router as groups_taxes_router, list_groups, create_group, edit_group, delete_group, list_taxes, create_tax, edit_tax, delete_tax
from .routers.electricity import router as electricity_router, list_electricity, create_electricity, update_collection, edit_electricity, delete_electricity
from .routers.expenses import router as expenses_router, list_expenses, get_expenses, create_expense, edit_expense, delete_expense
from .routers.history_export import router as history_export_router, list_edit_history, export_excel
from .routers.backup import router as backup_router, get_backup_status, download_database_snapshot, upload_backup_to_google_drive, save_google_drive_config, get_google_drive_config

app = FastAPI(title="Rent Ledger API", version="1.0.0")

# Register CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all feature routers
app.include_router(dashboard_router)
app.include_router(properties_router)
app.include_router(payments_router)
app.include_router(groups_taxes_router)
app.include_router(electricity_router)
app.include_router(expenses_router)
app.include_router(history_export_router)
app.include_router(tenancy_router)
app.include_router(archive_router)
app.include_router(backup_router)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
