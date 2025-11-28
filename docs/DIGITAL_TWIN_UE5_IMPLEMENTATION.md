# AGRS Digital Twin - UE5 Implementation Guide

This guide walks you through implementing the UE5 Digital Twin application that connects to the AGRS ZEUS backend API running on the VM.

## Prerequisites

- Completed setup from `DIGITAL_TWIN_WINDOWS_SETUP.md`
- UE5 5.4.x installed and project created
- Visual Studio 2022 with C++ game development workload
- VM backend running at `http://192.168.0.126:8000`

---

## Step 1: Sync Repository

First, pull the latest changes from the VM to get all backend API code:

### Using Git Bash (Recommended)

```bash
cd /c/Dev/AGRS/agrs
git fetch origin
git checkout feature/digital-twin
git pull origin feature/digital-twin
```

### Using PowerShell

```powershell
cd C:\Dev\AGRS\agrs
git fetch origin
git checkout feature/digital-twin
git pull origin feature/digital-twin
```

---

## Step 2: Verify VM Connectivity

Before implementing, verify the backend is accessible from Windows:

### Using PowerShell

```powershell
# Test health endpoint
Invoke-RestMethod -Uri "http://192.168.0.126:8000/api/digital-twin/health"

# Test terrain endpoint (replace test_project2 with your project)
Invoke-RestMethod -Uri "http://192.168.0.126:8000/api/digital-twin/test_project2/terrain"
```

### Using curl (Git Bash)

```bash
curl http://192.168.0.126:8000/api/digital-twin/health
curl http://192.168.0.126:8000/api/digital-twin/test_project2/terrain
```

Expected response from health:
```json
{
  "status": "ok",
  "service": "AGRS Digital Twin API",
  "timestamp": "2025-11-28T10:34:15.145455"
}
```

---

## Step 3: API Endpoints Reference

Your UE5 application will communicate with these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/digital-twin/health` | GET | Verify API connectivity |
| `/api/digital-twin/{project}/info` | GET | Get project metadata |
| `/api/digital-twin/{project}/terrain` | GET | Fetch DEM heightmap data |
| `/api/digital-twin/{project}/pipeline` | GET | Fetch PIRL route geometry |
| `/api/digital-twin/{project}/landcover` | GET | Fetch landcover for PCG |
| `/api/digital-twin/{project}/sensors` | GET | Get current sensor readings |
| `/api/digital-twin/{project}/sensors/stream` | WebSocket | Real-time sensor stream |

**Base URL:** `http://192.168.0.126:8000`

---

## Step 4: Create HTTP Client Module

### 4.1 Create Header File

Create `Source/AGRSDigitalTwin/Public/AGRSBackendClient.h`:

