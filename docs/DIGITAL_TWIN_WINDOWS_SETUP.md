# AGRS Digital Twin - Windows 11 UE5 Setup Guide

This document provides step-by-step instructions for setting up the Unreal Engine 5 Digital Twin project on Windows 11. This is a continuation from Step 4 (directory structure creation).

## Prerequisites Completed
- [x] Epic Games Launcher installed
- [x] Unreal Engine 5.4.4 installed
- [x] Visual Studio 2022 with C++ game development workload
- [x] Git for Windows installed
- [x] Repository cloned to `C:\Dev\agrs-zeus`
- [x] Branch `feature/digital-twin` created
- [x] Directory structure created (`digital-twin/Source/AGRSDigitalTwin/...`)

---

## Step 5: Create Essential UE5 Project Files

### 5.1 Create the UProject File

**File:** `C:\Dev\agrs-zeus\digital-twin\AGRSDigitalTwin.uproject`

```json
{
    "FileVersion": 3,
    "EngineAssociation": "5.4",
    "Category": "",
    "Description": "AGRS ZEUS Digital Twin - Pipeline Visualization & Monitoring",
    "Modules": [
        {
            "Name": "AGRSDigitalTwin",
            "Type": "Runtime",
            "LoadingPhase": "Default"
        }
    ],
    "Plugins": [
        {
            "Name": "GeoReferencing",
            "Enabled": true
        },
        {
            "Name": "Water",
            "Enabled": true
        },
        {
            "Name": "PCG",
            "Enabled": true
        },
        {
            "Name": "Landmass",
            "Enabled": true
        },
        {
            "Name": "ProceduralMeshComponent",
            "Enabled": true
        }
    ]
}
```

### 5.2 Create the Build Configuration

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\AGRSDigitalTwin.Build.cs`

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
            "WebSockets",
            "Landscape",
            "ProceduralMeshComponent",
            "GeoReferencing",
            "RenderCore",
            "RHI"
        });

        PrivateDependencyModuleNames.AddRange(new string[] { 
            "Slate",
            "SlateCore",
            "UMG"
        });

        // Enable exceptions for HTTP error handling
        bEnableExceptions = true;
    }
}
```

### 5.3 Create the Module Header

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\AGRSDigitalTwin.h`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

DECLARE_LOG_CATEGORY_EXTERN(LogAGRSDigitalTwin, Log, All);

class FAGRSDigitalTwinModule : public IModuleInterface
{
public:
    /** IModuleInterface implementation */
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

    /** Get the module instance */
    static FAGRSDigitalTwinModule& Get();

    /** Check if module is loaded */
    static bool IsAvailable();
};
```

### 5.4 Create the Module Implementation

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\AGRSDigitalTwin.cpp`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#include "AGRSDigitalTwin.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogAGRSDigitalTwin);

void FAGRSDigitalTwinModule::StartupModule()
{
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("==========================================="));
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("AGRS Digital Twin Module Starting..."));
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("==========================================="));
}

void FAGRSDigitalTwinModule::ShutdownModule()
{
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("AGRS Digital Twin Module Shutting Down"));
}

FAGRSDigitalTwinModule& FAGRSDigitalTwinModule::Get()
{
    return FModuleManager::LoadModuleChecked<FAGRSDigitalTwinModule>("AGRSDigitalTwin");
}

bool FAGRSDigitalTwinModule::IsAvailable()
{
    return FModuleManager::Get().IsModuleLoaded("AGRSDigitalTwin");
}

IMPLEMENT_PRIMARY_GAME_MODULE(FAGRSDigitalTwinModule, AGRSDigitalTwin, "AGRSDigitalTwin");
```

### 5.5 Create the Game Mode Header

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\Core\AGRSGameMode.h`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "AGRSGameMode.generated.h"

/**
 * AGRS Digital Twin Game Mode
 * Manages connection to AGRS backend and project loading
 */
UCLASS()
class AGRSDIGITALTWIN_API AAGRSGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AAGRSGameMode();

    //~ Begin AActor Interface
    virtual void BeginPlay() override;
    //~ End AActor Interface

    /** Backend API URL - connects to AGRS ZEUS VM */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS|Connection")
    FString BackendURL = TEXT("http://192.168.0.126:8000");

    /** WebSocket URL for real-time sensor data */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS|Connection")
    FString WebSocketURL = TEXT("ws://192.168.0.126:8000/api/digital-twin");

    /** Current project name being visualized */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS|Project")
    FString ProjectName;

    /** Segment to focus on (optional, from command line) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AGRS|Project")
    FString FocusSegment;

    /** Check if backend is reachable */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Connection")
    void TestBackendConnection();

    /** Load project data from backend */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Project")
    void LoadProjectData();

protected:
    /** Parse command line arguments for configuration */
    void ParseCommandLineArgs();

    /** Called when backend health check completes */
    void OnHealthCheckComplete(bool bSuccess, const FString& Message);
};
```

