#ifndef AGRS_GUI_OSGWIDGET_H
#define AGRS_GUI_OSGWIDGET_H

#include <QOpenGLWidget>
#include <QOpenGLFunctions>
#include <QTimer>
#include <osg/ref_ptr>
#include <osgViewer/Viewer>

namespace agrs {
namespace gui {

/**
 * @brief Qt widget embedding an OpenSceneGraph viewer
 * 
 * Provides 3D visualization using OSG with Qt integration.
 * Will be enhanced with osgEarth for geospatial features.
 */
class OSGWidget : public QOpenGLWidget, protected QOpenGLFunctions {
    Q_OBJECT
    
public:
    explicit OSGWidget(QWidget* parent = nullptr);
    ~OSGWidget() override;
    
    // Dataset loading (will be enhanced with osgEarth)
    void loadDEM(const QString& path);
    void loadModel(const QString& path);
    
    // Camera control
    void setCameraPosition(double x, double y, double z);
    void resetCamera();
    
signals:
    void coordinatesChanged(double lon, double lat, double elev);
    void cameraChanged();
    
protected:
    void initializeGL() override;
    void resizeGL(int w, int h) override;
    void paintGL() override;
    
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    
private:
    void setupScene();
    
    osg::ref_ptr<osgViewer::Viewer> m_viewer;
    QTimer* m_updateTimer;
    
    // Mouse tracking
    QPoint m_lastMousePos;
    bool m_mousePressed;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_OSGWIDGET_H









