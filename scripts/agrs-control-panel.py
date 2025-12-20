#!/usr/bin/env python3
"""
AGRS ZEUS Control Panel
GUI for starting, stopping, and restarting frontend/backend servers
Uses GTK3
"""

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, Pango
import subprocess
import threading

class AGRSControlPanel(Gtk.Window):
    def __init__(self):
        super().__init__(title="AGRS ZEUS Control Panel")
        self.set_default_size(400, 380)
        self.set_resizable(False)
        self.set_position(Gtk.WindowPosition.CENTER)

        # Apply dark theme
        settings = Gtk.Settings.get_default()
        settings.set_property("gtk-application-prefer-dark-theme", True)

        # CSS styling
        css = b"""
        window {
            background-color: #1a1a1a;
        }
        .title-label {
            color: #dc2626;
            font-size: 18px;
            font-weight: bold;
        }
        .status-label {
            color: #ffffff;
            font-size: 14px;
        }
        .running {
            color: #22c55e;
            font-weight: bold;
        }
        .stopped {
            color: #ef4444;
            font-weight: bold;
        }
        .start-btn {
            background: #166534;
            color: white;
            font-weight: bold;
            padding: 12px;
            border-radius: 6px;
        }
        .start-btn:hover {
            background: #15803d;
        }
        .stop-btn {
            background: #991b1b;
            color: white;
            font-weight: bold;
            padding: 12px;
            border-radius: 6px;
        }
        .stop-btn:hover {
            background: #b91c1c;
        }
        .restart-btn {
            background: #1e40af;
            color: white;
            font-weight: bold;
            padding: 12px;
            border-radius: 6px;
        }
        .restart-btn:hover {
            background: #1d4ed8;
        }
        .small-btn {
            background: #2d2d2d;
            color: white;
            padding: 8px;
            border-radius: 4px;
        }
        .small-btn:hover {
            background: #3d3d3d;
        }
        """
        style_provider = Gtk.CssProvider()
        style_provider.load_from_data(css)
        Gtk.StyleContext.add_provider_for_screen(
            self.get_screen(),
            style_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        # Main container
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        main_box.set_margin_top(20)
        main_box.set_margin_bottom(20)
        main_box.set_margin_start(20)
        main_box.set_margin_end(20)
        self.add(main_box)

        # Title
        title = Gtk.Label(label="AGRS ZEUS Control Panel")
        title.get_style_context().add_class("title-label")
        main_box.pack_start(title, False, False, 0)

        # Status section
        status_grid = Gtk.Grid()
        status_grid.set_column_spacing(15)
        status_grid.set_row_spacing(8)
        status_grid.set_halign(Gtk.Align.CENTER)
        main_box.pack_start(status_grid, False, False, 10)

        backend_label = Gtk.Label(label="Backend:")
        backend_label.get_style_context().add_class("status-label")
        status_grid.attach(backend_label, 0, 0, 1, 1)

        self.backend_status = Gtk.Label(label="Checking...")
        self.backend_status.get_style_context().add_class("status-label")
        status_grid.attach(self.backend_status, 1, 0, 1, 1)

        frontend_label = Gtk.Label(label="Frontend:")
        frontend_label.get_style_context().add_class("status-label")
        status_grid.attach(frontend_label, 0, 1, 1, 1)

        self.frontend_status = Gtk.Label(label="Checking...")
        self.frontend_status.get_style_context().add_class("status-label")
        status_grid.attach(self.frontend_status, 1, 1, 1, 1)

        agentic_label = Gtk.Label(label="Agentic AI:")
        agentic_label.get_style_context().add_class("status-label")
        status_grid.attach(agentic_label, 0, 2, 1, 1)

        self.agentic_status = Gtk.Label(label="Checking...")
        self.agentic_status.get_style_context().add_class("status-label")
        status_grid.attach(self.agentic_status, 1, 2, 1, 1)

        pixelstream_label = Gtk.Label(label="PixelStream:")
        pixelstream_label.get_style_context().add_class("status-label")
        status_grid.attach(pixelstream_label, 0, 3, 1, 1)

        self.pixelstream_status = Gtk.Label(label="Checking...")
        self.pixelstream_status.get_style_context().add_class("status-label")
        status_grid.attach(self.pixelstream_status, 1, 3, 1, 1)

        # Main buttons
        btn_grid = Gtk.Grid()
        btn_grid.set_column_spacing(10)
        btn_grid.set_row_spacing(10)
        btn_grid.set_halign(Gtk.Align.CENTER)
        main_box.pack_start(btn_grid, False, False, 10)

        start_btn = Gtk.Button(label="▶  Start All")
        start_btn.set_size_request(150, 50)
        start_btn.get_style_context().add_class("start-btn")
        start_btn.connect("clicked", self.on_start_all)
        btn_grid.attach(start_btn, 0, 0, 1, 1)

        stop_btn = Gtk.Button(label="■  Stop All")
        stop_btn.set_size_request(150, 50)
        stop_btn.get_style_context().add_class("stop-btn")
        stop_btn.connect("clicked", self.on_stop_all)
        btn_grid.attach(stop_btn, 1, 0, 1, 1)

        restart_btn = Gtk.Button(label="↻  Restart All")
        restart_btn.set_size_request(310, 50)
        restart_btn.get_style_context().add_class("restart-btn")
        restart_btn.connect("clicked", self.on_restart_all)
        btn_grid.attach(restart_btn, 0, 1, 2, 1)

        # Separator
        sep = Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL)
        main_box.pack_start(sep, False, False, 5)

        # Individual controls
        ind_grid = Gtk.Grid()
        ind_grid.set_column_spacing(8)
        ind_grid.set_row_spacing(8)
        ind_grid.set_halign(Gtk.Align.CENTER)
        main_box.pack_start(ind_grid, False, False, 5)

        start_backend_btn = Gtk.Button(label="Start Backend")
        start_backend_btn.set_size_request(150, 35)
        start_backend_btn.get_style_context().add_class("small-btn")
        start_backend_btn.connect("clicked", self.on_start_backend)
        ind_grid.attach(start_backend_btn, 0, 0, 1, 1)

        stop_backend_btn = Gtk.Button(label="Stop Backend")
        stop_backend_btn.set_size_request(150, 35)
        stop_backend_btn.get_style_context().add_class("small-btn")
        stop_backend_btn.connect("clicked", self.on_stop_backend)
        ind_grid.attach(stop_backend_btn, 1, 0, 1, 1)

        start_frontend_btn = Gtk.Button(label="Start Frontend")
        start_frontend_btn.set_size_request(150, 35)
        start_frontend_btn.get_style_context().add_class("small-btn")
        start_frontend_btn.connect("clicked", self.on_start_frontend)
        ind_grid.attach(start_frontend_btn, 0, 1, 1, 1)

        stop_frontend_btn = Gtk.Button(label="Stop Frontend")
        stop_frontend_btn.set_size_request(150, 35)
        stop_frontend_btn.get_style_context().add_class("small-btn")
        stop_frontend_btn.connect("clicked", self.on_stop_frontend)
        ind_grid.attach(stop_frontend_btn, 1, 1, 1, 1)

        # Refresh button
        refresh_btn = Gtk.Button(label="↻ Refresh Status")
        refresh_btn.get_style_context().add_class("small-btn")
        refresh_btn.connect("clicked", lambda w: self.update_status())
        main_box.pack_start(refresh_btn, False, False, 5)

        self.connect("destroy", Gtk.main_quit)
        self.update_status()

    def is_port_in_use(self, port):
        """Check if a port is in use using ss command"""
        result = subprocess.run(
            ["ss", "-tlnp"],
            capture_output=True,
            text=True
        )
        return f":{port} " in result.stdout

    def is_backend_running(self):
        return self.is_port_in_use(8000)

    def is_frontend_running(self):
        return self.is_port_in_use(3000)

    def is_agentic_running(self):
        return self.is_port_in_use(8001)

    def is_pixelstream_running(self):
        return self.is_port_in_use(8888)

    def update_status(self):
        if self.is_backend_running():
            self.backend_status.set_text("RUNNING")
            self.backend_status.get_style_context().remove_class("stopped")
            self.backend_status.get_style_context().add_class("running")
        else:
            self.backend_status.set_text("STOPPED")
            self.backend_status.get_style_context().remove_class("running")
            self.backend_status.get_style_context().add_class("stopped")

        if self.is_frontend_running():
            self.frontend_status.set_text("RUNNING")
            self.frontend_status.get_style_context().remove_class("stopped")
            self.frontend_status.get_style_context().add_class("running")
        else:
            self.frontend_status.set_text("STOPPED")
            self.frontend_status.get_style_context().remove_class("running")
            self.frontend_status.get_style_context().add_class("stopped")

        if self.is_agentic_running():
            self.agentic_status.set_text("RUNNING")
            self.agentic_status.get_style_context().remove_class("stopped")
            self.agentic_status.get_style_context().add_class("running")
        else:
            self.agentic_status.set_text("STOPPED")
            self.agentic_status.get_style_context().remove_class("running")
            self.agentic_status.get_style_context().add_class("stopped")

        if self.is_pixelstream_running():
            self.pixelstream_status.set_text("RUNNING")
            self.pixelstream_status.get_style_context().remove_class("stopped")
            self.pixelstream_status.get_style_context().add_class("running")
        else:
            self.pixelstream_status.set_text("STOPPED")
            self.pixelstream_status.get_style_context().remove_class("running")
            self.pixelstream_status.get_style_context().add_class("stopped")

    def run_command(self, cmd):
        def task():
            subprocess.run(cmd, shell=True)
            GLib.idle_add(self.update_status)
        threading.Thread(target=task, daemon=True).start()

    def on_start_all(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh start")

    def on_stop_all(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh stop")

    def on_restart_all(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh restart")

    def on_start_backend(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh start-backend")

    def on_stop_backend(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh stop-backend")

    def on_start_frontend(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh start-frontend")

    def on_stop_frontend(self, widget):
        self.run_command("/opt/agrs/scripts/agrs-control.sh stop-frontend")


if __name__ == "__main__":
    win = AGRSControlPanel()
    win.show_all()
    Gtk.main()
