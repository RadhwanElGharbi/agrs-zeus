#include "agrs_zeus/gui/MapWidget.h"
#include <QPainter>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QKeyEvent>
#include <QNetworkRequest>
#include <QUrl>
#include <QtMath>
#include <QMenu>
#include <QClipboard>
#include <QGuiApplication>
#include <iostream>
#include <cmath>
#include <QImageReader>
#include <QPainterPath>
#include <QFileInfo>
#include <gdal_priv.h>
#include <ogrsf_frmts.h>
#include <ogr_spatialref.h>
#include <gdal_alg.h>

namespace agrs {
namespace gui {

MapWidget::MapWidget(QWidget* parent)
    : QWidget(parent)
    , m_centerLat(40.7128)  // Default: New York City
    , m_centerLon(-74.0060)
    , m_zoom(3.0)  // World view
    , m_panning(false)
    , m_panOffset(0, 0)
{
    setMouseTracking(true);
    setFocusPolicy(Qt::StrongFocus);
    
    m_networkManager = new QNetworkAccessManager(this);
    connect(m_networkManager, &QNetworkAccessManager::finished,
            this, &MapWidget::onTileDownloaded);
    
    m_updateTimer = new QTimer(this);
    connect(m_updateTimer, &QTimer::timeout, this, &MapWidget::requestVisibleTiles);
    m_updateTimer->start(100);  // Request tiles every 100ms
    
    std::cout << "[MapWidget] Initialized with center: " 
              << m_centerLat << ", " << m_centerLon 
              << " zoom: " << m_zoom << "\n";
}

MapWidget::~MapWidget() {
}

void MapWidget::setCenter(double lat, double lon) {
    m_centerLat = qBound(-85.0511, lat, 85.0511);  // Mercator limits
    m_centerLon = qBound(-180.0, lon, 180.0);
    m_panOffset = QPoint(0, 0);
    update();
    emit mapMoved();
}

void MapWidget::setZoom(double zoom) {
    double oldZoom = m_zoom;
    m_zoom = qBound(static_cast<double>(MIN_ZOOM), zoom, static_cast<double>(MAX_ZOOM));
    
    // Don't clear cache - we want to keep lower resolution tiles as fallbacks
    // Cache management happens naturally through LRU or size limits
    
    m_panOffset = QPoint(0, 0);
    update();
    emit zoomChanged(static_cast<int>(std::round(m_zoom)));
}

void MapWidget::setBasemap(BasemapType type) {
    if (m_basemap == type) return;
    m_basemap = type;
    m_tileCache.clear();
    update();
}

void MapWidget::setBasemapVisible(bool visible) {
    if (m_basemapVisible == visible) return;
    m_basemapVisible = visible;
    update();
}

QPointF MapWidget::screenToGeo(const QPoint& screenPos) const {
    // Use fractional zoom for accurate coordinate conversion
    QPointF centerPixel = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
    
    double pixelX = centerPixel.x() + (screenPos.x() - width() / 2.0) + m_panOffset.x();
    double pixelY = centerPixel.y() + (screenPos.y() - height() / 2.0) + m_panOffset.y();
    
    return pixelToLatLon(pixelX, pixelY, m_zoom);
}

QPoint MapWidget::geoToScreen(double lat, double lon) const {
    QPointF pixel = latLonToPixel(lat, lon, m_zoom);
    QPointF centerPixel = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
    
    int x = width() / 2 + (pixel.x() - centerPixel.x()) - m_panOffset.x();
    int y = height() / 2 + (pixel.y() - centerPixel.y()) - m_panOffset.y();
    
    return QPoint(x, y);
}

void MapWidget::paintEvent(QPaintEvent* event) {
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);  // Smooth scaling
    
    // Fill background
    painter.fillRect(rect(), QColor(200, 200, 200));
    
    // Draw map tiles only if basemap is visible
    if (m_basemapVisible) {
        drawMap(painter);
    }
    // Draw overlays (rasters and vectors)
    drawOverlays(painter);
    
    // Draw loading indicator if tiles pending
    if (!m_pendingTiles.isEmpty()) {
        painter.setPen(Qt::white);
        painter.drawText(10, 20, QString("Loading tiles... (%1 pending)").arg(m_pendingTiles.size()));
    }
    
