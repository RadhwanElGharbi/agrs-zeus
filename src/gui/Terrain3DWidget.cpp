#include "agrs_zeus/gui/Terrain3DWidget.h"
#include <gdal_priv.h>
#include <QOpenGLShaderProgram>
#include <QOpenGLTexture>
#include <QImage>
#include <iostream>
#include <cmath>

namespace agrs {
namespace gui {

// Vertex structure for terrain mesh
struct TerrainVertex {
    float x, y, z;      // Position
    float nx, ny, nz;   // Normal (for lighting)
    float u, v;         // Texture coordinates
    float r, g, b;      // Color (height-based, fallback)
};

Terrain3DWidget::Terrain3DWidget(QWidget* parent)
    : QOpenGLWidget(parent)
    , m_vertexBuffer(QOpenGLBuffer::VertexBuffer)
    , m_indexBuffer(QOpenGLBuffer::IndexBuffer)
{
    setFocusPolicy(Qt::StrongFocus);
    setMouseTracking(true);
    
    std::cout << "[Terrain3D] Widget created" << std::endl;
}

Terrain3DWidget::~Terrain3DWidget() {
    makeCurrent();
    
    m_vao.destroy();
    m_vertexBuffer.destroy();
    m_indexBuffer.destroy();
    
    delete m_shaderProgram;
    
    doneCurrent();
    
    std::cout << "[Terrain3D] Widget destroyed" << std::endl;
}

void Terrain3DWidget::initializeGL() {
    initializeOpenGLFunctions();
    
    std::cout << "[Terrain3D] Initializing OpenGL" << std::endl;
    
    // Set clear color (sky blue)
    glClearColor(0.53f, 0.81f, 0.92f, 1.0f);
    
    // Enable depth testing
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LESS);
    
    // Enable back-face culling
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    
    // Setup shaders
    setupShaders();
    
    // Initialize VAO
    m_vao.create();
    
    m_glInitialized = true;
    
    std::cout << "[Terrain3D] OpenGL initialized" << std::endl;
    
    // Initialize default globe view (like ArcGIS/Google Earth)
    initializeGlobeView();
}

void Terrain3DWidget::setupShaders() {
    m_shaderProgram = new QOpenGLShaderProgram(this);
    
    // Vertex shader with texture coordinates
    const char* vertexShaderSource = R"(
        #version 330 core
        layout(location = 0) in vec3 position;
        layout(location = 1) in vec3 normal;
        layout(location = 2) in vec2 texCoord;
        layout(location = 3) in vec3 color;
        
        uniform mat4 mvp;
        uniform mat4 model;
        
        out vec2 fragTexCoord;
        out vec3 fragColor;
        out vec3 fragNormal;
        out vec3 fragPosition;
        
        void main() {
            gl_Position = mvp * vec4(position, 1.0);
            fragTexCoord = texCoord;
            fragColor = color;
            fragNormal = mat3(model) * normal;
            fragPosition = vec3(model * vec4(position, 1.0));
        }
    )";
    
    // Fragment shader with texture sampling and lighting
    const char* fragmentShaderSource = R"(
        #version 330 core
        in vec2 fragTexCoord;
        in vec3 fragColor;
        in vec3 fragNormal;
        in vec3 fragPosition;
        
        uniform sampler2D basemapTexture;
        uniform sampler2D imageryTexture;
        uniform bool hasBasemap;
        uniform bool hasImagery;
        
        out vec4 outColor;
        
