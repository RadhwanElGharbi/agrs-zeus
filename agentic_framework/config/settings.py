"""Configuration settings for the pipeline agent system."""
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    """Application settings loaded from environment variables."""

    # Anthropic API Configuration
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    ANTHROPIC_MODEL_MASTER: str = os.getenv("ANTHROPIC_MODEL_MASTER", "claude-sonnet-4-20250514")
    MAX_TOKENS: int = int(os.getenv("MAX_TOKENS", "1024"))
    API_TIMEOUT: int = int(os.getenv("API_TIMEOUT", "30"))

    # Development Mode
    DEV_MODE: bool = os.getenv("DEV_MODE", "False").lower() in ("true", "1", "yes")
    USE_CACHED_RESPONSES: bool = os.getenv("USE_CACHED_RESPONSES", "False").lower() in ("true", "1", "yes")

    # Data Paths
    DATA_DIR: Path = BASE_DIR / "data"
    # Routes are stored under the project's PIRL outputs folder
    ROUTES_DIR: Path = Path(os.getenv(
        "ROUTES_DIR",
        "/opt/agrs/Projects/test_project2/PIRL/outputs"
    ))
    LAYERS_DIR: Path = DATA_DIR / "layers"
    PROMPTS_DIR: Path = BASE_DIR / "prompts"
    CACHE_DIR: Path = BASE_DIR / ".cache"

    # SAIPEM Data Package Paths
    SAIPEM_DATA_DIR: Path = Path(os.getenv(
        "SAIPEM_DATA_DIR",
        "/home/duke/Documents/ARTEMIS/DATA/SAIPEM_AOI_Complete_Data_Package"
    ))
    SAIPEM_RASTERS_DIR: Path = SAIPEM_DATA_DIR / "rasters"
    SAIPEM_VECTORS_DIR: Path = SAIPEM_DATA_DIR / "vectors"

    # AI Routing criteria and specs
    AI_ROUTING_DIR: Path = Path(os.getenv(
        "AI_ROUTING_DIR",
        "/home/duke/Documents/ARTEMIS/DATA/DATA_x_AI_ROUTING"
    ))

    @classmethod
    def validate(cls) -> None:
        """Validate that required settings are present."""
        if not cls.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY must be set in environment or .env file")
        if len(cls.ANTHROPIC_API_KEY) < 20:
            raise ValueError("ANTHROPIC_API_KEY appears to be invalid (too short)")

    @classmethod
    def print_settings(cls) -> None:
        """Print current settings (masking sensitive data)."""
        print("=== Application Settings ===")
        print(f"DEV_MODE: {cls.DEV_MODE}")
        print(f"USE_CACHED_RESPONSES: {cls.USE_CACHED_RESPONSES}")
        print(f"ANTHROPIC_MODEL: {cls.ANTHROPIC_MODEL}")
        print(f"ANTHROPIC_MODEL_MASTER: {cls.ANTHROPIC_MODEL_MASTER}")
        print(f"MAX_TOKENS: {cls.MAX_TOKENS}")
        print(f"API_TIMEOUT: {cls.API_TIMEOUT}s")
        print(f"ANTHROPIC_API_KEY: {'*' * 20}...{cls.ANTHROPIC_API_KEY[-4:] if cls.ANTHROPIC_API_KEY else 'NOT SET'}")
        print(f"DATA_DIR: {cls.DATA_DIR}")
        print(f"ROUTES_DIR: {cls.ROUTES_DIR}")
        print(f"LAYERS_DIR: {cls.LAYERS_DIR}")
        print(f"PROMPTS_DIR: {cls.PROMPTS_DIR}")
        print("=" * 30)


# Global settings instance
settings = Settings()
