#!/usr/bin/env python3
"""
AGRS ZEUS Control Panel v2
Modern GUI for starting, stopping, and restarting frontend/backend servers
Organized into tabs for Website and ZEUS operations.
"""

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, Pango, Gdk, GdkPixbuf
import subprocess
import threading
import sys
import os

# Use the wrapper so GUI launches have a stable PATH, serialized operations,
# and a persistent log file for debugging.
AGRS_CONTROL_CMD = "/opt/agrs/scripts/agrs-control-wrapper.sh"

# --- Modern Dark Theme CSS ---
CSS = b"""
/* Global Reset & Base */
window {
    background-color: #0a0a0a;
    font-family: 'Inter', 'Segoe UI', Sans;
}

/* Notebook / Tabs */
notebook {
    background-color: transparent;
    border: none;
}

notebook tab {
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    padding: 8px 16px;
    margin-right: 4px;
    transition: all 200ms ease;
}

notebook tab:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

notebook tab:checked {
    background-color: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
}

notebook tab label {
    font-family: 'Monospace';
    font-weight: bold;
    font-size: 11px;
    letter-spacing: 1px;
    color: #a3a3a3;
}

notebook tab:checked label {
    color: #ffffff;
}

notebook stack {
    background-color: transparent;
}

/* Typography */
label {
    color: #e5e5e5;
}

.header-title {
    font-family: 'Monospace';
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 2px;
    color: #ffffff;
}

.header-subtitle {
    font-family: 'Monospace';
    font-size: 10px;
    color: #737373;
    letter-spacing: 1px;
}

.section-title {
    font-family: 'Monospace';
    font-size: 10px;
    font-weight: bold;
    color: #a3a3a3;
    letter-spacing: 1.5px;
    margin-bottom: 8px;
}

/* Cards / Panels */
.panel {
    background-image: none;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 14px;
}

/* Buttons */
button,
button:hover,
button:active,
button:focus,
button:checked {
    background-image: none;
    border-image: none;
    box-shadow: none;
    text-shadow: none;
    -gtk-icon-shadow: none;
}

button {
    background-color: #111827;
    color: #f9fafb;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 12px 16px;
    font-family: 'Monospace';
    font-weight: bold;
    font-size: 11px;
    letter-spacing: 1px;
    transition: all 200ms ease;
}

button:hover {
    background-color: #1f2937;
    border-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
}

button:active {
    background-color: #0b1220;
}

button:disabled {
    color: rgba(255, 255, 255, 0.28);
    background-color: #0b1220;
    border-color: rgba(255, 255, 255, 0.08);
}

.action-btn-start {
    background-color: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.55);
    color: #34d399;
}
.action-btn-start:hover {
    background-color: rgba(16, 185, 129, 0.24);
    border-color: rgba(16, 185, 129, 0.75);
    color: #34d399;
}

.action-btn-stop {
    background-color: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.55);
    color: #fca5a5;
}
.action-btn-stop:hover {
    background-color: rgba(239, 68, 68, 0.22);
    border-color: rgba(239, 68, 68, 0.75);
    color: #fca5a5;
}

.action-btn-restart {
    background-color: rgba(59, 130, 246, 0.16);
    border-color: rgba(59, 130, 246, 0.55);
    color: #93c5fd;
}
.action-btn-restart:hover {
    background-color: rgba(59, 130, 246, 0.24);
    border-color: rgba(59, 130, 246, 0.75);
    color: #93c5fd;
}

button label {
    color: inherit;
}

/* Status Badges */
.status-badge {
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 9px;
    font-weight: bold;
    font-family: 'Monospace';
}
.status-running {
    background-color: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.4);
}
.status-stopped {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Terminal Log */
textview {
    background-color: #050505;
    color: #a3a3a3;
    font-family: 'Monospace';
    font-size: 11px;
}
textview text {
    background-color: #050505;
}
.log-frame {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}
"""