```cpp
// AGRSBackendClient.h
// HTTP client for communicating with AGRS ZEUS backend

#pragma once

#include "CoreMinimal.h"
#include "Http.h"
#include "Json.h"
#include "AGRSBackendClient.generated.h"

// Terrain data structure
USTRUCT(BlueprintType)
struct FTerrainData
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    int32 Width = 0;

    UPROPERTY(BlueprintReadOnly)
    int32 Height = 0;

    UPROPERTY(BlueprintReadOnly)
    float OriginLat = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    float OriginLon = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    float MetersPerPixel = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    FString CRS;

    UPROPERTY(BlueprintReadOnly)
    TArray<float> HeightmapData;
};

// Pipeline segment structure
USTRUCT(BlueprintType)
struct FPipelineSegment
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Id;

    UPROPERTY(BlueprintReadOnly)
    TArray<FVector> Coordinates;

    UPROPERTY(BlueprintReadOnly)
    float DiameterMM = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    FString Material;

    UPROPERTY(BlueprintReadOnly)
    FString Coating;
};

// Sensor data structure
USTRUCT(BlueprintType)
struct FSensorData
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString SegmentId;

    UPROPERTY(BlueprintReadOnly)
    float PressureBar = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    float FlowRateM3H = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    float TemperatureC = 0.0f;

    UPROPERTY(BlueprintReadOnly)
    FString Status;
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnTerrainDataReceived, const FTerrainData&, TerrainData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPipelineDataReceived, const TArray<FPipelineSegment>&, Segments);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSensorDataReceived, const TArray<FSensorData>&, SensorData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConnectionStatusChanged, bool, bIsConnected);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnError, const FString&, ErrorMessage);

UCLASS(BlueprintType, Blueprintable)
class AGRSDIGITALTWIN_API UAGRSBackendClient : public UObject
{
    GENERATED_BODY()

public:
    UAGRSBackendClient();

    // Initialize with backend URL
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void Initialize(const FString& BackendURL, const FString& ProjectName);

    // Connection management
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void TestConnection();

    UFUNCTION(BlueprintPure, Category = "AGRS|Backend")
    bool IsConnected() const { return bIsConnected; }

    // Data fetching
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchTerrainData();

    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchPipelineData();

    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchLandcoverData();

    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchSensorData();

    // WebSocket for real-time sensors
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void StartSensorStream();

    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void StopSensorStream();

    // Events
    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnTerrainDataReceived OnTerrainDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnPipelineDataReceived OnPipelineDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnSensorDataReceived OnSensorDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnConnectionStatusChanged OnConnectionStatusChanged;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnError OnError;

private:
    FString BackendURL;
    FString ProjectName;
    bool bIsConnected = false;

    // HTTP request handlers
    void OnHealthCheckComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void OnTerrainDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void OnPipelineDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void OnLandcoverDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void OnSensorDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);

    // JSON parsing helpers
    FTerrainData ParseTerrainJson(TSharedPtr<FJsonObject> JsonObject);
    TArray<FPipelineSegment> ParsePipelineJson(TSharedPtr<FJsonObject> JsonObject);
    TArray<FSensorData> ParseSensorJson(TSharedPtr<FJsonObject> JsonObject);

    // WebSocket
    TSharedPtr<class IWebSocket> SensorWebSocket;
    void OnWebSocketConnected();
    void OnWebSocketMessage(const FString& Message);
    void OnWebSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean);
};
```

### 4.2 Create Implementation File

Create `Source/AGRSDigitalTwin/Private/AGRSBackendClient.cpp`:

```cpp
// AGRSBackendClient.cpp

#include "AGRSBackendClient.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/Base64.h"

UAGRSBackendClient::UAGRSBackendClient()
{
}

void UAGRSBackendClient::Initialize(const FString& InBackendURL, const FString& InProjectName)
{
    BackendURL = InBackendURL;
    ProjectName = InProjectName;
    
    UE_LOG(LogTemp, Log, TEXT("AGRS Backend Client initialized: %s, Project: %s"), *BackendURL, *ProjectName);
}

void UAGRSBackendClient::TestConnection()
{
    FString URL = FString::Printf(TEXT("%s/api/digital-twin/health"), *BackendURL);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(URL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &UAGRSBackendClient::OnHealthCheckComplete);
    Request->ProcessRequest();
    
    UE_LOG(LogTemp, Log, TEXT("Testing connection to: %s"), *URL);
}

void UAGRSBackendClient::OnHealthCheckComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (bSuccess && Response.IsValid() && Response->GetResponseCode() == 200)
    {
        bIsConnected = true;
        UE_LOG(LogTemp, Log, TEXT("AGRS Backend connected successfully"));
        OnConnectionStatusChanged.Broadcast(true);
    }
    else
    {
        bIsConnected = false;
        FString ErrorMsg = Response.IsValid() 
            ? FString::Printf(TEXT("HTTP %d: %s"), Response->GetResponseCode(), *Response->GetContentAsString())
            : TEXT("Connection failed");
        UE_LOG(LogTemp, Error, TEXT("AGRS Backend connection failed: %s"), *ErrorMsg);
        OnConnectionStatusChanged.Broadcast(false);
        OnError.Broadcast(ErrorMsg);
    }
}

void UAGRSBackendClient::FetchTerrainData()
{
    if (!bIsConnected)
    {
        OnError.Broadcast(TEXT("Not connected to backend"));
        return;
    }

    FString URL = FString::Printf(TEXT("%s/api/digital-twin/%s/terrain"), *BackendURL, *ProjectName);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(URL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &UAGRSBackendClient::OnTerrainDataComplete);
    Request->ProcessRequest();
    
    UE_LOG(LogTemp, Log, TEXT("Fetching terrain data from: %s"), *URL);
}

void UAGRSBackendClient::OnTerrainDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        FString ErrorMsg = Response.IsValid() 
            ? FString::Printf(TEXT("Terrain fetch failed: HTTP %d"), Response->GetResponseCode())
            : TEXT("Terrain fetch failed: No response");
        OnError.Broadcast(ErrorMsg);
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    
    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        FTerrainData TerrainData = ParseTerrainJson(JsonObject);
        OnTerrainDataReceived.Broadcast(TerrainData);
        UE_LOG(LogTemp, Log, TEXT("Terrain data received: %dx%d"), TerrainData.Width, TerrainData.Height);
    }
    else
    {
        OnError.Broadcast(TEXT("Failed to parse terrain JSON"));
    }
}

FTerrainData UAGRSBackendClient::ParseTerrainJson(TSharedPtr<FJsonObject> JsonObject)
{
    FTerrainData Data;
    
    Data.Width = JsonObject->GetIntegerField(TEXT("width"));
    Data.Height = JsonObject->GetIntegerField(TEXT("height"));
    Data.OriginLat = JsonObject->GetNumberField(TEXT("origin_lat"));
    Data.OriginLon = JsonObject->GetNumberField(TEXT("origin_lon"));
    Data.MetersPerPixel = JsonObject->GetNumberField(TEXT("meters_per_pixel"));
    Data.CRS = JsonObject->GetStringField(TEXT("crs"));
    
    // Decode base64 heightmap if present
    FString HeightmapBase64 = JsonObject->GetStringField(TEXT("heightmap_base64"));
    if (!HeightmapBase64.IsEmpty() && HeightmapBase64 != TEXT("mock_base64_encoded_heightmap_data"))
    {
        TArray<uint8> DecodedBytes;
        FBase64::Decode(HeightmapBase64, DecodedBytes);
        
        // Convert bytes to floats (assuming float32 array)
        int32 NumFloats = DecodedBytes.Num() / sizeof(float);
        Data.HeightmapData.SetNum(NumFloats);
        FMemory::Memcpy(Data.HeightmapData.GetData(), DecodedBytes.GetData(), DecodedBytes.Num());
    }
    
    return Data;
}

void UAGRSBackendClient::FetchPipelineData()
{
    if (!bIsConnected)
    {
        OnError.Broadcast(TEXT("Not connected to backend"));
        return;
    }

    FString URL = FString::Printf(TEXT("%s/api/digital-twin/%s/pipeline"), *BackendURL, *ProjectName);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(URL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &UAGRSBackendClient::OnPipelineDataComplete);
    Request->ProcessRequest();
    
    UE_LOG(LogTemp, Log, TEXT("Fetching pipeline data from: %s"), *URL);
}

void UAGRSBackendClient::OnPipelineDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        FString ErrorMsg = Response.IsValid() 
            ? FString::Printf(TEXT("Pipeline fetch failed: HTTP %d"), Response->GetResponseCode())
            : TEXT("Pipeline fetch failed: No response");
        OnError.Broadcast(ErrorMsg);
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    
    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        TArray<FPipelineSegment> Segments = ParsePipelineJson(JsonObject);
        OnPipelineDataReceived.Broadcast(Segments);
        UE_LOG(LogTemp, Log, TEXT("Pipeline data received: %d segments"), Segments.Num());
    }
    else
    {
        OnError.Broadcast(TEXT("Failed to parse pipeline JSON"));
    }
}

TArray<FPipelineSegment> UAGRSBackendClient::ParsePipelineJson(TSharedPtr<FJsonObject> JsonObject)
{
    TArray<FPipelineSegment> Segments;
    
    const TArray<TSharedPtr<FJsonValue>>* SegmentsArray;
    if (JsonObject->TryGetArrayField(TEXT("segments"), SegmentsArray))
    {
        for (const TSharedPtr<FJsonValue>& SegmentValue : *SegmentsArray)
        {
            TSharedPtr<FJsonObject> SegmentObj = SegmentValue->AsObject();
            if (!SegmentObj.IsValid()) continue;
            
            FPipelineSegment Segment;
            Segment.Id = SegmentObj->GetStringField(TEXT("id"));
            Segment.DiameterMM = SegmentObj->GetNumberField(TEXT("diameter_mm"));
            Segment.Material = SegmentObj->GetStringField(TEXT("material"));
            Segment.Coating = SegmentObj->GetStringField(TEXT("coating"));
            
            // Parse coordinates array [[lon, lat, elev], ...]
            const TArray<TSharedPtr<FJsonValue>>* CoordsArray;
            if (SegmentObj->TryGetArrayField(TEXT("coordinates"), CoordsArray))
            {
                for (const TSharedPtr<FJsonValue>& CoordValue : *CoordsArray)
                {
                    const TArray<TSharedPtr<FJsonValue>>& CoordArr = CoordValue->AsArray();
                    if (CoordArr.Num() >= 3)
                    {
                        // Convert lon/lat/elev to UE coordinates (X=East, Y=North, Z=Up)
                        // Note: You may need to transform based on your world origin
                        float Lon = CoordArr[0]->AsNumber();
                        float Lat = CoordArr[1]->AsNumber();
                        float Elev = CoordArr[2]->AsNumber();
                        
                        // Simple conversion - adjust based on your coordinate system
                        Segment.Coordinates.Add(FVector(Lon * 100000, Lat * 100000, Elev * 100));
                    }
                }
            }
            
            Segments.Add(Segment);
        }
    }
    
    return Segments;
}

void UAGRSBackendClient::FetchLandcoverData()
{
    if (!bIsConnected)
    {
        OnError.Broadcast(TEXT("Not connected to backend"));
        return;
    }

    FString URL = FString::Printf(TEXT("%s/api/digital-twin/%s/landcover"), *BackendURL, *ProjectName);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(URL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &UAGRSBackendClient::OnLandcoverDataComplete);
    Request->ProcessRequest();
    
    UE_LOG(LogTemp, Log, TEXT("Fetching landcover data from: %s"), *URL);
}

void UAGRSBackendClient::OnLandcoverDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        FString ErrorMsg = Response.IsValid() 
            ? FString::Printf(TEXT("Landcover fetch failed: HTTP %d"), Response->GetResponseCode())
            : TEXT("Landcover fetch failed: No response");
        OnError.Broadcast(ErrorMsg);
        return;
    }

    // For now, just log success - landcover parsing similar to terrain
    UE_LOG(LogTemp, Log, TEXT("Landcover data received"));
}

void UAGRSBackendClient::FetchSensorData()
{
    if (!bIsConnected)
    {
        OnError.Broadcast(TEXT("Not connected to backend"));
        return;
    }

    FString URL = FString::Printf(TEXT("%s/api/digital-twin/%s/sensors"), *BackendURL, *ProjectName);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(URL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindUObject(this, &UAGRSBackendClient::OnSensorDataComplete);
    Request->ProcessRequest();
}

void UAGRSBackendClient::OnSensorDataComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        FString ErrorMsg = Response.IsValid() 
            ? FString::Printf(TEXT("Sensor fetch failed: HTTP %d"), Response->GetResponseCode())
            : TEXT("Sensor fetch failed: No response");
        OnError.Broadcast(ErrorMsg);
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    
    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        TArray<FSensorData> SensorData = ParseSensorJson(JsonObject);
        OnSensorDataReceived.Broadcast(SensorData);
    }
}

TArray<FSensorData> UAGRSBackendClient::ParseSensorJson(TSharedPtr<FJsonObject> JsonObject)
{
    TArray<FSensorData> SensorDataArray;
    
    const TSharedPtr<FJsonObject>* SegmentsObj;
    if (JsonObject->TryGetObjectField(TEXT("segments"), SegmentsObj))
    {
        for (const auto& Pair : (*SegmentsObj)->Values)
        {
            TSharedPtr<FJsonObject> SegmentData = Pair.Value->AsObject();
            if (!SegmentData.IsValid()) continue;
            
            FSensorData Data;
            Data.SegmentId = Pair.Key;
            Data.PressureBar = SegmentData->GetNumberField(TEXT("pressure_bar"));
            Data.FlowRateM3H = SegmentData->GetNumberField(TEXT("flow_rate_m3h"));
            Data.TemperatureC = SegmentData->GetNumberField(TEXT("temperature_c"));
            Data.Status = SegmentData->GetStringField(TEXT("status"));
            
            SensorDataArray.Add(Data);
        }
    }
    
    return SensorDataArray;
}

void UAGRSBackendClient::StartSensorStream()
{
    if (!bIsConnected)
    {
        OnError.Broadcast(TEXT("Not connected to backend"));
        return;
    }

    // Convert HTTP URL to WebSocket URL
    FString WsURL = BackendURL.Replace(TEXT("http://"), TEXT("ws://"));
    WsURL = FString::Printf(TEXT("%s/api/digital-twin/%s/sensors/stream"), *WsURL, *ProjectName);
    
    if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
    {
        FModuleManager::Get().LoadModule("WebSockets");
    }
    
    SensorWebSocket = FWebSocketsModule::Get().CreateWebSocket(WsURL);
    
    SensorWebSocket->OnConnected().AddUObject(this, &UAGRSBackendClient::OnWebSocketConnected);
    SensorWebSocket->OnMessage().AddUObject(this, &UAGRSBackendClient::OnWebSocketMessage);
    SensorWebSocket->OnClosed().AddUObject(this, &UAGRSBackendClient::OnWebSocketClosed);
    
    SensorWebSocket->Connect();
    
    UE_LOG(LogTemp, Log, TEXT("Starting sensor stream: %s"), *WsURL);
}

void UAGRSBackendClient::StopSensorStream()
{
    if (SensorWebSocket.IsValid() && SensorWebSocket->IsConnected())
    {
        SensorWebSocket->Close();
        UE_LOG(LogTemp, Log, TEXT("Sensor stream stopped"));
    }
}

void UAGRSBackendClient::OnWebSocketConnected()
{
    UE_LOG(LogTemp, Log, TEXT("Sensor WebSocket connected"));
}

void UAGRSBackendClient::OnWebSocketMessage(const FString& Message)
{
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
    
    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        TArray<FSensorData> SensorData = ParseSensorJson(JsonObject);
        OnSensorDataReceived.Broadcast(SensorData);
    }
}

void UAGRSBackendClient::OnWebSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean)
{
    UE_LOG(LogTemp, Warning, TEXT("Sensor WebSocket closed: %d - %s"), StatusCode, *Reason);
}
```