### 5.6 Create the Game Mode Implementation

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\Core\AGRSGameMode.cpp`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#include "Core/AGRSGameMode.h"
#include "AGRSDigitalTwin.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

AAGRSGameMode::AAGRSGameMode()
{
    // Default pawn and controller can be set here or in Blueprint
}

void AAGRSGameMode::BeginPlay()
{
    Super::BeginPlay();
    
    // Parse any command-line overrides
    ParseCommandLineArgs();
    
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("========================================"));
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("AGRS Digital Twin Initialized"));
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Backend URL: %s"), *BackendURL);
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("WebSocket URL: %s"), *WebSocketURL);
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Project: %s"), *ProjectName);
    if (!FocusSegment.IsEmpty())
    {
        UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Focus Segment: %s"), *FocusSegment);
    }
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("========================================"));
    
    // Test backend connection on startup
    TestBackendConnection();
}

void AAGRSGameMode::ParseCommandLineArgs()
{
    // Parse -BackendURL=xxx
    FString CmdBackend;
    if (FParse::Value(FCommandLine::Get(), TEXT("-BackendURL="), CmdBackend))
    {
        BackendURL = CmdBackend;
        UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Backend URL override: %s"), *BackendURL);
    }
    
    // Parse -WebSocketURL=xxx
    FString CmdWebSocket;
    if (FParse::Value(FCommandLine::Get(), TEXT("-WebSocketURL="), CmdWebSocket))
    {
        WebSocketURL = CmdWebSocket;
    }
    
    // Parse -ProjectName=xxx
    FString CmdProject;
    if (FParse::Value(FCommandLine::Get(), TEXT("-ProjectName="), CmdProject))
    {
        ProjectName = CmdProject;
        UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Project override: %s"), *ProjectName);
    }
    
    // Parse -FocusSegment=xxx
    FString CmdSegment;
    if (FParse::Value(FCommandLine::Get(), TEXT("-FocusSegment="), CmdSegment))
    {
        FocusSegment = CmdSegment;
    }
}

void AAGRSGameMode::TestBackendConnection()
{
    FString HealthURL = BackendURL + TEXT("/api/health");
    
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Testing backend connection: %s"), *HealthURL);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(HealthURL);
    Request->SetVerb(TEXT("GET"));
    Request->SetTimeout(5.0f);
    
    Request->OnProcessRequestComplete().BindLambda(
        [this](FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnectedSuccessfully)
        {
            if (bConnectedSuccessfully && Response.IsValid() && Response->GetResponseCode() == 200)
            {
                OnHealthCheckComplete(true, Response->GetContentAsString());
            }
            else
            {
                FString ErrorMsg = bConnectedSuccessfully ? 
                    FString::Printf(TEXT("HTTP %d"), Response.IsValid() ? Response->GetResponseCode() : 0) :
                    TEXT("Connection failed");
                OnHealthCheckComplete(false, ErrorMsg);
            }
        }
    );
    
    Request->ProcessRequest();
}

void AAGRSGameMode::OnHealthCheckComplete(bool bSuccess, const FString& Message)
{
    if (bSuccess)
    {
        UE_LOG(LogAGRSDigitalTwin, Log, TEXT("✓ Backend connection successful!"));
        UE_LOG(LogAGRSDigitalTwin, Log, TEXT("  Response: %s"), *Message);
        
        // If we have a project name, load its data
        if (!ProjectName.IsEmpty())
        {
            LoadProjectData();
        }
    }
    else
    {
        UE_LOG(LogAGRSDigitalTwin, Error, TEXT("✗ Backend connection failed: %s"), *Message);
        UE_LOG(LogAGRSDigitalTwin, Warning, TEXT("  Make sure the AGRS ZEUS backend is running on the VM"));
        UE_LOG(LogAGRSDigitalTwin, Warning, TEXT("  Expected URL: %s"), *BackendURL);
    }
}

void AAGRSGameMode::LoadProjectData()
{
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Loading project data for: %s"), *ProjectName);
    
    // TODO: Implement terrain, pipeline, and landcover loading
    // This will be expanded in future development
}
```

