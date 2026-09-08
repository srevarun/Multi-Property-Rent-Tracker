import { Component, EventEmitter, Output, ViewEncapsulation } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../api.service";
import { AuthUser } from "../../models";

@Component({
  selector: "app-login-board",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: "./login.component.html"
})
export class LoginComponent {
  @Output() loggedIn = new EventEmitter<AuthUser>();

  username = "";
  password = "";
  rememberMe = true;
  showPassword = false;

  loading = false;
  error = "";

  constructor(public api: ApiService) {}

  onSubmit() {
    if (!this.username.trim() || !this.password) {
      this.error = "Please enter both username and password.";
      return;
    }

    this.loading = true;
    this.error = "";

    this.api.login({
      username: this.username.trim(),
      password: this.password,
      remember_me: this.rememberMe
    }).subscribe({
      next: res => {
        this.loading = false;
        this.api.setAuthToken(res.token);
        this.api.setCurrentUser(res.user);
        this.loggedIn.emit(res.user);
      },
      error: err => {
        this.loading = false;
        this.error = err.error?.detail || "Invalid username or password. Please try again.";
      }
    });
  }
}
