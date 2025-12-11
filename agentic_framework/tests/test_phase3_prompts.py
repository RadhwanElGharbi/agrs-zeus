"""Phase 3 Tests: Agent Prompts

Gate tests and regression suite for agent prompt files.
"""
import pytest
from pathlib import Path

# Get the prompts directory
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

# Required prompt files
REQUIRED_PROMPTS = [
    "geotechnical.txt",
    "environmental.txt",
    "engineering.txt",
    "cost.txt",
    "master.txt",
]


class TestP3_01_AllPromptFilesExist:
    """TEST P3-01: All Prompt Files Exist

    Purpose: Verify all required prompt files are created
    """

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_file_exists(self, prompt_file):
        """Each required prompt file should exist."""
        prompt_path = PROMPTS_DIR / prompt_file
        assert prompt_path.exists(), f"Prompt file {prompt_file} does not exist"

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_file_is_readable(self, prompt_file):
        """Each prompt file should be readable and not empty."""
        prompt_path = PROMPTS_DIR / prompt_file
        content = prompt_path.read_text(encoding='utf-8')
        assert len(content) > 0, f"Prompt file {prompt_file} is empty"

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_file_has_substantial_content(self, prompt_file):
        """Each prompt file should contain at least 100 characters (real prompt)."""
        prompt_path = PROMPTS_DIR / prompt_file
        content = prompt_path.read_text(encoding='utf-8')
        assert len(content) >= 100, f"Prompt file {prompt_file} has insufficient content ({len(content)} chars)"


class TestP3_02_PromptsContainRequiredInstructions:
    """TEST P3-02: Prompts Contain Required Instructions

    Purpose: Verify prompts have key domain-specific elements
    """

    def test_geotechnical_contains_domain_keywords(self):
        """Geotechnical prompt should contain slope, terrain, soil keywords."""
        content = (PROMPTS_DIR / "geotechnical.txt").read_text(encoding='utf-8').lower()
        assert "slope" in content, "Geotechnical prompt missing 'slope'"
        assert "terrain" in content, "Geotechnical prompt missing 'terrain'"
        assert "soil" in content, "Geotechnical prompt missing 'soil'"

    def test_environmental_contains_domain_keywords(self):
        """Environmental prompt should contain protected, environmental, permit keywords."""
        content = (PROMPTS_DIR / "environmental.txt").read_text(encoding='utf-8').lower()
        assert "protected" in content, "Environmental prompt missing 'protected'"
        assert "environmental" in content, "Environmental prompt missing 'environmental'"
        assert "permit" in content, "Environmental prompt missing 'permit'"

    def test_engineering_contains_domain_keywords(self):
        """Engineering prompt should contain construction, crossing keywords."""
        content = (PROMPTS_DIR / "engineering.txt").read_text(encoding='utf-8').lower()
        assert "construction" in content, "Engineering prompt missing 'construction'"
        assert "crossing" in content, "Engineering prompt missing 'crossing'"
        # Note: using 'feasibility' or 'feasible' - check for partial match
        assert "feasib" in content or "method" in content, "Engineering prompt missing feasibility/method reference"

    def test_cost_contains_domain_keywords(self):
        """Cost prompt should contain cost, estimate, multiplier keywords."""
        content = (PROMPTS_DIR / "cost.txt").read_text(encoding='utf-8').lower()
        assert "cost" in content, "Cost prompt missing 'cost'"
        assert "estimate" in content, "Cost prompt missing 'estimate'"
        assert "multiplier" in content, "Cost prompt missing 'multiplier'"

    def test_master_contains_domain_keywords(self):
        """Master prompt should contain synthesis, summary, recommendation keywords."""
        content = (PROMPTS_DIR / "master.txt").read_text(encoding='utf-8').lower()
        assert "synth" in content, "Master prompt missing 'synthesis'"
        assert "summary" in content, "Master prompt missing 'summary'"
        assert "recommendation" in content, "Master prompt missing 'recommendation'"

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_requires_json_output(self, prompt_file):
        """All prompts should require JSON output format."""
        content = (PROMPTS_DIR / prompt_file).read_text(encoding='utf-8')
        assert "JSON" in content, f"Prompt {prompt_file} missing JSON output requirement"

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_requires_assessment(self, prompt_file):
        """All prompts should require assessment classification."""
        content = (PROMPTS_DIR / prompt_file).read_text(encoding='utf-8').lower()
        assert "assessment" in content, f"Prompt {prompt_file} missing assessment requirement"


