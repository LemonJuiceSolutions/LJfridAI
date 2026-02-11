import requests
import json

def test_html_output():
    url = "http://localhost:5005/execute"
    payload = {
        "code": "result = '<h1>Test HTML</h1><p>Success!</p>'",
        "outputType": "html",
        "inputData": {}
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        result = response.json()
        
        print("Backend Response:")
        print(json.dumps(result, indent=2))
        
        if result.get("success") and "html" in result:
            print("\n✅ SUCCESS: Backend correctly handled HTML output.")
            return True
        else:
            print("\n❌ FAILURE: Backend did not return expected HTML structure.")
            return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    test_html_output()
