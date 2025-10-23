#include "agrs_zeus/gui/OSGWidget.h"

#include <osg/Node>
#include <osg/Group>
#include <osg/Geode>
#include <osg/Geometry>
#include <osg/Material>
#include <osg/Shape>
#include <osg/ShapeDrawable>
#include <osgDB/ReadFile>
#include <osgGA/TrackballManipulator>
#include <osgViewer/ViewerEventHandlers>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QOpenGLFunctions>
#include <iostream>

namespace agrs {
namespace gui {

OSGWidget::OSGWidget(QWidget* parent)
    : QOpenGLWidget(parent)
    , m_viewer(new osgViewer::Viewer)
    , m_updateTimer(new QTimer(this))
    , m_mousePressed(false)
{
    // Set OpenGL format
    QSurfaceFormat format;
    format.setDepthBufferSize(24);
    format.setStencilBufferSize(8);
    format.setVersion(3, 3);
    format.setProfile(QSurfaceFormat::CoreProfile);
    format.setSamples(4); // 4x MSAA
    setFormat(format);
    
    // Setup update timer for continuous rendering
    connect(m_updateTimer, &QTimer::timeout, this, QOverload<>::of(&OSGWidget::update));
    m_updateTimer->start(16); // ~60 FPS
    
    // Enable mouse tracking
    setMouseTracking(true);
    setFocusPolicy(Qt::StrongFocus);
}

OSGWidget::~OSGWidget() {
    m_updateTimer->stop();
    // OSG smart pointers will clean up automatically
}

void OSGWidget::initializeGL() {
    initializeOpenGLFunctions();
    
    std::cout << "[OSGWidget] Initializing OpenGL context (Qt-managed)\n";
    
    // Setup OSG viewer for Qt integration
    m_viewer->setThreadingModel(osgViewer::Viewer::SingleThreaded);
    
    // Setup camera (no graphics context needed - Qt manages it)
    osg::Camera* camera = m_viewer->getCamera();
    camera->setViewport(0, 0, width(), height());
    camera->setProjectionMatrixAsPerspective(
        30.0, static_cast<double>(width()) / static_cast<double>(height()), 1.0, 10000.0);
    camera->setClearColor(osg::Vec4(0.1, 0.1, 0.1, 1.0)); // Dark background
    
    // Disable automatic camera setup
    camera->setProjectionResizePolicy(osg::Camera::FIXED);
    
    // Set camera manipulator
    m_viewer->setCameraManipulator(new osgGA::TrackballManipulator);
    
    // Setup scene
    setupScene();
    
    std::cout << "[OSGWidget] OpenGL initialization complete\n";
}

void OSGWidget::setupScene() {
    // Create root group
    osg::ref_ptr<osg::Group> root = new osg::Group;
    
    // Create a simple sphere as placeholder
    osg::ref_ptr<osg::Geode> geode = new osg::Geode;
    osg::ref_ptr<osg::ShapeDrawable> sphere = 
        new osg::ShapeDrawable(new osg::Sphere(osg::Vec3(0, 0, 0), 100.0));
    
    // Set material properties
    osg::ref_ptr<osg::Material> material = new osg::Material;
    material->setDiffuse(osg::Material::FRONT_AND_BACK, osg::Vec4(0.3, 0.6, 0.9, 1.0));
    material->setSpecular(osg::Material::FRONT_AND_BACK, osg::Vec4(1.0, 1.0, 1.0, 1.0));
    material->setShininess(osg::Material::FRONT_AND_BACK, 64.0);
    
    geode->getOrCreateStateSet()->setAttributeAndModes(material, osg::StateAttribute::ON);
    geode->addDrawable(sphere);
    
    root->addChild(geode);
    
    // Set scene
    m_viewer->setSceneData(root);
    
    std::cout << "[OSGWidget] Scene initialized with test sphere\n";
}

void OSGWidget::resizeGL(int w, int h) {
    // Update camera viewport
    osg::Camera* camera = m_viewer->getCamera();
    if (camera) {
        camera->setViewport(0, 0, w, h);
        camera->setProjectionMatrixAsPerspective(
            30.0, static_cast<double>(w) / static_cast<double>(h), 1.0, 10000.0);
    }
}

void OSGWidget::paintGL() {
    // Render OSG scene
    if (m_viewer) {
        m_viewer->frame();
    }
}

void OSGWidget::mousePressEvent(QMouseEvent* event) {
    m_lastMousePos = event->pos();
    m_mousePressed = true;
    
    // Forward to OSG
    osgGA::EventQueue* eventQueue = m_viewer->getEventQueue();
    if (eventQueue) {
        QPointF pos = event->position();
        eventQueue->mouseButtonPress(pos.x(), pos.y(), event->button());
    }
    
    QOpenGLWidget::mousePressEvent(event);
}

void OSGWidget::mouseMoveEvent(QMouseEvent* event) {
    // Forward to OSG
    osgGA::EventQueue* eventQueue = m_viewer->getEventQueue();
    if (eventQueue) {
        QPointF pos = event->position();
        eventQueue->mouseMotion(pos.x(), pos.y());
    }
    
    m_lastMousePos = event->pos();
    
    // Emit coordinates (placeholder - will use proper projection with osgEarth)
    emit coordinatesChanged(0.0, 0.0, 0.0);
    
    QOpenGLWidget::mouseMoveEvent(event);
}

void OSGWidget::mouseReleaseEvent(QMouseEvent* event) {
    m_mousePressed = false;
    
    // Forward to OSG
    osgGA::EventQueue* eventQueue = m_viewer->getEventQueue();
    if (eventQueue) {
        QPointF pos = event->position();
        eventQueue->mouseButtonRelease(pos.x(), pos.y(), event->button());
    }
    
    QOpenGLWidget::mouseReleaseEvent(event);
}

void OSGWidget::wheelEvent(QWheelEvent* event) {
    // Forward to OSG
    osgGA::EventQueue* eventQueue = m_viewer->getEventQueue();
    if (eventQueue) {
        eventQueue->mouseScroll(
            event->angleDelta().y() > 0 ? 
            osgGA::GUIEventAdapter::SCROLL_UP : 
            osgGA::GUIEventAdapter::SCROLL_DOWN);
    }
    
    QOpenGLWidget::wheelEvent(event);
}

void OSGWidget::loadDEM(const QString& path) {
    // Placeholder - will implement with osgEarth
    std::cout << "[OSGWidget] TODO: Load DEM from " << path.toStdString() << "\n";
}

void OSGWidget::loadModel(const QString& path) {
    osg::ref_ptr<osg::Node> node = osgDB::readNodeFile(path.toStdString());
    if (node) {
        m_viewer->setSceneData(node);
        std::cout << "[OSGWidget] Loaded model: " << path.toStdString() << "\n";
    } else {
        std::cerr << "[OSGWidget] Failed to load model: " << path.toStdString() << "\n";
    }
}

void OSGWidget::setCameraPosition(double x, double y, double z) {
    osg::Vec3d eye(x, y, z);
    osg::Vec3d center(0, 0, 0);
    osg::Vec3d up(0, 0, 1);
    
    m_viewer->getCameraManipulator()->setHomePosition(eye, center, up);
    m_viewer->getCameraManipulator()->home(0.0);
}

void OSGWidget::resetCamera() {
    m_viewer->getCameraManipulator()->home(0.0);
}

} // namespace gui
} // namespace agrs









