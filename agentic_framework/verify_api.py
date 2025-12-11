"""Quick script to verify Anthropic API connection."""
import sys
from config.settings import settings

try:
    import anthropic

    # Validate settings
    settings.validate()

    # Create client
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Make simple test call
    print("Testing Anthropic API connection...")
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=50,
        messages=[
            {"role": "user", "content": "Say 'API connection successful' if you can read this."}
        ]
    )

    result = response.content[0].text
    print(f"✓ API Response: {result}")
    print("✓ Anthropic API connection verified successfully!")
    sys.exit(0)

except ValueError as e:
    print(f"✗ Configuration Error: {e}")
    print("\nPlease update .env file with your ANTHROPIC_API_KEY")
    sys.exit(1)

except Exception as e:
    print(f"✗ API Connection Failed: {e}")
    sys.exit(1)