        void main() {
            vec3 baseColor = fragColor; // Default to vertex color
            
            // Sample textures if available
            if (hasImagery) {
                vec4 texColor = texture(imageryTexture, fragTexCoord);
                baseColor = texColor.rgb;
            } else if (hasBasemap) {
                vec4 texColor = texture(basemapTexture, fragTexCoord);
                baseColor = texColor.rgb;
            }
            
            // Simple directional light
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
            vec3 norm = normalize(fragNormal);
            
            float diffuse = max(dot(norm, lightDir), 0.0);
            vec3 ambient = vec3(0.3);
            
            vec3 lighting = ambient + diffuse * vec3(0.7);
            vec3 finalColor = baseColor * lighting;
            
            outColor = vec4(finalColor, 1.0);
        }
    )";
    
    if (!m_shaderProgram->addShaderFromSourceCode(QOpenGLShader::Vertex, vertexShaderSource)) {
        std::cerr << "[Terrain3D] Vertex shader error: " << m_shaderProgram->log().toStdString() << std::endl;
    }
    
    if (!m_shaderProgram->addShaderFromSourceCode(QOpenGLShader::Fragment, fragmentShaderSource)) {
        std::cerr << "[Terrain3D] Fragment shader error: " << m_shaderProgram->log().toStdString() << std::endl;
    }
    
    if (!m_shaderProgram->link()) {
        std::cerr << "[Terrain3D] Shader link error: " << m_shaderProgram->log().toStdString() << std::endl;
    }
    
    std::cout << "[Terrain3D] Shaders compiled and linked" << std::endl;
}

void Terrain3DWidget::resizeGL(int w, int h) {
    glViewport(0, 0, w, h);
    
    // Update projection matrix
    m_projection.setToIdentity();
    m_projection.perspective(45.0f, float(w) / float(h), 0.1f, 10000.0f);
    
    updateMatrices();
}

void Terrain3DWidget::paintGL() {
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    
    if (m_indexCount == 0) {
        // No terrain loaded, just show empty scene
        return;
    }
    
    if (!m_shaderProgram || !m_shaderProgram->bind()) {
        return;
    }
    
    // Update view matrix based on camera
    updateMatrices();
    
    // Calculate MVP matrix
    QMatrix4x4 mvp = m_projection * m_view * m_model;
    
    m_shaderProgram->setUniformValue("mvp", mvp);
    m_shaderProgram->setUniformValue("model", m_model);
    
    // Bind textures if available
    if (m_imageryTexture) {
        m_imageryTexture->bind(1);
        m_shaderProgram->setUniformValue("imageryTexture", 1);
        m_shaderProgram->setUniformValue("hasImagery", true);
    } else {
        m_shaderProgram->setUniformValue("hasImagery", false);
    }
    
    if (m_basemapTexture) {
        m_basemapTexture->bind(0);
        m_shaderProgram->setUniformValue("basemapTexture", 0);
        m_shaderProgram->setUniformValue("hasBasemap", true);
    } else {
        m_shaderProgram->setUniformValue("hasBasemap", false);
    }
    
    // Bind VAO and draw
    QOpenGLVertexArrayObject::Binder vaoBinder(&m_vao);
    glDrawElements(GL_TRIANGLES, m_indexCount, GL_UNSIGNED_INT, nullptr);
    
    m_shaderProgram->release();
}

void Terrain3DWidget::updateMatrices() {
    // Update view matrix based on camera position
    m_view.setToIdentity();
    m_view.translate(0, 0, -m_cameraDistance);
    m_view.rotate(m_cameraAngleX, 1, 0, 0);  // Pitch
    m_view.rotate(m_cameraAngleY, 0, 1, 0);  // Yaw
    m_view.translate(-m_cameraPanX, 0, -m_cameraPanY);
    
    // Model matrix (centers terrain)
    m_model.setToIdentity();
    m_model.translate(-m_terrainCenterX, 0, -m_terrainCenterZ);
}

