"""
Supplier Management API Endpoints

Provides endpoints for supplier search, listing, and management.
Follows the supplier profile schema defined in /opt/agrs/templates/supplier_profile_schema.json
"""
import asyncio
import json
import os
import re
import uuid
import httpx
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .project_utils import resolve_project_path, load_json_file, PROJECTS_ROOT

# Claude API for comprehensive research
try:
    from anthropic import Anthropic, AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    print("Warning: Anthropic SDK not available. Install with: pip install anthropic")

# In-memory job storage for supplier search jobs
_supplier_jobs: Dict[str, Dict[str, Any]] = {}

# Perplexity API configuration
PERPLEXITY_CREDENTIALS_PATHS = [
    Path.home() / ".perplexity_credentials",
    Path("/opt/agrs/.perplexity_credentials")
]

# Claude API configuration
CLAUDE_CREDENTIALS_PATHS = [
    Path.home() / ".anthropic_credentials",
    Path("/opt/agrs/.anthropic_credentials"
),
    Path.home() / ".claude_credentials",
    Path("/opt/agrs/.claude_credentials")
]

# Known city coordinates for common Italian cities (fallback geocoding)
# This avoids external API calls for common locations
CITY_COORDINATES = {
    # Italy
    "rome": {"latitude": 41.9028, "longitude": 12.4964},
    "roma": {"latitude": 41.9028, "longitude": 12.4964},
    "milan": {"latitude": 45.4642, "longitude": 9.1900},
    "milano": {"latitude": 45.4642, "longitude": 9.1900},
    "naples": {"latitude": 40.8518, "longitude": 14.2681},
    "napoli": {"latitude": 40.8518, "longitude": 14.2681},
    "turin": {"latitude": 45.0703, "longitude": 7.6869},
    "torino": {"latitude": 45.0703, "longitude": 7.6869},
    "florence": {"latitude": 43.7696, "longitude": 11.2558},
    "firenze": {"latitude": 43.7696, "longitude": 11.2558},
    "bologna": {"latitude": 44.4949, "longitude": 11.3426},
    "genoa": {"latitude": 44.4056, "longitude": 8.9463},
    "genova": {"latitude": 44.4056, "longitude": 8.9463},
    "palermo": {"latitude": 38.1157, "longitude": 13.3615},
    "venice": {"latitude": 45.4408, "longitude": 12.3155},
    "venezia": {"latitude": 45.4408, "longitude": 12.3155},
    "verona": {"latitude": 45.4384, "longitude": 10.9916},
    "trieste": {"latitude": 45.6495, "longitude": 13.7768},
    "padua": {"latitude": 45.4064, "longitude": 11.8768},
    "padova": {"latitude": 45.4064, "longitude": 11.8768},
    "brescia": {"latitude": 45.5416, "longitude": 10.2118},
    "parma": {"latitude": 44.8015, "longitude": 10.3279},
    "modena": {"latitude": 44.6471, "longitude": 10.9252},
    "reggio emilia": {"latitude": 44.6989, "longitude": 10.6312},
    "ravenna": {"latitude": 44.4184, "longitude": 12.2035},
    "ferrara": {"latitude": 44.8381, "longitude": 11.6198},
    "rimini": {"latitude": 44.0678, "longitude": 12.5695},
    "perugia": {"latitude": 43.1107, "longitude": 12.3908},
    "ancona": {"latitude": 43.6158, "longitude": 13.5189},
    "bari": {"latitude": 41.1171, "longitude": 16.8719},
    "catania": {"latitude": 37.5079, "longitude": 15.0830},
    "messina": {"latitude": 38.1938, "longitude": 15.5540},
    "livorno": {"latitude": 43.5485, "longitude": 10.3106},
    "cagliari": {"latitude": 39.2238, "longitude": 9.1217},
    "taranto": {"latitude": 40.4644, "longitude": 17.2470},
    "prato": {"latitude": 43.8777, "longitude": 11.1024},
    "dalmine": {"latitude": 45.6486, "longitude": 9.6042},
    "bergamo": {"latitude": 45.6983, "longitude": 9.6773},
    "san donato milanese": {"latitude": 45.4167, "longitude": 9.2667},
    # USA
    "houston": {"latitude": 29.7604, "longitude": -95.3698},
    "new york": {"latitude": 40.7128, "longitude": -74.0060},
    "los angeles": {"latitude": 34.0522, "longitude": -118.2437},
    "chicago": {"latitude": 41.8781, "longitude": -87.6298},
    "dallas": {"latitude": 32.7767, "longitude": -96.7970},
    "pittsburgh": {"latitude": 40.4406, "longitude": -79.9959},
    "tulsa": {"latitude": 36.1540, "longitude": -95.9928},
    # Germany
    "berlin": {"latitude": 52.5200, "longitude": 13.4050},
    "munich": {"latitude": 48.1351, "longitude": 11.5820},
    "frankfurt": {"latitude": 50.1109, "longitude": 8.6821},
    "dusseldorf": {"latitude": 51.2277, "longitude": 6.7735},
    "essen": {"latitude": 51.4556, "longitude": 7.0116},
    # France
    "paris": {"latitude": 48.8566, "longitude": 2.3522},
    "lyon": {"latitude": 45.7640, "longitude": 4.8357},
    "marseille": {"latitude": 43.2965, "longitude": 5.3698},
    # UK
    "london": {"latitude": 51.5074, "longitude": -0.1278},
    "aberdeen": {"latitude": 57.1497, "longitude": -2.0943},
    # Netherlands
    "amsterdam": {"latitude": 52.3676, "longitude": 4.9041},
    "rotterdam": {"latitude": 51.9244, "longitude": 4.4777},
    # Spain
    "madrid": {"latitude": 40.4168, "longitude": -3.7038},
    "barcelona": {"latitude": 41.3851, "longitude": 2.1734},
    # Canada
    "calgary": {"latitude": 51.0447, "longitude": -114.0719},
    "edmonton": {"latitude": 53.5461, "longitude": -113.4938},
    "toronto": {"latitude": 43.6532, "longitude": -79.3832},
    # Other
    "dubai": {"latitude": 25.2048, "longitude": 55.2708},
    "abu dhabi": {"latitude": 24.4539, "longitude": 54.3773},
    "singapore": {"latitude": 1.3521, "longitude": 103.8198},
}

# Country capital fallback coordinates
COUNTRY_CAPITALS = {
    "italy": {"latitude": 41.9028, "longitude": 12.4964},  # Rome
    "usa": {"latitude": 38.9072, "longitude": -77.0369},  # Washington DC
    "united states": {"latitude": 38.9072, "longitude": -77.0369},
    "germany": {"latitude": 52.5200, "longitude": 13.4050},  # Berlin
    "france": {"latitude": 48.8566, "longitude": 2.3522},  # Paris
    "uk": {"latitude": 51.5074, "longitude": -0.1278},  # London
    "united kingdom": {"latitude": 51.5074, "longitude": -0.1278},
    "spain": {"latitude": 40.4168, "longitude": -3.7038},  # Madrid
    "netherlands": {"latitude": 52.3676, "longitude": 4.9041},  # Amsterdam
    "canada": {"latitude": 45.4215, "longitude": -75.6972},  # Ottawa
    "uae": {"latitude": 24.4539, "longitude": 54.3773},  # Abu Dhabi
    "saudi arabia": {"latitude": 24.7136, "longitude": 46.6753},  # Riyadh
    "qatar": {"latitude": 25.2854, "longitude": 51.5310},  # Doha
}

router = APIRouter()

SUPPLIER_CATEGORIES = [
    "construction_supplies",
    "construction_services",
    "pipeline_manufacturer",
    "equipment_manufacturer",
    "consultancy"
]

CATEGORY_TO_DIR = {
    "construction_supplies": "construction_supplies",
    "construction_services": "construction_services",
    "pipeline_manufacturer": "pipeline_manufacturers",
    "equipment_manufacturer": "equipment_manufacturers",
    "consultancy": "consultancies"
}


class SupplierLocation(BaseModel):
    country: str
    iso3: str
    region: Optional[str] = None
    city: str
    address: Optional[str] = None
    postal_code: Optional[str] = None
    coordinates: Dict[str, float]


class SupplierContact(BaseModel):
    primary_name: Optional[str] = None
    primary_title: Optional[str] = None
    primary_email: str
    primary_phone: Optional[str] = None
    secondary_email: Optional[str] = None
    secondary_phone: Optional[str] = None
    website: Optional[str] = None
    linkedin: Optional[str] = None


class SupplierCapabilities(BaseModel):
    products: Optional[List[str]] = None
    services: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    pipeline_diameters_supported: Optional[Dict[str, float]] = None
    materials_expertise: Optional[List[str]] = None
    annual_capacity: Optional[str] = None
    experience_years: Optional[int] = None
    employee_count: Optional[int] = None


class SupplierMetadata(BaseModel):
    source: str
    query_id: Optional[str] = None
    date_researched: str
    last_verified: Optional[str] = None
    confidence_level: str
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class SupplierProfile(BaseModel):
    supplier_id: str
    company_name: str
    category: str
    subcategories: Optional[List[str]] = None
    location: SupplierLocation
    contact: SupplierContact
    capabilities: Optional[SupplierCapabilities] = None
    previous_projects: Optional[List[Dict[str, Any]]] = None
    logistics: Optional[Dict[str, Any]] = None
    pricing: Optional[Dict[str, Any]] = None
    quality_ratings: Optional[Dict[str, Any]] = None
    compatibility: Optional[Dict[str, Any]] = None
    metadata: SupplierMetadata


class SupplierIndexEntry(BaseModel):
    supplier_id: str
    company_name: str
    category: str
    file: str
    coordinates: Dict[str, float]


class SupplierIndex(BaseModel):
    project_id: Optional[str] = None
    last_updated: str
    total_suppliers: int
    suppliers_by_category: Dict[str, int]
    suppliers: List[SupplierIndexEntry]


class SuppliersResponse(BaseModel):
    project: str
    total_suppliers: int
    suppliers: List[Dict[str, Any]]


class SupplierSearchRequest(BaseModel):
    project: str
    category: str
    limit: Optional[int] = 10
    expanded: Optional[bool] = False


class SupplierSearchResponse(BaseModel):
    status: str
    suppliers_found: int
    profiles_generated: int
    message: str
    suppliers: List[Dict[str, Any]]
    has_more: bool


class SupplierSearchJob(BaseModel):
    """Job status for supplier search with streaming logs"""
    job_id: str
    status: str  # 'pending', 'running', 'succeeded', 'failed'
    progress: int  # 0-100
    current_phase: str
    logs: List[str]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


def _add_job_log(job_id: str, message: str):
    """Add a log message to a job"""
    if job_id in _supplier_jobs:
        _supplier_jobs[job_id]["logs"].append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {message}")
        print(f"[SupplierJob {job_id[:8]}] {message}")


def _update_job_progress(job_id: str, progress: int, phase: str):
    """Update job progress"""
    if job_id in _supplier_jobs:
        _supplier_jobs[job_id]["progress"] = progress
        _supplier_jobs[job_id]["current_phase"] = phase


