import { Component, EventEmitter, OnInit, Output, ViewEncapsulation } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../api.service";
import { BackupStatus, GoogleDriveConfigModel } from "../../models";

@Component({
  selector: "app-backup-modal",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: "./backup-modal.component.html"
})
export class BackupModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  activeTab: "overview" | "settings" = "overview";
  status?: BackupStatus;
  config?: GoogleDriveConfigModel;

  loading = true;
  backingUp = false;
  savingConfig = false;
  message = "";
  error = "";

  configForm = {
    service_account_json: "",
    access_token: "",
    folder_name: "Rent Tracker Backups",
    folder_id: "",
    local_drive_path: ""
  };

  constructor(public api: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading = true;
    this.error = "";
    this.api.backupStatus().subscribe({
      next: res => {
        this.status = res;
        this.loading = false;
      },
      error: err => {
        this.error = "Could not load backup status. Make sure the backend server is running.";
        this.loading = false;
      }
    });

    this.api.getGoogleDriveConfig().subscribe({
      next: cfg => {
        this.config = cfg;
        this.configForm.folder_name = cfg.folder_name || "Rent Tracker Backups";
        this.configForm.folder_id = cfg.folder_id || "";
        this.configForm.local_drive_path = cfg.local_drive_path || "";
      }
    });
  }

  triggerGoogleDriveBackup() {
    this.backingUp = true;
    this.error = "";
    this.message = "";

    this.api.uploadGoogleDriveBackup().subscribe({
      next: res => {
        this.backingUp = false;
        this.message = res.message || "Database backup successfully uploaded to Google Drive!";
        this.loadData();
      },
      error: err => {
        this.backingUp = false;
        this.error = err.error?.detail || "Google Drive backup failed. Check your credentials in Settings.";
      }
    });
  }

  saveSettings() {
    this.savingConfig = true;
    this.error = "";
    this.message = "";

    const payload: any = {
      folder_name: this.configForm.folder_name,
      folder_id: this.configForm.folder_id,
      local_drive_path: this.configForm.local_drive_path
    };

    if (this.configForm.service_account_json.trim()) {
      payload.service_account_json = this.configForm.service_account_json.trim();
    }
    if (this.configForm.access_token.trim()) {
      payload.access_token = this.configForm.access_token.trim();
    }

    this.api.saveGoogleDriveConfig(payload).subscribe({
      next: res => {
        this.savingConfig = false;
        this.message = "Google Drive backup settings saved successfully!";
        this.configForm.service_account_json = "";
        this.configForm.access_token = "";
        this.loadData();
      },
      error: err => {
        this.savingConfig = false;
        this.error = err.error?.detail || "Could not save configuration.";
      }
    });
  }

  formatSize(bytes: number): string {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }
}