---

## Step 5: Update Build Configuration

Edit `Source/AGRSDigitalTwin/AGRSDigitalTwin.Build.cs`:

```csharp
using UnrealBuildTool;

public class AGRSDigitalTwin : ModuleRules
{
    public AGRSDigitalTwin(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        
        PublicDependencyModuleNames.AddRange(new string[] { 
            "Core", 
            "CoreUObject", 
            "Engine", 
            "InputCore",
            "HTTP",
            "Json",
            "JsonUtilities",
            "WebSockets"
        });

        PrivateDependencyModuleNames.AddRange(new string[] { });
    }
}
```

---

## Step 6: Create Test Actor

Create a simple actor to test the backend connection.

### 6.1 Header: `Source/AGRSDigitalTwin/Public/AGRSTestActor.h`

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AGRSBackendClient.h"
#include "AGRSTestActor.generated.h"

UCLASS()
class AGRSDIGITALTWIN_API AAGRSTestActor : public AActor
{
    GENERATED_BODY()
    
public:    
    AAGRSTestActor();

protected:
    virtual void BeginPlay() override;

public:    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS")
    FString BackendURL = TEXT("http://192.168.0.126:8000");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS")
    FString ProjectName = TEXT("test_project2");

private:
    UPROPERTY()
    UAGRSBackendClient* BackendClient;