    // Draw zoom level indicator
    painter.setPen(Qt::black);
    painter.drawText(10, height() - 10, QString("Zoom: %1").arg(m_zoom, 0, 'f', 2));
}

void MapWidget::drawMap(QPainter& painter) {
    // Use ceiling for tile zoom to load higher resolution tiles sooner
    // This reduces blur during zoom-in
    int tileZoom = static_cast<int>(std::ceil(m_zoom));
    tileZoom = qBound(MIN_ZOOM, tileZoom, MAX_ZOOM);
    
    // Scale factor for displaying tiles at fractional zoom
    // If zoom = 10.5, tileZoom = 11 (ceiling), need to scale DOWN by 2^-0.5
    double scaleFactor = std::pow(2.0, m_zoom - tileZoom);
    double effectiveTileSize = TILE_SIZE * scaleFactor;
    
    // Calculate map center in pixel coordinates at fractional zoom
    QPointF centerPixel = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
    
    // Offset for panning
    double offsetX = centerPixel.x() - width() / 2.0 + m_panOffset.x();
    double offsetY = centerPixel.y() - height() / 2.0 + m_panOffset.y();
    
    // Calculate which tiles (at integer zoom) are visible
    // Need to account for the fact that tiles will be scaled
    int minTileX = static_cast<int>(std::floor(offsetX / effectiveTileSize));
    int maxTileX = static_cast<int>(std::ceil((offsetX + width()) / effectiveTileSize));
    int minTileY = static_cast<int>(std::floor(offsetY / effectiveTileSize));
    int maxTileY = static_cast<int>(std::ceil((offsetY + height()) / effectiveTileSize));
    
    // Clamp to valid tile range for this zoom level
    int maxTile = (1 << tileZoom) - 1;
    minTileX = qBound(0, minTileX, maxTile);
    maxTileX = qBound(0, maxTileX, maxTile);
    minTileY = qBound(0, minTileY, maxTile);
    maxTileY = qBound(0, maxTileY, maxTile);
    
    // Draw tiles with scaling
    // Strategy: Try to use highest resolution tiles available
    for (int tileX = minTileX; tileX <= maxTileX; ++tileX) {
        for (int tileY = minTileY; tileY <= maxTileY; ++tileY) {
            TileKey key{tileX, tileY, tileZoom};
            
            // Calculate tile position on screen (accounting for scale)
            double x = (tileX * effectiveTileSize) - offsetX;
            double y = (tileY * effectiveTileSize) - offsetY;
            
            if (m_tileCache.contains(key)) {
                // Draw cached tile scaled to effectiveTileSize
                QRectF targetRect(x, y, effectiveTileSize, effectiveTileSize);
                painter.drawPixmap(targetRect, m_tileCache[key], m_tileCache[key].rect());
            } else {
                // Fallback: try to find a lower resolution tile to display while loading
                bool drewFallback = false;
                
                // Try one zoom level down (parent tile)
                if (tileZoom > MIN_ZOOM) {
                    int parentZoom = tileZoom - 1;
                    int parentX = tileX / 2;
                    int parentY = tileY / 2;
                    TileKey parentKey{parentX, parentY, parentZoom};
                    
                    if (m_tileCache.contains(parentKey)) {
                        // Calculate which quadrant of parent tile to use
                        int quadX = tileX % 2;
                        int quadY = tileY % 2;
                        
                        // Source rect is 1/4 of parent tile
                        QRectF sourceRect(quadX * TILE_SIZE / 2.0, quadY * TILE_SIZE / 2.0,
                                         TILE_SIZE / 2.0, TILE_SIZE / 2.0);
                        QRectF targetRect(x, y, effectiveTileSize, effectiveTileSize);
                        
                        painter.drawPixmap(targetRect, m_tileCache[parentKey], sourceRect);
                        drewFallback = true;
                    }
                }
                
                if (!drewFallback) {
                    // Draw placeholder
                    painter.fillRect(QRectF(x, y, effectiveTileSize, effectiveTileSize), QColor(220, 220, 220));
                    painter.setPen(Qt::gray);
                    painter.drawRect(QRectF(x, y, effectiveTileSize - 1, effectiveTileSize - 1));
                    painter.drawText(QRectF(x + 10, y + 10, effectiveTileSize - 20, effectiveTileSize - 20),
                                    Qt::AlignLeft | Qt::AlignTop,
                                    QString("%1,%2\nz%3").arg(tileX).arg(tileY).arg(tileZoom));
                }
                
                // Request tile download
                if (!m_pendingTiles.contains(key)) {
                    downloadTile(tileX, tileY, tileZoom);
                }
            }
        }
    }
}

void MapWidget::drawOverlays(QPainter& painter) {
    // Unified Z-order: draw according to m_layerOrder (bottom to top)
    // Items not in m_layerOrder fall back to type-specific order after
    
    static int debugCounter = 0;
    bool debug = (debugCounter++ % 60 == 0); // Print every 60 frames

    auto drawRaster = [&](const RasterOverlay& ro) {
        if (!ro.valid) {
            if (debug) std::cout << "[MapWidget] Raster invalid: " << ro.path.toStdString() << "\n";
            return;
        }
        if (!ro.visible) {
            if (debug) std::cout << "[MapWidget] Raster not visible: " << ro.path.toStdString() << "\n";
            return;
        }
        if (ro.image.isNull()) {
            if (debug) std::cout << "[MapWidget] Raster image null: " << ro.path.toStdString() << "\n";
            return;
        }
        
        QPoint topLeft = geoToScreen(ro.maxLat, ro.minLon);
        QPoint bottomRight = geoToScreen(ro.minLat, ro.maxLon);
        QRect target(topLeft, bottomRight);
        
        if (debug) {
            std::cout << "[MapWidget] Drawing raster: " << ro.path.toStdString() 
                      << " at screen rect (" << target.x() << "," << target.y() 
                      << ") to (" << target.right() << "," << target.bottom() << ")\n";
        }
        
        painter.drawImage(target, ro.image);
    };

    auto drawVector = [&](const VectorOverlay& vo) {
        if (!vo.valid) {
            if (debug) std::cout << "[MapWidget] Vector invalid: " << vo.path.toStdString() << "\n";
            return;
        }
        if (!vo.visible) {
            if (debug) std::cout << "[MapWidget] Vector not visible: " << vo.path.toStdString() << "\n";
            return;
        }
        
        if (debug) {
            std::cout << "[MapWidget] Drawing vector: " << vo.path.toStdString() 
                      << " (" << vo.lines.size() << " lines, " << vo.polygons.size() << " polygons)\n";
        }
        
        painter.setRenderHint(QPainter::Antialiasing, true);
        
        // Calculate scale-dependent pen width (wider lines at higher zoom)
        double penWidth = std::max(2.0, m_zoom / 3.0);
        
        // Lines: Use bright colors with high contrast over satellite imagery
        // Color scheme: Magenta with white outline (halo) for maximum visibility
        painter.setPen(QPen(QColor(255, 255, 255, 180), penWidth + 2));  // White halo
        for (const auto& line : vo.lines) {
            QPainterPath path;
            bool first = true;
            for (const QPointF& ll : line) {
                QPoint p = geoToScreen(ll.x(), ll.y());
                if (first) { path.moveTo(p); first = false; }
                else { path.lineTo(p); }
            }
            painter.drawPath(path);
        }
        
        // Draw lines again on top with bright magenta
        painter.setPen(QPen(QColor(255, 0, 255, 220), penWidth));  // Bright magenta
        for (const auto& line : vo.lines) {
            QPainterPath path;
            bool first = true;
            for (const QPointF& ll : line) {
                QPoint p = geoToScreen(ll.x(), ll.y());
                if (first) { path.moveTo(p); first = false; }
                else { path.lineTo(p); }
            }
            painter.drawPath(path);
        }
        
        // Polygons: Fill with semi-transparent color + contrasting outline
        for (const auto& ring : vo.polygons) {
            QPainterPath path;
            bool first = true;
            for (const QPointF& ll : ring) {
                QPoint p = geoToScreen(ll.x(), ll.y());
                if (first) { path.moveTo(p); first = false; }
                else { path.lineTo(p); }
            }
            path.closeSubpath();
            
            // Fill with semi-transparent orange (high visibility over both dark and light imagery)
            painter.fillPath(path, QColor(255, 165, 0, 80));  // Orange fill, 30% opacity
            
            // White outline halo for contrast
            painter.setPen(QPen(QColor(255, 255, 255, 180), penWidth + 1));
            painter.drawPath(path);
            
            // Bright orange outline on top
            painter.setPen(QPen(QColor(255, 140, 0, 255), penWidth));
            painter.drawPath(path);
        }
    };

    // Draw by unified order first
    for (const QString& path : m_layerOrder) {
        bool drawn = false;
        for (const RasterOverlay& ro : m_rasterOverlays) {
            if (ro.path == path) { drawRaster(ro); drawn = true; break; }
        }
        if (drawn) continue;
        for (const VectorOverlay& vo : m_vectorOverlays) {
            if (vo.path == path) { drawVector(vo); break; }
        }
    }

    // Draw any remaining rasters not in the order list
    for (const RasterOverlay& ro : m_rasterOverlays) {
        if (!m_layerOrder.contains(ro.path)) drawRaster(ro);
    }
    // Draw any remaining vectors not in the order list
    for (const VectorOverlay& vo : m_vectorOverlays) {
        if (!m_layerOrder.contains(vo.path)) drawVector(vo);
    }
}

bool MapWidget::addRasterLayer(const QString& filePath) {
    GDALAllRegister();
    GDALDataset* ds = (GDALDataset*)GDALOpen(filePath.toStdString().c_str(), GA_ReadOnly);
    if (!ds) {
        std::cerr << "[MapWidget] Failed to open raster: " << filePath.toStdString() << "\n";
        return false;
    }
    
    RasterOverlay overlay;
    overlay.path = filePath;
    
    // Get geotransform and CRS
    double adfGeoTransform[6];
    if (ds->GetGeoTransform(adfGeoTransform) != CE_None) {
        std::cerr << "[MapWidget] Raster has no geotransform\n";
        GDALClose(ds);
        return false;
    }
    
    OGRSpatialReference srcSRS;
    if (srcSRS.SetFromUserInput(ds->GetProjectionRef()) != OGRERR_NONE) {
        std::cerr << "[MapWidget] Failed to parse raster CRS\n";
        GDALClose(ds);
        return false;
    }
    
    OGRSpatialReference wgs84;
    wgs84.SetWellKnownGeogCS("WGS84");
    OGRCoordinateTransformation* coordTrans = OGRCreateCoordinateTransformation(&srcSRS, &wgs84);
    if (!coordTrans) {
        std::cerr << "[MapWidget] Failed to create coordinate transformation\n";
        GDALClose(ds);
        return false;
    }
    
    // Get raster corner coordinates in source CRS (handle rotation/skew)
    const int width = ds->GetRasterXSize();
    const int height = ds->GetRasterYSize();

    auto applyGT = [&](double px, double py, double &gx, double &gy) {
        gx = adfGeoTransform[0] + px * adfGeoTransform[1] + py * adfGeoTransform[2];
        gy = adfGeoTransform[3] + px * adfGeoTransform[4] + py * adfGeoTransform[5];
    };

    // Pixel-space corners
    double cX[4], cY[4];
    applyGT(0, 0, cX[0], cY[0]);           // top-left
    applyGT(width, 0, cX[1], cY[1]);       // top-right
    applyGT(width, height, cX[2], cY[2]);  // bottom-right
    applyGT(0, height, cX[3], cY[3]);      // bottom-left

    // Transform all 4 corners to WGS84 and compute bounds
    double minLat =  90.0, maxLat = -90.0;
    double minLon = 180.0, maxLon = -180.0;
    for (int i = 0; i < 4; ++i) {
        double x = cX[i], y = cY[i];
        if (!coordTrans->Transform(1, &x, &y)) continue; // skip if transform fails
        minLat = std::min(minLat, y);
        maxLat = std::max(maxLat, y);
        minLon = std::min(minLon, x);
        maxLon = std::max(maxLon, x);
    }

    overlay.minLon = minLon;
    overlay.maxLon = maxLon;
    overlay.minLat = minLat;
    overlay.maxLat = maxLat;
    
    // Read raster as preview image (downsample if huge)
    int previewWidth = std::min(width, 2048);
    int previewHeight = std::min(height, 2048);
    
    GDALRasterBand* band1 = ds->GetRasterBand(1);
    if (!band1) {
        std::cerr << "[MapWidget] Raster has no bands\n";
        OCTDestroyCoordinateTransformation(coordTrans);
        GDALClose(ds);
        return false;
    }
    
    // Read first band as grayscale or RGB if available
    int numBands = ds->GetRasterCount();
    if (numBands >= 3) {
        // RGB
        std::vector<uint8_t> r(previewWidth * previewHeight);
        std::vector<uint8_t> g(previewWidth * previewHeight);
        std::vector<uint8_t> b(previewWidth * previewHeight);
        
        ds->GetRasterBand(1)->RasterIO(GF_Read, 0, 0, width, height,
                                        r.data(), previewWidth, previewHeight,
                                        GDT_Byte, 0, 0);
        ds->GetRasterBand(2)->RasterIO(GF_Read, 0, 0, width, height,
                                        g.data(), previewWidth, previewHeight,
                                        GDT_Byte, 0, 0);
        ds->GetRasterBand(3)->RasterIO(GF_Read, 0, 0, width, height,
                                        b.data(), previewWidth, previewHeight,
                                        GDT_Byte, 0, 0);
        
        overlay.image = QImage(previewWidth, previewHeight, QImage::Format_RGB888);
        for (int y = 0; y < previewHeight; ++y) {
            for (int x = 0; x < previewWidth; ++x) {
                int idx = y * previewWidth + x;
                overlay.image.setPixel(x, y, qRgb(r[idx], g[idx], b[idx]));
            }
        }
    } else {
        // Single band - grayscale
        std::vector<uint8_t> gray(previewWidth * previewHeight);
        band1->RasterIO(GF_Read, 0, 0, width, height,
                       gray.data(), previewWidth, previewHeight,
                       GDT_Byte, 0, 0);
        
        overlay.image = QImage(previewWidth, previewHeight, QImage::Format_Grayscale8);
        for (int y = 0; y < previewHeight; ++y) {
            for (int x = 0; x < previewWidth; ++x) {
                int idx = y * previewWidth + x;
                overlay.image.setPixel(x, y, qRgb(gray[idx], gray[idx], gray[idx]));
            }
        }
    }
    
    overlay.valid = true;
    overlay.visible = true; // Ensure it's visible by default
    m_rasterOverlays.append(overlay);
    
    // Add to unified layer order if not already present
    if (!m_layerOrder.contains(filePath)) {
        m_layerOrder.append(filePath);
    }
    
    OCTDestroyCoordinateTransformation(coordTrans);
    GDALClose(ds);
    
    std::cout << "[MapWidget] Loaded raster: " << filePath.toStdString() 
              << " (bounds: " << minLat << "," << minLon << " to " << maxLat << "," << maxLon 
              << "), size: " << overlay.image.width() << "x" << overlay.image.height() << "\n";
    
    update();
    return true;
}

bool MapWidget::addVectorLayer(const QString& filePath) {
    GDALAllRegister();
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(filePath.toStdString().c_str(), 
                                                GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
    if (!ds) {
        std::cerr << "[MapWidget] Failed to open vector: " << filePath.toStdString() << "\n";
        return false;
    }
    
    VectorOverlay overlay;
    overlay.path = filePath;
    
    OGRSpatialReference wgs84;
    wgs84.SetWellKnownGeogCS("WGS84");
    
    // Process all layers in the dataset
    for (int iLayer = 0; iLayer < ds->GetLayerCount(); ++iLayer) {
        OGRLayer* layer = ds->GetLayer(iLayer);
        if (!layer) continue;
        
        OGRSpatialReference* srcSRS = layer->GetSpatialRef();
        OGRCoordinateTransformation* coordTrans = nullptr;
        if (srcSRS && !srcSRS->IsSame(&wgs84)) {
            coordTrans = OGRCreateCoordinateTransformation(srcSRS, &wgs84);
        }
        
        layer->ResetReading();
        OGRFeature* feat;
        while ((feat = layer->GetNextFeature()) != nullptr) {
            OGRGeometry* geom = feat->GetGeometryRef();
            if (!geom) {
                OGRFeature::DestroyFeature(feat);
                continue;
            }
            
            // Clone and transform geometry if needed
            OGRGeometry* geomWGS84 = geom->clone();
            if (coordTrans) {
                geomWGS84->transform(coordTrans);
            }
            
            // Extract coordinates based on geometry type
            OGRwkbGeometryType geomType = wkbFlatten(geomWGS84->getGeometryType());
            
            if (geomType == wkbPoint) {
                OGRPoint* pt = (OGRPoint*)geomWGS84;
                QVector<QPointF> line;
                line.append(QPointF(pt->getY(), pt->getX())); // lat, lon
                overlay.lines.append(line);
            }
            else if (geomType == wkbLineString) {
                OGRLineString* ls = (OGRLineString*)geomWGS84;
                QVector<QPointF> line;
                for (int i = 0; i < ls->getNumPoints(); ++i) {
                    line.append(QPointF(ls->getY(i), ls->getX(i))); // lat, lon
                }
                overlay.lines.append(line);
            }
            else if (geomType == wkbPolygon) {
                OGRPolygon* poly = (OGRPolygon*)geomWGS84;
                OGRLinearRing* ring = poly->getExteriorRing();
                if (ring) {
                    QVector<QPointF> polyRing;
                    for (int i = 0; i < ring->getNumPoints(); ++i) {
                        polyRing.append(QPointF(ring->getY(i), ring->getX(i))); // lat, lon
                    }
                    overlay.polygons.append(polyRing);
                }
            }
            else if (geomType == wkbMultiPoint || geomType == wkbMultiLineString || 
                     geomType == wkbMultiPolygon || geomType == wkbGeometryCollection) {
                OGRGeometryCollection* gc = (OGRGeometryCollection*)geomWGS84;
                for (int i = 0; i < gc->getNumGeometries(); ++i) {
                    OGRGeometry* subGeom = gc->getGeometryRef(i);
                    OGRwkbGeometryType subType = wkbFlatten(subGeom->getGeometryType());
                    
                    if (subType == wkbLineString) {
                        OGRLineString* ls = (OGRLineString*)subGeom;
                        QVector<QPointF> line;
                        for (int j = 0; j < ls->getNumPoints(); ++j) {
                            line.append(QPointF(ls->getY(j), ls->getX(j)));
                        }
                        overlay.lines.append(line);
                    }
                    else if (subType == wkbPolygon) {
                        OGRPolygon* poly = (OGRPolygon*)subGeom;
                        OGRLinearRing* ring = poly->getExteriorRing();
                        if (ring) {
                            QVector<QPointF> polyRing;
                            for (int j = 0; j < ring->getNumPoints(); ++j) {
                                polyRing.append(QPointF(ring->getY(j), ring->getX(j)));
                            }
                            overlay.polygons.append(polyRing);
                        }
                    }
                }
            }
            
            delete geomWGS84;
            OGRFeature::DestroyFeature(feat);
        }
        
        if (coordTrans) {
            OCTDestroyCoordinateTransformation(coordTrans);
        }
    }
    
    overlay.valid = true;
    overlay.visible = true; // Ensure it's visible by default
    m_vectorOverlays.append(overlay);
    
    // Add to unified layer order if not already present
    if (!m_layerOrder.contains(filePath)) {
        m_layerOrder.append(filePath);
    }
    
    // Calculate bounding box for debugging
    double minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const auto& line : overlay.lines) {
        for (const auto& pt : line) {
            minLat = std::min(minLat, pt.x());
            maxLat = std::max(maxLat, pt.x());
            minLon = std::min(minLon, pt.y());
            maxLon = std::max(maxLon, pt.y());
        }
    }
    for (const auto& poly : overlay.polygons) {
        for (const auto& pt : poly) {
            minLat = std::min(minLat, pt.x());
            maxLat = std::max(maxLat, pt.x());
            minLon = std::min(minLon, pt.y());
            maxLon = std::max(maxLon, pt.y());
        }
    }
    
    GDALClose(ds);
    
    std::cout << "[MapWidget] Loaded vector: " << filePath.toStdString() 
              << " (" << overlay.lines.size() << " lines, " << overlay.polygons.size() << " polygons)"
              << " bounds: (" << minLat << "," << minLon << ") to (" << maxLat << "," << maxLon << ")\n";
    
    update();
    return true;
}

void MapWidget::clearOverlays() {
    m_rasterOverlays.clear();
    m_vectorOverlays.clear();
    update();
}

void MapWidget::setLayerVisible(const QString& layerPath, bool visible) {
    // Update raster visibility
    for (RasterOverlay& ro : m_rasterOverlays) {
        if (ro.path == layerPath) {
            ro.visible = visible;
            update();
            return;
        }
    }
    // Update vector visibility
    for (VectorOverlay& vo : m_vectorOverlays) {
        if (vo.path == layerPath) {
            vo.visible = visible;
            update();
            return;
        }
    }
}

void MapWidget::setLayerOrder(const QStringList& orderedPaths) {
    // Store unified ordered list; rendering will respect this strictly
    m_layerOrder = orderedPaths;
    update();
}

void MapWidget::downloadTile(int x, int y, int zoom) {
    TileKey key{x, y, zoom};
    
    if (m_pendingTiles.contains(key) || m_tileCache.contains(key)) {
        return;
    }
    
    QString url = getTileUrl(x, y, zoom);
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::UserAgentHeader, "AGRS ZEUS GIS/0.1");
    m_pendingTiles.insert(key);
    QNetworkReply* reply = m_networkManager->get(request);
    m_pendingReplies.insert(reply, key);
}