class TestP3_03_PromptsRequestValidJSONStructure:
    """TEST P3-03: Prompts Request Valid JSON Structure

    Purpose: Verify prompts specify correct output format fields
    """

    def test_geotechnical_specifies_required_fields(self):
        """Geotechnical prompt should specify segment_id, metrics, explanation, flags."""
        content = (PROMPTS_DIR / "geotechnical.txt").read_text(encoding='utf-8')
        assert "segment_id" in content, "Geotechnical prompt missing 'segment_id' field"
        assert "metrics" in content, "Geotechnical prompt missing 'metrics' field"
        assert "explanation" in content, "Geotechnical prompt missing 'explanation' field"
        assert "flags" in content, "Geotechnical prompt missing 'flags' field"

    def test_environmental_specifies_permits_likely(self):
        """Environmental prompt should specify permits_likely field."""
        content = (PROMPTS_DIR / "environmental.txt").read_text(encoding='utf-8')
        assert "permits_likely" in content, "Environmental prompt missing 'permits_likely' field"

    def test_engineering_specifies_construction_method(self):
        """Engineering prompt should specify construction_method field."""
        content = (PROMPTS_DIR / "engineering.txt").read_text(encoding='utf-8')
        assert "construction_method" in content, "Engineering prompt missing 'construction_method' field"

    def test_cost_specifies_cost_drivers(self):
        """Cost prompt should specify cost_drivers field."""
        content = (PROMPTS_DIR / "cost.txt").read_text(encoding='utf-8')
        assert "cost_drivers" in content, "Cost prompt missing 'cost_drivers' field"

    def test_cost_specifies_optimization_notes(self):
        """Cost prompt should specify optimization_notes field."""
        content = (PROMPTS_DIR / "cost.txt").read_text(encoding='utf-8')
        assert "optimization_notes" in content, "Cost prompt missing 'optimization_notes' field"

    def test_master_specifies_executive_summary(self):
        """Master prompt should specify executive_summary field."""
        content = (PROMPTS_DIR / "master.txt").read_text(encoding='utf-8')
        assert "executive_summary" in content, "Master prompt missing 'executive_summary' field"

    def test_master_specifies_specialist_summaries(self):
        """Master prompt should specify specialist_summaries field."""
        content = (PROMPTS_DIR / "master.txt").read_text(encoding='utf-8')
        assert "specialist_summaries" in content, "Master prompt missing 'specialist_summaries' field"


class TestP3_04_PromptsAreValidUTF8:
    """TEST P3-04: Prompts Are Valid UTF-8

    Purpose: Verify no encoding issues in prompts
    """

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_reads_as_utf8(self, prompt_file):
        """Each prompt file should read without encoding errors."""
        prompt_path = PROMPTS_DIR / prompt_file
        # This will raise UnicodeDecodeError if not valid UTF-8
        content = prompt_path.read_text(encoding='utf-8')
        assert isinstance(content, str)

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_has_no_null_bytes(self, prompt_file):
        """Each prompt file should not contain null bytes."""
        prompt_path = PROMPTS_DIR / prompt_file
        content = prompt_path.read_text(encoding='utf-8')
        assert '\x00' not in content, f"Prompt {prompt_file} contains null bytes"

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_content_is_strippable(self, prompt_file):
        """Each prompt file content should be cleanly strippable."""
        prompt_path = PROMPTS_DIR / prompt_file
        content = prompt_path.read_text(encoding='utf-8')
        stripped = content.strip()
        assert len(stripped) > 0, f"Prompt {prompt_file} is empty after stripping"