def _load_perplexity_credentials() -> Optional[Dict[str, str]]:
    """Load Perplexity API credentials from credentials file."""
    for cred_path in PERPLEXITY_CREDENTIALS_PATHS:
        if cred_path.exists():
            try:
                with open(cred_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading Perplexity credentials from {cred_path}: {e}")
    return None


def _load_claude_credentials() -> Optional[Dict[str, str]]:
    """Load Claude API credentials from credentials file."""
    for cred_path in CLAUDE_CREDENTIALS_PATHS:
        if cred_path.exists():
            try:
                with open(cred_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading Claude credentials from {cred_path}: {e}")
    return None


async def _query_claude(
    prompt: str,
    system_prompt: str = None,
    model: str = "claude-opus-4-5-20251101",
    max_tokens: int = 16000,
    temperature: float = 0.2
) -> Optional[str]:
    """
    Query ZEUS AI Agent for comprehensive supplier research.

    Uses advanced AI for deep, accurate research with reasoning capabilities.
    This is critical for projects of national importance where accuracy matters.
    """
    if not ANTHROPIC_AVAILABLE:
        print("Claude API not available: Anthropic SDK not installed")
        return None

    creds = _load_claude_credentials()
    if not creds or "api_key" not in creds:
        print("Claude credentials not found. Please create a credentials file at ~/.claude_credentials")
        print("Format: {\"api_key\": \"sk-ant-...\"}")
        return None

    api_key = creds["api_key"]

    try:
        client = AsyncAnthropic(api_key=api_key)

        messages = [{"role": "user", "content": prompt}]

        kwargs = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        print(f"[ZEUS AI] Using model: {model}")
        print(f"[ZEUS AI] Prompt length: {len(prompt)} chars")
        print(f"[ZEUS AI] Temperature: {temperature}")

        # Use streaming for long-running requests to avoid 10-minute timeout
        print("[ZEUS AI] Using streaming for long-running research...")
        accumulated_text = ""

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                accumulated_text += text

        if accumulated_text:
            print(f"[ZEUS AI] Response received: {len(accumulated_text)} chars")
            return accumulated_text
        else:
            print("[ZEUS AI] No content in response")
            return None

    except Exception as e:
        print(f"Error querying Claude API: {e}")
        return None


# REMOVED: Perplexity API integration (ZEUS AI Agent is now used exclusively)
# async def _query_perplexity(query: str, system_prompt: str = None, model: str = "sonar-reasoning-pro") -> Optional[str]:
#     """
#     Query Perplexity API for supplier information.
#     
#     Uses sonar-reasoning-pro model for comprehensive deep research with multi-step reasoning.
#     This model performs thorough web searches and synthesizes information from multiple sources.
#     """
#     creds = _load_perplexity_credentials()
#     if not creds or "api_key" not in creds:
#         print("Perplexity credentials not found")
#         return None
#     
#     api_key = creds["api_key"]
#     
#     headers = {
#         "Authorization": f"Bearer {api_key}",
#         "Content-Type": "application/json"
#     }
#     
#     default_system = """You are an expert industrial supplier research analyst specializing in pipeline and oil & gas sector companies.
# 
# Your task is to conduct COMPREHENSIVE research and provide DETAILED, VERIFIED information about suppliers.
# 
# For each company you find, you MUST provide:
# 1. **Company Name** - Full official registered name
# 2. **Headquarters** - Exact city and country
# 3. **Website** - Official company website URL (verify it exists)
# 4. **Contact Email** - Official contact email if publicly available
# 5. **Phone** - Main contact number with country code
# 6. **Certifications** - All relevant certifications (ISO 9001, ISO 14001, API 5L, API 5CT, ASME, DNV GL, etc.)
# 7. **Year Founded** - When the company was established
# 8. **Employee Count** - Approximate number of employees
# 9. **Annual Revenue** - If publicly available
# 10. **Products/Services** - Detailed list of what they offer
# 11. **Key Clients/Projects** - Notable projects or clients they've worked with
# 12. **Manufacturing Facilities** - Locations of production plants
# 
# CRITICAL REQUIREMENTS:
# - Conduct thorough web research across multiple sources
# - Only report VERIFIED, factual information
# - Include actual website URLs that you have verified
# - If information is not available, explicitly state "Not publicly available"
# - Cite your sources"""
#     
#     payload = {
#         "model": model,
#         "messages": [
#             {
#                 "role": "system",
#                 "content": system_prompt or default_system
#             },
#             {
#                 "role": "user",
#                 "content": query
#             }
#         ],
#         "max_tokens": 16000,  # Increased for comprehensive responses
#         "temperature": 0.1,   # Low temperature for factual accuracy
#         "return_citations": True
#     }
#     
#     print(f"[Perplexity] Using model: {model}")
#     print(f"[Perplexity] Query length: {len(query)} chars")
#     
#     try:
#         # Longer timeout for deep research - reasoning models take longer
#         async with httpx.AsyncClient(timeout=180.0) as client:
#             response = await client.post(
#                 "https://api.perplexity.ai/chat/completions",
#                 headers=headers,
#                 json=payload
#             )
#             
#             if response.status_code == 200:
#                 data = response.json()
#                 if "choices" in data and len(data["choices"]) > 0:
#                     content = data["choices"][0]["message"]["content"]
#                     # Remove <think> tags if present (from reasoning models)
#                     content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
#                     print(f"[Perplexity] Response received: {len(content)} chars")
#                     return content.strip()
#             else:
#                 print(f"Perplexity API error: {response.status_code} - {response.text}")
#     except httpx.TimeoutException:
#         print(f"[Perplexity] Request timed out after 180s - model may need more time")
#     except Exception as e:
#         print(f"Error querying Perplexity: {e}")
#     
#     return None
# 
# 
# def _geocode_city(city: str, country: str) -> Dict[str, float]:
#     """
#     Get coordinates for a city. Uses local lookup first, then falls back to country capital.
#     """
#     if not city:
#         # Fall back to country capital
#         country_lower = country.lower()
#         if country_lower in COUNTRY_CAPITALS:
#             return COUNTRY_CAPITALS[country_lower]
#         return {"latitude": 0.0, "longitude": 0.0}
#     
#     # Normalize city name for lookup
#     city_lower = city.lower().strip()
#     
#     # Direct lookup
#     if city_lower in CITY_COORDINATES:
#         return CITY_COORDINATES[city_lower]
#     
#     # Try without common suffixes
#     for suffix in [' city', ' town', ' municipality']:
#         if city_lower.endswith(suffix):
#             base_city = city_lower[:-len(suffix)]
#             if base_city in CITY_COORDINATES:
#                 return CITY_COORDINATES[base_city]
#     
#     # Try partial matching (for cities like "San Donato Milanese")
#     for known_city, coords in CITY_COORDINATES.items():
#         if known_city in city_lower or city_lower in known_city:
#             return coords
#     
#     # Fall back to country capital with slight offset (so multiple unknown cities don't stack)
#     country_lower = country.lower()
#     if country_lower in COUNTRY_CAPITALS:
#         base_coords = COUNTRY_CAPITALS[country_lower]
#         # Add small random-ish offset based on city name hash
#         offset = (hash(city_lower) % 100) / 500  # ~0.2 degree max offset
#         return {
#             "latitude": base_coords["latitude"] + offset,
#             "longitude": base_coords["longitude"] + offset
#         }
#     
#     return {"latitude": 0.0, "longitude": 0.0}
# 
# 
async def _geocode_city_nominatim(city: str, country: str) -> Optional[Dict[str, float]]:
    """
    Geocode a city using OpenStreetMap Nominatim API (free, no API key required).
    Use sparingly to avoid rate limiting.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {
                "q": f"{city}, {country}",
                "format": "json",
                "limit": 1
            }
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers={"User-Agent": "AGRS-ZEUS/2.0"}
            )

            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    return {
                        "latitude": float(data[0]["lat"]),
                        "longitude": float(data[0]["lon"])
                    }
    except Exception as e:
        print(f"[Geocoding] Error geocoding {city}, {country}: {e}")

    return None


async def _geocode_full_address_nominatim(
    company_name: str,
    address: str,
    city: str,
    country: str
) -> Optional[Dict[str, float]]:
    """
    Geocode a full company address using OpenStreetMap Nominatim API.

    Tries multiple search strategies:
    1. Full address with company name
    2. Street address + city + country
    3. City + country (fallback)

    Returns coordinates with higher accuracy than city-only geocoding.
    """
    search_queries = []

    # Strategy 1: Company name + city + country (best for finding HQ)
    if company_name and city:
        search_queries.append(f"{company_name}, {city}, {country}")

    # Strategy 2: Full street address
    if address and city:
        search_queries.append(f"{address}, {city}, {country}")

    # Strategy 3: Just city (fallback)
    if city:
        search_queries.append(f"{city}, {country}")

    for query in search_queries:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                params = {
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1
                }
                response = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params=params,
                    headers={"User-Agent": "AGRS-ZEUS/2.0"}
                )

                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        result = data[0]
                        coords = {
                            "latitude": float(result["lat"]),
                            "longitude": float(result["lon"])
                        }

                        # Log which strategy worked
                        print(f"[Geocoding] Found: {company_name or address} using query: '{query}'")
                        print(f"[Geocoding] Coordinates: {coords['latitude']:.4f}, {coords['longitude']:.4f}")

                        return coords

                # Rate limit: wait 1 second between requests
                await asyncio.sleep(1)

        except Exception as e:
            print(f"[Geocoding] Error with query '{query}': {e}")
            continue

    print(f"[Geocoding] Failed to geocode: {company_name} in {city}, {country}")
    return None


def _parse_supplier_from_text(text: str, category: str, country: str, iso3: str, index: int) -> Optional[Dict[str, Any]]:
    """
    Parse a supplier entry from Perplexity response text into a structured profile.
    ONLY includes verified information - no fake/placeholder data.
    """
    
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    if not lines:
        return None
    
    full_text = '\n'.join(lines)
    
    # Try to extract company name
    company_name = None
    
    # First, look for explicit "Company Name:" pattern from Perplexity
    company_name_match = re.search(r'\*\*Company Name:?\*\*\s*(.+?)(?:\[|\n|$)', full_text)
    if company_name_match:
        name = company_name_match.group(1).strip()
        # Remove markdown and citations
        name = re.sub(r'\[[\d,\s]+\]', '', name).strip()
        name = name.strip('*').strip()
        if name and len(name) > 3 and len(name) < 100:
            company_name = name
    
    # If not found, try header patterns like "## 1. Company Name"
    if not company_name:
        header_match = re.search(r'##\s*\d+\.\s*(.+?)(?:\n|$)', full_text)
        if header_match:
            name = header_match.group(1).strip()
            if name and len(name) > 3 and len(name) < 100:
                company_name = name
    
    # Skip words that indicate this is not a company name
    skip_words = ['location', 'contact', 'website', 'email', 'phone', 'services', 'certifications', 
                  'top ', 'pipeline', 'contractors', 'companies', 'suppliers', 'notable', 'clients',
                  'projects', 'offered', 'specializes', 'provides', 'based', 'located', 'headquarters',
                  'experience', 'years', 'notable', 'major', 'city', 'address', 'region', 'country',
                  'format', 'details', 'information', 'find', 'real', 'each', 'company name', 'here are', 'italian',
                  'year founded', 'founded', 'established', 'products', 'key']
    
    # Fallback: try to find company name from first substantial line
    if not company_name:
        for line in lines[:5]:
            # Remove numbering like "1. " or "**1. "
            clean_line = re.sub(r'^[\d\.\-\*#\s]+', '', line).strip()
            
            # Skip if it's a label line
            if ':' in clean_line and any(label in clean_line.lower() for label in 
                ['location', 'website', 'email', 'phone', 'certifications', 'experience', 'services', 'city', 'address']):
                continue
            
            # Check if it looks like a company name
            if clean_line and len(clean_line) > 5 and len(clean_line) < 100:
                # Must have capital letters and not be a skip word
                if (re.search(r'[A-Z]', clean_line) and 
                    not any(skip in clean_line.lower() for skip in skip_words) and
                    not clean_line.lower().startswith('list') and
                    not clean_line.lower().startswith('for each')):
                    # Extract just the company name part (before any colon or dash)
                    name = clean_line.split(':')[0].split('(')[0].strip().strip('*')
                    # Further cleanup - remove trailing dashes and spaces
                    name = re.sub(r'\s*-\s*$', '', name).strip()
                    # Verify it's a valid company name (should have legal suffix or multiple words)
                    if name and len(name) > 5:
                        # Check for common company suffixes or multi-word names
                        has_suffix = any(s in name.lower() for s in ['.p.a.', 'spa', 's.p.a', 'srl', 's.r.l', 'ltd', 'inc', 'corp', 'gmbh', 'ag', 'group', 'engineering', 'consulting', 'tenaris', 'saipem', 'rivit', 'tectubi'])
                        is_multi_word = len(name.split()) >= 2
                        if has_suffix or is_multi_word or len(name) > 10:
                            company_name = name
                            break
    
    if not company_name or len(company_name) < 3 or len(company_name) > 100:
        return None
    
    # Clean up company name
    company_name = re.sub(r'\s+', ' ', company_name).strip()
    
    # Generate supplier ID
    year = datetime.now().year
    supplier_id = f"SUP_{iso3}_{year}_{index:03d}"
    
    # Extract VERIFIED city only
    city = None
    city_patterns = [
        # "**Headquarters:** Castel San Giovanni, Piacenza, Italy"
        r'\*\*Headquarters:?\*\*\s*([A-Za-z][A-Za-z\s\-\']+?)(?:,\s*[A-Za-z]+)?,?\s*' + country,
        # "**Headquarters:** Caltrano (VI), Italy"
        r'\*\*Headquarters:?\*\*\s*([A-Za-z][A-Za-z\s\-\']+?)(?:\s*\([A-Z]+\))?,?\s*' + country,
        # "**Headquarters:** City"
        r'\*\*Headquarters:?\*\*\s*([A-Za-z][A-Za-z\s\-\']+?)(?:\s*\([A-Z]+\))?(?:,|\[|\n|$)',
        # "Headquarters: City, Province, Italy"
        r'Headquarters:?\s*([A-Za-z][A-Za-z\s\-\']+?)(?:,\s*[A-Za-z]+)?,?\s*' + country,
        # "Headquarters: City (VI)"
        r'Headquarters:?\s*([A-Za-z][A-Za-z\s\-\']+?)(?:\s*\([A-Z]+\))?(?:,|\[|\n|$)',
        # "based in City"
        r'(?:based|located)\s+(?:in|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        # ", City, Italy"
        r',\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,?\s*' + country,
    ]
    
    for pattern in city_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            potential_city = match.group(1).strip().strip(',').strip()
            # Remove province codes like "(VI)" and trailing commas
            potential_city = re.sub(r'\s*\([A-Z]+\)\s*', '', potential_city).strip()
            potential_city = potential_city.rstrip(',').strip()
            if potential_city and len(potential_city) > 2 and len(potential_city) < 50:
                skip_city_words = ['unknown', 'n/a', 'not available', 'various', 'multiple', 'italy', 'global', 'international', 'company']
                if not any(skip in potential_city.lower() for skip in skip_city_words):
                    city = potential_city
                    break
    
    # Extract VERIFIED website - must be a real URL from Perplexity's response
    website = None
    website_patterns = [
        r'\*\*Website:?\*\*\s*(https?://[^\s<>"{}|\\^`\[\]\)\n]+)',
        r'\*\*Website:?\*\*\s*([a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s<>"{}|\\^`\[\]\)\n]*)',  # Without https://
        r'Website:?\s*(https?://[^\s<>"{}|\\^`\[\]\)\n]+)',
        r'Website:?\s*([a-zA-Z0-9\-]+\.(?:com|it|eu|net|org)[^\s<>"{}|\\^`\[\]\)\n]*)',  # Without https://
        r'\[(?:website|official|visit)\]\((https?://[^\s<>"{}|\\^`\[\]\)]+)\)',  # Markdown link
        r'(https?://(?:www\.)?[a-zA-Z0-9\-]+\.(?:com|it|eu|net|org)(?:/[^\s<>"{}|\\^`\[\]\)\n]*)?)',
    ]
    
    for pattern in website_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            url = match.group(2) if match.lastindex and match.lastindex >= 2 else match.group(1)
            url = url.strip().rstrip(').,[]')
            # Add https:// if missing
            if url and not url.startswith('http'):
                url = 'https://' + url
            # Validate it looks like a real company URL
            if url and len(url) > 10 and '.' in url and 'example.com' not in url and 'perplexity' not in url:
                website = url
                break
    
    # Extract VERIFIED email - comprehensive patterns from multiple sources
    email = None
    email_patterns = [
        # Explicit labeled patterns
        r'\*\*(?:Contact\s*)?Email:?\*\*\s*([\w\.-]+@[\w\.-]+\.\w{2,})',
        r'[Ee]mail:?\s*([\w\.-]+@[\w\.-]+\.\w{2,})',
        r'[Ee]-?mail:?\s*([\w\.-]+@[\w\.-]+\.\w{2,})',
        # Common prefixes
        r'\b(info@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        r'\b(contact@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        r'\b(sales@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        r'\b(commercial@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        r'\b(enquiries@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        r'\b(office@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es))\b',
        # Generic email pattern
        r'\b([\w\.-]+@[\w\.-]+\.(?:com|it|eu|net|org|de|fr|uk|es|co\.uk))\b',
        # From LinkedIn or directories
        r'[Cc]ontact:?\s*(?:.*?)([\w\.-]+@[\w\.-]+\.\w{2,})',
    ]
    for pattern in email_patterns:
        email_match = re.search(pattern, full_text, re.IGNORECASE)
        if email_match:
            potential_email = email_match.group(1).strip()
            # Validate it's not a placeholder or example
            if (potential_email and '@' in potential_email and 
                'example' not in potential_email.lower() and
                'domain' not in potential_email.lower() and
                'email' not in potential_email.lower()):
                email = potential_email
                break
    
    # Extract VERIFIED phone - comprehensive patterns
    phone = None
    phone_patterns = [
        # Labeled patterns
        r'\*\*Phone:?\*\*\s*(\+?[\d\s\-().]{10,25})',
        r'[Pp]hone:?\s*(\+?[\d\s\-().]{10,25})',
        r'[Tt]el(?:ephone)?:?\s*(\+?[\d\s\-().]{10,25})',
        r'[Tt]el\.?:?\s*(\+?[\d\s\-().]{10,25})',
        r'[Ff]ax:?\s*(\+?[\d\s\-().]{10,25})',  # Fax often near phone
        # Italian phone format +39
        r'(\+39[\s\-.]?\d{2,4}[\s\-.]?\d{3,4}[\s\-.]?\d{3,4})',
        r'(\+39[\s\-.]?\d{6,10})',
        # Generic international format
        r'(\+\d{1,3}[\s\-.]?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4})',
        r'(\+\d{1,3}[\s\-.]?\d{2,4}[\s\-.]?\d{3,4}[\s\-.]?\d{3,4})',
        # From contact sections
        r'[Cc]ontact:?\s*(?:.*?)(\+?[\d\s\-().]{10,20})',
    ]
    for pattern in phone_patterns:
        phone_match = re.search(pattern, full_text, re.IGNORECASE)
        if phone_match:
            potential_phone = phone_match.group(1).strip()
            # Validate it looks like a real phone number
            digits = re.sub(r'\D', '', potential_phone)
            if len(digits) >= 9 and len(digits) <= 15:  # Valid phone length
                phone = potential_phone
                break
    
    # Extract address if available - comprehensive patterns
    address = None
    address_patterns = [
        r'\*\*(?:Headquarters\s*)?Address:?\*\*\s*(.+?)(?:\n|$)',
        r'\*\*Headquarters:?\*\*\s*(.+?)(?:\n|$)',
        r'[Hh]eadquarters\s*[Aa]ddress:?\s*(.+?)(?:\n|$)',
        r'[Aa]ddress:?\s*(.+?)(?:\n|$)',
        r'[Ll]ocation:?\s*(.+?)(?:\n|$)',
        # Italian address patterns (Via, Piazza, etc.)
        r'((?:Via|Piazza|Viale|Corso|Largo)\s+[A-Za-z\s\d,]+,?\s*\d{5}\s+[A-Za-z\s]+(?:\([A-Z]{2}\))?)',
        r'((?:Via|Piazza|Viale|Corso|Largo)\s+[^,\n]+,\s*\d+[^,\n]*,?\s*[A-Za-z\s]+)',
    ]
    for pattern in address_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            potential_address = match.group(1).strip()
            # Clean up markdown artifacts
            potential_address = re.sub(r'\[\d+\]', '', potential_address).strip()
            potential_address = re.sub(r'\*+', '', potential_address).strip()
            if potential_address and len(potential_address) > 10 and len(potential_address) < 200:
                # Don't use if it's just "Not found" or similar
                if 'not found' not in potential_address.lower() and 'not available' not in potential_address.lower():
                    address = potential_address
                    break
    
    # Extract LinkedIn URL if available
    linkedin = None
    linkedin_match = re.search(r'(https?://(?:www\.)?linkedin\.com/company/[^\s\)\]]+)', full_text)
    if linkedin_match:
        linkedin = linkedin_match.group(1).strip()
    
    # Extract year founded
    year_founded = None
    founded_patterns = [
        r'\*\*(?:Year\s*)?Founded:?\*\*\s*(\d{4})',
        r'Founded:?\s*(\d{4})',
        r'[Ee]stablished:?\s*(?:in\s*)?(\d{4})',
        r'[Ss]ince:?\s*(\d{4})',
    ]
    for pattern in founded_patterns:
        match = re.search(pattern, full_text)
        if match:
            year = int(match.group(1))
            if 1800 <= year <= 2025:
                year_founded = year
                break
    
    # Extract employee count
    employee_count = None
    employee_patterns = [
        r'\*\*Employees?:?\*\*\s*([\d,]+)',
        r'Employees?:?\s*([\d,]+)',
        r'([\d,]+)\s*employees',
        r'workforce\s*(?:of\s*)?([\d,]+)',
    ]
    for pattern in employee_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            count_str = match.group(1).replace(',', '')
            try:
                employee_count = int(count_str)
                break
            except:
                pass
    
    # Extract VERIFIED certifications
    certifications = []
    cert_patterns = [
        r'ISO\s*\d+(?::\d+)?',
        r'API\s*5L(?:\s*PSL\s*[12])?',
        r'API\s*5CT',
        r'API\s*Q[12]',
        r'ASME\s*[A-Z]+',
        r'DNV[- ]?GL',
        r'PED',
        r'EN\s*\d+',
    ]
    for pattern in cert_patterns:
        matches = re.findall(pattern, full_text, re.IGNORECASE)
        for m in matches:
            cert = re.sub(r'\s+', ' ', m.strip())
            if cert and cert not in certifications and len(cert) >= 3:
                certifications.append(cert)
    
    # Extract services/products mentioned - clean up markdown formatting
    services = []
    # Look for services section
    services_patterns = [
        r'(?:Products?\s*(?:&|and)\s*)?Services?\s*[:\*]+\s*(.+?)(?=\n\n|\n\d+\.|\n\*\*|$)',
        r'(?:offers?|provides?|manufactures?|specializes?\s+in)\s*[:\s]+([^\.]+)',
    ]
    for pattern in services_patterns:
        services_match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
        if services_match:
            services_text = services_match.group(1)
            # Clean up markdown
            services_text = re.sub(r'\*+', '', services_text)
            services_text = re.sub(r'\[.*?\]', '', services_text)
            # Split and clean
            raw_services = re.split(r'[,;•\n]', services_text)
            for s in raw_services:
                s = s.strip().strip('-').strip()
                if s and len(s) > 5 and len(s) < 100 and not s.startswith('&'):
                    services.append(s)
            if services:
                break
    services = services[:10]
    
    # Extract experience years if mentioned
    experience_years = None
    exp_match = re.search(r'(?:over\s+)?(\d+)\s*(?:\+\s*)?years?\s*(?:of\s*)?(?:experience|in\s*business|established|history|operating)', full_text, re.IGNORECASE)
    if exp_match:
        try:
            experience_years = int(exp_match.group(1))
        except:
            pass
    
    # GEOCODE the city if we found one
    coordinates = {"latitude": 0.0, "longitude": 0.0}
    if city:
        coordinates = _geocode_city(city, country)
    else:
        # Use country capital as fallback but mark city as not verified
        coordinates = _geocode_city("", country)
    
    # Build profile with ONLY verified data - no placeholders
    profile = {
        "supplier_id": supplier_id,
        "company_name": company_name,
        "category": category,
        "location": {
            "country": country,
            "iso3": iso3,
            "city": city if city else "not_verified",
            "coordinates": coordinates
        },
        "contact": {},  # Only add verified contact info
        "capabilities": {},
        "metadata": {
            "source": "perplexity_research",
            "date_researched": datetime.utcnow().isoformat() + "Z",
            "confidence_level": "high" if (website and (email or phone)) else ("medium" if website else "low"),
            "notes": "Discovered via Perplexity AI multi-source research."
        }
    }
    
    # Add location address if found
    if address:
        profile["location"]["address"] = address
    
    # Only add contact info if verified
    if website:
        profile["contact"]["website"] = website
    if email:
        profile["contact"]["primary_email"] = email
    if phone:
        profile["contact"]["primary_phone"] = phone
    if linkedin:
        profile["contact"]["linkedin"] = linkedin
    
    # If no contact info at all, add a placeholder note
    if not profile["contact"]:
        profile["contact"]["primary_email"] = "not_available"
    
    # Only add capabilities if we found them
    if certifications:
        profile["capabilities"]["certifications"] = certifications[:15]  # Allow more certs
    if services:
        profile["capabilities"]["services"] = services[:15]  # Allow more services
    if experience_years:
        profile["capabilities"]["experience_years"] = experience_years
    if employee_count:
        profile["capabilities"]["employee_count"] = employee_count
    
    # Add year founded if available
    if year_founded:
        profile["capabilities"]["year_founded"] = year_founded
    
    # Extract notable projects if mentioned
    projects_match = re.search(r'\*\*Notable Projects?:?\*\*\s*(.+?)(?=\n\*\*|\n---|\Z)', full_text, re.IGNORECASE | re.DOTALL)
    if projects_match:
        projects_text = projects_match.group(1).strip()
        # Clean up and split into list
        projects = [p.strip().strip('-•').strip() for p in projects_text.split('\n') if p.strip() and len(p.strip()) > 5]
        if projects:
            profile["previous_projects"] = [{"project_name": p} for p in projects[:5]]
    
    # Extract manufacturing facilities if mentioned
    facilities_match = re.search(r'\*\*Manufacturing Facilities?:?\*\*\s*(.+?)(?=\n\*\*|\n---|\Z)', full_text, re.IGNORECASE | re.DOTALL)
    if facilities_match:
        facilities_text = facilities_match.group(1).strip()
        facilities = [f.strip().strip('-•').strip() for f in facilities_text.split('\n') if f.strip() and len(f.strip()) > 3]
        if facilities:
            profile["logistics"] = {"warehouses": [{"location": f} for f in facilities[:5]]}
    
    return profile


def _ensure_suppliers_directory(project_path: Path) -> Path:
    """Create the suppliers directory structure if it doesn't exist."""
    suppliers_dir = project_path / "docs" / "suppliers"
    suppliers_dir.mkdir(parents=True, exist_ok=True)
    
    # Create category subdirectories
    for category_dir in CATEGORY_TO_DIR.values():
        (suppliers_dir / category_dir).mkdir(exist_ok=True)
    
    return suppliers_dir


def _load_supplier_index(project_path: Path) -> Optional[Dict[str, Any]]:
    """Load the supplier index file."""
    index_path = project_path / "docs" / "suppliers" / "supplier_index.json"
    if index_path.exists():
        return load_json_file(index_path)
    return None


def _save_supplier_index(project_path: Path, index_data: Dict[str, Any]) -> None:
    """Save the supplier index file."""
    index_path = project_path / "docs" / "suppliers" / "supplier_index.json"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2)


def _load_all_suppliers(project_path: Path, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load all supplier profiles from the project, optionally filtered by category."""
    suppliers = []
    suppliers_dir = project_path / "docs" / "suppliers"
    
    if not suppliers_dir.exists():
        return suppliers
    
    # Determine which directories to scan
    if category:
        dirs_to_scan = [CATEGORY_TO_DIR.get(category, category)]
    else:
        dirs_to_scan = list(CATEGORY_TO_DIR.values())
    
    # Scan category directories
    for category_dir in dirs_to_scan:
        category_path = suppliers_dir / category_dir
        if category_path.exists():
            for json_file in category_path.glob("*.json"):
                try:
                    supplier = load_json_file(json_file)
                    if supplier and "supplier_id" in supplier:
                        suppliers.append(supplier)
                except Exception as e:
                    print(f"Warning: Failed to load supplier file {json_file}: {e}")
    
    # Sort by compatibility match_score (descending), then by quality rating
    def sort_key(s):
        match_score = s.get("compatibility", {}).get("match_score", 0) or 0
        quality_score = s.get("quality_ratings", {}).get("overall_score", 0) or 0
        # Handle string values that should be numbers
        try:
            match_score = float(match_score) if match_score != "not_available" else 0
        except (ValueError, TypeError):
            match_score = 0
        try:
            quality_score = float(quality_score) if quality_score != "not_available" else 0
        except (ValueError, TypeError):
            quality_score = 0
        return (-match_score, -quality_score)
    
    suppliers.sort(key=sort_key)
    
    return suppliers


def _generate_supplier_id(iso3: str, year: int, existing_ids: List[str]) -> str:
    """Generate a new unique supplier ID."""
    prefix = f"SUP_{iso3}_{year}_"
    max_seq = 0
    
    for existing_id in existing_ids:
        if existing_id.startswith(prefix):
            try:
                seq = int(existing_id.split("_")[-1])
                max_seq = max(max_seq, seq)
            except ValueError:
                continue
    
    return f"{prefix}{max_seq + 1:03d}"


async def _comprehensive_supplier_research_claude(
    category: str,
    country: str,
    iso3: str,
    limit: int,
    specs: Dict[str, Any],
    aoi: Dict[str, Any],
    metadata: Dict[str, Any],
    existing_ids: List[str] = None
) -> List[Dict[str, Any]]:
    """
    Perform COMPREHENSIVE supplier research using ZEUS AI Agent.

    This function is designed for projects of national importance where data accuracy
    and completeness are critical. ZEUS AI performs deep, multi-step research across
    multiple sources to build complete, verified supplier profiles.
    """
    # Load the example template
    template_path = Path("/opt/agrs/templates/supplier_profile_example.json")
    try:
        with open(template_path) as f:
            example_json = json.load(f)
    except:
        example_json = {}

    # Category-specific descriptions with focus on project requirements
    category_descriptions = {
        "construction_supplies": {
            "name": "Construction Materials & Supplies",
            "key_products": "steel plates, welding materials (electrodes, flux), pipe coatings (FBE, 3LPE, 3LPP), cathodic protection systems, joint wrapping materials",
            "certifications": "ISO 9001, ISO 14001, EN standards, material certifications",
            "exclusions": "NOT construction contractors, NOT pipe manufacturers, NOT engineering consultancies - ONLY suppliers of materials and consumables"
        },
        "construction_services": {
            "name": "Pipeline Construction Contractors & Service Providers",
            "key_products": "civil works, trenching, horizontal directional drilling (HDD), pipe welding, hydrostatic testing, commissioning services",
            "certifications": "ISO 9001, OHSAS 18001, welding certifications (EN 287, ASME IX), construction licenses",
            "exclusions": "NOT material suppliers, NOT pipe manufacturers - ONLY companies that provide construction/installation SERVICES"
        },
        "pipeline_manufacturer": {
            "name": "Pipeline & Pipe Manufacturers ONLY",
            "key_products": "seamless steel pipes, welded steel pipes (ERW, LSAW, SSAW) for OIL/GAS/WATER transmission, pipe fittings, flanges, valves, special sections",
            "certifications": "API 5L, API 5CT, ISO 3183, EN 10208, ASME B31.4/B31.8, DNV GL, PED",
            "exclusions": "EXCLUDE: construction services companies (Turner Industries, TechnipFMC), electrical conduit manufacturers (Allied Tube & Conduit), HVAC tube manufacturers. ONLY include companies that manufacture transmission pipeline and related pressure equipment."
        },
        "equipment_manufacturer": {
            "name": "Pipeline Equipment Manufacturers",
            "key_products": "compressors, flow meters, pressure regulators, pig launchers/receivers, SCADA systems, valve actuators, filtration systems",
            "certifications": "ISO 9001, ATEX, API 6D, API 610, IEC standards",
            "exclusions": "NOT pipe manufacturers, NOT construction services - ONLY equipment and instrumentation manufacturers"
        },
        "consultancy": {
            "name": "Environmental & Engineering Consultancies",
            "key_products": "Environmental Impact Assessment (EIA), permitting support, geotechnical surveys, route optimization, engineering design (FEED, detailed design), regulatory compliance",
            "certifications": "ISO 9001, ISO 14001, national engineering licenses, environmental accreditations",
            "exclusions": "NOT construction contractors, NOT manufacturers - ONLY consulting firms providing advisory/design services"
        }
    }

    cat_info = category_descriptions.get(category, {
        "name": category.replace('_', ' ').title(),
        "key_products": "",
        "certifications": ""
    })

    # Build comprehensive project context
    project_context_parts = []

    # Project metadata
    if metadata:
        if metadata.get("project_name"):
            project_context_parts.append(f"**Project**: {metadata['project_name']}")
        if metadata.get("project_type"):
            project_context_parts.append(f"**Type**: {metadata['project_type']}")
        if metadata.get("description"):
            project_context_parts.append(f"**Description**: {metadata['description']}")

    # Pipeline specifications - CRITICAL for matching
    specs_parts = []
    if specs:
        if specs.get("diameter_mm"):
            specs_parts.append(f"- Diameter: {specs['diameter_mm']} mm ({specs['diameter_mm']/25.4:.1f} inches)")
        if specs.get("material"):
            specs_parts.append(f"- Material: {specs['material']}")
        if specs.get("type"):
            specs_parts.append(f"- Fluid Type: {specs['type']}")
        if specs.get("mop_bar"):
            specs_parts.append(f"- Maximum Operating Pressure (MOP): {specs['mop_bar']} bar")
        if specs.get("dp_bar"):
            specs_parts.append(f"- Design Pressure (DP): {specs['dp_bar']} bar")
        if specs.get("depth_of_cover_m"):
            specs_parts.append(f"- Depth of Cover: {specs['depth_of_cover_m']} m")

        # Hydraulics info if available
        if specs.get("hydraulics"):
            hyd = specs["hydraulics"]
            if hyd.get("volumetric_flow_rate_m3_s"):
                specs_parts.append(f"- Flow Rate: {hyd['volumetric_flow_rate_m3_s']} m³/s")
            if hyd.get("operating_temperature_k"):
                temp_c = hyd['operating_temperature_k'] - 273.15
                specs_parts.append(f"- Operating Temperature: {temp_c:.1f}°C")

    if specs_parts:
        project_context_parts.append("\n**Pipeline Specifications** (suppliers MUST be able to meet these):\n" + "\n".join(specs_parts))

    # AOI context
    aoi_parts = []
    if aoi:
        if aoi.get("start_point"):
            sp = aoi['start_point']
            aoi_parts.append(f"- Start: Lat {sp.get('latitude', 'N/A'):.4f}, Lon {sp.get('longitude', 'N/A'):.4f}")
        if aoi.get("end_point"):
            ep = aoi['end_point']
            aoi_parts.append(f"- End: Lat {ep.get('latitude', 'N/A'):.4f}, Lon {ep.get('longitude', 'N/A'):.4f}")
        if aoi.get("aoi_area_km2"):
            aoi_parts.append(f"- AOI Area: {aoi['aoi_area_km2']:.2f} km²")
        if aoi.get("aoi_countries"):
            countries = ", ".join(aoi['aoi_countries'])
            aoi_parts.append(f"- Countries: {countries}")

    if aoi_parts:
        project_context_parts.append("\n**Area of Interest**:\n" + "\n".join(aoi_parts))

    project_context = "\n".join(project_context_parts)

    # Build the comprehensive research prompt
    system_prompt = f"""You are an expert industrial procurement analyst specializing in pipeline and oil & gas infrastructure projects.

You are conducting supplier research for a project of NATIONAL IMPORTANCE. Data accuracy, completeness, and verification are CRITICAL.

Your task: Research and return {limit} top-qualified {cat_info['name']} suppliers for this project.

CRITICAL CATEGORY REQUIREMENTS:
{cat_info.get('exclusions', '')}

RESEARCH METHODOLOGY:
1. Search multiple authoritative sources:
   - Official company websites and investor relations pages
   - LinkedIn company pages and employee profiles
   - Industry directories (Kompass, Europages, ThomasNet, industry associations)
   - Trade associations and certification bodies (API, ASME, DNV, etc.)
   - Project case studies, press releases, and news articles
   - Government procurement databases
   - Company "About Us", "Contact", and "Team" pages

2. Verify ALL information from at least 2 independent sources when possible

3. For EACH supplier, you MUST find and verify:

   **Company Identification:**
   - Official registered company name (NOT generic descriptions)
   - Verify company category fits EXACTLY (read exclusions above)
   - Exact headquarters city (REAL city name, NOT "Various", "Not specified", etc.)
   - Street address of headquarters/main facility if publicly available
   - Verify location accuracy (cross-check multiple sources)

   **Contact Information:**
   - Official website URL (verify it exists and loads)
   - Primary contact email (official company domain, not gmail/yahoo)
   - Phone number with full country code (+1, +39, etc.)
   - LinkedIn company page URL

   **Technical Capabilities:**
   - Industry certifications with EXACT names (e.g., "ISO 9001:2015", "API 5L PSL2", not just "ISO certified")
   - Product specifications (diameters, pressures, materials)
   - Previous relevant projects with actual project names, clients, years
   - Annual production capacity or project portfolio value
   - Years of experience in the industry

   **SALES CONTACT** (MANDATORY - CRITICAL REQUIREMENT):
   Search extensively for the specific person responsible for sales/business development:

   **How to find sales contacts:**
   a) Check company website "Team" or "Contact" pages
   b) Search LinkedIn: "[Company Name] sales director" or "[Company Name] business development"
   c) Look for press releases or news articles mentioning sales personnel
   d) Check company investor relations or annual reports for executive names
   e) Search: "site:linkedin.com [Company Name] sales" or "site:linkedin.com [Company Name] commercial"

   **Required sales contact info:**
   * Full name (First and Last name - REAL person, not "Sales Team")
   * Job title (e.g., "Regional Sales Director", "VP of Sales", "Business Development Manager")
   * Department (e.g., "Commercial Sales", "Business Development")
   * Direct business email (firstname.lastname@company.com format - search on LinkedIn or company site)
   * Direct phone number or sales department number with country code
   * LinkedIn profile URL (search "FirstName LastName CompanyName LinkedIn")
   * Professional photo URL from LinkedIn profile picture if publicly accessible
   * Specialization areas or product lines they handle
   * Languages spoken (check LinkedIn profile)
   * Years with company if available on LinkedIn

   **Quality Ratings:**
   - Search for customer reviews, testimonials, case studies
   - Look for industry awards or recognition
   - Check reputation on industry forums or B2B review sites
   - Provide realistic rating (1-5 scale) based on evidence found

   **Compatibility Analysis:**
   - Analyze if supplier can meet the exact project specifications (diameter, pressure, material)
   - Calculate realistic match score (0-100%) based on capabilities vs requirements
   - List specific reasons why they're a good match
   - List any limitations or gaps in capabilities