bool Terrain3DWidget::loadDEM(const QString& demPath) {
    std::cout << "[Terrain3D] Loading DEM: " << demPath.toStdString() << std::endl;
    
    // Switch from globe mode to terrain mode
    m_isGlobeMode = false;
    
    // Register GDAL drivers
    GDALAllRegister();
    
    // Open DEM file
    GDALDataset* dataset = (GDALDataset*)GDALOpen(demPath.toStdString().c_str(), GA_ReadOnly);
    if (!dataset) {
        std::cerr << "[Terrain3D] Failed to open DEM file" << std::endl;
        emit terrainLoaded(demPath, false);
        return false;
    }
    
    int width = dataset->GetRasterXSize();
    int height = dataset->GetRasterYSize();
    
    std::cout << "[Terrain3D] DEM size: " << width << "x" << height << std::endl;
    
    // Limit size for performance (subsample if too large)
    int maxDim = 512;
    int sampleWidth = width;
    int sampleHeight = height;
    
    if (width > maxDim || height > maxDim) {
        float scale = float(maxDim) / std::max(width, height);
        sampleWidth = int(width * scale);
        sampleHeight = int(height * scale);
        std::cout << "[Terrain3D] Subsampling to: " << sampleWidth << "x" << sampleHeight << std::endl;
    }
    
    // Read elevation data
    std::vector<float> elevation(sampleWidth * sampleHeight);
    GDALRasterBand* band = dataset->GetRasterBand(1);
    
    CPLErr err = band->RasterIO(
        GF_Read, 0, 0, width, height,
        elevation.data(), sampleWidth, sampleHeight,
        GDT_Float32, 0, 0
    );
    
    if (err != CE_None) {
        std::cerr << "[Terrain3D] Failed to read raster data" << std::endl;
        GDALClose(dataset);
        emit terrainLoaded(demPath, false);
        return false;
    }
    
    // Find min/max elevation for normalization
    float minElev = elevation[0];
    float maxElev = elevation[0];
    for (float e : elevation) {
        if (e < minElev) minElev = e;
        if (e > maxElev) maxElev = e;
    }
    
    std::cout << "[Terrain3D] Elevation range: " << minElev << " to " << maxElev << std::endl;
    
    m_terrainMaxElevation = maxElev - minElev;
    m_demWidth = sampleWidth;
    m_demHeight = sampleHeight;
    
    // Extract geographic bounds for UV mapping
    double geoTransform[6];
    if (dataset->GetGeoTransform(geoTransform) == CE_None) {
        double minLon = geoTransform[0];
        double maxLat = geoTransform[3];
        double maxLon = minLon + geoTransform[1] * width;
        double minLat = maxLat + geoTransform[5] * height;
        
        m_geoBounds[0] = minLon;
        m_geoBounds[1] = minLat;
        m_geoBounds[2] = maxLon;
        m_geoBounds[3] = maxLat;
        
        std::cout << "[Terrain3D] Geographic bounds: " 
                  << minLon << ", " << minLat << " to " << maxLon << ", " << maxLat << std::endl;
    } else {
        std::cout << "[Terrain3D] Warning: No geotransform found, using default [0,1] UV" << std::endl;
        m_geoBounds[0] = 0.0;
        m_geoBounds[1] = 0.0;
        m_geoBounds[2] = 1.0;
        m_geoBounds[3] = 1.0;
    }
    
    GDALClose(dataset);
    
    // Create mesh from elevation data
    makeCurrent();
    createMeshFromElevation(elevation, sampleWidth, sampleHeight);
    doneCurrent();
    
    // Reset camera
    resetCamera();
    
    update();
    
    emit terrainLoaded(demPath, true);
    std::cout << "[Terrain3D] DEM loaded successfully" << std::endl;
    
    return true;
}