### 5.7 Create the Backend Client Header

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\Core\AGRSBackendClient.h`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "AGRSBackendClient.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTerrainDataReceived, bool, bSuccess, const FString&, Data);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPipelineDataReceived, bool, bSuccess, const FString&, Data);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnLandcoverDataReceived, bool, bSuccess, const FString&, Data);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnSensorDataReceived, bool, bSuccess, const FString&, Data);

/**
 * Client for communicating with AGRS ZEUS Backend API
 * Handles all HTTP requests for terrain, pipeline, landcover, and sensor data
 */
UCLASS(Blueprintable, BlueprintType)
class AGRSDIGITALTWIN_API UAGRSBackendClient : public UObject
{
    GENERATED_BODY()

public:
    UAGRSBackendClient();

    /** Initialize the client with backend URL */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void Initialize(const FString& InBackendURL);

    /** Fetch terrain/DEM data for a project */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchTerrainData(const FString& ProjectName);

    /** Fetch pipeline route geometry for a project */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchPipelineData(const FString& ProjectName);

    /** Fetch landcover classification for a project */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchLandcoverData(const FString& ProjectName);

    /** Fetch current sensor data for a project */
    UFUNCTION(BlueprintCallable, Category = "AGRS|Backend")
    void FetchSensorData(const FString& ProjectName);

    // Delegates for async responses
    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnTerrainDataReceived OnTerrainDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnPipelineDataReceived OnPipelineDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnLandcoverDataReceived OnLandcoverDataReceived;

    UPROPERTY(BlueprintAssignable, Category = "AGRS|Backend")
    FOnSensorDataReceived OnSensorDataReceived;

protected:
    /** Base URL for the AGRS backend */
    FString BackendURL;

    /** Generic HTTP request helper */
    void MakeRequest(const FString& Endpoint, TFunction<void(bool, const FString&)> Callback);
};
```

### 5.8 Create the Backend Client Implementation

**File:** `C:\Dev\agrs-zeus\digital-twin\Source\AGRSDigitalTwin\Core\AGRSBackendClient.cpp`

```cpp
// Copyright AGRS - Artemis Global Research Solutions Inc. All Rights Reserved.

#include "Core/AGRSBackendClient.h"
#include "AGRSDigitalTwin.h"

UAGRSBackendClient::UAGRSBackendClient()
{
    BackendURL = TEXT("http://192.168.0.126:8000");
}

void UAGRSBackendClient::Initialize(const FString& InBackendURL)
{
    BackendURL = InBackendURL;
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Backend client initialized with URL: %s"), *BackendURL);
}

void UAGRSBackendClient::MakeRequest(const FString& Endpoint, TFunction<void(bool, const FString&)> Callback)
{
    FString FullURL = BackendURL + Endpoint;
    
    UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Making request to: %s"), *FullURL);
    
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(FullURL);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetTimeout(30.0f);
    
    Request->OnProcessRequestComplete().BindLambda(
        [Callback](FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnectedSuccessfully)
        {
            if (bConnectedSuccessfully && Response.IsValid() && Response->GetResponseCode() == 200)
            {
                Callback(true, Response->GetContentAsString());
            }
            else
            {
                FString ErrorMsg = FString::Printf(TEXT("Request failed: %s"), 
                    bConnectedSuccessfully ? *FString::FromInt(Response->GetResponseCode()) : TEXT("No connection"));
                Callback(false, ErrorMsg);
            }
        }
    );
    
    Request->ProcessRequest();
}

void UAGRSBackendClient::FetchTerrainData(const FString& ProjectName)
{
    FString Endpoint = FString::Printf(TEXT("/api/digital-twin/%s/terrain"), *ProjectName);
    
    MakeRequest(Endpoint, [this](bool bSuccess, const FString& Data)
    {
        OnTerrainDataReceived.Broadcast(bSuccess, Data);
        
        if (bSuccess)
        {
            UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Terrain data received (%d bytes)"), Data.Len());
        }
        else
        {
            UE_LOG(LogAGRSDigitalTwin, Error, TEXT("Failed to fetch terrain data: %s"), *Data);
        }
    });
}

void UAGRSBackendClient::FetchPipelineData(const FString& ProjectName)
{
    FString Endpoint = FString::Printf(TEXT("/api/digital-twin/%s/pipeline"), *ProjectName);
    
    MakeRequest(Endpoint, [this](bool bSuccess, const FString& Data)
    {
        OnPipelineDataReceived.Broadcast(bSuccess, Data);
        
        if (bSuccess)
        {
            UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Pipeline data received (%d bytes)"), Data.Len());
        }
        else
        {
            UE_LOG(LogAGRSDigitalTwin, Error, TEXT("Failed to fetch pipeline data: %s"), *Data);
        }
    });
}

void UAGRSBackendClient::FetchLandcoverData(const FString& ProjectName)
{
    FString Endpoint = FString::Printf(TEXT("/api/digital-twin/%s/landcover"), *ProjectName);
    
    MakeRequest(Endpoint, [this](bool bSuccess, const FString& Data)
    {
        OnLandcoverDataReceived.Broadcast(bSuccess, Data);
        
        if (bSuccess)
        {
            UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Landcover data received (%d bytes)"), Data.Len());
        }
        else
        {
            UE_LOG(LogAGRSDigitalTwin, Error, TEXT("Failed to fetch landcover data: %s"), *Data);
        }
    });
}

void UAGRSBackendClient::FetchSensorData(const FString& ProjectName)
{
    FString Endpoint = FString::Printf(TEXT("/api/digital-twin/%s/sensors"), *ProjectName);
    
    MakeRequest(Endpoint, [this](bool bSuccess, const FString& Data)
    {
        OnSensorDataReceived.Broadcast(bSuccess, Data);
        
        if (bSuccess)
        {
            UE_LOG(LogAGRSDigitalTwin, Log, TEXT("Sensor data received"));
        }
        else
        {
            UE_LOG(LogAGRSDigitalTwin, Error, TEXT("Failed to fetch sensor data: %s"), *Data);
        }
    });
}
```

