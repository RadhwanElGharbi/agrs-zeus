#include "agrs_zeus/gui/MainWindow.h"
#include <QApplication>
#include <QStyleFactory>
#include <QPalette>
#include <QIcon>
#include <QFile>
#include <iostream>

int main(int argc, char *argv[]) {
    std::cout << "==========================================================\n";
    std::cout << "  AGRS ZEUS - 3D GUI Application\n";
    std::cout << "  Artemis Global Research Solutions Inc.\n";
    std::cout << "  Version 0.1.0\n";
    std::cout << "==========================================================\n\n";

    QApplication app(argc, argv);

    // Apply Fusion dark theme with sharp edges
    app.setStyle(QStyleFactory::create("Fusion"));
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, QColor(30, 30, 30));
    darkPalette.setColor(QPalette::WindowText, Qt::white);
    darkPalette.setColor(QPalette::Base, QColor(18, 18, 18));
    darkPalette.setColor(QPalette::AlternateBase, QColor(35, 35, 35));
    darkPalette.setColor(QPalette::ToolTipBase, Qt::white);
    darkPalette.setColor(QPalette::ToolTipText, Qt::white);
    darkPalette.setColor(QPalette::Text, Qt::white);
    darkPalette.setColor(QPalette::Button, QColor(45, 45, 45));
    darkPalette.setColor(QPalette::ButtonText, Qt::white);
    darkPalette.setColor(QPalette::BrightText, Qt::red);
    darkPalette.setColor(QPalette::Highlight, QColor(38, 79, 120));
    darkPalette.setColor(QPalette::HighlightedText, Qt::white);
    app.setPalette(darkPalette);

    // Global stylesheet for sharp edges and modern look
    QString style =
        "QWidget { border-radius: 0px; }\n"
        "QPushButton { border-radius: 2px; padding: 6px 10px; }\n"
        "QLineEdit, QTextEdit, QTreeView, QTreeWidget, QComboBox { border-radius: 2px; }\n"
        "QStatusBar { border-top: 1px solid #3a3a3a; }\n"
        "QToolBar { border: 0; spacing: 6px; }\n"
        "QMenuBar { background-color: #2a2a2a; }\n"
        "QMenuBar::item:selected { background: #3a3a3a; }\n"
        "QDockWidget::title { text-align: left; padding-left: 6px; }";
    app.setStyleSheet(style);

    // Set application icon (logo)
    QIcon appIcon("/home/radwan-el-gharbi/Downloads/AGRS_Logo_transparent.png");
    if (!appIcon.isNull()) {
        app.setWindowIcon(appIcon);
    }

    std::cout << "[GUI] Starting application...\n";

    agrs::gui::MainWindow mainWindow;
    if (!appIcon.isNull()) {
        mainWindow.setWindowIcon(appIcon);
    }
    mainWindow.show();

    std::cout << "[GUI] Main window displayed.\n";

    int result = app.exec();
    std::cout << "[GUI] Application running. Use Ctrl+Q to quit.\n";
    return result;
}