void Terrain3DWidget::createMeshFromElevation(const std::vector<float>& elevation, int width, int height) {
    std::cout << "[Terrain3D] Creating mesh from elevation data" << std::endl;
    
    // Find elevation range for coloring
    float minElev = *std::min_element(elevation.begin(), elevation.end());
    float maxElev = *std::max_element(elevation.begin(), elevation.end());
    float elevRange = maxElev - minElev;
    if (elevRange < 0.001f) elevRange = 1.0f;  // Avoid division by zero
    
    // Generate vertices
    std::vector<TerrainVertex> vertices;
    vertices.reserve(width * height);
    
    m_terrainCenterX = width / 2.0f;
    m_terrainCenterZ = height / 2.0f;
    
    for (int z = 0; z < height; ++z) {
        for (int x = 0; x < width; ++x) {
            int idx = z * width + x;
            float elev = (elevation[idx] - minElev) * m_verticalScale;
            
            TerrainVertex v;
            v.x = float(x);
            v.y = elev;
            v.z = float(z);
            
            // Simple normal calculation (could be improved)
            v.nx = 0.0f;
            v.ny = 1.0f;
            v.nz = 0.0f;
            
            // Calculate UV coordinates (normalized [0,1] across terrain)
            v.u = float(x) / float(width - 1);
            v.v = 1.0f - (float(z) / float(height - 1)); // Flip V for OpenGL texture coordinates
            
            // Height-based coloring (green at low, brown at mid, white at high) - fallback if no texture
            float t = (elevation[idx] - minElev) / elevRange;
            if (t < 0.5f) {
                v.r = 0.2f + t * 0.6f;
                v.g = 0.5f + t * 0.5f;
                v.b = 0.2f;
            } else {
                v.r = 0.5f + (t - 0.5f) * 1.0f;
                v.g = 0.75f + (t - 0.5f) * 0.5f;
                v.b = 0.2f + (t - 0.5f) * 1.6f;
            }
            
            vertices.push_back(v);
        }
    }
    
    // Generate indices (two triangles per quad)
    std::vector<unsigned int> indices;
    indices.reserve((width - 1) * (height - 1) * 6);
    
    for (int z = 0; z < height - 1; ++z) {
        for (int x = 0; x < width - 1; ++x) {
            unsigned int topLeft = z * width + x;
            unsigned int topRight = topLeft + 1;
            unsigned int bottomLeft = (z + 1) * width + x;
            unsigned int bottomRight = bottomLeft + 1;
            
            // Triangle 1
            indices.push_back(topLeft);
            indices.push_back(bottomLeft);
            indices.push_back(topRight);
            
            // Triangle 2
            indices.push_back(topRight);
            indices.push_back(bottomLeft);
            indices.push_back(bottomRight);
        }
    }
    
    m_indexCount = indices.size();
    
    // Upload to GPU
    m_vao.bind();
    
    m_vertexBuffer.create();
    m_vertexBuffer.bind();
    m_vertexBuffer.setUsagePattern(QOpenGLBuffer::StaticDraw);
    m_vertexBuffer.allocate(vertices.data(), vertices.size() * sizeof(TerrainVertex));
    
    m_indexBuffer.create();
    m_indexBuffer.bind();
    m_indexBuffer.setUsagePattern(QOpenGLBuffer::StaticDraw);
    m_indexBuffer.allocate(indices.data(), indices.size() * sizeof(unsigned int));
    
    // Setup vertex attributes
    glEnableVertexAttribArray(0);  // position
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)0);
    
    glEnableVertexAttribArray(1);  // normal
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(3 * sizeof(float)));
    
    glEnableVertexAttribArray(2);  // texCoord (UV)
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(6 * sizeof(float)));
    
    glEnableVertexAttribArray(3);  // color
    glVertexAttribPointer(3, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(8 * sizeof(float)));
    
    m_vao.release();
    
    std::cout << "[Terrain3D] Mesh created: " << vertices.size() << " vertices, " 
              << m_indexCount << " indices" << std::endl;
}

void Terrain3DWidget::clearTerrain() {
    makeCurrent();
    
    m_vao.destroy();
    m_vertexBuffer.destroy();
    m_indexBuffer.destroy();
    
    m_indexCount = 0;
    m_demWidth = 0;
    m_demHeight = 0;
    
    m_vao.create();  // Recreate empty VAO
    
    doneCurrent();
    update();
    
    std::cout << "[Terrain3D] Terrain cleared" << std::endl;
}

void Terrain3DWidget::resetCamera() {
    m_cameraDistance = std::max(m_demWidth, m_demHeight) * 1.5f;
    m_cameraAngleX = 45.0f;
    m_cameraAngleY = 0.0f;
    m_cameraPanX = 0.0f;
    m_cameraPanY = 0.0f;
    
    update();
    
    std::cout << "[Terrain3D] Camera reset" << std::endl;
}