---

## Step 6: Create Configuration Files

### 6.1 Create DefaultGame.ini

**File:** `C:\Dev\agrs-zeus\digital-twin\Config\DefaultGame.ini`

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/MainMap
EditorStartupMap=/Game/Maps/MainMap
GlobalDefaultGameMode=/Script/AGRSDigitalTwin.AGRSGameMode

[/Script/Engine.GameSession]
MaxPlayers=1

[/Script/AGRSDigitalTwin.AGRSGameMode]
; Default backend URL - points to AGRS ZEUS VM
BackendURL=http://192.168.0.126:8000
WebSocketURL=ws://192.168.0.126:8000/api/digital-twin
; Default project (can be overridden via command line)
ProjectName=test_project2
```

### 6.2 Create DefaultEngine.ini

**File:** `C:\Dev\agrs-zeus\digital-twin\Config\DefaultEngine.ini`

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/MainMap

[/Script/Engine.RendererSettings]
; Enable Nanite for high-detail terrain
r.Nanite=1
; Enable Lumen for realistic lighting
r.DynamicGlobalIlluminationMethod=1
r.ReflectionMethod=1
; Enable Virtual Shadow Maps
r.Shadow.Virtual.Enable=1
; Generate mesh distance fields for landscape
r.GenerateMeshDistanceFields=True

[/Script/Engine.Engine]
bUseFixedFrameRate=False
FixedFrameRate=60.000000

[/Script/HardwareTargeting.HardwareTargetingSettings]
TargetedHardwareClass=Desktop
AppliedTargetedHardwareClass=Desktop
DefaultGraphicsPerformance=Maximum
AppliedDefaultGraphicsPerformance=Maximum

[/Script/Engine.PhysicsSettings]
DefaultGravityZ=-980.000000

[/Script/WindowsTargetPlatform.WindowsTargetSettings]
DefaultGraphicsRHI=DefaultGraphicsRHI_DX12

[GeoReferencing]
; Georeferencing will be configured per-project
; Origin will be set based on AOI center point

[HTTP]
; HTTP settings for backend communication
HttpTimeout=30
HttpConnectionTimeout=10

[ConsoleVariables]
; Performance optimizations
r.ScreenPercentage=100
r.ViewDistanceScale=1.0
```

### 6.3 Create DefaultInput.ini

**File:** `C:\Dev\agrs-zeus\digital-twin\Config\DefaultInput.ini`

