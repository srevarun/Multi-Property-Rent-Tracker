import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Dashboard, Payment, Property, PropertyGroup, GroupTax, ElectricityBill,
  PropertyExpense, EditHistory, Tenant, Tenancy, RentRate, DepositRefund,
  BackupStatus, GoogleDriveConfigModel, BackupHistoryItem
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';
  constructor(private http: HttpClient) {}
  dashboard(month: string) { return this.http.get<Dashboard>(`${this.base}/dashboard`, { params: { month } }); }
  properties() { return this.http.get<Property[]>(`${this.base}/properties`); }
  addProperty(body: object) { return this.http.post<Property>(`${this.base}/properties`, body); }
  updateProperty(id: number, body: object) { return this.http.put<Property>(`${this.base}/properties/${id}`, body); }
  payments() { return this.http.get<Payment[]>(`${this.base}/payments`); }
  addPayment(body: object) { return this.http.post<Payment>(`${this.base}/payments`, body); }
  deletePayment(id: number) { return this.http.delete(`${this.base}/payments/${id}`); }
  groups() { return this.http.get<PropertyGroup[]>(`${this.base}/groups`); }
  addGroup(body: object) { return this.http.post(`${this.base}/groups`, body); }
  taxes() { return this.http.get<GroupTax[]>(`${this.base}/taxes`); }
  addTax(body: object) { return this.http.post(`${this.base}/taxes`, body); }
  electricity() { return this.http.get<ElectricityBill[]>(`${this.base}/electricity`); }
  addElectricity(body: object) { return this.http.post(`${this.base}/electricity`, body); }
  collectElectricity(id: number, collected: number) { return this.http.put(`${this.base}/electricity/${id}/collection`, { collected }); }
  expenses() { return this.http.get<PropertyExpense[]>(`${this.base}/expenses`); }
  addExpense(body: object) { return this.http.post<PropertyExpense>(`${this.base}/expenses`, body); }
  deleteProperty(id: number) { return this.http.delete(`${this.base}/properties/${id}`); }
  deleteGroup(id: number) { return this.http.delete(`${this.base}/groups/${id}`); }
  deleteExpense(type: 'taxes' | 'electricity' | 'expenses', id: number) { return this.http.delete(`${this.base}/${type}/${id}`); }
  editHistory() { return this.http.get<EditHistory[]>(`${this.base}/edit-history`); }
  updateRecord(type: 'groups' | 'payments' | 'taxes' | 'electricity' | 'expenses', id: number, body: object) { return this.http.put(`${this.base}/${type}/${id}`, body); }
  tenants() { return this.http.get<Tenant[]>(`${this.base}/tenants`); }
  tenancies() { return this.http.get<Tenancy[]>(`${this.base}/tenancies`); }
  rates() { return this.http.get<RentRate[]>(`${this.base}/rent-rates`); }
  saveTenancyRecord(type: 'tenants' | 'tenancies' | 'rent-rates', id: number, body: object) { return id ? this.http.put(`${this.base}/${type}/${id}`, body) : this.http.post(`${this.base}/${type}`, body); }
  depositRefunds(tenancyId?: number) { return this.http.get<DepositRefund[]>(`${this.base}/deposit-refunds`, { params: tenancyId ? { tenancy_id: tenancyId } : {} }); }
  addDepositRefund(body: object) { return this.http.post<DepositRefund>(`${this.base}/deposit-refunds`, body); }
  updateDepositRefund(id: number, body: object) { return this.http.put<DepositRefund>(`${this.base}/deposit-refunds/${id}`, body); }
  deleteDepositRefund(id: number) { return this.http.delete(`${this.base}/deposit-refunds/${id}`); }
  transferTenancy(body: object) { return this.http.post(`${this.base}/tenancies/transfer`, body); }
  exportUrl() { return `${this.base}/export`; }

  // Cloud & Local Database Backups
  backupStatus() { return this.http.get<BackupStatus>(`${this.base}/backup/status`); }
  backupDownloadUrl() { return `${this.base}/backup/download`; }
  saveGoogleDriveConfig(body: object) { return this.http.post<{ status: string, message: string }>(`${this.base}/backup/google-drive/config`, body); }
  getGoogleDriveConfig() { return this.http.get<GoogleDriveConfigModel>(`${this.base}/backup/google-drive/config`); }
  connectGoogleDriveOAuth(access_token: string, client_id?: string) { return this.http.post<{ status: string, email: string, name: string, message: string }>(`${this.base}/backup/google-drive/connect`, { access_token, client_id }); }
  disconnectGoogleDrive() { return this.http.post<{ status: string, message: string }>(`${this.base}/backup/google-drive/disconnect`, {}); }
  uploadGoogleDriveBackup() { return this.http.post<any>(`${this.base}/backup/google-drive/upload`, {}); }
  googleDriveFiles() { return this.http.get<{ cloud_files: any[], history: BackupHistoryItem[] }>(`${this.base}/backup/google-drive/files`); }
}

