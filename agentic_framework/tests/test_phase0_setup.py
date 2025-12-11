"""Phase 0 Gate Tests - Project Setup"""
import pytest
import importlib
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import settings


class TestP0_01_EnvironmentConfiguration:
    """TEST P0-01: Environment Configuration Loads"""

    def test_settings_module_imports(self):
        """Settings module imports without error"""
        from config import settings as s
        assert s is not None

    def test_api_key_accessible(self):
        """API key setting is accessible"""
        api_key = settings.ANTHROPIC_API_KEY
        assert api_key is not None
        assert isinstance(api_key, str)

    def test_api_key_valid_format(self):
        """API key has valid format (length > 20)"""
        # Will pass once real key is added
        if settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY != "your_api_key_here":
            assert len(settings.ANTHROPIC_API_KEY) > 20

    def test_dev_mode_is_boolean(self):
        """DEV_MODE is a boolean type"""
        assert isinstance(settings.DEV_MODE, bool)

    def test_use_cached_responses_is_boolean(self):
        """USE_CACHED_RESPONSES is a boolean type"""
        assert isinstance(settings.USE_CACHED_RESPONSES, bool)

    def test_path_settings_accessible(self):
        """All path settings are accessible as strings"""
        assert isinstance(str(settings.DATA_DIR), str)
        assert isinstance(str(settings.ROUTES_DIR), str)
        assert isinstance(str(settings.LAYERS_DIR), str)
        assert isinstance(str(settings.PROMPTS_DIR), str)

    def test_model_settings_accessible(self):
        """Model settings are accessible"""
        assert isinstance(settings.ANTHROPIC_MODEL, str)
        assert len(settings.ANTHROPIC_MODEL) > 0
        assert isinstance(settings.ANTHROPIC_MODEL_MASTER, str)
        assert len(settings.ANTHROPIC_MODEL_MASTER) > 0

    def test_numeric_settings_valid(self):
        """Numeric settings are valid integers"""
        assert isinstance(settings.MAX_TOKENS, int)
        assert settings.MAX_TOKENS > 0
        assert isinstance(settings.API_TIMEOUT, int)
        assert settings.API_TIMEOUT > 0


class TestP0_02_AnthropicConnection:
    """TEST P0-02: Anthropic Client Connects Successfully"""

    @pytest.mark.skipif(
        not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY == "your_api_key_here",
        reason="Valid API key required"
    )
    def test_anthropic_client_instantiates(self):
        """Client instantiates without error"""
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        assert client is not None

    @pytest.mark.skipif(
        not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY == "your_api_key_here",
        reason="Valid API key required"
    )
    def test_simple_api_call_succeeds(self):
        """Simple API call succeeds and returns expected structure"""
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=50,
            messages=[{"role": "user", "content": "Say 'test successful'"}]
        )

        # Assert response has expected structure
        assert response is not None
        assert hasattr(response, 'content')
        assert len(response.content) > 0
        assert hasattr(response.content[0], 'text')


class TestP0_03_DirectoryStructure:
    """TEST P0-03: Directory Structure Exists"""

    def test_required_directories_exist(self):
        """All required directories were created"""
        required_dirs = [
            "api",
            "api/routes",
            "agents",
            "data",
            "data/routes",
            "data/layers",
            "prompts",
            "models",
            "tests",
            "config"
        ]

        base_dir = Path(__file__).parent.parent

        for dir_path in required_dirs:
            full_path = base_dir / dir_path
            assert full_path.exists(), f"Directory {dir_path} does not exist"
            assert full_path.is_dir(), f"{dir_path} exists but is not a directory"

    def test_python_packages_have_init(self):
        """Python packages have __init__.py files"""
        python_dirs = [
            "api",
            "api/routes",
            "agents",
            "data",
            "models",
            "tests",
            "config"
        ]

        base_dir = Path(__file__).parent.parent

        for dir_path in python_dirs:
            init_file = base_dir / dir_path / "__init__.py"
            assert init_file.exists(), f"{dir_path}/__init__.py does not exist"


class TestP0_04_DependenciesInstalled:
    """TEST P0-04: Dependencies Installed Correctly"""

    def test_required_packages_import(self):
        """All required packages are importable"""
        required_packages = [
            "anthropic",
            "fastapi",
            "uvicorn",
            "pydantic",
            "rasterio",
            "shapely",
            "geojson",
            "dotenv"
        ]

        for package in required_packages:
            try:
                if package == "dotenv":
                    importlib.import_module("dotenv")
                else:
                    importlib.import_module(package)
            except ImportError as e:
                pytest.fail(f"Failed to import {package}: {e}")

    def test_anthropic_version(self):
        """Anthropic version meets minimum requirement"""
        import anthropic
        version_str = anthropic.__version__
        major, minor = map(int, version_str.split('.')[:2])
        assert major > 0 or (major == 0 and minor >= 18), \
            f"Anthropic version {version_str} is below minimum 0.18.0"

    def test_fastapi_version(self):
        """FastAPI version meets minimum requirement"""
        import fastapi
        version_str = fastapi.__version__
        major, minor = map(int, version_str.split('.')[:2])
        assert major > 0 or (major == 0 and minor >= 100), \
            f"FastAPI version {version_str} is below minimum 0.100.0"

    def test_pydantic_version(self):
        """Pydantic version meets minimum requirement (2.0+)"""
        import pydantic
        version_str = pydantic.__version__
        major = int(version_str.split('.')[0])
        assert major >= 2, \
            f"Pydantic version {version_str} is below minimum 2.0.0"


# Regression suite tests (P0-R*)
class TestP0Regression:
    """Phase 0 Regression Suite"""

    def test_p0_r01_settings_importable(self):
        """P0-R01: Settings module imports without error"""
        from config import settings
        assert settings is not None

    def test_p0_r02_api_key_present(self):
        """P0-R02: API key environment variable exists"""
        assert settings.ANTHROPIC_API_KEY is not None
        assert isinstance(settings.ANTHROPIC_API_KEY, str)

    def test_p0_r03_directories_exist(self):
        """P0-R03: Required directories present"""
        base_dir = Path(__file__).parent.parent
        assert (base_dir / "api").exists()
        assert (base_dir / "agents").exists()
        assert (base_dir / "data").exists()
        assert (base_dir / "models").exists()
        assert (base_dir / "config").exists()

    def test_p0_r04_dependencies_import(self):
        """P0-R04: All packages importable"""
        import anthropic
        import fastapi
        import pydantic
        assert all([anthropic, fastapi, pydantic])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