```ini
[/Script/Engine.InputSettings]
-AxisMappings=(AxisName="MoveForward",Scale=1.000000,Key=W)
-AxisMappings=(AxisName="MoveForward",Scale=-1.000000,Key=S)
-AxisMappings=(AxisName="MoveRight",Scale=1.000000,Key=D)
-AxisMappings=(AxisName="MoveRight",Scale=-1.000000,Key=A)
+AxisMappings=(AxisName="MoveForward",Scale=1.000000,Key=W)
+AxisMappings=(AxisName="MoveForward",Scale=-1.000000,Key=S)
+AxisMappings=(AxisName="MoveRight",Scale=1.000000,Key=D)
+AxisMappings=(AxisName="MoveRight",Scale=-1.000000,Key=A)
+AxisMappings=(AxisName="MoveUp",Scale=1.000000,Key=E)
+AxisMappings=(AxisName="MoveUp",Scale=-1.000000,Key=Q)
+AxisMappings=(AxisName="Turn",Scale=1.000000,Key=MouseX)
+AxisMappings=(AxisName="LookUp",Scale=-1.000000,Key=MouseY)
+ActionMappings=(ActionName="Sprint",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=LeftShift)
+ActionMappings=(ActionName="FocusPipeline",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=F)
+ActionMappings=(ActionName="ToggleOverlay",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=O)
bEnableMouseSmoothing=False
DefaultViewportMouseCaptureMode=CapturePermanently_IncludingInitialMouseDown
DefaultViewportMouseLockMode=LockOnCapture
```

---

## Step 7: Create .gitignore

**File:** `C:\Dev\agrs-zeus\digital-twin\.gitignore`

```gitignore
# Unreal Engine 5 Build Artifacts
# These are regenerated and should NOT be committed (very large files)

Binaries/
Intermediate/
Saved/
DerivedDataCache/
Build/

# Visual Studio files
.vs/
*.sln
*.VC.db
*.VC.opendb
*.vcxproj
*.vcxproj.filters
*.vcxproj.user

# JetBrains Rider
.idea/

# macOS
.DS_Store
*.swp
*.swo

# Thumbnails
*.thumb

# Asset caches
*.BI.json
*.uasset.bak

# Crash reports
CrashReportClient/

# Automation
Automation/

# Keep these (source files)
!Source/**
!Content/Maps/.gitkeep
!Content/Pipeline/.gitkeep
!Content/Environment/.gitkeep
!Content/UI/.gitkeep
!Config/**
!*.uproject

# Keep placeholder files
!**/.gitkeep
```

---

## Step 8: Create Placeholder Files for Content Folders

Create empty `.gitkeep` files to preserve folder structure:

**Files to create (empty):**
- `C:\Dev\agrs-zeus\digital-twin\Content\Maps\.gitkeep`
- `C:\Dev\agrs-zeus\digital-twin\Content\Pipeline\.gitkeep`
- `C:\Dev\agrs-zeus\digital-twin\Content\Environment\.gitkeep`
- `C:\Dev\agrs-zeus\digital-twin\Content\UI\.gitkeep`

---

## Step 9: Generate Visual Studio Project Files

### Option A: Using File Explorer (Recommended)

1. Navigate to `C:\Dev\agrs-zeus\digital-twin\`
2. Right-click on `AGRSDigitalTwin.uproject`
3. Select **"Generate Visual Studio project files"**
4. Wait for generation to complete

### Option B: Using Command Line

Open PowerShell and run:

```powershell
# Find your UE5 installation path (adjust if different)
$UE5Path = "C:\Program Files\Epic Games\UE_5.4\Engine\Build\BatchFiles"

# Generate project files
& "$UE5Path\GenerateProjectFiles.bat" "C:\Dev\agrs-zeus\digital-twin\AGRSDigitalTwin.uproject"
```

---

## Step 10: Open and Compile in Unreal Engine

1. **Double-click** `AGRSDigitalTwin.uproject`
   - UE5 will open and detect missing compiled modules
   - Click **"Yes"** when asked to compile

2. **Wait for compilation** (first time takes 5-15 minutes)
   - Watch the bottom-right corner for progress
   - Shader compilation will also run (can take 10-30 minutes)

3. **If compilation fails:**
   - Open `AGRSDigitalTwin.sln` in Visual Studio 2022
   - Build → Build Solution (F7)
   - Check Output window for errors

---

## Step 11: Create Initial Map

Once UE5 is open:

1. **File → New Level → Empty Level**

2. **Add essential actors:**
   - From **Place Actors** panel (left side), drag in:
     - `Player Start` (under Basic)
     - `Directional Light` (under Lights)
     - `Sky Atmosphere` (under Visual Effects)
     - `Sky Light` (under Lights)
     - `Exponential Height Fog` (under Visual Effects) - optional

3. **Configure the Directional Light:**
   - Select it in the viewport
   - In Details panel:
     - Set **Mobility** to `Stationary`
     - Enable **Atmosphere Sun Light**

4. **Save the level:**
   - **File → Save Current Level As...**
   - Navigate to `Content/Maps/`
   - Name it `MainMap`
   - Click **Save**

5. **Save all:**
   - Press `Ctrl+Shift+S`

---

## Step 12: Verify Backend Connection

1. **Make sure your VM is running** with the backend:
   ```bash
   # On VM (192.168.0.126)
   cd /opt/agrs/gui-v2/backend
   source venv/bin/activate
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **Test from Windows:**
   - Open browser: `http://192.168.0.126:8000/docs`
   - Should see FastAPI Swagger documentation

