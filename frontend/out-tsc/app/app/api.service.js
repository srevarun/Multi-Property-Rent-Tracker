import { Injectable } from '@angular/core';
import * as i0 from "@angular/core";
import * as i1 from "@angular/common/http";
export class ApiService {
    constructor(http) {
        this.http = http;
        this.base = '/api';
    }
    dashboard(month) { return this.http.get(`${this.base}/dashboard`, { params: { month } }); }
    subareas() { return this.http.get(`${this.base}/subareas`); }
    addSubarea(body) { return this.http.post(`${this.base}/subareas`, body); }
    properties() { return this.http.get(`${this.base}/properties`); }
    addProperty(body) { return this.http.post(`${this.base}/properties`, body); }
    updateProperty(id, body) { return this.http.put(`${this.base}/properties/${id}`, body); }
    payments() { return this.http.get(`${this.base}/payments`); }
    addPayment(body) { return this.http.post(`${this.base}/payments`, body); }
    deletePayment(id) { return this.http.delete(`${this.base}/payments/${id}`); }
    groups() { return this.http.get(`${this.base}/groups`); }
    addGroup(body) { return this.http.post(`${this.base}/groups`, body); }
    taxes() { return this.http.get(`${this.base}/taxes`); }
    addTax(body) { return this.http.post(`${this.base}/taxes`, body); }
    electricity() { return this.http.get(`${this.base}/electricity`); }
    addElectricity(body) { return this.http.post(`${this.base}/electricity`, body); }
    collectElectricity(id, collected) { return this.http.put(`${this.base}/electricity/${id}/collection`, { collected }); }
    deleteExpense(type, id) { return this.http.delete(`${this.base}/${type}/${id}`); }
    exportUrl() { return `${this.base}/export`; }
    static { this.ɵfac = function ApiService_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ApiService)(i0.ɵɵinject(i1.HttpClient)); }; }
    static { this.ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ApiService, factory: ApiService.ɵfac, providedIn: 'root' }); }
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ApiService, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.HttpClient }], null); })();
//# sourceMappingURL=api.service.js.map