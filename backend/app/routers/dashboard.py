from typing import Optional
from fastapi import APIRouter
from ..tenancies import monthly_dashboard

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(month: Optional[str] = None):
    return monthly_dashboard(month)
