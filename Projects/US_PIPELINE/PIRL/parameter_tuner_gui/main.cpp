#include "PIRLParameterTuningDialog_US.h"
#include <QApplication>
#include <QMessageBox>
#include <QDir>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    
    // Set application metadata
    app.setApplicationName("US_PIPELINE PIRL Parameter Tuner");
    app.setApplicationVersion("1.0");
    app.setOrganizationName("AGRS");
    
    // Determine project directory
    QString projectDir;
    if (argc > 1) {
        projectDir = QString(argv[1]);
    } else {
        // Default to US_PIPELINE project directory
        projectDir = "/opt/agrs/Projects/US_PIPELINE";
    }
    
    // Verify project directory exists
    if (!QDir(projectDir).exists()) {
        QMessageBox::critical(
            nullptr,
            "Error",
            QString("Project directory not found: %1").arg(projectDir)
        );
        return 1;
    }
    
    // Create and show the dialog
    PIRLParameterTuningDialogUS dialog(projectDir);
    dialog.show();
    
    return app.exec();
}