class AGRSControlPanel(Gtk.Window):
    def __init__(self):
        super().__init__(title="AGRS ZEUS Control Station")
        self.set_default_size(700, 650)
        self.set_position(Gtk.WindowPosition.CENTER)
        
        # Apply CSS
        style_provider = Gtk.CssProvider()
        style_provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            self.get_screen(),
            style_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        # Layout
        main_vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        main_vbox.set_margin_top(24)
        main_vbox.set_margin_bottom(24)
        main_vbox.set_margin_start(24)
        main_vbox.set_margin_end(24)
        self.add(main_vbox)

        # --- Header ---
        header_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        header_box.set_margin_bottom(20)
        
        title_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        
        # Logo
        try:
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                "/opt/agrs/gui-v2/frontend/public/icon.png", 
                32, 32, True
            )
            logo_image = Gtk.Image.new_from_pixbuf(pixbuf)
            title_box.pack_start(logo_image, False, False, 0)
        except Exception as e:
            logo_label = Gtk.Label(label="⚡") 
            logo_label.get_style_context().add_class("header-title")
            logo_label.set_markup("<span foreground='#ea580c'>⚡</span>")
            title_box.pack_start(logo_label, False, False, 0)

        title_label = Gtk.Label(label="AGRS ZEUS")
        title_label.get_style_context().add_class("header-title")

        subtitle_label = Gtk.Label(label="SYSTEM CONTROL STATION")
        subtitle_label.get_style_context().add_class("header-subtitle")
        subtitle_label.set_halign(Gtk.Align.START)
        title_box.pack_start(title_label, False, False, 0)
        
        header_box.pack_start(title_box, False, False, 0)
        header_box.pack_start(subtitle_label, False, False, 0)
        main_vbox.pack_start(header_box, False, False, 0)

        # --- Notebook (Tabs) ---
        self.notebook = Gtk.Notebook()
        main_vbox.pack_start(self.notebook, False, False, 0)

        # 1. Overview Tab
        self.setup_overview_tab()
        
        # 2. Website Tab
        self.setup_website_tab()
        
        # 3. ZEUS Tab
        self.setup_zeus_tab()
        
        # 4. Advanced Tab
        self.setup_advanced_tab()

        # --- Terminal Output (Outside Notebook, always visible) ---
        log_label = Gtk.Label(label="SYSTEM LOG STREAM")
        log_label.set_halign(Gtk.Align.START)
        log_label.get_style_context().add_class("section-title")
        log_label.set_margin_top(20)
        main_vbox.pack_start(log_label, False, False, 0)

        scrolled_window = Gtk.ScrolledWindow()
        scrolled_window.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scrolled_window.set_min_content_height(180)
        scrolled_window.get_style_context().add_class("log-frame")

        self.log_view = Gtk.TextView()
        self.log_view.set_editable(False)
        self.log_view.set_cursor_visible(False)
        self.log_view.set_wrap_mode(Gtk.WrapMode.WORD)
        self.log_buffer = self.log_view.get_buffer()
        
        # Log tags
        self.log_buffer.create_tag("cmd", foreground="#a3a3a3", weight=Pango.Weight.BOLD)
        self.log_buffer.create_tag("success", foreground="#34d399")
        self.log_buffer.create_tag("error", foreground="#f87171")
        self.log_buffer.create_tag("info", foreground="#60a5fa")

        scrolled_window.add(self.log_view)
        main_vbox.pack_start(scrolled_window, True, True, 0)

        self.connect("destroy", Gtk.main_quit)
        
        # Initial status check
        GLib.timeout_add(1000, self.update_status_silent) # Poll status every second
        self.update_status()

    def setup_overview_tab(self):
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=20)
        page.set_border_width(15)
        
        grid = Gtk.Grid()
        grid.set_column_spacing(20)
        grid.set_column_homogeneous(True)
        page.add(grid)

        # Global Actions
        actions_frame = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        actions_frame.get_style_context().add_class("panel")
        
        lbl = Gtk.Label(label="Global Operations")
        lbl.set_halign(Gtk.Align.START)
        lbl.get_style_context().add_class("section-title")
        actions_frame.pack_start(lbl, False, False, 0)

        for label, cb, style in [
            ("▶ INITIALIZE SYSTEM", self.on_start_all, "action-btn-start"),
            ("■ TERMINATE SYSTEM", self.on_stop_all, "action-btn-stop"),
            ("↻ REBOOT SYSTEM", self.on_restart_all, "action-btn-restart")
        ]:
            btn = Gtk.Button(label=label)
            btn.get_style_context().add_class(style)
            btn.connect("clicked", cb)
            actions_frame.pack_start(btn, False, False, 0)
        
        grid.attach(actions_frame, 0, 0, 1, 1)

        # Service Status
        status_frame = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        status_frame.get_style_context().add_class("panel")

        lbl = Gtk.Label(label="Service Status")
        lbl.set_halign(Gtk.Align.START)
        lbl.get_style_context().add_class("section-title")
        status_frame.pack_start(lbl, False, False, 0)

        self.status_widgets = {}
        for text, key in [
            ("ZEUS Backend API", "backend"),
            ("ZEUS UI", "frontend"),
            ("Website (UI + API)", "website"),
            ("Agentic AI", "agentic"),
            ("Pixel Stream", "pixelstream"),
        ]:
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            l = Gtk.Label(label=text); l.set_halign(Gtk.Align.START)
            row.pack_start(l, True, True, 0)
            b = Gtk.Label(label="WAITING"); b.get_style_context().add_class("status-badge")
            b.get_style_context().add_class("status-stopped")
            row.pack_start(b, False, False, 0)
            status_frame.pack_start(row, False, False, 0)
            self.status_widgets[key] = b

        refresh_btn = Gtk.Button(label="REFRESH STATUS")
        refresh_btn.set_halign(Gtk.Align.END)
        refresh_btn.connect("clicked", lambda w: self.update_status())
        status_frame.pack_start(refresh_btn, False, False, 5)

        grid.attach(status_frame, 1, 0, 1, 1)
        
        label = Gtk.Label(label="OVERVIEW")
        self.notebook.append_page(page, label)

    def setup_website_tab(self):
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        page.set_border_width(15)
        
        lbl = Gtk.Label(label="Website Operations (agrsglobal.com)")
        lbl.get_style_context().add_class("section-title")
        lbl.set_halign(Gtk.Align.START)
        page.pack_start(lbl, False, False, 0)

        # Website controls are tied to the same process (3000)
        page.pack_start(self.create_stack_ctl(
            "Website Frontend", self.on_start_website, self.on_stop_website, self.on_restart_website
        ), False, False, 0)

        page.pack_start(self.create_stack_ctl(
            "Website Backend (Next API)", self.on_start_website_backend, self.on_stop_website_backend, self.on_restart_website_backend
        ), False, False, 0)

        label = Gtk.Label(label="WEBSITE")
        self.notebook.append_page(page, label)

    def setup_zeus_tab(self):
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        page.set_border_width(15)
        
        lbl = Gtk.Label(label="ZEUS Operations (zeus.agrsglobal.com)")
        lbl.get_style_context().add_class("section-title")
        lbl.set_halign(Gtk.Align.START)
        page.pack_start(lbl, False, False, 0)

        page.pack_start(self.create_stack_ctl(
            "ZEUS Frontend UI", self.on_start_zeus_frontend, self.on_stop_zeus_frontend, self.on_restart_zeus_frontend
        ), False, False, 0)

        page.pack_start(self.create_stack_ctl(
            "ZEUS Backend API", self.on_start_zeus_backend, self.on_stop_zeus_backend, self.on_restart_zeus_backend
        ), False, False, 0)

        page.pack_start(self.create_stack_ctl(
            "Full Stack (UI+API+AI)", self.on_start_zeus, self.on_stop_zeus, self.on_restart_zeus
        ), False, False, 0)

        label = Gtk.Label(label="ZEUS")
        self.notebook.append_page(page, label)

    def setup_advanced_tab(self):
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        page.set_border_width(15)
        
        lbl = Gtk.Label(label="Individual Service Controls")
        lbl.get_style_context().add_class("section-title")
        lbl.set_halign(Gtk.Align.START)
        page.pack_start(lbl, False, False, 0)

        grid = Gtk.Grid()
        grid.set_column_spacing(10)
        grid.set_row_spacing(10)
        grid.set_column_homogeneous(True)
        page.pack_start(grid, False, False, 0)

        grid.attach(self.create_mini_ctl("ZEUS Backend", self.on_start_backend, self.on_stop_backend), 0, 0, 1, 1)
        grid.attach(self.create_mini_ctl("ZEUS UI", self.on_start_frontend, self.on_stop_frontend), 1, 0, 1, 1)
        grid.attach(self.create_mini_ctl("Website", self.on_start_website, self.on_stop_website), 2, 0, 1, 1)
        grid.attach(self.create_mini_ctl("Agentic AI", self.on_start_agentic, self.on_stop_agentic), 0, 1, 1, 1)

        label = Gtk.Label(label="ADVANCED")
        self.notebook.append_page(page, label)

    def create_mini_ctl(self, label, start_cb, stop_cb):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        box.get_style_context().add_class("panel")
        
        lbl = Gtk.Label(label=label)
        lbl.get_style_context().add_class("section-title")
        lbl.set_halign(Gtk.Align.CENTER)
        box.pack_start(lbl, False, False, 0)
        
        btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        btn_box.set_halign(Gtk.Align.CENTER)
        
        for text, cb in [("ON", start_cb), ("OFF", stop_cb)]:
            btn = Gtk.Button(label=text)
            btn.connect("clicked", cb)
            btn_box.pack_start(btn, True, True, 0)
        
        box.pack_start(btn_box, False, False, 0)
        return box

    def create_stack_ctl(self, label, start_cb, stop_cb, restart_cb):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        box.get_style_context().add_class("panel")

        lbl = Gtk.Label(label=label)
        lbl.get_style_context().add_class("section-title")
        lbl.set_halign(Gtk.Align.START)
        box.pack_start(lbl, False, False, 0)

        btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)

        for text, cb, style in [
            ("ON", start_cb, "action-btn-start"),
            ("OFF", stop_cb, "action-btn-stop"),
            ("↻", restart_cb, "action-btn-restart")
        ]:
            btn = Gtk.Button(label=text)
            btn.get_style_context().add_class(style)
            btn.connect("clicked", cb)
            btn_box.pack_start(btn, text != "↻", text != "↻", 0)

        box.pack_start(btn_box, False, False, 0)
        return box

    def append_log(self, text, tag=None):
        end_iter = self.log_buffer.get_end_iter()
        if tag:
            self.log_buffer.insert_with_tags_by_name(end_iter, text, tag)
        else:
            self.log_buffer.insert(end_iter, text)
        
        adj = self.log_view.get_vadjustment()
        GLib.idle_add(lambda: adj.set_value(adj.get_upper() - adj.get_page_size()))

    def run_command_stream(self, cmd_args):
        cmd_str = " ".join(cmd_args)
        self.append_log(f"\n> {cmd_str}\n", "cmd")
        
        def task():
            try:
                process = subprocess.Popen(
                    cmd_args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True
                )
                
                for line in process.stdout:
                    clean_line = line
                    tag = None
                    if "successfully" in line.lower(): tag = "success"
                    elif "failed" in line.lower() or "error" in line.lower(): tag = "error"
                    elif "starting" in line.lower() or "stopping" in line.lower(): tag = "info"
                    GLib.idle_add(self.append_log, clean_line, tag)
                    
                process.wait()
                exit_code = process.returncode
                if exit_code == 0:
                    GLib.idle_add(self.append_log, f"> Process completed successfully.\n", "success")
                else:
                    GLib.idle_add(self.append_log, f"> Process exited with code {exit_code}.\n", "error")
                
                GLib.idle_add(self.update_status)
            except Exception as e:
                GLib.idle_add(self.append_log, f"Execution Error: {str(e)}\n", "error")

        threading.Thread(target=task, daemon=True).start()

    def is_port_in_use(self, port):
        try:
            result = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True)
            return f":{port} " in result.stdout
        except:
            return False

    def update_status_silent(self):
        self.update_status(log=False)
        return True

    def update_status(self, log=True):
        if log: self.append_log("Checking system status...\n", "cmd")
        
        checks = {
            "backend": 8000,
            "frontend": 3001,
            "website": 3000,
            "agentic": 8001,
            "pixelstream": 8888
        }
        
        for key, port in checks.items():
            running = self.is_port_in_use(port)
            badge = self.status_widgets[key]
            current_text = badge.get_text()
            new_text = "ONLINE" if running else "OFFLINE"
            
            if current_text != new_text:
                badge.set_text(new_text)
                ctx = badge.get_style_context()
                if running:
                    ctx.remove_class("status-stopped")
                    ctx.add_class("status-running")
                else:
                    ctx.remove_class("status-running")
                    ctx.add_class("status-stopped")

    # --- Actions ---
    def on_start_all(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start"])
    def on_stop_all(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop"])
    def on_restart_all(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart"])

    def on_start_website(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-website"])
    def on_stop_website(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-website"])
    def on_restart_website(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart-website"])

    def on_start_website_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-website-backend"])
    def on_stop_website_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-website-backend"])
    def on_restart_website_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart-website-backend"])

    def on_start_zeus_frontend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-zeus-frontend"])
    def on_stop_zeus_frontend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-zeus-frontend"])
    def on_restart_zeus_frontend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart-zeus-frontend"])

    def on_start_zeus_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-zeus-backend"])
    def on_stop_zeus_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-zeus-backend"])
    def on_restart_zeus_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart-zeus-backend"])

    def on_start_zeus(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-zeus"])
    def on_stop_zeus(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-zeus"])
    def on_restart_zeus(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "restart-zeus"])

    def on_start_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-backend"])
    def on_stop_backend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-backend"])
    def on_start_frontend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-frontend"])
    def on_stop_frontend(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-frontend"])
    def on_start_agentic(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "start-agentic"])
    def on_stop_agentic(self, w): self.run_command_stream([AGRS_CONTROL_CMD, "stop-agentic"])

if __name__ == "__main__":
    win = AGRSControlPanel()
    win.show_all()
    Gtk.main()
