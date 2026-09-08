import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tenant, Tenancy, Property, PropertyGroup, RentRate, DepositRefund } from '../../models';

@Component({
  selector: 'app-tenants-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tenants.component.html'
})
export class TenantsComponent {
  @Input() tenants: Tenant[] = [];
  @Input() tenancies: Tenancy[] = [];
  @Input() properties: Property[] = [];
  @Input() groups: PropertyGroup[] = [];
  @Input() rates: RentRate[] = [];
  @Input() paymentsTotalByTenant: Record<string, number> = {};

  @Output() openTenantRequested = new EventEmitter<Tenant | undefined>();
  @Output() openTenancyRequested = new EventEmitter<Tenancy | undefined>();
  @Output() openTransferRequested = new EventEmitter<Tenancy>();
  @Output() openRateRequested = new EventEmitter<{ tenancy: Tenancy, rate?: RentRate }>();
  @Output() openRefundRequested = new EventEmitter<{ tenancy: Tenancy, refund?: DepositRefund }>();
  @Output() removeRefundRequested = new EventEmitter<DepositRefund>();

  tenantSearch: string = '';
  tenancySearch: string = '';
  tenancyGroupFilter: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  tenantTotalPaid(name: string): number {
    return this.paymentsTotalByTenant[name] || 0;
  }

  tenancyRates(tenancyId: number): RentRate[] {
    return this.rates.filter(r => r.tenancy_id === tenancyId).sort((a, b) => b.effective_month.localeCompare(a.effective_month));
  }

  get filteredTenants(): Tenant[] {
    const q = this.tenantSearch.toLowerCase().trim();
    if (!q) return this.tenants;
    return this.tenants.filter(t => [t.name, t.phone, t.notes].some(v => v?.toLowerCase().includes(q)));
  }

  get filteredTenancies(): Tenancy[] {
    return this.tenancies.filter(t => {
      const matchGroup = !this.tenancyGroupFilter || (this.tenancyGroupFilter === 'ungrouped' ? !t.group_name : String(this.groups.find(g => g.name === t.group_name)?.id) === this.tenancyGroupFilter);
      const query = this.tenancySearch.toLowerCase().trim();
      const matchSearch = !query || [t.property_name, t.tenant_name, t.business_name, t.notes, t.group_name].some(v => v?.toLowerCase().includes(query));
      return matchGroup && matchSearch;
    });
  }
}