3. **Play the level in UE5:**
   - Press the **Play** button (green arrow) or `Alt+P`
   - Check **Output Log** (Window → Developer Tools → Output Log)
   - You should see:
     ```
     LogAGRSDigitalTwin: =========================================
     LogAGRSDigitalTwin: AGRS Digital Twin Initialized
     LogAGRSDigitalTwin: Backend URL: http://192.168.0.126:8000
     LogAGRSDigitalTwin: ✓ Backend connection successful!
     ```

---

## Step 13: Commit and Push

Open PowerShell in `C:\Dev\agrs-zeus`:

```powershell
# Check status
git status

# Add all new files
git add digital-twin/

# Commit
git commit -m "feat: initialize UE5 Digital Twin project with backend client

- Created AGRSDigitalTwin UE5 project structure
- Implemented AGRSGameMode with command-line parsing
- Implemented AGRSBackendClient for API communication
- Configured project for Nanite, Lumen, GeoReferencing
- Added HTTP client for terrain, pipeline, landcover, sensor data
- Created MainMap with basic sky/lighting setup"

# Push to feature branch
git push origin feature/digital-twin
```

---

## Directory Structure After Completion

```
C:\Dev\agrs-zeus\
├── digital-twin\
│   ├── AGRSDigitalTwin.uproject
│   ├── AGRSDigitalTwin.sln              (generated, gitignored)
│   ├── Source\
│   │   └── AGRSDigitalTwin\
│   │       ├── AGRSDigitalTwin.Build.cs
│   │       ├── AGRSDigitalTwin.h
│   │       ├── AGRSDigitalTwin.cpp
│   │       └── Core\
│   │           ├── AGRSGameMode.h
│   │           ├── AGRSGameMode.cpp
│   │           ├── AGRSBackendClient.h
│   │           └── AGRSBackendClient.cpp
│   ├── Content\
│   │   ├── Maps\
│   │   │   ├── .gitkeep
│   │   │   └── MainMap.umap             (created in editor)
│   │   ├── Pipeline\
│   │   │   └── .gitkeep
│   │   ├── Environment\
│   │   │   └── .gitkeep
│   │   └── UI\
│   │       └── .gitkeep
│   ├── Config\
│   │   ├── DefaultGame.ini
│   │   ├── DefaultEngine.ini
│   │   └── DefaultInput.ini
│   ├── Binaries\                        (generated, gitignored)
│   ├── Intermediate\                    (generated, gitignored)
│   ├── Saved\                           (generated, gitignored)
│   └── .gitignore
├── gui-v2\                              (existing)
├── Projects\                            (existing)
└── docs\
```

---

## Next Steps

1. **On VM:** Create the Digital Twin API endpoints:
   - `/api/digital-twin/{project}/terrain`
   - `/api/digital-twin/{project}/pipeline`
   - `/api/digital-twin/{project}/landcover`
   - `/api/digital-twin/{project}/sensors` (WebSocket)

2. **On Windows:** Implement terrain loading from DEM data

3. **On Windows:** Implement pipeline spline mesh from route GeoJSON

4. **Integration:** Test full data flow from VM to UE5

---

## Troubleshooting

### UE5 won't open the project
- Make sure `"EngineAssociation": "5.4"` matches your installed version
- Try right-click → "Switch Unreal Engine version"

### Compilation errors
- Open `.sln` in Visual Studio and check error details
- Ensure Visual Studio 2022 has C++ game development workload

### Cannot connect to backend
- Verify VM is running: `ping 192.168.0.126`
- Check backend is up: `curl http://192.168.0.126:8000/api/health`
- Check Windows Firewall isn't blocking

### Slow shader compilation
- First run compiles thousands of shaders - this is normal
- Subsequent runs are faster (cached)

---

*Document created for AGRS ZEUS Digital Twin development*
*Last updated: November 2024*

