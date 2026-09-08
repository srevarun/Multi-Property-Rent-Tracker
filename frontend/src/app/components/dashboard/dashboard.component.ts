import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dashboard, PropertyGroup, Property } from '../../models';

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  @Input() dashboard?: Dashboard;
  @Input() selectedMonth: string = '';
  @Input() dashboardStayMonth: string = '';
  @Input() groups: PropertyGroup[] = [];

  @Output() monthChange = new EventEmitter<string>();
  @Output() openPropertyRequested = new EventEmitter<void>();
  @Output() openGroupRequested = new EventEmitter<void>();
  @Output() openPaymentRequested = new EventEmitter<Property>();

  dashboardGroupFilter: string = '';
  dashboardSearch: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  getNextMonth(m?: string): string {
    const base = m ? new Date(m + '-01T00:00:00') : new Date();
    base.setMonth(base.getMonth() + 1);
    return base.toISOString().slice(0, 7);
  }

  setDashboardGroup(groupId: string) {
    this.dashboardGroupFilter = this.dashboardGroupFilter === groupId ? '' : groupId;
  }

  get groupSummaryStats() {
    if (this.dashboard?.group_summaries && this.dashboard.group_summaries.length) {
      return this.dashboard.group_summaries.map(g => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        totalUnits: g.total_units,
        expected: g.expected,
        collected: g.collected,
        pending: g.pending,
        pendingCount: g.pending_count,
        rate: g.rate
      }));
    }
    return this.groups.map(g => {
      const pendings = (this.dashboard?.pending_properties || []).filter(p => p.group_id === g.id);
      return {
        id: g.id,
        name: g.name,
        kind: g.kind,
        totalUnits: g.property_count || 0,
        expected: 0,
        collected: 0,
        pending: 0,
        pendingCount: pendings.length,
        rate: 0
      };
    });
  }

  get filteredDashboardPending() {
    return (this.dashboard?.pending_properties || []).filter(p => {
      const matchGroup = !this.dashboardGroupFilter || String(p.group_id) === this.dashboardGroupFilter;
      const q = this.dashboardSearch.toLowerCase().trim();
      const matchSearch = !q || [p.name, p.tenant_name, p.business_name].some(v => v?.toLowerCase().includes(q));
      return matchGroup && matchSearch;
    });
  }
}