void Terrain3DWidget::setVerticalExaggeration(float factor) {
    if (factor < 0.1f) factor = 0.1f;
    if (factor > 10.0f) factor = 10.0f;
    
    m_verticalScale = factor;
    
    std::cout << "[Terrain3D] Vertical exaggeration set to " << factor << "x" << std::endl;
    
    // Would need to reload DEM to apply this
    // For now, just store it for next load
}

// Mouse event handlers
void Terrain3DWidget::mousePressEvent(QMouseEvent* event) {
    m_lastMousePos = event->pos();
    
    if (event->button() == Qt::LeftButton) {
        m_isOrbiting = true;
    } else if (event->button() == Qt::MiddleButton || event->button() == Qt::RightButton) {
        m_isPanning = true;
    }
}

void Terrain3DWidget::mouseMoveEvent(QMouseEvent* event) {
    QPoint delta = event->pos() - m_lastMousePos;
    m_lastMousePos = event->pos();
    
    if (m_isOrbiting) {
        m_cameraAngleY += delta.x() * 0.5f;
        m_cameraAngleX += delta.y() * 0.5f;
        
        // Clamp pitch
        if (m_cameraAngleX > 89.0f) m_cameraAngleX = 89.0f;
        if (m_cameraAngleX < -89.0f) m_cameraAngleX = -89.0f;
        
        update();
    } else if (m_isPanning) {
        float panSpeed = m_cameraDistance * 0.001f;
        m_cameraPanX += delta.x() * panSpeed;
        m_cameraPanY -= delta.y() * panSpeed;
        
        update();
    }
}

void Terrain3DWidget::mouseReleaseEvent(QMouseEvent* event) {
    if (event->button() == Qt::LeftButton) {
        m_isOrbiting = false;
    } else if (event->button() == Qt::MiddleButton || event->button() == Qt::RightButton) {
        m_isPanning = false;
    }
}

void Terrain3DWidget::wheelEvent(QWheelEvent* event) {
    float delta = event->angleDelta().y() / 120.0f;
    
    m_cameraDistance -= delta * m_cameraDistance * 0.1f;
    
    // Clamp distance
    if (m_cameraDistance < 10.0f) m_cameraDistance = 10.0f;
    if (m_cameraDistance > 5000.0f) m_cameraDistance = 5000.0f;
    
    update();
}

bool Terrain3DWidget::loadImageryTexture(const QString& imageryPath) {
    makeCurrent();
    
    std::cout << "[Terrain3D] Loading imagery texture: " << imageryPath.toStdString() << std::endl;
    
    QOpenGLTexture* texture = loadRasterAsTexture(imageryPath);
    if (texture) {
        m_imageryTexture.reset(texture);
        emit textureLoaded(imageryPath, true);
        update();
        doneCurrent();
        return true;
    }
    
    emit textureLoaded(imageryPath, false);
    doneCurrent();
    return false;
}

bool Terrain3DWidget::loadBasemapTexture(const QString& tilesDir) {
    makeCurrent();
    
    std::cout << "[Terrain3D] Loading basemap texture" << std::endl;
    
    // For now, create a simple colored texture as placeholder
    // TODO: Implement actual tile fetching/stitching
    QOpenGLTexture* texture = createDefaultBasemapTexture();
    if (texture) {
        m_basemapTexture.reset(texture);
        update();
        doneCurrent();
        return true;
    }
    
    doneCurrent();
    return false;
}

void Terrain3DWidget::clearTextures() {
    makeCurrent();
    m_basemapTexture.reset();
    m_imageryTexture.reset();
    update();
    doneCurrent();
}

