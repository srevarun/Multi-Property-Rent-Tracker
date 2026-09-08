import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Property, PropertyGroup } from '../../models';

@Component({
  selector: 'app-properties-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './properties.component.html'
})
export class PropertiesComponent {
  @Input() properties: Property[] = [];
  @Input() groups: PropertyGroup[] = [];
  @Input() expensesTotalByProperty: Record<number, number> = {};

  @Output() openPropertyRequested = new EventEmitter<Property | undefined>();
  @Output() openPaymentRequested = new EventEmitter<Property>();
  @Output() openPropertyTransferRequested = new EventEmitter<Property>();
  @Output() openExpenseRequested = new EventEmitter<number>();
  @Output() openGroupRequested = new EventEmitter<void>();
  @Output() removePropertyRequested = new EventEmitter<Property>();

  propertyViewMode: 'grid' | 'table' = 'grid';
  search: string = '';
  groupFilter: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  propertyTypeIcon(type?: string): string {
    switch (type) {
      case 'Shop': return '🏪';
      case 'Storage unit': return '📦';
      case 'Warehouse': return '🏭';
      case 'Plot': return '🏞️';
      case 'Other': return '🏢';
      case 'House':
      default: return '🏠';
    }
  }

  propertyTotalExpenses(propertyId: number): number {
    return this.expensesTotalByProperty[propertyId] || 0;
  }

  get filteredProperties() {
    return this.properties.filter(p => {
      const matchGroup = !this.groupFilter || (this.groupFilter === 'ungrouped' ? !p.group_id : String(p.group_id) === this.groupFilter);
      const query = this.search.toLowerCase().trim();
      const matchSearch = !query || [p.name, p.tenant_name, p.address, p.business_name].some(v => v?.toLowerCase().includes(query));
      return matchGroup && matchSearch;
    });
  }
}
