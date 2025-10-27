#ifndef AGRS_GUI_TERRAIN3DWIDGET_H
#define AGRS_GUI_TERRAIN3DWIDGET_H

#include <QOpenGLWidget>
#include <QOpenGLFunctions>
#include <QOpenGLShaderProgram>
#include <QOpenGLBuffer>
#include <QOpenGLVertexArrayObject>
#include <QOpenGLTexture>
#include <QMatrix4x4>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QString>
#include <vector>
#include <memory>

namespace agrs {
namespace gui {

/**
 * @brief Simple 3D terrain viewer using height-mapped mesh from DEM
 * 
 * Lightweight OpenGL-based 3D viewer that:
 * - Loads DEM elevation data via GDAL
 * - Renders terrain as triangulated height mesh
 * - Supports camera orbit, pan, and zoom
 * - Can texture-map imagery on terrain surface
 */
class Terrain3DWidget : public QOpenGLWidget, protected QOpenGLFunctions {
    Q_OBJECT
    
public:
    explicit Terrain3DWidget(QWidget* parent = nullptr);
    ~Terrain3DWidget() override;
    
    /**
     * @brief Initialize default globe view (ArcGIS/Google Earth style)
     * Shows a textured sphere with ESRI World Imagery basemap
     */
    void initializeGlobeView();
    
    /**
     * @brief Load a DEM file and generate terrain mesh
     * @param demPath Path to DEM file (GeoTIFF, etc.)
     * @return true if loaded successfully
     */
    bool loadDEM(const QString& demPath);
    
    /**
     * @brief Clear the current terrain
     */
    void clearTerrain();
    
    /**
     * @brief Reset camera to default position
     */
    void resetCamera();
    
    /**
     * @brief Set vertical exaggeration factor
     * @param factor Multiplier for elevation (default 1.0)
     */
    void setVerticalExaggeration(float factor);
    
    /**
     * @brief Load imagery/raster as texture to drape on terrain
     * @param imageryPath Path to imagery file (GeoTIFF, etc.)
     * @return true if loaded successfully
     */
    bool loadImageryTexture(const QString& imageryPath);
    
    /**
     * @brief Load basemap tiles as texture
     * @param tilesDir Path to tiles directory or single tile image
     * @return true if loaded successfully
     */
    bool loadBasemapTexture(const QString& tilesDir);
    
    /**
     * @brief Clear all loaded textures
     */
    void clearTextures();
    
signals:
    void terrainLoaded(const QString& demPath, bool success);
    void textureLoaded(const QString& imageryPath, bool success);
    
protected:
    // Qt OpenGL overrides
    void initializeGL() override;
    void resizeGL(int w, int h) override;
    void paintGL() override;
    
    // Mouse/keyboard handlers
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    
private:
    /**
     * @brief Setup OpenGL shaders for terrain rendering
     */
    void setupShaders();
    
    /**
     * @brief Create triangle mesh from elevation data
     */
    void createMeshFromElevation(const std::vector<float>& elevation, int width, int height);
    
    /**
     * @brief Update view and projection matrices
     */
    void updateMatrices();
    
    /**
     * @brief Load texture from raster file using GDAL
     */
    QOpenGLTexture* loadRasterAsTexture(const QString& rasterPath);
    
    /**
     * @brief Create simple basemap texture (placeholder)
     */
    QOpenGLTexture* createDefaultBasemapTexture();
    
    /**
     * @brief Create sphere mesh for globe view
     */
    void createSphereMesh(float radius, int latSegments, int lonSegments);
    
    /**
     * @brief Convert lat/lon (degrees) to 3D Cartesian coordinates
     */
    void latLonToCartesian(float lat, float lon, float radius, float& x, float& y, float& z);
    
    // OpenGL resources
    QOpenGLShaderProgram* m_shaderProgram{nullptr};
    QOpenGLBuffer m_vertexBuffer;
    QOpenGLBuffer m_indexBuffer;
    QOpenGLVertexArrayObject m_vao;
    
    // Textures
    std::unique_ptr<QOpenGLTexture> m_basemapTexture;
    std::unique_ptr<QOpenGLTexture> m_imageryTexture;
    
    // Mesh data
    int m_indexCount{0};
    int m_demWidth{0};
    int m_demHeight{0};
    bool m_isGlobeMode{true}; // true=globe view, false=terrain view
    
    // Camera parameters
    float m_cameraDistance{100.0f};
    float m_cameraAngleX{45.0f};  // pitch (up/down)
    float m_cameraAngleY{0.0f};   // yaw (left/right)
    float m_cameraPanX{0.0f};
    float m_cameraPanY{0.0f};
    
    // Vertical exaggeration
    float m_verticalScale{1.0f};
    
    // Mouse state
    QPoint m_lastMousePos;
    bool m_isOrbiting{false};
    bool m_isPanning{false};
    
    // Matrices
    QMatrix4x4 m_projection;
    QMatrix4x4 m_view;
    QMatrix4x4 m_model;
    
    // Terrain bounds (for centering and UV calculation)
    float m_terrainCenterX{0.0f};
    float m_terrainCenterZ{0.0f};
    float m_terrainMaxElevation{1.0f};
    double m_geoBounds[4]{0.0, 0.0, 0.0, 0.0}; // minLon, minLat, maxLon, maxLat
    
    // OpenGL initialized flag
    bool m_glInitialized{false};
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_TERRAIN3DWIDGET_H