QString MapWidget::getTileUrl(int x, int y, int zoom) const {
    if (m_basemap == BasemapType::OpenStreetMap) {
        return QString("https://tile.openstreetmap.org/%1/%2/%3.png")
            .arg(zoom).arg(x).arg(y);
    } else {
        return QString("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%1/%2/%3")
            .arg(zoom).arg(y).arg(x);
    }
}

void MapWidget::contextMenuEvent(QContextMenuEvent* event) {
    QMenu menu(this);
    QPoint pos = event->pos();
    QPointF geo = screenToGeo(pos);
    double lat = geo.x();
    double lon = geo.y();

    QAction* copyAction = menu.addAction(tr("Copy Coordinates"));
    QAction* moreInfoAction = menu.addAction(tr("More Info Here"));

    QAction* chosen = menu.exec(mapToGlobal(pos));
    if (!chosen) return;

    if (chosen == copyAction) {
        QClipboard* cb = QGuiApplication::clipboard();
        cb->setText(QString::asprintf("%.6f, %.6f", lat, lon));
    } else if (chosen == moreInfoAction) {
        emit moreInfoRequested(lat, lon);
    }
}

void MapWidget::onTileDownloaded(QNetworkReply* reply) {
    if (!reply) return;
    
    TileKey key = m_pendingReplies.value(reply);
    m_pendingReplies.remove(reply);
    m_pendingTiles.remove(key);
    
    if (reply->error() == QNetworkReply::NoError) {
        QByteArray data = reply->readAll();
        QPixmap pixmap;
        if (pixmap.loadFromData(data)) {
            m_tileCache[key] = pixmap;
            update();
        } else {
            std::cerr << "[MapWidget] Failed to load tile image for " 
                      << key.x << "," << key.y << "," << key.zoom << "\n";
        }
    } else {
        std::cerr << "[MapWidget] Tile download error: " 
                  << reply->errorString().toStdString() << "\n";
    }
    
    reply->deleteLater();
}