    UFUNCTION()
    void OnConnected(bool bConnected);

    UFUNCTION()
    void OnTerrainReceived(const FTerrainData& TerrainData);

    UFUNCTION()
    void OnPipelineReceived(const TArray<FPipelineSegment>& Segments);

    UFUNCTION()
    void OnSensorReceived(const TArray<FSensorData>& SensorData);

    UFUNCTION()
    void OnBackendError(const FString& ErrorMessage);
};
```

### 6.2 Implementation: `Source/AGRSDigitalTwin/Private/AGRSTestActor.cpp`

```cpp
#include "AGRSTestActor.h"

AAGRSTestActor::AAGRSTestActor()
{
    PrimaryActorTick.bCanEverTick = false;
}

void AAGRSTestActor::BeginPlay()
{
    Super::BeginPlay();
    
    // Create backend client
    BackendClient = NewObject<UAGRSBackendClient>(this);
    
    // Bind events
    BackendClient->OnConnectionStatusChanged.AddDynamic(this, &AAGRSTestActor::OnConnected);
    BackendClient->OnTerrainDataReceived.AddDynamic(this, &AAGRSTestActor::OnTerrainReceived);
    BackendClient->OnPipelineDataReceived.AddDynamic(this, &AAGRSTestActor::OnPipelineReceived);
    BackendClient->OnSensorDataReceived.AddDynamic(this, &AAGRSTestActor::OnSensorReceived);
    BackendClient->OnError.AddDynamic(this, &AAGRSTestActor::OnBackendError);
    
    // Initialize and test connection
    BackendClient->Initialize(BackendURL, ProjectName);
    BackendClient->TestConnection();
    
    UE_LOG(LogTemp, Log, TEXT("AGRS Test Actor started - connecting to %s"), *BackendURL);
}

