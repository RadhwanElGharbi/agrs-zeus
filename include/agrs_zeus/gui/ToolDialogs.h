#ifndef AGRS_GUI_TOOLDIALOGS_H
#define AGRS_GUI_TOOLDIALOGS_H

#include <QDialog>
#include <QLineEdit>
#include <QComboBox>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QCheckBox>
#include <QPushButton>
#include <QLabel>
#include <QProgressBar>
#include <QGridLayout>
#include <QFrame>

namespace agrs {
namespace gui {

class MapWidget;

/**
 * @brief Base class for tool parameter dialogs
 */
class ToolDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit ToolDialog(QWidget* parent = nullptr);
    virtual ~ToolDialog() = default;
    
    // Get parameters as variant map for backend execution
    virtual QVariantMap getParameters() const = 0;
    
protected:
    void addFileInput(const QString& label, QLineEdit*& lineEdit, bool isOutput = false);
    void addDirectoryInput(const QString& label, QLineEdit*& lineEdit);
    void addTextInput(const QString& label, QLineEdit*& lineEdit);
    void addNumberInput(const QString& label, QDoubleSpinBox*& spinBox, 
                       double min, double max, double value, double step = 1.0);
    void addComboBox(const QString& label, QComboBox*& comboBox, 
                    const QStringList& items);
    void addCheckBox(const QString& label, QCheckBox*& checkBox, bool checked = false);
    
    QGridLayout* m_layout;
    int m_row;
};

/**
 * @brief DEM Fetch dialog - download Digital Elevation Models
 */
class DEMFetchDialog : public ToolDialog {
    Q_OBJECT
    
public:
    explicit DEMFetchDialog(MapWidget* mapWidget, QWidget* parent = nullptr);
    QVariantMap getParameters() const override;
    
private slots:
    void onUseCurrentView();
    void onSelectAOI();
    
private:
    MapWidget* m_mapWidget;
    QLineEdit* m_bboxEdit;
    QLineEdit* m_aoiEdit;
    QComboBox* m_resolutionCombo;
    QLineEdit* m_outputEdit;
    QPushButton* m_currentViewBtn;
};

/**
 * @brief Raster Slope calculation dialog
 */
class SlopeDialog : public ToolDialog {
    Q_OBJECT
    
public:
    explicit SlopeDialog(QWidget* parent = nullptr);
    QVariantMap getParameters() const override;
    
private:
    QLineEdit* m_inputEdit;
    QLineEdit* m_outputEdit;
    QComboBox* m_unitsCombo;
};

/**
 * @brief Raster Calculator dialog
 */
class RasterCalcDialog : public ToolDialog {
    Q_OBJECT
    
public:
    explicit RasterCalcDialog(QWidget* parent = nullptr);
    QVariantMap getParameters() const override;
    
private:
    QLineEdit* m_input1Edit;
    QLineEdit* m_input2Edit;
    QLineEdit* m_expressionEdit;
    QLineEdit* m_outputEdit;
};

/**
 * @brief Vector Buffer dialog
 */
class VectorBufferDialog : public ToolDialog {
    Q_OBJECT
    
public:
    explicit VectorBufferDialog(QWidget* parent = nullptr);
    QVariantMap getParameters() const override;
    
private:
    QLineEdit* m_inputEdit;
    QDoubleSpinBox* m_distanceSpin;
    QLineEdit* m_outputEdit;
};

/**
 * @brief PIRL Create Config dialog
 */
class PIRLConfigDialog : public ToolDialog {
    Q_OBJECT
    
public:
    explicit PIRLConfigDialog(MapWidget* mapWidget, QWidget* parent = nullptr);
    QVariantMap getParameters() const override;
    
private slots:
    void onSelectStartPoint();
    void onSelectEndPoint();
    
private:
    MapWidget* m_mapWidget;
    QLineEdit* m_projectNameEdit;
    QDoubleSpinBox* m_startLatEdit;
    QDoubleSpinBox* m_startLonEdit;
    QDoubleSpinBox* m_endLatEdit;
    QDoubleSpinBox* m_endLonEdit;
    QLineEdit* m_outputEdit;
    QPushButton* m_startBtn;
    QPushButton* m_endBtn;
};

/**
 * @brief Progress dialog for long-running operations
 */
class ToolProgressDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit ToolProgressDialog(const QString& toolName, QWidget* parent = nullptr);
    
public slots:
    void setProgress(int percentage);
    void setStatus(const QString& status);
    void setCompleted(bool success, const QString& message);
    
private:
    QLabel* m_statusLabel;
    QProgressBar* m_progressBar;
    QPushButton* m_cancelBtn;
    QPushButton* m_closeBtn;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_TOOLDIALOGS_H