void MapWidget::requestVisibleTiles() {
    // Trigger update to request any missing tiles
    update();
}

void MapWidget::mousePressEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        // Shift+Click for feature inspection
        if (event->modifiers() & Qt::ShiftModifier) {
            QPointF geo = screenToGeo(event->pos());
            emit featureIdentifyRequested(geo.x(), geo.y());  // lat, lon
        } else {
            m_panning = true;
            m_lastMousePos = event->pos();
            setCursor(Qt::ClosedHandCursor);
        }
    }
}

void MapWidget::mouseMoveEvent(QMouseEvent* event) {
    // Update cursor coordinates
    QPointF geo = screenToGeo(event->pos());
    emit coordinatesChanged(geo.x(), geo.y());  // lat, lon
    
    if (m_panning) {
        // Pan the map
        QPoint delta = event->pos() - m_lastMousePos;
        m_panOffset -= delta;
        m_lastMousePos = event->pos();
        update();
    }
}

void MapWidget::mouseReleaseEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton && m_panning) {
        m_panning = false;
        setCursor(Qt::ArrowCursor);
        
        // Update center based on pan offset
        QPointF centerPixel = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
        centerPixel += QPointF(m_panOffset.x(), m_panOffset.y());
        QPointF newCenter = pixelToLatLon(centerPixel.x(), centerPixel.y(), m_zoom);
        
        m_centerLat = newCenter.x();
        m_centerLon = newCenter.y();
        m_panOffset = QPoint(0, 0);
        
        update();
        emit mapMoved();
    }
}

