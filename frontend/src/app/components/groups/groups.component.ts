import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyGroup, GroupTax } from '../../models';

@Component({
  selector: 'app-groups-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './groups.component.html'
})
export class GroupsComponent {
  @Input() groups: PropertyGroup[] = [];
  @Input() taxes: GroupTax[] = [];

  @Output() openGroupRequested = new EventEmitter<PropertyGroup | undefined>();
  @Output() openTaxRequested = new EventEmitter<number | undefined>();
  @Output() editTaxRequested = new EventEmitter<GroupTax>();
  @Output() removeTaxRequested = new EventEmitter<number>();
  @Output() removeGroupRequested = new EventEmitter<PropertyGroup>();
  @Output() filterPropertiesByGroupRequested = new EventEmitter<number>();

  taxGroupFilter: string = '';
  taxTypeFilter: string = '';
  taxFromDate: string = '';
  taxToDate: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  get visibleTaxes(): GroupTax[] {
    return this.taxes.filter(t => {
      const matchGroup = !this.taxGroupFilter || String(t.group_id) === this.taxGroupFilter;
      const matchType = !this.taxTypeFilter || t.tax_type === this.taxTypeFilter;
      const matchFrom = !this.taxFromDate || t.paid_on >= this.taxFromDate;
      const matchTo = !this.taxToDate || t.paid_on <= this.taxToDate;
      return matchGroup && matchType && matchFrom && matchTo;
    });
  }

  get visibleTaxesTotal(): number {
    return this.visibleTaxes.reduce((sum, t) => sum + (t.amount || 0), 0);
  }

  get visiblePropertyTaxTotal(): number {
    return this.visibleTaxes.filter(t => t.tax_type === 'Property tax').reduce((sum, t) => sum + (t.amount || 0), 0);
  }

  get visibleWaterTaxTotal(): number {
    return this.visibleTaxes.filter(t => t.tax_type === 'Water tax').reduce((sum, t) => sum + (t.amount || 0), 0);
  }
}