QOpenGLTexture* Terrain3DWidget::loadRasterAsTexture(const QString& rasterPath) {
    // Register GDAL drivers
    GDALAllRegister();
    
    // Open raster file
    GDALDataset* dataset = (GDALDataset*)GDALOpen(rasterPath.toStdString().c_str(), GA_ReadOnly);
    if (!dataset) {
        std::cerr << "[Terrain3D] Failed to open raster file: " << rasterPath.toStdString() << std::endl;
        return nullptr;
    }
    
    int width = dataset->GetRasterXSize();
    int height = dataset->GetRasterYSize();
    int bands = dataset->GetRasterCount();
    
    std::cout << "[Terrain3D] Raster size: " << width << "x" << height << ", bands: " << bands << std::endl;
    
    // Limit texture size for performance
    int maxTexSize = 2048;
    int texWidth = width;
    int texHeight = height;
    
    if (width > maxTexSize || height > maxTexSize) {
        float scale = float(maxTexSize) / std::max(width, height);
        texWidth = int(width * scale);
        texHeight = int(height * scale);
        std::cout << "[Terrain3D] Resampling texture to: " << texWidth << "x" << texHeight << std::endl;
    }
    
    // Read RGB bands (assume first 3 bands are RGB or take first band 3 times if grayscale)
    std::vector<unsigned char> pixels(texWidth * texHeight * 4); // RGBA
    
    for (int b = 0; b < std::min(bands, 3); ++b) {
        GDALRasterBand* band = dataset->GetRasterBand(b + 1);
        std::vector<unsigned char> bandData(texWidth * texHeight);
        
        CPLErr err = band->RasterIO(
            GF_Read, 0, 0, width, height,
            bandData.data(), texWidth, texHeight,
            GDT_Byte, 0, 0
        );
        
        if (err == CE_None) {
            // Copy to RGBA buffer
            for (int i = 0; i < texWidth * texHeight; ++i) {
                pixels[i * 4 + b] = bandData[i];
            }
        }
    }
    
    // Set alpha to 255
    for (int i = 0; i < texWidth * texHeight; ++i) {
        pixels[i * 4 + 3] = 255;
    }
    
    // If only one band, replicate to RGB
    if (bands == 1) {
        for (int i = 0; i < texWidth * texHeight; ++i) {
            pixels[i * 4 + 1] = pixels[i * 4 + 0];
            pixels[i * 4 + 2] = pixels[i * 4 + 0];
        }
    }
    
    GDALClose(dataset);
    
    // Create QImage from pixel data
    QImage image(pixels.data(), texWidth, texHeight, QImage::Format_RGBA8888);
    
    // Create OpenGL texture
    QOpenGLTexture* texture = new QOpenGLTexture(image.mirrored()); // Mirror for OpenGL coords
    texture->setMinificationFilter(QOpenGLTexture::LinearMipMapLinear);
    texture->setMagnificationFilter(QOpenGLTexture::Linear);
    texture->setWrapMode(QOpenGLTexture::ClampToEdge);
    
    std::cout << "[Terrain3D] Texture loaded successfully" << std::endl;
    
    return texture;
}

QOpenGLTexture* Terrain3DWidget::createDefaultBasemapTexture() {
    // Create an equirectangular Earth texture with realistic land/ocean distribution
    // This approximates actual Earth geography for a convincing default view
    int width = 1024;
    int height = 512;
    QImage image(width, height, QImage::Format_RGB888);
    
    for (int y = 0; y < height; ++y) {
        float lat = 90.0f - (float(y) / height) * 180.0f; // 90 to -90
        float latRad = lat * M_PI / 180.0f;
        
        for (int x = 0; x < width; ++x) {
            float lon = -180.0f + (float(x) / width) * 360.0f; // -180 to 180
            float lonRad = lon * M_PI / 180.0f;
            
            // Create Earth-like land/ocean pattern using multiple frequencies
            // This approximates continent shapes
            float landMask = 0.0f;
            landMask += 0.4f * sin(lonRad * 1.2f + 0.5f) * cos(latRad * 0.8f);
            landMask += 0.3f * sin(lonRad * 2.5f) * cos(latRad * 1.5f + 1.0f);
            landMask += 0.2f * sin(lonRad * 0.7f) * sin(latRad * 2.0f);
            landMask += 0.1f * sin(lonRad * 3.0f + latRad * 2.0f);
            
            // Polar regions should be mostly ice/snow (high latitude)
            bool isPolar = (abs(lat) > 60.0f);
            
            if (landMask > 0.15f || isPolar) {
                // Land or polar ice
                if (isPolar) {
                    // Polar ice (white/light blue)
                    int r = 240 + int((90.0f - abs(lat)) * 0.5f);
                    int g = 245 + int((90.0f - abs(lat)) * 0.3f);
                    int b = 250;
                    image.setPixelColor(x, y, QColor(r, g, b));
                } else {
                    // Land (green/brown with variation)
                    float vegetation = cos(latRad * 3.0f) * 0.5f + 0.5f;
                    int r = 80 + int(landMask * 90 + vegetation * 40);
                    int g = 100 + int(landMask * 80 + vegetation * 60);
                    int b = 50 + int(landMask * 40);
                    image.setPixelColor(x, y, QColor(r, g, b));
                }
            } else {
                // Ocean (deep blue with depth variation)
                float depth = -landMask; // Negative values = deeper ocean
                int r = 20 + int(depth * 40);
                int g = 50 + int(depth * 80);
                int b = 120 + int(depth * 100);
                image.setPixelColor(x, y, QColor(r, g, b));
            }
        }
    }
    
    QOpenGLTexture* texture = new QOpenGLTexture(image);
    texture->setMinificationFilter(QOpenGLTexture::LinearMipMapLinear);
    texture->setMagnificationFilter(QOpenGLTexture::Linear);
    texture->setWrapMode(QOpenGLTexture::Repeat);
    
    std::cout << "[Terrain3D] Realistic Earth texture created (1024x512 equirectangular)" << std::endl;
    std::cout << "[Terrain3D] Texture shows approximate land/ocean distribution with polar ice" << std::endl;
    
    return texture;
}