void MapWidget::wheelEvent(QWheelEvent* event) {
    // Get the cursor position
    QPoint cursorPos = event->position().toPoint();
    
    // Get the geographic coordinates under the cursor BEFORE zoom
    QPointF geoBeforeZoom = screenToGeo(cursorPos);
    
    // Calculate zoom change
    double numSteps = event->angleDelta().y() / 120.0;  // 120 is standard wheel delta
    double zoomChange = numSteps * ZOOM_STEP;
    double newZoom = qBound(static_cast<double>(MIN_ZOOM), 
                            m_zoom + zoomChange, 
                            static_cast<double>(MAX_ZOOM));
    
    if (qFuzzyCompare(newZoom, m_zoom)) {
        return;  // No change
    }
    
    // Calculate the screen position change due to zoom
    // We want to keep geoBeforeZoom at the same screen position (cursorPos)
    
    // Get pixel coordinates at old zoom
    QPointF pixelAtOldZoom = latLonToPixel(geoBeforeZoom.x(), geoBeforeZoom.y(), m_zoom);
    QPointF centerPixelAtOldZoom = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
    
    // Update zoom
    m_zoom = newZoom;
    
    // Get pixel coordinates at new zoom
    QPointF pixelAtNewZoom = latLonToPixel(geoBeforeZoom.x(), geoBeforeZoom.y(), m_zoom);
    QPointF centerPixelAtNewZoom = latLonToPixel(m_centerLat, m_centerLon, m_zoom);
    
    // Calculate the offset needed to keep the cursor position fixed
    // The point under the cursor should remain at the same screen position
    // Screen offset from center to cursor
    QPointF screenOffset(cursorPos.x() - width() / 2.0, cursorPos.y() - height() / 2.0);
    
    // The pixel coordinate we want at the cursor position is pixelAtNewZoom
    // This should be at centerPixelAtNewZoom + screenOffset
    // So: centerPixelAtNewZoom + screenOffset = pixelAtNewZoom
    // Therefore: new center pixel = pixelAtNewZoom - screenOffset
    QPointF newCenterPixel = pixelAtNewZoom - screenOffset;
    
    // Convert back to geo coordinates
    QPointF newCenterGeo = pixelToLatLon(newCenterPixel.x(), newCenterPixel.y(), m_zoom);
    
    m_centerLat = qBound(-85.0511, newCenterGeo.x(), 85.0511);
    m_centerLon = qBound(-180.0, newCenterGeo.y(), 180.0);
    m_panOffset = QPoint(0, 0);
    
    update();
    emit zoomChanged(static_cast<int>(std::round(m_zoom)));
}

