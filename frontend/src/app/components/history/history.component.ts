import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditHistory } from '../../models';

@Component({
  selector: 'app-history-view',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.component.html'
})
export class HistoryComponent {
  @Input() history: EditHistory[] = [];

  historyFilter: string = '';

  get visibleHistory(): EditHistory[] {
    return this.history.filter(h => !this.historyFilter || h.entity === this.historyFilter);
  }

  entityName(entity: string): string {
    const map: Record<string, string> = {
      tenants: 'Tenant',
      tenancies: 'Tenancy',
      rent_rates: 'Rent rate',
      deposit_refunds: 'Deposit refund',
      property_expenses: 'Property expense',
      properties: 'Property',
      property_groups: 'Group',
      rent_payments: 'Rent payment',
      group_taxes: 'Tax payment',
      electricity_bills: 'Electricity bill'
    };
    return map[entity] || entity;
  }

  fieldName(field: string): string {
    return field.replace(/_/g, ' ');
  }

  historyValue(value: unknown): string {
    return value === null || value === '' ? '—' : String(value);
  }
}
