# Perplexity AI API Integration Plan

**Date:** October 11, 2025  
**Purpose:** Integrate Perplexity AI API for geographic intelligence and research automation

---

## Overview

Integrate Perplexity AI's API to provide real-time, AI-powered research and intelligence for any geographic location or area in AGRS projects. This will automate the research process currently done manually via the Perplexity web interface.

---

## Use Cases

### 1. Geographic Area Intelligence
- **Input:** Coordinates, bounding box, or place name
- **Output:** Comprehensive report on:
  - Terrain characteristics
  - Climate and weather patterns
  - Environmental concerns
  - Regulatory environment
  - Infrastructure availability
  - Socio-economic factors
  - Local constraints and considerations

### 2. Dataset Research
- **Input:** Dataset name or type + location
- **Output:**
  - Available data sources
  - Access methods (API, download, etc.)
  - Data quality and resolution
  - Update frequency
  - Licensing information
  - Alternative sources

### 3. Regulatory Research
- **Input:** Project location + activity type (e.g., pipeline construction)
- **Output:**
  - Applicable regulations
  - Permitting requirements
  - Protected areas and restrictions
  - Environmental impact assessment requirements
  - Local/regional/national laws

### 4. Infrastructure Research
- **Input:** Location + infrastructure type
- **Output:**
  - Existing infrastructure inventory
  - Planned projects
  - Access routes
  - Utility corridors
  - Historical projects

### 5. Risk Assessment
- **Input:** Location + risk categories
- **Output:**
  - Natural hazards (seismic, flood, landslide)
  - Political/security risks
  - Environmental risks
  - Social/community risks
  - Economic risks

---

## Technical Implementation

### API Specifications

**Endpoint:** `https://api.perplexity.ai/chat/completions`  
**Method:** POST  
**Authentication:** Bearer token (API key)

**Request Format:**
```json
{
  "model": "llama-3.1-sonar-large-128k-online",
  "messages": [
    {
      "role": "system",
      "content": "You are a geospatial intelligence analyst..."
    },
    {
      "role": "user",
      "content": "Provide detailed information about..."
    }
  ],
  "temperature": 0.2,
  "max_tokens": 4000,
  "return_citations": true,
  "search_recency_filter": "month"
}
```

**Available Models:**
- `llama-3.1-sonar-small-128k-online` - Fast, cost-effective
- `llama-3.1-sonar-large-128k-online` - Comprehensive, detailed
- `llama-3.1-sonar-huge-128k-online` - Maximum capability

---

## CLI Tool Design

### Command: `zeus tools perplexity_search`

**Basic Usage:**
```bash
zeus tools perplexity_search \
  --query "Terrain characteristics of Central Italy, Lazio region" \
  --output report.md
```

**Geographic Search:**
```bash
# Using coordinates
zeus tools perplexity_search \
  --location "13.5°E, 42.8°N" \
  --topic "infrastructure seismic_risk regulations" \
  --output central_italy_intelligence.md

# Using bounding box
zeus tools perplexity_search \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --topic "terrain protected_areas existing_pipelines" \
  --output saipem_aoi_report.md

# Using place name
zeus tools perplexity_search \
  --place "Lazio, Italy" \
  --topic "pipeline_regulations environmental_constraints" \
  --output lazio_regulations.md
```

**Dataset Research:**
```bash
zeus tools perplexity_search \
  --dataset-research "high-resolution DEM Italy" \
  --output dem_italy_sources.md
```