void AAGRSTestActor::OnConnected(bool bConnected)
{
    if (bConnected)
    {
        UE_LOG(LogTemp, Log, TEXT("✓ Connected to AGRS Backend!"));
        
        // Fetch all data
        BackendClient->FetchTerrainData();
        BackendClient->FetchPipelineData();
        BackendClient->FetchSensorData();
        
        // Start real-time sensor stream
        BackendClient->StartSensorStream();
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("✗ Failed to connect to AGRS Backend"));
    }
}

void AAGRSTestActor::OnTerrainReceived(const FTerrainData& TerrainData)
{
    UE_LOG(LogTemp, Log, TEXT("✓ Terrain received: %dx%d, CRS: %s"), 
        TerrainData.Width, TerrainData.Height, *TerrainData.CRS);
    
    // TODO: Generate landscape from heightmap data
}

void AAGRSTestActor::OnPipelineReceived(const TArray<FPipelineSegment>& Segments)
{
    UE_LOG(LogTemp, Log, TEXT("✓ Pipeline received: %d segments"), Segments.Num());
    
    for (const FPipelineSegment& Segment : Segments)
    {
        UE_LOG(LogTemp, Log, TEXT("  - Segment %s: %d points, %.1fmm diameter"), 
            *Segment.Id, Segment.Coordinates.Num(), Segment.DiameterMM);
    }
    
    // TODO: Create spline mesh for pipeline
}

