import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from './api.service';
import { ArchiveComponent } from './archive.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PropertiesComponent } from './components/properties/properties.component';
import { PaymentsComponent } from './components/payments/payments.component';
import { GroupsComponent } from './components/groups/groups.component';
import { ElectricityComponent } from './components/electricity/electricity.component';
import { ExpensesComponent } from './components/expenses/expenses.component';
import { TenantsComponent } from './components/tenants/tenants.component';
import { HistoryComponent } from './components/history/history.component';
import {
  Dashboard, Payment, Property, PropertyGroup, GroupTax,
  ElectricityBill, PropertyExpense, EditHistory, Tenant, Tenancy, RentRate, DepositRefund
} from './models';

type View = 'tenants' | 'history' | 'dashboard' | 'properties' | 'payments' | 'groups' | 'electricity' | 'expenses' | 'archive';

@Component({
  selector: 'app-root',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    ArchiveComponent,
    DashboardComponent,
    PropertiesComponent,
    PaymentsComponent,
    GroupsComponent,
    ElectricityComponent,
    ExpensesComponent,
    TenantsComponent,
    HistoryComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  view: View = 'dashboard';
  loading = true;
  error = '';
  toast = '';
  modal: 'property' | 'payment' | 'group' | 'tax' | 'electricity' | 'collection' | 'expense' | 'tenant' | 'tenancy' | 'rate' | 'refund' | 'transfer' | null = null;
  selectedMonth = new Date().toISOString().slice(0, 7);
  propertyTenantSearch: string = '';
  search = '';
  groupFilter = '';

  dashboard?: Dashboard;
  properties: Property[] = [];
  payments: Payment[] = [];
  groups: PropertyGroup[] = [];
  taxes: GroupTax[] = [];
  electricity: ElectricityBill[] = [];
  expenses: PropertyExpense[] = [];
  tenants: Tenant[] = [];
  tenancies: Tenancy[] = [];
  rates: RentRate[] = [];
  history: EditHistory[] = [];

  // Modal Forms
  tenantForm = { id: 0, name: '', phone: '', notes: '' };
  tenancyForm = { id: 0, property_id: 0, tenant_id: 0, business_name: '', start_date: '', end_date: '', deposit: 0, initial_rent: null as number | null, notes: '' };
  rateForm = { id: 0, tenancy_id: 0, effective_month: '', amount: 0 };
  refundForm = this.emptyRefund();
  editingRefund = 0;
  editingExpense = 0;
  expenseForm = this.emptyExpense();
  propertyForm = this.emptyProperty();
  paymentForm = this.emptyPayment();
  groupForm = { name: '', kind: 'Apartment' };
  taxForm = this.emptyTax();
  electricityForm = this.emptyElectricity();
  collectionForm = { id: 0, collected: 0, amount: 0 };
  editingGroup = 0;
  editingPayment = 0;
  editingTax = 0;
  editingElectricity = 0;

  selectedTenancyForRefund?: Tenancy;
  selectedTenancyForTransfer?: Tenancy;
  transferForm = this.emptyTransfer();

  constructor(public api: ApiService) {}

  ngOnInit() {
    this.loadAll();
  }

  get dashboardStayMonth(): string {
    return this.getPreviousMonth(this.selectedMonth);
  }

  get ownerProperties() {
    return this.properties.filter(p => p.electricity_payer === 'Owner' || (this.editingElectricity > 0 && p.id === this.electricity.find(b => b.id === this.editingElectricity)?.property_id));
  }

  get electricityPending() {
    return this.electricity.reduce((sum, bill) => sum + bill.amount - bill.collected, 0);
  }

  get paymentsTotalByTenant(): Record<string, number> {
    const res: Record<string, number> = {};
    for (const p of this.payments) {
      if (p.tenant_name) {
        res[p.tenant_name] = (res[p.tenant_name] || 0) + (p.amount || 0);
      }
    }
    return res;
  }

  get expensesTotalByProperty(): Record<number, number> {
    const res: Record<number, number> = {};
    for (const e of this.expenses) {
      res[e.property_id] = (res[e.property_id] || 0) + (e.amount || 0);
    }
    return res;
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    forkJoin({
      dashboard: this.api.dashboard(this.dashboardStayMonth),
      properties: this.api.properties(),
      payments: this.api.payments(),
      groups: this.api.groups(),
      taxes: this.api.taxes(),
      electricity: this.api.electricity(),
      expenses: this.api.expenses(),
      history: this.api.editHistory(),
      tenants: this.api.tenants(),
      tenancies: this.api.tenancies(),
      rates: this.api.rates()
    }).subscribe({
      next: data => {
        Object.assign(this, data);
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not connect to the server. Make sure the Python API is running.';
        this.loading = false;
      }
    });
  }

  changeMonth() {
    this.api.dashboard(this.dashboardStayMonth).subscribe(data => this.dashboard = data);
  }

  setView(view: View) {
    this.view = view;
  }

  onFilterPropertiesByGroup(groupId: number) {
    this.groupFilter = '' + groupId;
    this.search = '';
    this.setView('properties');
  }

  // --- Modal Helpers & Form Resetters ---
  emptyProperty() {
    return {
      id: 0,
      name: '',
      address: '',
      property_type: 'House',
      business_name: '',
      tenant_name: '',
      tenant_phone: '',
      monthly_rent: 0,
      advance_paid: 0,
      due_day: 5,
      active: true,
      group_id: (this.groups.length ? this.groups[0].id : null) as number | null,
      electricity_payer: 'Tenant',
      tenant_selection: 0,
      new_tenant_name: '',
      new_tenant_phone: '',
      start_date: '',
      deposit: 0
    };
  }

  emptyPayment() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      tenancy_id: null as number | null,
      property_id: 0,
      rental_month: this.dashboardStayMonth,
      amount: 0,
      paid_on: today,
      payment_method: 'Cash',
      reference: '',
      notes: ''
    };
  }

  emptyExpense() {
    return {
      property_id: 0,
      category: 'Repair',
      amount: 0,
      expense_date: new Date().toISOString().slice(0, 10),
      paid_to: '',
      payment_method: 'Bank transfer',
      reference: '',
      notes: ''
    };
  }

  emptyTax() {
    return {
      group_id: 0,
      tax_type: 'Property tax',
      amount: 0,
      paid_on: new Date().toISOString().slice(0, 10),
      period: '',
      reference: '',
      notes: ''
    };
  }

  emptyElectricity() {
    return {
      property_id: 0,
      period: '',
      amount: 0,
      paid_on: new Date().toISOString().slice(0, 10),
      collected: 0,
      reference: '',
      notes: ''
    };
  }

  emptyRefund() {
    return {
      tenancy_id: 0,
      amount: 0,
      refunded_on: new Date().toISOString().slice(0, 10),
      payment_method: 'Bank transfer',
      reference: '',
      deduction_amount: 0,
      deduction_reason: '',
      is_final_settlement: true,
      notes: ''
    };
  }

  emptyTransfer() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      old_tenancy_id: 0,
      handover_date: today,
      deposit_action: 'rollover_to_new_tenant' as 'rollover_to_new_tenant' | 'refund_now' | 'settle_later',
      refund_amount: 0,
      deduction_amount: 0,
      deduction_reason: '',
      refund_payment_method: 'Bank transfer',
      refund_reference: '',
      new_tenant_id: 0,
      new_tenant_name: '',
      new_tenant_phone: '',
      takeover_start_date: today,
      business_name: '',
      new_rent: 0,
      new_deposit: 0,
      transfer_notes: ''
    };
  }

  // --- Modal Open Actions ---
  openProperty(property?: Property) {
    if (property) {
      this.propertyForm = {
        id: property.id,
        name: property.name,
        address: property.address,
        property_type: property.property_type || 'House',
        business_name: property.business_name || '',
        tenant_name: property.tenant_name,
        tenant_phone: property.tenant_phone,
        monthly_rent: property.monthly_rent ?? 0,
        advance_paid: property.advance_paid,
        due_day: property.due_day,
        active: !!property.active,
        group_id: property.group_id,
        electricity_payer: property.electricity_payer,
        tenant_selection: 0,
        new_tenant_name: '',
        new_tenant_phone: '',
        start_date: '',
        deposit: property.advance_paid || 0
      };
    } else {
      this.propertyForm = this.emptyProperty();
    }
    this.propertyTenantSearch = '';
    this.modal = 'property';
  }

  openPayment(property?: Property) {
    this.editingPayment = 0;
    this.paymentForm = this.emptyPayment();
    this.paymentForm.rental_month = this.dashboardStayMonth;
    if (property) {
      this.paymentForm.property_id = property.id;
      this.paymentForm.amount = property.monthly_rent ?? 0;
    }
    this.selectPaymentTenancy();
    this.modal = 'payment';
  }

  editPayment(payment: Payment) {
    this.editingPayment = payment.id;
    this.paymentForm = { ...payment };
    this.modal = 'payment';
  }

  openExpense(propertyId = 0, exp?: PropertyExpense) {
    this.editingExpense = exp?.id || 0;
    this.expenseForm = exp ? { ...exp } : { ...this.emptyExpense(), property_id: propertyId || (this.properties.length ? this.properties[0].id : 0) };
    this.modal = 'expense';
  }

  openGroup(group?: PropertyGroup) {
    this.editingGroup = group?.id || 0;
    this.groupForm = group ? { name: group.name, kind: group.kind } : { name: '', kind: 'Apartment' };
    this.modal = 'group';
  }

  openTax(groupId = 0) {
    this.editingTax = 0;
    this.taxForm = this.emptyTax();
    this.taxForm.group_id = groupId;
    this.modal = 'tax';
  }

  editTax(tax: GroupTax) {
    this.editingTax = tax.id;
    this.taxForm = { ...tax };
    this.modal = 'tax';
  }

  openElectricity() {
    this.editingElectricity = 0;
    this.electricityForm = this.emptyElectricity();
    this.modal = 'electricity';
  }

  editElectricity(bill: ElectricityBill) {
    this.editingElectricity = bill.id;
    this.electricityForm = { ...bill };
    this.modal = 'electricity';
  }

  openCollection(bill: ElectricityBill) {
    this.collectionForm = { id: bill.id, collected: bill.collected, amount: bill.amount };
    this.modal = 'collection';
  }

  openTenant(t?: Tenant) {
    this.tenantForm = t ? { ...t } : { id: 0, name: '', phone: '', notes: '' };
    this.modal = 'tenant';
  }

  openTenancy(t?: Tenancy) {
    if (t) {
      this.tenancyForm = {
        id: t.id,
        property_id: t.property_id,
        tenant_id: t.tenant_id,
        business_name: t.business_name || '',
        start_date: t.start_date || '',
        end_date: t.end_date || '',
        deposit: t.deposit || 0,
        initial_rent: t.initial_rent,
        notes: t.notes || ''
      };
    } else {
      this.tenancyForm = {
        id: 0,
        property_id: this.properties.length ? this.properties[0].id : 0,
        tenant_id: this.tenants.length ? this.tenants[0].id : 0,
        business_name: '',
        start_date: (this.dashboardStayMonth || new Date().toISOString().slice(0, 7)) + '-01',
        end_date: '',
        deposit: 0,
        initial_rent: null,
        notes: ''
      };
    }
    this.modal = 'tenancy';
  }

  openRate(t: Tenancy, r?: RentRate) {
    this.rateForm = r ? { ...r } : { id: 0, tenancy_id: t.id, effective_month: this.dashboardStayMonth, amount: t.initial_rent || 0 };
    this.modal = 'rate';
  }

  openRefund(t: Tenancy, r?: DepositRefund) {
    this.selectedTenancyForRefund = t;
    this.editingRefund = r?.id || 0;
    if (r) {
      this.refundForm = {
        tenancy_id: t.id,
        amount: r.amount,
        refunded_on: r.refunded_on,
        payment_method: r.payment_method,
        reference: r.reference,
        deduction_amount: r.deduction_amount,
        deduction_reason: r.deduction_reason,
        is_final_settlement: !!r.is_final_settlement,
        notes: r.notes
      };
    } else {
      const remainingBalance = (t.deposit_balance !== undefined ? t.deposit_balance : t.deposit) || 0;
      this.refundForm = {
        tenancy_id: t.id,
        amount: remainingBalance,
        refunded_on: new Date().toISOString().slice(0, 10),
        payment_method: 'Cash',
        reference: '',
        deduction_amount: 0,
        deduction_reason: '',
        is_final_settlement: true,
        notes: ''
      };
    }
    this.modal = 'refund';
  }

  openTransfer(t: Tenancy) {
    this.selectedTenancyForTransfer = t;
    const today = new Date().toISOString().slice(0, 10);
    const remainingDeposit = (t.deposit_balance !== undefined ? t.deposit_balance : t.deposit) || 0;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const rate = this.rates
      .filter(r => r.tenancy_id === t.id && r.effective_month <= currentMonth)
      .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
    const curRent = rate ? rate.amount : (t.initial_rent || 0);

    this.transferForm = {
      old_tenancy_id: t.id,
      handover_date: today,
      deposit_action: 'rollover_to_new_tenant',
      refund_amount: 0,
      deduction_amount: 0,
      deduction_reason: '',
      refund_payment_method: 'Bank transfer',
      refund_reference: '',
      new_tenant_id: 0,
      new_tenant_name: '',
      new_tenant_phone: '',
      takeover_start_date: today,
      business_name: t.business_name || '',
      new_rent: curRent,
      new_deposit: remainingDeposit,
      transfer_notes: ''
    };
    this.modal = 'transfer';
  }

  openPropertyTransfer(property: Property) {
    const activeTenancy = this.tenancies.find(t => t.property_id === property.id && (!t.end_date || t.end_date >= new Date().toISOString().slice(0, 10)));
    if (activeTenancy) {
      this.openTransfer(activeTenancy);
    } else {
      const anyTenancy = this.tenancies.find(t => t.property_id === property.id);
      if (anyTenancy) {
        this.openTransfer(anyTenancy);
      } else {
        this.error = 'No tenancy found for this property. Create a tenancy first.';
      }
    }
  }

  // --- Save / Delete Handlers ---
  saveProperty() {
    if (!this.propertyForm.group_id) {
      this.error = 'Please select a property group. Assigning a group is mandatory.';
      return;
    }
    if (this.propertyForm.id) {
      this.api.updateProperty(this.propertyForm.id, this.propertyForm).subscribe({
        next: () => this.done('Property saved'),
        error: err => this.error = err.error?.detail || 'Could not save property'
      });
      return;
    }

    const createPropAndTenancy = (tenantId: number | null) => {
      const payload = {
        name: this.propertyForm.name,
        address: this.propertyForm.address,
        property_type: this.propertyForm.property_type || 'House',
        due_day: this.propertyForm.due_day,
        active: this.propertyForm.active,
        group_id: this.propertyForm.group_id,
        electricity_payer: this.propertyForm.electricity_payer,
        tenant_name: '',
        tenant_phone: '',
        monthly_rent: 0,
        advance_paid: 0
      };
      this.api.addProperty(payload).subscribe({
        next: (newProp: Property) => {
          if (tenantId) {
            const effectiveStay = this.dashboardStayMonth || new Date().toISOString().slice(0, 7);
            const tenancyPayload = {
              property_id: newProp.id,
              tenant_id: tenantId,
              business_name: this.propertyForm.property_type === 'Shop' ? this.propertyForm.business_name : '',
              start_date: this.propertyForm.start_date || (effectiveStay + '-01'),
              end_date: null,
              deposit: this.propertyForm.deposit || 0,
              initial_rent: this.propertyForm.monthly_rent || 0,
              notes: ''
            };
            this.api.saveTenancyRecord('tenancies', 0, tenancyPayload).subscribe({
              next: () => this.done('Property and tenancy created'),
              error: err => this.done('Property created, but could not link tenancy: ' + (err.error?.detail || ''))
            });
          } else {
            this.done('Property created');
          }
        },
        error: err => this.error = err.error?.detail || 'Could not save property'
      });
    };

    if (this.propertyForm.tenant_selection === -1) {
      if (!this.propertyForm.new_tenant_name.trim()) {
        this.error = 'Please enter a name for the new tenant.';
        return;
      }
      this.api.saveTenancyRecord('tenants', 0, {
        name: this.propertyForm.new_tenant_name.trim(),
        phone: this.propertyForm.new_tenant_phone.trim(),
        notes: ''
      }).subscribe({
        next: (createdTenant: any) => createPropAndTenancy(createdTenant.id),
        error: err => this.error = err.error?.detail || 'Could not create new tenant'
      });
    } else if (this.propertyForm.tenant_selection > 0) {
      createPropAndTenancy(this.propertyForm.tenant_selection);
    } else {
      createPropAndTenancy(null);
    }
  }

  savePayment() {
    (this.editingPayment ? this.api.updateRecord('payments', this.editingPayment, this.paymentForm) : this.api.addPayment(this.paymentForm)).subscribe({
      next: () => this.done('Rent payment saved'),
      error: err => this.error = err.error?.detail || 'Could not record payment'
    });
  }

  removePayment(payment: Payment) {
    if (confirm(`Delete payment #${payment.id}?`)) {
      this.api.deletePayment(payment.id).subscribe(() => this.done('Payment deleted'));
    }
  }

  saveExpense() {
    (this.editingExpense ? this.api.updateRecord('expenses', this.editingExpense, this.expenseForm) : this.api.addExpense(this.expenseForm)).subscribe({
      next: () => this.done('Property expense saved'),
      error: e => this.showError(e)
    });
  }

  removeExpenseRecord(e: PropertyExpense) {
    if (confirm(`Delete this expense of ${this.currency(e.amount)}?`)) {
      this.api.deleteExpense('expenses', e.id).subscribe({
        next: () => this.done('Expense record deleted'),
        error: err => this.showError(err)
      });
    }
  }

  saveGroup() {
    (this.editingGroup ? this.api.updateRecord('groups', this.editingGroup, this.groupForm) : this.api.addGroup(this.groupForm)).subscribe({
      next: () => {
        this.groupForm = { name: '', kind: 'Apartment' };
        this.done('Group saved');
      },
      error: e => this.showError(e)
    });
  }

  removeGroup(group: PropertyGroup) {
    if (group.property_tax > 0 || group.water_tax > 0) {
      this.error = 'This group has tax records and cannot be deleted. Keep the group to preserve its tax history.';
      return;
    }
    if (!confirm(`Delete group "${group.name}"? Its properties will move to Ungrouped. Rent payments and electricity bills will be kept.`)) return;
    this.api.deleteGroup(group.id).subscribe({
      next: () => this.done('Group deleted; properties and payments preserved'),
      error: e => this.showError(e)
    });
  }

  saveTax() {
    (this.editingTax ? this.api.updateRecord('taxes', this.editingTax, this.taxForm) : this.api.addTax(this.taxForm)).subscribe({
      next: () => this.done('Tax payment saved'),
      error: e => this.showError(e)
    });
  }

  saveElectricity() {
    (this.editingElectricity ? this.api.updateRecord('electricity', this.editingElectricity, this.electricityForm) : this.api.addElectricity(this.electricityForm)).subscribe({
      next: () => this.done('Electricity bill saved'),
      error: e => this.showError(e)
    });
  }

  saveCollection() {
    this.api.collectElectricity(this.collectionForm.id, this.collectionForm.collected).subscribe({
      next: () => this.done('Collection updated'),
      error: e => this.showError(e)
    });
  }

  removeExpense(type: 'taxes' | 'electricity', id: number) {
    if (confirm('Delete this record?')) {
      this.api.deleteExpense(type, id).subscribe({
        next: () => this.done('Record deleted'),
        error: e => this.showError(e)
      });
    }
  }

  saveTenant() {
    this.api.saveTenancyRecord('tenants', this.tenantForm.id, this.tenantForm).subscribe({
      next: () => this.done('Tenant saved'),
      error: e => this.showError(e)
    });
  }

  saveTenancy() {
    this.api.saveTenancyRecord('tenancies', this.tenancyForm.id, {
      ...this.tenancyForm,
      start_date: this.tenancyForm.start_date || null,
      end_date: this.tenancyForm.end_date || null,
      initial_rent: this.tenancyForm.start_date ? this.tenancyForm.initial_rent : null
    }).subscribe({
      next: () => this.done('Tenancy saved'),
      error: e => this.showError(e)
    });
  }

  saveRate() {
    this.api.saveTenancyRecord('rent-rates', this.rateForm.id, this.rateForm).subscribe({
      next: () => this.done('Rent rate saved'),
      error: e => this.showError(e)
    });
  }

  saveRefund() {
    const req = this.editingRefund ? this.api.updateDepositRefund(this.editingRefund, this.refundForm) : this.api.addDepositRefund(this.refundForm);
    req.subscribe({
      next: () => this.done('Deposit refund saved'),
      error: e => this.showError(e)
    });
  }

  removeRefund(r: DepositRefund) {
    if (confirm('Delete this deposit refund record?')) {
      this.api.deleteDepositRefund(r.id).subscribe({
        next: () => this.done('Deposit refund deleted'),
        error: e => this.showError(e)
      });
    }
  }

  removeProperty(property: Property) {
    if (!confirm(`Delete property "${property.name}"? This cannot be undone. Properties with rent payments, electricity bills, or tenancy history cannot be deleted.`)) return;
    this.api.deleteProperty(property.id).subscribe({
      next: () => this.done('Property deleted'),
      error: e => this.showError(e)
    });
  }

  saveTransfer() {
    if (!this.transferForm.old_tenancy_id) return;
    if (!this.transferForm.new_tenant_id && !this.transferForm.new_tenant_name?.trim()) {
      this.error = 'Please select an existing tenant or enter a name for the new tenant.';
      return;
    }
    this.api.transferTenancy(this.transferForm).subscribe({
      next: () => this.done('Tenancy transferred and new tenant takeover recorded!'),
      error: e => this.showError(e)
    });
  }

  // --- Transfer helper calculations ---
  onTransferDepositActionChange() {
    if (!this.selectedTenancyForTransfer) return;
    const remaining = (this.selectedTenancyForTransfer.deposit_balance !== undefined ? this.selectedTenancyForTransfer.deposit_balance : this.selectedTenancyForTransfer.deposit) || 0;
    if (this.transferForm.deposit_action === 'rollover_to_new_tenant') {
      this.transferForm.new_deposit = remaining;
      this.transferForm.refund_amount = 0;
      this.transferForm.deduction_amount = 0;
    } else if (this.transferForm.deposit_action === 'refund_now') {
      this.transferForm.refund_amount = remaining;
      this.transferForm.deduction_amount = 0;
      this.transferForm.new_deposit = remaining;
    } else {
      this.transferForm.refund_amount = 0;
      this.transferForm.deduction_amount = 0;
    }
  }

  autoFillTransferDeduction() {
    if (!this.selectedTenancyForTransfer) return;
    const remaining = (this.selectedTenancyForTransfer.deposit_balance !== undefined ? this.selectedTenancyForTransfer.deposit_balance : this.selectedTenancyForTransfer.deposit) || 0;
    const refAmt = Number(this.transferForm.refund_amount) || 0;
    this.transferForm.deduction_amount = Math.max(remaining - refAmt, 0);
    if (!this.transferForm.deduction_reason) {
      this.transferForm.deduction_reason = 'Whitewashing & painting charges';
    }
  }

  // --- Payment Tenancy Calculation ---
  get paymentTenancies() {
    return this.tenancies.filter(t => t.property_id === this.paymentForm.property_id && (!t.start_date || t.start_date.slice(0, 7) <= this.paymentForm.rental_month) && (!t.end_date || t.end_date.slice(0, 7) >= this.paymentForm.rental_month));
  }

  get paymentNeedsTenancy() {
    return this.tenancies.some(t => t.property_id === this.paymentForm.property_id);
  }

  selectPaymentTenancy() {
    this.paymentForm.tenancy_id = this.paymentTenancies.length === 1 ? this.paymentTenancies[0].id : null;
    if (!this.editingPayment) this.fillPaymentRent();
  }

  fillPaymentRent() {
    const rate = this.rates.filter(r => r.tenancy_id === this.paymentForm.tenancy_id && r.effective_month <= this.paymentForm.rental_month).sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
    if (rate) this.paymentForm.amount = rate.amount;
  }

  setPaymentRentalMonth(month: string) {
    this.paymentForm.rental_month = month;
    this.selectPaymentTenancy();
  }

  onPaymentPaidOnChange() {
    if (!this.editingPayment && this.paymentForm.paid_on) {
      this.paymentForm.rental_month = this.getPreviousMonth(this.paymentForm.paid_on);
      this.selectPaymentTenancy();
    }
  }

  // --- Property Tenant Select Helpers ---
  get propertyHasTenancyHistory() {
    return this.properties.find(p => p.id === this.propertyForm.id)?.has_tenancy_history || false;
  }

  get filteredPropertyTenants(): Tenant[] {
    if (!this.propertyTenantSearch) return this.tenants;
    const q = this.propertyTenantSearch.toLowerCase().trim();
    return this.tenants.filter(t => [t.name, t.phone, t.notes].some(v => v?.toLowerCase().includes(q)));
  }

  get selectedTenantName(): string {
    if (this.propertyForm.tenant_selection === 0) return 'Vacant / No tenant';
    if (this.propertyForm.tenant_selection === -1) return '＋ Quick add new tenant...';
    const t = this.tenants.find(item => item.id === this.propertyForm.tenant_selection);
    return t ? t.name + (t.phone ? ' · ' + t.phone : '') : 'Selected tenant #' + this.propertyForm.tenant_selection;
  }

  selectPropertyTenant(tenantId: number) {
    this.propertyForm.tenant_selection = tenantId;
  }

  isShopProperty(propertyId: number): boolean {
    return this.properties.find(p => p.id === propertyId)?.property_type === 'Shop';
  }

  // --- Date & Formatting Utilities ---
  getPreviousMonth(m?: string): string {
    if (!m) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    }
    const [y, mon] = m.split('-').map(Number);
    const d = new Date(y, mon - 2, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  billingCycleDescription(rentalMonth?: string, paidOn?: string): string {
    if (!rentalMonth || !paidOn) return 'Select stay month and payment date';
    const rentParts = rentalMonth.split('-').map(Number);
    const paidParts = paidOn.split('-').map(Number);
    if (rentParts.length < 2 || paidParts.length < 2) return '';
    const rentDate = new Date(rentParts[0], rentParts[1] - 1, 1);
    const paidDate = new Date(paidParts[0], paidParts[1] - 1, paidParts[2] || 1);
    const rentName = rentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const paidDateFormatted = paidDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    if (paidOn.slice(0, 7) > rentalMonth) {
      return `Postpaid rent: Payment received on ${paidDateFormatted} covers tenant's stay during ${rentName}.`;
    } else if (paidOn.slice(0, 7) === rentalMonth) {
      return `Same-month payment: Received on ${paidDateFormatted} for ${rentName} stay.`;
    } else {
      return `Advance rent: Payment received on ${paidDateFormatted} in advance for upcoming ${rentName} stay.`;
    }
  }

  done(message: string) {
    this.modal = null;
    this.toast = message;
    this.loadAll();
    setTimeout(() => this.toast = '', 2800);
  }

  showError(e: any) {
    this.error = typeof e.error?.detail === 'string' ? e.error.detail : 'Please check the entered details and try again.';
  }

  currency(value: number | null | undefined) {
    if (value === null || value === undefined) return '—';
    return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