4. CRITICAL VALIDATION RULES:
   - NEVER include companies from excluded categories (read exclusions carefully!)
   - NEVER fabricate information - use "not_available" only if truly unfindable
   - NEVER use placeholder or generic data
   - Contact emails MUST be real company domains (not "contact@...", not "not_available@...")
   - Sales contact names MUST be real people with LinkedIn profiles
   - Certifications MUST have proper names and years (e.g., "ISO 9001:2015", not "ISO certified")
   - Match scores MUST be justified by actual capabilities

OUTPUT FORMAT:
Return EXACTLY {limit} suppliers as valid JSON array.

Each supplier MUST be a complete JSON object following this EXACT structure:
{json.dumps(example_json, indent=2)}

QUALITY REQUIREMENTS - STRICTLY ENFORCED:
- company_name: Real registered business name (not generic descriptions like "ABC Company" or "Supplier 1")
- location.address: Actual street address of headquarters/main facility (search company website, Google Maps)
- location.city: VERIFIED city name where company headquarters is located - cross-check on company website and Google
- contact.website: REAL working website URL (check company exists online)
- contact.primary_email: Real company email with company domain (e.g., info@company.com, NOT "not_available" unless unfindable)
- contact.primary_phone: Main switchboard number with country code
- capabilities.certifications: Specific certification names WITH YEARS (e.g., "ISO 9001:2015", "API 5L X52 PSL2", "ASME Section VIII Div 1")
- capabilities.pipeline_diameters_supported: Actual numeric ranges in inches (e.g., min: 6, max: 60)
- previous_projects: At least 1-2 real project examples with names, clients, years (search case studies, press releases)
- compatibility.match_score: Realistic numeric score (0-100) based on spec match
- compatibility.match_notes: Specific reasons (e.g., "Supports 36 inch diameter", "Has API 5L certification", "Experience in similar terrain")
- quality_ratings.overall_score: Numeric rating 1.0-5.0 based on research (or "not_available" only if no data found)
- metadata.confidence_level: "high" only if found website + email + sales contact + certifications
- sales_contact.name: REAL person's FULL NAME (First Last) - search LinkedIn profiles, company team pages
- sales_contact.title: Their actual job title (not "Sales Contact")
- sales_contact.email: Direct work email in company domain (firstname.lastname@company.com preferred)
- sales_contact.phone: Their direct number or sales department main line
- sales_contact.linkedin_profile: Real LinkedIn URL (https://www.linkedin.com/in/person-name/ or /company/person)
- sales_contact.photo_url: LinkedIn profile photo if publicly visible (https://media.licdn.com/dms/image/...)

RESPONSE FORMAT:
```json
[
  {{ supplier 1 }},
  {{ supplier 2 }},
  ...
  {{ supplier {limit} }}
]
```

Return ONLY the JSON array. No explanatory text before or after."""

    prompt = f"""# Supplier Research Request

## Project Context
{project_context}

## Category
**{cat_info['name']}**

Key Products/Services: {cat_info['key_products']}
Required Certifications: {cat_info['certifications']}

## Requirements
- Find the top {limit} most qualified suppliers in **{country}**
- Suppliers MUST be able to meet the pipeline specifications above
- Suppliers MUST be in the CORRECT category (read exclusions carefully!)
- Focus on companies with proven track record in similar projects
- Prioritize suppliers with relevant certifications and real project experience
- Include logistics capabilities (can they deliver to the project site?)

## Geographic Scope
Primary: {country}
Consider international suppliers ONLY if they have proven delivery capability to {country}

## CRITICAL INSTRUCTIONS - READ CAREFULLY:

**Category Validation:**
{cat_info.get('exclusions', 'Verify company fits this category exactly')}

**Location Verification:**
- For US companies: Search "[Company Name] headquarters address" to find real street address
- Verify city on company website "Contact" or "About" page
- Cross-check with Google Maps or LinkedIn company page
- Example: For "Stupp Corporation", you should find they are in Baton Rouge, LA (NOT Chicago!)

**Sales Contact Search Strategy:**
1. Go to company website > Look for "Team", "Leadership", "Contact Us" pages
2. Search LinkedIn: "[Company Name] sales director" or "[Company Name] business development manager"
3. Check LinkedIn company page > See employees > Filter by "Sales" or "Business Development"
4. Search for press releases or news mentioning sales personnel
5. Look at annual reports or investor relations for executive team names
6. If you find a name, verify it's a REAL person with an active LinkedIn profile

**Data Quality Checks:**
1. Every supplier MUST have a real company name that you verified exists
2. Every supplier MUST have a website you can verify
3. Every location city MUST be verified (not guessed)
4. Sales contact names MUST be real people (search thoroughly on LinkedIn)
5. Certifications MUST be specific (not just "ISO certified" but "ISO 9001:2015")
6. Match scores MUST be justified by actual capabilities you found
7. Use "not_available" ONLY after exhaustive search (minimum 5+ sources checked)

Return {limit} suppliers as a JSON array. DO NOT include companies from excluded categories.

Begin your comprehensive research now."""

    print(f"[ZEUS AI] Querying for {limit} {category} suppliers in {country}...")
    print(f"[ZEUS AI] Using advanced research model")
    print(f"[ZEUS AI] Project context: {len(project_context)} chars")

    response = await _query_claude(
        prompt=prompt,
        system_prompt=system_prompt,
        model="claude-opus-4-5-20251101",  # Use most capable model
        max_tokens=24000,  # Increased for detailed profiles with enhanced requirements
        temperature=0.2  # Low temp for factual accuracy
    )

    if not response:
        print("[ZEUS AI] No response received")
        return []

    print(f"[ZEUS AI] Response received ({len(response)} chars)")
    print("[ZEUS AI] Parsing JSON profiles...")

    # Extract JSON array from response
    profiles = []

    try:
        # Try to find JSON code block
        json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response, re.IGNORECASE)
        if json_match:
            json_text = json_match.group(1)
        else:
            # Try to find raw JSON array
            json_match = re.search(r'(\[[\s\S]*\])', response)
            if json_match:
                json_text = json_match.group(1)
            else:
                print("[ZEUS AI] Could not find JSON array in response")
                return []

        # Parse the JSON
        parsed = json.loads(json_text)

        if not isinstance(parsed, list):
            print("[ZEUS AI] Response is not a JSON array")
            return []

        print(f"[ZEUS AI] Parsed {len(parsed)} supplier profiles")

        # Validate and enhance each profile with STRICT quality checks
        rejected_count = 0
        for i, profile in enumerate(parsed):
            if not isinstance(profile, dict):
                print(f"[Validation] ✗ Rejected profile {i+1}: not a dictionary")
                rejected_count += 1
                continue

            company_name = profile.get("company_name", "")

            # STRICT VALIDATION - Reject low-quality profiles
            validation_errors = []

            # 1. Company name validation
            if not company_name or len(company_name) < 3:
                validation_errors.append("missing or invalid company_name")
            elif any(bad in company_name.lower() for bad in ['company 1', 'supplier 1', 'abc company', 'example', 'placeholder']):
                validation_errors.append("generic/placeholder company name")

            # 2. Website validation - CRITICAL
            website = profile.get("contact", {}).get("website", "")
            if not website or website == "not_available" or "example.com" in website:
                validation_errors.append("missing or invalid website")

            # 3. City validation - must be real
            city = profile.get("location", {}).get("city", "")
            if not city or city == "not_available":
                validation_errors.append("missing city")
            elif any(bad in city.lower() for bad in ['various', 'not specified', 'n/a', 'unknown', 'multiple']):
                validation_errors.append(f"invalid city name: '{city}'")

            # 4. Category-specific validation for pipeline manufacturers
            if category == "pipeline_manufacturer":
                # Check if company is actually a service provider (should be excluded)
                excluded_names = ['turner industries', 'technipfmc', 'allied tube & conduit', 'allied tube and conduit']
                if any(excl in company_name.lower() for excl in excluded_names):
                    validation_errors.append(f"wrong category - '{company_name}' is not a pipeline manufacturer")

                # Must have pipeline diameter support data
                diameters = profile.get("capabilities", {}).get("pipeline_diameters_supported", {})
                if isinstance(diameters, dict):
                    min_dia = diameters.get("min_inches")
                    max_dia = diameters.get("max_inches")
                    if min_dia == "not_available" or max_dia == "not_available":
                        validation_errors.append("missing pipeline diameter specifications")

            # 5. Certifications - should have at least one real certification
            certs = profile.get("capabilities", {}).get("certifications", [])
            if isinstance(certs, list):
                real_certs = [c for c in certs if c and c != "not_available" and len(c) > 3]
                if not real_certs:
                    validation_errors.append("no valid certifications found")

            # 6. Match score validation
            match_score = profile.get("compatibility", {}).get("match_score")
            if match_score and match_score != "not_available":
                if not isinstance(match_score, (int, float)):
                    validation_errors.append(f"invalid match_score type: {type(match_score)}")
                elif match_score < 0 or match_score > 100:
                    validation_errors.append(f"match_score out of range: {match_score}")

            # If profile has critical validation errors, reject it
            if validation_errors:
                print(f"[Validation] ✗ Rejected '{company_name}': {', '.join(validation_errors)}")
                rejected_count += 1
                continue

            print(f"[Validation] ✓ Accepted '{company_name}'")

            # Generate globally unique supplier_id using existing IDs
            # This ensures no duplicate IDs across all categories
            all_existing = list(existing_ids or [])
            # Also include IDs we've assigned in this batch
            all_existing.extend([p.get("supplier_id", "") for p in profiles if p.get("supplier_id")])
            profile["supplier_id"] = _generate_supplier_id(iso3, datetime.utcnow().year, all_existing)

            # Ensure category is correct
            profile["category"] = category

            # Ensure location has required fields
            if "location" not in profile:
                profile["location"] = {}
            profile["location"]["country"] = country
            profile["location"]["iso3"] = iso3

            # ALWAYS re-geocode using Nominatim for accuracy validation
            # Don't trust Claude's coordinates - verify with OpenStreetMap
            company_name = profile.get("company_name", "")
            address = profile.get("location", {}).get("address", "")
            city = profile.get("location", {}).get("city", "")

            print(f"[Validation] Verifying address for: {company_name}")
            print(f"[Validation] Claude provided address: {address}, {city}")

            # Try full address geocoding with Nominatim (ground truth validation)
            coords = await _geocode_full_address_nominatim(
                company_name=company_name,
                address=address,
                city=city,
                country=country
            )

            # If Nominatim finds coordinates, use them (OSM data is authoritative)
            if coords:
                profile["location"]["coordinates"] = coords
                print(f"[Validation] ✓ Nominatim verified coordinates: {coords['latitude']:.4f}, {coords['longitude']:.4f}")
            else:
                # Fall back to simple city geocoding if Nominatim can't find the address
                profile["location"]["coordinates"] = _geocode_city(city, country)
                print(f"[Validation] ⚠ Nominatim couldn't verify - using city center for {city}")

            # Ensure contact exists
            if "contact" not in profile:
                profile["contact"] = {}
            if not profile["contact"].get("primary_email"):
                profile["contact"]["primary_email"] = "not_available"

            # Ensure metadata exists and is correct
            if "metadata" not in profile:
                profile["metadata"] = {}
            profile["metadata"]["source"] = "claude_comprehensive_research"
            profile["metadata"]["date_researched"] = datetime.utcnow().isoformat() + "Z"

            # Set confidence level if not set
            if not profile["metadata"].get("confidence_level"):
                # High confidence if we have website and email
                has_website = bool(profile.get("contact", {}).get("website"))
                has_email = profile.get("contact", {}).get("primary_email", "").lower() != "not_available"
                profile["metadata"]["confidence_level"] = "high" if (has_website and has_email) else "medium"

            profiles.append(profile)

        # Validation summary
        print(f"\n{'='*60}")
        print(f"VALIDATION SUMMARY")
        print(f"{'='*60}")
        print(f"Parsed from Claude: {len(parsed)} profiles")
        print(f"Rejected (quality):  {rejected_count} profiles")
        print(f"Accepted (valid):    {len(profiles)} profiles")
        print(f"{'='*60}\n")

        if rejected_count > 0:
            print(f"⚠ Warning: {rejected_count} suppliers rejected due to quality issues")
            print(f"  This may indicate ZEUS AI needs better instructions or the category is poorly defined")

        return profiles

    except json.JSONDecodeError as e:
        print(f"[ZEUS AI] JSON parse error: {e}")
        print(f"[ZEUS AI] Response preview: {response[:500]}")
        return []
    except Exception as e:
        print(f"[ZEUS AI] Unexpected error: {e}")
        return []


@router.get("/projects/{project_name}/suppliers", response_model=SuppliersResponse)
async def list_project_suppliers(project_name: str, category: Optional[str] = None):
    """
    List all suppliers for a project.
    
    Returns supplier profiles from docs/suppliers/ directory.
    Optionally filter by category.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
    suppliers = _load_all_suppliers(project_path, category)
    
    return SuppliersResponse(
        project=project_name,
        total_suppliers=len(suppliers),
        suppliers=suppliers
    )


@router.get("/projects/{project_name}/suppliers/{supplier_id}")
async def get_supplier(project_name: str, supplier_id: str):
    """
    Get a specific supplier profile by ID.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
    suppliers = _load_all_suppliers(project_path)
    
    for supplier in suppliers:
        if supplier.get("supplier_id") == supplier_id:
            return supplier
    
    raise HTTPException(status_code=404, detail=f"Supplier '{supplier_id}' not found")


@router.post("/suppliers/search", response_model=SupplierSearchResponse)
async def search_suppliers(request: SupplierSearchRequest):
    """
    Search for suppliers using ZEUS AI Agent powered by Perplexity.
    
    Simplified approach: Send a single query to Perplexity asking for output
    in the exact supplier profile JSON format.
    """
    project_path = resolve_project_path(request.project)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{request.project}' not found")
    
    if request.category not in SUPPLIER_CATEGORIES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid category. Must be one of: {', '.join(SUPPLIER_CATEGORIES)}"
        )
    
    # Ensure suppliers directory exists
    suppliers_dir = _ensure_suppliers_directory(project_path)
    
    # Load project metadata
    metadata_path = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_path) if metadata_path.exists() else {}
    
    # Load pipeline specs
    specs_path = project_path / "pipeline_specs.json"
    specs = load_json_file(specs_path) if specs_path.exists() else {}
    
    # Load AOI info
    aoi_path = project_path / "aoi" / "project_aoi.json"
    aoi = load_json_file(aoi_path) if aoi_path.exists() else {}
    
    country = metadata.get("country", "Unknown")
    iso3 = metadata.get("iso3", "UNK")
    
    # Load existing suppliers for this category
    all_suppliers = _load_all_suppliers(project_path, request.category)
    
    # Apply limit
    limit = min(request.limit or 10, 25 if request.expanded else 10)
    
    category_label = request.category.replace('_', ' ')
    
    # If we need more suppliers, query Perplexity
    new_suppliers_found = 0
    if len(all_suppliers) < limit:
        # Build supplier profiles using the new approach
        new_profiles = await _search_suppliers_with_json_format(
            category=request.category,
            country=country,
            iso3=iso3,
            limit=limit - len(all_suppliers),
            specs=specs,
            aoi=aoi
        )
        
        if new_profiles:
            existing_names = {s.get("company_name", "").lower() for s in all_suppliers}
            
            for profile in new_profiles:
                if profile.get("company_name", "").lower() not in existing_names:
                    # Save the profile
                    category_dir = CATEGORY_TO_DIR.get(request.category, request.category)
                    supplier_file = suppliers_dir / category_dir / f"{profile['supplier_id']}.json"
                    
                    try:
                        with open(supplier_file, 'w') as f:
                            json.dump(profile, f, indent=2)
                        
                        all_suppliers.append(profile)
                        existing_names.add(profile["company_name"].lower())
                        new_suppliers_found += 1
                        print(f"[SupplierSearch] Saved: {profile['company_name']}")
                    except Exception as e:
                        print(f"[SupplierSearch] Error saving: {e}")
            
            if new_suppliers_found > 0:
                _update_supplier_index(project_path)
    
    # Apply limit to results
    limited_suppliers = all_suppliers[:limit]
    has_more = len(all_suppliers) > limit
    
    # Build response message
    if len(all_suppliers) > 0:
        message = f"Found {len(all_suppliers)} {category_label} supplier(s) in {country}."
        if new_suppliers_found > 0:
            message = f"Discovered {new_suppliers_found} new supplier(s). Total: {len(all_suppliers)} {category_label} supplier(s) in {country}."
    else:
        creds = _load_perplexity_credentials()
        if creds:
            message = f"No {category_label} suppliers found for {country}."
        else:
            message = f"Perplexity API credentials not configured."
    
    return SupplierSearchResponse(
        status="success",
        suppliers_found=len(all_suppliers),
        profiles_generated=len(limited_suppliers),
        message=message,
        suppliers=limited_suppliers,
        has_more=has_more and not request.expanded
    )


@router.post("/suppliers/comprehensive-research", response_model=SupplierSearchResponse)
async def comprehensive_supplier_research(request: SupplierSearchRequest):
    """
    **COMPREHENSIVE SUPPLIER RESEARCH** using ZEUS AI Agent.

    This endpoint performs deep, multi-source research for projects of national importance.
    Unlike the basic search, this uses ZEUS AI's advanced reasoning to:

    - Research across multiple authoritative sources (company websites, LinkedIn, industry directories)
    - Verify all information from independent sources
    - Match suppliers precisely to project specifications (from pipeline_specs.json)
    - Consider project context (from project_aoi.json)
    - Generate complete, accurate profiles with high confidence

    **Use this for critical projects where data accuracy is paramount.**
    """
    project_path = resolve_project_path(request.project)

    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{request.project}' not found")

    if request.category not in SUPPLIER_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(SUPPLIER_CATEGORIES)}"
        )

    # Check Claude API availability
    creds = _load_claude_credentials()
    if not creds or "api_key" not in creds:
        raise HTTPException(
            status_code=503,
            detail="Claude API credentials not configured. Please set up ~/.claude_credentials with your API key."
        )

    # Ensure suppliers directory exists
    suppliers_dir = _ensure_suppliers_directory(project_path)

    # Load project metadata
    metadata_path = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_path) if metadata_path.exists() else {}

    # Load pipeline specs
    specs_path = project_path / "pipeline_specs.json"
    specs = load_json_file(specs_path) if specs_path.exists() else {}

    # Load AOI info
    aoi_path = project_path / "aoi" / "project_aoi.json"
    aoi = load_json_file(aoi_path) if aoi_path.exists() else {}

    country = metadata.get("country", "Unknown")
    iso3 = metadata.get("iso3", "UNK")

    # Load existing suppliers for this category
    all_suppliers = _load_all_suppliers(project_path, request.category)

    # Load ALL existing supplier IDs (from all categories) for global uniqueness
    all_project_suppliers = _load_all_suppliers(project_path, category=None)
    existing_global_ids = [s.get("supplier_id", "") for s in all_project_suppliers if s.get("supplier_id")]

    # Apply limit
    limit = min(request.limit or 10, 20)  # Max 20 for comprehensive research (takes longer)

    category_label = request.category.replace('_', ' ')

    # Perform comprehensive research
    new_suppliers_found = 0
    if len(all_suppliers) < limit:
        needed = limit - len(all_suppliers)

        print(f"\n{'='*60}")
        print(f"COMPREHENSIVE SUPPLIER RESEARCH - ZEUS AI Agent")
        print(f"{'='*60}")
        print(f"Project: {request.project}")
        print(f"Category: {category_label}")
        print(f"Country: {country}")
        print(f"Needed: {needed} suppliers")
        print(f"Existing global IDs: {len(existing_global_ids)}")
        print(f"{'='*60}\n")

        # Use Claude for comprehensive research
        new_profiles = await _comprehensive_supplier_research_claude(
            category=request.category,
            country=country,
            iso3=iso3,
            limit=needed,
            specs=specs,
            aoi=aoi,
            metadata=metadata,
            existing_ids=existing_global_ids
        )

        if new_profiles:
            existing_names = {s.get("company_name", "").lower() for s in all_suppliers}

            for profile in new_profiles:
                if profile.get("company_name", "").lower() not in existing_names:
                    # Save the profile
                    category_dir = CATEGORY_TO_DIR.get(request.category, request.category)
                    supplier_file = suppliers_dir / category_dir / f"{profile['supplier_id']}.json"

                    try:
                        with open(supplier_file, 'w', encoding='utf-8') as f:
                            json.dump(profile, f, indent=2, ensure_ascii=False)

                        all_suppliers.append(profile)
                        existing_names.add(profile["company_name"].lower())
                        new_suppliers_found += 1

                        print(f"✓ Saved: {profile['company_name']} ({profile.get('location', {}).get('city', 'Unknown')})")
                        print(f"  Confidence: {profile.get('metadata', {}).get('confidence_level', 'unknown')}")
                        print(f"  Match Score: {profile.get('compatibility', {}).get('match_score', 'N/A')}%")
                    except Exception as e:
                        print(f"✗ Error saving {profile.get('company_name')}: {e}")

            if new_suppliers_found > 0:
                _update_supplier_index(project_path)
                print(f"\n✓ Successfully added {new_suppliers_found} verified suppliers")
                print(f"✓ Updated supplier index\n")

    # Apply limit to results
    limited_suppliers = all_suppliers[:limit]
    has_more = len(all_suppliers) > limit

    # Build response message
    if len(all_suppliers) > 0:
        if new_suppliers_found > 0:
            message = f"✓ Comprehensive research complete: Found {new_suppliers_found} new verified supplier(s). Total: {len(all_suppliers)} {category_label} in {country}."
        else:
            message = f"Found {len(all_suppliers)} {category_label} supplier(s) in {country}. No new research needed."
    else:
        message = f"No {category_label} suppliers found for {country}. ZEUS AI may need more specific guidance."

    return SupplierSearchResponse(
        status="success",
        suppliers_found=len(all_suppliers),
        profiles_generated=len(limited_suppliers),
        message=message,
        suppliers=limited_suppliers,
        has_more=has_more
    )


async def _search_suppliers_with_json_format(
    category: str,
    country: str,
    iso3: str,
    limit: int,
    specs: Dict[str, Any],
    aoi: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Query Perplexity to find suppliers and return data in the exact JSON schema format.
    """
    # Load the example template
    template_path = Path("/opt/agrs/templates/supplier_profile_example.json")
    try:
        with open(template_path) as f:
            example_json = f.read()
    except:
        example_json = ""
    
    # Category descriptions
    category_descriptions = {
        "construction_supplies": "construction materials and supplies (steel, welding materials, coatings, cathodic protection systems)",
        "construction_services": "pipeline construction contractors and services (civil works, HDD drilling, welding, testing, installation)",
        "pipeline_manufacturer": "pipeline and pipe manufacturers (seamless/welded steel pipes, fittings, valves, flanges)",
        "equipment_manufacturer": "pipeline equipment manufacturers (compressors, meters, SCADA, pig launchers, pressure regulators)",
        "consultancy": "environmental and engineering consultancies (EIA, permitting, geotechnical surveys, engineering design)"
    }
    category_desc = category_descriptions.get(category, category.replace('_', ' '))
    
    # Build pipeline specs context
    specs_context = ""
    if specs:
        specs_parts = []
        if specs.get("outer_diameter"):
            specs_parts.append(f"Pipe outer diameter: {specs.get('outer_diameter')} inches")
        if specs.get("inner_diameter"):
            specs_parts.append(f"Pipe inner diameter: {specs.get('inner_diameter')} inches")
        if specs.get("material"):
            specs_parts.append(f"Material: {specs.get('material')}")
        if specs.get("pressure_class"):
            specs_parts.append(f"Pressure class: {specs.get('pressure_class')}")
        if specs.get("length_km"):
            specs_parts.append(f"Pipeline length: {specs.get('length_km')} km")
        if specs.get("coating"):
            specs_parts.append(f"Coating: {specs.get('coating')}")
        if specs_parts:
            specs_context = "PIPELINE SPECIFICATIONS:\n" + "\n".join(f"- {p}" for p in specs_parts)
    
    # Build AOI context
    aoi_context = ""
    if aoi:
        aoi_parts = []
        if aoi.get("country"):
            aoi_parts.append(f"Country: {aoi.get('country')}")
        if aoi.get("start_point"):
            sp = aoi.get("start_point", {})
            aoi_parts.append(f"Start point: {sp.get('name', 'N/A')} ({sp.get('coordinates', {})})")
        if aoi.get("end_point"):
            ep = aoi.get("end_point", {})
            aoi_parts.append(f"End point: {ep.get('name', 'N/A')} ({ep.get('coordinates', {})})")
        if aoi.get("total_length_km"):
            aoi_parts.append(f"Total length: {aoi.get('total_length_km')} km")
        if aoi_parts:
            aoi_context = "PROJECT AREA OF INTEREST:\n" + "\n".join(f"- {p}" for p in aoi_parts)
    
    # Build the query - emphasize JSON-only output
    query = f"""Find the top {limit} {category_desc} companies in {country}.

{specs_context}

{aoi_context}

OUTPUT REQUIREMENT: You MUST return ONLY valid JSON objects. No explanatory text, no markdown headers, no disclaimers.

For each company, return a JSON object in this EXACT format:

```json
{example_json}
```

CRITICAL RULES:
1. Return EXACTLY {limit} JSON objects
2. Each JSON object must be wrapped in ```json ... ``` code blocks
3. company_name MUST be the real registered company name (e.g., "Tenaris S.p.A.", "AECOM Italia S.r.l.")
4. location.city MUST be a real city name (e.g., "Milan", "Rome", "Turin")
5. contact.website MUST be the real company website URL
6. DO NOT include any explanatory text, headers, or commentary
7. DO NOT say "I cannot find" or "limitations" - just provide the data you find

Replace supplier_id with sequential IDs: SUP_{iso3}_2025_001, SUP_{iso3}_2025_002, etc.

START YOUR RESPONSE WITH ```json AND END WITH ``` - NO OTHER TEXT."""

    system_prompt = f"""You are a JSON data extraction specialist. You ONLY output valid JSON.

Your task: Find {limit} real {category_desc} companies in {country} and output their data as JSON.

For each company, research:
- Official company website
- LinkedIn company page  
- Industry directories (Kompass, Europages)

CRITICAL: Your response must contain ONLY JSON code blocks. No explanations, no disclaimers, no text.
If you cannot find specific data, use "not_available" as the value - do NOT explain why.

Example of CORRECT output format:
```json
{{"supplier_id": "SUP_{iso3}_2025_001", "company_name": "Example S.p.A.", ...}}
```

Example of WRONG output (DO NOT DO THIS):
"I found the following companies..." or "Note: Some data may be limited..."

ONLY OUTPUT JSON. START WITH ```json"""

    print(f"[SupplierSearch] Querying Perplexity for {limit} {category} suppliers in {country}...")
    
    response = await _query_perplexity(query, system_prompt=system_prompt, model="sonar-reasoning-pro")
    
    if not response:
        print("[SupplierSearch] No response from Perplexity")
        return []
    
    print(f"[SupplierSearch] Got response ({len(response)} chars), parsing JSON profiles...")
    
    # Parse the response to extract JSON objects
    profiles = _extract_json_profiles_from_response(response, category, country, iso3, limit)
    
    print(f"[SupplierSearch] Extracted {len(profiles)} valid profiles")
    return profiles


def _is_valid_company_name(name: str) -> bool:
    """
    Validate that a string is a plausible company name, not garbage from parsing.
    """
    if not name or len(name) < 3:
        return False
    
    # List of invalid patterns that indicate parsing errors
    invalid_patterns = [
        "limitation", "available data", "recommendation", "search result",
        "current data", "complete data", "data from", "note:", "important:",
        "disclaimer", "conclusion", "summary", "overview", "introduction",
        "section", "chapter", "appendix", "reference", "source", "citation",
        "methodology", "approach", "analysis", "finding", "result",
        "not available", "not found", "n/a", "unknown", "tbd", "pending",
        "example", "sample", "template", "placeholder", "test",
        "---", "***", "###", "===",
    ]
    
    name_lower = name.lower().strip()
    
    for pattern in invalid_patterns:
        if pattern in name_lower:
            return False
    
    # Must have at least one letter
    if not re.search(r'[a-zA-Z]', name):
        return False
    
    # Reject if it's just generic words
    generic_words = {"the", "a", "an", "and", "or", "for", "of", "in", "on", "at", "to", "from", "with", "by"}
    words = set(name_lower.split())
    if words.issubset(generic_words):
        return False
    
    # Reject if it starts with common non-company patterns
    bad_starts = ["based on", "according to", "as per", "per the", "from the", "in the", "the following"]
    for bad_start in bad_starts:
        if name_lower.startswith(bad_start):
            return False
    
    return True


def _extract_json_profiles_from_response(
    response: str,
    category: str,
    country: str,
    iso3: str,
    limit: int
) -> List[Dict[str, Any]]:
    """
    Extract JSON supplier profiles from Perplexity's response.
    Only accepts properly formatted JSON - no fallback to text parsing.
    """
    profiles = []
    
    # Try to find JSON blocks in the response
    # Method 1: Look for ```json blocks
    json_blocks = re.findall(r'```json\s*([\s\S]*?)\s*```', response, re.IGNORECASE)
    
    # Method 2: Look for ---SUPPLIER--- markers
    if not json_blocks:
        sections = response.split('---SUPPLIER---')
        for section in sections:
            # Look for complete JSON objects
            json_match = re.search(r'(\{[\s\S]*?"company_name"[\s\S]*?"metadata"[\s\S]*?\})\s*(?:$|---)', section)
            if json_match:
                json_blocks.append(json_match.group(1))
    
    # Method 3: Look for JSON objects with company_name field (more strict)
    if not json_blocks:
        # Find JSON objects that have both company_name and location (required fields)
        pattern = r'\{\s*"supplier_id"[^}]*"company_name"\s*:\s*"[^"]+(?:S\.p\.A\.|S\.r\.l\.|SpA|Srl|Ltd|Inc|GmbH|SA|SAS)[^}]*"location"[^}]*\}'
        potential_jsons = re.findall(pattern, response, re.DOTALL)
        json_blocks.extend(potential_jsons)
    
    print(f"[SupplierSearch] Found {len(json_blocks)} potential JSON blocks")
    
    # Try to parse each JSON block
    for i, block in enumerate(json_blocks):
        if len(profiles) >= limit:
            break
            
        try:
            # Clean up the JSON block
            block = block.strip()
            
            # Fix common JSON issues
            # Remove trailing commas before closing braces/brackets
            block = re.sub(r',\s*([}\]])', r'\1', block)
            
            # Try to parse it
            profile = json.loads(block)
            
            # Validate it has required fields
            company_name = profile.get("company_name", "")
            if not company_name:
                print(f"[SupplierSearch] Skipping block {i}: no company_name")
                continue
            
            # Validate company name is not garbage
            if not _is_valid_company_name(company_name):
                print(f"[SupplierSearch] Skipping invalid company name: {company_name}")
                continue

            # CRITICAL: Category-specific validation for pipeline manufacturers
            if category == "pipeline_manufacturer":
                # Exclude companies that are NOT pipeline manufacturers
                excluded_names = [
                    'turner industries',
                    'technipfmc',
                    'allied tube & conduit',
                    'allied tube and conduit',
                    'kinder morgan',
                    'magellan midstream'
                ]
                company_lower = company_name.lower()
                if any(excl in company_lower for excl in excluded_names):
                    print(f"[SupplierSearch] ✗ Rejected '{company_name}': wrong category - not a pipeline manufacturer")
                    continue

            # Must have location with city
            if not profile.get("location", {}).get("city"):
                print(f"[SupplierSearch] Skipping {company_name}: no city")
                continue
            
            # Ensure supplier_id is set correctly
            profile["supplier_id"] = f"SUP_{iso3}_{datetime.utcnow().year}_{str(len(profiles) + 1).zfill(3)}"
            
            # Ensure category is correct
            profile["category"] = category
            
            # Ensure location has country
            if "location" not in profile:
                profile["location"] = {}
            profile["location"]["country"] = country
            profile["location"]["iso3"] = iso3
            
            # Ensure coordinates exist
            if "coordinates" not in profile.get("location", {}):
                profile["location"]["coordinates"] = _get_default_coordinates(
                    profile.get("location", {}).get("city", ""),
                    country
                )
            
            # Ensure contact exists
            if "contact" not in profile:
                profile["contact"] = {"primary_email": "not_available"}
            
            # Ensure metadata exists
            if "metadata" not in profile:
                profile["metadata"] = {}
            profile["metadata"]["source"] = "perplexity_research"
            profile["metadata"]["date_researched"] = datetime.utcnow().isoformat() + "Z"
            profile["metadata"]["confidence_level"] = "high" if profile.get("contact", {}).get("website") else "medium"
            
            profiles.append(profile)
            print(f"[SupplierSearch] ✓ Valid profile: {company_name}")
            
        except json.JSONDecodeError as e:
            print(f"[SupplierSearch] JSON parse error in block {i}: {e}")
            continue  # Don't fall back to text parsing - it produces garbage
    
    # NO FALLBACK to text parsing - it produces garbage results
    if not profiles:
        print("[SupplierSearch] WARNING: No valid JSON profiles found in response")
        print("[SupplierSearch] Response preview:", response[:500] if response else "empty")
    
    return profiles


def _parse_suppliers_from_text_response(
    response: str,
    category: str,
    country: str,
    iso3: str,
    limit: int
) -> List[Dict[str, Any]]:
    """
    Parse supplier information from unstructured text response.
    """
    profiles = []
    
    # Split by common separators
    sections = re.split(r'\n(?=\d+\.\s+\*?\*?[A-Z])|(?=##\s+)|(?=\*\*\d+\.)', response)
    
    for i, section in enumerate(sections):
        if len(profiles) >= limit:
            break
            
        if len(section.strip()) < 50:
            continue
            
        profile = _parse_supplier_from_text(section, category, country, iso3, i + 1)
        
        if profile and profile.get("company_name"):
            # Check for duplicates
            existing_names = {p.get("company_name", "").lower() for p in profiles}
            if profile["company_name"].lower() not in existing_names:
                profiles.append(profile)
    
    return profiles


def _get_default_coordinates(city: str, country: str) -> Dict[str, float]:
    """Get coordinates for a city, falling back to country capital."""
    city_lower = city.lower().strip() if city else ""
    
    # Check city coordinates
    if city_lower and city_lower in CITY_COORDINATES:
        return CITY_COORDINATES[city_lower]
    
    # Check country capital
    country_lower = country.lower().strip()
    if country_lower in COUNTRY_CAPITALS:
        return COUNTRY_CAPITALS[country_lower]
    
    # Default to Rome for Italy, or 0,0 for unknown
    if "ital" in country_lower:
        return {"latitude": 41.9028, "longitude": 12.4964}
    
    return {"latitude": 0.0, "longitude": 0.0}


@router.post("/projects/{project_name}/suppliers")
async def add_supplier(project_name: str, supplier: SupplierProfile):
    """
    Add a new supplier profile to a project.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
    # Ensure directory exists
    suppliers_dir = _ensure_suppliers_directory(project_path)
    
    # Determine category directory
    category_dir = CATEGORY_TO_DIR.get(supplier.category)
    if not category_dir:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(SUPPLIER_CATEGORIES)}"
        )
    
    # Save supplier profile
    supplier_file = suppliers_dir / category_dir / f"{supplier.supplier_id}.json"
    with open(supplier_file, "w", encoding="utf-8") as f:
        json.dump(supplier.dict(), f, indent=2)
    
    # Update index
    _update_supplier_index(project_path)
    
    return supplier.dict()


def _update_supplier_index(project_path: Path) -> None:
    """Update the supplier index file."""
    suppliers = _load_all_suppliers(project_path)
    
    # Count by category
    category_counts: Dict[str, int] = {}
    entries: List[Dict[str, Any]] = []
    
    for supplier in suppliers:
        category = supplier.get("category", "unknown")
        category_counts[category] = category_counts.get(category, 0) + 1
        
        # Get category directory name
        category_dir = CATEGORY_TO_DIR.get(category, category)
        
        entries.append({
            "supplier_id": supplier.get("supplier_id"),
            "company_name": supplier.get("company_name"),
            "category": category,
            "file": f"{category_dir}/{supplier.get('supplier_id')}.json",
            "coordinates": supplier.get("location", {}).get("coordinates", {})
        })
    
    # Load project metadata for project_id
    metadata_path = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_path) if metadata_path.exists() else {}
    
    index_data = {
        "project_id": metadata.get("project_id"),
        "last_updated": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "total_suppliers": len(suppliers),
        "suppliers_by_category": category_counts,
        "suppliers": entries
    }
    
    _save_supplier_index(project_path, index_data)


@router.delete("/projects/{project_name}/suppliers/{supplier_id}")
async def delete_supplier(project_name: str, supplier_id: str):
    """
    Delete a supplier profile from a project.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
    suppliers_dir = project_path / "docs" / "suppliers"
    
    # Search for the supplier file
    for category_dir in CATEGORY_TO_DIR.values():
        supplier_file = suppliers_dir / category_dir / f"{supplier_id}.json"
        if supplier_file.exists():
            supplier_file.unlink()
            _update_supplier_index(project_path)
            return {"status": "deleted", "supplier_id": supplier_id}
    
    raise HTTPException(status_code=404, detail=f"Supplier '{supplier_id}' not found")


# ============================================================================
# Streaming Supplier Search with Real-Time Logs
# ============================================================================

# REMOVED: Perplexity-based search-stream endpoint
# Use /suppliers/comprehensive-research (ZEUS AI Agent) instead
# @router.post("/suppliers/search-stream")
# async def search_suppliers_stream(request: SupplierSearchRequest):
#     """
#     Start a supplier search job and return a stream of progress updates.
#     Uses Server-Sent Events (SSE) for real-time log streaming.
#     """
#     job_id = str(uuid.uuid4())
#     
#     # Initialize job
#     _supplier_jobs[job_id] = {
#         "job_id": job_id,
#         "status": "pending",
#         "progress": 0,
#         "current_phase": "initializing",
#         "logs": [],
#         "result": None,
#         "error": None,
#         "request": request.dict()
#     }
#     
#     async def generate_events():
#         """Generator for SSE events"""
#         try:
#             # Run the search in the background
#             asyncio.create_task(_run_supplier_search_job(job_id))
#             
#             # Stream updates until complete
#             last_log_count = 0
#             while True:
#                 job = _supplier_jobs.get(job_id)
#                 if not job:
#                     break
#                 
#                 # Send update if there are new logs or status change
#                 current_log_count = len(job.get("logs", []))
#                 if current_log_count > last_log_count or job["status"] in ["succeeded", "failed"]:
#                     last_log_count = current_log_count
#                     yield f"data: {json.dumps(job)}\n\n"
#                 
#                 if job["status"] in ["succeeded", "failed"]:
#                     break
#                 
#                 await asyncio.sleep(0.5)
#             
#             # Clean up job after a delay
#             await asyncio.sleep(30)
#             _supplier_jobs.pop(job_id, None)
#             
#         except Exception as e:
#             error_msg = str(e)
#             if job_id in _supplier_jobs:
#                 _supplier_jobs[job_id]["status"] = "failed"
#                 _supplier_jobs[job_id]["error"] = error_msg
#                 _add_job_log(job_id, f"ERROR: {error_msg}")
#             yield f"data: {json.dumps({'error': error_msg})}\n\n"
#     
#     return StreamingResponse(
#         generate_events(),
#         media_type="text/event-stream",
#         headers={
#             "Cache-Control": "no-cache",
#             "Connection": "keep-alive",
#             "X-Accel-Buffering": "no"
#         }
#     )
# 
# 
# async def _run_supplier_search_job(job_id: str):
#     """Execute the supplier search job with logging - simplified JSON format approach"""
#     job = _supplier_jobs.get(job_id)
#     if not job:
#         return
#     
#     request_data = job["request"]
#     
#     try:
#         _supplier_jobs[job_id]["status"] = "running"
#         _add_job_log(job_id, "ZEUS AI Agent initialized")
#         _update_job_progress(job_id, 5, "loading_project")
#         
#         # Get request parameters
#         project = request_data["project"]
#         category = request_data["category"]
#         limit = min(request_data.get("limit", 10), 25)
#         
#         category_label = category.replace('_', ' ')
#         
#         _add_job_log(job_id, f"Loading project: {project}")
#         
#         # Resolve project path
#         project_path = resolve_project_path(project)
#         if not project_path or not project_path.exists():
#             raise Exception(f"Project '{project}' not found")
#         
#         _add_job_log(job_id, "Reading pipeline_specs.json...")
#         _update_job_progress(job_id, 10, "reading_specs")
#         
#         # Load project data
#         specs_path = project_path / "pipeline_specs.json"
#         specs = load_json_file(specs_path) if specs_path.exists() else {}
#         
#         _add_job_log(job_id, "Reading project_aoi.json...")
#         aoi_path = project_path / "aoi" / "project_aoi.json"
#         aoi = load_json_file(aoi_path) if aoi_path.exists() else {}
#         
#         _add_job_log(job_id, "Loading project metadata...")
#         metadata_path = project_path / "project_metadata.json"
#         metadata = load_json_file(metadata_path) if metadata_path.exists() else {}
#         
#         country = metadata.get("country", "Unknown")
#         iso3 = metadata.get("iso3", "UNK")
#         
#         _add_job_log(job_id, f"Project country: {country}")
#         _update_job_progress(job_id, 15, "checking_credentials")
#         
#         # Check Perplexity credentials
#         creds = _load_perplexity_credentials()
#         if not creds or "api_key" not in creds:
#             raise Exception("Perplexity API credentials not configured")
#         
#         _add_job_log(job_id, "Perplexity API credentials verified")
#         _update_job_progress(job_id, 20, "preparing_search")
#         
#         # Ensure suppliers directory
#         suppliers_dir = _ensure_suppliers_directory(project_path)
#         
#         # Load existing suppliers
#         all_suppliers = _load_all_suppliers(project_path, category)
#         _add_job_log(job_id, f"Found {len(all_suppliers)} existing {category_label} suppliers")
#         
#         # Build specs context
#         specs_summary = []
#         if specs.get("outer_diameter"):
#             specs_summary.append(f"Pipe diameter: {specs.get('outer_diameter')}\"")
#         if specs.get("material"):
#             specs_summary.append(f"Material: {specs.get('material')}")
#         if specs.get("length_km"):
#             specs_summary.append(f"Length: {specs.get('length_km')} km")
#         
#         if specs_summary:
#             _add_job_log(job_id, f"Pipeline specs: {', '.join(specs_summary)}")
#         
#         new_suppliers_found = 0
#         
#         if len(all_suppliers) < limit:
#             needed = limit - len(all_suppliers)
#             
#             _update_job_progress(job_id, 25, "querying_perplexity")
#             _add_job_log(job_id, "")
#             _add_job_log(job_id, "═══════════════════════════════════════")
#             _add_job_log(job_id, "QUERYING PERPLEXITY DEEP RESEARCH")
#             _add_job_log(job_id, "═══════════════════════════════════════")
#             _add_job_log(job_id, f"Searching for top {needed} {category_label} in {country}...")
#             _add_job_log(job_id, "Using supplier_profile_schema.json format...")
#             
#             # Load the example template
#             template_path = Path("/opt/agrs/templates/supplier_profile_example.json")
#             try:
#                 with open(template_path) as f:
#                     example_json = f.read()
#                 _add_job_log(job_id, "Loaded supplier profile template")
#             except:
#                 example_json = ""
#                 _add_job_log(job_id, "WARNING: Could not load template")
#             
#             # Category descriptions
#             category_descriptions = {
#                 "construction_supplies": "construction materials and supplies (steel, welding, coatings)",
#                 "construction_services": "pipeline construction contractors (civil works, HDD, welding)",
#                 "pipeline_manufacturer": "pipeline manufacturers (seamless/welded pipes, fittings, valves)",
#                 "equipment_manufacturer": "pipeline equipment manufacturers (compressors, meters, SCADA)",
#                 "consultancy": "environmental and engineering consultancies (EIA, permitting, design)"
#             }
#             category_desc = category_descriptions.get(category, category_label)
#             
#             # Build specs context for query
#             specs_context = ""
#             if specs:
#                 specs_parts = []
#                 if specs.get("outer_diameter"):
#                     specs_parts.append(f"Pipe outer diameter: {specs.get('outer_diameter')} inches")
#                 if specs.get("material"):
#                     specs_parts.append(f"Material: {specs.get('material')}")
#                 if specs.get("pressure_class"):
#                     specs_parts.append(f"Pressure class: {specs.get('pressure_class')}")
#                 if specs.get("length_km"):
#                     specs_parts.append(f"Pipeline length: {specs.get('length_km')} km")
#                 if specs_parts:
#                     specs_context = "PIPELINE SPECIFICATIONS:\n" + "\n".join(f"- {p}" for p in specs_parts)
#             
#             # Build AOI context
#             aoi_context = ""
#             if aoi:
#                 aoi_parts = []
#                 if aoi.get("country"):
#                     aoi_parts.append(f"Country: {aoi.get('country')}")
#                 if aoi.get("start_point"):
#                     sp = aoi.get("start_point", {})
#                     aoi_parts.append(f"Start: {sp.get('name', 'N/A')}")
#                 if aoi.get("end_point"):
#                     ep = aoi.get("end_point", {})
#                     aoi_parts.append(f"End: {ep.get('name', 'N/A')}")
#                 if aoi_parts:
#                     aoi_context = "PROJECT AREA:\n" + "\n".join(f"- {p}" for p in aoi_parts)
#             
#             # Build the query
#             query = f"""Find the top {needed} {category_desc} companies in {country}.
# 
# {specs_context}
# 
# {aoi_context}
# 
# OUTPUT REQUIREMENT: You MUST return ONLY valid JSON objects.
# 
# For each company, return a JSON object in this EXACT format:
# 
# ```json
# {example_json}
# ```
# 
# CRITICAL RULES:
# 1. Return EXACTLY {needed} JSON objects
# 2. Each JSON object must be wrapped in ```json ... ``` code blocks
# 3. company_name MUST be the real registered company name
# 4. location.city MUST be a real city name
# 5. contact.website MUST be the real company website URL
# 
# Replace supplier_id with sequential IDs: SUP_{iso3}_2025_001, SUP_{iso3}_2025_002, etc.
# 
# START YOUR RESPONSE WITH ```json AND END WITH ``` - NO OTHER TEXT."""
# 
#             system_prompt = f"""You are a JSON data extraction specialist. You ONLY output valid JSON.
# 
# Your task: Find {needed} real {category_desc} companies in {country} and output their data as JSON.
# 
# CRITICAL: Your response must contain ONLY JSON code blocks. No explanations, no disclaimers, no text.
# If you cannot find specific data, use "not_available" as the value.
# 
# ONLY OUTPUT JSON. START WITH ```json"""
# 
#             _add_job_log(job_id, "Sending query to Perplexity sonar-reasoning-pro...")
#             _update_job_progress(job_id, 35, "waiting_response")
#             
#             response = await _query_perplexity(query, system_prompt=system_prompt, model="sonar-reasoning-pro")
#             
#             if response:
#                 _add_job_log(job_id, f"Response received ({len(response)} chars)")
#                 _update_job_progress(job_id, 70, "parsing_json")
#                 
#                 _add_job_log(job_id, "")
#                 _add_job_log(job_id, "═══════════════════════════════════════")
#                 _add_job_log(job_id, "PARSING SUPPLIER PROFILES")
#                 _add_job_log(job_id, "═══════════════════════════════════════")
#                 
#                 # Extract JSON profiles
#                 profiles = _extract_json_profiles_from_response(response, category, country, iso3, needed)
#                 
#                 _add_job_log(job_id, f"Extracted {len(profiles)} valid profiles")
#                 
#                 existing_names = {s.get("company_name", "").lower() for s in all_suppliers}
#                 
#                 for profile in profiles:
#                     if profile.get("company_name", "").lower() in existing_names:
#                         _add_job_log(job_id, f"Skipping duplicate: {profile.get('company_name')}")
#                         continue
#                     
#                     # Save profile
#                     category_dir = CATEGORY_TO_DIR.get(category, category)
#                     supplier_file = suppliers_dir / category_dir / f"{profile['supplier_id']}.json"
#                     
#                     try:
#                         with open(supplier_file, "w", encoding="utf-8") as f:
#                             json.dump(profile, f, indent=2)
#                         
#                         all_suppliers.append(profile)
#                         existing_names.add(profile["company_name"].lower())
#                         new_suppliers_found += 1
#                         
#                         city = profile.get("location", {}).get("city", "Unknown")
#                         _add_job_log(job_id, f"✓ Saved: {profile['company_name']} ({city})")
#                     except Exception as e:
#                         _add_job_log(job_id, f"ERROR saving {profile.get('company_name')}: {e}")
#                 
#                 if new_suppliers_found > 0:
#                     _add_job_log(job_id, "Updating supplier index...")
#                     _update_supplier_index(project_path)
#             else:
#                 _add_job_log(job_id, "ERROR: No response from Perplexity")
#         
#         # Complete
#         _update_job_progress(job_id, 100, "complete")
#         _add_job_log(job_id, "")
#         _add_job_log(job_id, "═══════════════════════════════════════")
#         _add_job_log(job_id, "SEARCH COMPLETE")
#         _add_job_log(job_id, "═══════════════════════════════════════")
#         _add_job_log(job_id, f"New suppliers found: {new_suppliers_found}")
#         _add_job_log(job_id, f"Total {category_label} suppliers: {len(all_suppliers)}")
#         
#         # Prepare result
#         limited_suppliers = all_suppliers[:limit]
#         has_more = len(all_suppliers) > limit
#         
#         _supplier_jobs[job_id]["status"] = "succeeded"
#         _supplier_jobs[job_id]["result"] = {
#             "status": "success",
#             "suppliers_found": len(all_suppliers),
#             "profiles_generated": len(limited_suppliers),
#             "new_suppliers": new_suppliers_found,
#             "message": f"Found {new_suppliers_found} new supplier(s). Total: {len(all_suppliers)} {category_label} supplier(s) in {country}.",
#             "suppliers": limited_suppliers,
#             "has_more": has_more
#         }
#         
#     except Exception as e:
#         error_msg = str(e)
#         _add_job_log(job_id, f"ERROR: {error_msg}")
#         _supplier_jobs[job_id]["status"] = "failed"
#         _supplier_jobs[job_id]["error"] = error_msg
# 
# 
@router.get("/suppliers/jobs/{job_id}")
async def get_supplier_job(job_id: str):
    """Get the status of a supplier search job"""
    job = _supplier_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job


@router.get("/suppliers/jobs/{job_id}/stream")
async def stream_supplier_job(job_id: str):
    """Stream updates for a supplier search job (SSE)"""
    job = _supplier_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    
    async def generate_events():
        last_log_count = 0
        while True:
            job = _supplier_jobs.get(job_id)
            if not job:
                break
            
            current_log_count = len(job.get("logs", []))
            if current_log_count > last_log_count or job["status"] in ["succeeded", "failed"]:
                last_log_count = current_log_count
                yield f"data: {json.dumps(job)}\n\n"
            
            if job["status"] in ["succeeded", "failed"]:
                break
            
            await asyncio.sleep(0.3)
    
    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
