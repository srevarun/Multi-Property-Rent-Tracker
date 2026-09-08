import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  Dashboard, Payment, Property, PropertyGroup, GroupTax, ElectricityBill,
  PropertyExpense, EditHistory, Tenant, Tenancy, RentRate, DepositRefund,
  BackupStatus, GoogleDriveConfigModel, BackupHistoryItem, AuthUser, LoginResult
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';
  private readonly TOKEN_KEY = 'rent_tracker_auth_token';
  private readonly USER_KEY = 'rent_tracker_auth_user';

  constructor(private http: HttpClient) {}

  getAuthToken(): string {
    return localStorage.getItem(this.TOKEN_KEY) || '';
  }

  setAuthToken(token: string) {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  getCurrentUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setCurrentUser(user: AuthUser | null) {
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.USER_KEY);
    }
  }

  clearAuth() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  private authHeaders(): { headers?: HttpHeaders } {
    const token = this.getAuthToken();
    if (!token) return {};
    return { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
  }

  // Authentication API
  login(body: { username: string; password: string; remember_me?: boolean }) {
    return this.http.post<LoginResult>(`${this.base}/auth/login`, body);
  }

  getMe() {
    return this.http.get<{ status: string; user: AuthUser }>(`${this.base}/auth/me`, this.authHeaders());
  }

  logout() {
    return this.http.post(`${this.base}/auth/logout`, {}, this.authHeaders());
  }

  changePassword(body: { current_password: string; new_password: string }) {
    return this.http.post(`${this.base}/auth/change-password`, body, this.authHeaders());
  }

  dashboard(month: string) { return this.http.get<Dashboard>(`${this.base}/dashboard`, { params: { month }, ...this.authHeaders() }); }
  properties() { return this.http.get<Property[]>(`${this.base}/properties`, this.authHeaders()); }
  addProperty(body: object) { return this.http.post<Property>(`${this.base}/properties`, body, this.authHeaders()); }
  updateProperty(id: number, body: object) { return this.http.put<Property>(`${this.base}/properties/${id}`, body, this.authHeaders()); }
  payments() { return this.http.get<Payment[]>(`${this.base}/payments`, this.authHeaders()); }
  addPayment(body: object) { return this.http.post<Payment>(`${this.base}/payments`, body, this.authHeaders()); }
  deletePayment(id: number) { return this.http.delete(`${this.base}/payments/${id}`, this.authHeaders()); }
  groups() { return this.http.get<PropertyGroup[]>(`${this.base}/groups`, this.authHeaders()); }
  addGroup(body: object) { return this.http.post(`${this.base}/groups`, body, this.authHeaders()); }
  taxes() { return this.http.get<GroupTax[]>(`${this.base}/taxes`, this.authHeaders()); }
  addTax(body: object) { return this.http.post(`${this.base}/taxes`, body, this.authHeaders()); }
  electricity() { return this.http.get<ElectricityBill[]>(`${this.base}/electricity`, this.authHeaders()); }
  addElectricity(body: object) { return this.http.post(`${this.base}/electricity`, body, this.authHeaders()); }
  collectElectricity(id: number, collected: number) { return this.http.put(`${this.base}/electricity/${id}/collection`, { collected }, this.authHeaders()); }
  expenses() { return this.http.get<PropertyExpense[]>(`${this.base}/expenses`, this.authHeaders()); }
  addExpense(body: object) { return this.http.post<PropertyExpense>(`${this.base}/expenses`, body, this.authHeaders()); }
  deleteProperty(id: number) { return this.http.delete(`${this.base}/properties/${id}`, this.authHeaders()); }
  deleteGroup(id: number) { return this.http.delete(`${this.base}/groups/${id}`, this.authHeaders()); }
  deleteExpense(type: 'taxes' | 'electricity' | 'expenses', id: number) { return this.http.delete(`${this.base}/${type}/${id}`, this.authHeaders()); }
  editHistory() { return this.http.get<EditHistory[]>(`${this.base}/edit-history`, this.authHeaders()); }
  updateRecord(type: 'groups' | 'payments' | 'taxes' | 'electricity' | 'expenses', id: number, body: object) { return this.http.put(`${this.base}/${type}/${id}`, body, this.authHeaders()); }
  tenants() { return this.http.get<Tenant[]>(`${this.base}/tenants`, this.authHeaders()); }
  tenancies() { return this.http.get<Tenancy[]>(`${this.base}/tenancies`, this.authHeaders()); }
  rates() { return this.http.get<RentRate[]>(`${this.base}/rent-rates`, this.authHeaders()); }
  saveTenancyRecord(type: 'tenants' | 'tenancies' | 'rent-rates', id: number, body: object) { return id ? this.http.put(`${this.base}/${type}/${id}`, body, this.authHeaders()) : this.http.post(`${this.base}/${type}`, body, this.authHeaders()); }
  depositRefunds(tenancyId?: number) { return this.http.get<DepositRefund[]>(`${this.base}/deposit-refunds`, { params: tenancyId ? { tenancy_id: tenancyId } : {}, ...this.authHeaders() }); }
  addDepositRefund(body: object) { return this.http.post<DepositRefund>(`${this.base}/deposit-refunds`, body, this.authHeaders()); }
  updateDepositRefund(id: number, body: object) { return this.http.put<DepositRefund>(`${this.base}/deposit-refunds/${id}`, body, this.authHeaders()); }
  deleteDepositRefund(id: number) { return this.http.delete(`${this.base}/deposit-refunds/${id}`, this.authHeaders()); }
  transferTenancy(body: object) { return this.http.post(`${this.base}/tenancies/transfer`, body, this.authHeaders()); }
  exportUrl() { return `${this.base}/export`; }

  // Cloud & Local Database Backups
  backupStatus() { return this.http.get<BackupStatus>(`${this.base}/backup/status`, this.authHeaders()); }
  backupDownloadUrl() { return `${this.base}/backup/download`; }
  saveGoogleDriveConfig(body: object) { return this.http.post<{ status: string, message: string }>(`${this.base}/backup/google-drive/config`, body, this.authHeaders()); }
  getGoogleDriveConfig() { return this.http.get<GoogleDriveConfigModel>(`${this.base}/backup/google-drive/config`, this.authHeaders()); }
  connectGoogleDriveOAuth(access_token: string, client_id?: string) { return this.http.post<{ status: string, email: string, name: string, message: string }>(`${this.base}/backup/google-drive/connect`, { access_token, client_id }, this.authHeaders()); }
  disconnectGoogleDrive() { return this.http.post<{ status: string, message: string }>(`${this.base}/backup/google-drive/disconnect`, {}, this.authHeaders()); }
  uploadGoogleDriveBackup() { return this.http.post<any>(`${this.base}/backup/google-drive/upload`, {}, this.authHeaders()); }
  googleDriveFiles() { return this.http.get<{ cloud_files: any[], history: BackupHistoryItem[] }>(`${this.base}/backup/google-drive/files`, this.authHeaders()); }
}

