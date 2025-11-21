#include <QApplication>
#include <QDir>
#include <QString>
#include <QMessageBox>
#include "PIRLParameterTuningDialog.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    
    // Set application metadata
    app.setApplicationName("PIRL Parameter Tuner");
    app.setApplicationVersion("1.0");
    app.setOrganizationName("Artemis Global Research Solutions");
    
    // Determine project directory
    QString projectDir;
    if (argc > 1) {
        // Project directory provided as command-line argument
        projectDir = QString(argv[1]);
    } else {
        // Default: assume we're running from PIRL directory, go up two levels
        projectDir = QDir::current().absolutePath();
        
        // If current directory contains "parameter_tuner", go up one level
        if (projectDir.endsWith("parameter_tuner")) {
            QDir dir(projectDir);
            dir.cdUp(); // Go to PIRL directory
            dir.cdUp(); // Go to project root
            projectDir = dir.absolutePath();
        }
        // If current directory is "PIRL", go up one level
        else if (projectDir.endsWith("PIRL")) {
            QDir dir(projectDir);
            dir.cdUp(); // Go to project root
            projectDir = dir.absolutePath();
        }
    }
    
    // Validate project directory
    QDir projDir(projectDir);
    if (!projDir.exists()) {
        QMessageBox::critical(nullptr, "Error", 
            QString("Project directory does not exist:\n%1\n\n"
                    "Usage: pirl_parameter_tuner [project_path]").arg(projectDir));
        return 1;
    }
    
    // Check if PIRL directory exists
    QString pirlDir = projectDir + "/PIRL";
    if (!QDir(pirlDir).exists()) {
        QMessageBox::critical(nullptr, "Error", 
            QString("PIRL directory not found in project:\n%1\n\n"
                    "Make sure you're running this from a valid PIRL project.").arg(pirlDir));
        return 1;
    }
    
    // Create and show dialog
    PIRLParameterTuningDialog dialog(projectDir);
    dialog.setWindowTitle(QString("PIRL Parameter Tuner - %1").arg(QDir(projectDir).dirName()));
    dialog.resize(1000, 800);
    dialog.show();
    
    return app.exec();
}