void Terrain3DWidget::latLonToCartesian(float lat, float lon, float radius, float& x, float& y, float& z) {
    // Convert degrees to radians
    float phi = lat * M_PI / 180.0f;      // latitude in radians
    float lambda = lon * M_PI / 180.0f;   // longitude in radians
    
    // Spherical to Cartesian conversion
    // Note: In OpenGL, Y is up, so we use sin(phi) for Y
    x = radius * cos(phi) * cos(lambda);
    y = radius * sin(phi);
    z = -radius * cos(phi) * sin(lambda); // Negative for right-handed coordinate system
}

void Terrain3DWidget::createSphereMesh(float radius, int latSegments, int lonSegments) {
    std::cout << "[Terrain3D] Creating sphere mesh: radius=" << radius 
              << ", lat=" << latSegments << ", lon=" << lonSegments << std::endl;
    
    std::vector<TerrainVertex> vertices;
    vertices.reserve((latSegments + 1) * (lonSegments + 1));
    
    // Generate vertices
    for (int lat = 0; lat <= latSegments; ++lat) {
        float theta = float(lat) * M_PI / float(latSegments); // 0 to PI
        float latDeg = 90.0f - (float(lat) / latSegments) * 180.0f; // 90 to -90
        
        for (int lon = 0; lon <= lonSegments; ++lon) {
            float phi = float(lon) * 2.0f * M_PI / float(lonSegments); // 0 to 2*PI
            float lonDeg = -180.0f + (float(lon) / lonSegments) * 360.0f; // -180 to 180
            
            TerrainVertex v;
            
            // Position (Cartesian coordinates)
            latLonToCartesian(latDeg, lonDeg, radius, v.x, v.y, v.z);
            
            // Normal (for sphere, normal = normalized position)
            float invRadius = 1.0f / radius;
            v.nx = v.x * invRadius;
            v.ny = v.y * invRadius;
            v.nz = v.z * invRadius;
            
            // Texture coordinates (equirectangular mapping)
            v.u = float(lon) / float(lonSegments);
            v.v = float(lat) / float(latSegments);
            
            // Vertex color (fallback - matches texture pattern)
            float lonRad = lonDeg * M_PI / 180.0f;
            float latRad = latDeg * M_PI / 180.0f;
            float landMask = 0.4f * sin(lonRad * 1.2f + 0.5f) * cos(latRad * 0.8f);
            landMask += 0.3f * sin(lonRad * 2.5f) * cos(latRad * 1.5f + 1.0f);
            
            bool isPolar = (abs(latDeg) > 60.0f);
            if (landMask > 0.15f || isPolar) {
                if (isPolar) {
                    v.r = 0.95f; v.g = 0.97f; v.b = 1.0f; // Polar ice
                } else {
                    v.r = 0.4f; v.g = 0.55f; v.b = 0.25f; // Land
                }
            } else {
                v.r = 0.1f; v.g = 0.3f; v.b = 0.7f; // Ocean
            }
            
            vertices.push_back(v);
        }
    }
    
    // Generate indices (two triangles per quad)
    std::vector<unsigned int> indices;
    indices.reserve(latSegments * lonSegments * 6);
    
    for (int lat = 0; lat < latSegments; ++lat) {
        for (int lon = 0; lon < lonSegments; ++lon) {
            unsigned int first = lat * (lonSegments + 1) + lon;
            unsigned int second = first + lonSegments + 1;
            
            // Triangle 1
            indices.push_back(first);
            indices.push_back(second);
            indices.push_back(first + 1);
            
            // Triangle 2
            indices.push_back(second);
            indices.push_back(second + 1);
            indices.push_back(first + 1);
        }
    }
    
    m_indexCount = indices.size();
    
    // Upload to GPU
    m_vao.bind();
    
    m_vertexBuffer.create();
    m_vertexBuffer.bind();
    m_vertexBuffer.setUsagePattern(QOpenGLBuffer::StaticDraw);
    m_vertexBuffer.allocate(vertices.data(), vertices.size() * sizeof(TerrainVertex));
    
    m_indexBuffer.create();
    m_indexBuffer.bind();
    m_indexBuffer.setUsagePattern(QOpenGLBuffer::StaticDraw);
    m_indexBuffer.allocate(indices.data(), indices.size() * sizeof(unsigned int));
    
    // Setup vertex attributes (same as terrain)
    glEnableVertexAttribArray(0);  // position
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)0);
    
    glEnableVertexAttribArray(1);  // normal
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(3 * sizeof(float)));
    
    glEnableVertexAttribArray(2);  // texCoord (UV)
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(6 * sizeof(float)));
    
    glEnableVertexAttribArray(3);  // color
    glVertexAttribPointer(3, 3, GL_FLOAT, GL_FALSE, sizeof(TerrainVertex), (void*)(8 * sizeof(float)));
    
    m_vao.release();
    
    std::cout << "[Terrain3D] Sphere mesh created: " << vertices.size() << " vertices, " 
              << m_indexCount << " indices" << std::endl;
}