**Structured Output:**
```bash
zeus tools perplexity_search \
  --location "13.5°E, 42.8°N" \
  --format json \
  --output intelligence.json
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `--query` | string | Free-form query text |
| `--location` | string | Coordinates (lat,lon) or (lon,lat) |
| `--bbox` | string | Bounding box (minx,miny,maxx,maxy) |
| `--place` | string | Place name (city, region, country) |
| `--topic` | string | Comma-separated topics (terrain, climate, regulations, etc.) |
| `--dataset-research` | string | Research specific datasets |
| `--model` | string | Perplexity model (small/large/huge) |
| `--max-tokens` | int | Maximum response length (default: 4000) |
| `--temperature` | float | Response creativity (0.0-1.0, default: 0.2) |
| `--recency` | string | Search recency filter (day/week/month/year) |
| `--format` | string | Output format (markdown/json/text) |
| `--output` | string | Output file path |
| `--citations` | flag | Include citations in output |

---

## Implementation Architecture

### 1. Credential Management

**Storage Location:** `/opt/agrs/.perplexity_credentials`

**Format:**
```json
{
  "api_key": "pplx-xxxxxxxxxxxxx",
  "model_default": "llama-3.1-sonar-large-128k-online",
  "max_tokens_default": 4000,
  "temperature_default": 0.2,
  "recency_default": "month"
}
```

**Security:**
- File permissions: `600` (owner read/write only)
- Encrypted storage (optional enhancement)
- Never commit to git (add to .gitignore)

### 2. CLI Implementation

**File:** `/opt/agrs/src/app/Tools.cpp`

```cpp
// Add to Tools.h
CLI::App* cmdPerplexitySearch = nullptr;
std::string perplexityQuery;
std::string perplexityLocation;
std::string perplexityBBox;
std::string perplexityPlace;
std::string perplexityTopic;
std::string perplexityDatasetResearch;
std::string perplexityModel;
int perplexityMaxTokens = 4000;
double perplexityTemperature = 0.2;
std::string perplexityRecency;
std::string perplexityFormat;
std::string perplexityOutput;
bool perplexityCitations = true;

// Function declaration
int tools_perplexity_search(
    const std::string& query,
    const std::string& location,
    const std::string& bbox,
    const std::string& place,
    const std::string& topic,
    const std::string& datasetResearch,
    const std::string& model,
    int maxTokens,
    double temperature,
    const std::string& recency,
    const std::string& format,
    const std::string& output,
    bool citations
);
```

### 3. Python API Client

**Embedded Python Script** (within C++ tool):

```python
#!/usr/bin/env python3
import sys
import json
import requests
from pathlib import Path

def load_credentials():
    """Load Perplexity API credentials"""
    cred_file = Path.home() / ".perplexity_credentials"
    if not cred_file.exists():
        cred_file = Path("/opt/agrs/.perplexity_credentials")
    
    if not cred_file.exists():
        print("ERROR: Perplexity credentials not found", file=sys.stderr)
        print("Create ~/.perplexity_credentials or /opt/agrs/.perplexity_credentials", file=sys.stderr)
        return None
    
    with open(cred_file) as f:
        return json.load(f)

def build_query(location, bbox, place, topic):
    """Build geographic query from parameters"""
    query_parts = []
    
    if location:
        query_parts.append(f"Location: {location}")
    if bbox:
        minx, miny, maxx, maxy = bbox.split(',')
        query_parts.append(f"Area: {minx}°E-{maxx}°E, {miny}°N-{maxy}°N")
    if place:
        query_parts.append(f"Place: {place}")
    
    if topic:
        topics = topic.split(',')
        query_parts.append(f"Topics: {', '.join(topics)}")
    
    return " | ".join(query_parts)

