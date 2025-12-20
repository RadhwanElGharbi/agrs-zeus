# Claude API Setup for Comprehensive Supplier Research

## Overview

The AGRS ZEUS GUI v2 uses **Claude Opus 4.5** for comprehensive supplier research in the Project Management module. This provides deep, accurate, multi-source research for projects of national importance.

## Why Claude API?

For projects of national importance, data accuracy is critical. Claude Opus 4.5 provides:

- **Deep reasoning** across multiple sources
- **Verification** of information from independent sources
- **Context-aware matching** to project specifications
- **Comprehensive profiles** with high confidence ratings
- **Better accuracy** than quick search tools for critical projects

## Setup Instructions

### 1. Get an Anthropic API Key

1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `sk-ant-api03-...`)

### 2. Create Credentials File

Create a file at `~/.claude_credentials` or `/opt/agrs/.claude_credentials` with the following content:

```json
{
  "api_key": "sk-ant-api03-YOUR_KEY_HERE"
}
```

### 3. Set Permissions (Linux/Mac)

```bash
chmod 600 ~/.claude_credentials
```

This ensures only you can read the credentials file.

### 4. Verify Setup

The GUI will automatically detect the credentials when you use the "Comprehensive Research" feature in Project Management.

## Using Comprehensive Research

In the Project Management view:

1. Select your project
2. Click on "Suppliers" tab
3. Choose a supplier category (e.g., "Pipeline Manufacturers")
4. Click **"Research Suppliers"** button
5. Claude will perform deep research and display verified suppliers on the map

## Cost Considerations

Claude Opus 4.5 is a premium model optimized for accuracy. Costs:

- **Input**: ~$15 per million tokens
- **Output**: ~$75 per million tokens

Typical supplier research (10 suppliers):
- Input: ~5,000 tokens (~$0.08)
- Output: ~12,000 tokens (~$0.90)
- **Total per search**: ~$1.00

For projects of national importance, this cost is justified by the accuracy and verification provided.

## Troubleshooting

### "Claude API credentials not configured"

- Ensure credentials file exists at `~/.claude_credentials` or `/opt/agrs/.claude_credentials`
- Check file permissions (should be `600`)
- Verify JSON format is correct (use a JSON validator)

### "No suppliers found"

- Check that project has valid `project_metadata.json`, `pipeline_specs.json`, and `project_aoi.json`
- Verify the country name in project metadata
- Try a different supplier category
- Check backend logs for API errors

### Rate Limits

If you encounter rate limit errors:
- Wait a few minutes between requests
- Contact Anthropic to increase your rate limits
- The system will automatically retry with exponential backoff

## Alternative: Perplexity Search

For quick searches where perfect accuracy is less critical, the system also supports Perplexity API:

1. Create `~/.perplexity_credentials` with format:
   ```json
   {
     "api_key": "pplx-YOUR_KEY_HERE"
   }
   ```

2. Use the regular "Search" button instead of "Research Suppliers"

Perplexity is faster and cheaper but may have less comprehensive verification.

## Security Notes

- **Never commit credentials to git**
- Store credentials outside the project directory
- Use environment-specific credentials (dev vs prod)
- Rotate API keys periodically
- Monitor API usage in Anthropic console

## Support

For issues with:
- **Claude API**: Contact Anthropic support
- **GUI Integration**: Check `/opt/agrs/gui-v2/backend/api/suppliers.py`
- **Supplier Format**: See `/opt/agrs/templates/supplier_profile_schema.json`
