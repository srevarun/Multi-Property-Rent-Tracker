import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ElectricityBill, Property } from '../../models';

@Component({
  selector: 'app-electricity-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './electricity.component.html'
})
export class ElectricityComponent {
  @Input() electricity: ElectricityBill[] = [];
  @Input() ownerProperties: Property[] = [];
  @Input() electricityPending: number = 0;

  @Output() openElectricityRequested = new EventEmitter<void>();
  @Output() editElectricityRequested = new EventEmitter<ElectricityBill>();
  @Output() openCollectionRequested = new EventEmitter<ElectricityBill>();
  @Output() removeElectricityRequested = new EventEmitter<number>();

  currency(n?: number | null): string {
    if (n === undefined || n === null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