def search_perplexity(query, model, max_tokens, temperature, recency, citations):
    """Query Perplexity API"""
    creds = load_credentials()
    if not creds:
        return None
    
    url = "https://api.perplexity.ai/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {creds['api_key']}",
        "Content-Type": "application/json"
    }
    
    system_prompt = """You are an expert geospatial intelligence analyst specializing in 
pipeline routing, infrastructure projects, and geographic information systems. Provide 
detailed, factual, and well-sourced information about geographic areas, datasets, 
regulations, and constraints relevant to infrastructure projects. Always cite sources."""
    
    payload = {
        "model": model or creds.get('model_default', 'llama-3.1-sonar-large-128k-online'),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "return_citations": citations,
        "search_recency_filter": recency or creds.get('recency_default', 'month')
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        return None

def format_output(response, format_type, citations):
    """Format response for output"""
    if not response:
        return None
    
    content = response['choices'][0]['message']['content']
    
    if format_type == 'json':
        return json.dumps(response, indent=2)
    
    elif format_type == 'markdown':
        output = f"# Perplexity Intelligence Report\n\n"
        output += f"**Generated:** {response.get('created', 'N/A')}\n"
        output += f"**Model:** {response.get('model', 'N/A')}\n\n"
        output += "---\n\n"
        output += content
        
        if citations and 'citations' in response:
            output += "\n\n---\n\n## Citations\n\n"
            for i, citation in enumerate(response['citations'], 1):
                output += f"{i}. {citation}\n"
        
        return output
    
    else:  # text
        return content

def main():
    if len(sys.argv) < 8:
        print("Usage: script.py <query> <model> <max_tokens> <temperature> <recency> <format> <output>", file=sys.stderr)
        return 1
    
    query = sys.argv[1]
    model = sys.argv[2] if sys.argv[2] != "NONE" else None
    max_tokens = int(sys.argv[3])
    temperature = float(sys.argv[4])
    recency = sys.argv[5] if sys.argv[5] != "NONE" else None
    format_type = sys.argv[6]
    output_file = sys.argv[7]
    citations = sys.argv[8].lower() == "true" if len(sys.argv) > 8 else True
    
    print(f"Querying Perplexity AI...")
    print(f"Model: {model or 'default'}")
    print(f"Query: {query[:100]}...")
    
    response = search_perplexity(query, model, max_tokens, temperature, recency, citations)
    if not response:
        return 1
    
    formatted = format_output(response, format_type, citations)
    if not formatted:
        return 1
    
    with open(output_file, 'w') as f:
        f.write(formatted)
    
    print(f"✅ Report saved to: {output_file}")
    
    # Print usage statistics
    if 'usage' in response:
        usage = response['usage']
        print(f"\nTokens used: {usage.get('total_tokens', 'N/A')}")
        print(f"  - Prompt: {usage.get('prompt_tokens', 'N/A')}")
        print(f"  - Completion: {usage.get('completion_tokens', 'N/A')}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

### 4. Output Formats

#### Markdown Report
```markdown
# Perplexity Intelligence Report

**Generated:** 2025-10-11  
**Model:** llama-3.1-sonar-large-128k-online  
**Location:** Central Italy (13.5°E, 42.8°N)

---

## Terrain Characteristics

[AI-generated content...]

## Infrastructure

[AI-generated content...]

## Regulations

[AI-generated content...]

---

## Citations

1. https://source1.com
2. https://source2.com
```

#### JSON Output
```json
{
  "id": "...",
  "model": "llama-3.1-sonar-large-128k-online",
  "created": 1728675600,
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "..."
    }
  }],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 3500,
    "total_tokens": 3650
  },
  "citations": ["...", "..."]
}
```

---

## Project Integration

### Automated Research During Project Initialization

Add to project structure standard:

**File:** `<PROJECT>/docs/perplexity_research/`
```
perplexity_research/
├── aoi_intelligence.md          # General area intelligence
├── terrain_analysis.md          # Terrain characteristics
├── regulations.md               # Regulatory environment
├── datasets_available.md        # Available datasets
├── infrastructure.md            # Existing infrastructure
└── risks.md                     # Risk assessment
```

### Auto-Research Script

**File:** `/opt/agrs/Projects/<PROJECT>/scripts/auto_research.sh`

```bash
#!/bin/bash
# Automated Perplexity research for project AOI

PROJECT_DIR="/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO"
AOI_FILE="$PROJECT_DIR/aoi/study_area.geojson"
BBOX=$(zeus tools kml_to_bbox "$AOI_FILE")
OUTPUT_DIR="$PROJECT_DIR/docs/perplexity_research"

mkdir -p "$OUTPUT_DIR"

# 1. General area intelligence
zeus tools perplexity_search \
  --bbox "$BBOX" \
  --topic "terrain,climate,geography,demographics" \
  --output "$OUTPUT_DIR/aoi_intelligence.md"

# 2. Infrastructure inventory
zeus tools perplexity_search \
  --bbox "$BBOX" \
  --topic "pipelines,roads,railways,utilities,existing_infrastructure" \
  --output "$OUTPUT_DIR/infrastructure.md"

# 3. Regulations
zeus tools perplexity_search \
  --bbox "$BBOX" \
  --topic "pipeline_regulations,environmental_laws,permitting,protected_areas" \
  --output "$OUTPUT_DIR/regulations.md"

# 4. Available datasets
zeus tools perplexity_search \
  --bbox "$BBOX" \
  --dataset-research "DEM land_cover hydrology administrative_boundaries" \
  --output "$OUTPUT_DIR/datasets_available.md"

# 5. Risk assessment
zeus tools perplexity_search \
  --bbox "$BBOX" \
  --topic "seismic_risk,flood_risk,landslide_risk,environmental_risks" \
  --output "$OUTPUT_DIR/risks.md"

echo "✅ Automated research complete"
```

---

## Cost Estimation

**Perplexity API Pricing (estimated):**
- Small model: $0.20 per million tokens
- Large model: $1.00 per million tokens
- Huge model: $5.00 per million tokens

**Typical Query Costs:**
- Geographic intelligence (4000 tokens): $0.004 (large model)
- Dataset research (2000 tokens): $0.002
- Full project research suite (5 queries): ~$0.02

**Very cost-effective for comprehensive research automation.**

---

## Security & Best Practices

1. **API Key Security**
   - Store in `.perplexity_credentials` (not in repo)
   - File permissions: 600
   - Never log or print API key
   - Add to `.gitignore`

2. **Rate Limiting**
   - Implement exponential backoff
   - Cache responses when possible
   - Log API usage for tracking

3. **Error Handling**
   - Graceful degradation if API unavailable
   - Clear error messages to user
   - Retry logic for transient failures

4. **Data Privacy**
   - Don't send sensitive project data in queries
   - Use generic location descriptions when possible
   - Review queries for OPSEC concerns

---

## Testing Plan

### Unit Tests
1. Credential loading
2. Query construction
3. API request/response
4. Output formatting
5. Error handling

### Integration Tests
1. End-to-end API call
2. Geographic query construction
3. Multiple output formats
4. Citation extraction

### User Acceptance Tests
1. SAIPEM project AOI research
2. Dataset discovery
3. Regulatory research
4. Risk assessment

---

## Documentation

1. **User Guide:** `/opt/agrs/docs/PERPLEXITY_SEARCH_TOOL.md`
2. **API Reference:** `/opt/agrs/docs/PERPLEXITY_API_REFERENCE.md`
3. **Examples:** `/opt/agrs/docs/examples/perplexity_examples.md`

---

## Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| Setup | Get API key, create credentials file | 10 min (user) |
| CLI | Implement CLI interface in Tools.cpp | 30 min |
| Python | Write Python API client | 1 hour |
| Testing | Test with SAIPEM AOI | 30 min |
| Docs | Write user guide and examples | 1 hour |
| **Total** | | **~3 hours** |

---

## Next Steps

### For User:
1. ✅ Obtain Perplexity API key from https://www.perplexity.ai/settings/api
2. ✅ Provide API key to assistant
3. ✅ Approve implementation plan

### For Assistant:
1. Create credentials file template
2. Implement CLI tool in Tools.cpp/Tools.h
3. Write Python API client
4. Test with SAIPEM AOI
5. Create user documentation
6. Update project standard to include automated research

---

**Status:** Awaiting user to obtain API key  
**Ready to implement:** All specifications complete