void MapWidget::keyPressEvent(QKeyEvent* event) {
    // For keyboard zoom, zoom to center
    double zoomChange = 0.0;
    
    switch (event->key()) {
    case Qt::Key_Plus:
    case Qt::Key_Equal:
        zoomChange = ZOOM_STEP;
        break;
    case Qt::Key_Minus:
    case Qt::Key_Underscore:
        zoomChange = -ZOOM_STEP;
        break;
    case Qt::Key_PageUp:
        zoomChange = 1.0;
        break;
    case Qt::Key_PageDown:
        zoomChange = -1.0;
        break;
    default:
        QWidget::keyPressEvent(event);
        return;
    }
    
    setZoom(m_zoom + zoomChange);
    event->accept();
}

void MapWidget::resizeEvent(QResizeEvent* event) {
    QWidget::resizeEvent(event);
    update();
}

// =============================================================================
// COORDINATE CONVERSION HELPERS (Web Mercator)
// =============================================================================

QPoint MapWidget::latLonToTile(double lat, double lon, int zoom) const {
    int n = 1 << zoom;
    int x = static_cast<int>((lon + 180.0) / 360.0 * n);
    double latRad = lat * M_PI / 180.0;
    int y = static_cast<int>((1.0 - asinh(tan(latRad)) / M_PI) / 2.0 * n);
    return QPoint(x, y);
}

