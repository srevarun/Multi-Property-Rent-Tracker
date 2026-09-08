import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertyExpense, Property, PropertyGroup } from '../../models';

@Component({
  selector: 'app-expenses-view',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './expenses.component.html'
})
export class ExpensesComponent {
  @Input() expenses: PropertyExpense[] = [];
  @Input() properties: Property[] = [];
  @Input() groups: PropertyGroup[] = [];

  @Output() openExpenseRequested = new EventEmitter<{ propertyId?: number, expense?: PropertyExpense }>();
  @Output() removeExpenseRequested = new EventEmitter<PropertyExpense>();

  expenseSearch: string = '';
  expensePropertyFilter: string = '';
  expenseGroupFilter: string = '';
  expenseCategoryFilter: string = '';
  expenseFromDate: string = '';
  expenseToDate: string = '';

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  get filteredExpenses(): PropertyExpense[] {
    return this.expenses.filter(e => {
      const matchProp = !this.expensePropertyFilter || String(e.property_id) === this.expensePropertyFilter;
      const matchGroup = !this.expenseGroupFilter || (this.expenseGroupFilter === 'ungrouped' ? !e.group_id : String(e.group_id) === this.expenseGroupFilter);
      const matchCat = !this.expenseCategoryFilter || e.category === this.expenseCategoryFilter;
      const matchFrom = !this.expenseFromDate || e.expense_date >= this.expenseFromDate;
      const matchTo = !this.expenseToDate || e.expense_date <= this.expenseToDate;
      const query = this.expenseSearch.toLowerCase().trim();
      const matchSearch = !query || [e.paid_to, e.reference, e.notes, e.property_name, e.category].some(v => v?.toLowerCase().includes(query));
      return matchProp && matchGroup && matchCat && matchFrom && matchTo && matchSearch;
    });
  }

  get filteredExpensesTotal(): number {
    return this.filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  }

  get expensesCategoryBreakdown(): { category: string, total: number, count: number }[] {
    const map = new Map<string, { total: number, count: number }>();
    for (const e of this.filteredExpenses) {
      const cur = map.get(e.category) || { total: 0, count: 0 };
      cur.total += e.amount || 0;
      cur.count += 1;
      map.set(e.category, cur);
    }
    return Array.from(map.entries()).map(([category, val]) => ({
      category,
      total: val.total,
      count: val.count
    })).sort((a, b) => b.total - a.total);
  }
}
