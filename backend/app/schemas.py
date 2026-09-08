from datetime import date
from typing import Optional, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class PropertyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=300)
    property_type: str = Field(default="House", max_length=50)
    tenant_name: str = Field(default="", max_length=120)
    tenant_phone: str = Field(default="", max_length=30)
    monthly_rent: float = Field(ge=0)
    advance_paid: float = Field(default=0, ge=0)
    due_day: int = Field(default=5, ge=1, le=31)
    active: bool = True
    group_id: Optional[int] = None
    electricity_payer: Literal["Tenant", "Owner"] = "Tenant"


class PropertyUpdate(PropertyCreate):
    pass


class PaymentCreate(BaseModel):
    tenancy_id: Optional[int] = None
    property_id: int
    rental_month: str
    amount: float = Field(gt=0)
    paid_on: Optional[date] = None
    payment_method: str = Field(default="Cash", max_length=50)
    reference: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=500)

    @field_validator("rental_month")
    @classmethod
    def valid_month(cls, value: str) -> str:
        try:
            year, month = value.split("-")
            if len(year) != 4 or not 1 <= int(month) <= 12:
                raise ValueError
        except (ValueError, AttributeError):
            raise ValueError("rental_month must use YYYY-MM")
        return value


class PaymentQuery(BaseModel):
    property_id: Optional[int] = None
    rental_month: Optional[str] = None


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="Apartment", min_length=1, max_length=80)

    @field_validator("name", "kind")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()


class TaxCreate(BaseModel):
    group_id: int
    tax_type: Literal["Property tax", "Water tax"]
    amount: float = Field(gt=0, allow_inf_nan=False)
    paid_on: date
    period: str = Field(default="", max_length=100)
    reference: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=500)


class ElectricityCreate(BaseModel):
    property_id: int
    period: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, allow_inf_nan=False)
    paid_on: date
    collected: float = Field(default=0, ge=0, allow_inf_nan=False)
    reference: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=500)


class ElectricityCollection(BaseModel):
    collected: float = Field(ge=0, allow_inf_nan=False)


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default='', max_length=30)
    notes: str = Field(default='', max_length=500)

    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Name is required')
        return value.strip()


class TenancyCreate(BaseModel):
    property_id: int
    tenant_id: int
    business_name: str = Field(default="", max_length=120)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    deposit: float = Field(default=0, ge=0, allow_inf_nan=False)
    notes: str = Field(default='', max_length=500)
    initial_rent: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode='after')
    def date_order(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError('Move-out date cannot precede move-in date')
        if self.initial_rent is not None and not self.start_date:
            raise ValueError('Add known rent using an effective month when move-in date is unknown')
        return self


class RentRateCreate(BaseModel):
    tenancy_id: int
    effective_month: str = Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')
    amount: float = Field(ge=0, allow_inf_nan=False)


class DepositRefundCreate(BaseModel):
    tenancy_id: int
    amount: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    refunded_on: Optional[date] = None
    payment_method: str = Field(default="Bank transfer", max_length=50)
    reference: str = Field(default="", max_length=120)
    deduction_amount: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    deduction_reason: str = Field(default="", max_length=200)
    is_final_settlement: bool = Field(default=False)
    notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_positive_settlement(self):
        if self.amount <= 0 and self.deduction_amount <= 0 and not self.is_final_settlement:
            raise ValueError("Refund amount, deduction amount, or final settlement status is required")
        return self


class ExpenseCreate(BaseModel):
    property_id: int
    category: str = Field(default="Repair", min_length=1, max_length=80)
    amount: float = Field(gt=0, allow_inf_nan=False)
    expense_date: Optional[date] = None
    paid_to: str = Field(default="", max_length=150)
    payment_method: str = Field(default="Bank transfer", max_length=50)
    reference: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=500)

    @field_validator("category")
    @classmethod
    def nonblank_category(cls, value):
        if not value.strip():
            raise ValueError("Category is required")
        return value.strip()


class ExpenseUpdate(ExpenseCreate):
    pass


class TenancyTransferCreate(BaseModel):
    old_tenancy_id: int
    handover_date: date
    deposit_action: Literal["rollover_to_new_tenant", "refund_now", "settle_later"] = "rollover_to_new_tenant"
    refund_amount: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    deduction_amount: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    deduction_reason: str = Field(default="", max_length=200)
    refund_payment_method: str = Field(default="Bank transfer", max_length=50)
    refund_reference: str = Field(default="", max_length=120)
    
    new_tenant_id: Optional[int] = None
    new_tenant_name: Optional[str] = Field(default="", max_length=120)
    new_tenant_phone: Optional[str] = Field(default="", max_length=30)
    
    takeover_start_date: date
    business_name: str = Field(default="", max_length=120)
    new_rent: float = Field(ge=0, allow_inf_nan=False)
    new_deposit: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    transfer_notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_transfer_dates_and_tenant(self):
        if self.takeover_start_date < self.handover_date:
            raise ValueError("New tenant takeover date cannot precede outgoing handover date")
        if not self.new_tenant_id and not (self.new_tenant_name and self.new_tenant_name.strip()):
            raise ValueError("Either an existing tenant or a new tenant name is required")
        return self