// Integer zoom versions (for tile calculations)
QPointF MapWidget::latLonToPixel(double lat, double lon, int zoom) const {
    int n = 1 << zoom;
    double x = (lon + 180.0) / 360.0 * n * TILE_SIZE;
    double latRad = lat * M_PI / 180.0;
    double y = (1.0 - asinh(tan(latRad)) / M_PI) / 2.0 * n * TILE_SIZE;
    return QPointF(x, y);
}

QPointF MapWidget::pixelToLatLon(double x, double y, int zoom) const {
    int n = 1 << zoom;
    double lon = x / (n * TILE_SIZE) * 360.0 - 180.0;
    double latRad = atan(sinh(M_PI * (1.0 - 2.0 * y / (n * TILE_SIZE))));
    double lat = latRad * 180.0 / M_PI;
    return QPointF(lat, lon);
}

// Fractional zoom versions (for smooth scaling and accurate geo conversions)
QPointF MapWidget::latLonToPixel(double lat, double lon, double zoom) const {
    double scale = std::pow(2.0, zoom);
    double x = (lon + 180.0) / 360.0 * scale * TILE_SIZE;
    double latRad = lat * M_PI / 180.0;
    double y = (1.0 - asinh(tan(latRad)) / M_PI) / 2.0 * scale * TILE_SIZE;
    return QPointF(x, y);
}

QPointF MapWidget::pixelToLatLon(double x, double y, double zoom) const {
    double scale = std::pow(2.0, zoom);
    double lon = x / (scale * TILE_SIZE) * 360.0 - 180.0;
    double latRad = atan(sinh(M_PI * (1.0 - 2.0 * y / (scale * TILE_SIZE))));
    double lat = latRad * 180.0 / M_PI;
    return QPointF(lat, lon);
}

// ==============================================================================
// FEATURE INSPECTION - Raster Pixel Sampling
// ==============================================================================

QVector<MapWidget::RasterSample> MapWidget::sampleRastersAtPoint(double lat, double lon) {
    QVector<RasterSample> samples;
    
    for (const RasterOverlay& ro : m_rasterOverlays) {
        if (!ro.valid || !ro.visible) continue;
        
        // Open the raster file
        GDALDataset* ds = (GDALDataset*)GDALOpen(ro.path.toStdString().c_str(), GA_ReadOnly);
        if (!ds) continue;
        
        RasterSample sample;
        sample.layerName = QFileInfo(ro.path).fileName();
        sample.filePath = ro.path;
        
        // Get CRS
        const char* projRef = ds->GetProjectionRef();
        sample.crs = projRef ? QString(projRef) : "Unknown";
        
        // Convert lat/lon to raster pixel coordinates
        OGRSpatialReference wgs84;
        wgs84.SetWellKnownGeogCS("WGS84");
        
        OGRSpatialReference rasterSRS;
        if (rasterSRS.SetFromUserInput(projRef) == OGRERR_NONE) {
            OGRCoordinateTransformation* transform = OGRCreateCoordinateTransformation(&wgs84, &rasterSRS);
            if (transform) {
                double x = lon, y = lat;
                if (transform->Transform(1, &x, &y)) {
                    // Convert to pixel coordinates using geotransform
                    double adfGeoTransform[6];
                    if (ds->GetGeoTransform(adfGeoTransform) == CE_None) {
                        // Invert affine transform robustly (handles rotation/skew)
                        // Compute determinant of 2x2 matrix [[gt1, gt2],[gt4, gt5]]
                        double det = adfGeoTransform[1] * adfGeoTransform[5] - adfGeoTransform[2] * adfGeoTransform[4];
                        if (std::abs(det) < 1e-12) {
                            GDALClose(ds);
                            continue; // Singular transform
                        }
                        double inv11 =  adfGeoTransform[5] / det;
                        double inv12 = -adfGeoTransform[2] / det;
                        double inv21 = -adfGeoTransform[4] / det;
                        double inv22 =  adfGeoTransform[1] / det;
                        double dx = x - adfGeoTransform[0];
                        double dy = y - adfGeoTransform[3];
                        double pxd = inv11 * dx + inv12 * dy;
                        double pyd = inv21 * dx + inv22 * dy;
                        int px = static_cast<int>(std::floor(pxd));
                        int py = static_cast<int>(std::floor(pyd));
                        
                        // Check if within bounds
                        if (px >= 0 && px < ds->GetRasterXSize() && py >= 0 && py < ds->GetRasterYSize()) {
                            // Sample all bands
                            int numBands = ds->GetRasterCount();
                            for (int i = 1; i <= numBands; ++i) {
                                GDALRasterBand* band = ds->GetRasterBand(i);
                                if (band) {
                                    double pixelValue;
                                    if (band->RasterIO(GF_Read, px, py, 1, 1, &pixelValue, 1, 1, GDT_Float64, 0, 0) == CE_None) {
                                        sample.bandValues.append(pixelValue);
                                        sample.bandNames.append(QString("Band %1").arg(i));
                                    }
                                    int hasNoData;
                                    sample.noDataValue = band->GetNoDataValue(&hasNoData);
                                    sample.dataType = QString(GDALGetDataTypeName(band->GetRasterDataType()));
                                }
                            }
                            samples.append(sample);
                        }
                    }
                }
                OCTDestroyCoordinateTransformation(transform);
            }
        }
        
        GDALClose(ds);
    }
    
    return samples;
}