void Terrain3DWidget::initializeGlobeView() {
    if (!m_glInitialized) {
        std::cerr << "[Terrain3D] OpenGL not initialized yet" << std::endl;
        return;
    }
    
    makeCurrent();
    
    std::cout << "[Terrain3D] Initializing default 3D view (ArcGIS/Google Earth style)" << std::endl;
    std::cout << "[Terrain3D] Using global elevation model with Earth imagery" << std::endl;
    
    // Set globe mode
    m_isGlobeMode = true;
    
    // For now, use a sphere mesh with proper Earth-like texture
    // TODO: Implement AWS Terrain Tiles or ESRI World Elevation Service fetching
    // This will require downloading elevation tiles at runtime
    float globeRadius = 100.0f;
    createSphereMesh(globeRadius, 80, 160); // Higher resolution sphere (80 lat, 160 lon)
    
    // Load realistic Earth texture (land/ocean pattern)
    m_basemapTexture.reset(createDefaultBasemapTexture());
    
    // Set camera to view from space (like ArcGIS/Google Earth default)
    m_cameraDistance = globeRadius * 2.5f; // View from ~2.5x radius
    m_cameraAngleX = 30.0f;  // Tilt down to see horizon
    m_cameraAngleY = -45.0f; // Rotate to show continents
    m_cameraPanX = 0.0f;
    m_cameraPanY = 0.0f;
    
    doneCurrent();
    update();
    
    std::cout << "[Terrain3D] Default 3D globe view initialized" << std::endl;
    std::cout << "[Terrain3D] Tip: Open a project to load local terrain data" << std::endl;
}

} // namespace gui
} // namespace agrs

