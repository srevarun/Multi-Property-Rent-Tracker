import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { Property, Tenancy } from './models';

interface ArchiveEntry {
  id?: number; client_key: string; property_id: number; property_name?: string;
  rental_month: string | null; tenant_label: string; expected_rent: number | null;
  amount: number | null; paid_on: string | null; source: string; notes: string;
  review_status: string; payment_id?: number | null;
}
interface Tracking { id: number; start_month: string; opening_balance: number | null; tenant_label: string; notes: string; }
interface MonthRow { month: string; occupancy: string; review_status: string; expected_rent: number | null; collected: number; balance: number | null; archive_entries: number; before_tracking: boolean; notes: string; }

@Component({selector:'app-archive',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./archive.component.html',styleUrls:['./app.component.css','./archive.component.css']})
export class ArchiveComponent implements OnInit {
  @Input() properties: Property[]=[];
  @Input() tenancies: Tenancy[]=[];
  @Output() changed=new EventEmitter<void>();
  propertyId=0;
  year=new Date().getFullYear();
  entries: ArchiveEntry[]=[];
  drafts: ArchiveEntry[]=[];
  months: MonthRow[]=[];
  tracking: Tracking[]=[];
  trackingForm={start_month:'',opening_balance:null as number|null,tenant_label:'',notes:''};
  posting: ArchiveEntry|null=null;
  tenancyId: number|null=null;
  existingPaymentId: number|null=null;
  error=''; message=''; busy=false;
  constructor(private http:HttpClient) {}
  ngOnInit() { this.propertyId=this.properties[0]?.id || 0; this.load(); }
  fail(e:any) { const detail=e.error?.detail; this.error=typeof detail==='string'?detail:Array.isArray(detail)?detail.map((x:any)=>`${x.loc?.slice(1).join('.')}: ${x.msg}`).join('; '):'Could not save. Check the server and try again.'; this.busy=false; }
  load() { forkJoin({entries:this.http.get<ArchiveEntry[]>('/api/archive'),tracking:this.http.get<Tracking[]>('/api/tracking')}).subscribe({next:data=>{Object.assign(this,data);this.selectProperty();},error:e=>this.fail(e)}); }
  selectProperty() { const t=this.tracking.find(t=>t.id===this.propertyId);this.trackingForm=t?{...t}:{start_month:'',opening_balance:null,tenant_label:'',notes:''};this.loadLedger(); }
  loadLedger() { if(!this.propertyId) return;this.http.get<{months:MonthRow[]}>(`/api/monthly-ledger/${this.propertyId}`,{params:{year:this.year}}).subscribe({next:r=>this.months=r.months,error:e=>this.fail(e)}); }
  get visibleEntries() { return this.entries.filter(e=>e.property_id===this.propertyId); }
  get postingTenancies() { return this.tenancies.filter(t=>t.property_id===this.posting?.property_id && (!t.start_date || t.start_date.slice(0,7)<=(this.posting?.rental_month || '')) && (!t.end_date || t.end_date.slice(0,7)>=(this.posting?.rental_month || ''))); }
  get needsTenancy() { return this.tenancies.some(t=>t.property_id===this.posting?.property_id); }
  addRow() { this.drafts.push({client_key:crypto.randomUUID(),property_id:this.propertyId,rental_month:null,tenant_label:'',expected_rent:null,amount:null,paid_on:null,source:'',notes:'',review_status:'Partial'}); }
  editEntry(entry:ArchiveEntry) { if(!this.drafts.some(d=>d.client_key===entry.client_key))this.drafts.push({...entry}); }
  saveBatch() { this.busy=true;this.error='';this.http.post('/api/archive/batch',{entries:this.drafts.map(d=>({...d,rental_month:d.rental_month || null,paid_on:d.paid_on || null}))}).subscribe({next:()=>{this.busy=false;this.drafts=[];this.message='Archive saved. Nothing has been added to rent collections.';this.load();},error:e=>this.fail(e)}); }
  saveTracking() { this.busy=true;this.error='';this.http.put(`/api/tracking/${this.propertyId}`,this.trackingForm).subscribe({next:()=>{this.busy=false;this.message='Tracking baseline saved.';this.load();this.changed.emit();},error:e=>this.fail(e)}); }
  saveMonth(m:MonthRow) { this.busy=true;this.error='';this.http.put('/api/month-reviews',{property_id:this.propertyId,month:m.month,occupancy:m.occupancy,review_status:m.review_status==='Not reviewed'?'Partial':m.review_status,expected_rent:m.occupancy==='Vacant'?0:m.expected_rent,notes:m.notes}).subscribe({next:()=>{this.busy=false;this.message='Month review saved.';this.loadLedger();this.changed.emit();},error:e=>this.fail(e)}); }
  openPost(entry:ArchiveEntry) { this.posting=entry;this.existingPaymentId=null;this.tenancyId=this.postingTenancies.length===1?this.postingTenancies[0].id:null;this.error=''; }
  post() { if(!this.posting)return;this.busy=true;this.error='';this.http.post(`/api/archive/${this.posting.id}/post`,{tenancy_id:this.tenancyId,existing_payment_id:this.existingPaymentId}).subscribe({next:()=>{this.busy=false;this.posting=null;this.message='Archive entry linked to its rent payment.';this.load();this.changed.emit();},error:e=>this.fail(e)}); }
  removeEntry(e:ArchiveEntry) { if(!confirm('Delete this unposted archive entry?'))return;this.http.delete(`/api/archive/${e.id}`).subscribe({next:()=>this.load(),error:error=>this.fail(error)}); }
  money(v:number|null) { return v===null?'Unknown':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(v); }
}