// ==============================================================================
// FEATURE INSPECTION - Vector Feature Query
// ==============================================================================

QVector<MapWidget::VectorFeature> MapWidget::queryVectorsAtPoint(double lat, double lon, double tolerancePixels) {
    QVector<VectorFeature> features;
    
    // Convert tolerance from pixels to degrees (approximate)
    double toleranceDegrees = tolerancePixels / (256.0 * std::pow(2.0, m_zoom)) * 360.0;
    
    for (const VectorOverlay& vo : m_vectorOverlays) {
        if (!vo.valid || !vo.visible) continue;
        
        // Open the vector file
        GDALDataset* ds = (GDALDataset*)GDALOpenEx(vo.path.toStdString().c_str(),
                                                    GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
        if (!ds) continue;
        
        // Process all layers
        for (int iLayer = 0; iLayer < ds->GetLayerCount(); ++iLayer) {
            OGRLayer* layer = ds->GetLayer(iLayer);
            if (!layer) continue;
            
            // Get CRS
            OGRSpatialReference* srcSRS = layer->GetSpatialRef();
            QString crsName = "Unknown";
            if (srcSRS) {
                char* wkt = nullptr;
                srcSRS->exportToWkt(&wkt);
                if (wkt) {
                    crsName = QString(wkt);
                    CPLFree(wkt);
                }
            }
            
            // Create point geometry for query
            OGRPoint queryPoint(lon, lat);
            OGRSpatialReference wgs84;
            wgs84.SetWellKnownGeogCS("WGS84");
            queryPoint.assignSpatialReference(&wgs84);
            
            // Transform to layer CRS if needed
            if (srcSRS && !srcSRS->IsSame(&wgs84)) {
                OGRCoordinateTransformation* transform = OGRCreateCoordinateTransformation(&wgs84, srcSRS);
                if (transform) {
                    queryPoint.transform(transform);
                    OCTDestroyCoordinateTransformation(transform);
                }
            }
            
            // Buffer point for tolerance
            OGRGeometry* bufferGeom = queryPoint.Buffer(toleranceDegrees);
            if (!bufferGeom) continue;
            
            // Spatial filter
            layer->SetSpatialFilter(bufferGeom);
            layer->ResetReading();
            
            OGRFeature* feat;
            while ((feat = layer->GetNextFeature()) != nullptr) {
                VectorFeature vf;
                vf.layerName = QString("%1::%2").arg(QFileInfo(vo.path).fileName()).arg(layer->GetName());
                vf.filePath = vo.path;
                vf.featureId = static_cast<int>(feat->GetFID());
                vf.crs = crsName;
                
                // Get geometry type
                OGRGeometry* geom = feat->GetGeometryRef();
                if (geom) {
                    vf.geometryType = QString(geom->getGeometryName());
                }
                
                // Get attributes
                OGRFeatureDefn* defn = layer->GetLayerDefn();
                for (int i = 0; i < defn->GetFieldCount(); ++i) {
                    OGRFieldDefn* fieldDefn = defn->GetFieldDefn(i);
                    QString fieldName = fieldDefn->GetNameRef();
                    QString fieldValue;
                    
                    if (feat->IsFieldSetAndNotNull(i)) {
                        OGRFieldType fieldType = fieldDefn->GetType();
                        if (fieldType == OFTInteger || fieldType == OFTInteger64) {
                            fieldValue = QString::number(feat->GetFieldAsInteger64(i));
                        } else if (fieldType == OFTReal) {
                            fieldValue = QString::number(feat->GetFieldAsDouble(i), 'f', 6);
                        } else {
                            fieldValue = QString(feat->GetFieldAsString(i));
                        }
                    } else {
                        fieldValue = "<NULL>";
                    }
                    
                    vf.attributes[fieldName] = fieldValue;
                }
                
                features.append(vf);
                OGRFeature::DestroyFeature(feat);
            }
            
            delete bufferGeom;
        }
        
        GDALClose(ds);
    }
    
    return features;
}

} // namespace gui
} // namespace agrs