void AAGRSTestActor::OnSensorReceived(const TArray<FSensorData>& SensorData)
{
    for (const FSensorData& Data : SensorData)
    {
        UE_LOG(LogTemp, Log, TEXT("  Sensor %s: %.1f bar, %.1f m³/h, %.1f°C [%s]"),
            *Data.SegmentId, Data.PressureBar, Data.FlowRateM3H, Data.TemperatureC, *Data.Status);
    }
    
    // TODO: Update pipeline visualization with sensor data
}

void AAGRSTestActor::OnBackendError(const FString& ErrorMessage)
{
    UE_LOG(LogTemp, Error, TEXT("AGRS Backend Error: %s"), *ErrorMessage);
}
```

---

## Step 7: Build and Test

### 7.1 Generate Project Files

Right-click `AGRSDigitalTwin.uproject` → **Generate Visual Studio project files**

### 7.2 Build in Visual Studio

1. Open `AGRSDigitalTwin.sln`
2. Set configuration to **Development Editor**
3. Build solution (Ctrl+Shift+B)

### 7.3 Test in Editor

1. Open UE5 Editor
2. Create a new level or open your test level
3. Drag `AGRSTestActor` into the level
4. In Details panel, verify:
   - BackendURL: `http://192.168.0.126:8000`
   - ProjectName: `test_project2`
5. Press **Play**
6. Check **Output Log** for connection messages

Expected output:
```
LogTemp: AGRS Test Actor started - connecting to http://192.168.0.126:8000
LogTemp: Testing connection to: http://192.168.0.126:8000/api/digital-twin/health
LogTemp: AGRS Backend connected successfully
LogTemp: ✓ Connected to AGRS Backend!
LogTemp: Fetching terrain data...
LogTemp: ✓ Terrain received: 1024x1024, CRS: EPSG:32617
LogTemp: ✓ Pipeline received: 2 segments
LogTemp:   - Segment segment_1: 2 points, 660.4mm diameter
```

---

## Step 8: Commit Your Changes

After testing works:

```bash
cd /c/Dev/AGRS/agrs
git add .
git commit -m "feat: implement UE5 backend client with HTTP and WebSocket support"
git push origin feature/digital-twin
```

---

## Next Steps

Once basic connectivity is working:

1. **Terrain Generation** - Use heightmap data to generate UE5 Landscape
2. **Pipeline Spline Mesh** - Create 3D pipe visualization from coordinates
3. **Landcover PCG** - Use classification to spawn trees, buildings via PCG
4. **Sensor HUD** - Real-time dashboard showing pipeline health
5. **Camera System** - Fly along pipeline, focus on segments

---

## Troubleshooting

### Connection Refused
- Verify VM backend is running: `curl http://192.168.0.126:8000/api/health`
- Check Windows Firewall isn't blocking outbound connections
- Ping VM: `ping 192.168.0.126`

### Build Errors
- Ensure all module dependencies are in Build.cs
- Regenerate project files after adding new source files
- Clean and rebuild if seeing stale errors

### WebSocket Not Connecting
- WebSockets module must be loaded before use
- Check URL uses `ws://` not `http://`
- Verify backend WebSocket endpoint is active

---

## API Response Examples

### GET /api/digital-twin/test_project2/terrain
```json
{
  "heightmap_base64": "base64_encoded_float_array...",
  "width": 1024,
  "height": 1024,
  "origin_lat": 43.4723,
  "origin_lon": -80.5449,
  "meters_per_pixel": 30.0,
  "crs": "EPSG:32617"
}
```

### GET /api/digital-twin/test_project2/pipeline
```json
{
  "segments": [
    {
      "id": "segment_1",
      "coordinates": [[-80.5449, 43.4723, 100], [-80.5459, 43.4733, 105]],
      "diameter_mm": 660.4,
      "material": "steel",
      "coating": "FBE"
    }
  ]
}
```

### WebSocket /api/digital-twin/test_project2/sensors/stream
```json
{
  "timestamp": "2025-11-28T10:34:15.145455",
  "segments": {
    "segment_1": {
      "pressure_bar": 42.5,
      "flow_rate_m3h": 1250.3,
      "temperature_c": 17.2,
      "status": "normal"
    }
  }
}
```