class TestP3_AdditionalValidation:
    """Additional validation tests for prompt quality."""

    @pytest.mark.parametrize("prompt_file", REQUIRED_PROMPTS)
    def test_prompt_specifies_assessment_values(self, prompt_file):
        """Prompts should specify the valid assessment values."""
        content = (PROMPTS_DIR / prompt_file).read_text(encoding='utf-8').lower()
        # Should mention at least two of the three assessment levels
        assessment_mentions = sum([
            "favorable" in content,
            "caution" in content,
            "challenging" in content
        ])
        assert assessment_mentions >= 2, f"Prompt {prompt_file} doesn't specify assessment values"

    def test_geotechnical_has_slope_threshold(self):
        """Geotechnical prompt should mention 20% slope threshold."""
        content = (PROMPTS_DIR / "geotechnical.txt").read_text(encoding='utf-8')
        assert "20%" in content or "20 percent" in content.lower(), \
            "Geotechnical prompt missing 20% slope threshold"

    def test_engineering_mentions_hdd(self):
        """Engineering prompt should mention HDD for trenchless construction."""
        content = (PROMPTS_DIR / "engineering.txt").read_text(encoding='utf-8')
        assert "HDD" in content or "Horizontal Directional" in content, \
            "Engineering prompt missing HDD reference"

    def test_cost_has_baseline_cost(self):
        """Cost prompt should provide baseline cost assumptions."""
        content = (PROMPTS_DIR / "cost.txt").read_text(encoding='utf-8')
        # Should mention cost per km
        assert "per km" in content.lower() or "/km" in content, \
            "Cost prompt missing baseline cost per km"
        # Should mention Euro amounts
        assert "€" in content or "EUR" in content or "euro" in content.lower(), \
            "Cost prompt missing Euro cost references"

    def test_master_references_all_specialists(self):
        """Master prompt should reference all four specialist agents."""
        content = (PROMPTS_DIR / "master.txt").read_text(encoding='utf-8').lower()
        assert "geotechnical" in content, "Master prompt missing geotechnical reference"
        assert "environmental" in content, "Master prompt missing environmental reference"
        assert "engineering" in content, "Master prompt missing engineering reference"
        assert "cost" in content, "Master prompt missing cost reference"


class TestP3Regression:
    """Phase 3 Regression Tests - Must pass on every code change."""

    def test_p3_r01_prompt_files_exist(self):
        """P3-R01: All prompt files present."""
        for prompt_file in REQUIRED_PROMPTS:
            prompt_path = PROMPTS_DIR / prompt_file
            assert prompt_path.exists(), f"Missing prompt: {prompt_file}"

    def test_p3_r02_prompt_domain_coverage(self):
        """P3-R02: Prompts cover their domains."""
        # Geotechnical
        geo = (PROMPTS_DIR / "geotechnical.txt").read_text(encoding='utf-8').lower()
        assert all(kw in geo for kw in ["slope", "terrain"])

        # Environmental
        env = (PROMPTS_DIR / "environmental.txt").read_text(encoding='utf-8').lower()
        assert all(kw in env for kw in ["protected", "permit"])

        # Engineering
        eng = (PROMPTS_DIR / "engineering.txt").read_text(encoding='utf-8').lower()
        assert all(kw in eng for kw in ["construction", "crossing"])

        # Cost
        cost = (PROMPTS_DIR / "cost.txt").read_text(encoding='utf-8').lower()
        assert all(kw in cost for kw in ["cost", "estimate"])

        # Master
        master = (PROMPTS_DIR / "master.txt").read_text(encoding='utf-8').lower()
        assert all(kw in master for kw in ["summary", "recommendation"])

    def test_p3_r03_prompt_json_structure(self):
        """P3-R03: JSON format specified in all prompts."""
        for prompt_file in REQUIRED_PROMPTS:
            content = (PROMPTS_DIR / prompt_file).read_text(encoding='utf-8')
            assert "JSON" in content, f"Missing JSON in {prompt_file}"

    def test_p3_r04_prompt_encoding(self):
        """P3-R04: Valid UTF-8 encoding for all prompts."""
        for prompt_file in REQUIRED_PROMPTS:
            prompt_path = PROMPTS_DIR / prompt_file
            content = prompt_path.read_text(encoding='utf-8')
            assert '\x00' not in content
            assert len(content.strip()) > 0
