import { Component, EventEmitter, OnInit, Output, ViewEncapsulation } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../api.service";
import { BackupStatus, GoogleDriveConfigModel } from "../../models";

declare const google: any;

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
  connectingSSO = false;
  message = "";
  error = "";

  // Config Form
  configForm = {
    client_id: "",
    service_account_json: "",
    access_token: "",
    folder_name: "Rent Tracker Backups",
    folder_id: "",
    local_drive_path: ""
  };

  constructor(public api: ApiService) {}

  ngOnInit() {
    this.loadGoogleScript();
    this.loadData();
  }

  loadGoogleScript() {
    if (typeof window !== "undefined" && !document.getElementById("google-gsi-script")) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }

  loadData() {
    this.loading = true;
    this.error = "";
    this.api.backupStatus().subscribe({
      next: res => {
        this.status = res;
        this.loading = false;
      },
      error: () => {
        this.error = "Could not load backup status. Make sure the backend server is running.";
        this.loading = false;
      }
    });

    this.api.getGoogleDriveConfig().subscribe({
      next: cfg => {
        this.config = cfg;
        this.configForm.client_id = cfg.client_id || "";
        this.configForm.folder_name = cfg.folder_name || "Rent Tracker Backups";
        this.configForm.folder_id = cfg.folder_id || "";
        this.configForm.local_drive_path = cfg.local_drive_path || "";
      }
    });
  }

  connectWithGoogleSSO() {
    const clientId = (this.configForm.client_id || this.config?.client_id || "").trim();
    if (!clientId) {
      this.error = "Please enter your Google OAuth Client ID in Settings first.";
      this.activeTab = "settings";
      return;
    }

    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
      this.error = "Google Identity Services is loading. Please try again in a moment.";
      return;
    }

    this.connectingSSO = true;
    this.error = "";
    this.message = "";

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        callback: (response: any) => {
          this.connectingSSO = false;
          if (response.error) {
            this.error = "Google sign-in was not completed: " + (response.error_description || response.error);
            return;
          }
          if (response.access_token) {
            this.api.connectGoogleDriveOAuth(response.access_token, clientId).subscribe({
              next: res => {
                this.message = res.message || "Connected to Google Drive successfully!";
                this.loadData();
              },
              error: err => {
                this.error = err.error?.detail || "Could not link Google account.";
              }
            });
          }
        }
      });
      client.requestAccessToken({ prompt: "consent" });
    } catch (e: any) {
      this.connectingSSO = false;
      this.error = "Failed to launch Google popup: " + (e.message || String(e));
    }
  }

  disconnectGoogle() {
    if (!confirm("Disconnect your Google account from Rent Tracker cloud backups?")) return;
    this.api.disconnectGoogleDrive().subscribe({
      next: () => {
        this.message = "Google account disconnected.";
        this.loadData();
      },
      error: err => {
        this.error = err.error?.detail || "Could not disconnect Google account.";
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
        this.error = err.error?.detail || "Google Drive backup failed. Click Sign in with Google or check Settings.";
      }
    });
  }

  saveSettings() {
    this.savingConfig = true;
    this.error = "";
    this.message = "";

    const payload: any = {
      client_id: this.configForm.client_id.trim(),
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
      next: () => {
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
