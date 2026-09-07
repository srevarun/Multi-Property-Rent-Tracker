export interface Property { has_tenancy_history: boolean; group_id: number | null; group_name?: string; electricity_payer: string; id: number; name: string; address: string; property_type: string; business_name?: string; tenant_name: string; tenant_phone: string; monthly_rent: number | null; advance_paid: number; due_day: number; active: number; last_paid_on?: string; }
export interface Payment { tenancy_id: number | null; id: number; property_id: number; property_name: string; property_type?: string; group_name?: string; tenant_name: string; business_name?: string; rental_month: string; amount: number; paid_on: string; payment_method: string; reference: string; notes: string; }
export interface Dashboard { unknown_properties: Array<{id:number; name:string; tenant_name:string; reason:string}>; before_tracking?: Array<{id:number; name:string}>; legacy_properties: number; unassigned_payments: number; month: string; total_properties: number; expected_rent: number; collected_rent: number; pending_rent: number; total_advances: number; collection_rate: number; pending_properties: Array<Property & { monthly_rent: number; amount_paid: number }>; }

export interface PropertyGroup { id: number; name: string; kind: string; property_count: number; property_tax: number; water_tax: number; }
export interface GroupTax { id: number; group_id: number; group_name: string; tax_type: string; amount: number; paid_on: string; period: string; reference: string; notes: string; }
export interface ElectricityBill { id: number; property_id: number; property_name: string; group_name?: string; period: string; amount: number; paid_on: string; collected: number; reference: string; notes: string; }
export interface PropertyExpense { id: number; property_id: number; property_name?: string; property_type?: string; group_id?: number; group_name?: string; category: string; amount: number; expense_date: string; paid_to: string; payment_method: string; reference: string; notes: string; }

export interface EditHistory { id: number; entity: string; record_id: number; edited_at: string; label: string; changes: Array<{field: string; before: unknown; after: unknown}>; }

export interface Tenant { id: number; name: string; phone: string; notes: string; }
export interface DepositRefund { id: number; tenancy_id: number; property_name?: string; tenant_name?: string; amount: number; refunded_on: string; payment_method: string; reference: string; deduction_amount: number; deduction_reason: string; is_final_settlement?: boolean | number; notes: string; }
export interface Tenancy { id: number; property_id: number; property_name: string; property_type?: string; group_id?: number | null; group_name?: string; tenant_id: number; tenant_name: string; business_name?: string; start_date: string | null; end_date: string | null; deposit: number; notes: string; initial_rent: number | null; total_refunded?: number; total_deductions?: number; deposit_balance?: number; is_settled?: boolean; refunds?: DepositRefund[]; }
export interface RentRate { id: number; tenancy_id: number; effective_month: string; amount: number; }

export interface ArchiveEntry { id?: number; client_key: string; property_id: number; property_name?: string; rental_month: string | null; tenant_label: string; expected_rent: number | null; amount: number | null; paid_on: string | null; source: string; notes: string; review_status: string; payment_id?: number | null; }
export interface Tracking { id: number; start_month: string; opening_balance: number | null; tenant_label: string; notes: string; }
export interface MonthRow { month: string; occupancy: string; review_status: string; expected_rent: number | null; collected: number; balance: number | null; archive_entries: number; before_tracking: boolean; notes: string; }

export interface TenancyTransfer {
  old_tenancy_id: number;
  handover_date: string;
  deposit_action: 'rollover_to_new_tenant' | 'refund_now' | 'settle_later';
  refund_amount: number;
  deduction_amount: number;
  deduction_reason: string;
  refund_payment_method: string;
  refund_reference: string;
  new_tenant_id?: number | null;
  new_tenant_name?: string;
  new_tenant_phone?: string;
  takeover_start_date: string;
  business_name?: string;
  new_rent: number;
  new_deposit: number;
  transfer_notes: string;
}

