#ifndef AGRS_GUI_MAPWIDGET_H
#define AGRS_GUI_MAPWIDGET_H

#include <QWidget>
#include <QPixmap>
#include <QPoint>
#include <QPointF>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QHash>
#include <QSet>
#include <QTimer>
#include <QImage>
#include <QVector>
#include <QContextMenuEvent>
#include <QMap>

namespace agrs {
namespace gui {

// Forward declaration
struct VectorStyle;

/**
 * @brief Interactive 2D map widget with tile-based rendering
 * 
 * Features:
 * - OpenStreetMap tile rendering
 * - Pan and zoom navigation
 * - Coordinate tracking (lat/lon)
 * - CRS display (WGS84)
 * - Elevation query support (future)
 */
class MapWidget : public QWidget {
    Q_OBJECT
    
public:
    enum class BasemapType {
        OpenStreetMap,
        EsriWorldImagery
    };
    // Public TileKey struct for hash function
    struct TileKey {
        int x, y, zoom;
        bool operator==(const TileKey& other) const {
            return x == other.x && y == other.y && zoom == other.zoom;
        }
    };
    
    explicit MapWidget(QWidget* parent = nullptr);
    ~MapWidget() override;
    
    // Map control
    void setCenter(double lat, double lon);
    void setZoom(double zoom);
    double zoom() const { return m_zoom; }

    // Basemap control
    void setBasemap(BasemapType type);
    BasemapType basemap() const { return m_basemap; }
    void setBasemapVisible(bool visible);
    bool isBasemapVisible() const { return m_basemapVisible; }
    
    // Overlay layers (basic rendering)
    bool addRasterLayer(const QString& filePath);
    bool addVectorLayer(const QString& filePath);
    bool addAOILayer(const QString& filePath);  // AOI with special red styling
    bool addStartPointMarker(const QString& filePath, double lat, double lon);  // Start point marker
    bool addEndPointMarker(const QString& filePath, double lat, double lon);    // End point marker
    void clearOverlays();
    
    // Layer visibility and ordering
    void setLayerVisible(const QString& layerPath, bool visible);
    void setLayerOrder(const QStringList& orderedPaths);
    int getLayerCount() const { return m_rasterOverlays.size() + m_vectorOverlays.size(); }
    
    // Feature highlighting
    void highlightFeature(const QString& layerPath, int fid);
    void clearHighlight();
    
    // Custom styling
    void setLayerStyle(const QString& layerPath, const VectorStyle& style);
    VectorStyle getLayerStyle(const QString& layerPath) const;
    bool hasCustomStyle(const QString& layerPath) const;
    
    // Feature inspection structures
    struct RasterSample {
        QString layerName;
        QString filePath;
        QVector<double> bandValues;
        QStringList bandNames;
        QString dataType;
        double noDataValue;
        QString crs;
    };
    
    struct VectorFeature {
        QString layerName;
        QString filePath;
        QString geometryType;
        QMap<QString, QString> attributes;
        QString crs;
        int featureId;
    };
    
    // Feature inspection methods
    QVector<RasterSample> sampleRastersAtPoint(double lat, double lon);
    QVector<VectorFeature> queryVectorsAtPoint(double lat, double lon, double tolerancePixels = 10.0);
    
    // Get current center coordinates
    double centerLat() const { return m_centerLat; }
    double centerLon() const { return m_centerLon; }
    
    // Convert between screen and geo coordinates
    QPointF screenToGeo(const QPoint& screenPos) const;
    QPoint geoToScreen(double lat, double lon) const;
    
signals:
    void coordinatesChanged(double lat, double lon);
    void zoomChanged(int zoom);
    void mapMoved();
    void moreInfoRequested(double lat, double lon);  // Right-click "More Info Here"
    void featureIdentifyRequested(double lat, double lon); // Shift+Click for feature inspection
    void featureClicked(double lat, double lon);  // Regular click for feature popup
    
protected:
    void paintEvent(QPaintEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;
    void contextMenuEvent(QContextMenuEvent* event) override;
    void keyPressEvent(QKeyEvent* event) override;
    
private slots:
    void onTileDownloaded(QNetworkReply* reply);
    void requestVisibleTiles();
    
private:
    
    void downloadTile(int x, int y, int zoom);
    QString getTileUrl(int x, int y, int zoom) const;
    void drawMap(QPainter& painter);
    void drawOverlays(QPainter& painter);
    
    // Map tile conversion helpers
    QPoint latLonToTile(double lat, double lon, int zoom) const;
    QPointF latLonToPixel(double lat, double lon, int zoom) const;
    QPointF pixelToLatLon(double x, double y, int zoom) const;
    QPointF latLonToPixel(double lat, double lon, double zoom) const;
    QPointF pixelToLatLon(double x, double y, double zoom) const;
    
    // Map state
    double m_centerLat;
    double m_centerLon;
    double m_zoom;
    BasemapType m_basemap{BasemapType::EsriWorldImagery};
    bool m_basemapVisible{true};
    
    // Overlays
    struct RasterOverlay {
        QString path;
        double minLat{0.0};
        double minLon{0.0};
        double maxLat{0.0};
        double maxLon{0.0};
        QImage image; // preview image in display order (top-left origin)
        bool valid{false};
        bool visible{true}; // visibility toggle
    };
    struct VectorOverlay {
        QString path;
        QVector<QVector<QPointF>> lines;    // list of line strings (lat,lon)
        QVector<QVector<QPointF>> polygons; // outline rings (lat,lon)
        QVector<QPointF> points;            // individual points (lat,lon)
        bool valid{false};
        bool visible{true}; // visibility toggle
        bool isAOI{false};  // special styling for Area of Interest
        bool isStartPoint{false};  // special styling for start point marker
        bool isEndPoint{false};    // special styling for end point marker
    };
    QVector<RasterOverlay> m_rasterOverlays;
    QVector<VectorOverlay> m_vectorOverlays;
    // Unified rendering order (bottom to top). Contains file paths.
    QStringList m_layerOrder;
    
    // Highlighted feature (for zoom-to-feature visualization)
    VectorOverlay m_highlightedFeature;
    bool m_hasHighlight{false};
    
    // Custom styles per layer
    QMap<QString, VectorStyle> m_layerStyles;
    
    // Tile cache
    QHash<TileKey, QPixmap> m_tileCache;
    QNetworkAccessManager* m_networkManager;
    QSet<TileKey> m_pendingTiles;
    QHash<QNetworkReply*, TileKey> m_pendingReplies;
    
    // Mouse interaction
    bool m_panning;
    QPoint m_lastMousePos;
    QPoint m_lastPanPos;
    QPoint m_clickPos;  // Store click position to detect drag vs click
    QPoint m_panOffset;
    
    // Update timer
    QTimer* m_updateTimer;
    
    // Constants
    static constexpr int TILE_SIZE = 256;
    static constexpr int MIN_ZOOM = 1;
    static constexpr int MAX_ZOOM = 23; // allow smoother, deeper zoom (Esri imagery supports up to ~23)
    static constexpr double ZOOM_STEP = 0.125; // finer increment per input step
};

// Hash function for TileKey
inline uint qHash(const MapWidget::TileKey& key, uint seed = 0) {
    return ::qHash(key.x, seed) ^ ::qHash(key.y, seed) ^ ::qHash(key.zoom, seed);
}

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_MAPWIDGET_H









