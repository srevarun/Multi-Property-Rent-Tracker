import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Payment, Property, Tenant } from '../../models';

@Component({
  selector: 'app-payments-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payments.component.html'
})
export class PaymentsComponent {
  @Input() payments: Payment[] = [];
  @Input() properties: Property[] = [];
  @Input() tenants: Tenant[] = [];

  @Output() openPaymentRequested = new EventEmitter<void>();
  @Output() editPaymentRequested = new EventEmitter<Payment>();
  @Output() removePaymentRequested = new EventEmitter<Payment>();

  search: string = '';
  paymentPropertyFilter: string = '';
  paymentTenantFilter: string = '';
  paymentFromMonth: string = '';
  paymentToMonth: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  isPostpaid(rentalMonth?: string, paidOn?: string): boolean {
    if (!rentalMonth || !paidOn) return false;
    return paidOn.slice(0, 7) > rentalMonth;
  }

  get filteredPayments(): Payment[] {
    return this.payments.filter(p => {
      const matchProp = !this.paymentPropertyFilter || String(p.property_id) === this.paymentPropertyFilter;
      const matchTenant = !this.paymentTenantFilter || p.tenant_name === this.paymentTenantFilter;
      const matchFrom = !this.paymentFromMonth || p.rental_month >= this.paymentFromMonth;
      const matchTo = !this.paymentToMonth || p.rental_month <= this.paymentToMonth;
      const query = this.search.toLowerCase().trim();
      const matchSearch = !query || [p.reference, p.notes, p.property_name, p.tenant_name, p.business_name].some(v => v?.toLowerCase().includes(query));
      return matchProp && matchTenant && matchFrom && matchTo && matchSearch;
    });
  }

  get filteredPaymentsTotal(): number {
    return this.filteredPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  }
}
